// bonos.js - Lógica de Gestión de Bonos
// Versión Consolidada con Carrito, Reservas y Utilidades Locales

// Estado local específico para Bonos
const state = {
    bonos: [],
    catalogProducts: [], // Para el selector de venta local
    lvCart: [], // Carrito de venta local
    masterItems: [] // Configuración de espacios por item
};

// --- INIT ---
const db = window.db || firebase.firestore();

// --- DETECTOR DE CUOTA DE GOOGLE AGOTADA (Gestionado en app-core.js) ---




document.addEventListener("DOMContentLoaded", () => {
    // Check if app-core loaded (optional, but good for logging)
    if (typeof setupNavigation === 'function') {
        setupNavigation();
    } else {
        console.warn("app-core.js/app.js functions not found inside bonos.js context");
    }
    initBonos();
});

function initBonos() {
    // RESTAURADO: Forzar fecha de hoy por defecto como pide el usuario
    const dateInput = document.getElementById("voucher-date");
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // FIX: Default filter to "pending" (Activos) as requested
    const filterInput = document.getElementById("voucher-filter");
    if (filterInput) {
        filterInput.value = "pending";
    }

    // Load static data
    cargarCatalogoSimple();
    loadMasterItems();

    // Setup listeners (vital for interaction)
    setupBonoListeners();

    // Load data from DB
    cargarBonos();
}

function setupBonoListeners() {
    const syncBtn = document.getElementById("sync-vouchers-btn");
    if (syncBtn) {
        syncBtn.addEventListener("click", () => cargarBonos());
    }

    const searchInput = document.getElementById("voucher-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value.trim();
            const clearBtn = document.getElementById("clear-search-btn");

            // Mostrar/ocultar botón de limpiar
            if (clearBtn) {
                clearBtn.style.display = searchTerm.length > 0 ? "block" : "none";
            }

            // BÚSQUEDA INTELIGENTE CON 3 NIVELES:
            if (searchTerm.length > 0) {
                // NIVEL 1: Código exacto de bono (LOC-YYYY-XXXX o BONOXXXX) → 1 lectura
                const isVoucherCode = /^(LOC-\d{4}-\d+|BONO\d+)$/i.test(searchTerm.toUpperCase());

                if (isVoucherCode) {
                    searchVoucherByCode(searchTerm.toUpperCase());
                    return;
                }

                // NIVEL 1.5: Búsqueda por número suelto (Intento inteligente de formatos)
                // Si el usuario pone "7695", probamos LOC-202X-7695 y BONO7695
                if (/^\d+$/.test(searchTerm)) {
                    searchVoucherByNumericInput(searchTerm);
                    return;
                }

                // NIVEL 2: Búsqueda con mínimo 3 caracteres → searchIndex optimizado
                if (searchTerm.length >= 3) {
                    searchVouchersByText(searchTerm);
                    return;
                }

                // NIVEL 3: Menos de 3 caracteres → búsqueda local (sin queries a Firestore)
                renderBonosFromState();
            } else {
                // Sin término de búsqueda → mostrar todo según filtros actuales
                renderBonosFromState();
            }
        });
    }

    const dateInput = document.getElementById("voucher-date");
    if (dateInput) {
        // Al cambiar fecha específica, recargar bonos para asegurar que se traen de DB
        dateInput.addEventListener("change", () => {
            // Si el usuario elige un día específico, quizás debamos ampliar el rango de fetch automáticamente
            // Pero lo más simple es llamar a cargarBonos, la cual modificaremos para respetar esta fecha
            cargarBonos();
        });
    }

    const filterSelect = document.getElementById("voucher-filter");
    if (filterSelect) {
        filterSelect.addEventListener("change", renderBonosFromState);
    }
}

// --- UTILIDADES LOCALES (Fallback) ---
function formatDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

/**
 * Busca un producto del catálogo por ID, nombre y precio.
 * Prioriza el match por wc_id si el bono tiene product_id.
 * @param {Object} voucher - El bono con producto, importe y opcionalmente product_id
 * @returns {Object|null} - El producto del catálogo encontrado o null
 */
/**
 * Simplifica un nombre eliminando emojis, símbolos de pax, 
 * y etiquetas comunes como (Individual), (Dúo), etc.
 */
function simplifyNameForMatching(name) {
    if (!name) return '';
    let s = name.toLowerCase();

    // Eliminar emojis y símbolos especiales
    s = s.replace(/[\u{1F300}-\u{1F9FF}]/gu, ''); // Emojis
    s = s.replace(/[👤👥📅]/g, ''); // Símbolos específicos

    // Eliminar etiquetas comunes entre paréntesis
    s = s.replace(/\(individual\)/g, '');
    s = s.replace(/\(dúo\)/g, '');
    s = s.replace(/\(duo\)/g, '');
    s = s.replace(/\(pareja\)/g, '');

    // NUEVO: Eliminar sufijos de cantidad numéricos como (1), (2) que vienen de WooCommerce/Excel
    s = s.replace(/\(\d+\)/g, '');

    // Eliminar prefijos de categoría si están presentes con guion
    if (s.includes(" - ")) {
        const parts = s.split(" - ");
        // Si el primer tramo es genérico (ej: "Circuito SPA"), lo ignoramos para centrar en el producto real
        if (parts.length > 1) s = parts[1];
        else s = parts[0];
    }

    // Limpieza final de espacios y guiones
    s = s.replace(/[-\s]+/g, ' ').trim();

    // NUEVO: Tolerancia a plurales (eliminar 's' al final si existe)
    // Esto ayuda a que "especial pareja" coincida con "especial parejas"
    if (s.endsWith('s') && s.length > 4) {
        s = s.slice(0, -1);
    }

    return s;
}

function findCatalogProduct(voucher) {
    if (!voucher || !state.catalogProducts.length) return null;

    // 1. Intentar match por variation_id o product_id (WooCommerce IDs)
    if (voucher.variation_id || voucher.product_id) {
        const vIdStr = voucher.variation_id ? String(voucher.variation_id).trim() : '';
        const pIdStr = voucher.product_id ? String(voucher.product_id).trim() : '';

        const idMatch = state.catalogProducts.find(p => {
            const catalogWcId = p.wc_id ? String(p.wc_id).trim() : '';
            return (vIdStr && (catalogWcId === vIdStr || p.id === `wc-${vIdStr}`)) ||
                (pIdStr && (catalogWcId === pIdStr || p.id === `wc-${pIdStr}`));
        });
        if (idMatch) return idMatch;
    }

    // 2. Fallback a match por nombre simplificado + precio
    const productName = (voucher.producto || '').toLowerCase();
    const simplifiedVoucher = simplifyNameForMatching(productName);
    const voucherPrice = parseFloat(voucher.importe) || parseFloat(voucher.precio) || 0;

    if (!simplifiedVoucher) return null;

    // Intento con nombres simplificados (Para ignorar emojis y etiquetas)
    let match = state.catalogProducts.find(p => {
        const simplifiedCatalog = simplifyNameForMatching(p.nombre);
        return simplifiedCatalog === simplifiedVoucher;
    });
    if (match) return match;

    // Fallback a match por nombre exacto original
    match = state.catalogProducts.find(p => p.nombre.toLowerCase() === productName);
    if (match) return match;

    // Partial match candidates
    const candidates = state.catalogProducts.filter(p =>
        productName.includes(p.nombre.toLowerCase()) ||
        p.nombre.toLowerCase().includes(productName)
    );

    if (candidates.length === 0) return null;

    // 3. PRIORIDAD: Buscar un producto "Base" que sea divisor del precio del bono
    // (Ej: Bono de 50€ para "Circuito SPA" que vale 25€ -> El producto base es mejor que un pack aleatorio)
    const nameParts = productName.split("-").map(s => s.trim());
    const baseCandidates = candidates.filter(p =>
        nameParts.some(part => part === p.nombre.toLowerCase())
    );

    if (baseCandidates.length > 0 && voucherPrice > 0) {
        // Buscar el que sea un divisor exacto (o casi exacto)
        const divisorMatch = baseCandidates.find(p =>
            p.precio > 0 && (voucherPrice % p.precio) < 2
        );
        if (divisorMatch) return divisorMatch;
    }

    // 4. Último recurso: Match por precio más cercano entre los candidatos
    if (voucherPrice > 0) {
        return candidates.find(p => Math.abs(p.precio - voucherPrice) < 1) || candidates[0];
    }

    return candidates[0];
}

/**
 * Genera un array de tokens de búsqueda para búsquedas optimizadas en Firestore
 * Usa array-contains que permite buscar por cualquier token
 * @param {Object} voucher - El bono del que generar los tokens
 * @returns {Array<string>} - Array de tokens normalizados
 */
function generateSearchTokens(voucher) {
    if (!voucher) return [];

    const tokens = new Set(); // Usar Set para evitar duplicados

    // Normalizar función helper
    const normalize = (str) => {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
            .trim();
    };

    // 1. CÓDIGO DE BONO (completo y fragmentos)
    if (voucher.bono) {
        const code = normalize(voucher.bono);
        tokens.add(code); // Código completo: "loc-2025-8566"

        // Fragmentos del código (separar por guiones O espacios)
        const parts = code.split(/[-\s]+/);
        parts.forEach(part => {
            if (part.length > 0) tokens.add(part); // "loc", "2025", "8566", "16707"
        });

        // Prefijo para búsquedas parciales
        if (parts.length > 1) {
            tokens.add(parts[0]); // "loc"
            tokens.add(`${parts[0]}-${parts[1]}`); // "loc-2025"
        }
    }

    // 2. CLIENTE (nombre completo y palabras individuales)
    if (voucher.cliente) {
        const client = normalize(voucher.cliente);
        tokens.add(client); // Nombre completo normalizado

        // Palabras individuales
        client.split(' ').forEach(word => {
            if (word.length >= 3) tokens.add(word); // Solo palabras de 3+ caracteres
        });
    }

    // 3. EMAIL (completo y dominio)
    if (voucher.email) {
        const email = normalize(voucher.email);
        tokens.add(email); // Email completo

        // Dominio del email
        const domain = email.split('@')[1];
        if (domain) tokens.add(domain); // "gmail.com"
    }

    // 4. PRODUCTO (nombre completo y palabras clave)
    if (voucher.producto) {
        const product = normalize(voucher.producto);
        tokens.add(product); // Producto completo

        // Palabras individuales del producto
        product.split(' ').forEach(word => {
            if (word.length >= 3) tokens.add(word); // "masaje", "relax", etc.
        });
    }

    // 5. TELÉFONO (completo)
    if (voucher.telefono) {
        const phone = String(voucher.telefono).replace(/\s+/g, '');
        tokens.add(phone); // "612345678"
    }

    // Convertir Set a Array y filtrar vacíos
    return Array.from(tokens).filter(t => t && t.length > 0);
}


// --- HELPER ITEMS MASTERS ---
function getSpaceForService(serviceName) {
    if (!serviceName) return '';
    const nameLower = serviceName.toLowerCase().trim();

    // 1. Check Master Items (Priority defined in Configuration)
    if (state.masterItems && state.masterItems.length > 0) {
        // Exact case-insensitive match
        const exact = state.masterItems.find(i => i.name.toLowerCase().trim() === nameLower);
        if (exact && exact.space) return exact.space;

        // Normalized match (ignore spaces/symbols)
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const targetNorm = normalize(nameLower);
        const match = state.masterItems.find(i => normalize(i.name) === targetNorm);
        if (match && match.space) return match.space;
    }

    // 2. Fallback to Catalog
    const catalogItem = state.catalogProducts.find(p => p.nombre.toLowerCase().trim() === nameLower);
    if (catalogItem && catalogItem.espacio) return catalogItem.espacio;

    // 3. Fallback to implicit logic (legacy)
    if (nameLower.includes('spa')) return 'spa';
    if (nameLower.includes('hotel') || nameLower.includes('alojamiento')) return 'hotel';

    return '';
}

// Helper para redirección
function goToReservation(client, service, code, space) {
    service = unescape(service).trim();
    client = unescape(client).trim();
    if (!confirm(`¿Ir al calendario para reservar '${service}' para ${client}?`)) return;

    // 1. Buscar en Master Items (Prioridad Absoluta para Espacio)
    // Normalizar strings
    const serviceNorm = service.toLowerCase().trim();

    // Debug logging (Visual para el usuario)
    let debugMsg = `DEBUG GOTO:\nService: ${serviceNorm}\nMaster Items Loaded: ${state.masterItems.length}\n`;

    // Debug
    console.log(`[goToReservation] Searching for space. Service: '${serviceNorm}'`);
    console.log(`[goToReservation] Master Items loaded: ${state.masterItems.length}`);

    // Match strategy: 
    // 1. Exact match (High priority)
    // 2. Master Item name is contained in Service string (e.g. Master: "Higiene Facial", Service: "Higiene Facial Básica")
    // 3. Service string is contained in Master Item name

    let masterItem = state.masterItems.find(i => i.name.toLowerCase().trim() === serviceNorm);

    if (masterItem) debugMsg += `Match Exacto: SI (${masterItem.name})\n`;
    else debugMsg += `Match Exacto: NO\n`;

    if (!masterItem) {
        masterItem = state.masterItems.find(i => serviceNorm.includes(i.name.toLowerCase().trim()));
        if (masterItem) debugMsg += `Match Includes (Service -> Master): SI (${masterItem.name})\n`;
    }

    if (!masterItem) {
        masterItem = state.masterItems.find(i => i.name.toLowerCase().trim().includes(serviceNorm));
        if (masterItem) debugMsg += `Match Includes (Master -> Service): SI (${masterItem.name})\n`;
    }

    // alert(debugMsg);

    // Default module
    let type = 'spa';

    if (masterItem && masterItem.space) {
        debugMsg += `Space Config: ${masterItem.space}\n`;
        // Map common space names to URL types if needed, or use directly if they match
        // Standardizing: 'sala panacea' -> 'panacea', 'suite spa' -> 'suite', etc.
        const spaceLower = masterItem.space.toLowerCase();

        if (spaceLower.includes('panacea')) type = 'panacea';
        else if (spaceLower.includes('suite')) type = 'suite';
        else if (spaceLower.includes('vip')) type = 'panacea';
        else if (spaceLower.includes('peluqueria') || spaceLower.includes('estetica')) type = 'peluqueria';
        else if (spaceLower.includes('hotel') || spaceLower.includes('restaurante') || spaceLower.includes('alojamiento') || spaceLower === 'rest') type = 'hotel';
        else type = 'spa';

        console.log(`Smart Redirect: Item '${service}' matched to space '${masterItem.space}' -> Module '${type}'`);
    } else {
        // 2. Fallback: Heuristics based on catalog or name
        const lowerService = service.toLowerCase();

        // Try to find in catalog to check category/space property there
        let prod = state.catalogProducts.find(p => p.nombre.toLowerCase() === lowerService);
        if (!prod) {
            prod = state.catalogProducts.find(p => p.nombre.toLowerCase().includes(lowerService) || lowerService.includes(p.nombre.toLowerCase()));
        }

        let category = prod ? (prod.categoria || '').toLowerCase() : '';
        // Use passed space argument if available, otherwise catalog space
        let spaceFromCatalog = prod ? (prod.espacio || '').toLowerCase() : '';
        let resolvedSpace = (space && space !== '') ? space.toLowerCase() : spaceFromCatalog;

        // Use explicit space if defined
        if (resolvedSpace && resolvedSpace !== '') {
            type = resolvedSpace;
        } else {
            // Fallback checks on category AND name
            const checkStr = (category + ' ' + lowerService).trim();

            if (checkStr.includes('restaurante') || checkStr.includes('menu') || checkStr.includes('menú') || checkStr.includes('comida') || checkStr.includes('cena') || checkStr.includes('desayuno') || checkStr.includes('almuerzo') || checkStr.includes('alojamiento') || checkStr.includes('hotel') || type === 'rest') {
                type = 'hotel';
            } else if (checkStr.includes('peluqueria') || checkStr.includes('estetica') || checkStr.includes('manicura') || checkStr.includes('pedicura') || checkStr.includes('depilacion')) {
                type = 'peluqueria';
            } else if (checkStr.includes('suite')) {
                type = 'suite';
            } else if (checkStr.includes('masaje') || checkStr.includes('tratamiento') || checkStr.includes('ritual') || checkStr.includes('facial') || checkStr.includes('envoltura') || checkStr.includes('panacea') || checkStr.includes('maderoterapia') || checkStr.includes('bambu')) {
                type = 'panacea';
            }
        }

        // Corrección final (Legacy)
        if (type === 'spa' && (lowerService.includes('masaje') || lowerService.includes('tratamiento') || lowerService.includes('ritual') || lowerService.includes('facial'))) {
            type = 'panacea';
            debugMsg += `Legacy Override: Forced to Panacea\n`;
        }
    }

    debugMsg += `FINAL TYPE: ${type}`;
    // alert(debugMsg); // Descomentar para debug extremo, pero mejor console.log si el usuario puede verlo
    // Si el usuario dijo "entra en el navegador", quizas no ve la consola.
    // LE PONGO UN ALERT TEMPORAL:
    // alert(debugMsg);

    let url = `reservas.html?type=${type}&action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;

    // Si es hotel/restaurante, redirigir al proyecto independiente (Mesachef)
    if (type === 'hotel' || type === 'restaurante' || type === 'rest' || (type || '').toLowerCase().includes('restaurante')) {
        url = `https://nataliogc.github.io/Mesachef/restaurante.html?action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;
    }

    window.location.href = url;
}

async function loadMasterItems() {
    try {
        const snapshot = await db.collection("spa_item_master").get();
        state.masterItems = [];
        snapshot.forEach(doc => {
            state.masterItems.push(doc.data());
        });
        console.log("Master Items cargados para redirección:", state.masterItems.length);
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("Error loading master items:", err);
    }
}

async function cargarCatalogoSimple() {
    try {
        const snapshot = await db.collection("spa_services").where("active", "==", true).get();
        state.catalogProducts = [];
        snapshot.forEach(doc => {
            const data = doc.data();

            // Handle items_incluidos (could be array or string)
            let itemsStr = '';
            if (data.items_incluidos) {
                itemsStr = Array.isArray(data.items_incluidos)
                    ? data.items_incluidos.join(', ')
                    : String(data.items_incluidos);
            }

            // Ensure descripcion is a string
            const desc = String(data.descripcion || '');

            state.catalogProducts.push({
                id: doc.id,
                wc_id: data.wc_id || null,
                nombre: data.nombre,
                precio: data.precio || 0,
                sesiones: data.sesiones || null,
                incluye: itemsStr || desc,  // Prefer items list, fallback to description  
                descripcion: desc || itemsStr,  // Prefer description, fallback to items
                items_incluidos: Array.isArray(data.items_incluidos) ? data.items_incluidos : [], // Preservar array original
                categoria: data.categoria || '',
                espacio: data.espacio || '',
                pax: data.pax || 1,
                venta_local: data.venta_local !== false, // Default true
                imagen: data.imagen || ''
            });
        });
        state.catalogProducts.sort((a, b) => a.nombre.localeCompare(b.nombre));
        console.log("Catálogo cargado para bonos:", state.catalogProducts.length, "productos");
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("Error cargando catálogo para bonos:", err);
    }
}


/**
 * Búsqueda directa optimizada por código de bono
 * Realiza una sola lectura de Firestore en lugar de cargar todos los bonos
 * @param {string} code - Código del bono a buscar (ej: LOC-2025-123 o BONO456)
 */
async function searchVoucherByCode(code) {
    const tableBody = document.getElementById("vouchers-table-body");
    if (!tableBody || !code) return;

    // Feedback visual
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">
        <i class="fas fa-search fa-spin"></i> Buscando bono ${code} (Local)...
    </td></tr>`;

    try {
        // 1. CARGA LOCAL PRIMERO
        if (window.apiLocal) {
            const localBono = await apiLocal.getBonoByCode(code);
            if (localBono) {
                console.log(`[LOCAL-FIRST] Bono ${code} encontrado en IndexedDB`);
                state.bonos = [localBono];
                state.isActiveSearch = true;
                renderBonosFromState();
                updateCount();
                showToast(`Bono ${code} cargado de memoria local`, 'success');
                return;
            }
        }

        // 2. SI NO ESTÁ EN LOCAL, BUSCAR EN FIRESTORE
        console.log(`[LOCAL-FIRST] Bono ${code} no hallado en local, consultando Firestore...`);
        const docRef = db.collection("spa_vouchers").doc(code);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const voucher = { ...docSnap.data(), bono: code };
            state.bonos = [voucher];
            state.isActiveSearch = true;
            renderBonosFromState();
            updateCount();

            // Guardar en local para la próxima vez
            if (window.apiLocal) {
                await apiLocal.saveBono({ ...voucher, syncStatus: 'synced', lastSyncAt: new Date().toISOString() });
            }

            showToast(`Bono ${code} descargado de Google`, 'success');
        } else {
            // No encontrado en ningún sitio
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px;">
                <div style="color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 2.5rem; opacity: 0.3; display: block; margin-bottom: 15px;"></i>
                    <p style="margin: 0; font-weight: bold;">El bono <strong>${code}</strong> no existe.</p>
                    <p style="font-size: 0.85rem; margin-top: 8px; opacity: 0.7;">Verifica el código (ej: LOC-2025-XXXX) o búscalo por nombre.</p>
                </div>
            </td></tr>`;

            state.bonos = [];
            updateCount();
            showToast(`Bono ${code} no encontrado`, 'warning');
        }
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("[BÚSQUEDA DIRECTA] Error:", err);
        showToast('Error al buscar el bono', 'error');
    }
}



/**
 * Búsqueda general optimizada usando searchTokens con array-contains
 * Busca en todos los campos indexados: código, cliente, email, producto, teléfono
 * @param {string} searchTerm - Término de búsqueda
 */
