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
    // Set default date to today
    const dateInput = document.getElementById("voucher-date");
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Setup listeners
    setupBonoListeners();

    // Load data
    cargarCatalogoSimple();
    loadMasterItems(); // Load master items for smart redirection
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
        dateInput.addEventListener("change", renderBonosFromState);
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

    // Eliminar prefijos de categoría si están presentes con guion
    if (s.includes(" - ")) {
        const parts = s.split(" - ");
        // Si el primer tramo es genérico (ej: "Circuito SPA"), lo ignoramos para centrar en el producto real
        if (parts.length > 1) s = parts[1];
        else s = parts[0];
    }

    // Limpieza final de espacios y guiones
    return s.replace(/[-\s]+/g, ' ').trim();
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

        // Fragmentos del código
        const parts = code.split('-');
        parts.forEach(part => {
            if (part.length > 0) tokens.add(part); // "loc", "2025", "8566"
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
function goToReservation(client, service, code) {
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

    alert(debugMsg);

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
        else if (spaceLower.includes('hotel') || spaceLower.includes('restaurante') || spaceLower.includes('alojamiento')) type = 'hotel';
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
        let space = prod ? (prod.espacio || '').toLowerCase() : '';

        // Use explicit space if defined in catalog product
        if (space && space !== '') {
            type = space;
        } else {
            // Fallback checks on category AND name
            const checkStr = (category + ' ' + lowerService).trim();

            if (checkStr.includes('restaurante') || checkStr.includes('menu') || checkStr.includes('menú') || checkStr.includes('comida') || checkStr.includes('cena') || checkStr.includes('desayuno') || checkStr.includes('almuerzo') || checkStr.includes('alojamiento') || checkStr.includes('hotel')) {
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
    alert(debugMsg);

    let url = `reservas.html?type=${type}&action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;

    // Si es hotel/restaurante, redirigir al proyecto independiente
    if (type === 'hotel') {
        url = `../gestion-Salones/restaurante.html?action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;
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
            const localBonos = await apiLocal.getBonos();
            if (localBonos.length > 0) {
                console.log(`[LOCAL-FIRST] Cargados ${localBonos.length} bonos de IndexedDB`);
                state.bonos = localBonos;
                renderBonosFromState();
                updateCount();
            }
        } catch (e) {
            console.error("Error leyendo de IndexedDB:", e);
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

        let cutoffStr;
        if (monthsBack === 0) {
            // Solo hoy: usar fecha LOCAL (no UTC) para evitar problemas de timezone
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            cutoffStr = `${year}-${month}-${day}`;
            console.log(`[OPTIMIZACIÓN] Cargando bonos de HOY (local): ${cutoffStr}`);
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
        for (const doc of snapshot.docs) {
            const data = doc.data();
            persistentData[doc.id] = data;
            if (window.apiLocal) {
                await apiLocal.saveBono({
                    ...data,
                    bono: doc.id,
                    syncStatus: 'synced',
                    lastSyncAt: new Date().toISOString()
                });
            }
        }


        state.bonos = Object.values(persistentData).map(p => ({
            ...p,
            importe: p.importe || p.precio
        }));
        state.bonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        renderBonosFromState();
        updateCount();

        // 2. Sincronización WooCommerce (solo si hay conexión)
        // Check if getBonoEndpoint exists
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
            // No borramos la tabla, dejamos los datos locales que ya se cargaron al principio
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || originalText;
                btn.style.opacity = "1";
            }
            return;
        }

        console.error("Error cargando bonos:", err);

        tableBody.innerHTML = `<tr><td colspan="7" class="error" style="text-align:center;">Error: ${err.message}</td></tr>`;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || originalText;
            btn.style.opacity = "1";
        }
    }
}

async function sincronizarConTienda(persistentData, btn, originalText) {
    try {
        const endpoint = getBonoEndpoint(); // From app.js
        const res = await fetch(endpoint);

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        let shopVouchers = await res.json();

        // Handle legacy wrapper if present
        if (shopVouchers.contents) {
            try {
                const inner = JSON.parse(shopVouchers.contents);
                if (Array.isArray(inner)) shopVouchers = inner;
            } catch (e) {
                console.warn("Error parsing contents wrapper:", e);
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

                // Solo actualizamos si el bono guardado no tenía IDs o son diferentes
                if (topPId != persisted.product_id || topVId != persisted.variation_id) {
                    console.log(`[Sync] Actualizando IDs para bono existente ${b.bono}: P:${topPId}, V:${topVId}`);
                    // Limpiar undefined antes de actualizar
                    const updateData = cleanUndefined({
                        product_id: topPId,
                        variation_id: topVId,
                        items_desglosados: b.items_desglosados || [],
                        searchTokens: generateSearchTokens(b) // Agregar searchTokens para búsqueda
                    });
                    batch.update(db.collection("spa_vouchers").doc(b.bono), updateData);
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

        if (newCount > 0) {
            showToast(`${newCount} bonos nuevos sincronizados`, 'success');
        } else {
            showToast("Sincronización completada.", 'success');
        }

    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.warn("Sync error:", err);
        showToast("Error en sincronización: " + err.message, "error");
    } finally {
        restoreButton(btn, originalText);
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
            await db.collection("spa_vouchers").doc(b.bono).update({
                sesiones_totales: det.total,
                pax_por_sesion: det.paxPerSession,
                manual_update: true,
                auto_fixed: true,
                updatedAt: new Date().toISOString()
            });
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

    const filtered = state.bonos.filter(b => {
        // Texto (Bono, Email, Producto, Cliente, Teléfono)
        const textMatch = (b.bono || '').toLowerCase().includes(searchTerm) ||
            (b.email || '').toLowerCase().includes(searchTerm) ||
            (b.producto || '').toLowerCase().includes(searchTerm) ||
            (b.cliente || '').toLowerCase().includes(searchTerm) ||
            (b.telefono || '').toLowerCase().includes(searchTerm);

        // NUEVO: Si hay búsqueda activa por searchTokens, NO aplicar filtros
        if (state.isActiveSearch) {
            return true; // Mostrar TODOS los resultados de la búsqueda
        }

        // Fecha
        let dateMatch = true;
        if (filterDate && b.fecha) {
            dateMatch = b.fecha.startsWith(filterDate);
        }

        // Estado
        let statusMatch = true;
        if (filterStatus !== 'all') {
            if (filterStatus === 'expired') {
                statusMatch = (b.estado === 'expired') || (b.estado === 'pending' && checkVoucherExpiry(b));
            } else if (filterStatus === 'pending') {
                statusMatch = (b.estado === 'pending') && !checkVoucherExpiry(b);
            } else {
                statusMatch = (b.estado === filterStatus);
            }
        }

        return textMatch && dateMatch && statusMatch;
    });

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

        if (b.estado === 'pending' && isExpired) {
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

        return `
        <tr>
            <td style="padding: 10px 5px;"><img src="${thumbUrl}" referrerpolicy="no-referrer" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;"></td>
            <td style="font-weight:600">${b.bono || '-'}</td>
            <td>${b.producto || '-'}</td>
            <td>${b.email || '-'}</td>
            <td>${formatDate(b.fecha)}${expiryText}</td>
            <td style="font-weight:bold">${b.importe || 0}€</td>
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
    document.getElementById("voucher-filter").value = "all";
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
    document.getElementById("vm-producto").value = v.producto || '';
    document.getElementById("vm-fecha-compra").value = v.fecha || '';
    // document.getElementById("vm-importe").value = v.importe || 0; 

    const priceBadge = document.getElementById("vm-cat-price");
    if (priceBadge) {
        priceBadge.textContent = (v.importe || 0) + '€';
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
        }

        return services;
    }

    // Usar items_desglosados si existe, si no, detectar del nombre
    let baseServices = [];

    // MEJORA: Verificar si items_desglosados es realmente un desglose o solo el nombre del producto
    const hasRealBreakdown = v.items_desglosados && v.items_desglosados.length > 0 &&
        !(v.items_desglosados.length === 1 && v.items_desglosados[0].name === v.producto);

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

        if (expanded.length > 1) {
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

        if (state.editingVoucherItems.length > 0) {
            listDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:700; color:#334155; font-size:0.75rem; text-transform:uppercase;">Items de Compra</div>
            </div>`;

            listDiv.innerHTML += state.editingVoucherItems.map((item, idx) => {
                const used = item.used || 0;
                const total = item.sessions || 1;
                const isComplete = used >= total;
                const spaceName = item.space || 'No asignado';

                // Detectar si es Hotel (para mostrar solo Gestionar)
                const isAccommodation = spaceName.toLowerCase() === 'hotel' || item.name.toLowerCase().includes('alojamiento');

                // Detectar si es Complemento (botella de cava, vino, etc.)
                const itemNameLower = item.name.toLowerCase();
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
                    // COMPLEMENTOS: Solo botón de "Completar" simple (sin reserva)
                    buttonsHtml = `
                        <button class="btn btn-sm" 
                            onclick="validateServiceItem(${idx}, true)" 
                            style="padding:2px 8px; font-size:0.7rem; background:#10b981; color:#fff; border:none; white-space:nowrap; border-radius:4px;">
                            <i class="fas fa-check"></i> Completar
                        </button>
                    `;
                } else if (isAccommodation) {
                    buttonsHtml = `
                        <button class="btn btn-sm" 
                            onclick="validateServiceItem(${idx})" 
                            style="padding:2px 8px; font-size:0.7rem; background:#2563eb; color:#fff; border:none; white-space:nowrap; border-radius:4px;">
                            <i class="fas fa-concierge-bell"></i> Gestionar
                        </button>
                    `;
                } else {
                    // Servicios normales (Masaje, Spa, etc.)
                    // Botón RESERVAR (Principal)
                    buttonsHtml += `
                        <button class="btn btn-sm" 
                            onclick="goToReservation('${encodeURIComponent(v.cliente || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.name || '').replace(/'/g, "%27")}', '${encodeURIComponent(v.bono || v.codigo || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.space || '').replace(/'/g, "%27")}')" 
                            style="padding:2px 8px; font-size:0.7rem; background:#0ea5e9; color:#fff; border:none; white-space:nowrap; border-radius:4px; margin-right:4px;">
                            <i class="fas fa-calendar-alt"></i> Reservar
                        </button>
                    `;

                    // Botón VALIDAR MANUAL (Secundario)
                    buttonsHtml += `
                        <button class="btn btn-sm" 
                            onclick="validateServiceItem(${idx}, true)" 
                            style="padding:2px 6px; font-size:0.7rem; background:#fff; color:#64748b; border:1px solid #cbd5e1; white-space:nowrap; border-radius:4px;"
                            title="Consumir sesión manualmente sin reserva">
                            <i class="fas fa-check"></i>
                        </button>
                    `;
                }

                return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:${isComplete ? '#f0fdf4' : '#fff'}; padding:8px; margin-bottom:4px; border-radius:6px; border:1px solid ${isComplete ? '#86efac' : '#e2e8f0'}; gap:8px;">
                    <div style="display: flex; flex-direction: column; flex: 1; overflow:hidden; gap:2px;">
                        <div style="font-size:0.8rem; font-weight:600; color:#334155;">${item.name}</div>
                        <div style="font-size:0.65rem; color:#64748b;">
                            <i class="fas fa-map-marker-alt" style="margin-right:2px;"></i>${spaceName}
                            <span style="margin-left:8px; font-weight:600; color:${isComplete ? '#16a34a' : '#334155'};">
                                ${used}/${total} sesiones
                            </span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                         ${buttonsHtml}
                    </div>
                </div>
            `;
            }).join('');
            listDiv.style.display = 'flex';
        } else {
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
    window.updateVoucherItemName = (idx, val) => {
        state.editingVoucherItems[idx].name = val;
        // Auto-detect space using helper (Master Items priority)
        const detectedSpace = getSpaceForService(val);
        if (detectedSpace) {
            state.editingVoucherItems[idx].space = detectedSpace;
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
                        if (s === 'hotel' && (h.origen || '').toLowerCase().includes('hotel')) spaceMatch = true;

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
        } catch (fsErr) {
            console.warn("Fallo sincronización Firestore (modo local activo):", fsErr);
            if (window.checkFirestoreError && window.checkFirestoreError(fsErr)) {
                if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('offline');
                showToast("Guardado localmente (Sin cuota de Google)", "info");
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
    renderLVCart();

    const select = document.getElementById("lv-product-select");
    select.innerHTML = '<option value="">Seleccionar del catálogo...</option><option value="custom">-- Otro (Personalizado) --</option>';

    // Guardar lista filtrada (sin Peluquería y respetando venta_local)
    state.lvFilteredProducts = state.catalogProducts.filter(prod => {
        const cat = (prod.categoria || '').toLowerCase();
        const name = (prod.nombre || '').toLowerCase();
        const isLocal = prod.venta_local !== false; // Default true
        return cat !== 'peluqueria' && !name.includes('peluquería') && isLocal;
    });

    state.lvFilteredProducts.forEach(prod => {
        select.innerHTML += `<option value="${prod.nombre}">${prod.nombre}</option>`;
    });

    const searchInput = document.getElementById("lv-product-search");
    if (searchInput) searchInput.value = '';

    // Reset categories
    state.lvCurrentCategory = 'todos';
    document.querySelectorAll('.lv-cat-btn').forEach(btn => btn.classList.remove('active'));
    const allBtn = document.querySelector('.lv-cat-btn[onclick*="todos"]');
    if (allBtn) allBtn.classList.add('active');

    document.getElementById("local-voucher-modal").style.display = "flex";

    // Reset inputs
    document.getElementById("lv-product-details").style.display = 'none';
    document.getElementById("lv-price").value = '';
    document.getElementById("lv-sessions").value = 1;
}

function closeLocalVoucherModal() {
    document.getElementById("local-voucher-modal").style.display = "none";
}

function filterLocalProducts(query) {
    const select = document.getElementById("lv-product-select");
    const q = (query || document.getElementById("lv-product-search").value).toLowerCase().trim();
    const cat = state.lvCurrentCategory || 'todos';

    select.innerHTML = '<option value="">Seleccionar del catálogo...</option><option value="custom">-- Otro (Personalizado) --</option>';

    state.lvFilteredProducts.forEach(prod => {
        const matchesQuery = !q || prod.nombre.toLowerCase().includes(q);
        let matchesCat = true;

        if (cat === 'spa') matchesCat = (prod.categoria || '').toLowerCase().includes('spa');
        else if (cat === 'masaje') matchesCat = (prod.categoria || '').toLowerCase().includes('masaje');
        else if (cat === 'pack') matchesCat = (prod.items_incluidos && prod.items_incluidos.length > 1) || (prod.nombre || '').toLowerCase().includes('pack');
        else if (cat === 'bono') matchesCat = (prod.nombre || '').toLowerCase().includes('bono') || (prod.sesiones && prod.sesiones > 1);

        if (matchesQuery && matchesCat) {
            select.innerHTML += `<option value="${prod.nombre}">${prod.nombre}</option>`;
        }
    });
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
    const select = document.getElementById("lv-product-select");
    let name = select.value;
    if (name === 'custom') name = document.getElementById("lv-product-custom").value;

    const price = parseFloat(document.getElementById("lv-price").value) || 0;
    const sessions = parseInt(document.getElementById("lv-sessions").value) || 1;

    if (!name) return showToast("Selecciona un producto", "warning");

    state.lvCart.push({ name, price, sessions });
    renderLVCart();

    select.value = "";
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
        list.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 0.75rem; padding:10px;">Carrito vacío</div>`;
        totalDisplay.textContent = "0.00€";
        return;
    }

    list.innerHTML = state.lvCart.map((item, index) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 4px;">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.8rem;">${item.name}</div>
                <div style="font-size: 0.7rem; color: #64748b;">
                    ${item.sessions} ses. x ${item.price.toFixed(2)}€ = <strong>${(item.price * item.sessions).toFixed(2)}€</strong>
                </div>
            </div>
            <button onclick="removeFromCart(${index})" style="background:none; border:none; color: #ef4444; cursor: pointer;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    const totalPrice = state.lvCart.reduce((sum, i) => sum + (i.price * i.sessions), 0);
    const totalSessions = state.lvCart.reduce((sum, i) => sum + i.sessions, 0);
    totalDisplay.textContent = `${totalPrice.toFixed(2)}€ (${totalSessions} Sesiones)`;
}

function removeFromCart(index) {
    state.lvCart.splice(index, 1);
    renderLVCart();
}

async function createLocalVoucher() {
    if (state.lvCart.length === 0) {
        return showToast("Añade al menos un producto al bono", "warning");
    }

    const codeInput = document.getElementById("lv-code").value.trim();
    const code = codeInput || `LOC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;

    const totalPrice = state.lvCart.reduce((sum, i) => sum + (i.price * i.sessions), 0);
    const totalSessions = state.lvCart.reduce((sum, i) => sum + i.sessions, 0);
    const productNames = state.lvCart.map(i => i.name).join(" + ");

    const newVoucher = {
        bono: code,
        cliente: document.getElementById("lv-client").value,
        email: document.getElementById("lv-email").value,
        producto: productNames,
        precio: totalPrice,
        importe: totalPrice,
        fecha: new Date().toISOString(),
        estado: 'pending',
        origen: 'local',
        sesiones_totales: totalSessions,
        sesiones_usadas: 0,
        items_desglosados: state.lvCart,
        createdAt: new Date().toISOString()
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


// Helper para redirección
function goToReservation(client, service, code, targetModule) {
    // FIX: Usar fecha local para evitar problemas de zona horaria (UTC vs Local)
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const today = new Date(localDate.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];

    // confirm eliminado para agilizar UX
    // if (!confirm(...)) return;

    let url = `reservas.html?action=new&client=${client}&service=${service}&voucher=${code}&date=${today}`;

    if (targetModule) {
        // Asegurar que el módulo es uno de los válidos (spa, suite, panacea, peluqueria, vip, hotel)
        const validModules = ['spa', 'suite', 'panacea', 'vip', 'peluqueria', 'hotel'];
        const normalizedModule = targetModule.toLowerCase().trim();

        if (validModules.includes(normalizedModule)) {
            if (normalizedModule === 'hotel') {
                url = `../gestion-Salones/restaurante.html?action=new&client=${client}&service=${service}&voucher=${code}&date=${today}`;
            } else {
                url += `&type=${normalizedModule}`;
            }
        } else if (normalizedModule.includes('alojamiento') || normalizedModule.includes('restaurante')) {
            // Si el espacio incluye restaurante o alojamiento, redirigir a hotel externo
            url = `../gestion-Salones/restaurante.html?action=new&client=${client}&service=${service}&voucher=${code}&date=${today}`;
        }
    }

    window.location.href = url;
}

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

        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const row of rows) {
            try {
                // Mapear campos
                const mapped = {};
                for (const [excelCol, fieldName] of Object.entries(columnMap)) {
                    if (row[excelCol] !== undefined && row[excelCol] !== '') {
                        mapped[fieldName] = row[excelCol];
                    }
                }

                // Validar datos mínimos
                if (!mapped.order_number && !mapped.order_id) {
                    console.warn("Fila sin número de pedido:", row);
                    skipped++;
                    continue;
                }

                // Generar código de bono
                const bonoCode = `WC${mapped.order_number || mapped.order_id}`;

                // Verificar si ya existe
                const existing = await db.collection('bonos').doc(bonoCode).get();
                if (existing.exists) {
                    console.log("Bono ya existe:", bonoCode);
                    skipped++;
                    continue;
                }

                // Calcular cliente
                const clientName = [mapped.nombre || '', mapped.apellidos || ''].filter(Boolean).join(' ').trim();

                // Parsear fecha
                let fechaCompra = null;
                if (mapped.fecha) {
                    const d = new Date(mapped.fecha);
                    if (!isNaN(d.getTime())) {
                        fechaCompra = d.toISOString().split('T')[0];
                    }
                }

                // Detectar sesiones al importar
                const detected = detectSessions(mapped);

                // Crear documento del bono
                const bonoData = {
                    bono: bonoCode,
                    order_id: String(mapped.order_id || mapped.order_number || ''),
                    producto: mapped.producto || 'Producto WooCommerce',
                    product_id: mapped.product_id ? String(mapped.product_id) : null,
                    sku: mapped.sku || null,
                    descripcion: mapped.descripcion || '',
                    categoria: mapped.categoria || '',
                    cliente: clientName || 'Cliente WooCommerce',
                    email: mapped.email || mapped.email_billing || '',
                    telefono: mapped.telefono || '',
                    importe: parseFloat(String(mapped.importe || mapped.total_pedido || '0').replace(',', '.')) || 0,
                    cantidad: parseInt(mapped.cantidad) || 1,
                    fecha: fechaCompra || new Date().toISOString().split('T')[0],
                    nota_cliente: mapped.nota_cliente || '',
                    origen: 'woocommerce-excel',
                    status: mapOrderStatus(mapped.order_status),
                    sesiones_usadas: 0,
                    sesiones_totales: detected.total,
                    pax_por_sesion: detected.paxPerSession,
                    fecha_validez: null,
                    createdAt: new Date().toISOString(),
                    importedAt: new Date().toISOString()
                };

                await db.collection('spa_vouchers').doc(bonoCode).set(bonoData);
                imported++;
                console.log("✅ Importado:", bonoCode, bonoData.producto);

            } catch (rowErr) {
                console.error("Error en fila:", rowErr, row);
                errors++;
            }
        }

        showToast(`Importación completada: ${imported} nuevos, ${skipped} omitidos, ${errors} errores`, imported > 0 ? "success" : "info");

        // Recargar bonos
        if (imported > 0) {
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