async function searchVouchersByText(searchTerm) {
    const tableBody = document.getElementById("vouchers-table-body");
    if (!tableBody || !searchTerm) return;

    const normalizedTerm = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">
        <i class="fas fa-search fa-spin"></i> Buscando localmente...
    </td></tr>`;

    try {
        // 1. BÚSQUEDA LOCAL (Dexie MultiEntry)
        let localResults = [];
        if (window.dbLocal) {
            localResults = await dbLocal.bonos
                .where('searchTokens')
                .equals(normalizedTerm)
                .limit(100)
                .toArray();
        }

        if (localResults.length > 0) {
            state.bonos = localResults;
            state.isActiveSearch = true;
            renderBonosFromState();
            updateCount();
            showToast(`🔍 ${localResults.length} resultados locales`, 'success');
            return;
        }

        // 2. SI NO HAY LOCAL, BUSCAR EN FIRESTORE (Solo si hay conexión)
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">
            <i class="fas fa-search fa-spin"></i> Consultando en la nube...
        </td></tr>`;

        const snapshot = await db.collection("spa_vouchers")
            .where("searchTokens", "array-contains", normalizedTerm)
            .limit(50)
            .get();

        if (!snapshot.empty) {
            const vouchers = [];
            snapshot.forEach(doc => {
                const v = { ...doc.data(), bono: doc.id };
                vouchers.push(v);
                // Guardar para futura búsqueda local rápida
                if (window.apiLocal) apiLocal.saveBono({ ...v, syncStatus: 'synced' });
            });

            state.bonos = vouchers;
            state.isActiveSearch = true;
            renderBonosFromState();
            updateCount();
            showToast(`✅ ${vouchers.length} bonos descargados`, 'success');
        } else {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px;">
                <div style="color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 2.5rem; opacity: 0.3; display: block; margin-bottom: 15px;"></i>
                    <p style="margin: 0; font-weight: bold;">Sin resultados para "${searchTerm}"</p>
                </div>
            </td></tr>`;
            state.bonos = [];
            updateCount();
        }
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("[BÚSQUEDA] Error:", err);
    }
}



async function cargarBonos() {
    const tableBody = document.getElementById("vouchers-table-body");
    if (!tableBody) return;

    // 1. CARGA LOCAL INMEDIATA (Prioridad 1)
    if (window.apiLocal) {
        try {
            // INTENTO DE SUBIDA DE PENDIENTES (Auto-Sync Up)
            /* 
              Si hay bonos pendientes de subir (ej: importados offline o con versión anterior),
              intentamos subirlos ahora antes de descargar actualizaciones.
            */
            await uploadLocalPendingToFirestore();

            const localBonos = await apiLocal.getBonos();
            if (localBonos.length > 0) {
                console.log(`[LOCAL-FIRST] Cargados ${localBonos.length} bonos de IndexedDB`);
                state.bonos = localBonos;
                renderBonosFromState();
                updateCount();
            }
        } catch (e) {
            console.error("Error leyendo/sincronizando IndexedDB:", e);
        }
    }

    // Feedback visual para la sincronización
    const btn = document.getElementById("sync-vouchers-btn");
    const originalText = btn ? (btn.dataset.originalText || btn.innerHTML) : 'Sincronizar';
    if (btn) {
        if (!btn.dataset.originalText) btn.dataset.originalText = originalText;
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        btn.style.opacity = "0.7";
    }

    if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('pending');

    // --- WATCHDOG (15s) ---
    const watchdog = setTimeout(() => {
        if (btn && btn.disabled) {
            console.warn("⏱️ Timeout en sincronización. Permaneciendo en modo local.");
            if (window.checkFirestoreError) {
                db.collection("spa_config").doc("settings").get()
                    .catch(err => window.checkFirestoreError(err));
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || 'Sincronizar';
                btn.style.opacity = "1";
            }
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
        }
    }, 15000);



    if (state.bonos.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px;" class="muted">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px; display: block; color: var(--accent);"></i>
            Cargando base de datos de bonos...
        </td></tr>`;
    }


    let persistentData = {};

    try {
        // 1. Carga desde Firestore CON FILTRO DE FECHA (optimización de lecturas)
        // Por defecto: SOLO HOY (reduce ~98% de lecturas)
        const filterMonthsSelect = document.getElementById('bonos-filter-months');
        const monthsBack = filterMonthsSelect ? parseFloat(filterMonthsSelect.value) || 0 : 0;

        // Optimización: Si el usuario ha seleccionado una fecha específica en el filtro,
        // usaremos esa fecha como punto de corte para asegurar que se cargan esos datos.
        const datePickerValue = document.getElementById("voucher-date") ? document.getElementById("voucher-date").value : null;

        let cutoffStr;
        if (datePickerValue) {
            cutoffStr = datePickerValue;
            console.log(`[OPTIMIZACIÓN] Usando fecha del selector como filtro: >= ${cutoffStr}`);
        } else if (monthsBack === 0) {
            // Solo hoy: usar fecha LOCAL (no UTC) y restar 1 día de margen por si acaso (Timezones)
            const today = new Date();
            today.setDate(today.getDate() - 1); // MARGEN DE SEGURIDAD
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            cutoffStr = `${year}-${month}-${day}`;
            console.log(`[OPTIMIZACIÓN] Cargando bonos desde (Hoy-1): ${cutoffStr}`);
        } else {
            // Filtro por período (semanas o meses)
            const cutoffDate = new Date();

            // Si es 0.25 (semana), calcular 7 días atrás
            if (monthsBack < 1) {
                const daysBack = Math.round(monthsBack * 30); // 0.25 * 30 ≈ 7 días
                cutoffDate.setDate(cutoffDate.getDate() - daysBack);
                console.log(`[OPTIMIZACIÓN] Cargando bonos desde: últimos ${daysBack} días`);
            } else {
                cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
                console.log(`[OPTIMIZACIÓN] Cargando bonos desde: últimos ${monthsBack} meses`);
            }

            cutoffStr = cutoffDate.toISOString().split('T')[0];
        }

        // Carga con filtro de fecha (máximo 1 año)
        // IMPORTANTE: El campo es "fecha" NO "fecha_compra"
        const query = db.collection("spa_vouchers")
            .where("fecha", ">=", cutoffStr)
            .orderBy("fecha", "desc");

        const snapshot = await query.get();
        console.log(`[FIRESTORE] Leídos ${snapshot.size} documentos`);

        // GUARDAR EN LOCAL Y ACTUALIZAR ESTADO
        snapshot.forEach((doc) => {
            const data = doc.data();
            data.is_local = false; // Viene de Firestore
            persistentData[doc.id] = data;
        });

        // --- FUSIÓN CRÍTICA: Añadir bonos locales (IndexedDB) a persistentData ---
        if (state.bonos && state.bonos.length > 0) {
            state.bonos.forEach(localBono => {
                const id = localBono.bono || localBono.codigo;
                if (!persistentData[id]) {
                    persistentData[id] = localBono;
                }
            });
        }

        console.log(`[CARGA] Bonos en memoria combinada: ${Object.keys(persistentData).length}`);

        state.bonos = Object.values(persistentData);
        state.bonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        renderBonosFromState();
        updateCount();

        // 2. Sincronización WooCommerce (solo si hay conexión)
        if (typeof getBonoEndpoint === 'function') {
            await sincronizarConTienda(persistentData, btn, originalText);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || originalText;
                btn.style.opacity = "1";
            }
        }

        if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('synced');
        clearTimeout(watchdog);

    } catch (err) {
        clearTimeout(watchdog);
        if (window.checkFirestoreError && window.checkFirestoreError(err)) {
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || originalText;
                btn.style.opacity = "1";
            }
            return;
        }

        console.error("Error cargando bonos:", err);

        const tableBody = document.getElementById("vouchers-table-body");
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="error" style="text-align:center;">Error: ${err.message}</td></tr>`;

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || originalText;
            btn.style.opacity = "1";
        }
    }
}

async function sincronizarConTienda(persistentData, btn, originalText) {
    try {
        // Use the new optimized endpoint with intelligent fallback
        let shopVouchers;
        let usedOptimized = false;

        // Calculate date filter (same as Firestore query for consistency)
        const filterMonthsSelect = document.getElementById('bonos-filter-months');
        const monthsBack = filterMonthsSelect ? parseFloat(filterMonthsSelect.value) || 0 : 0;
        const datePickerValue = document.getElementById("voucher-date") ? document.getElementById("voucher-date").value : null;

        let cutoffStr;
        if (datePickerValue) {
            cutoffStr = datePickerValue;
        } else if (monthsBack === 0) {
            const today = new Date();
            today.setDate(today.getDate() - 1); // MARGEN DE SEGURIDAD
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            cutoffStr = `${year}-${month}-${day}`;
        } else {
            const cutoffDate = new Date();
            if (monthsBack < 1) {
                const daysBack = Math.round(monthsBack * 30);
                cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            } else {
                cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
            }
            cutoffStr = cutoffDate.toISOString().split('T')[0];
        }

        // PRIORITY 1: Try optimized endpoint (direct, fast, cached)
        if (typeof fetchBonosDirect === 'function') {
            try {
                console.log('[SYNC] Trying optimized endpoint (direct, no CORS proxy)...');
                const startTime = performance.now();

                shopVouchers = await fetchBonosDirect({
                    per_page: 50,
                    desde: cutoffStr
                }, 10000);

                const elapsed = Math.round(performance.now() - startTime);
                console.log(`[SYNC] ✅ Optimized endpoint succeeded in ${elapsed}ms`);
                usedOptimized = true;

            } catch (optError) {
                console.warn('[SYNC] Optimized endpoint failed:', optError.message);
                console.log('[SYNC] Falling back to CORS proxy system...');

                // PRIORITY 2: Fall back to CORS proxy system
                if (typeof fetchBonosWithFallback === 'function') {
                    shopVouchers = await fetchBonosWithFallback(10000);
                } else {
                    // PRIORITY 3: Ultimate fallback - legacy method
                    console.warn('[SYNC] No fallback functions available, using legacy method');
                    const endpoint = getBonoEndpoint();
                    const res = await fetch(endpoint);

                    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

                    shopVouchers = await res.json();

                    // Handle legacy wrapper if present
                    if (shopVouchers.contents) {
                        try {
                            const inner = JSON.parse(shopVouchers.contents);
                            if (Array.isArray(inner)) shopVouchers = inner;
                        } catch (e) {
                            console.warn("Error parsing contents wrapper:", e);
                        }
                    }
                }
            }
        } else {
            // Optimized function not available, use fallback
            console.warn('[SYNC] Optimized endpoint not available, using fallback');
            if (typeof fetchBonosWithFallback === 'function') {
                shopVouchers = await fetchBonosWithFallback(10000);
            } else {
                const endpoint = getBonoEndpoint();
                const res = await fetch(endpoint);
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                shopVouchers = await res.json();
            }
        }

        if (!Array.isArray(shopVouchers)) {
            console.log("Received data:", shopVouchers);
            throw new Error("Formato de respuesta inválido (no es array). Recibido: " + JSON.stringify(shopVouchers).substring(0, 100));
        }

        const batch = db.batch();
        let ops = 0;
        let newCount = 0;

        // Agrupar por código de bono para evitar duplicados y fusionar items
        const groupedVouchers = {};

        shopVouchers.forEach(b => {
            if (!b || typeof b !== 'object') return;
            const code = (b.bono || '').trim(); // Trim to ensure unique key

            if (!groupedVouchers[code]) {
                // Primer encuentro: Inicializar
                groupedVouchers[code] = { ...b, bono: code }; // Ensure trimmed code in object
                groupedVouchers[code].items_desglosados = []; // Iniciamos lista de items

                // Añadir el item actual como primer sub-item
                groupedVouchers[code].items_desglosados.push({
                    name: b.producto,
                    price: parseFloat(b.precio || b.importe || 0),
                    product_id: b.product_id,
                    variation_id: b.variation_id, // Capturar ID de variación
                    sessions: 1,
                    pax: 1
                });
            } else {
                // Duplicado detected: Fusionar
                const existing = groupedVouchers[code];

                // 1. Sumar precio
                const priceExisting = parseFloat(existing.precio || existing.importe || 0);
                const priceNew = parseFloat(b.precio || b.importe || 0);
                const newTotal = priceExisting + priceNew;
                existing.precio = newTotal;
                existing.importe = newTotal;

                // 2. Concatenar nombre de producto if needed
                if (!existing.producto.includes(b.producto)) {
                    existing.producto = `${existing.producto} + ${b.producto}`;
                }

                // 3. Añadir a items desglosados
                existing.items_desglosados.push({
                    name: b.producto,
                    price: priceNew,
                    product_id: b.product_id,
                    variation_id: b.variation_id,
                    sessions: 1,
                    pax: 1
                });
            }
        });

        // Convertir de vuelta a array
        const uniqueShopVouchers = Object.values(groupedVouchers);

        const webVouchers = uniqueShopVouchers.map(b => {
            const persisted = persistentData[b.bono];
            let finalState = 'pending';

            // --- GHOST KILLER LOGIC ---
            // Buscar otros documentos en persistentData que tengan ESTE mismo código de bono
            // pero que su ID de documento NO sea el código (ej: ID='7570' vs ID='BONO7570')
            // O que sea un ID antiguo que queremos limpiar.
            // Priorizamos: El ID que coincide con b.bono es el "bueno". Los demás son fantasmas.
            Object.keys(persistentData).forEach(docId => {
                const p = persistentData[docId];
                if (docId !== b.bono && p.bono === b.bono) {
                    console.log(`[Ghost Killer] Deleting duplicate doc: ${docId} (matches ${b.bono})`);
                    batch.delete(db.collection("spa_vouchers").doc(docId));
                    ops++;
                }
            });
            // ---------------------------

            if (persisted) {
                const isManuallyManaged = persisted.notas_internas || persisted.fecha_validez || persisted.manual_update;
                finalState = isManuallyManaged ? persisted.estado : 'pending';

                // Si ya existe y estamos fusionando, asegurarnos de preservar sesiones totales si ya se calcularon
                if (persisted.manual_update) {
                    b.sesiones_totales = persisted.sesiones_totales;
                    b.pax_por_sesion = persisted.pax_por_sesion;
                }

                // NUEVO: Asegurar que IDs se guardan/actualizan en bonos existentes
                const firstItem = b.items_desglosados?.[0] || {};
                const topPId = b.product_id || firstItem.product_id;
                const topVId = b.variation_id || firstItem.variation_id;

                // Preparar datos a actualizar
                const updateData = {};
                let needsUpdate = false;

                // Solo actualizamos si el bono guardado no tenía IDs o son diferentes
                if (topPId != persisted.product_id || topVId != persisted.variation_id) {
                    console.log(`[Sync] Actualizando IDs para bono existente ${b.bono}: P:${topPId}, V:${topVId}`);
                    updateData.product_id = topPId;
                    updateData.variation_id = topVId;
                    updateData.items_desglosados = b.items_desglosados || [];
                    needsUpdate = true;
                }

                // CRÍTICO: Actualizar datos del cliente desde WooCommerce si están disponibles
                // PROTECCIÓN: No sobrescribir si el usuario ha editado a mano (manual_update)
                // o si los datos locales son valiosos y los de WooCommerce genéricos.
                const isManual = persisted.manual_update === true;
                const wooNameGeneric = !b.cliente || b.cliente.toLowerCase().includes("nombre cliente") || b.cliente.toLowerCase() === "cliente";

                if (!isManual) {
                    if (b.cliente && b.cliente !== persisted.cliente && !wooNameGeneric) {
                        console.log(`[Sync] Actualizando nombre de cliente para ${b.bono}: "${persisted.cliente}" → "${b.cliente}"`);
                        updateData.cliente = b.cliente;
                        needsUpdate = true;
                    }

                    if (b.email && b.email !== persisted.email && b.email.includes("@")) {
                        console.log(`[Sync] Actualizando email para ${b.bono}`);
                        updateData.email = b.email;
                        needsUpdate = true;
                    }

                    if (b.telefono && b.telefono !== persisted.telefono && b.telefono.length > 5) {
                        console.log(`[Sync] Actualizando teléfono para ${b.bono}: "${persisted.telefono}" → "${b.telefono}"`);
                        updateData.telefono = b.telefono;
                        needsUpdate = true;
                    }
                } else {
                    console.log(`[Sync] Saltando actualización de datos de contacto para ${b.bono} (Protección de Edición Manual activa)`);
                }

                // Actualizar searchTokens para incluir los nuevos datos
                if (needsUpdate) {
                    updateData.searchTokens = generateSearchTokens({ ...persisted, ...b, ...updateData });

                    // Limpiar undefined antes de actualizar
                    const cleanedData = cleanUndefined(updateData);
                    batch.update(db.collection("spa_vouchers").doc(b.bono), cleanedData);
                    ops++;
                }
            } else {
                const docRef = db.collection("spa_vouchers").doc(b.bono);
                // Calcular sesiones totales basado en los items fusionados
                // Si tenemos items desglosados, la suma de sesiones de cada uno podría ser el total
                // Pero por defecto, dejemos que la lógica de detección individual lo maneje o sumemos 1 por item
                let calculatedTotal = b.items_desglosados ? b.items_desglosados.length : 1;

                // Refinar cálculo de sesiones por item
                if (b.items_desglosados) {
                    calculatedTotal = 0;
                    b.items_desglosados.forEach(item => {
                        // Pasar IDs para detección precisa por item
                        const det = detectSessions({
                            producto: item.name,
                            importe: item.price,
                            product_id: item.product_id,
                            variation_id: item.variation_id
                        });
                        item.sessions = det.total;
                        item.pax = det.paxPerSession;
                        calculatedTotal += det.total;
                    });
                }

                b.sesiones_totales = calculatedTotal;

                // CRÍTICO: También calcular y guardar pax_por_sesion
                // Usar el PAX del primer ítem o detectarlo del producto principal
                let calculatedPax = 1;
                if (b.items_desglosados && b.items_desglosados.length > 0) {
                    // Usar el PAX del primer ítem (normalmente todos los ítems de un bono tienen el mismo PAX)
                    calculatedPax = b.items_desglosados[0].pax || 1;
                } else {
                    // Si no hay ítems desglosados, detectar del producto principal
                    const mainDet = detectSessions({
                        producto: b.producto,
                        product_id: b.product_id,
                        variation_id: b.variation_id
                    });
                    calculatedPax = mainDet.paxPerSession || 1;
                }
                b.pax_por_sesion = calculatedPax;

                // Asegurar persistencia de IDs a nivel de raíz para el bono (usa el del primer item si es nuevo)
                const firstItem = b.items_desglosados?.[0] || {};
                const topLevelDataRaw = {
                    ...b,
                    product_id: b.product_id || firstItem.product_id,
                    variation_id: b.variation_id || firstItem.variation_id,
                    estado: finalState,
                    synced_at: new Date().toISOString(),
                    // NUEVO: Agregar searchTokens (array) para búsquedas optimizadas
                    searchTokens: generateSearchTokens(b)
                };

                // Limpiar undefined para set
                const topLevelData = cleanUndefined(topLevelDataRaw);

                batch.set(docRef, topLevelData);
                ops++;
                newCount++;
            }
            return { ...b, ...persisted, estado: finalState, precio: b.precio || b.importe };
        });

        // Merge
        const webCodes = shopVouchers.map(x => x.bono);
        const localVouchers = Object.values(persistentData)
            .filter(p => !webCodes.includes(p.bono))
            .map(p => ({ ...p, importe: p.importe || p.precio }));

        state.bonos = [...webVouchers, ...localVouchers];
        state.bonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (ops > 0) await batch.commit();

        renderBonosFromState();
        updateCount();

        // Show success message with endpoint info
        const endpointInfo = usedOptimized ? ' (optimizado ⚡)' : ' (fallback)';
        if (newCount > 0) {
            showToast(`${newCount} bonos nuevos sincronizados${endpointInfo}`, 'success');
        } else {
            showToast(`Sincronización completada${endpointInfo}`, 'success');
        }

    } catch (err) {
        // Check if it's a Firestore quota error first
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;

        // Handle different error types gracefully
        const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timeout');
        const isNetworkError = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
        const isProxyError = err.code === 'ALL_PROXIES_FAILED';

        if (isTimeout) {
            console.warn('[SYNC] WooCommerce sync timeout - continuing with local data');
            showToast("⚠️ Sincronización WooCommerce: Tiempo agotado. Usando datos locales.", "warning");
        } else if (isNetworkError) {
            console.warn('[SYNC] Network error - continuing with local data');
            showToast("⚠️ Sin conexión a WooCommerce. Usando datos locales.", "warning");
        } else if (isProxyError) {
            console.warn('[SYNC] All CORS proxies failed:', err.details);
            showToast("⚠️ No se pudo conectar con WooCommerce. Usando datos locales.", "warning");
        } else {
            console.warn("WooCommerce sync error:", err);
            showToast("⚠️ Error en sincronización WooCommerce: " + err.message, "warning");
        }

        // Don't throw - allow the app to continue with local/Firestore data
    } finally {
        restoreButton(btn, originalText);
    }
}

// --- CLEANUP DUPLICATES ---
async function cleanupDuplicates() {
    if (!confirm("⚠️ ATENCIÓN: Esta acción buscará y ELIMINARÁ permanentemente los bonos duplicados de la base de datos (Local y Nube).\n\n¿Estás seguro/a?")) return;

    const btn = document.getElementById("cleanup-btn");
    if (btn) btn.disabled = true;
    showToast("Iniciando limpieza de duplicados...", "info");

    try {
        const allBonos = state.bonos;
        const codeMap = new Map();
        let duplicatesFound = 0;
        let deletedCount = 0;

        // 1. Identificar duplicados
        console.log(`[CLEANUP] Analizando ${allBonos.length} bonos en memoria...`);

        for (const b of allBonos) {
            const code = String(b.bono || b.codigo).trim();
            if (!codeMap.has(code)) {
                codeMap.set(code, [b]);
            } else {
                codeMap.get(code).push(b);
            }
        }

        // 2. Procesar grupos con más de 1 elemento
        for (const [code, list] of codeMap.entries()) {
            if (list.length > 1) {
                duplicatesFound++;
                console.log(`[CLEANUP] Duplicado detectado: ${code} (${list.length} copias)`);

                // Estrategia: Mantener el más reciente (updatedAt) o el que tenga más info.
                // Ordenar: Más completo primero, Más reciente updated primero.
                list.sort((a, b) => {
                    // Puntos por tener items
                    const scrA = (a.items_desglosados?.length || 0) * 10
                        + (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
                    const scrB = (b.items_desglosados?.length || 0) * 10
                        + (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
                    return scrB - scrA; // Descending
                });

                const keeper = list[0];
                const trash = list.slice(1);

                // Eliminar trash
                for (const item of trash) {
                    const idToDelete = item.id || item.bono || code; // Firestore Doc ID usually matches Code

                    try {
                        // Delete Local
                        if (window.apiLocal) {
                            const localDb = await apiLocal._getDb();
                            // Buscar por ID interno de dexie si lo tenemos
                            if (item.id && typeof item.id === 'number') {
                                await localDb.bonos.delete(item.id);
                            } else {
                                // Buscar por código
                                const found = await localDb.bonos.where('bono').equals(code).toArray();
                                // Borrar todos menos el keeper si podemos identificarlo... 
                                // O más agresivo: borrar TODO lo de este código local y volver a guardar el keeper.
                                for (const f of found) {
                                    if (f.id !== keeper.id) await localDb.bonos.delete(f.id);
                                }
                            }
                        }

                        // Delete Firestore (ONLY if doc ID is different from keeper, OR if we are sure it's a dupe doc)
                        // Riesgo: si dos docs (A y B) tienen mismo 'bono' field pero distinto DocID -> borrar B.
                        // Si tienen mismo DocID... Firestore solo tiene 1. El duplicado es visual/local.

                        // Check if item has a specific Firestore ID different from Keeper
                        if (item.firestoreId && item.firestoreId !== keeper.firestoreId) {
                            await db.collection('spa_vouchers').doc(item.firestoreId).delete();
                        } else if (item.id && typeof item.id === 'string' && item.id !== keeper.id) {
                            // Assuming item.id IS the firestore doc id
                            await db.collection('spa_vouchers').doc(item.id).delete();
                        }

                    } catch (e) {
                        console.error(`[CLEANUP] Error borrando copia de ${code}:`, e);
                    }
                    deletedCount++;
                }
            }
        }

        if (deletedCount > 0) {
            showToast(`Limpieza: ${deletedCount} duplicados eliminados.`, "success");
            await cargarBonos(); // Recargar todo limpisimo
        } else {
            showToast("No se encontraron duplicados reales que eliminar.", "info");
        }

    } catch (e) {
        console.error("Cleanup error:", e);
        showToast("Error limpieza: " + e.message, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function restoreButton(btn, text) {
    if (btn) {
        btn.innerHTML = text;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
}

// --- RENDER ---
// --- LOGIC ---
function getVoucherExpiryDate(v) {
    if (v.fecha_validez) return new Date(v.fecha_validez);
    if (v.fecha) {
        const d = new Date(v.fecha);
        d.setFullYear(d.getFullYear() + 1);
        return d;
    }
    return null;
}

function checkVoucherExpiry(v) {
    const exp = getVoucherExpiryDate(v);
    if (!exp) return false;
    // Caduca si HOY es mayor que Expiry (final del día logic?)
    // Simple comparision: Now > Expiry
    return new Date() > exp;
}

function getDaysRemaining(v) {
    const exp = getVoucherExpiryDate(v);
    if (!exp) return null;
    const now = new Date();
    const diffTime = exp - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function detectSessions(voucher) {
    if (!voucher) return { total: 1, paxPerSession: 1 };
    const productName = voucher.producto || '';
    const productId = voucher.product_id || null;
    const voucherPrice = parseFloat(voucher.importe) || parseFloat(voucher.precio) || 0;
    const quantity = parseInt(voucher.cantidad) || 0;

    if (!productName && !productId) return { total: 1, paxPerSession: 1 };
    const lower = productName.toLowerCase().trim();

    // 1. Intentar buscar en el catálogo (state.catalogProducts)
    let catalogMatch = null;
    const vId = voucher.variation_id ? String(voucher.variation_id).trim() : null;
    const pId = voucher.product_id ? String(voucher.product_id).trim() : null;

    if (vId || pId) {
        catalogMatch = state.catalogProducts.find(p => {
            const catalogWcId = p.wc_id ? String(p.wc_id).trim() : '';
            return (vId && (catalogWcId === vId || p.id === `wc-${vId}`)) ||
                (pId && (catalogWcId === pId || p.id === `wc-${pId}`));
        });
    }

    if (!catalogMatch && lower) {
        // Match exacto o por nombre contenido
        catalogMatch = state.catalogProducts.find(p => p.nombre.toLowerCase() === lower);
        if (!catalogMatch) {
            catalogMatch = state.catalogProducts.find(p => lower.includes(p.nombre.toLowerCase()));
        }
    }

    let detectedTotal = 1;
    let textDetected = false;

    // 2. Detección por texto (Regex más flexible)
    if (lower) {
        // PRIORIDAD 1: Detectar patrones explícitos como (5+1), 5+1, etc.
        const matchPlus = lower.match(/\((\d+)\s*\+\s*(\d+)\)/); // (5+1)
        const matchPlainPlus = lower.match(/(\s+|^)(\d+)\s*\+\s*(\d+)(\s+|$)/); // 5+1 (sin paréntesis)

        if (matchPlus) {
            detectedTotal = parseInt(matchPlus[1]) + parseInt(matchPlus[2]);
            textDetected = true;
        } else if (matchPlainPlus) {
            detectedTotal = parseInt(matchPlainPlus[2]) + parseInt(matchPlainPlus[3]);
            textDetected = true;
        }

        // PRIORIDAD 2: Detectar "Bono X" donde X es un número
        if (!textDetected) {
            const matchBono = lower.match(/bono\s*(\d+)/i);
            if (matchBono) {
                detectedTotal = parseInt(matchBono[1]);
                textDetected = true;
            }
        }

        // PRIORIDAD 3: Detectar "Bono Masaje" genérico (típicamente 5 sesiones)
        // Solo aplicar si no hay un número explícito y contiene "bono masaje" o similar
        if (!textDetected && lower.includes("bono") && (lower.includes("masaje") || lower.includes("masa"))) {
            // Si el producto contiene "+ Bono Masaje", interpretar como 1 servicio + 5 del bono = 6 total
            if (lower.includes("+")) {
                detectedTotal = 6; // Estándar: 1 servicio inmediato + bono de 5
                textDetected = true;
            } else {
                detectedTotal = 5; // Solo bono sin servicio inmediato
                textDetected = true;
            }
        }

        // PRIORIDAD 4: Otros patrones
        if (!textDetected) {
            const matchSes = lower.match(/(\d+)\s*sesiones/i);
            const matchX = lower.match(/(\d+)\s*x\s+/i);

            if (matchSes) {
                detectedTotal = parseInt(matchSes[1]);
                textDetected = true;
            } else if (matchX) {
                detectedTotal = parseInt(matchX[1]);
                textDetected = true;
            } else if (lower.includes("b5")) {
                detectedTotal = 5;
                textDetected = true;
            } else if (lower.includes("b10")) {
                detectedTotal = 10;
                textDetected = true;
            }
        }

        // ÚLTIMO RECURSO: Detectar packs con "+" genéricos (solo si no se detectó nada antes)
        if (!textDetected) {
            const isPackStr = lower.includes("pack") || lower.includes("pk");
            if (isPackStr && lower.includes("+")) {
                // Dividir por "+" pero ignorar los que están dentro de paréntesis
                const segments = lower.split("+").filter(s => s.trim().length > 2);
                if (segments.length > 1) {
                    detectedTotal = segments.length;
                    textDetected = true;
                }
            }
        }

        // NUEVA LÓGICA: Detectar "Experiencia" o packs combinados tipo "Circuito + Masaje"
        if (!textDetected && (lower.includes("experiencia") || lower.includes("experience"))) {
            // Buscar cuántos servicios distintos menciona
            const hasCircuito = lower.includes("circuito") || lower.includes("spa");
            const hasMasaje = lower.includes("masaje") || lower.includes("massage");
            const hasEnvoltura = lower.includes("envoltura") || lower.includes("envol");
            const hasPeeling = lower.includes("peeling");

            // Contar servicios mencionados
            let servicesCount = 0;
            if (hasCircuito) servicesCount++;
            if (hasMasaje) servicesCount++;
            if (hasEnvoltura) servicesCount++;
            if (hasPeeling) servicesCount++;

            // Si hay múltiples servicios en una experiencia, asumimos 1 sesión del pack completo
            // NO multiplicar por el número de servicios incluidos
            if (servicesCount > 1) {
                detectedTotal = 1; // 1 sesión del pack completo
                textDetected = true;
            }
        }
    }

    // 3. Consolidar resultados
    let total = 1;
    let pax = 1;

    if (catalogMatch) {
        total = catalogMatch.sesiones || 1;
        pax = catalogMatch.pax || 1;

        // --- LÓGICA DE PACKS POR ITEMS INCLUIDOS ---
        const catalogNameLower = (catalogMatch.nombre || '').toLowerCase();
        const isCatalogPack = catalogNameLower.includes("pack") || catalogNameLower.includes("pk") || lower.includes("pack");

        if (isCatalogPack && catalogMatch.items_incluidos && catalogMatch.items_incluidos.length > 1) {
            if (total === 1) {
                total = catalogMatch.items_incluidos.length;
            }
        }

        // --- LÓGICA DE RATIO POR PRECIO ---
        if (catalogMatch.precio > 0 && voucherPrice > 0) {
            const catalogPrice = parseFloat(catalogMatch.precio);
            const ratio = Math.round(voucherPrice / catalogPrice);

            if (ratio > 1 && Math.abs((catalogPrice * ratio) - voucherPrice) < 2 && quantity === 0) {
                // NUEVO: Detectar si es un pack especial de "Experiencia" o combinado
                const isExperiencePack = lower.includes("experiencia") ||
                    lower.includes("experience") ||
                    (lower.includes("pack") && lower.includes("+"));

                const isBono = lower.includes("bono") || lower.includes("sesion") || lower.includes("pack");

                // Si es pack de experiencia, el ratio probablemente sea por PAX, no por sesiones
                if (isExperiencePack && (ratio === 2 || ratio === 4)) {
                    // No aplicar ratio a sesiones, es un pack especial
                    // El precio alto es por ser un pack premium, no más sesiones
                    console.log(`[DETECT] Pack especial detectado: ${lower}, ratio ${ratio} ignorado para sesiones`);
                } else if (isBono || ratio > 3) {
                    total = (catalogMatch.sesiones || 1) * ratio;
                } else {
                    if (lower.includes("pareja") || lower.includes("duo")) {
                        pax = 2;
                    } else {
                        total = (catalogMatch.sesiones || 1) * ratio;
                    }
                }
            }
        }

        // Priorizar detección por texto si el catálogo dice 1 y el nombre es muy explícito
        if (total === 1 && detectedTotal > 1) {
            total = detectedTotal;
        }
    } else {
        total = detectedTotal;
    }

    // PRIORIDAD MÁXIMA: Cantidad del pedido
    if (quantity > 1) {
        const baseSessions = catalogMatch ? (catalogMatch.sesiones || 1) : detectedTotal;
        total = quantity * baseSessions;
    }

    // Detección mejorada de PAX por palabras clave
    const isDouble = lower.includes("pareja") ||
        lower.includes("en pareja") ||
        lower.includes("2 personas") ||
        lower.includes("para 2") ||
        lower.includes("doble") ||
        lower.includes("duo") ||
        lower.includes("dúo") ||
        lower.includes("2 pax") ||
        lower.includes("2pax") ||
        lower.includes("para dos") ||
        lower.includes("sueño para dos") ||
        lower.includes("couple");

    const isIndividual = lower.includes("individual") ||
        lower.includes("1 pax") ||
        lower.includes("1 persona");

    if (isDouble && !isIndividual) {
        pax = 2;

        // IMPORTANTE: Si es un pack de pareja, NO aplicar el ratio a las sesiones
        // El precio alto es porque es para 2 personas, no porque sean más sesiones
        if (catalogMatch && catalogMatch.precio > 0 && voucherPrice > 0) {
            const catalogPrice = parseFloat(catalogMatch.precio);
            const ratio = Math.round(voucherPrice / catalogPrice);

            // Si el ratio es ~2 y ya detectamos que es pareja, ajustar
            if (ratio === 2 && total > 1) {
                total = Math.ceil(total / 2); // Dividir las sesiones porque el ratio era por PAX, no por sesiones
            }
        }
    } else if (isIndividual) {
        pax = 1;
    } else if (catalogMatch && catalogMatch.pax) {
        pax = catalogMatch.pax;
    }

    return { total, paxPerSession: pax };
}

async function autoFixVoucherSessions() {
    const toFix = state.bonos.filter(b => {
        const det = detectSessions(b);
        const dbTotal = b.sesiones_totales || b.sesiones_total || 1;
        const dbPax = b.pax_por_sesion || b.pax_sesion || 1;
        return ((dbTotal === 1 && det.total > 1) || (dbPax === 1 && det.paxPerSession > 1)) && b.estado !== 'completed';
    });

    if (toFix.length === 0) {
        return showToast("No se encontraron bonos que necesiten corrección", "info");
    }

    if (!confirm(`Se han detectado ${toFix.length} bonos con sesiones probablemente incorrectas (ej: Bono 10 con 1 sesión).\n\n¿Quieres corregirlos todos automáticamente en la base de datos?\n\nEsta acción actualizará sesiones_totales y pax_por_sesion.`)) return;

    let fixedCount = 0;
    const btn = document.getElementById("auto-fix-btn");
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Corrigiendo...';

        for (const b of toFix) {
            const det = detectSessions(b);

            // Actualizar objeto localmente
            b.sesiones_totales = det.total;
            b.pax_por_sesion = det.paxPerSession;
            b.manual_update = true;
            b.auto_fixed = true;
            b.updatedAt = new Date().toISOString();

            // Guardar usando la API local (Maneja IndexedDB + Sync)
            await apiLocal.saveBono(b);

            fixedCount++;
        }

        showToast(`Se han corregido ${fixedCount} bonos correctamente`, "success");
        cargarBonos();
    } catch (err) {
        showToast("Error en corrección masiva: " + err.message, "error");
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// --- RENDER ---
function renderBonosFromState() {
    const tbody = document.getElementById("vouchers-table-body");
    if (!tbody) return;

    const searchTerm = document.getElementById("voucher-search").value.toLowerCase();
    const filterStatus = document.getElementById("voucher-filter").value;
    const filterDate = document.getElementById("voucher-date").value;

    // --- INJECT CLEANUP BUTTON (Admin/PowerUser) ---
    // (Removed per user request)


    let filtered = state.bonos.filter(b => {
        // NUEVO: Si hay búsqueda activa por searchTokens, NO aplicar filtros
        if (state.isActiveSearch) {
            return true; // Mostrar TODOS los resultados de la búsqueda
        }

        // Search Term (Global)
        if (searchTerm) {
            const clienteStr = String(b.cliente || "").toLowerCase();
            const bonoStr = String(b.bono || "").toLowerCase();
            const emailStr = String(b.email || "").toLowerCase();
            const productoStr = String(b.producto || "").toLowerCase();
            const telefonoStr = String(b.telefono || "").toLowerCase(); // Added telefono

            // Buscar en searchTokens si existen
            const matchesTokens = b.searchTokens && Array.isArray(b.searchTokens)
                ? b.searchTokens.some(t => t.includes(searchTerm))
                : false;

            if (!matchesTokens &&
                !clienteStr.includes(searchTerm) &&
                !bonoStr.includes(searchTerm) &&
                !emailStr.includes(searchTerm) &&
                !productoStr.includes(searchTerm) &&
                !telefonoStr.includes(searchTerm)) { // Added telefono
                return false;
            }
        }

        // Fecha
        let dateMatch = true;
        if (filterDate && b.fecha) {
            dateMatch = String(b.fecha).startsWith(filterDate);
        }

        // Estado
        let statusMatch = true;
        if (filterStatus !== 'all') {
            if (filterStatus === 'expired') {
                statusMatch = (b.estado === 'expired') || (b.estado === 'pending' && checkVoucherExpiry(b));
            } else if (filterStatus === 'pending') {
                // SOPORTE LEGACY: Aceptar 'activo' como 'pending'
                // MODIFICADO: Incluir también 'partially' (En uso) como Activo
                statusMatch = (b.estado === 'pending' || b.estado === 'activo' || b.estado === 'partially') && !checkVoucherExpiry(b);
            } else {
                statusMatch = (b.estado === filterStatus);
            }
        }

        return dateMatch && statusMatch;
    });


    // --- DEDUPLICACIÓN VISUAL MEJORADA ---
    // Asegurar que solo se muestra 1 bono por Código base (sin sufijos de item)
    const uniqueBonos = [];
    const seenCodes = new Set();
    filtered.forEach(b => {
        const code = String(b.bono || b.codigo).trim();

        // Normalizar código: BONO7694-562 -> BONO7694
        // FIX: Evitar recortar códigos LOC-YYYY-XXXX (que terminan en dígito)
        let normalizedCode = code;
        if (code.startsWith('LOC-')) {
            // Para LOC, solo cortar si hay un CUARTO bloque (ej: LOC-2026-1234-1)
            const parts = code.split('-');
            if (parts.length > 3) {
                normalizedCode = parts.slice(0, 3).join('-');
            }
        } else {
            // Para BONO estándar
            normalizedCode = code.replace(/-\d+$/, '');
        }

        if (!seenCodes.has(normalizedCode)) {
            seenCodes.add(normalizedCode);
            uniqueBonos.push(b);
        } else {
            // Si ya existe, preferir el que NO tiene sufijo (el del plugin nuevo)
            const existingIndex = uniqueBonos.findIndex(existing => {
                const existingNormalized = String(existing.bono || existing.codigo).trim().replace(/-\d+$/, '');
                return existingNormalized === normalizedCode;
            });

            if (existingIndex !== -1) {
                const existing = uniqueBonos[existingIndex];
                const existingCode = String(existing.bono || existing.codigo).trim();

                // Si el existente tiene sufijo y el nuevo no, reemplazar
                if (existingCode.includes('-') && !code.includes('-')) {
                    uniqueBonos[existingIndex] = b;
                }
            }
        }
    });
    filtered = uniqueBonos;


    document.getElementById("voucher-count").textContent = filtered.length;

    // Actualizar botón de auto-fix
    const toFix = filtered.filter(b => {
        const det = detectSessions(b);
        const dbTotal = b.sesiones_totales || b.sesiones_total || 1;
        const dbPax = b.pax_por_sesion || b.pax_sesion || 1;
        return ((dbTotal === 1 && det.total > 1) || (dbPax === 1 && det.paxPerSession > 1)) && b.estado !== 'completed';
    });

    const fixBtn = document.getElementById("auto-fix-btn");
    if (fixBtn) {
        if (toFix.length > 0) {
            fixBtn.style.display = 'inline-flex';
            const countSpan = document.getElementById("auto-fix-count");
            if (countSpan) countSpan.textContent = `(${toFix.length})`;
        } else {
            fixBtn.style.display = 'none';
        }
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron bonos.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        let badgeClass = 'st-pending';
        let statusLabel = 'ACTIVO';
        const isExpired = checkVoucherExpiry(b);

        const det = detectSessions(b);
        const dbTotal = b.sesiones_totales || b.sesiones_total || 1;
        const dbPax = b.pax_por_sesion || b.pax_sesion || 1;

        // Determine effective status
        const realUsed = b.sesiones_usadas || 0;
        const realTotal = dbTotal;

        let effectivelyCompleted = realUsed >= realTotal && realTotal > 0;
        if (b.items_desglosados && b.items_desglosados.length > 0) {
            effectivelyCompleted = b.items_desglosados.every(i => (i.used || 0) >= (i.sessions || 1));
        }

        if (b.estado === 'completed') {
            badgeClass = 'st-completed';
            statusLabel = 'CANJEADO';
        }
        else if (effectivelyCompleted) {
            badgeClass = 'st-completed';
            statusLabel = 'CANJEADO';
        }
        else if (b.estado === 'expired') { badgeClass = 'st-expired'; statusLabel = 'CADUCADO'; }
        else if (b.estado === 'partially' || realUsed > 0) {
            badgeClass = 'st-partial';
            statusLabel = `PARCIAL ${realUsed}/${dbTotal}`;
        }


        // Confiamos en el estado explícito 'completed' - si fue marcado como completo, se muestra como completo

        // Si detectamos más sesiones o pax de los que dice la base de datos
        if (b.estado !== 'completed' && ((dbTotal === 1 && det.total > 1) || (dbPax === 1 && det.paxPerSession > 1))) {
            const label = det.total > 1 ? `${det.total} ses` : `${det.paxPerSession} pax`;
            statusLabel += ` <i class="fas fa-exclamation-triangle" title="Sugerencia: ${det.total} ses / ${det.paxPerSession} pax. Abre para corregir."></i> ${label}`;
        }

        if ((b.estado === 'pending' || b.estado === 'activo') && isExpired) {
            badgeClass = 'st-expired'; statusLabel = 'CADUCADO (Auto)';
        }

        const days = getDaysRemaining(b);
        let expiryText = '';

        if (days !== null) {
            if (days < 0) expiryText = `<br><small style="color:#ef4444; font-size:0.7em;">Caducó hace ${Math.abs(days)} días</small>`;
            else expiryText = `<br><small style="color:${days < 30 ? '#f59e0b' : '#64748b'}; font-size:0.7em;">Caduca en ${days} días</small>`;
        }

        // Buscar producto en el catálogo (primero por ID, luego por nombre)
        const catalogMatch = findCatalogProduct(b);
        const thumbUrl = catalogMatch && catalogMatch.imagen ? catalogMatch.imagen : 'zenith-icon.png';

        // Mejorar visualización del precio: Si es 0 o vacío, intentar mostrar el del catálogo
        const displayedPrice = (parseFloat(b.importe) > 0) ? b.importe : (catalogMatch ? catalogMatch.precio : 0);

        return `
        <tr>
            <td style="padding: 10px 5px;"><img src="${thumbUrl}" referrerpolicy="no-referrer" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;"></td>
            <td style="font-weight:600">${b.bono || '-'}</td>
            <td>${b.producto || '-'}</td>
            <td>${b.email || '-'}</td>
            <td>${formatDate(b.fecha)}${expiryText}</td>
            <td style="font-weight:bold">${displayedPrice}€</td>
            <td><span class="st-badge ${badgeClass}">${statusLabel}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="openVoucherManagement('${b.bono}')">
                    <i class="fas fa-cog"></i> Gestionar
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function updateCount() {
    const pending = state.bonos.filter(x => !checkVoucherExpiry(x) && x.estado !== 'completed').length;
    // Update badge in sidebar if exists (optional)
}

function resetFilters() {
    document.getElementById("voucher-search").value = "";
    document.getElementById("voucher-date").value = "";
    document.getElementById("voucher-filter").value = "pending"; // Default now is pending
    renderBonosFromState();
}

/**
 * Limpia el campo de búsqueda y recarga los bonos según el filtro de fecha actual
 */
function clearSearch() {
    const searchInput = document.getElementById("voucher-search");
    const clearBtn = document.getElementById("clear-search-btn");

    if (searchInput) searchInput.value = "";
    if (clearBtn) clearBtn.style.display = "none";

    // Resetear flag de búsqueda activa
    state.isActiveSearch = false;

    // Recargar bonos según el filtro de fecha seleccionado
    cargarBonos();
}


async function openVoucherManagement(code) {
    const v = state.bonos.find(b => b.bono === code);
    if (!v) return;

    const detected = detectSessions(v);

    document.getElementById("vm-title-code").textContent = code;
    document.getElementById("vm-code").value = code;
    document.getElementById("vm-cliente").value = v.cliente || '';
    document.getElementById("vm-email").value = v.email || '';
    document.getElementById("vm-telefono").value = v.telefono || '';
    document.getElementById("vm-producto").value = v.producto || '';
    document.getElementById("vm-fecha-compra").value = v.fecha || '';
    // document.getElementById("vm-importe").value = v.importe || 0; 

    const priceBadge = document.getElementById("vm-cat-price");
    if (priceBadge) {
        // Al gestionar, mostramos el precio del bono, pero si es 0, mostramos el del catálogo (si hay match)
        const catalogMatch = findCatalogProduct(v);
        const displayPrice = (parseFloat(v.importe) > 0) ? v.importe : (catalogMatch ? catalogMatch.precio : 0);
        priceBadge.textContent = displayPrice + '€';
    }

    // Renderizar historial de uso (async)
    // renderVoucherHistory(code); // Moved to end with await

    // --- Vincular con Catálogo y Detectar Servicios ---
    const catalogInfo = document.getElementById("vm-catalog-info");

    // Función para detectar servicios en el nombre del producto
    // Ahora usa findCatalogProduct para mejor matching por ID/precio
    function detectServicesInProduct(voucher, overrideTotal = null) {
        const services = [];

        // Usar la función centralizada que considera precio e ID
        const primaryMatch = findCatalogProduct(voucher);
        const detResult = overrideTotal !== null ? { total: overrideTotal, paxPerSession: voucher.pax || 1 } : detectSessions(voucher);

        console.log('[BONO DEBUG] Buscando producto para:', voucher.producto || voucher.name, 'ID:', voucher.product_id, 'Variation:', voucher.variation_id);
        console.log('[BONO DEBUG] Match encontrado:', primaryMatch?.nombre, 'Items incluidos:', primaryMatch?.items_incluidos);

        if (primaryMatch) {
            // Unificamos con la detección global de sesiones del bono
            let sessionsCount = primaryMatch.sesiones || 1;

            // Si es un pack o bono detectado con más de 1 sesión
            if ((sessionsCount === 1 || sessionsCount === null) && detResult.total > 1) {
                sessionsCount = detResult.total;
            } else if (overrideTotal !== null) {
                // Si forzamos total (ej: desde sincronización), lo respetamos
                sessionsCount = overrideTotal;
            }

            let paxCount = primaryMatch.pax || 1;
            if (paxCount === 1 && detResult.paxPerSession > 1) {
                paxCount = detResult.paxPerSession;
            }

            // SI TIENE ITEMS INCLUIDOS (PACK DESGLOSADO)
            // HARDCODE SPECIFIC PACKS IF CATALOG IS MISSING THEM OR IS WRONG
            // Force detection if items are missing OR if items are just the pack name repetition
            const hasBadItems = primaryMatch.items_incluidos && primaryMatch.items_incluidos.length > 0 && primaryMatch.items_incluidos.every(i => i.toLowerCase().includes('fantasía'));

            if (primaryMatch.nombre.toLowerCase().includes('fantasía para dos') && (!primaryMatch.items_incluidos || primaryMatch.items_incluidos.length === 0 || hasBadItems)) {
                console.log('[BONO DEBUG] 🛠 Reparando items para Fantasía para dos');
                primaryMatch.items_incluidos = [
                    'Alojamiento y Desayuno',
                    'Circuito Spa - 60\'',
                    'Masaje Relax - 30\''
                ];
                // Force separate sessions
                sessionsCount = 3;
                // Force Pax to 2 for this pack
                paxCount = 2;
                if (detResult.paxPerSession < 2) detResult.paxPerSession = 2;
            }

            // SUEÑO PARA DOS FIX
            if (primaryMatch.nombre.toLowerCase().includes('sueño para dos') && (!primaryMatch.items_incluidos || primaryMatch.items_incluidos.length === 0 || hasBadItems)) {
                console.log('[BONO DEBUG] 🛠 Reparando items para Sueño para dos');
                primaryMatch.items_incluidos = [
                    'Alojamiento y Desayuno',
                    'Menú en Restaurante',
                    'Circuito Spa - 60\''
                ];
                sessionsCount = 3;
                paxCount = 2;
                if (detResult.paxPerSession < 2) detResult.paxPerSession = 2;
            }

            if (primaryMatch.items_incluidos && primaryMatch.items_incluidos.length > 0) {
                console.log('[BONO DEBUG] Desglosando pack con', primaryMatch.items_incluidos.length, 'items');

                // IMPORTANTE: Cada item del pack debe repartirse las sesiones
                // Si el pack tiene 2 items y total es 2, cada uno tiene 1.
                const itemsCount = primaryMatch.items_incluidos.length;
                const sessionsPerItem = Math.max(1, Math.round(sessionsCount / itemsCount));

                // MOSTRAR CADA ITEM COMO UNA LÍNEA SEPARADA
                primaryMatch.items_incluidos.forEach(itemName => {
                    // Intentar encontrar cada item en el catálogo para obtener su imagen
                    const itemCatalog = state.catalogProducts.find(p =>
                        p.nombre.toLowerCase().trim() === itemName.toLowerCase().trim() ||
                        p.nombre.toLowerCase().includes(itemName.toLowerCase().trim())
                    );

                    // Detect SPACE properly using Master Items
                    const detectedSpace = getSpaceForService(itemName) || itemCatalog?.espacio || primaryMatch.espacio || '';

                    services.push({
                        itemId: 'srv_' + Math.random().toString(36).substr(2, 9), // ID único
                        name: itemName.trim(),
                        imagen: itemCatalog?.imagen || primaryMatch.imagen,
                        descripcion: itemCatalog?.descripcion || `Parte del pack: ${primaryMatch.nombre}`,
                        sessions: sessionsPerItem,
                        space: detectedSpace,
                        used: 0,
                        validations: [],
                        precio: 0,
                        pax: paxCount
                    });
                });
            } else {
                console.log('[BONO DEBUG] No tiene items_incluidos, usando lógica estándar');
                // SI NO, MODALIDAD ESTÁNDAR (O INTENTO DE PARSEO DE STRING SI TIENE "+")
                if (primaryMatch.nombre.includes("+") && !primaryMatch.nombre.toLowerCase().includes("pack")) {
                    // Intento muy básico de separar "Circuito + Masaje" si no está definido en catálogo
                    const parts = primaryMatch.nombre.split("+");
                    const itemsCount = parts.length;
                    const sessionsPerItem = Math.max(1, Math.round(sessionsCount / itemsCount));

                    parts.forEach(part => {
                        const partName = part.trim();
                        const detectedSpace = getSpaceForService(partName) || primaryMatch.espacio || '';

                        services.push({
                            name: partName,
                            imagen: primaryMatch.imagen,
                            descripcion: primaryMatch.descripcion,
                            sessions: sessionsPerItem,
                            space: detectedSpace,
                            used: 0,
                            validations: [],
                            precio: 0,
                            pax: paxCount
                        });
                    });
                } else {
                    // CASO NORMAL
                    const detectedSpace = getSpaceForService(primaryMatch.nombre) || primaryMatch.espacio || '';

                    services.push({
                        name: primaryMatch.nombre,
                        imagen: primaryMatch.imagen,
                        descripcion: primaryMatch.descripcion || primaryMatch.incluye || '',
                        sessions: sessionsCount,
                        space: detectedSpace,
                        used: 0,
                        validations: [],
                        precio: primaryMatch.precio || 0,
                        pax: paxCount
                    });
                }
            }
        } else {
            console.warn('[BONO DEBUG] No se encontró match en catálogo para:', voucher.producto);
            // FALLBACK: Si no hay match, crear un servicio genérico con los datos del bono
            // Esto es crucial para bonos importados que no existen en el catálogo
            services.push({
                itemId: 'srv_' + Math.random().toString(36).substr(2, 9),
                name: voucher.producto || 'Servicio Desconocido',
                sessions: detResult.total || 1,
                space: '', // Usuario tendrá que elegir manualmente
                used: 0,
                validations: [],
                precio: voucher.importe || 0,
                pax: detResult.paxPerSession || 1,
                is_fallback: true
            });
        }

        return services;
    }

    // Usar items_desglosados si existe, si no, detectar del nombre
    let baseServices = [];

    // MEJORA: Verificar si items_desglosados es realmente un desglose o solo el nombre del producto
    // PERO: Si es local (importado), SIEMPRE confiamos en el desglose guardado
    // FIX: "Fantasía para dos" a veces se guarda mal (3 items con el nombre del pack). Forzar redetección si ocurre.
    const isBadFantasia = (v.producto || '').toLowerCase().match(/(fantasía para dos|sueño para dos)/) &&
        v.items_desglosados &&
        (v.items_desglosados.some(i => i.name.toLowerCase().match(/(fantasía para dos|sueño para dos)/)) || v.items_desglosados.every(i => i.name === v.producto));

    const hasRealBreakdown = !isBadFantasia && v.items_desglosados && v.items_desglosados.length > 0 &&
        (v.origen === 'local' || !(v.items_desglosados.length === 1 && v.items_desglosados[0].name === v.producto));

    if (hasRealBreakdown) {
        console.log('[BONO] Usando items_desglosados guardados:', v.items_desglosados.length, 'items');

        // Buscar el espacio del producto principal como fallback
        const parentProduct = state.catalogProducts.find(p =>
            p.nombre.toLowerCase() === (v.producto || '').toLowerCase() ||
            (v.producto || '').toLowerCase().includes(p.nombre.toLowerCase())
        );
        const fallbackSpace = parentProduct?.espacio || '';
        console.log('[DEBUG] Producto principal:', v.producto, '-> fallback space:', fallbackSpace);

        // Enriquecer con datos del catálogo (especialmente 'space' si falta o es incorrecto)
        baseServices = v.items_desglosados.map(item => {
            // FORCE RE-CHECK of space using Master Items / Helper
            // This fixes cases where 'spa' was saved incorrectly for 'Hotel' items
            const detectedSpace = getSpaceForService(item.name);
            if (detectedSpace && detectedSpace !== item.space) {
                console.log(`[FIX] Actualizando espacio para '${item.name}': ${item.space} -> ${detectedSpace}`);
                item.space = detectedSpace;
            }

            // Buscar en catálogo para obtener espacio si aún no tiene
            if (!item.space) {
                const itemName = (item.name || '').toLowerCase();
                // Normalizar nombre: quitar duraciones como "- 60'", "- 90'", etc.
                const normalizedName = itemName.replace(/\s*-\s*\d+['"]?\s*(min|minutos)?/gi, '').trim();

                // REGLA ESPECÍFICA: Alojamiento siempre es Hotel
                if (normalizedName.includes('alojamiento')) {
                    item.space = 'Hotel';
                    console.log('[DEBUG] 🏨 Regla forzada: Alojamiento -> Hotel');
                }
                // REGLA ESPECÍFICA: Complementos comunes
                else if (normalizedName.match(/(botella|cava|vino|ramo|flores|fruta|bombones|detalle)/i)) {
                    item.space = 'Complemento';
                    console.log('[DEBUG] 🎁 Regla forzada: Complemento detectado');
                }
                else {
                    // Try Master Items/Helper with normalized name (stripped duration)
                    const detected = getSpaceForService(normalizedName);

                    if (detected) {
                        item.space = detected;
                        console.log('[DEBUG] Space detected via Master/Helper:', detected);
                    } else {
                        const catalogItem = state.catalogProducts.find(p => {
                            const catalogName = p.nombre.toLowerCase();
                            const catalogNormalized = catalogName.replace(/\s*-\s*\d+['"]?\s*(min|minutos)?/gi, '').trim();

                            // Intentar coincidencia exacta primero
                            if (catalogName === itemName || catalogNormalized === normalizedName) return true;

                            // Luego coincidencia parcial (contiene)
                            if (catalogName.includes(normalizedName) || normalizedName.includes(catalogNormalized)) return true;

                            // Finalmente, coincidencia por palabras clave
                            const itemWords = normalizedName.split(/\s+/);
                            const catalogWords = catalogNormalized.split(/\s+/);
                            const commonWords = itemWords.filter(w => w.length > 3 && catalogWords.includes(w));
                            return commonWords.length >= 2; // Al menos 2 palabras en común
                        });

                        if (catalogItem) {
                            item.space = catalogItem.espacio || '';
                            console.log('[DEBUG] ✓ Enriquecido:', item.name, '-> space:', item.space, 'desde:', catalogItem.nombre);
                        } else {
                            // Fallback: usar espacio del producto principal
                            item.space = fallbackSpace;
                            if (fallbackSpace) {
                                console.log('[DEBUG] ⚠ No en catálogo, usando espacio del pack:', item.name, '-> space:', item.space);
                            } else {
                                console.warn('[DEBUG] ✗ No encontrado y sin fallback:', item.name);
                            }
                        }
                    }
                }
            } else {
                console.log('[DEBUG] Item ya tiene space:', item.name, '->', item.space);
            }

            // CRÍTICO: Re-detectar sesiones si el item tiene un número incorrecto
            // Esto corrige items como "Bono Masaje (5+1)" que vienen con sessions:1 de la DB
            if (!item.sessions || item.sessions === 1) {
                const sessionsResult = detectSessions({ producto: item.name });
                if (sessionsResult.total > 1) {
                    console.log(`[DEBUG] 🔄 Redetectando sesiones para "${item.name}": ${item.sessions || 1} -> ${sessionsResult.total}`);
                    item.sessions = sessionsResult.total;
                }
            }

            // Generar ID único si no tiene (retrocompatibilidad)
            if (!item.itemId) {
                item.itemId = 'srv_' + Math.random().toString(36).substr(2, 9);
            }

            // Asegurar que tenga los campos necesarios
            return {
                ...item,
                itemId: item.itemId,
                used: item.used || 0,
                validations: item.validations || [],
                space: item.space || ''
            };
        });
        console.log('[DEBUG] BaseServices después de enriquecimiento:', baseServices.map(s => ({ name: s.name, space: s.space })));
    } else {
        console.log('[BONO] Re-detectando desde catálogo para:', v.producto);
        // Detectar servicios del nombre del producto - ahora pasamos el voucher completo
        baseServices = detectServicesInProduct(v);
    }

    // PASO FINAL: Expansión de Packs en el desglose (Recursivo/Aplanado)
    // Esto asegura que si el desglose tiene un "Pack", se convierta en sus componentes
    let detectedServices = [];
    baseServices.forEach(item => {
        // Mapeamos las propiedades para que detectServices las entienda
        const itemObj = {
            producto: item.name || item.producto,
            product_id: item.product_id,
            variation_id: item.variation_id,
            pax: item.pax
        };

        // Solo expandimos si no es ya el resultado de una expansión previa (evitar bucles infinitos)
        // Intentamos detectar si este item es un pack
        const expanded = detectServicesInProduct(itemObj, item.sessions || item.sesiones);

        if (false && expanded.length > 1) { // DISABLED: This causes recursion for already expanded items
            console.log(`[BONO] Expandiendo item del desglose: ${item.name} -> ${expanded.length} sub-items`);
            detectedServices.push(...expanded);
        } else {
            // CRÍTICO: Preservar todos los campos del item original, especialmente 'space'
            detectedServices.push({
                ...item,
                space: item.space || '',
                used: item.used || 0,
                validations: item.validations || []
            });
        }
    });

    // Debug logging
    console.log("Bono:", v.bono, "Producto:", v.producto, "Importe:", v.importe);
    console.log("Servicios detectados:", detectedServices);

    // Mostrar el primer servicio en la vista previa del catálogo
    // Mostrar información del PACK principal en la vista previa
    if (detectedServices.length > 0) {
        const firstService = detectedServices[0];

        // Buscar el producto principal (Pack) en el catálogo para obtener su imagen real
        const packName = v.producto || firstService.name;
        const packInCatalog = state.catalogProducts.find(p => p.nombre === packName);
        const mainImage = (packInCatalog && packInCatalog.imagen) ? packInCatalog.imagen : (firstService.imagen || 'zenith-icon.png');

        // Configurar la tarjeta
        document.getElementById("vm-cat-img").src = mainImage;
        document.getElementById("vm-cat-name").textContent = packName;

        // Descripción: Mostrar qué incluye
        let descText = "";

        // Si es un pack con varios ítems, listarlos brevemente
        if (detectedServices.length > 1) {
            const names = detectedServices.map(s => s.name).slice(0, 3).join(" + ");
            descText = `Incluye: ${names}` + (detectedServices.length > 3 ? "..." : "");

            // Añadir total de servicios
            descText += ` (${detectedServices.length} servicios)`;
        } else {
            // Si es solo uno, descripción normal
            let rawDesc = firstService.descripcion || firstService.incluye || '';
            if (Array.isArray(rawDesc)) rawDesc = rawDesc.join(', ');
            descText = String(rawDesc || 'Sin descripción en catálogo');
        }

        document.getElementById("vm-cat-desc").textContent = descText;

        catalogInfo.style.display = 'block';
    } else {
        console.log("No se encontraron servicios para este bono");
        catalogInfo.style.display = 'none';
    }

    // Auto-calculate expiry if missing
    let validez = v.fecha_validez;
    if (!validez && v.fecha) {
        const expDate = getVoucherExpiryDate(v);
        if (expDate) validez = expDate.toISOString().split('T')[0];
    }
    document.getElementById("vm-fecha-validez").value = validez || '';


    // -- LISTA DE SERVICIOS CON RESERVA (EDITABLE) --
    // Ahora usamos el contenedor fijo en la columna derecha
    const listDivId = 'vm-items-container';
    let listDiv = document.getElementById(listDivId);

    // Guardar en estado global para edición
    state.editingVoucherItems = [...detectedServices];

    console.log('[DEBUG] state.editingVoucherItems asignado. Total items:', state.editingVoucherItems.length);

    function renderEditableBreakdown() {
        if (!listDiv) {
            // Fallback por si el modal nuevo no está cargado aún (no debería pasar)
            listDiv = document.getElementById(listDivId);
            if (!listDiv) return;
        }

        // Inyectar datalist para el catálogo una sola vez (globalmente o checkear si existe)
        if (!document.getElementById('catalog-datalist')) {
            const dl = document.createElement('datalist');
            dl.id = 'catalog-datalist';
            dl.innerHTML = state.catalogProducts.map(p => `<option value="${p.nombre}">`).join('');
            document.body.appendChild(dl);
        }

        const isEditable = v.origen === 'local' || (v.bono && v.bono.includes('exc.Loc'));

        if (state.editingVoucherItems.length > 0 || isEditable) {
            listDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                <div style="font-weight:700; color:#334155; font-size:0.75rem; text-transform:uppercase;">Items de Compra</div>
                ${isEditable ? `
                    <button class="btn btn-sm btn-outline" onclick="addVoucherItem()" style="padding:2px 8px; font-size:0.7rem;">
                        <i class="fas fa-plus"></i> Añadir
                    </button>
                ` : ''}
            </div>
            
            ${isEditable ? `
                <div style="margin-bottom:12px;">
                    <label style="font-size:0.65rem; color:#64748b; display:block; margin-bottom:4px;">VINCULAR PRODUCTO DEL CATÁLOGO</label>
                    <div style="display:flex; gap:4px;">
                        <input type="text" id="vm-catalog-search" list="catalog-datalist" placeholder="Buscar producto..." 
                            style="flex:1; padding:4px 8px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:4px;">
                        <button class="btn btn-sm btn-primary" onclick="linkVoucherToCatalogProduct()" style="padding:4px 10px;">
                            <i class="fas fa-link"></i>
                        </button>
                    </div>
                </div>
            ` : ''}
            `;

            listDiv.innerHTML += state.editingVoucherItems.map((item, idx) => {
                const used = item.used || 0;
                const total = item.sessions || 1;
                const isComplete = used >= total;
                const spaceName = item.space || 'No asignado';
                const itemName = item.name || item.nombre || item.producto || v.producto || 'Servicio sin nombre';

                // Fix object reference
                if (!item.name) item.name = itemName;

                const isAccommodation = spaceName.toLowerCase() === 'hotel' || itemName.toLowerCase().includes('alojamiento');
                const itemNameLower = itemName.toLowerCase();
                const isComplement = spaceName.toLowerCase() === 'complemento' ||
                    itemNameLower.match(/(botella|cava|vino|ramo|flores|fruta|bombones|detalle)/i);

                let buttonsHtml = '';

                if (isComplete) {
                    buttonsHtml = `
                        <button class="btn btn-sm" disabled
                            style="padding:2px 8px; font-size:0.7rem; background:#cbd5e1; color:#64748b; cursor:not-allowed; border:none; white-space:nowrap; border-radius:4px;">
                            <i class="fas fa-check-circle"></i> Completo
                        </button>
                     `;
                } else if (isComplement) {
                    buttonsHtml = `
                        <button class="btn btn-sm" onclick="validateServiceItem(${idx}, true)" 
                            style="padding:2px 8px; font-size:0.7rem; background:#10b981; color:#fff; border:none; border-radius:4px;">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                } else if (isAccommodation) {
                    buttonsHtml = `
                        <button class="btn btn-sm" onclick="validateServiceItem(${idx})" 
                            style="padding:2px 8px; font-size:0.7rem; background:#2563eb; color:#fff; border:none; border-radius:4px;">
                            <i class="fas fa-concierge-bell"></i>
                        </button>
                    `;
                } else if (spaceName.toLowerCase() === 'gimnasio' || spaceName.toLowerCase() === 'gym' || itemName.toLowerCase().includes('gimnasio')) {
                    // LÓGICA GIMNASIO: Botón "Consumir" directo (Petición usuario)
                    const isExhausted = (item.used || 0) >= (item.sessions || 1);
                    buttonsHtml = `
                        <button class="btn btn-sm" onclick="consumeGymSession(${idx})" ${isExhausted ? 'disabled' : ''}
                            style="padding:2px 8px; font-size:0.7rem; background:${isExhausted ? '#94a3b8' : '#f59e0b'}; color:#fff; border:none; border-radius:4px; opacity: ${isExhausted ? 0.7 : 1}; cursor: ${isExhausted ? 'not-allowed' : 'pointer'};">
                            <i class="fas ${isExhausted ? 'fa-check-circle' : 'fa-check'}"></i> ${isExhausted ? 'Agotado' : 'Consumir'}
                        </button>
                    `;
                } else {
                    buttonsHtml += `
                        <button class="btn btn-sm" 
                            onclick="goToReservation('${encodeURIComponent(v.cliente || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.name || '').replace(/'/g, "%27")}', '${encodeURIComponent(v.bono || v.codigo || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.space || '').replace(/'/g, "%27")}')" 
                            style="padding:2px 8px; font-size:0.7rem; background:#0ea5e9; color:#fff; border:none; border-radius:4px;">
                            <i class="fas fa-calendar-alt"></i> Reservar
                        </button>
                    `;
                }

                if (isEditable) {
                    return `
                    <div style="background:#f8fafc; padding:8px; margin-bottom:8px; border-radius:6px; border:1px solid #e2e8f0;">
                        <div style="display:flex; gap:4px; margin-bottom:6px;">
                            <input type="text" value="${item.name}" onchange="updateVoucherItemName(${idx}, this.value)" 
                                placeholder="Nombre servicio..." list="catalog-datalist"
                                style="flex:1; padding:4px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:4px; font-weight:600;">
                            <button onclick="removeVoucherItem(${idx})" style="background:none; border:none; color:#ef4444; padding:0 4px; cursor:pointer;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="display:flex; align-items:center; gap:2px;">
                                    <input type="number" value="${total}" onchange="updateVoucherItemSession(${idx}, this.value)" 
                                        style="width:35px; padding:2px; font-size:0.7rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;">
                                    <span style="font-size:0.65rem; color:#64748b;">ses.</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:2px;">
                                    <input type="number" value="${item.pax || 1}" onchange="updateVoucherItemPax(${idx}, this.value)" 
                                        style="width:35px; padding:2px; font-size:0.7rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;">
                                    <span style="font-size:0.65rem; color:#64748b;">pax</span>
                                </div>
                                <div style="font-size:0.65rem; color:#64748b;">
                                    <i class="fas fa-map-marker-alt"></i> ${spaceName}
                                </div>
                            </div>
                            <div style="display:flex; gap:4px;">${buttonsHtml}</div>
                        </div>
                    </div>`;
                }

                return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:${isComplete ? '#f0fdf4' : '#fff'}; padding:8px; margin-bottom:4px; border-radius:6px; border:1px solid ${isComplete ? '#86efac' : '#e2e8f0'}; gap:8px;">
                    <div style="display: flex; flex-direction: column; flex: 1; overflow:hidden; gap:2px;">
                        <div style="font-size:0.8rem; font-weight:600; color:#334155;">${item.name}</div>
                        <div style="font-size:0.65rem; color:#64748b;">
                            <i class="fas fa-map-marker-alt" style="margin-right:2px;"></i>${spaceName}
                            <span style="margin-left:8px; font-weight:600; color:${isComplete ? '#16a34a' : '#334155'};">
                                ${used}/${total} sesiones · 👥 ${item.pax || 1}
                            </span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                         ${buttonsHtml}
                    </div>
                </div>
            `;
            }).join('');
            listDiv.style.display = 'block';
        }
        else {
            listDiv.innerHTML = `
                <div style="text-align:center; padding:10px;">
                    <button class="btn btn-sm btn-outline" onclick="addVoucherItem()">
                        <i class="fas fa-plus"></i> Añadir primer servicio
                    </button>
                </div>`;
            listDiv.style.display = 'block';
        }
    }

    // Definir funciones de edición...
    window.addVoucherItem = () => {
        state.editingVoucherItems.push({ name: '', sessions: 1, space: '', used: 0, validations: [], pax: v.pax_por_sesion || 1 });
        renderEditableBreakdown();
    };
    window.removeVoucherItem = (idx) => {
        state.editingVoucherItems.splice(idx, 1);
        renderEditableBreakdown();
    };
    window.updateVoucherItemSession = (idx, val) => {
        state.editingVoucherItems[idx].sessions = parseInt(val) || 1;
    };
    window.updateVoucherItemPax = (idx, val) => {
        state.editingVoucherItems[idx].pax = parseInt(val) || 1;
    };
    window.updateVoucherItemName = (idx, val) => {
        state.editingVoucherItems[idx].name = val;
        if (detectedSpace) {
            state.editingVoucherItems[idx].space = detectedSpace;
            renderEditableBreakdown();
        }
    };

    // MOVED HERE: To access renderEditableBreakdown scope
    window.consumeGymSession = async (idx) => {
        if (!confirm("¿Confirmar consumo de 1 sesión de GIMNASIO?")) return;

        const item = state.editingVoucherItems[idx];

        // 1. Incrementar uso localmente
        item.used = (item.used || 0) + 1;

        // 2. Crear registro de historial (Simular reserva finalizada)
        const code = document.getElementById("vm-code").value || '';
        const client = document.getElementById("vm-cliente").value || '';

        const notificacion = {
            fecha: new Date().toISOString().split('T')[0],
            hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            cliente: client,
            servicio: item.name,
            bono: code,
            origen: 'gimnasio',
            estado: 'finalizada', // Para que salga en historial
            notas: 'Consumo directo desde gestión de bonos',
            pax: item.pax || 1,
            sesion_actual: item.used, // Ya incrementado
            sesiones_totales: item.sessions || 1,
            sesiones_restantes: Math.max(0, (item.sessions || 1) - item.used)
        };

        try {
            await db.collection("reservas_gimnasio").add(notificacion);
        } catch (e) {
            console.warn("Fallo historial gimnasio, probando fallback", e);
            try { await db.collection("spa_reservations").add(notificacion); } catch (e2) { }
        }

        // 3. ACTUALIZAR DOM GLOBAL (Importante para que saveVoucherChanges lea el valor correcto)
        const globalUsedInput = document.getElementById("vm-sesiones-usadas");
        if (globalUsedInput) {
            globalUsedInput.value = (parseInt(globalUsedInput.value) || 0) + 1;
        }

        renderEditableBreakdown();
        // Refresh history to show the new consumption immediately
        if (typeof renderVoucherHistory === 'function') {
            renderVoucherHistory(code);
        }
        await saveVoucherChanges();
    };


    window.linkVoucherToCatalogProduct = () => {
        const searchVal = document.getElementById("vm-catalog-search").value;
        if (!searchVal) return;

        const product = state.catalogProducts.find(p => p.nombre === searchVal);
        if (product) {
            // Reemplazar o añadir items según el producto del catálogo
            const fakeVoucher = { ...v, producto: product.nombre, product_id: product.id };
            const newItems = detectServicesInProduct(fakeVoucher);
            state.editingVoucherItems = newItems;

            // Actualizar el nombre del producto principal en el modal
            document.getElementById("vm-producto").value = product.nombre;

            // Calcular total de sesiones de los nuevos items
            const totalSessions = newItems.reduce((acc, curr) => acc + (curr.sessions || 1), 0);
            let totalPax = newItems.length > 0 ? (newItems[0].pax || 1) : 1;

            // FIX: Forzar visualmente pax=2 si el nombre lo indica claramente
            if (product.nombre.toLowerCase().includes('para dos')) {
                totalPax = 2;
            }

            // Actualizar inputs de sesiones y pax
            document.getElementById("vm-sesiones-total").value = totalSessions;
            document.getElementById("vm-pax-sesion").value = totalPax;

            // Actualizar el precio (Badge y v.importe si el usuario no lo editó)
            const price = parseFloat(product.precio) || 0;
            const priceBadge = document.getElementById("vm-cat-price");
            if (priceBadge) priceBadge.textContent = price + '€';

            // Forzar actualización visual de la tarjeta de catálogo
            document.getElementById("vm-cat-name").textContent = product.nombre;
            if (product.imagen) document.getElementById("vm-cat-img").src = product.imagen;

            renderEditableBreakdown();
            showToast(`Vinculado a: ${product.nombre}. Sesiones y precio actualizados.`, 'success');
        } else {
            showToast("Producto no encontrado en el catálogo", "error");
        }
    };

    // --- Sincronizar uso real con Historial ---
    if (typeof renderVoucherHistory === 'function') {
        const voucherCode = v.bono || v.codigo;
        // Await history to get real reservations
        const history = await renderVoucherHistory(voucherCode, v.items_desglosados);

        if (history && history.length > 0) {
            console.log('[BONO] Sincronizando items con historial:', history.length, 'reservas');
            state.editingVoucherItems.forEach(item => {
                const iName = (item.name || '').toLowerCase().trim();

                // Count reservations that match this item
                const validReservations = history.filter(h => {
                    // Filter out cancellations (already done in helper but safe to check)
                    if (h.status === 'anulada') return false;

                    // Name match
                    // Name match
                    const hName = (h.servicio || '').toLowerCase().trim();

                    // 1. Exact match or contains
                    // Ensure overlap is significant (not just one letter matching or something weird, though trim handles empty)
                    let nameMatch = false;
                    if (hName) { // Only check if name exists to prevent "".includes(...) = true
                        nameMatch = hName === iName || hName.includes(iName) || iName.includes(hName);
                    }

                    // 2. Space match (Restringido)
                    // No usar spaceMatch genérico para Spa, ya que cruza Masajes con Circuitos
                    let spaceMatch = false;
                    if (item.space) {
                        const s = item.space.toLowerCase();
                        // Para Hotel, suele ser único item, así que es más seguro
                        if (s === 'hotel' && ((h.origen || '').toLowerCase().includes('hotel') || h._col === 'reservas_restaurante')) spaceMatch = true;

                        // Para Restaurante explícito
                        if ((s === 'restaurante' || s === 'rest') && h._col === 'reservas_restaurante') spaceMatch = true;

                        // Para Spa/Masaje, confiamos en el nombre. 
                        // Solo si el item es MUY genérico (ej: "Bono Spa") habilitamos match por colección
                        if (s === 'spa' && h._col === 'reservas_spa') spaceMatch = true;
                    }

                    return nameMatch || spaceMatch;
                });

                if (validReservations.length > 0) {
                    // Update usage based on unique reservations found
                    // Simple logic: 1 reservation = 1 use
                    // We sum pax if needed? Usually usage is sessions.
                    // Let's assume 1 reservation = 1 session used for that item.
                    const computedUsed = validReservations.reduce((sum, r) => sum + 1, 0); // Count reservations

                    // Only update if computed is higher than current (avoid overwriting manual edits if any)
                    // Or SHOULD we overwrite? User wants to see "Gestionar" if reserved.
                    // Yes, sync with reality.
                    if (computedUsed > (item.used || 0)) {
                        item.used = computedUsed;
                        console.log(`[BONO] Auto-updated item '${item.name}' used -> ${computedUsed}`);
                    }
                }
            });
        }
    }

    renderEditableBreakdown();
    // -------------------------------------

    // --- POBLAR SESIONES Y PAX (Priorizar detección del catálogo) ---
    let suggestedTotal = 0;
    let suggestedPax = 1;

    if (detectedServices.length > 0) {
        suggestedTotal = detectedServices.reduce((sum, s) => sum + (s.sessions || s.sesiones || 1), 0);
        suggestedPax = detectedServices[0].pax || 1;
    }

    let sessionsTotales = v.sesiones_totales || v.sesiones_total;
    // Si la DB dice 1 o vacío, pero detectamos más, usamos lo detectado (self-healing)
    if ((!sessionsTotales || sessionsTotales === 1) && suggestedTotal > 1) {
        sessionsTotales = suggestedTotal;
    }
    document.getElementById("vm-sesiones-total").value = sessionsTotales || suggestedTotal || 1;

    document.getElementById("vm-sesiones-usadas").value = v.sesiones_usadas || 0;

    let paxPorSesion = v.pax_por_sesion || v.pax_sesion;
    if ((!paxPorSesion || paxPorSesion === 1) && suggestedPax > 1) {
        paxPorSesion = suggestedPax;
    }
    document.getElementById("vm-pax-sesion").value = paxPorSesion || suggestedPax || 1;
    document.getElementById("vm-notas").value = v.notas_internas || '';
    document.getElementById("vm-notas").placeholder = "Notas internas visible solo para staff...";

    // Update Status Badge logic (simplified)
    // Update Status Badge logic (Item-aware for initial render)
    const badge = document.getElementById("vm-status-badge");
    const statusMap = {
        'pending': 'ACTIVO',
        'completed': 'CANJEADO',
        'expired': 'CADUCADO',
        'partially': 'EN USO'
    };

    // Recalcular estado real en base a items si existen (para corregir visualmente si la DB está desfasada)
    let displayStatus = v.estado;
    if (detectedServices && detectedServices.length > 0) {
        const allItemsComplete = detectedServices.every(item => (item.used || 0) >= (item.sessions || 1));
        const anyItemUsed = detectedServices.some(item => (item.used || 0) > 0);

        if (allItemsComplete) displayStatus = 'completed';
        else if (anyItemUsed) displayStatus = 'partially';
        else displayStatus = 'pending';
    }

    let label = statusMap[displayStatus] || displayStatus.toUpperCase();

    const days = getDaysRemaining(v);
    // Add days if active/partial
    if ((displayStatus === 'pending' || displayStatus === 'partially') && days !== null) {
        if (days < 0) label += ` (Caducó hace ${Math.abs(days)} días)`;
        else label += ` (Quedan ${days} días)`;
    }

    badge.textContent = label;
    badge.className = `st-badge st-${displayStatus}`;

    // Ocultar botones "Canjear 1" y "Total" si tiene múltiples ítems o si NO es multi-sesión
    const hasMultipleItems = state.editingVoucherItems.length > 1;
    const isMultiSession = sessionsTotales > 1 && !hasMultipleItems;

    // Wait for modal to be rendered, then hide/show buttons
    setTimeout(() => {
        const bulkButtonsRow = document.querySelector('#voucher-modal .modal-footer > div:first-child');
        if (bulkButtonsRow) {
            bulkButtonsRow.style.display = isMultiSession ? 'flex' : 'none';
        }
    }, 100);

    // Historico renderizado arriba

    document.getElementById("voucher-modal").style.display = "flex";
}

function closeVoucherModal() {
    document.getElementById("voucher-modal").style.display = "none";
}

async function saveVoucherChanges() {
    const btn = document.getElementById("vm-save-btn");
    const btnText = btn.querySelector("span");
    const originalText = btnText.textContent;

    const code = document.getElementById("vm-code").value;
    const updates = {
        cliente: document.getElementById("vm-cliente").value,
        email: document.getElementById("vm-email").value,
        telefono: document.getElementById("vm-telefono").value,
        fecha_validez: document.getElementById("vm-fecha-validez").value,
        sesiones_totales: parseInt(document.getElementById("vm-sesiones-total").value) || 1,
        sesiones_usadas: parseInt(document.getElementById("vm-sesiones-usadas").value) || 0,
        pax_por_sesion: parseInt(document.getElementById("vm-pax-sesion").value) || 1,
        notas_internas: document.getElementById("vm-notas").value,
        items_desglosados: state.editingVoucherItems || [],
        manual_update: true
    };

    // Auto estado logic (Item-aware)
    if (updates.items_desglosados && updates.items_desglosados.length > 0) {
        // PACK: Completo solo si TODOS los items están completos
        const allItemsComplete = updates.items_desglosados.every(item => (item.used || 0) >= (item.sessions || 1));
        const anyItemUsed = updates.items_desglosados.some(item => (item.used || 0) > 0);

        if (allItemsComplete) {
            updates.estado = 'completed';
        } else if (anyItemUsed) {
            updates.estado = 'partially';
        } else {
            updates.estado = 'pending';
        }
    } else {
        // Simple/Legacy logic
        if (updates.sesiones_usadas >= updates.sesiones_totales) {
            updates.estado = 'completed';
        } else if (updates.sesiones_usadas > 0) {
            updates.estado = 'partially';
        } else {
            updates.estado = 'pending';
        }
    }

    try {
        btn.disabled = true;
        btnText.textContent = "GUARDANDO...";

        const bonoData = { ...updates, bono: code };

        // 1. GUARDADO LOCAL INMEDIATO
        if (window.apiLocal) {
            await apiLocal.saveBono({ ...bonoData, syncStatus: 'pending' });
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('pending');
        }

        // UI Update inmediata en el state
        const idx = state.bonos.findIndex(b => (b.bono || b.codigo) === code);
        if (idx !== -1) {
            state.bonos[idx] = { ...state.bonos[idx], ...updates };
            renderBonosFromState();
        }

        // 2. INTENTO FIRESTORE (Background-ish)
        try {
            await db.collection("spa_vouchers").doc(code).set(updates, { merge: true });
            if (window.apiLocal) await apiLocal.markSynced('bonos', code, code);
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('synced');
            showToast("Cambios guardados y sincronizados", "success");

            // CERRAR MODAL AL GUARDAR (Petición usuario)
            if (typeof closeVoucherModal === 'function') closeVoucherModal();
        } catch (fsErr) {
            console.warn("Fallo sincronización Firestore (modo local activo):", fsErr);
            if (window.checkFirestoreError && window.checkFirestoreError(fsErr)) {
                if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
                showToast("Guardado localmente (Sin cuota de Google)", "info");

                // CERRAR MODAL TAMBIÉN EN LOCAL/OFFLINE
                if (typeof closeVoucherModal === 'function') closeVoucherModal();
            } else {
                throw fsErr;
            }
        }

    } catch (err) {
        console.error("Error general guardando:", err);
        showToast("Error al procesar: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
    }
}


// Variable global para tracking de validación de alojamiento
window.consumeGymSession = async (idx) => {
    if (!confirm("¿Confirmar consumo de 1 sesión de GIMNASIO?")) return;

    const item = state.editingVoucherItems[idx];

    // 1. Incrementar uso localmente
    item.used = (item.used || 0) + 1;

    // 2. Crear registro de historial (Simular reserva finalizada)
    const code = document.getElementById("vm-code").value || '';
    const client = document.getElementById("vm-cliente").value || '';

    const notificacion = {
        fecha: new Date().toISOString().split('T')[0],
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        cliente: client,
        servicio: item.name,
        bono: code,
        origen: 'gimnasio',
        estado: 'finalizada', // Para que salga en historial
        notas: 'Consumo directo desde gestión de bonos'
    };

    try {
        // Guardar "reserva" para historial
        await db.collection("reservas_gimnasio").add(notificacion); // Usamos colección específica o genérica
    } catch (e) {
        console.warn("No se pudo guardar historial gimnasio (posiblemente falta colección), usando spa_reservations", e);
        try {
            await db.collection("spa_reservations").add(notificacion);
        } catch (e2) { console.error("Fallo guardar historial", e2); }
    }

    // 3. Guardar cambios en el bono (Esto cerrará el modal por la lógica anterior, 
    // PERO el usuario pidió 'confirmar... y dejar constancia'. Si cerramos es un flow rápido.
    // Si queremos mantener abierto, tendríamos que llamar a un save silencioso.
    // Vamos a usar saveVoucherChanges() que ya tiene toast y cierre, lo cual es buen feedback.)

    // Actualizar visualmente antes de guardar (briefly)
    renderEditableBreakdown();

    await saveVoucherChanges();
};
let currentVoucherForAccommodation = null;

function isAccommodationVoucher(voucher) {
    const productName = (voucher.producto || voucher.product_name || '').toLowerCase();
    return productName.includes('alojamiento') || productName.includes('desayuno');
}

function marcarCanjeado() {
    // Obtener datos del voucher actual
    const code = document.getElementById("vm-code").value;
    const voucher = state.bonos.find(b => b.codigo === code);

    // Detectar si es alojamiento
    if (voucher && isAccommodationVoucher(voucher)) {
        openAccommodationValidation(voucher);
        return;
    }

    // Flujo normal para otros bonos
    let used = parseInt(document.getElementById("vm-sesiones-usadas").value) || 0;
    const total = parseInt(document.getElementById("vm-sesiones-total").value) || 1;
    if (used < total) {
        document.getElementById("vm-sesiones-usadas").value = used + 1;
        saveVoucherChanges();
    } else {
        showToast("El bono ya está completo", "warning");
    }
}

function marcarCompleto() {
    const total = parseInt(document.getElementById("vm-sesiones-total").value) || 1;
    document.getElementById("vm-sesiones-usadas").value = total;

    // IMPORTANTE: También marcar todos los items individuales como completos si existen 
    if (state.editingVoucherItems && state.editingVoucherItems.length > 0) {
        state.editingVoucherItems.forEach(item => {
            item.used = item.sessions || 1;
        });
        // Refrescar el desglose visual en el modal si es necesario
        if (typeof openVoucherManagement.renderEditableBreakdown === 'function') {
            openVoucherManagement.renderEditableBreakdown();
        }
    }

    saveVoucherChanges();
}

async function reactivarBono() {
    const code = document.getElementById("vm-code").value;
    const confirmMsg = "Se verificará el historial de reservas.\n\n" +
        "- Si hay reservas PASADAS (>1h), NO se podrá reactivar.\n" +
        "- Si hay reservas FUTURAS, se ANULARÁN automáticamente.\n\n" +
        "¿Deseas continuar?";

    if (!confirm(confirmMsg)) return;

    try {
        // Fix: Use generic selector or specific header selector since it moved
        let btn = document.querySelector("#voucher-modal .modal-header button[onclick='reactivarBono()']");
        // Fallback in case I move it back or multiple exist (take the visible one logic if needed, but header is specific enough)
        if (!btn) btn = document.querySelector("button[onclick='reactivarBono()']");

        if (!btn) {
            console.error("No reaction button found");
            return;
        }

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

        // 1. Obtener historial
        const history = await renderVoucherHistory(code);
        const activeReservations = history.filter(h => h.status !== 'anulada');

        const now = new Date();
        // Margen de 1 hora (podemos reactivar si la reserva fue hace menos de 1 hora, o es futura)
        const marginTime = new Date(now.getTime() - 60 * 60 * 1000);

        let hasPastReservations = false;
        let futureReservations = [];

        activeReservations.forEach(res => {
            // Construir fecha reserva
            const resDate = new Date(res.fecha + 'T' + res.hora);

            if (resDate < marginTime) {
                hasPastReservations = true;
                console.warn(`[REACTIVAR] Reserva pasada detectada: ${res.fecha} ${res.hora} (${res.servicio})`);
            } else {
                futureReservations.push(res);
            }
        });

        // 2. Validar
        if (hasPastReservations) {
            alert("NO SE PUEDE REACTIVAR.\n\nEste bono tiene reservas pasadas ya consumidas. No es posible reactivarlo.");
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        // 3. Anular futuras (si existen)
        if (futureReservations.length > 0) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Anulando reservas...';
            console.log(`[REACTIVAR] Anulando ${futureReservations.length} reservas futuras...`);

            const batch = db.batch();

            futureReservations.forEach(res => {
                if (res._col && res.id && res._col !== 'internal') {
                    const ref = db.collection(res._col).doc(res.id);
                    batch.update(ref, {
                        status: 'anulada',
                        anulada_por: 'reactivacion_bono',
                        fecha_anulacion: new Date().toISOString()
                    });
                }
            });

            await batch.commit();
            console.log('[REACTIVAR] Reservas futuras anuladas.');
        }

        // 4. Reactivar Bono
        document.getElementById("vm-sesiones-usadas").value = 0;

        // Resetear uso de items
        if (state.editingVoucherItems) {
            state.editingVoucherItems.forEach(item => item.used = 0);
        }

        await saveVoucherChanges();

        // Refrescar para ver reservas anuladas
        openVoucherManagement(code);

        showToast("Bono reactivado y reservas futuras anuladas", "success");

    } catch (err) {
        console.error("Error reactivando bono:", err);
        alert("Error al reactivar: " + err.message);
    } finally {
        const btn = document.querySelector("button[onclick='reactivarBono()']");
        if (btn) {
            btn.disabled = false;
            // Restaurar icono original si se conoce, o dejar texto genérico
            btn.innerHTML = '<i class="fas fa-undo"></i> Reactivar';
        }
    }
}

// Nueva funcionalidad: Validación por servicio individual
let currentServiceIndex = null; // Tracking del servicio siendo validado

// Validar un servicio individual del pack
function validateServiceItem(itemIndex, isManual = false) {
    console.log('[DEBUG] validateServiceItem click index:', itemIndex);
    const codeInput = document.getElementById("vm-code").value.trim();
    console.log('[DEBUG] Buscando bono con código:', codeInput);

    const item = state.editingVoucherItems[itemIndex];
    // FIX: Algunos objetos tienen 'codigo' y otros 'bono'
    const voucher = state.bonos.find(b => (b.codigo || b.bono || '').trim() === codeInput);

    if (!item) {
        console.error('[DEBUG] Item no encontrado en índice:', itemIndex);
        return;
    }
    if (!voucher) {
        console.error('[DEBUG] Voucher no encontrado en state.bonos. Total bonos:', state.bonos.length);
        console.log('[DEBUG] Primeros 3 bonos (props):', state.bonos.slice(0, 3).map(b => ({ c: b.codigo, b: b.bono })));
        return;
    }

    console.log('[DEBUG] Voucher ENCONTRADO:', voucher.bono || voucher.codigo);

    // Verificar si ya está completo
    const used = item.used || 0;
    const total = item.sessions || 1;
    if (used >= total) {
        showToast("Este servicio ya ha sido canjeado completamente", "warning");
        return;
    }

    const space = (item.space || '').toLowerCase();

    // CASO 1: HOTEL (Modal Especial)
    if (space === 'hotel' || item.name.toLowerCase().includes('alojamiento') || space.includes('hotel')) {
        console.log('[DEBUG] Abriendo modal alojamiento');
        currentServiceIndex = itemIndex;
        currentVoucherForAccommodation = voucher;

        if (typeof openAccommodationValidation === 'function') {
            openAccommodationValidation(voucher);
        }
        return;
    }

    // CASO 2: MANUAL VALIDATION (Solicitada explícitamente)
    if (isManual) {
        if (!confirm(`¿Confirmas que quieres validar 1 sesión de "${item.name}" MANUALMENTE?\n\nEsto descontará una sesión sin pasar por el calendario.`)) {
            return;
        }
        console.log('[DEBUG] Validación simple manual confirmada');
        markServiceUsed(itemIndex, voucher);
        return;
    }

    // CASO 3: COMPORTAMIENTO POR DEFECTO (Si se llama sin flag manual)
    // Redirigir a reserva como fallback
    goToReservation(voucher.cliente, item.name, voucher.bono || voucher.codigo, space);
}

function openServiceAccommodationValidation(item, voucher) {
    // Prellenar campos
    document.getElementById("av-fecha").value = new Date().toISOString().split('T')[0];
    document.getElementById("av-nombre").value = voucher.cliente || '';
    document.getElementById("av-telefono").value = '';
    document.getElementById("av-reserva").value = '';

    // Mostrar modal
    document.getElementById("accommodation-validation-modal").style.display = "flex";
}



// Helper para eliminar undefined recursivamente (Firestore no acepta undefined)
function cleanUndefined(obj) {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanUndefined);

    const newObj = {};
    for (const key in obj) {
        const value = cleanUndefined(obj[key]);
        if (value !== undefined) {
            newObj[key] = value;
        } else {
            newObj[key] = null; // Convertir undefined explícito a null
        }
    }
    return newObj;
}

// Helper para guardar el desglose completo en Firestore
async function saveServiceBreakdownToFirestore(voucherCode) {
    try {
        console.log('[LOCAL-FIRST] Generando desglose para:', voucherCode);

        const itemsToSave = state.editingVoucherItems.map(item => ({
            itemId: item.itemId || ('srv_' + Math.random().toString(36).substr(2, 9)),
            name: item.name || '',
            sessions: item.sessions || 1,
            space: item.space || '',
            used: item.used || 0,
            validations: item.validations || [],
            pax: item.pax || 1,
            precio: item.precio || 0,
            imagen: item.imagen || '',
            descripcion: item.descripcion || ''
        }));

        const cleanedItems = cleanUndefined(itemsToSave);
        const updates = {
            items_desglosados: cleanedItems,
            last_updated: new Date().toISOString()
        };

        // 1. PERSISTENCIA LOCAL
        if (window.apiLocal) {
            const current = await apiLocal.getBonoByCode(voucherCode);
            if (current) {
                await apiLocal.saveBono({ ...current, ...updates, syncStatus: 'pending' });
                if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('pending');
            }
        }

        // 2. INTENTO FIRESTORE
        try {
            await db.collection("spa_vouchers").doc(voucherCode).update(updates);
            if (window.apiLocal) await apiLocal.markSynced('bonos', voucherCode, voucherCode);
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('synced');
            console.log('[LOCAL-FIRST] Desglose sincronizado en Firestore');
        } catch (fsErr) {
            console.warn("Fallo sync desglose (permaneciendo en local):", fsErr);
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
        }

        // Recargar para refrescar UI
        renderBonosFromState();

    } catch (error) {
        console.error("Error procesando desglose:", error);
        throw error;
    }
}



function openAccommodationValidation(voucher) {
    currentVoucherForAccommodation = voucher;

    // Limpiar y prellenar campos
    document.getElementById("av-fecha").value = new Date().toISOString().split('T')[0];
    document.getElementById("av-nombre").value = voucher.cliente || '';
    document.getElementById("av-telefono").value = '';
    document.getElementById("av-reserva").value = '';

    // Mostrar modal
    document.getElementById("accommodation-validation-modal").style.display = "flex";
}

function closeAccommodationValidation() {
    document.getElementById("accommodation-validation-modal").style.display = "none";
    currentVoucherForAccommodation = null;
}

async function confirmAccommodationRedemption() {
    // Validar campos
    const fecha = document.getElementById("av-fecha").value;
    const nombre = document.getElementById("av-nombre").value.trim();
    const telefono = document.getElementById("av-telefono").value.trim();
    const reserva = document.getElementById("av-reserva").value.trim();

    if (!fecha || !nombre || !telefono || !reserva) {
        showToast("Por favor completa todos los campos", "error");
        return;
    }

    try {
        // Guardar información de la validación
        const userEmail = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : 'admin';
        const validationData = {
            fecha_alojamiento: fecha,
            nombre_huesped: nombre,
            telefono_huesped: telefono,
            numero_reserva: reserva,
            fecha_validacion: new Date().toISOString(),
            validado_por: userEmail
        };

        // Usar sistema de servicio individual
        const itemIndex = currentServiceIndex;
        const item = state.editingVoucherItems[itemIndex];
        const voucher = currentVoucherForAccommodation;
        // FIX: Priorizar 'bono' que es la propiedad correcta en memoria
        const code = voucher.bono || voucher.codigo;

        if (!code) throw new Error("No se encontró el código del bono");

        // Incrementar uso del servicio individual
        item.used = (item.used || 0) + 1;

        // Agregar validación al servicio
        if (!item.validations) item.validations = [];
        item.validations.push(validationData);

        // Guardar usando función que limpia undefined fields
        await saveServiceBreakdownToFirestore(code);

        showToast("Alojamiento validado correctamente", "success");
        closeAccommodationValidation();

        // Actualizar vista
        openVoucherManagement(code);

    } catch (error) {
        console.error("Error validando alojamiento:", error);
        showToast("Error al validar: " + error.message, "error");
    }
}

async function deleteVoucher() {
    if (!confirm("¿Seguro que quieres eliminar este bono? Esta acción es irreversible.")) return;
    const code = document.getElementById("vm-code").value;
    try {
        // 1. BORRADO LOCAL INMEDIATO
        if (window.dbLocal) {
            await dbLocal.bonos.where('bono').equals(code).delete();
        }

        // 2. INTENTO FIRESTORE
        try {
            await db.collection("spa_vouchers").doc(code).delete();
            showToast("Bono eliminado de la nube", "success");
        } catch (fsErr) {
            console.warn("Fallo borrado Firestore (eliminado localmente):", fsErr);
            showToast("Bono eliminado localmente (Sin cuota)", "info");
        }

        closeVoucherModal();
        cargarBonos();
    } catch (err) {
        showToast("Error eliminando: " + err.message, "error");
    }
}


// --- MODAL VENTA LOCAL (Nuevo con Carrito) ---

function openLocalVoucherModal() {
    state.lvCart = [];
    state.lvSelectedProduct = null;
    renderLVCart();

    // Guardar lista filtrada (sin Peluquería y respetando venta_local)
    state.lvFilteredProducts = (state.catalogProducts || []).filter(prod => {
        const cat = (prod.categoria || '').toLowerCase();
        const name = (prod.nombre || '').toLowerCase();
        const isLocal = prod.venta_local !== false; // Default true
        return cat !== 'peluqueria' && !name.includes('peluquería') && isLocal;
    });

    const searchInput = document.getElementById("lv-product-search");
    if (searchInput) searchInput.value = '';

    const resultsDiv = document.getElementById("lv-search-results");
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
    }

    // Reset categories (Simpliifed - buttons removed)
    state.lvCurrentCategory = 'todos';
    // document.querySelectorAll('.lv-cat-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById("local-voucher-modal").style.display = "flex";

    // Reset inputs
    document.getElementById("lv-product-details").style.display = 'none';
    document.getElementById("lv-price").value = '';
    document.getElementById("lv-sessions").value = 1;
    document.getElementById("lv-pax").value = "1";
    document.getElementById("lv-product-custom").style.display = 'none';
    document.getElementById("lv-phone").value = '';
    // FIXED: Element removed
    // document.getElementById("lv-filter-pax").value = 'any';
}

function closeLocalVoucherModal() {
    document.getElementById("local-voucher-modal").style.display = "none";
}

function filterLocalProducts(query) {
    const resultsDiv = document.getElementById("lv-search-results");
    const q = (query || "").toLowerCase().trim();
    const cat = state.lvCurrentCategory || 'todos';

    if (q.length === 0 && cat === 'todos') {
        resultsDiv.style.display = 'none';
        return;
    }

    const filtered = state.lvFilteredProducts.filter(prod => {
        const matchesQuery = !q || prod.nombre.toLowerCase().includes(q);
        let matchesCat = true;

        if (cat === 'spa') matchesCat = (prod.categoria || '').toLowerCase().includes('spa');
        else if (cat === 'masaje') matchesCat = (prod.categoria || '').toLowerCase().includes('masaje');
        else if (cat === 'pack') matchesCat = (prod.items_incluidos && prod.items_incluidos.length > 1) || (prod.nombre || '').toLowerCase().includes('pack');
        else if (cat === 'bono') matchesCat = (prod.nombre || '').toLowerCase().includes('bono') || (prod.sesiones && prod.sesiones > 1);

        // FILTRO POR PAX: Eliminado a petición (campo eliminado)
        // const filterPax = document.getElementById("lv-filter-pax") ? document.getElementById("lv-filter-pax").value : 'any';
        let matchesPax = true;
        // if (filterPax !== 'any') { ... }

        return matchesQuery && matchesCat && matchesPax;
    });

    // ORDEN INTELIGENTE
    if (q.includes("pareja") || q.includes("duo") || q.includes("2 pax") || q.includes("doble")) {
        filtered.sort((a, b) => {
            const aIsCouple = (a.nombre || '').toLowerCase().includes('pareja') || (a.pax || 1) === 2 || (a.personas || 1) === 2;
            const bIsCouple = (b.nombre || '').toLowerCase().includes('pareja') || (b.pax || 1) === 2 || (b.personas || 1) === 2;
            return bIsCouple === aIsCouple ? 0 : bIsCouple ? 1 : -1;
        });
    }

    if (filtered.length === 0) {
        resultsDiv.innerHTML = `
            <div style="padding: 15px; text-align: center; color: #64748b; font-size: 0.85rem;">
                No hay resultados. <a href="#" onclick="selectProductForLocalVoucher('custom'); return false;" style="color: var(--accent); font-weight: 600;">Crear producto personalizado</a>
            </div>`;
    } else {
        resultsDiv.innerHTML = filtered.map(prod => {
            // LOGIC FOR PAX & BADGES
            const pax = parseInt(prod.personas || prod.pax || 1);
            let badgesHtml = '';

            // PAX BADGE
            if (pax > 1) {
                badgesHtml += `<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-size:0.7em; font-weight:700; border:1px solid #bfdbfe;"><i class="fas fa-user-friends"></i> ${pax} Pers.</span>`;
            } else {
                badgesHtml += `<span style="background:#f8fafc; color:#64748b; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #e2e8f0;">1 Pers.</span>`;
            }

            // SERVICE BADGES
            const nameLower = (prod.nombre || '').toLowerCase();
            const catLower = (prod.categoria || '').toLowerCase();
            const includesSpa = nameLower.includes('spa') || nameLower.includes('circuito') || catLower.includes('spa');
            const includesMasaje = nameLower.includes('masaje') || catLower.includes('masaje');
            const isPack = nameLower.includes('pack') || (prod.items_incluidos && prod.items_incluidos.length > 1);

            if (includesSpa) {
                badgesHtml += ` <span style="background:#ecfeff; color:#0e7490; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #cffafe; margin-left:4px;"><i class="fas fa-hot-tub"></i> Circuito</span>`;
            }
            if (includesMasaje) {
                badgesHtml += ` <span style="background:#fdf4ff; color:#a21caf; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #fce7f3; margin-left:4px;"><i class="fas fa-spa"></i> Masaje</span>`;
            }
            if (isPack) {
                badgesHtml += ` <span style="background:#fff7ed; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #ffedd5; margin-left:4px;"><i class="fas fa-box-open"></i> Pack</span>`;
            }

            // DESCRIPTION / SUBTEXT
            let subText = "";

            // Prioritize 'items_incluidos' array
            if (prod.items_incluidos && prod.items_incluidos.length > 0) {
                // Format: "Circuito Spa + Masaje Relax..."
                const itemNames = prod.items_incluidos.map(i => i.name || i).join(" + ");
                subText = `<span style="color:#334155;"><i class="fas fa-list-ul" style="font-size:0.8em; opacity:0.7;"></i> ${itemNames}</span>`;
            }
            // Fallback to text description or includes
            else if (prod.incluye) {
                const incStr = Array.isArray(prod.incluye) ? prod.incluye.join(", ") : prod.incluye;
                subText = incStr;
            }
            // Last resort: Category
            else {
                subText = (prod.categoria || 'Servicio').toUpperCase();
            }

            return `
            <div onclick="selectProductForLocalVoucher('${prod.nombre.replace(/'/g, "\\'")}')" 
                style="display: flex; gap: 12px; align-items: start; padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                
                <div style="position:relative; flex-shrink:0;">
                    <img src="${prod.imagen || 'zenith-icon.png'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    ${pax > 1 ? '<div style="position:absolute; bottom:-6px; right:-6px; background:#2563eb; color:white; border-radius:50%; width:20px; height:20px; font-size:0.7rem; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">' + pax + '</div>' : ''}
                </div>
                
                <div style="flex: 1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: #0f172a; line-height:1.2; margin-bottom:4px;">${prod.nombre}</div>
                        <div style="font-weight: 800; font-size: 0.95rem; color: #059669; white-space:nowrap; margin-left:8px;">${parseFloat(prod.precio).toFixed(2)}€</div>
                    </div>
                    
                    <div style="margin-bottom:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                        ${badgesHtml}
                    </div>
                    
                    <div style="font-size: 0.75rem; color: #64748b; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${subText}
                    </div>
                </div>
            </div>
        `}).join('');

        resultsDiv.innerHTML += `
            <div onclick="selectProductForLocalVoucher('custom')" 
                style="padding: 12px; text-align: center; color: #64748b; font-size: 0.85rem; background: #f8fafc; border-top: 1px solid #e2e8f0; cursor: pointer; font-weight: 500; transition: background 0.2s;"
                 onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                <i class="fas fa-plus-circle" style="color:var(--accent);"></i> Producto Personalizado
            </div>`;
    }

    resultsDiv.style.display = 'block';
}

window.selectProductForLocalVoucher = (productName) => {
    const resultsDiv = document.getElementById("lv-search-results");
    const customInput = document.getElementById("lv-product-custom");
    const detailsDiv = document.getElementById("lv-product-details");
    const priceInput = document.getElementById("lv-price");
    const sessionsInput = document.getElementById("lv-sessions");
    const searchInput = document.getElementById("lv-product-search");

    resultsDiv.style.display = 'none';

    if (productName === 'custom') {
        state.lvSelectedProduct = { nombre: 'Personalizado', custom: true };
        customInput.style.display = 'block';
        customInput.value = '';
        customInput.focus();
        detailsDiv.style.display = 'none';

        // Show price input for custom
        const priceContainer = document.getElementById("lv-price-container");
        if (priceContainer) priceContainer.style.display = 'block';
        priceInput.value = '';

        sessionsInput.value = 1;
        searchInput.value = 'PRODUCTO PERSONALIZADO';
    } else {
        const prod = state.catalogProducts.find(p => p.nombre === productName);
        if (prod) {
            state.lvSelectedProduct = prod;
            searchInput.value = prod.nombre;
            customInput.style.display = 'none';

            // UI Details
            // UI Details
            // document.getElementById("lv-details-name").textContent = prod.nombre; // OLD

            // BADGES GENERATION
            const pax = parseInt(prod.personas || prod.pax || 1);
            let badgesHtml = '';
            if (pax > 1) {
                badgesHtml += `<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-size:0.7em; font-weight:700; border:1px solid #bfdbfe;"><i class="fas fa-user-friends"></i> ${pax} Pers.</span>`;
            } else {
                badgesHtml += `<span style="background:#f8fafc; color:#64748b; padding:2px 6px; border-radius:4px; font-size:0.75em; border:1px solid #e2e8f0; font-weight:600;">Individual</span>`;
            }

            const nameLower = (prod.nombre || '').toLowerCase();
            const catLower = (prod.categoria || '').toLowerCase();
            const includesSpa = nameLower.includes('spa') || nameLower.includes('circuito') || catLower.includes('spa');
            const includesMasaje = nameLower.includes('masaje') || catLower.includes('masaje');
            const isPack = nameLower.includes('pack') || (prod.items_incluidos && prod.items_incluidos.length > 1);

            if (includesSpa) badgesHtml += ` <span style="background:#ecfeff; color:#0e7490; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #cffafe; margin-left:4px;"><i class="fas fa-hot-tub"></i> Circuito</span>`;
            if (includesMasaje) badgesHtml += ` <span style="background:#fdf4ff; color:#a21caf; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #fce7f3; margin-left:4px;"><i class="fas fa-spa"></i> Masaje</span>`;
            if (isPack) badgesHtml += ` <span style="background:#fff7ed; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #ffedd5; margin-left:4px;"><i class="fas fa-box-open"></i> Pack</span>`;

            // INJECT NAME AND BADGES
            document.getElementById("lv-details-name").innerHTML = `
                <div style="font-size:1.1rem; line-height:1.2; margin-bottom:6px;">${prod.nombre}</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${badgesHtml}</div>
            `;
            const imgPreview = document.getElementById("lv-img-preview");
            if (prod.imagen) {
                imgPreview.src = prod.imagen;
                imgPreview.style.display = 'block';
            } else {
                imgPreview.style.display = 'none';
            }

            let includesFull = (prod.incluye && Array.isArray(prod.incluye)) ? prod.incluye.join(", ") : (prod.incluye || '');
            if (!includesFull && prod.items_incluidos) {
                includesFull = prod.items_incluidos.map(i => i.name || i.producto).join(", ");
            }
            document.getElementById("lv-details-text").textContent = includesFull || "Servicio de catálogo";
            detailsDiv.style.display = 'block';

            // Hide price input (calculated automatically)
            const priceContainer = document.getElementById("lv-price-container");
            if (priceContainer) priceContainer.style.display = 'none';

            // Store base price in state for calculation
            state.lvSelectedProductBasePrice = parseFloat(prod.precio) || 0;
            state.lvSelectedProductBasePax = parseInt(prod.personas || prod.pax || 1);

            priceInput.value = prod.precio || 0;

            let totalSessions = 1;
            // FIX: If it's a Pack (has items_incluidos), default Input Sessions to 1 (Quantity of Packs), 
            // ignoring prod.sesiones which might be the sum of internal sessions.
            if ((prod.items_incluidos && prod.items_incluidos.length > 0) || (prod.nombre || '').toLowerCase().includes('pack')) {
                totalSessions = 1;
            } else if (prod.sesiones) {
                totalSessions = prod.sesiones;
            } else if (typeof detectSessions === 'function') {
                totalSessions = detectSessions(prod).total;
            }

            sessionsInput.value = totalSessions;

            // Auto-set PAX (Using detection logic)
            let parsedPax = 1;
            if (typeof detectSessions === 'function') {
                const det = detectSessions(prod);
                parsedPax = det.paxPerSession || 1;
            } else {
                parsedPax = parseInt(prod.personas || prod.pax || 1);
            }
            document.getElementById("lv-pax").value = String(parsedPax);
        }
    }
}

function setLVCategory(cat, btn) {
    state.lvCurrentCategory = cat;

    // UI Update
    document.querySelectorAll('.lv-cat-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Re-filter
    filterLocalProducts();
}

function checkCustomProduct(select) {
    const customInput = document.getElementById("lv-product-custom");
    const priceInput = document.getElementById("lv-price");
    const sessionsInput = document.getElementById("lv-sessions");
    const detailsDiv = document.getElementById("lv-product-details");

    if (select.value === 'custom') {
        customInput.style.display = 'block';
        if (priceInput) priceInput.value = '';
        if (sessionsInput) sessionsInput.value = 1;
        if (detailsDiv) detailsDiv.style.display = 'none';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        const prod = state.catalogProducts.find(p => p.nombre === select.value);
        if (prod) {
            if (priceInput) priceInput.value = prod.precio;

            if (detailsDiv) {
                const detailsTextEl = document.getElementById("lv-details-text");
                const imgPreview = document.getElementById("lv-img-preview");

                let detailsText = '';
                if (Array.isArray(prod.incluye)) {
                    detailsText = "Incluye: " + prod.incluye.join(", ");
                } else if (prod.incluye) {
                    detailsText = "Incluye: " + prod.incluye;
                }

                if (imgPreview) {
                    if (prod.imagen) {
                        imgPreview.src = prod.imagen;
                        imgPreview.style.display = 'block';
                    } else {
                        imgPreview.style.display = 'none';
                    }
                }

                if (detailsText) {
                    if (detailsTextEl) detailsTextEl.textContent = detailsText;
                    else detailsDiv.textContent = detailsText; // Fallback
                    detailsDiv.style.display = 'block';
                } else if (prod.imagen) {
                    if (detailsTextEl) detailsTextEl.textContent = "Servicio de catálogo";
                    detailsDiv.style.display = 'block';
                } else {
                    detailsDiv.style.display = 'none';
                }
            }

            let totalSessions = 1;
            if (prod.sesiones) {
                totalSessions = prod.sesiones;
            } else {
                const detected = detectSessions(prod.nombre);
                totalSessions = detected.total;
            }
            if (sessionsInput) sessionsInput.value = totalSessions;
        } else if (detailsDiv) {
            detailsDiv.style.display = 'none';
        }
    }
}

function addToCartLocal() {
    const selected = state.lvSelectedProduct;
    if (!selected) return showToast("Primero selecciona un producto", "warning");

    let name = selected.nombre;
    let price = 0;
    const sessions = parseInt(document.getElementById("lv-sessions").value) || 1;
    const pax = parseInt(document.getElementById("lv-pax").value) || 1;

    if (selected.custom) {
        name = document.getElementById("lv-product-custom").value.trim();
        if (!name) return showToast("Escribe el nombre del producto personalizado", "warning");
        price = parseFloat(document.getElementById("lv-price").value) || 0;
    } else {
        // Calculate Price automatically: BasePrice * (SelectedPax / ProductBasePax)
        const basePrice = state.lvSelectedProductBasePrice || 0;
        const basePax = state.lvSelectedProductBasePax || 1;

        // Logic:
        // If BasePax = 1 (Individual) and Pax = 2 -> Price = Base * 2
        // If BasePax = 2 (Couple) and Pax = 2 -> Price = Base * 1
        const ratio = pax / basePax;
        price = basePrice * ratio;
    }

    // Clonar items si es del catálogo para tener desglose real
    let items = [];
    if (!selected.custom) {
        if (selected.items_incluidos && selected.items_incluidos.length > 0) {
            // Nota: NO multiplicamos por sesiones aquí, se guarda la base del producto.
            // Si el producto dice "Circuito + Masaje", guardamos esos 2 items.
            items = selected.items_incluidos.map(it => ({
                name: it.name || it.producto || name,
                sessions: it.sessions || 1,
                space: it.space || '',
                pax: pax
            }));
        } else {
            items = [{ name, sessions: 1, space: '', pax: pax }];
        }
    } else {
        items = [{ name, sessions: 1, space: '', pax: pax }];
    }

    state.lvCart.push({
        name,
        price,
        sessions,
        pax,
        originalProduct: selected.custom ? null : selected,
        items_breakdown: items
    });

    renderLVCart();

    // Reset current selection
    state.lvSelectedProduct = null;
    document.getElementById("lv-product-search").value = "";
    document.getElementById("lv-product-custom").style.display = 'none';
    document.getElementById("lv-price").value = "";
    document.getElementById("lv-sessions").value = 1;
    document.getElementById("lv-product-details").style.display = 'none';
}

function renderLVCart() {
    const list = document.getElementById("lv-cart-list");
    const totalDisplay = document.getElementById("lv-total-display");
    if (!list) return;

    if (state.lvCart.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #94a3b8; font-size: 0.8rem; padding: 20px;">
                <i class="fas fa-shopping-basket" style="font-size: 1.5rem; opacity: 0.3; display: block; margin-bottom: 8px;"></i>
                Tu bono no tiene productos todavía
            </div>`;
        if (totalDisplay) totalDisplay.innerHTML = "0.00€";
        return;
    }

    list.innerHTML = state.lvCart.map((item, index) => {
        const itemImg = (item.originalProduct && item.originalProduct.imagen) ? item.originalProduct.imagen : 'zenith-icon.png';
        return `
        <div style="display: flex; gap: 10px; align-items: center; background: #fff; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <img src="${itemImg}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 6px;">
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 700; font-size: 0.85rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                <div style="font-size: 0.75rem; color: #64748b;">
                    ${item.sessions} ses. x ${item.price.toFixed(2)}€ = <strong style="color: var(--accent);">${(item.price * item.sessions).toFixed(2)}€</strong>
                </div>
            </div>
            <button onclick="removeFromCart(${index})" style="background: #fef2f2; border: 1px solid #fee2e2; color: #ef4444; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    }).join('');

    const totalPrice = state.lvCart.reduce((sum, i) => sum + (i.price * i.sessions), 0);
    const totalSessions = state.lvCart.reduce((sum, i) => sum + i.sessions, 0);
    if (totalDisplay) {
        totalDisplay.innerHTML = `<span style="color: #64748b; font-weight: 400; font-size: 0.8rem; margin-right: 5px;">TOTAL:</span> ${totalPrice.toFixed(2)}€ <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 5px;">(${totalSessions} Sesiones)</span>`;
    }
}

function removeFromCart(index) {
    state.lvCart.splice(index, 1);
    renderLVCart();
}

async function createLocalVoucher() {
    if (state.lvCart.length === 0) {
        return showToast("Añade al menos un producto al bono", "warning");
    }

    const clientName = document.getElementById("lv-client").value.trim();
    if (!clientName) return showToast("Escribe el nombre del cliente", "warning");

    const codeInput = document.getElementById("lv-code").value.trim();
    // Generación de código mejorada: LOC + Año + Secuencial aleatorio
    const code = codeInput || `LOC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const totalPrice = state.lvCart.reduce((sum, i) => sum + (i.price * i.sessions), 0);
    const totalSessions = state.lvCart.reduce((sum, i) => sum + i.sessions, 0);
    const productNames = state.lvCart.map(i => i.name).join(" + ");

    // Consolidar desglose de items de todos los productos del carrito
    let allItems = [];
    state.lvCart.forEach(cartItem => {
        if (cartItem.items_breakdown) {
            // Multiplicamos cada item base por la cantidad de sesiones elegidas para ese producto
            for (let s = 0; s < cartItem.sessions; s++) {
                allItems = allItems.concat(cartItem.items_breakdown.map(it => ({
                    ...it,
                    itemId: 'it_' + Math.random().toString(36).substr(2, 9),
                    used: 0
                })));
            }
        }
    });

    const newVoucher = {
        bono: code,
        codigo: code,
        cliente: clientName,
        email: document.getElementById("lv-email").value.trim(),
        telefono: document.getElementById("lv-phone").value.trim(),
        producto: productNames,
        precio: totalPrice,
        importe: totalPrice,
        fecha: new Date().toISOString(),
        estado: 'pending',
        origen: 'local',
        sesiones_totales: totalSessions,
        sesiones_usadas: 0,
        pax_por_sesion: state.lvCart.length > 0 ? Math.max(...state.lvCart.map(i => i.pax || 1)) : 1,
        items_desglosados: allItems,
        createdAt: new Date().toISOString(),
        manual_update: true,
        updated_at: new Date().toISOString()
    };

    // Generar searchTokens para que sea buscable localmente de inmediato
    if (typeof generateSearchTokens === 'function') {
        newVoucher.searchTokens = generateSearchTokens(newVoucher);
    }

    try {
        const btn = document.getElementById("lv-save-btn");
        const btnText = btn.querySelector("span") || btn;
        const originalText = btnText.textContent;

        btn.disabled = true;
        if (btnText.tagName === 'SPAN') btnText.textContent = "CREANDO...";
        else btn.textContent = "CREANDO...";

        // 1. GUARDADO LOCAL INMEDIATO
        if (window.apiLocal) {
            await apiLocal.saveBono({ ...newVoucher, syncStatus: 'pending' });
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('pending');
        }

        // 2. INTENTO FIRESTORE
        try {
            await db.collection("spa_vouchers").doc(code).set(newVoucher);
            if (window.apiLocal) await apiLocal.markSynced('bonos', code, code);
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('synced');
            showToast("Bono creado y sincronizado", "success");
        } catch (fsErr) {
            console.warn("Fallo sync creación bono (permance en local):", fsErr);
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
            showToast("Bono creado localmente (Pendiente de subir)", "info");
        }

        closeLocalVoucherModal();
        cargarBonos();

    } catch (err) {
        showToast("Error creando bono: " + err.message, "error");
    } finally {
        const btn = document.getElementById("lv-save-btn");
        const btnText = btn.querySelector("span") || btn;
        btn.disabled = false;
        if (btnText.tagName === 'SPAN') btnText.textContent = "Crear Bono";
    }
}


// function goToReservation removed (duplicate legacy code)

async function markServiceUsed(itemIndex, voucher) {
    const item = state.editingVoucherItems[itemIndex];

    // Incrementar uso
    item.used = (item.used || 0) + 1;

    // Guardar validación simple
    const userEmail = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : 'admin';
    const validation = {
        fecha_validacion: new Date().toISOString(),
        validado_por: userEmail
    };

    if (!item.validations) item.validations = [];
    item.validations.push(validation);

    // FIX: Priorizar 'bono' como código
    const voucherCode = voucher.bono || voucher.codigo;

    // Guardar en Firestore
    try {
        await saveServiceBreakdownToFirestore(voucherCode);
        showToast(`Servicio "${item.name}" validado correctamente`, "success");

        // Actualizar vista
        openVoucherManagement(voucherCode);

        // Opcional: ofrecer abrir reservas
        setTimeout(() => {
            const space = (item.space || '').toLowerCase();
            // Si validamos, preguntamos si quieren reservar (si NO es complemento niHotel validado aparte)
            const isComplemento = space === 'complemento';

            if (!isComplemento && item.used <= (item.sessions || 1)) {
                goToReservation(voucher.cliente, item.name, voucherCode, space);
            }
        }, 500); // Pequeño delay para UX

    } catch (error) {
        console.error("Error validando servicio:", error);
        showToast("Error al validar: " + error.message, "error");
    }
}

// --- IMPORTACIÓN DE EXCEL DE WOOCOMMERCE ---
// --- IMPORTACIÓN DE EXCEL DE WOOCOMMERCE ---
async function importExcelOrders(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast("Procesando archivo Excel...", "info");

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            showToast("El archivo está vacío", "error");
            return;
        }

        console.log("Columnas detectadas:", Object.keys(rows[0]));
        console.log("Filas encontradas:", rows.length);

        // Mapeo de columnas WooCommerce a campos de bono
        const columnMap = {
            // Identificadores
            'Número de pedido': 'order_number',
            'ID del pedido': 'order_id',
            'Estado del pedido': 'order_status',
            // Cliente
            'Correo electrónico del cliente': 'email',
            'Correo electrónico (facturación)': 'email_billing',
            'Nombre (facturación)': 'nombre',
            'Apellidos (facturación)': 'apellidos',
            'Teléfono (facturación)': 'telefono',
            // Fechas
            'Fecha del pedido': 'fecha',
            // Producto
            'ID del producto': 'product_id',
            'ID de la variante': 'variation_id', // Capturar variación si existe
            'Nombre del artículo': 'producto',
            'Coste de artículo': 'importe',
            'Precio actual del producto': 'precio_producto',
            'Cantidad': 'cantidad',
            'Descripción corta': 'descripcion',
            'SKU': 'sku',
            'Nombres completos de las categorías': 'categoria',
            'Metadatos del artículo del pedido': 'metadata',
            // Totales
            'Importe total del pedido': 'total_pedido',
            'Importe de subtotal del pedido': 'subtotal',
            // Notas
            'Nota del cliente': 'nota_cliente'
        };

        // 1. AGRUPAR FILAS POR NÚMERO DE PEDIDO
        const orders = {};

        for (const row of rows) {
            // Mapear campos
            const mapped = {};
            for (const [excelCol, fieldName] of Object.entries(columnMap)) {
                if (row[excelCol] !== undefined && row[excelCol] !== '') {
                    mapped[fieldName] = row[excelCol];
                }
            }

            // Validar clave
            const orderKey = mapped.order_number || mapped.order_id;
            if (!orderKey) continue;

            const bonoCode = `WC${orderKey}`;

            if (!orders[bonoCode]) {
                orders[bonoCode] = {
                    bonoCode,
                    meta: mapped, // Guardar metadatos generales del primer item
                    items: []
                };
            }

            // Añadir item
            orders[bonoCode].items.push(mapped);
        }

        let imported = 0;
        let skipped = 0;
        let errors = 0;
        let updated = 0;

        const orderCodes = Object.keys(orders);
        console.log(`Pedidos únicos detectados: ${orderCodes.length}`);

        // 2. PROCESAR CADA PEDIDO AGRUPADO
        for (const code of orderCodes) {
            try {
                const orderData = orders[code];
                const firstItem = orderData.items[0]; // Usar datos del primer item para cabecera de bono

                // Verificar si ya existe en Firestore
                const docRef = db.collection('spa_vouchers').doc(code);
                const existingDoc = await docRef.get();

                // Calcular cliente
                const clientName = [firstItem.nombre || '', firstItem.apellidos || ''].filter(Boolean).join(' ').trim();

                // Parsear fecha
                let fechaCompra = null;
                if (firstItem.fecha) {
                    const d = new Date(firstItem.fecha);
                    if (!isNaN(d.getTime())) {
                        fechaCompra = d.toISOString().split('T')[0];
                    }
                }

                // Construir items desglosados
                let totalSesiones = 0;
                let totalPrice = 0;
                let productNames = [];
                const itemsDesglosados = [];

                orderData.items.forEach(item => {
                    const price = parseFloat(String(item.importe || item.total_pedido || '0').replace(',', '.')) || 0;
                    const qty = parseInt(item.cantidad) || 1;

                    // Detectar sesiones por item
                    const det = detectSessions(item);

                    // Por cada unidad de cantidad, añadir un item (o agrupar, pero mejor desglosar si son servicios distintos)
                    // Si qty > 1 de un mismo servicio, ¿desglosar?
                    // Sí, mejor desglosar para permitir consumo individual.
                    for (let i = 0; i < qty; i++) {
                        itemsDesglosados.push({
                            itemId: 'imp_' + Math.random().toString(36).substr(2, 9),
                            name: item.producto || 'Producto sin nombre',
                            product_id: item.product_id ? String(item.product_id) : null,
                            variation_id: item.variation_id ? String(item.variation_id) : null,
                            price: price / qty, // Precio unitario aproximado
                            sessions: det.total,
                            pax: det.paxPerSession,
                            used: 0
                        });
                        totalSesiones += det.total;
                    }

                    productNames.push(`${qty > 1 ? qty + 'x ' : ''}${item.producto}`);
                    totalPrice += price; // El precio de la fila generalmente es el total de esa línea
                });

                // Si ya existe, decidimos si actualizar o saltar
                // Estrategia: Si existe y tiene menos items, actualizamos (fusión). 
                // Pero por simplicidad, si ya existe, asumimos que está bien y saltamos, salvo que sea un re-import forzado.
                // CORRECCIÓN: Si el usuario re-importa para arreglar items faltantes, debemos permitir Update.

                if (existingDoc.exists) {
                    const existingData = existingDoc.data();

                    // Chequeo simple: Si el existente tiene menos items desglosados, actualizar
                    if ((existingData.items_desglosados || []).length < itemsDesglosados.length) {
                        console.log(`[UPDATE] Actualizando bono ${code} con más items (${itemsDesglosados.length} vs ${existingData.items_desglosados?.length})`);

                        await docRef.update({
                            items_desglosados: itemsDesglosados,
                            producto: productNames.join(' + '), // Actualizar nombre compuesto
                            sesiones_totales: totalSesiones,
                            importe: totalPrice // Actualizar precio total real
                        });
                        updated++;
                    } else {
                        console.log("Bono ya existe y parece completo:", code);
                        skipped++;
                    }
                    continue;
                }

                // Crear nuevo documento
                const bonoData = {
                    bono: code,
                    order_id: String(firstItem.order_id || firstItem.order_number || ''),
                    producto: productNames.join(' + '),
                    cliente: clientName || 'Cliente WooCommerce',
                    email: firstItem.email || firstItem.email_billing || '',
                    telefono: firstItem.telefono || '',
                    importe: totalPrice,
                    cantidad: 1, // Es 1 bono que contiene X items
                    fecha: fechaCompra || new Date().toISOString().split('T')[0],
                    nota_cliente: firstItem.nota_cliente || '',
                    origen: 'woocommerce-excel',
                    status: mapOrderStatus(firstItem.order_status),
                    estado: 'pending', // Estado interno inicial
                    sesiones_usadas: 0,
                    sesiones_totales: totalSesiones,
                    pax_por_sesion: itemsDesglosados[0]?.pax || 1, // Pax del primer item por defecto
                    items_desglosados: itemsDesglosados,
                    fecha_validez: null,
                    createdAt: new Date().toISOString(),
                    importedAt: new Date().toISOString()
                };

                // Generar searchTokens
                if (typeof generateSearchTokens === 'function') {
                    bonoData.searchTokens = generateSearchTokens(bonoData);
                }

                await docRef.set(bonoData);
                if (window.apiLocal) await apiLocal.saveBono({ ...bonoData, syncStatus: 'synced' }); // Guardar copia local también

                imported++;
                console.log("✅ Importado Agrupado:", code, bonoData.producto);

            } catch (rowErr) {
                console.error("Error procesando pedido:", code, rowErr);
                errors++;
            }
        }

        showToast(`Importación completada: ${imported} nuevos, ${updated} actualizados, ${skipped} omitidos`, (imported > 0 || updated > 0) ? "success" : "info");

        // Recargar bonos
        if (imported > 0 || updated > 0) {
            await cargarBonos();
        }

    } catch (err) {
        console.error("Error importando Excel:", err);
        showToast("Error al procesar el archivo: " + err.message, "error");
    }

    // Reset input para permitir reimportar el mismo archivo
    event.target.value = '';
}

// Mapear estados de WooCommerce a estados internos
function mapOrderStatus(wcStatus) {
    const statusMap = {
        'wc-completed': 'activo',
        'completed': 'activo',
        'Completado': 'activo',
        'wc-processing': 'activo',
        'processing': 'activo',
        'Procesando': 'activo',
        'wc-on-hold': 'pendiente',
        'on-hold': 'pendiente',
        'En espera': 'pendiente',
        'wc-pending': 'pendiente',
        'pending': 'pendiente',
        'Pendiente de pago': 'pendiente',
        'wc-cancelled': 'cancelado',
        'cancelled': 'cancelado',
        'Cancelado': 'cancelado',
        'wc-refunded': 'reembolsado',
        'refunded': 'reembolsado',
        'Reembolsado': 'reembolsado'
    };
    return statusMap[wcStatus] || 'activo';
}

// Event listeners para filtros (Search, Date, Status)
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('voucher-search');
    const dateInput = document.getElementById('voucher-date');
    const statusSelect = document.getElementById('voucher-filter');
    const monthsSelect = document.getElementById('bonos-filter-months');

    if (searchInput) {
        searchInput.addEventListener('input', async () => {
            const searchTerm = searchInput.value.trim();

            // BÚSQUEDA DIRECTA: Si escribe un código exacto (LOC-XXXX o BONOXXXX), buscar solo ese documento
            if (searchTerm.match(/^(LOC-|BONO)\d+/i)) {
                const codigo = searchTerm.toUpperCase();
                console.log(`[BÚSQUEDA DIRECTA] Buscando código específico: ${codigo}`);

                try {
                    const doc = await db.collection("spa_vouchers").doc(codigo).get();
                    if (doc.exists) {
                        const bonoData = { ...doc.data(), bono: doc.id };

                        // Añadir al state si no está ya cargado
                        const existingIndex = state.bonos.findIndex(b => b.bono === doc.id);
                        if (existingIndex === -1) {
                            state.bonos.unshift(bonoData); // Añadir al principio
                            console.log(`[BÚSQUEDA DIRECTA] ✓ Bono ${doc.id} encontrado (1 lectura)`);
                        } else {
                            console.log(`[BÚSQUEDA DIRECTA] ✓ Bono ${doc.id} ya estaba cargado`);
                        }

                        // Renderizar para mostrar el resultado
                        if (typeof renderBonosFromState === 'function') {
                            renderBonosFromState();
                        }
                        return; // No continuar con búsqueda por filtro
                    } else {
                        console.log(`[BÚSQUEDA DIRECTA] ✗ Bono ${codigo} no existe en la base de datos`);
                    }
                } catch (err) {
                    console.warn(`[BÚSQUEDA DIRECTA] Error: ${err.message}`);
                }
            }

            // BÚSQUEDA POR NOMBRE/EMAIL: Auto-expandir a último año
            if (searchTerm.length > 2 && monthsSelect && monthsSelect.value === '0') {
                console.log('[BÚSQUEDA] Auto-expandiendo a 12 meses para buscar bonos antiguos');
                monthsSelect.value = '12';
                if (typeof loadVouchers === 'function') {
                    loadVouchers();
                    return; // loadVouchers ya llamará a renderBonosFromState
                }
            }

            if (typeof renderBonosFromState === 'function') {
                renderBonosFromState();
            }
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => {
            if (typeof renderBonosFromState === 'function') {
                renderBonosFromState();
            }
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            if (typeof renderBonosFromState === 'function') {
                renderBonosFromState();
            }
        });
    }
});

// --- Funcionalidad de Exportación a Excel ---
// Se define globalmente para ser accesible desde el HTML
window.exportLocalVouchersToExcel = async function () {
    if (!state.bonos || state.bonos.length === 0) {
        showToast("No hay bonos cargados para exportar", "warning");
        return;
    }

    try {
        const btn = document.querySelector("button[onclick='exportLocalVouchersToExcel()']");
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        }

        // 1. Filtrar solo bonos locales (origen 'local' o código empieza por LOC-)
        const localBonos = state.bonos.filter(b =>
            b.origen === 'local' ||
            (b.codigo && b.codigo.startsWith('LOC-')) ||
            (b.bono && b.bono.startsWith('LOC-'))
        );

        if (localBonos.length === 0) {
            showToast("No se encontraron bonos locales para exportar", "info");
            if (btn) {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
            return;
        }

        console.log(`[EXPORT] Encontrados ${localBonos.length} bonos locales.`);

        // 2. Mapear datos al formato deseado (Columnas de "BONOS LOCALES.xlsx")
        const exportData = localBonos.map(b => {
            // Normalizar campos
            const codigo = b.bono || b.codigo || '';
            const fecha = b.fecha || '';
            const cliente = b.cliente || b.customer_note || ''; // Fallback si cliente no está
            const email = b.email || '';
            const producto = b.producto || '';
            const importe = parseFloat(b.importe || 0);
            const estado = b.estado || 'pending';

            // Generar objeto plano
            return {
                "Código": codigo,
                "Fecha": fecha,
                "Cliente": cliente,
                "Email": email,
                "Producto": producto,
                "Importe": importe,
                "Estado": estado,
                "Sesiones Total": b.sesiones_totales || 1,
                "Sesiones Usadas": b.sesiones_usadas || 0,
                "Origen": "Local"
            };
        });

        // 3. Crear Workbook y Sheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bonos Locales");

        // 4. Generar nombre de archivo con fecha
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `BONOS_LOCALES_${dateStr}.xlsx`;

        // 5. Descargar
        XLSX.writeFile(wb, fileName);

        showToast(`Exportados ${localBonos.length} bonos correctamente`, "success");

    } catch (err) {
        console.error("Error exportando a Excel:", err);
        showToast("Error al exportar: " + err.message, "error");
    } finally {
        const btn = document.querySelector("button[onclick='exportLocalVouchersToExcel()']");
        if (btn) {
            btn.innerHTML = '<i class="fas fa-file-export"></i> Exp. Locales';
            btn.disabled = false;
        }
    }
};

// --- IMPORTAR BONOS LOCALES DESDE EXCEL ---
window.importLocalVouchersFromExcel = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convertir a Array de Arrays primero para buscar la cabecera
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (!rawData || rawData.length === 0) {
                showToast("El archivo Excel parece vacío.", "error");
                return;
            }

            // --- AUTO-DETECT HEADER ROW ---
            let headerRowIndex = 0;
            let foundHeader = false;

            for (let i = 0; i < Math.min(rawData.length, 10); i++) {
                const row = rawData[i];
                const rowStr = JSON.stringify(row).toLowerCase();
                // Buscar palabras clave en la fila
                if (rowStr.includes('codigo') || rowStr.includes('código') || rowStr.includes('bono') || rowStr.includes('code')) {
                    headerRowIndex = i;
                    foundHeader = true;
                    console.log(`[IMPORT] Cabecera detectada en fila ${i}:`, row);
                    break;
                }
            }

            // Si no encontramos nada claro, asumimos fila 0, pero avisamos
            if (!foundHeader) {
                console.warn("[IMPORT] No se detectó fila de cabecera obvia. Usando fila 0.");
            }

            // Re-procesar usando la fila detectada como cabecera (range offset)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });

            let importedCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            const processedCodes = new Set();

            console.log(`[IMPORT] Procesando ${jsonData.length} filas desde la fila ${headerRowIndex}...`);

            for (const row of jsonData) {
                try {
                    // Helper para normalizar headers (eliminar acentos, lower case y SALTOS DE LÍNEA)
                    const normalizeHeader = h => h.toLowerCase()
                        .replace(/[\r\n]+/g, "") // Eliminar saltos de línea (Fix para 'ARTIC\nULO')
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .trim();

                    const getVal = (keys) => {
                        const rowKeys = Object.keys(row);
                        for (const k of keys) {
                            const target = normalizeHeader(k);
                            const foundKey = rowKeys.find(rk => normalizeHeader(rk).includes(target));
                            if (foundKey) return row[foundKey];
                        }
                        return null;
                    };

                    // MAPPING EXTENDIDO PARA FORMATO LEGACY
                    // 'no tarjeta' matches 'Nº TARJETA' normalized
                    let rawCodigo = getVal(['Codigo', 'Bono', 'ID', 'Code', 'Nº Tarjeta', 'Tarjeta', 'Numero']);

                    if (!rawCodigo) {
                        if (Object.keys(row).length > 2) {
                            // console.warn("[IMPORT] Fila ignorada por falta de código:", row);
                            errorCount++;
                        }
                        continue;
                    }

                    // AÑADIR PREFIJO "exc.Loc " si no lo tiene
                    const codigo = String(rawCodigo).startsWith("exc.Loc") ? rawCodigo : `exc.Loc ${rawCodigo}`;

                    if (String(rawCodigo).includes("16707")) {
                        console.log("DEBUG 16707 FOUND:", { rawCodigo, codigo, row });
                    }

                    const exists = state.bonos.find(b => b.codigo === codigo || b.bono === codigo);
                    if (exists) {
                        // Allow overwrite if existing date is invalid (1970)
                        const isInvalidDate = exists.fecha && String(exists.fecha).startsWith("1970");
                        if (!isInvalidDate) {
                            if (String(rawCodigo).includes("16707")) console.log("DEBUG 16707 SKIPPED (EXISTS):", exists);
                            skippedCount++;
                            continue;
                        } else {
                            console.log(`[Import] Forzando actualización de bono con fecha incorrecta (1970): ${codigo}`);
                        }
                    }

                    const cliente = getVal(['Cliente', 'Nombre', 'Titular', 'Customer']) || 'Cliente Importado';

                    // 'FECHA DE COMPRA' mapping - Prioritized
                    const fechaRaw = getVal(['Fecha de compra', 'Fecha', 'Date', 'Created', 'Compra', 'Cha de comp']);

                    // DEBUG LOG
                    if (importedCount === 0) {
                        console.log("DEBUG IMPORT ROW 0:", row);
                        console.log("DEBUG KEYS:", Object.keys(row));
                        console.log("DEBUG FECHA RAW:", fechaRaw);
                    }

                    let fecha = new Date().toISOString().split('T')[0]; // Default

                    if (fechaRaw) {
                        // 1. Excel Serial Number (e.g. 45000)
                        if (typeof fechaRaw === 'number') {
                            try {
                                // Excel serial dates start 1899-12-30. 
                                // Add 12 hours (0.5) to avoid timezone/midnight rollovers resulting in previous day
                                const jsDate = new Date((fechaRaw - 25569.5) * 86400 * 1000);
                                // Add 1 day if it seems off (optional, but usually adding 12h is enough for date-only)
                                // A safer way for pure dates:
                                // const dateInfo = new Date((fechaRaw - 25569) * 86400 * 1000);

                                if (!isNaN(jsDate.getTime())) {
                                    // Force UTC or simple formatting to avoid shifting back
                                    fecha = jsDate.toISOString().split('T')[0];

                                    // Extra check: If year is 1970, it usually means 0 or invalid parse
                                    if (fecha.startsWith('1970')) {
                                        console.warn("Date parsed as 1970 (invalid?), keeping today or raw:", fecha, fechaRaw);
                                    }
                                }
                            } catch (e) {
                                console.warn("Error parsing excel date number:", fechaRaw);
                            }
                        }
                        // 2. String Formats
                        else if (typeof fechaRaw === 'string') {
                            const trimmed = fechaRaw.trim();
                            // A. Spanish Format: DD/MM/YYYY or D/M/YYYY
                            // Matches 05/01/2026, 5/1/2026, etc.
                            const spanMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);

                            if (spanMatch) {
                                const day = spanMatch[1].padStart(2, '0');
                                const month = spanMatch[2].padStart(2, '0');
                                const year = spanMatch[3];
                                fecha = `${year}-${month}-${day}`;
                            } else {
                                // B. Fallback to standard Date parse (YYYY-MM-DD, etc.)
                                const d = new Date(trimmed);
                                if (!isNaN(d.getTime())) {
                                    fecha = d.toISOString().split('T')[0];
                                }
                            }
                        }
                    }

                    // Mapping Producto. Fixed 'ARTICULO' matching 'ARTIC\nULO' via normalizeHeader removal of \n
                    const producto = getVal(['Producto', 'Servicio', 'Concepto', 'Item', 'Articulo']) || 'Bono Importado';

                    // 'efectivo' might be the price in this specific sheet
                    const importe = parseFloat(getVal(['Importe', 'Precio', 'Coste', 'Amount', 'Efectivo', 'Total']) || 0);

                    const email = getVal(['Email', 'Correo']) || '';

                    // NUEVO: OBSERVACIONES
                    const observaciones = getVal(['Observaciones', 'Notas', 'Comentarios', 'Nota']) || '';

                    // Logic for redemption date (FECHA DE CANJE)
                    const fechaCanje = getVal(['Fecha Canje', 'Canje', 'Echa de canj']);

                    // VALIDACIÓN DE DUPLICADOS ROBUSTA (ASYNC)
                    // 1. Verificar si ya lo hemos procesado en ESTE lote
                    if (processedCodes.has(codigo)) {
                        console.log(`[Import] Saltando duplicado (en lote): ${codigo}`);
                        skippedCount++;
                        continue;
                    }

                    // 2. Verificar existencia REAL en DB (Local o Firestore) porque state.bonos puede estar incompleto (filtros)
                    let checkExists = null;
                    if (window.apiLocal) {
                        checkExists = await apiLocal.getBonoByCode(codigo);
                    }
                    // Si no está en local, verificar Firestore (por si no se ha sincronizado o no se ha cargado)
                    if (!checkExists) {
                        const fsDoc = await db.collection('spa_vouchers').doc(codigo).get();
                        if (fsDoc.exists) checkExists = fsDoc.data();
                    }

                    if (checkExists) {
                        const isInvalidDate = checkExists.fecha && String(checkExists.fecha).startsWith("1970");

                        // If date is valid, we skip. If invalid (1970), we proceed to overwrite.
                        if (!isInvalidDate) {
                            console.log(`[Import] Saltando duplicado (ya existe en BD): ${codigo}`);
                            skippedCount++;
                            // Si existe, asegúrate de que esté en state local para que el usuario lo VEA al menos
                            const isVisible = state.bonos.some(b => b.bono === codigo);
                            if (!isVisible && checkExists) {
                                // Lo añadimos al estado visual para feedback inmediato
                                // OJO: checkExists puede ser el objeto de DB o Firestore
                                // Normalizamos un poco si viene de Firestore
                                const dispBono = { ...checkExists, id: checkExists.id || codigo };
                                state.bonos.unshift(dispBono);
                            }
                            continue;
                        } else {
                            console.log(`[Import] Forzando actualización en BD por fecha 1970: ${codigo}`);
                        }
                    }

                    processedCodes.add(codigo);

                    let sesiones = parseInt(getVal(['Sesiones', 'Sesiones Total', 'Cantidad']) || 1);
                    let sesionesUsadas = parseInt(getVal(['Sesiones Usadas', 'Usadas']) || 0);

                    // Si tiene fecha de canje, asumimos que está gastado si no se especifica sesiones usadas
                    if (fechaCanje && sesionesUsadas === 0) {
                        sesionesUsadas = sesiones;
                    }

                    const newBono = {
                        codigo: String(codigo), // Ensure string
                        bono: String(codigo),
                        cliente: cliente,
                        fecha: fecha,
                        email: email,
                        producto: producto,
                        importe: importe,
                        sesiones_totales: sesiones,
                        sesiones_usadas: sesionesUsadas,
                        observaciones: observaciones, // Guardamos observaciones
                        origen: 'local',
                        estado: sesionesUsadas >= sesiones ? 'agotado' : 'pending', // Usar 'pending' (Estándar App)
                        items_desglosados: [
                            {
                                name: producto,
                                sessions: sesiones,
                                used: sesionesUsadas,
                                price: importe
                            }
                        ]
                    };

                    // Generar tokens de búsqueda para que sea encontrable
                    newBono.searchTokens = generateSearchTokens(newBono);

                    // Guardar en DB Local (y la API se encarga de sync si es posible)
                    // PRIMERO guardamos en local por seguridad
                    await apiLocal.saveBono({ ...newBono, syncStatus: 'pending' });

                    // INTENTO DE SUBIDA A FIRESTORE
                    try {
                        const fsData = typeof cleanUndefined === 'function' ? cleanUndefined(newBono) : newBono;
                        await db.collection("spa_vouchers").doc(newBono.bono).set(fsData);

                        // Si funciona, marcamos como synced
                        if (window.apiLocal) {
                            await apiLocal.markSynced('bonos', newBono.bono, newBono.bono);
                        }
                        console.log(`[IMPORT] Bono ${newBono.bono} subido a Firestore ✅`);
                    } catch (fsErr) {
                        console.warn(`[IMPORT] ⚠ Fallo subida Firestore para ${newBono.bono}. Permanece en local (pending).`, fsErr);
                    }

                    // Actualizar estado local
                    state.bonos.unshift(newBono);
                    importedCount++;

                } catch (rowErr) {
                    console.error("Error importando fila:", row, rowErr);
                    errorCount++;
                }
            }

            // REFRESCAR UI (Limpiar filtros para asegurar que se ven los nuevos)
            const dateInput = document.getElementById("voucher-date");
            const monthsSelect = document.getElementById('bonos-filter-months');

            if (dateInput) dateInput.value = "";
            if (monthsSelect) monthsSelect.value = "12"; // Mostrar último año por defecto tras importar

            console.log("[IMPORT] Recargando vista tras importación...");
            await cargarBonos();

            let msg = `Importados: ${importedCount}.`;
            if (skippedCount > 0) msg += ` Saltados (duplicados): ${skippedCount}.`;
            if (errorCount > 0) msg += ` Ignorados/Error: ${errorCount}.`;

            showToast(msg, importedCount > 0 ? "success" : "info");

        } catch (err) {
            console.error("Error procesando archivo:", err);
            showToast("Error crítico al leer el archivo Excel.", "error");
        } finally {
            event.target.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
};

// --- SYNC HELPER ---
async function uploadLocalPendingToFirestore() {
    if (!window.apiLocal || !window.db) return;

    try {
        const pending = await apiLocal.getPendingSync('bonos');
        if (pending.length === 0) return;

        console.log(`[SYNC-UP] Subiendo ${pending.length} bonos pendientes a la nube...`);
        const batch = db.batch();
        let batchedCount = 0;

        for (const item of pending) {
            if (!item.bono) continue;

            const docRef = db.collection("spa_vouchers").doc(item.bono);
            const dataToUpload = { ...item };

            // Eliminar ID local de Dexie antes de subir
            delete dataToUpload.id;

            // Limpieza de datos (undefined no permitido en Firestore)
            const cleanData = typeof cleanUndefined === 'function' ? cleanUndefined(dataToUpload) : dataToUpload;

            // Merge true para no machacar datos si ya existen (aunque normalmente set es ok)
            batch.set(docRef, cleanData, { merge: true });
            batchedCount++;
        }

        if (batchedCount > 0) {
            await batch.commit();
            console.log(`[SYNC-UP] ${batchedCount} bonos subidos correctamente.`);

            // Marcar como synced en local
            for (const item of pending) {
                // Usamos el ID clave para la actualización local si existe
                await apiLocal.markSynced('bonos', item.id || item.bono, item.bono);
            }

            showToast(`Sincronizados ${batchedCount} bonos locales con la nube`, 'success');
        }

    } catch (err) {
        console.error("Error en subida de pendientes:", err);
        // No bloqueamos la ejecución, solo logueamos
    }
}

// --- FORCE SYNC (Manual Trigger) ---
async function forceSyncLocalVouchers() {
    if (!confirm("Esto forzará la subida de TODOS los bonos locales a la nube (sobreescribiendo si existen).\n\n¿Continuar?")) return;

    const btn = document.getElementById("force-upload-btn");
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
    }

    try {
        // Buscar bonos locales en Memoria (state) o DB
        // Preferimos DB para estar seguros
        const allBonos = await apiLocal.getBonos();
        const localOnly = allBonos.filter(b => b.origen === 'local' || (b.bono && String(b.bono).startsWith('LOC-')) || (b.codigo && String(b.codigo).startsWith('LOC-')) || (b.bono && String(b.bono).startsWith('exc.Loc')));

        if (localOnly.length === 0) {
            alert("No se encontraron bonos locales para subir.");
            return;
        }

        console.log(`[FORCE-SYNC] Encontrados ${localOnly.length} bonos locales. Iniciando subida...`);

        const batchSize = 400; // Firestore batch limit is 500
        const total = localOnly.length;
        let processed = 0;
        let errors = 0;

        // Process in chunks
        for (let i = 0; i < total; i += batchSize) {
            const chunk = localOnly.slice(i, i + batchSize);
            const batch = db.batch();
            let opsInBatch = 0;

            for (const item of chunk) {
                if (!item.bono) continue;
                const docRef = db.collection("spa_vouchers").doc(item.bono);
                const dataToUpload = { ...item };
                delete dataToUpload.id; // Clean ID

                const cleanData = typeof cleanUndefined === 'function' ? cleanUndefined(dataToUpload) : dataToUpload;

                batch.set(docRef, cleanData, { merge: true });
                opsInBatch++;
            }

            if (opsInBatch > 0) {
                await batch.commit();
                processed += opsInBatch;
                console.log(`[FORCE-SYNC] Lote ${i / batchSize + 1} subido (${opsInBatch} docs).`);

                // Mark synced local
                for (const item of chunk) {
                    await apiLocal.markSynced('bonos', item.id || item.bono, item.bono);
                }
            }
        }

        showToast(`Subida Forzada Completa: ${processed} bonos subidos.`, "success");

    } catch (err) {
        console.error("Error Force Sync:", err);
        alert("Error durante la subida forzada: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}


/**
 * Intenta buscar un bono probando varios formatos comunes dado un número
 * Ej: entrada "123" -> Prueba LOC-2024-123, BONO123, etc.
 */
async function searchVoucherByNumericInput(number) {
    const tableBody = document.getElementById("vouchers-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">
        <i class="fas fa-search fa-spin"></i> Probando formatos para el n° ${number}...
    </td></tr>`;

    const currentYear = new Date().getFullYear();
    // Generar candidatos de códigos para búsqueda exacta rápida
    const candidates = [
        `exc.Loc ${number}`,
        `LOC-${number}`,
        `LOC-${new Date().getFullYear()}-${number}`,
        `BONO${number}`,
        `${number}`,
        `Bono ${number}`
    ];

    try {
        // 1. Búsqueda por COINCIDENCIA PARCIAL en el ESTADO LOCAL (Nivel 0)
        // Esto permite que "7694" encuentre "BONO7694", "exc.Loc 7694", etc.
        const partialMatches = state.bonos.filter(b => {
            const id = String(b.bono || b.codigo || "").toLowerCase();
            return id.includes(String(number).toLowerCase());
        });

        if (partialMatches.length > 0) {
            console.log(`[SMART-SEARCH] Encontrados ${partialMatches.length} coincidencias parciales en memoria.`);
            state.bonos = partialMatches;
            state.isActiveSearch = true;
            renderBonosFromState();
            updateCount();
            showToast(`Encontrados ${partialMatches.length} bonos coincidentes`, 'success');
            return;
        }

        // 2. Búsqueda LOCAL rápida de candidatos exactos
        if (window.apiLocal) {
            for (const code of candidates) {
                const local = await apiLocal.getBonoByCode(code);
                if (local) {
                    console.log(`[SMART-SEARCH] Encontrado en local: ${code}`);
                    state.bonos = [local];
                    state.isActiveSearch = true;
                    renderBonosFromState();
                    updateCount();
                    showToast(`Bono ${code} encontrado (Local)`, 'success');
                    return;
                }
            }
        }

        // 2. Si no está en local, probamos Firestore en paralelo
        let found = null;
        for (const code of candidates) {
            const docRef = db.collection("spa_vouchers").doc(code);
            const snap = await docRef.get();
            if (snap.exists) {
                found = { ...snap.data(), bono: code };
                break; // Encontrado!
            }
        }

        if (found) {
            state.bonos = [found];
            state.isActiveSearch = true;
            renderBonosFromState();
            updateCount();

            // Guardar para la próxima
            if (window.apiLocal) {
                await apiLocal.saveBono({ ...found, syncStatus: 'synced', lastSyncAt: new Date().toISOString() });
            }

            showToast(`Bono ${found.bono} encontrado`, 'success');
        } else {
            // Si fallan los candidatos, intentamos la búsqueda por TEXTO (searchTokens) 
            // como último recurso (Nivel 2)
            console.log("[SMART-SEARCH] Candidatos fallaron, probando búsqueda por texto...");
            searchVouchersByText(number);
        }

    } catch (err) {
        console.error("Error en búsqueda numérica:", err);
        searchVouchersByText(number); // Fallback
    }
}


/**
 * Helper para obtener estado formateado
 */
function getVoucherStatus(b) {
    if (b.estado === 'completed') return 'completed';
    // Lógica adicional si es necesario (ej: caducidad)
    const now = new Date();
    if (b.fecha_caducidad && new Date(b.fecha_caducidad) < now && b.estado !== 'completed') {
        return 'expired';
    }
    return b.estado || 'pending';
}

// Ensure global access for numeric search if needed explicitly
window.searchVoucherByNumericInput = searchVoucherByNumericInput;
window.importLocalVouchersFromExcel = importLocalVouchersFromExcel;

// --- EXPORT TO EXCEL ---
window.exportToExcel = function () {
    if (!state.bonos || state.bonos.length === 0) {
        showToast("No hay bonos para exportar", "info");
        return;
    }

    const exportData = state.bonos.map(b => ({
        "Bono/Código": b.bono || b.codigo,
        "Cliente": b.cliente || "Cliente Desconocido",
        "Email": b.email || "",
        "Producto": b.producto || "",
        "Fecha Compra": b.fecha || "",
        "Sesiones Totales": b.sesiones_totales || b.sesiones_total || 1,
        "Sesiones Usadas": b.sesiones_usadas || b.sesiones_consumidas || 0,
        "Importe (€)": b.importe || 0,
        "Estado": getVoucherStatus(b) === 'expired' ? 'Caducado' : (b.estado === 'completed' ? 'Canjeado' : 'Activo'),
        "Origen": b.origen || (String(b.bono).startsWith("LOC") ? "local" : "web")
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonos");

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Bonos_Zenith_${dateStr}.xlsx`);
};


/**
 * UTILIDAD DE MIGRACIÓN: Corrige bonos numéricos antiguos y fechas inválidas
 * Uso: ejecutar fixLegacyNumericVoucherCodes() en consola
 */
window.fixLegacyNumericVoucherCodes = async function () {
    if (!confirm("⚠️ ¿Estás seguro de que quieres migrar los bonos numéricos antiguos?\nEsto creará copias con códigos 'LOC-AAAA-XXXX' y eliminará los antiguos.")) return;

    const numericBonos = state.bonos.filter(b => /^\d+$/.test(b.bono));
    let migrated = 0;

    console.log(`[MIGRATION] Encontrados ${numericBonos.length} bonos numéricos para corregir.`);

    for (const b of numericBonos) {
        try {
            // 1. Calcular Año y Nueva Fecha si es errónea
            let dateObj = new Date(b.fecha);
            if (isNaN(dateObj.getTime()) || String(b.fecha).includes('ERROR') || String(b.fecha).length < 6) {
                dateObj = new Date(); // Fallback a hoy si la fecha estaba mal
                console.log(`[MIGRATION] Bono ${b.bono}: Fecha inválida '${b.fecha}'. Cambiada a HOY.`);
            }
            const cleanDate = dateObj.toISOString().split('T')[0];
            const year = dateObj.getFullYear();

            // 2. Nuevo Código
            const newCode = `LOC-${year}-${b.bono}`;

            // 3. Crear Nuevo Bono
            const newBono = { ...b, bono: newCode, codigo: newCode, fecha: cleanDate, origen: 'local', updated_at: new Date().toISOString() };
            newBono.searchTokens = generateSearchTokens(newBono);

            // 4. Guardar Nuevo
            if (window.apiLocal) await apiLocal.saveBono({ ...newBono, syncStatus: 'pending' });

            // 5. Eliminar Antiguo (Local) - Dexie
            if (window.dbLocal) {
                await dbLocal.bonos.delete(b.bono);
            }

            migrated++;
        } catch (e) {
            console.error(`[MIGRATION] Error migrando bono ${b.bono}:`, e);
        }
    }

};

/**
 * UTILIDAD MAESTRA DE REPARACIÓN: Detecta duplicados (123 vs exc.Loc 123) y borra los corruptos (1970).
 */
window.removeCorruptDuplicates = async function () {
    if (!state.bonos || state.bonos.length === 0) {
        await cargarBonos();
    }

    const allBonos = state.bonos;
    const toDelete = [];
    const map = new Map();

    console.log(`[REPAIR] Analizando ${allBonos.length} bonos...`);

    // 1. Agrupar por "Número Base"
    // exc.Loc 17995 -> 17995
    // 17995 -> 17995
    // LOC-202X-17995 -> 17995
    for (const b of allBonos) {
        const raw = String(b.bono || b.codigo);
        const numericPart = raw.match(/\d+$/); // Extract last sequence of digits
        if (numericPart) {
            const num = parseInt(numericPart[0]);
            if (!map.has(num)) map.set(num, []);
            map.get(num).push(b);
        }
    }

    // 2. Analizar grupos
    for (const [num, list] of map.entries()) {
        if (list.length > 1) {
            // Caso A: Conflicto Duplicado
            // Buscar si hay alguno "bueno" (Fecha > 2000 y no 1970)
            const good = list.find(b => b.fecha && !String(b.fecha).startsWith("1970") && !String(b.fecha).startsWith("01/01/1970"));
            const badList = list.filter(b => !b.fecha || String(b.fecha).startsWith("1970") || String(b.fecha).startsWith("01/01/1970") || String(b.fecha).length < 6);

            if (good && badList.length > 0) {
                // Borrar los malos
                badList.forEach(bad => {
                    // Solo borrar si es DIFERENTE id que el bueno (por seguridad)
                    if (bad.bono !== good.bono) {
                        toDelete.push(bad);
                        console.log(`[REPAIR] Detectado duplicado MALO: ${bad.bono} (Fecha: ${bad.fecha}) vs BUENO: ${good.bono} (Fecha: ${good.fecha})`);
                    }
                });
            } else if (!good && badList.length > 1) {
                // Todos malos? Borrar todos menos uno (o todos para reimportar)
                // Estrategia: Borrar todos los numéricos puros si hay conflicto
                badList.forEach(bad => {
                    if (/^\d+$/.test(bad.bono)) toDelete.push(bad);
                });
            }
        }
        else if (list.length === 1) {
            // Caso B: Único pero corrupto (1970)
            const b = list[0];
            const is1970 = String(b.fecha).startsWith("1970") || String(b.fecha).startsWith("01/01/1970");
            // Solo borrar si es numérico puro o exc.Loc sin fecha válida
            if (is1970) {
                // Delete to allow re-import
                toDelete.push(b);
                console.log(`[REPAIR] Detectado CORRUPTO único: ${b.bono} (Fecha: ${b.fecha})`);
            }
        }
    }

    if (toDelete.length === 0) {
        alert("✅ No se encontraron conflictos obvios de fechas (1970) o duplicados corruptos.");
        return;
    }

    if (!confirm(`⚠️ SE HAN DETECTADO ${toDelete.length} BONOS CORRUPTOS (Fecha 1970 o duplicados).\n\nSe eliminarán para dejar solo las versiones correctas o permitir re-importación.\n\n¿Proceder?`)) return;

    let deleted = 0;
    for (const b of toDelete) {
        try {
            if (window.apiLocal) {
                const localDb = await apiLocal._getDb();
                // Try delete by key
                await localDb.bonos.delete(b.bono);
                // Try delete by ID if exists
                if (b.id) await localDb.bonos.delete(b.id);
            }
            if (window.db) {
                await db.collection("spa_vouchers").doc(b.bono).delete();
            }
            deleted++;
        } catch (e) {
            console.error(`Error borrando ${b.bono}`, e);
        }
    }

    alert(`✅ Reparación completada: ${deleted} bonos eliminados.\nRecargando página...`);
    window.location.reload();
};

/**
 * UTILIDAD DE LIMPIEZA: Elimina bonos caducados o con fecha inválida.
 * Uso: ejecutar cleanupVouchers() en consola
 */
window.cleanupVouchers = async function (deepScan = true) {
    let toDelete = [];

    // 1. Escaneo Local (State)
    const now = new Date();
    const localCandidates = state.bonos.filter(b => {
        const f = b.fecha;
        const isExcelSerial = (typeof f === 'number' && f > 20000 && f < 80000) || (/^\d{5}$/.test(String(f)));
        const isInvalidDate = !f || String(f).includes('ERROR') || isNaN(new Date(f).getTime()) || String(f).length < 6 || isExcelSerial;

        let isExpired = false;
        if (b.fecha_caducidad) {
            const expDate = new Date(b.fecha_caducidad);
            if (!isNaN(expDate.getTime()) && expDate < now && b.estado !== 'completed' && b.estado !== 'agotado') {
                isExpired = true;
            }
        }
        return isInvalidDate || isExpired;
    });

    toDelete = [...localCandidates];

    // 2. Escaneo Profundo en Firestore (si se solicita)
    // Busca documentos que no se cargaron por filtro de fecha
    if (deepScan && window.db) {
        console.log("[CLEANUP] Iniciando escaneo profundo en Firestore para detectar fechas numéricas...");
        try {
            // Firestore no permite buscar fácilmente por "tipo", pero sabemos que estos inválidos 
            // suelen tener fechas numéricas que son strings cortos o numbers.
            // O podemos buscar por aquellos que NO tienen un guion (las fechas buenas son YYYY-MM-DD)

            // Estrategia: Bajar un lote grande sin filtro de fecha (¡Cuidado con el tamaño!)
            // Limitamos a 500 para probar.
            const snap = await db.collection("spa_vouchers")
                .orderBy("fecha") // Las fechas numéricas (45000) suelen quedar al principio o final dependiendo del sort strings
                .limit(300)
                .get();

            snap.forEach(doc => {
                const data = doc.data();
                const f = data.fecha;
                // Detectar Excel Serial
                const isExcelSerial = (typeof f === 'number' && f > 20000 && f < 80000) || (/^\d{5}$/.test(String(f)));
                // Detectar "ERROR"
                const isError = String(f).includes('ERROR') || String(f).length < 6;

                if (isExcelSerial || isError) {
                    // Añadir si no está ya
                    if (!toDelete.find(x => x.bono === doc.id)) {
                        toDelete.push({ ...data, bono: doc.id, _fromFirestore: true });
                    }
                }
            });

        } catch (e) {
            console.error("Error en deep scan:", e);
        }
    }

    if (toDelete.length === 0) {
        alert("No se encontraron bonos inválidos (ni en local ni en escaneo rápido de nube).");
        return;
    }

    if (!confirm(`⚠️ SE VAN A ELIMINAR ${toDelete.length} BONOS INVÁLIDOS:\n` +
        `- ${toDelete.filter(b => b._fromFirestore).length} detectados solo en Nube.\n` +
        `- ${toDelete.length - toDelete.filter(b => b._fromFirestore).length} locales.\n\n` +
        `Ejemplos: ${toDelete.slice(0, 3).map(b => b.bono + ' (' + b.fecha + ')').join(', ')}\n\n` +
        `¿Estás seguro? SE BORRARÁN DE FIRESTORE Y LOCAL.`)) {
        return;
    }

    console.log(`[CLEANUP] Borrando ${toDelete.length} items...`);
    let deletedCount = 0;

    for (const b of toDelete) {
        try {
            // Eliminar Local
            if (window.dbLocal) await dbLocal.bonos.delete(b.bono);

            // Eliminar Firestore
            await db.collection("spa_vouchers").doc(b.bono).delete();

            deletedCount++;
        } catch (err) {
            console.error(`Error borrando ${b.bono}`, err);
        }
    }

    alert(`✅ ${deletedCount} bonos eliminados correctamente.`);
    window.location.reload();
};


/**
 * UTILIDAD DE BORRADO POR RANGO: Elimina bonos numéricos hasta un límite.
 * Uso: deleteLegacyRange(9998)
 */
window.deleteLegacyRange = async function (maxId = 9998) {
    if (!confirm(`⚠️ PELIGRO: Esto borrará TODOS los bonos que sean solo números (sin LOC-) menores o iguales a ${maxId}.\n¿Estás seguro?`)) return;

    console.log(`[RANGE-DELETE] Buscando bonos numéricos <= ${maxId}...`);

    // 1. Buscar candidatos (Local + Nube)
    let toDelete = [];

    // A. Local
    const localMatches = state.bonos.filter(b => {
        return /^\d+$/.test(String(b.bono)) && parseInt(b.bono) <= maxId;
    });
    toDelete = [...localMatches];

    // B. Nube (Deep Scan para encontrar huerfanos)
    if (window.db) {
        try {
            const snap = await db.collection("spa_vouchers").get(); // Scan completo necesario si no están ordenados numéricamente string
            snap.forEach(doc => {
                const id = doc.id;
                if (/^\d+$/.test(id) && parseInt(id) <= maxId) {
                    if (!toDelete.find(x => x.bono === id)) {
                        toDelete.push({ bono: id });
                    }
                }
            });
        } catch (e) {
            console.error("Error scan nube:", e);
        }
    }

    if (toDelete.length === 0) {
        alert("No se encontraron bonos en ese rango.");
        return;
    }

    if (!confirm(`⚠️ SE DETECTARON ${toDelete.length} BONOS NUMÉRICOS <= ${maxId}.\nSe van a eliminar PERMANENTEMENTE.\n\nEscribe el número ${toDelete.length} para confirmar:`)) return;

    console.log(`[RANGE-DELETE] Borrando ${toDelete.length} bonos...`);
    let count = 0;

    for (const b of toDelete) {
        try {
            if (window.dbLocal) await dbLocal.bonos.delete(b.bono);
            await db.collection("spa_vouchers").doc(b.bono).delete();
            count++;
            if (count % 50 === 0) console.log(`Borrados ${count}...`);
        } catch (e) {
            console.error(`Fallo al borrar ${b.bono}`, e);
        }
    }

    alert(`✅ Operación terminada. ${count} bonos eliminados.`);
    window.location.reload();
};

/**
 * REPARACIÓN TOTAL V3 (DEEP SCAN): Escanea toda la base de datos local para borrar de raíz.
 */
window.removeCorruptDuplicates = async function () {
    const confirmScanner = confirm("⚠️ ¿Ejecutar LIMPIEZA TOTAL?\n\nEsto buscará en los miles de bonos de la base de datos local (IndexedDB) para encontrar CUALQUIER fecha 1970/inválida y borrarla de golpe tanto aquí como en la nube.\n\n¿Proceder?");
    if (!confirmScanner) return;

    let allBonos = [];
    try {
        if (!window.apiLocal) throw new Error("API Local no disponible");
        const localDb = await apiLocal._getDb();
        allBonos = await localDb.bonos.toArray();
        console.log(`[REPAIR] Escaneando ${allBonos.length} bonos...`);
    } catch (e) {
        console.error("No se pudo acceder a la BD local profunda:", e);
        alert("Error al acceder a la base de datos local. Intentaremos con los datos en memoria.");
        allBonos = state.bonos || [];
    }

    if (allBonos.length === 0) {
        alert("No hay bonos cargados para analizar.");
        return;
    }

    const isBadDate = (d) => {
        if (!d) return true;
        const s = String(d).trim();
        // Detectar 0, "0", "-", strings vacíos o que contienen 1970
        if (s === '-' || s === '' || s === '0' || s.includes('1970') || s.startsWith('01/01/1970')) return true;
        const dt = new Date(d);
        if (!isNaN(dt.getTime()) && dt.getFullYear() < 2000) return true;
        return false;
    };

    const map = new Map();
    const toDelete = [];

    // 1. Agrupar por id numérico o bono exacto para detectar duplicados
    for (const b of allBonos) {
        const rawCode = String(b.bono || b.codigo || "");
        if (!rawCode) continue;

        // Intentar sacar el número (ej: de "exc.Loc 12345" sacar "12345")
        const match = rawCode.match(/(\d+)$/);
        const key = match ? match[1] : rawCode;

        if (!map.has(key)) map.set(key, []);
        map.get(key).push(b);
    }

    // 2. Analizar grupos para limpieza profunda
    for (const [key, list] of map.entries()) {
        const badOnes = list.filter(b => isBadDate(b.fecha));
        const goodOnes = list.filter(b => !isBadDate(b.fecha));

        if (goodOnes.length > 0) {
            // Caso A: Tenemos versiones buenas. Borramos TODAS las malas.
            badOnes.forEach(b => toDelete.push(b));

            // Caso B: Tenemos MÚLTIPLES versiones buenas (Duplicados reales). 
            // Nos quedamos solo con la más reciente (updatedAt).
            if (goodOnes.length > 1) {
                goodOnes.sort((a, b) => {
                    const dateA = new Date(a.updatedAt || 0);
                    const dateB = new Date(b.updatedAt || 0);
                    return dateB - dateA; // Descendente
                });
                // Borramos todos menos el primero
                goodOnes.slice(1).forEach(b => toDelete.push(b));
            }
        } else if (badOnes.length > 0) {
            // Caso C: Solo hay versiones malas.
            // Si hay varias, las borramos todas menos una (para poder editarla) 
            // O mejor: las borramos todas para re-importar limpio. 
            // El usuario prefiere borrar masivo para re-importar.
            badOnes.forEach(b => toDelete.push(b));
        }
    }

    if (toDelete.length === 0) {
        alert("✅ ¡Excelente noticia! No se han encontrado bonos con fechas 1970 o corruptas en toda la base de datos.");
        return;
    }

    // Unificar por código de bono por si acaso
    const uniqueToDelete = [...new Map(toDelete.map(item => [item.bono, item])).values()];

    if (!confirm(`🚨 ¡ATENCIÓN! Se han encontrado ${uniqueToDelete.length} bonos corruptos.\n\n¿Quieres BORRARLOS TODOS de forma masiva ahora mismo?`)) return;

    let deletedCount = 0;
    const errors = [];

    for (const b of uniqueToDelete) {
        try {
            // Borrar de IndexedDB
            const localDb = await apiLocal._getDb();
            await localDb.bonos.delete(b.bono);
            if (b.id) await localDb.bonos.delete(b.id);

            // Borrar de Firestore
            if (window.db) {
                await db.collection("spa_vouchers").doc(b.bono).delete();
            }
            deletedCount++;
            if (deletedCount % 50 === 0) console.log(`Borrados ${deletedCount}...`);
        } catch (e) {
            console.error("Error borrando:", b.bono, e);
            errors.push(b.bono);
        }
    }

    alert(`💪 ¡LIMPIEZA COMPLETADA!\n\nSe han eliminado ${deletedCount} bonos basura.\n${errors.length > 0 ? `Hubo ${errors.length} errores.` : ""}\n\nLa página se recargará para mostrar los cambios.`);
    window.location.reload();
};

/**
 * DELETE VOUCHER MANUAL
 */
window.deleteVoucher = async function (bonoCode) {
    if (!confirm("⚠️ ¿ESTÁS SEGURO DE BORRAR EL BONO " + bonoCode + "?\n\nEsta acción es irreversible y lo borrará de la base de datos local y nube.")) return;

    try {
        // 1. Delete from State
        state.bonos = state.bonos.filter(b => b.bono !== bonoCode);
        renderBonosFromState(); // Immediate UI update

        // 2. Delete from Local DB
        if (window.apiLocal) {
            const localDb = await apiLocal._getDb();
            await localDb.bonos.delete(bonoCode);
        }

        // 3. Delete from Firestore
        if (window.db) {
            await db.collection("spa_vouchers").doc(bonoCode).delete();
            console.log(`[DELETE] Borrado de Firestore: ${bonoCode}`);
        }

        alert("✅ Bono eliminado correctamente.");
    } catch (e) {
        console.error("Error borrando bono:", e);
        alert("❌ Error al borrar: " + e.message);
    }
};
