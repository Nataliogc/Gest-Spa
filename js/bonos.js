// bonos.js - Lógica de Gestión de Bonos
// Versión Consolidada con Carrito, Reservas y Utilidades Locales
console.log('[BONOS.JS] ✅ Loaded at:', new Date().toISOString(), '- Build: ID-First-Matching-v2');

// Estado local específico para Bonos
const state = {
    bonos: [],
    catalogProducts: [], // Para el selector de venta local
    complementos: [], // Extras cargados
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

    // Check for pending restaurant reservations waiting in localStorage
    processPendingVoucherReservations();

    // NEW: Listen for reservation completion messages from restaurant window
    // NEW: Listen for reservation completion messages from restaurant window (Cross-Window Communication)
    window.addEventListener('message', async (event) => {
        if (event.data && (event.data.type === 'RESERVATION_COMPLETED' || event.data.type === 'RESTAURANT_RESERVATION_CREATED')) {
            console.log('[BONOS] Received reservation completion message:', event.data);

            const { code, voucher } = event.data;
            const finalCode = code || voucher;

            if (!finalCode) {
                console.warn('[BONOS] No voucher code in message, checking all pending reservations.');
            } else {
                showToast(`✅ Reserva confirmada para ${finalCode}. Actualizando...`, 'success');
            }

            // CRITICAL: The bridge script stores the reservation in localStorage.
            // We call processPendingVoucherReservations to handle the Firestore update.
            console.log('[BONOS] Triggering pending reservation processing...');
            await processPendingVoucherReservations();

            // Additional insurance: if a code was provided, sync that specific voucher
            if (finalCode) {
                await syncSingleVoucher(finalCode);
                // Dispatch event to refresh UI components (including the modal)
                window.dispatchEvent(new CustomEvent('vouchers-updated', { detail: { code: finalCode, source: 'message-integration' } }));
            }
        }
    });

    // NEW: Handle global vouchers-updated event
    window.addEventListener('vouchers-updated', (e) => {
        console.log('[BONOS] vouchers-updated event received:', e.detail);
        cargarBonos();

        // Also refresh open modal if it's the same voucher
        const openCode = document.querySelector('#vm-title-code')?.textContent;
        const codeUpdated = e.detail?.code;
        if (openCode && (!codeUpdated || openCode.includes(codeUpdated))) {
            console.log('[BONOS] Refreshing open modal...');
            openVoucherManagement(openCode);
        }
    });

    // NEW: Check for pending reservations when window gains focus
    window.addEventListener('focus', () => {
        console.log('[BONOS] Window focused, checking for pending reservations...');
        processPendingVoucherReservations();
    });

    // Load data from DB
    cargarBonos();
}

// === PAYMENT BLOCK MODAL HELPERS ===
function closePaymentBlockModal() {
    const modal = document.getElementById('paymentBlockModal');
    if (modal) modal.style.display = 'none';
    window._pendingReservation = null;
}

function openPaymentFromBlock() {
    closePaymentBlockModal();
    if (typeof SpaPaymentControl !== 'undefined') {
        SpaPaymentControl.openPaymentModal();
    }
}

async function continueWithoutPaymentFromBlock() {
    const pending = window._pendingReservation;
    if (!pending) {
        closePaymentBlockModal();
        return;
    }

    if (!confirm('⚠️ ¿Continuar sin cobrar?\\n\\nEl servicio quedará marcado como PENDIENTE DE COBRO.')) {
        return;
    }

    // Mark voucher as pending_before_service
    if (typeof SpaPaymentControl !== 'undefined') {
        const voucherObj = state.bonos.find(b => b.bono === pending.code || b.codigo === pending.code);
        const voucherId = voucherObj?.id || pending.code;
        const collection = (voucherObj?.origen || '').toLowerCase().includes('woo') ? 'woo_sales' : 'local_sales';

        await SpaPaymentControl.continueWithoutPayment(voucherId, { collection, usuario: 'recepcion' });
    }

    closePaymentBlockModal();

    // Proceed with reservation
    const { client, service, code, space, pax } = pending;
    window._pendingReservation = null;

    // Direct call - skip payment check since we just approved
    if (!confirm(`¿Ir al calendario para reservar '${service}' para ${client}?`)) return;

    let type = 'spa';
    const lowerService = (service || '').toLowerCase();
    if (lowerService.includes('masaje') || lowerService.includes('tratamiento') || lowerService.includes('ritual')) {
        type = 'panacea';
    } else if (lowerService.includes('suite')) {
        type = 'suite';
    }

    const url = `reservas.html?type=${type}&action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;
    window.open(url, '_blank');
}
// === END PAYMENT BLOCK MODAL HELPERS ===

// Process pending restaurant reservations stored in localStorage by the bridge script
async function processPendingVoucherReservations() {
    const pendingKey = 'pendingVoucherReservations';
    let pending = [];
    try {
        const stored = localStorage.getItem('pendingVoucherReservations');
        pending = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('[BONOS] Error parsing pending reservations:', e);
    }

    console.log(`[BONOS] Checking pending voucher reservations... Found: ${pending.length}`);

    if (!pending || pending.length === 0) return;

    const processed = [];
    for (const reservation of pending) {
        try {
            const { voucherCode, serviceName, reservationId, timestamp, client, pax } = reservation;

            if (!voucherCode) continue;

            console.log(`[BONOS] Processing pending reservation for voucher ${voucherCode}...`);

            // ALWAYS fetch fresh from Firestore to ensure desglosados are loaded
            let voucher = null;
            let docId = voucherCode;

            try {
                // First try by document ID
                let doc = await db.collection('spa_vouchers').doc(voucherCode).get();

                // If doc exists but has no desglosados, try querying by 'bono' field
                if (!doc.exists || !(doc.data()?.items_desglosados?.length > 0 || doc.data()?.desglosados?.length > 0)) {
                    console.log(`[BONOS] Doc ID lookup failed or empty, trying query by 'bono' field...`);

                    const querySnap = await db.collection('spa_vouchers')
                        .where('bono', '==', voucherCode)
                        .limit(1)
                        .get();

                    if (!querySnap.empty) {
                        doc = querySnap.docs[0];
                        docId = doc.id;
                        console.log(`[BONOS] Found voucher by 'bono' field query. DocId: ${docId}`);
                    }
                }

                if (doc.exists || doc.data) {
                    const data = typeof doc.data === 'function' ? doc.data() : doc.data;
                    voucher = { ...data, bono: voucherCode, _docId: docId };
                }
            } catch (fsErr) {
                console.warn(`[BONOS] Firestore fetch failed, trying local state...`, fsErr);
                voucher = state.bonos.find(b => b.bono === voucherCode || b.codigo === voucherCode);
            }

            if (!voucher) {
                console.warn(`[BONOS] Voucher ${voucherCode} not found, skipping...`);
                processed.push(reservation); // Mark as processed to avoid infinite loop
                continue;
            }

            // Normalize for consistent mapping
            const v = normalizeVoucher(voucher);
            let items = v.items || [];
            let updated = false;
            const serviceNorm = (serviceName || 'restaurante').toLowerCase();

            console.log(`[BONOS] Searching for restaurant item. Service: '${serviceNorm}'. Items count:`, items.length);

            for (let i = 0; i < items.length; i++) {
                const itemName = (items[i].name || '').toLowerCase();
                const itemUsed = items[i].used || 0;
                const itemTotal = items[i].sessions || 1;

                console.log(`[BONOS] Testing match: Item[${i}]='${itemName}' (Used:${itemUsed}/${itemTotal}) vs Service='${serviceNorm}'`);

                // Match restaurant services - broadened conditions
                const isRestaurantMatch =
                    itemName.includes('restaurante') ||
                    itemName.includes('menú') ||
                    itemName.includes('menu') ||
                    itemName.includes('rest') ||
                    serviceNorm.includes(itemName) ||
                    itemName.includes(serviceNorm) ||
                    (serviceNorm.includes('restaurante') && itemName.includes('restaurante')) ||
                    (serviceNorm.includes('menu') && itemName.includes('menu'));

                if (isRestaurantMatch) {
                    console.log(`[BONOS] Found restaurant match for item: '${items[i].name}'`);
                    if (itemUsed < itemTotal) {
                        // Update both field names for compatibility
                        items[i].used = itemUsed + 1;
                        items[i].usadas = items[i].used;
                        items[i].lastReservationId = reservationId;
                        items[i].lastReservationDate = timestamp;
                        updated = true;
                        console.log(`[BONOS] SUCCESS: Incremented usage for '${items[i].name}': ${itemUsed} -> ${items[i].used}`);
                        break;
                    } else {
                        console.log(`[BONOS] Item '${items[i].name}' is already complete (${itemUsed}/${itemTotal})`);
                    }
                }
            }

            if (updated) {
                // Save voucher update to Firestore
                const updateDocId = voucher._docId || voucherCode;
                const totalUsed = items.reduce((sum, item) => sum + (item.used || 0), 0);

                // Calculate final status for persistence
                const finalV = normalizeVoucher({ ...voucher, items_desglosados: items, sesiones_usadas: totalUsed });
                const finalStatus = finalV.effectivelyCompleted ? 'completed' : 'partially';

                console.log(`[BONOS] Updating Firestore doc ${updateDocId}. New total usado: ${totalUsed}, estado: ${finalStatus}`);

                await db.collection('spa_vouchers').doc(updateDocId).update({
                    items_desglosados: items,
                    sesiones_usadas: totalUsed,
                    estado: finalStatus,
                    updatedAt: new Date().toISOString()
                });

                // Update local storage
                if (window.apiLocal) {
                    await apiLocal.saveBono({ ...voucher, items_desglosados: items, sesiones_usadas: totalUsed, estado: finalStatus, syncStatus: 'synced' });
                }

                // Create a reservation record in reservas_restaurante for history
                const resDate = new Date(timestamp);
                const resTime = resDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                const reservaRecord = {
                    bono: voucherCode,
                    origen: 'bono',
                    cliente: client || voucher.cliente || '',
                    nombre: client || voucher.cliente || '',
                    telefono: voucher.telefono || '',
                    pax: parseInt(pax) || (voucher.pax || 1),
                    fecha: resDate.toISOString().split('T')[0],
                    hora: resTime,
                    servicio: serviceName || 'Menú en Restaurante',
                    status: 'confirmada',
                    createdAt: timestamp,
                    external_id: reservationId,
                    notes: 'Reserva desde bono de restaurante'
                };

                console.log(`[BONOS] Creating history record in reservas_restaurante:`, reservaRecord);

                try {
                    await db.collection('reservas_restaurante').add(reservaRecord);
                } catch (histErr) {
                    console.warn('[BONOS] Could not create history record:', histErr);
                }

                showToast(`✅ Bono ${voucherCode} actualizado con reserva de restaurante`, 'success');

                // Dispatch targeted event
                window.dispatchEvent(new CustomEvent('vouchers-updated', { detail: { code: voucherCode, source: 'pending-item-process' } }));
            } else {
                console.warn(`[BONOS] FAILED to match any item for '${serviceName}' in voucher ${voucherCode}`);
            }

            processed.push(reservation);

        } catch (err) {
            console.error('[BONOS] Error processing pending reservation:', err);
            processed.push(reservation);
        }
    }

    // Remove processed reservations from localStorage
    if (processed.length > 0) {
        const remaining = pending.filter(p => !processed.some(
            pr => pr.voucherCode === p.voucherCode && pr.reservationId === p.reservationId
        ));
        localStorage.setItem(pendingKey, JSON.stringify(remaining));
        console.log(`[BONOS] Cleanup: Processed ${processed.length} pending reservations, ${remaining.length} remaining in storage`);
    }
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
                // NIVEL 1: Código exacto de bono (LOC-YYYY-XXXX, BONOXXXX o exc.Loc XXXX) → 1 lectura
                // Regex ampliada para incluir exc.Loc y variantes con puntos/espacios
                const isVoucherCode = /^(LOC-\d{4}-\d+|BONO\d+|EXC\.?LOC[-\s]*\d+)$/i.test(searchTerm.toUpperCase());

                if (isVoucherCode) {
                    searchVoucherByCode(searchTerm); // Pasar original para mantener formato si importa

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

    // Phone Format Listeners
    const phoneInputs = ["lv-phone", "vm-telefono", "av-telefono"];
    phoneInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", () => formatPhoneNumber(input));
            // Format initial values
            formatPhoneNumber(input);
        }
    });

}

function formatPhoneNumber(input) {
    if (!input) return;
    let v = input.value.replace(/\D/g, '').substring(0, 9);
    if (v.length > 6) {
        input.value = v.slice(0, 3) + ' ' + v.slice(3, 6) + ' ' + v.slice(6);
    } else if (v.length > 3) {
        input.value = v.slice(0, 3) + ' ' + v.slice(3);
    } else {
        input.value = v;
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
    let vId = voucher.variation_id;
    let pId = voucher.product_id;

    // FALLBACK: Look into items_desglosados if main ID is missing
    if (!vId && !pId && voucher.items_desglosados && voucher.items_desglosados.length === 1) {
        vId = voucher.items_desglosados[0].variation_id;
        pId = voucher.items_desglosados[0].product_id || voucher.items_desglosados[0].wc_id || voucher.items_desglosados[0].id;
    }

    if (vId || pId) {
        const vIdStr = vId ? String(vId).trim() : '';
        const pIdStr = pId ? String(pId).trim() : '';

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
    match = state.catalogProducts.find(p => (p.nombre || '').toLowerCase() === productName);
    if (match) return match;

    // Partial match candidates
    const candidates = state.catalogProducts.filter(p => {
        if (!p.nombre) return false;
        const lowerName = p.nombre.toLowerCase();
        return productName.includes(lowerName) || lowerName.includes(productName);
    });

    if (candidates.length === 0) return null;

    // 3. PRIORIDAD: Buscar un producto "Base" que sea divisor del precio del bono
    // (Ej: Bono de 50€ para "Circuito SPA" que vale 25€ -> El producto base es mejor que un pack aleatorio)
    const nameParts = productName.split("-").map(s => s.trim());
    const baseCandidates = candidates.filter(p => {
        if (!p.nombre) return false;
        const lowerName = p.nombre.toLowerCase();
        return nameParts.some(part => part === lowerName);
    });

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
        const exact = state.masterItems.find(i => (i.name || '').toLowerCase().trim() === nameLower);
        if (exact && exact.space) return exact.space;

        // Normalized match (ignore spaces/symbols)
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const targetNorm = normalize(nameLower);
        const match = state.masterItems.find(i => normalize(i.name) === targetNorm);
        if (match && match.space) return match.space;
    }

    // 2. Fallback to Catalog
    const catalogItem = state.catalogProducts.find(p => (p.nombre || '').toLowerCase().trim() === nameLower);
    if (catalogItem && catalogItem.espacio) return catalogItem.espacio;

    // 3. Fallback to implicit logic (legacy)
    if (nameLower.includes('spa')) return 'spa';
    if (nameLower.includes('hotel') || nameLower.includes('alojamiento')) return 'hotel';
    if (nameLower.includes('restaurante') || nameLower.includes('menú') || nameLower.includes('menu') || nameLower.includes('comida') || nameLower.includes('cena')) return 'Restaurante';

    return '';
}

// Helper para redirección a gestión de restaurante
async function openRestauranteFromVoucher(client, service, code, space, pax, phone) {
    // Intentamos detectar el nombre del módulo (gestion-Salones o mesachef)
    const base = (typeof getBaseURL === 'function') ? getBaseURL('mesachef') : '../gestion-Salones/';
    const basePath = `${base}restaurante.html`;

    const cleanClient = (client || '').trim();
    const cleanBono = (code || '').trim();

    // Detectar Hotel Context para Cumbria
    let hotelContext = 'Guadiana';
    const config = spaConfigState.spaConfig || {};
    const urlCheck = config.wc_url && config.wc_url.toLowerCase().includes('cumbria');
    const templateCheck = config.whatsappTemplate && config.whatsappTemplate.toLowerCase().includes('cumbria');
    if (urlCheck || templateCheck) {
        hotelContext = 'Cumbria';
    }

    const params = new URLSearchParams({
        client: cleanClient,
        service: service || 'Restaurante',
        voucher: cleanBono,
        space: space || 'rest',
        pax: pax || 1,
        phone: phone || '',
        hotel: hotelContext,
        source: 'bono'
    });

    const finalUrl = `${basePath}?${params.toString()}`;
    console.log(`[REDIRECT] Abriendo restaurante: ${finalUrl}`);

    if (confirm(`¿Ir al calendario para reservar '${service}' para ${cleanClient}?`)) {
        window.open(finalUrl, '_blank');
    }
}

// Helper para redirección
async function goToReservation(client, service, code, space, pax) {
    service = decodeURIComponent(service).trim();
    client = decodeURIComponent(client).trim();
    code = decodeURIComponent(code).trim();
    space = decodeURIComponent(space || '').trim();
    // pax is usually a number or unencoded string, but safe to decode if string
    if (typeof pax === 'string') pax = decodeURIComponent(pax).trim();

    // === PAYMENT CONTROL CHECK ===
    const voucherForPayment = state.bonos.find(b => b.bono === code || b.codigo === code);
    if (voucherForPayment && typeof SpaPaymentControl !== 'undefined') {
        const paymentCheck = SpaPaymentControl.canStartService(voucherForPayment);
        if (!paymentCheck.allowed) {
            // Show payment block modal
            window._pendingReservation = { client, service, code, space, pax };
            const amountEl = document.getElementById('payment-block-amount');
            if (amountEl) amountEl.textContent = `Pendiente: ${paymentCheck.pendingAmount.toFixed(2)}€`;
            const modal = document.getElementById('paymentBlockModal');
            if (modal) modal.style.display = 'flex';
            return; // Block reservation until payment resolved
        }
    }
    // === END PAYMENT CONTROL ===

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

    let masterItem = state.masterItems.find(i => (i.name || '').toLowerCase().trim() === serviceNorm);

    if (masterItem) debugMsg += `Match Exacto: SI (${masterItem.name})\n`;
    else debugMsg += `Match Exacto: NO\n`;

    if (!masterItem) {
        masterItem = state.masterItems.find(i => serviceNorm.includes((i.name || '').toLowerCase().trim()));
        if (masterItem) debugMsg += `Match Includes (Service -> Master): SI (${masterItem.name})\n`;
    }

    if (!masterItem) {
        masterItem = state.masterItems.find(i => (i.name || '').toLowerCase().trim().includes(serviceNorm));
        if (masterItem) debugMsg += `Match Includes (Master -> Service): SI (${masterItem.name})\n`;
    }

    // alert(debugMsg);

    // Default module
    let type = 'spa';

    if (masterItem && masterItem.space) {
        debugMsg += `Space Config: ${masterItem.space}\n`;
        // Map common space names to URL types if needed, or use directly if they match
        // Standardizing: 'sala panacea' -> 'panacea', 'suite spa' -> 'suite', etc.
        const spaceLower = (masterItem.space || '').toLowerCase();

        if (spaceLower.includes('panacea')) type = 'panacea';
        else if (spaceLower.includes('suite')) type = 'suite';
        else if (spaceLower.includes('vip')) type = 'panacea';
        else if (spaceLower.includes('peluqueria') || spaceLower.includes('estetica')) type = 'peluqueria';
        else if (spaceLower.includes('hotel') || spaceLower.includes('restaurante') || spaceLower.includes('alojamiento') || spaceLower === 'rest') type = 'hotel';
        else type = 'spa';

        console.log(`Smart Redirect: Item '${service}' matched to space '${masterItem.space}' -> Module '${type}'`);
    } else {
        const lowerService = (service || '').toLowerCase().trim();
        // Try to find in catalog to check category/space property there
        let prod = state.catalogProducts.find(p => (p.nombre || '').toLowerCase() === lowerService);
        if (!prod) {
            prod = state.catalogProducts.find(p => {
                if (!p.nombre) return false;
                const pNameLower = p.nombre.toLowerCase();
                return pNameLower.includes(lowerService) || lowerService.includes(pNameLower);
            });
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

    // Si es hotel/restaurante, redirigir al proyecto independiente (gestion-Salones)
    if (type === 'hotel' || type === 'restaurante' || type === 'rest' || (type || '').toLowerCase().includes('restaurante') || (type || '').toLowerCase() === 'rest') {
        // Find voucher object to get phone number
        const voucherObj = state.bonos.find(b => b.bono === code || b.codigo === code);
        const clientPhone = voucherObj ? voucherObj.telefono : '';
        // Use pax passed from button, fallback to voucher pax or 1
        const finalPax = pax || (voucherObj ? (voucherObj.pax || voucherObj.pax_adultos) : '1');

        await openRestauranteFromVoucher(client, service, code, type, finalPax, clientPhone);
        return;
    }

    let url = `reservas.html?type=${type}&action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;

    // fallback legacy Mesachef check removed as it is superseded by openRestauranteFromVoucher logic above

    // Open in new tab to preserve context
    window.open(url, '_blank');
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
                items_incluidos: Array.isArray(data.items_incluidos) ? data.items_incluidos : (typeof data.items_incluidos === 'string' && data.items_incluidos.includes(',') ? data.items_incluidos.split(',').map(s => s.trim()) : []),
                categoria: data.categoria || '',
                espacio: data.espacio || '',
                allowedSpaces: data.allowedSpaces || (data.espacio ? [data.espacio] : []), // Load or Migrate
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
 * Búsqueda inteligente para inputs puramente numéricos
 * Intenta adivinar si es un BONO (BONOXXXX), un LOC (LOC-YYYY-XXXX) o un exc.Loc
 */
async function searchVoucherByNumericInput(numStr) {
    if (!numStr) return;

    // 1. Intentar construir variantes comunes
    // Variante A: BONOXXXX
    const candidateBono = `BONO${numStr}`;

    // Variante B: LOC con año actual (LOC-202X-XXXX)
    const currentYear = new Date().getFullYear();
    const candidateLoc = `LOC-${currentYear}-${numStr}`;
    const candidateLocLastYear = `LOC-${currentYear - 1}-${numStr}`;

    // Variante C: Búsqueda textual amplia (último recurso)

    console.log(`[NUMERIC SEARCH] Probando variantes para "${numStr}":`, candidateBono, candidateLoc);

    // Mostrar feedback
    const tableBody = document.getElementById("vouchers-table-body");
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">
            <i class="fas fa-search fa-spin"></i> Buscando variante numérica <strong>${numStr}</strong>...
        </td></tr>`;
    }

    // Estrategia: Buscar primero por BONOXXXX (más probable si son cortos)
    // Si no, buscar por LOC actual
    // Si no, usar búsqueda textual general que busca en 'searchTokens' (incluye el número suelto)

    // 1. Buscar BONO...
    const bonoMatch = await searchVoucherByCodeInternal(candidateBono);
    if (bonoMatch) {
        finishSearch([bonoMatch]);
        return;
    }

    // 2. Buscar LOC actual...
    const locMatch = await searchVoucherByCodeInternal(candidateLoc);
    if (locMatch) { finishSearch([locMatch]); return; }

    // 2b. Buscar LOC año anterior...
    const locMatchLast = await searchVoucherByCodeInternal(candidateLocLastYear);
    if (locMatchLast) { finishSearch([locMatchLast]); return; }

    // 1b. INTENTO EXTRA: Buscar "bono7683" (minúscula) por si acaso
    const candidateBonoLower = `bono${numStr}`;
    const bonoMatchLower = await searchVoucherByCodeInternal(candidateBonoLower);
    if (bonoMatchLower) { finishSearch([bonoMatchLower]); return; }

    // 3. Fallback: Búsqueda textual por el número exacto
    // Esto llamará a Firestore con array-contains
    searchVouchersByText(numStr);
}

// Helper interno para reusar lógica de búsqueda exacta sin tocar DOM intermedio
async function searchVoucherByCodeInternal(code) {
    if (!code) return null;
    try {
        console.log(`[SEARCH INTERNAL] Buscando: ${code}`);

        // Local check
        if (window.apiLocal) {
            const local = await apiLocal.getBonoByCode(code);
            if (local) {
                console.log(`[SEARCH INTERNAL] Encontrado Local: ${code}`);
                return local;
            }
        }

        // Cloud check - STEP 1: Direct Doc ID
        if (window.db) {
            const docRef = db.collection("spa_vouchers").doc(code);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                console.log(`[SEARCH INTERNAL] Encontrado en Nube (ID directo): ${code}`);
                return { ...docSnap.data(), bono: code };
            }

            // Cloud check - STEP 2: Query by field 'bono' (Fallback if ID differs)
            // Solo si el código parece un ID válido (mayúsculas o números)
            console.log(`[SEARCH INTERNAL] No encontrado por ID, probando query campo 'bono' == ${code}`);
            const querySnap = await db.collection("spa_vouchers").where("bono", "==", code).limit(1).get();
            if (!querySnap.empty) {
                const doc = querySnap.docs[0];
                console.log(`[SEARCH INTERNAL] Encontrado en Nube (Query field): ${doc.id}`);
                return { ...doc.data(), bono: doc.id }; // Use actual ID
            }
        }
    } catch (e) { console.error(`[SEARCH ERROR] ${code}`, e); }
    return null;
}

function finishSearch(results) {
    state.bonos = results;
    state.isActiveSearch = true; // IMPORTANT: Bypass filters
    renderBonosFromState();
    updateCount();
    showToast(`Encontrado: ${results[0].bono}`, "success");
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

        // Helper para intentar leer varios formatos de ID
        const tryFetch = async (idCandidates) => {
            for (const id of idCandidates) {
                if (!id) continue;
                console.log(`[SEARCH] Probando ID: "${id}"...`);
                const docSnap = await db.collection("spa_vouchers").doc(id).get();
                if (docSnap.exists) return { ...docSnap.data(), bono: id };
            }
            return null;
        };

        // Generar candidatos de ID
        const candidates = [code];

        // Si parece un exc.Loc, normalizarlo al formato estándar 'exc.Loc 12345'
        // Esto ayuda si el usuario escribe 'excloc 12345' o 'EXC.LOC 12345'
        if (code.match(/^exc\.?loc/i)) {
            const number = code.match(/\d+/);
            if (number) {
                candidates.push(`exc.Loc ${number[0]}`); // Estándar
                candidates.push(`exc.Loc${number[0]}`); // Compacto
            }
        }

        const voucher = await tryFetch(candidates);

        if (voucher) {
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


        // LOGIC FIX: Prioritize Range Dropdown (monthsBack) if selected (Value != 0)
        // Only use Date Picker if Range is "Today" (0) or default.
        // This prevents the default "Today" in date picker from overriding the "Last Year" selection.

        let cutoffStr;

        if (monthsBack !== 0) {
            // Priority 1: User selected a specific period (Week, Month, Year)
            const cutoffDate = new Date();

            // Si es 0.25 (semana), calcular 7 días atrás
            if (monthsBack < 1) {
                const daysBack = Math.round(monthsBack * 30); // 0.25 * 30 ≈ 7 días
                cutoffDate.setDate(cutoffDate.getDate() - daysBack);
                console.log(`[OPTIMIZACIÓN] Cargando bonos desde: últimos ${daysBack} días (Prioridad Rango)`);
            } else {
                cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
                console.log(`[OPTIMIZACIÓN] Cargando bonos desde: últimos ${monthsBack} meses (Prioridad Rango)`);
            }
            cutoffStr = cutoffDate.toISOString().split('T')[0];

        } else if (datePickerValue) {
            // Priority 2: Use specific date from picker (only if Range is default/0)
            cutoffStr = datePickerValue;
            console.log(`[OPTIMIZACIÓN] Usando fecha del selector como filtro: >= ${cutoffStr}`);

        } else {
            // Priority 3: Default to Today-1
            const today = new Date();
            today.setDate(today.getDate() - 1); // MARGEN DE SEGURIDAD
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            cutoffStr = `${year}-${month}-${day}`;
            console.log(`[OPTIMIZACIÓN] Cargando bonos desde (Hoy-1): ${cutoffStr}`);
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
            data.id = doc.id; // CRITICAL: Save document ID for repairs
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
        // CHECK: Only try direct fetch if we are on the allowed origin (production)
        // otherwise CORS will block it and show an ugly error in console.
        const isProduction = window.location.origin === 'https://nataliogc.github.io';

        if (isProduction && typeof fetchBonosDirect === 'function') {
            try {
                console.log('[SYNC] Trying optimized endpoint (direct)...');
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
                // Fallthrough to next block
            }
        } else {
            console.log('[SYNC] Environment is local/dev, skipping direct fetch to avoid CORS errors.');
        }

        // Logic flow continuing to fallback...
        if (!usedOptimized) {
            // PRIORITY 2: Fall back to CORS proxy system
            if (typeof fetchBonosWithFallback === 'function') {
                shopVouchers = await fetchBonosWithFallback(10000);
            } else {
                // PRIORITY 3: Ultimate fallback - legacy method
                console.warn('[SYNC] No fallback functions available, using legacy method');
                const endpoint = getBonoEndpoint();
                const res = await fetch(endpoint);
                shopVouchers = await res.json();
            }
        }

        if (shopVouchers && shopVouchers.contents) {
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

        shopVouchers.forEach((b, idx) => {
            if (!b || typeof b !== 'object') return;

            // DEBUG EXTREMO PARA EL USUARIO (7683)
            if (b.bono && (b.bono.includes('7683') || b.bono.includes('7699'))) {
                console.log("=== DEBUG BONO TARGET RAW ===");
                console.log(JSON.stringify(b, null, 2));
                console.log("Has Billing?", !!b.billing);
                console.log("Prices:", {
                    precio: b.precio,
                    importe: b.importe,
                    total: b.total,
                    order_total: b.order_total,
                    line_total: b.line_total,
                    subtotal: b.subtotal,
                    item_total: b.item_total
                });
                console.log("===========================");
            }
            // Duplicate debug logging removed to clean up output
            // (The specific debug for 7683 is sufficient)

            // --- NORMALIZACIÓN DE DATOS (WooCommerce API / Custom Endpoint) ---
            // 1. Nested Billing Object
            if (b.billing && typeof b.billing === 'object') {
                const fName = b.billing.first_name || '';
                const lName = b.billing.last_name || '';
                if (!b.cliente) b.cliente = (fName + ' ' + lName).trim();

                if (!b.telefono && b.billing.phone) b.telefono = b.billing.phone;
                if (!b.email && b.billing.email) b.email = b.billing.email;
            }

            // 2. Flat Billing Keys (billing_first_name, etc) - Common in flat JSON exports
            if (!b.cliente) {
                const fName = b.billing_first_name || b.first_name || '';
                const lName = b.billing_last_name || b.last_name || '';
                const candidate = (fName + ' ' + lName).trim();
                if (candidate) b.cliente = candidate;
            }

            if (!b.telefono) b.telefono = b.billing_phone || b.phone || '';
            if (!b.email) b.email = b.billing_email || b.email || '';

            // 2.5 NORMALIZACIÓN DE FECHA (WooCommerce puede usar varios nombres)
            if (!b.fecha || b.fecha === '-') {
                b.fecha = b.fecha_compra || b.date_created || b.order_date || b.created_at || '';
                // Si es datetime, extraer solo la fecha
                if (b.fecha && b.fecha.includes(' ')) {
                    b.fecha = b.fecha.split(' ')[0];
                }
            }

            // Compatibility
            if (!b.nombre && b.cliente) b.nombre = b.cliente;

            // 2. FECHA DE COMPRA (Canonical)
            if (!b.purchase_date) {
                b.purchase_date = b.fecha || b.date_created || b.fecha_compra || (b.date_created_gmt ? b.date_created_gmt + 'Z' : null);
            }
            // Ensure consistency between legacy and new field
            if (b.purchase_date && !b.fecha) b.fecha = b.purchase_date;

            // 3. NORMALIZACIÓN DE PRECIO (WooCommerce usa varios nombres de campo)
            // Check all possible price field names
            let foundPrice = parseFloat(b.precio) || parseFloat(b.importe) || 0;

            if (foundPrice === 0) {
                // Try common WooCommerce field names
                // FIX: Prioritize NET totals (total, item_total, amount) over GROSS totals (line_total, subtotal)
                foundPrice = parseFloat(b.total) || parseFloat(b.item_total) ||
                    parseFloat(b.amount) || parseFloat(b.line_total) ||
                    parseFloat(b.subtotal) || parseFloat(b.order_total) ||
                    parseFloat(b.price) || parseFloat(b.value) ||
                    parseFloat(b.order_subtotal) || 0;
            }

            // Try line_items array (WooCommerce standard format)
            if (foundPrice === 0 && b.line_items && Array.isArray(b.line_items) && b.line_items.length > 0) {
                foundPrice = b.line_items.reduce((sum, item) => {
                    return sum + (parseFloat(item.total) || parseFloat(item.price) ||
                        parseFloat(item.subtotal) || 0);
                }, 0);
            }

            // Try nested structures (items_desglosados from optimized plugin)
            if (foundPrice === 0 && b.items_desglosados && Array.isArray(b.items_desglosados)) {
                foundPrice = b.items_desglosados.reduce((sum, item) => {
                    return sum + (parseFloat(item.precio) || parseFloat(item.price) ||
                        parseFloat(item.total) || parseFloat(item.line_total) || 0);
                }, 0);
            }

            // Distributive discount logic: If order has discount but items are gross
            const orderDiscount = parseFloat(b.discount_total) || 0;
            const orderTotal = parseFloat(b.order_total) || parseFloat(b.total) || 0;
            if (orderDiscount > 0 && orderTotal > 0 && foundPrice > orderTotal) {
                console.log(`[SYNC] Price mismatch for ${b.bono}: Items total (${foundPrice}) vs Order total (${orderTotal}). Using Order total (includes discounts).`);
                foundPrice = orderTotal;
            }

            if (foundPrice > 0) {
                b.precio = foundPrice;
                b.importe = foundPrice;
            }
            // ------------------------------------------------

            const code = (b.bono || '').trim(); // Trim to ensure unique key

            if (!groupedVouchers[code]) {
                // Primer encuentro
                groupedVouchers[code] = {
                    ...b,
                    bono: code,
                    items_desglosados: []
                };

                // Si ya viene desglosado (Plugin Optimizado v2+), usarlo
                if (b.items_desglosados && Array.isArray(b.items_desglosados) && b.items_desglosados.length > 0) {
                    groupedVouchers[code].items_desglosados = b.items_desglosados;
                    // El precio ya debería ser el correcto del pedido en el plugin optimizado
                } else {
                    // MODO LEGACY: Construir primera línea
                    groupedVouchers[code].items_desglosados.push({
                        name: b.producto,
                        price: parseFloat(b.precio || b.importe || 0),
                        product_id: b.product_id,
                        variation_id: b.variation_id,
                        sessions: 1,
                        pax: 1
                    });
                }
            } else {
                // Duplicado/Multi-línea detected: Fusionar
                const existing = groupedVouchers[code];

                // FIX: Si el existente YA era un bono completo (optimizado), IGNORAR duplicados de red/paginación
                if (existing.items_desglosados.length > 0 && b.items_desglosados && b.items_desglosados.length > 0) {
                    return;
                }

                // SÓLO FUSIONAR SI ESTAMOS EN MODO LEGACY (filas sueltas)
                const priceNew = parseFloat(b.precio || b.importe || 0);

                // DETECTION: Si el precio de la nueva línea es IGUAL al total que ya tenemos,
                // y se sospecha que es un volcado plano de WooCommerce (donde cada fila repite el Order Total),
                // NO sumamos el precio, solo añadimos el item.
                const isDoubleCountRisk = (priceNew === parseFloat(existing.precio));

                if (!isDoubleCountRisk) {
                    existing.precio = (parseFloat(existing.precio) || 0) + priceNew;
                    existing.importe = existing.precio;
                }

                // Añadir a items desglosados si no existe ya
                if (!existing.producto.includes(b.producto)) {
                    existing.producto = `${existing.producto} + ${b.producto}`;
                }

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
                // salvo que el usuario explícitamente lo fuerce (sync manual).
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
                    console.log(`[Sync] Saltando actualización de datos (Protección manual activa): ${b.bono}`);
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
    const productName = voucher.producto || voucher.nombre || '';
    const productId = voucher.product_id || null;
    const voucherPrice = parseFloat(voucher.importe) || parseFloat(voucher.precio) || 0;
    const quantity = parseInt(voucher.cantidad) || 0;

    if (!productName && !productId) return { total: 1, paxPerSession: 1 };
    const lower = (productName || '').toLowerCase().trim();

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
        catalogMatch = state.catalogProducts.find(p => (p.nombre || '').toLowerCase() === lower);
        if (!catalogMatch) {
            catalogMatch = state.catalogProducts.find(p => lower.includes((p.nombre || '').toLowerCase()));
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

        // --- LÓGICA DE RATIO POR PRECIO (DESACTIVADA POR SEGURIDAD) ---
        /* 
        BLOQUEO DEFINITIVO DEL BUG:
        Prohibido inferir sesiones extras basándose en el precio.
        El precio es soberano y no debe alterar la estructura del servicio.
        
        if (catalogMatch.precio > 0 && voucherPrice > 0) {
            const catalogPrice = parseFloat(catalogMatch.precio);
            const ratio = Math.round(voucherPrice / catalogPrice);
            // ... (Lógica peligrosa eliminada) ...
        } 
        */

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

// --- NORMALIZATION ---
/**
 * Normaliza un objeto bono para que tenga una estructura de datos consistente,
 * independientemente de su origen (Excel, WooCommerce, Firestore) o nombres de campos legacy.
 * @param {Object} v - El bono original
 * @returns {Object} - El bono normalizado
 */
function normalizeVoucher(v) {
    if (!v) return null;

    // 1. Unificar Desglose de Items
    const rawItems = v.items_desglosados || v.desglosados || [];
    const normalizedItems = rawItems.map(item => {
        const used = item.used ?? item.usadas ?? 0;
        const sessions = item.sessions ?? item.sesiones ?? item.total ?? 1;
        const pax = item.pax ?? (v.pax || v.pax_adultos || 1);
        const name = item.name || item.nombre || item.producto || '';
        const rawSpace = Array.isArray(item.space) ? item.space[0] : item.space;
        const space = (typeof rawSpace === 'string' ? rawSpace : '').toLowerCase();

        return {
            ...item,
            name,
            used,
            sessions,
            pax,
            space,
            isComplete: used >= sessions
        };
    });

    // 2. Calcular Totales
    const dbTotal = v.sesiones_totales || v.sesiones_total || (normalizedItems.length > 0 ? normalizedItems.reduce((sum, i) => sum + i.sessions, 0) : 1);
    const dbUsed = v.sesiones_usadas || (normalizedItems.length > 0 ? normalizedItems.reduce((sum, i) => sum + i.used, 0) : 0);

    // 3. Determinar Estado de Completado Real
    let effectivelyCompleted = false;
    if (normalizedItems.length > 0) {
        effectivelyCompleted = normalizedItems.every(i => i.isComplete);
    } else {
        effectivelyCompleted = dbUsed >= dbTotal && dbTotal > 0;
    }

    return {
        ...v,
        normalized: true,
        items: normalizedItems,
        totalSessions: dbTotal,
        usedSessions: dbUsed,
        effectivelyCompleted,
        isExpired: checkVoucherExpiry(v)
    };
}

// --- RENDER ---
function renderBonosFromState() {
    const tbody = document.getElementById("vouchers-table-body");
    if (!tbody) return;

    const searchTerm = document.getElementById("voucher-search").value.toLowerCase();
    const filterStatus = document.getElementById("voucher-filter").value;
    const filterDate = document.getElementById("voucher-date").value;
    const filterPayment = document.getElementById("filter-payment-status")?.value || '';

    // --- BOTÓN GLOBAL DE REPARACIÓN (Solo si hay basura en el estado) ---
    const repairBtn = document.getElementById("repair-vouchers-btn");
    if (repairBtn && state.bonos) {
        const hasGarbage = state.bonos.some(b => {
            const code = String(b.bono || b.codigo || '').trim();
            // Caso 1: Código corrupto
            if (code === '-' || code === '') return true;
            // Caso 2: Duplicado real (existe el número y existe el Tarj-número)
            const isNumeric = /^\d+$/.test(code);
            if (isNumeric) {
                const hasDuplicate = state.bonos.some(other => String(other.bono || other.codigo || '').trim() === `Tarj-${code}`);
                return hasDuplicate;
            }
            return false;
        });
        repairBtn.style.display = hasGarbage ? "inline-flex" : "none";
    }



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

            // DETECTAR BÚSQUEDA POR CÓDIGO DE BONO (contiene números)
            const isCodeSearch = /\d+/.test(searchTerm);
            const matchesBono = bonoStr.includes(searchTerm);

            // Si busca por código y hay coincidencia exacta, IGNORAR filtros de fecha/estado
            if (isCodeSearch && matchesBono) {
                return true; // Mostrar este bono sin aplicar filtros
            }

            if (!matchesTokens &&
                !clienteStr.includes(searchTerm) &&
                !bonoStr.includes(searchTerm) &&
                !emailStr.includes(searchTerm) &&
                !productoStr.includes(searchTerm) &&
                !telefonoStr.includes(searchTerm)) { // Added telefono
                return false;
            }
        }

        // Fecha (solo aplica si NO hay búsqueda por código)
        let dateMatch = true;
        if (filterDate && b.fecha) {
            dateMatch = String(b.fecha).startsWith(filterDate);
        }

        // Estado (solo aplica si NO hay búsqueda por código)
        let statusMatch = true;
        if (filterStatus !== 'all') {
            if (filterStatus === 'expired') {
                statusMatch = (b.estado === 'expired') || (b.estado === 'pending' && checkVoucherExpiry(b));
            } else if (filterStatus === 'pending') {
                // SOPORTE LEGACY: Aceptar 'activo' como 'pending'
                // MODIFICADO: Incluir también 'partially' (En uso) como Activo
                // EXCLUIR: anulados
                statusMatch = (b.estado === 'pending' || b.estado === 'activo' || b.estado === 'partially')
                    && b.estado !== 'anulado'
                    && !checkVoucherExpiry(b);
            } else if (filterStatus === 'anulado') {
                statusMatch = (b.estado === 'anulado');
            } else {
                statusMatch = (b.estado === filterStatus);
            }
        }

        return dateMatch && statusMatch;
    });

    // === PAYMENT FILTER ===
    if (filterPayment && typeof SpaPaymentControl !== 'undefined') {
        filtered = SpaPaymentControl.filterByPaymentStatus(filtered, filterPayment);
    }
    // === END PAYMENT FILTER ===


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
        const v = normalizeVoucher(b);

        let badgeClass = 'st-pending';
        let statusLabel = 'ACTIVO';

        // Determinar visualización basada en normalización
        // PRIORIDAD: Anulado primero (estado permanente)
        if (b.estado === 'anulado') {
            badgeClass = 'st-expired';
            statusLabel = '❌ ANULADO';
        } else if (v.effectivelyCompleted || b.estado === 'completed') {
            badgeClass = 'st-completed';
            statusLabel = 'CANJEADO';
        } else if (v.isExpired || b.estado === 'expired') {
            badgeClass = 'st-expired';
            statusLabel = 'CADUCADO';
        } else if (v.usedSessions > 0 || b.estado === 'partially') {
            badgeClass = 'st-partial';
            statusLabel = `PARCIAL ${v.usedSessions}/${v.totalSessions}`;
        }

        // Sugerencias de corrección (Mantenemos lógica UI legacy)
        const det = detectSessions(b);
        const dbTotal = b.sesiones_totales || b.sesiones_total || 1;
        const dbPax = b.pax_por_sesion || b.pax_sesion || 1;
        if (b.estado !== 'completed' && ((dbTotal === 1 && det.total > 1) || (dbPax === 1 && det.paxPerSession > 1))) {
            const label = det.total > 1 ? `${det.total} ses` : `${det.paxPerSession} pax`;
            statusLabel += ` <i class="fas fa-exclamation-triangle" title="Sugerencia: ${det.total} ses / ${det.paxPerSession} pax. Abre para corregir."></i> ${label}`;
        }


        // Confiamos en el estado explícito 'completed' - si fue marcado como completo, se muestra como completo
        if ((b.estado === 'pending' || b.estado === 'activo') && v.isExpired) {
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

        // Mejorar visualización del precio: Si es 0 o vacío, intentar mostrar el del catálogo (con multiplicador)
        let displayedPrice = parseFloat(b.importe) || 0;
        if (displayedPrice === 0 && catalogMatch) {
            const basePrice = parseFloat(catalogMatch.precio) || 0;
            const det = detectSessions(b);
            const basePax = parseInt(catalogMatch.personas || catalogMatch.pax || 1);
            const baseSessions = parseInt(catalogMatch.sesiones || 1);

            const paxRatio = det.paxPerSession / basePax;
            const sessionsRatio = det.total / baseSessions;

            displayedPrice = (basePrice * paxRatio * sessionsRatio).toFixed(2);
        }

        return `
        <tr>
            <td style="padding: 10px 5px;"><img src="${thumbUrl}" referrerpolicy="no-referrer" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;"></td>
            <td style="font-weight:600">${b.bono || '-'}</td>
            <td>${b.producto || '-'}</td>
            <td>${b.cliente || '-'}</td>
            <td>${formatDate(b.fecha || b.fecha_compra || b.date_created)}${expiryText}</td>
            <td style="font-weight:bold">${displayedPrice}€</td>
            <td><span class="st-badge ${badgeClass}">${statusLabel}</span></td>
            <td style="white-space: nowrap;">
                ${typeof SpaPaymentControl !== 'undefined' ? SpaPaymentControl.renderPaymentBadge(b) : ''}
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


// --- REUSEABLE BREAKDOWN LOGIC ---

/**
 * Resuelve el desglose de servicios de un bono basándose en el catálogo.
 * @param {Object} voucher - El bono (con producto, product_id, etc.)
 * @param {Array} catalog - state.catalogProducts
 * @param {Number} overrideTotal - Forzar número total de sesiones
 * @returns {Array} - Lista de items desglosados
 */
function resolveVoucherBreakdown(voucher, catalog = state.catalogProducts, overrideTotal = null) {
    if (!voucher || !catalog || catalog.length === 0) return [];

    const services = [];
    const primaryMatch = findCatalogProduct(voucher);
    const detResult = overrideTotal !== null ? { total: overrideTotal, paxPerSession: voucher.pax || 1 } : detectSessions(voucher);

    console.log('[RESOLVE] Producto:', voucher.producto || voucher.name, 'ID:', voucher.product_id);

    if (primaryMatch) {
        let sessionsCount = primaryMatch.sesiones || 1;
        const hasExplicitId = voucher.variation_id || voucher.product_id;

        // Si es una venta online confirmada por ID, confiamos en el catálogo
        if (hasExplicitId && primaryMatch.sesiones) {
            sessionsCount = primaryMatch.sesiones;
        } else if ((sessionsCount === 1 || sessionsCount === null) && detResult.total > 1) {
            sessionsCount = detResult.total;
        } else if (overrideTotal !== null) {
            sessionsCount = overrideTotal;
        }

        let paxCount = primaryMatch.pax || 1;
        if (hasExplicitId && primaryMatch.pax) {
            paxCount = primaryMatch.pax;
        } else if (paxCount === 1 && detResult.paxPerSession > 1) {
            paxCount = detResult.paxPerSession;
        }

        let itemsIncluidos = primaryMatch.items_incluidos || [];

        // ---------------------------------------------------------
        // IMPROVED AD-HOC PACK DETECTION
        // If catalog has 0 or 1 item, but the Name implies "A + B", trust the Name.
        // ---------------------------------------------------------
        const nameParts = (voucher.producto || "").split(/\s+\+\s+/).filter(s => s.trim().length > 2);
        const isSessionPattern = /\d+\s*\+\s*\d+/.test(voucher.producto); // Avoid "5+1" being treated as 2 services

        if (nameParts.length > 1 && itemsIncluidos.length <= 1 && !isSessionPattern) {
            console.log('[RESOLVE] Override: Detectado pack compuesto por nombre:', nameParts);
            itemsIncluidos = nameParts; // Override with split parts
        }

        // Detección de pack: Más de un item o marcado como tal
        const isPack = itemsIncluidos.length > 1 || (primaryMatch.categoria === 'pack_pareja' || primaryMatch.categoria === 'pack_hosteleria');

        if (itemsIncluidos.length > 0) {
            console.log('[RESOLVE] Desglosando pack:', primaryMatch.nombre, 'Items:', itemsIncluidos.length);

            const itemsCount = itemsIncluidos.length;
            // Si el bono tiene N sesiones y el pack tiene M items, repartimos. 
            // Normalmente para un pack, sessionsCount es el número de veces que se compró el pack.
            const multiplier = sessionsCount;

            itemsIncluidos.forEach(itemName => {
                const itemCatalog = catalog.find(p => {
                    if (!p.nombre) return false;
                    const pNameLower = p.nombre.toLowerCase().trim();
                    const iNameLower = (itemName || '').toLowerCase().trim();
                    return pNameLower === iNameLower || pNameLower.includes(iNameLower) || iNameLower.includes(pNameLower);
                });

                // Determine Space
                let detectedSpace = '';
                let detectedAllowed = [];

                if (itemCatalog) {
                    detectedSpace = itemCatalog.espacio || getSpaceForService(itemName) || '';
                    detectedAllowed = itemCatalog.allowedSpaces || (detectedSpace ? [detectedSpace] : []);
                } else {
                    detectedSpace = getSpaceForService(itemName) || primaryMatch.espacio || '';
                    detectedAllowed = (detectedSpace ? [detectedSpace] : []);
                    // Primary match might restrict space, so be careful if sticking 'Masaje' into 'Spa' space
                }

                services.push({
                    itemId: 'srv_' + Math.random().toString(36).substr(2, 9),
                    name: (itemName || "").trim(),
                    imagen: itemCatalog?.imagen || primaryMatch.imagen,
                    descripcion: itemCatalog?.descripcion || `Parte del pack: ${primaryMatch.nombre}`,
                    sessions: multiplier, // Cada item del pack se consume N veces
                    space: detectedSpace,
                    allowedSpaces: detectedAllowed,
                    used: 0,
                    status: 'pendiente',
                    validations: [],
                    precio: 0,
                    pax: paxCount,
                    wc_id: itemCatalog?.wc_id || null,
                    product_id: itemCatalog?.id || null,
                    parent_pack: primaryMatch.nombre
                });
            });
        } else {
            // CASO NORMAL (Servicio individual)
            const detectedSpace = getSpaceForService(primaryMatch.nombre) || primaryMatch.espacio || '';
            const detectedAllowed = primaryMatch.allowedSpaces || (detectedSpace ? [detectedSpace] : []);

            services.push({
                itemId: 'srv_' + Math.random().toString(36).substr(2, 9),
                name: primaryMatch.nombre,
                imagen: primaryMatch.imagen,
                descripcion: primaryMatch.descripcion || primaryMatch.incluye || '',
                sessions: sessionsCount,
                space: detectedSpace,
                allowedSpaces: detectedAllowed,
                used: 0,
                status: 'pendiente',
                validations: [],
                precio: primaryMatch.precio || 0,
                pax: paxCount,
                wc_id: primaryMatch.wc_id || null,
                product_id: primaryMatch.id || null
            });
        }
    } else {
        // FALLBACK: Si no hay match, crear un servicio genérico
        services.push({
            itemId: 'srv_' + Math.random().toString(36).substr(2, 9),
            name: voucher.producto || 'Servicio Desconocido',
            sessions: detResult.total || 1,
            space: '',
            used: 0,
            status: 'pendiente',
            validations: [],
            precio: voucher.importe || 0,
            pax: detResult.paxPerSession || 1,
            is_fallback: true
        });
    }
    return services;
}

async function openVoucherManagement(code) {
    // Mostrar modal inmediatamente para mejor sensación de carga
    const modal = document.getElementById("voucher-modal");
    if (modal) modal.style.display = "flex";

    const v = state.bonos.find(b => b.bono === code);
    if (!v) {
        if (modal) modal.style.display = "none";
        return;
    }

    const detected = detectSessions(v);

    document.getElementById("vm-title-code").textContent = code;
    document.getElementById("vm-code").value = code;
    document.getElementById("vm-cliente").value = v.cliente || '';
    document.getElementById("vm-email").value = v.email || '';
    document.getElementById("vm-telefono").value = v.telefono || '';
    if (document.getElementById("vm-telefono")) {
        formatPhoneNumber(document.getElementById("vm-telefono"));
    }
    document.getElementById("vm-producto").value = v.producto || '';
    // Fecha de Compra (Canonical: purchase_date)
    const displayDate = v.purchase_date || v.fecha || v.fecha_compra || v.date_created;
    if (displayDate) {
        document.getElementById('vm-fecha-compra-container').style.display = 'block';
        document.getElementById('vm-fecha-compra').value = formatDateToISO(displayDate);
    } else {
        document.getElementById('vm-fecha-compra-container').style.display = 'none';
    }

    // MANUAL DISCOUNT LOADING
    const discountInput = document.getElementById("vm-manual-discount");
    if (discountInput) {
        const existingDiscount = parseFloat(v.discount_percent_max) || parseFloat(v.discount_rate) || 0;
        discountInput.value = existingDiscount > 0 ? existingDiscount : '';

        // Live update listener
        discountInput.onkeyup = () => updatePriceBadgeCalculations(v);
        discountInput.onchange = () => updatePriceBadgeCalculations(v);
    }



    // --- INYECCIÓN BOTÓN REFRESH ---
    const headerTitle = document.getElementById("vm-title-code").parentNode; // H2 container
    if (headerTitle) {
        // Eliminar botón previo si existe
        const existingBtn = document.getElementById("vm-btn-refresh");
        if (existingBtn) existingBtn.remove();

        const refreshBtn = document.createElement("button");
        refreshBtn.id = "vm-btn-refresh";
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshBtn.className = "btn btn-sm btn-outline";
        refreshBtn.style.marginLeft = "10px";
        refreshBtn.style.border = "none";
        refreshBtn.style.color = "#94a3b8";
        refreshBtn.title = "Actualizar datos desde Nube/Tienda";
        refreshBtn.onclick = (e) => {
            e.stopPropagation();
            syncSingleVoucher(code);
        };
        headerTitle.appendChild(refreshBtn);
    }
    // -------------------------------

    // -------------------------------

    // === PAYMENT BLOCK RENDERING ===
    const paymentBlockEl = document.getElementById('vm-payment-block');
    if (paymentBlockEl && typeof SpaPaymentControl !== 'undefined') {
        // Determine collection based on origin
        const collection = (v.origen || '').toLowerCase().includes('woo') ? 'woo_sales' : 'local_sales';
        SpaPaymentControl._currentVoucherId = v.id || code;
        SpaPaymentControl._currentCollection = collection;
        paymentBlockEl.innerHTML = SpaPaymentControl.renderPaymentBlock(v);
    }
    // === END PAYMENT BLOCK ===

    // --- Vincular con Catálogo y Detectar Servicios ---
    const catalogInfo = document.getElementById("vm-catalog-info");


    // Usar items_desglosados si existe, si no, detectar del nombre
    let baseServices = [];

    // MEJORA: Verificar si items_desglosados es realmente un desglose o solo el nombre del producto
    // PERO: Si es local (importado), SIEMPRE confiamos en el desglose guardado
    // FIX: "Fantasía para dos" a veces se guarda mal (3 items con el nombre del pack). Forzar redetección si ocurre.
    // MEJORA: Verificar si items_desglosados es realmente un desglose o solo el nombre del producto
    const isBadFantasia = (v.producto || '').toLowerCase().match(/(fantasía para dos|sueño para dos)/) &&
        v.items_desglosados &&
        (v.items_desglosados.some(i => (i.name || '').toLowerCase().match(/(fantasía para dos|sueño para dos)/)) || v.items_desglosados.every(i => i.name === v.producto));

    const hasRealBreakdown = !isBadFantasia && v.items_desglosados && v.items_desglosados.length > 0 &&
        (v.origen === 'local' || !(v.items_desglosados.length === 1 && (v.items_desglosados[0].name === v.producto || v.items_desglosados[0].name === v.nombre)));

    if (hasRealBreakdown) {
        console.log('[BONO] Usando items_desglosados guardados:', v.items_desglosados.length, 'items');
        baseServices = v.items_desglosados;
    } else {
        console.log('[BONO] Detectando servicios automáticamente...');
        baseServices = resolveVoucherBreakdown(v);
    }

    // APLICAR ENRIQUECIMIENTO (Detectar espacios, IDs, etc.)
    const parentProduct = state.catalogProducts.find(p => {
        if (!p.nombre) return false;
        const lowerName = p.nombre.toLowerCase();
        const lowerVoucherProduct = (v.producto || '').toLowerCase();
        return lowerName === lowerVoucherProduct || lowerVoucherProduct.includes(lowerName);
    });
    const fallbackSpace = parentProduct?.espacio || '';

    state.editingVoucherItems = baseServices.map(item => {
        // Normalize name: trim, lowercase, collapse multiple spaces
        const itemName = (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const normalizedName = itemName.replace(/\s*-\s*\d+['"]?\s*(min|minutos)?/gi, '').trim();

        // PRIORITY 1: Match by IDs
        let catalogItem = null;
        if (item.variation_id || item.product_id || item.wc_id || item.id) {
            const vIdStr = item.variation_id ? String(item.variation_id).trim() : '';
            const pIdStr = item.product_id ? String(item.product_id).trim() : '';
            const wcIdStr = item.wc_id ? String(item.wc_id).trim() : '';
            const itemIdStr = item.id ? String(item.id).trim() : '';

            catalogItem = state.catalogProducts.find(p => {
                const catalogWcId = p.wc_id ? String(p.wc_id).trim() : '';
                const catalogFirestoreId = p.id || '';
                return (vIdStr && (catalogWcId === vIdStr || catalogFirestoreId === `wc-${vIdStr}`)) ||
                    (pIdStr && (catalogWcId === pIdStr || catalogFirestoreId === `wc-${pIdStr}`)) ||
                    (wcIdStr && catalogWcId === wcIdStr) ||
                    (itemIdStr && catalogFirestoreId === itemIdStr);
            });
        }

        // PRIORITY 2: Match by name
        if (!catalogItem) {
            catalogItem = state.catalogProducts.find(p => {
                if (!p.nombre) return false;
                const catalogName = p.nombre.trim().toLowerCase().replace(/\s+/g, ' ');
                const catalogNormalized = catalogName.replace(/\s*-\s*\d+['"]?\s*(min|minutos)?/gi, '').trim();
                return catalogName === itemName || catalogNormalized === normalizedName || catalogName.includes(normalizedName) || normalizedName.includes(catalogNormalized);
            });
        }

        // Force space detection if missing
        if (!item.space) {
            item.space = getSpaceForService(item.name) || catalogItem?.espacio || fallbackSpace || '';
        }

        // Asegurar IDs consistentes
        return {
            ...item,
            itemId: item.itemId || 'srv_' + Math.random().toString(36).substr(2, 9),
            used: item.used || 0,
            validations: item.validations || [],
            space: item.space,
            variation_id: item.variation_id || catalogItem?.wc_id || null,
            product_id: item.product_id || item.wc_id || catalogItem?.id || null,
            wc_id: item.wc_id || catalogItem?.wc_id || null,
            id: item.id || catalogItem?.id || null
        };
    });

    const detectedServices = state.editingVoucherItems;

    // Debug logging
    console.log("Bono:", v.bono, "Producto:", v.producto, "Servicios detectados:", detectedServices);

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
        const isPack = state.editingVoucherItems.some(i => i.parent_pack);

        if (state.editingVoucherItems.length > 0 || isEditable) {
            listDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                <div style="font-weight:700; color:#334155; font-size:0.75rem; text-transform:uppercase;">
                    ${isPack ? `<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; margin-right:6px; border:1px solid #fcd34d;">PACK</span>` : ''}
                    Items de Compra
                </div>
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
                const rawSpace = Array.isArray(item.space) ? item.space[0] : item.space;
                const spaceName = (typeof rawSpace === 'string' ? rawSpace : '') || 'No asignado';
                const itemName = item.name || item.nombre || item.producto || v.producto || 'Servicio sin nombre';

                // Fix object reference
                if (!item.name) item.name = itemName;

                const isAccommodation = spaceName.toLowerCase().includes('hotel') || itemName.toLowerCase().includes('alojamiento') || itemName.toLowerCase().includes('desayuno');
                const itemNameLower = itemName.toLowerCase();

                // === ENHANCED COMPLEMENT DETECTION ===
                // Detect by: tipo, codigo, espacio, or name matching common extras
                const complementKeywords = /(botella|cava|vino|champagne|champán|ramo|flores|fruta|bombones|chocolate|detalle|benjamín|benjamin|regalo|extra|accesorio|toalla|albornoz|amenities|spa kit)/i;
                const isComplement = item.tipo === 'complemento' ||
                    item.reservable === false ||
                    (item.codigo && item.codigo.startsWith('ext.')) ||
                    spaceName.toLowerCase() === 'complemento' ||
                    spaceName.toLowerCase() === 'extra' ||
                    itemNameLower.match(complementKeywords);

                // === SIMPLIFIED COMPLEMENT RENDERING ===
                // Complements don't need: sala, sesiones, pax, reservar button
                if (isComplement) {
                    let complementButton = '';
                    if (item.consumido) {
                        const consumidoFecha = item.consumido_fecha ? new Date(item.consumido_fecha).toLocaleDateString() : '';
                        const consumidoUsuario = item.consumido_usuario || '';
                        complementButton = `
                            <span style="font-size:0.7rem; color:#22c55e; font-weight:600; background:#dcfce7; padding:4px 10px; border-radius:4px;">
                                <i class="fas fa-check-circle"></i> Consumido ${consumidoFecha}${consumidoUsuario ? ` por ${consumidoUsuario}` : ''}
                            </span>
                        `;
                    } else {
                        complementButton = `
                            <button class="btn btn-sm" onclick="consumeComplement(${idx})"
                                style="padding:4px 12px; font-size:0.75rem; background:#f59e0b; color:#fff; border:none; border-radius:4px;">
                                <i class="fas fa-gift"></i> Consumir
                            </button>
                        `;
                    }

                    // Return simplified complement row - NO sala, NO sesiones, NO pax
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:${item.consumido ? '#fef3c7' : '#fffbeb'}; padding:10px 12px; margin-bottom:4px; border-radius:6px; border:1px solid ${item.consumido ? '#fcd34d' : '#fde68a'};">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i class="fas fa-gift" style="color:#f59e0b; font-size:1rem;"></i>
                                <div>
                                    <div style="font-size:0.85rem; font-weight:600; color:#92400e;">${item.name}</div>
                                    <div style="font-size:0.65rem; color:#b45309;">
                                        ${item.cantidad ? `${item.cantidad} unidad${item.cantidad > 1 ? 'es' : ''}` : '1 unidad'} · 
                                        <span style="font-style:italic;">Complemento (no reservable)</span>
                                    </div>
                                </div>
                            </div>
                            <div>${complementButton}</div>
                        </div>
                    `;
                }
                // === END COMPLEMENT RENDERING ===

                let buttonsHtml = '';

                if (isComplete) {
                    buttonsHtml = `
                        <button class="btn btn-sm" disabled
                            style="padding:2px 8px; font-size:0.7rem; background:#cbd5e1; color:#64748b; cursor:not-allowed; border:none; white-space:nowrap; border-radius:4px;">
                            <i class="fas fa-check-circle"></i> Completo
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
                    buttonsHtml = `
                        <button class="btn btn-sm"
                            onclick="goToReservation('${encodeURIComponent(v.cliente || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.name || '').replace(/'/g, "%27")}', '${encodeURIComponent(v.bono || v.codigo || '').replace(/'/g, "%27")}', '${encodeURIComponent(item.space || '').replace(/'/g, "%27")}', ${item.pax || 1})"
                            style="padding:2px 8px; font-size:0.7rem; background:#0ea5e9; color:#fff; border:none; border-radius:4px;">
                            <i class="fas fa-calendar-alt"></i> Reservar
                        </button>
                    `;

                    // Añadir botón de validación manual para Restaurante/Otros
                    if (spaceName.toLowerCase().includes('rest') || spaceName.toLowerCase().includes('hotel') || spaceName.toLowerCase().includes('comida')) {
                        buttonsHtml += `
                                <button class="btn btn-sm" onclick="validateManualConsumption(${idx})" title="Validar Manualmente (Generar Recibo)"
                                    style="padding:2px 8px; font-size:0.7rem; background:#64748b; color:#fff; border:none; border-radius:4px; margin-left:4px;">
                                    <i class="fas fa-file-invoice"></i>
                                </button>
                            `;
                    }
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
                                    <span style="font-size:0.65rem; color:#64748b;">${itemName.toLowerCase().includes('menú') || itemName.toLowerCase().includes('restaurante') ? 'pers.' : 'ses.'}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:2px;">
                                    <input type="number" value="${item.pax || 1}" onchange="updateVoucherItemPax(${idx}, this.value); this.parentElement.parentElement.parentElement.querySelector('button[onclick^=goToReservation]').setAttribute('onclick', \`goToReservation('\${encodeURIComponent('${v.cliente || ''}').replace(/'/g, "%27")}', '\${encodeURIComponent(state.editingVoucherItems[${idx}].name || '').replace(/'/g, "%27")}', '\${encodeURIComponent('${v.bono || v.codigo || ''}').replace(/'/g, "%27")}', '\${encodeURIComponent(state.editingVoucherItems[${idx}].space || '').replace(/'/g, "%27")}', \${this.value})\`);" 
                                        style="width:35px; padding:2px; font-size:0.7rem; border:1px solid #cbd5e1; border-radius:4px; text-align:center;">
                                    <span style="font-size:0.65rem; color:#64748b;">pax</span>
                                </div>
                                <div style="font-size:0.65rem; color:#64748b;">
                                    <i class="fas fa-map-marker-alt"></i> ${spaceName}
                                </div>
                            </div>
                            <div style="display:flex; gap:4px;">${buttonsHtml}</div>
                        </div>
                    </div > `;
                }

                return `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:${isComplete ? '#f0fdf4' : '#fff'}; padding:8px; margin-bottom:4px; border-radius:6px; border:1px solid ${isComplete ? '#86efac' : '#e2e8f0'}; gap:8px;">
                    <div style="display: flex; flex-direction: column; flex: 1; overflow:hidden; gap:2px;">
                        <div style="font-size:0.8rem; font-weight:600; color:#334155;">
                            ${item.name} 
                            <span style="font-size:0.65rem; color:#94a3b8; font-weight:400; margin-left:4px;">ID: ${item.wc_id || item.product_id || item.id || item.codigo || item.original_id || 'N/A'}</span>
                        </div>
                        <div style="font-size:0.65rem; color:#64748b;">
                            <i class="fas fa-map-marker-alt" style="margin-right:2px;"></i>${spaceName}
                            <span style="margin-left:8px; font-weight:600; color:${isComplete ? '#16a34a' : '#334155'};">
                                ${used}/${total} ${itemName.toLowerCase().includes('menú') || itemName.toLowerCase().includes('restaurante') ? 'personas' : 'sesiones'} · 👥 ${item.pax || 1}
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
                </div> `;
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
        // Actualizar el global para mantener consistencia
        const newTotal = state.editingVoucherItems.reduce((acc, curr) => acc + (curr.sessions || 1), 0);
        document.getElementById("vm-sesiones-total").value = newTotal;
        window.updatePriceBadge();
    };
    window.updateVoucherItemPax = (idx, val) => {
        state.editingVoucherItems[idx].pax = parseInt(val) || 1;
        // Actualizar el global para mantener consistencia (asumiendo que todos los items deben tener el mismo pax)
        document.getElementById("vm-pax-sesion").value = val;
        window.updatePriceBadge();
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

    // === CONSUME COMPLEMENT FUNCTION ===
    // Marks an extra/complement as consumed (no reservation needed)
    window.consumeComplement = async (idx) => {
        const item = state.editingVoucherItems[idx];
        if (!item) return;

        if (!confirm(`¿Marcar '${item.name}' como CONSUMIDO?`)) return;

        // Mark as consumed with timestamp and user
        item.consumido = true;
        const now = new Date();
        item.consumido_fecha = now.toISOString();
        item.consumido_usuario = 'recepcion'; // TODO: Get from auth

        // Create history record
        const code = document.getElementById("vm-code")?.value || '';
        const client = document.getElementById("vm-cliente")?.value || '';

        const record = {
            fecha: now.toISOString().split('T')[0],
            hora: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            cliente: client,
            servicio: item.name,
            bono: code,
            origen: 'complemento',
            estado: 'finalizada',
            notas: 'Consumo directo desde gestión de bonos',
            pax: item.pax || 1
        };

        try {
            await db.collection("reservas_complementos").add(record);
        } catch (e) {
            console.warn("Fallo persistencia complementos", e);
        }

        // Update UI immediately
        renderEditableBreakdown();

        // Save changes to Firestore
        await saveVoucherChanges();

        // Refresh history if function exists
        if (typeof renderVoucherHistory === 'function') {
            renderVoucherHistory(code);
        }

        alert('✅ Complemento marcado como consumido');
    };
    // === END CONSUME COMPLEMENT ===

    window.validateManualConsumption = async (idx) => {
        const item = state.editingVoucherItems[idx];
        if (!confirm(`¿Generar recibo de consumo manual para '${item.name}' ?\n\nEsto creará una reserva 'finalizada' en el historial.`)) return;

        // 1. Incrementar uso localmente
        item.used = (item.used || 0) + 1;

        // 2. Determinar colección
        let targetCollection = 'spa_reservations'; // Fallback
        let origenType = 'manual';
        const spaceLower = (item.space || '').toLowerCase();

        if (spaceLower.includes('rest') || spaceLower.includes('comida')) {
            targetCollection = 'reservas_restaurante';
            origenType = 'restaurante';
        } else if (spaceLower.includes('gim')) {
            targetCollection = 'reservas_gimnasio';
            origenType = 'gimnasio';
        } else if (spaceLower.includes('suite')) {
            targetCollection = 'reservas_suite';
            origenType = 'suite';
        } else if (spaceLower.includes('spa')) {
            targetCollection = 'reservas_spa';
            origenType = 'spa';
        }

        // 3. Crear registro
        const code = document.getElementById("vm-code").value || '';
        const client = document.getElementById("vm-cliente").value || '';

        const record = {
            fecha: new Date().toISOString().split('T')[0],
            hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            cliente: client,
            servicio: item.name,
            bono: code,
            origen: origenType,
            estado: 'finalizada',
            notas: 'Validación manual desde panel',
            pax: item.pax || 1,
            precio_total: 0 // Asumir 0 o precio del item si lo tuviéramos
        };

        try {
            await db.collection(targetCollection).add(record);
            alert("Recibo generado correctamente.");
        } catch (e) {
            console.error("Error generando recibo:", e);
            alert("Error al guardar el recibo: " + e.message);
        }

        // 4. Update UI
        const globalUsedInput = document.getElementById("vm-sesiones-usadas");
        if (globalUsedInput) {
            globalUsedInput.value = (parseInt(globalUsedInput.value) || 0) + 1;
        }

        renderEditableBreakdown();
        if (typeof renderVoucherHistory === 'function') {
            renderVoucherHistory(code);
        }
        await saveVoucherChanges();
    };


    // Nueva función para recalcular precio visualmente al cambiar pax o sesiones
    window.updatePriceBadge = () => {
        updatePriceBadgeCalculations(v);
    };

    // Función para sincronizar los PAX y Sesiones de los items internos con los campos globales
    window.updateBreakdownFromGlobalInputs = () => {
        const globalPax = parseInt(document.getElementById("vm-pax-sesion").value) || 1;
        const globalSessions = parseInt(document.getElementById("vm-sesiones-total").value) || 1;

        if (state.editingVoucherItems && state.editingVoucherItems.length > 0) {
            // 1. Sincronizar PAX para todos los items
            state.editingVoucherItems.forEach(item => {
                item.pax = globalPax;
            });

            // 2. Redistribuir Sesiones (Más balanceado)
            const itemCount = state.editingVoucherItems.length;
            if (itemCount === 1) {
                state.editingVoucherItems[0].sessions = globalSessions;
            } else {
                let remaining = globalSessions;
                state.editingVoucherItems.forEach((item, i) => {
                    const share = Math.floor(remaining / (itemCount - i));
                    item.sessions = Math.max(0, share);
                    remaining -= share;
                });
            }
        }

        // Refrescar visualmente los "muñecos" y datos
        renderEditableBreakdown();
        // También actualizar precio
        window.updatePriceBadge();
    };

    // Attach listeners for visual updates (Price and Breakdown)
    const paxInput = document.getElementById("vm-pax-sesion");
    if (paxInput) {
        paxInput.onchange = window.updateBreakdownFromGlobalInputs;
        paxInput.onkeyup = window.updateBreakdownFromGlobalInputs;
    }
    const sessionsInput = document.getElementById("vm-sesiones-total");
    if (sessionsInput) {
        sessionsInput.onchange = window.updateBreakdownFromGlobalInputs;
        sessionsInput.onkeyup = window.updateBreakdownFromGlobalInputs;
    }

    window.linkVoucherToCatalogProduct = () => {
        const searchVal = document.getElementById("vm-catalog-search").value;
        if (!searchVal) return;

        const product = state.catalogProducts.find(p => p.nombre === searchVal);
        if (product) {
            // Reemplazar o añadir items según el producto del catálogo
            const fakeVoucher = { ...v, producto: product.nombre, product_id: product.id };
            const newItems = resolveVoucherBreakdown(fakeVoucher);
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

            // PRESERVAR PRECIO ORIGINAL DE WOOCOMMERCE (NO sobrescribir con catálogo)
            // Solo usar precio del catálogo si el bono NO tiene precio
            const originalBonoPrice = parseFloat(v.importe) || parseFloat(v.precio) || 0;
            const priceBadge = document.getElementById("vm-cat-price");

            if (priceBadge) {
                if (originalBonoPrice > 0) {
                    // Mantener precio original del bono (WooCommerce)
                    priceBadge.textContent = originalBonoPrice + '€';
                } else {
                    // Solo si no hay precio original, usar el del catálogo
                    const basePrice = parseFloat(product.precio) || 0;
                    const basePax = parseInt(product.personas || product.pax || 1);
                    const ratio = totalPax / basePax;
                    const finalPrice = basePrice * ratio;
                    priceBadge.textContent = finalPrice.toFixed(2) + '€';
                }
            }

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
                    // 2. Space match (Multi-Space Aware)
                    let spaceMatch = false;
                    const allowed = item.allowedSpaces || (item.space ? [item.space] : []);

                    for (const rawS of allowed) {
                        const s = rawS.toLowerCase();

                        // Para Hotel, suele ser único item, así que es más seguro
                        if (s === 'hotel' && ((h.origen || '').toLowerCase().includes('hotel') || h._col === 'reservas_restaurante')) {
                            spaceMatch = true;
                        }

                        // FIX: Restaurant Matching Logic
                        const hSrv = (h.servicio || '').toLowerCase(); // DEFINE hSrv FIRST

                        // Allow match if collection is restaurant-related OR service name is clearly restaurant
                        const isRestCollection = ['reservas_restaurante', 'reservas_rest', 'reservas_menu', 'reservas', 'reservas_evento'].includes(h._col);
                        const isRestName = hSrv.includes('restaurante') || hSrv.includes('menu') || hSrv.includes('menú') || hSrv.includes('almuerzo') || hSrv.includes('cena');

                        // Check if ITEM is restaurant related (by THIS space OR by name)
                        const isItemRest = (s === 'restaurante' || s === 'rest' || s === 'restauracion') || iName.includes('restaurante') || iName.includes('menu') || iName.includes('menú');

                        if (isItemRest) {
                            if (isRestCollection || isRestName) spaceMatch = true;
                        }

                        // Para Spa/Masaje, confiamos en el nombre. 
                        // Solo si el item es MUY genérico (ej: "Bono Spa") habilitamos match por colección
                        // Evitamos match si es Restaurante
                        if (s === 'spa' && h._col === 'reservas_spa' && !isRestName) spaceMatch = true;

                        if (spaceMatch) break;
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
                        console.log(`[BONO] Auto - updated item '${item.name}' used -> ${computedUsed} `);
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

    // Calcule USED dynamically from items if DB is stale
    let suggestedUsed = detectedServices.reduce((sum, s) => sum + (s.used || 0), 0);
    // If DB says 0 but we found used items via history sync, use that
    let sesionesUsadas = v.sesiones_usadas || 0;
    if (sesionesUsadas < suggestedUsed) {
        sesionesUsadas = suggestedUsed;
    }
    document.getElementById("vm-sesiones-usadas").value = sesionesUsadas;

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
        else if (v.estado === 'completed') {
            // SI LA BASE DE DATOS DICE COMPLETADO PERO NO HAY USO: 
            // Probablemente sea un estado manual o de importación. Lo respetamos pero avisamos.
            displayStatus = 'completed';
        } else {
            displayStatus = 'pending';
        }
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

    // --- RENDER HISTORY (ROBUST) ---
    try {
        if (typeof renderVoucherHistory === 'function') {
            // Pass items_desglosados to show internal validations (like Accommodation)
            await renderVoucherHistory(code, v.items_desglosados || []);
        }
    } catch (hErr) {
        console.warn("[BONO] Warning rendering history:", hErr);
        // Don't block modal opening if history fails
    }
    // --------------------------------

    // Actualizar precio y breakdown visualmente al abrir
    window.updateBreakdownFromGlobalInputs();


}

function closeVoucherModal() {
    const modal = document.getElementById("voucher-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

async function saveVoucherChanges() {
    let btn, btnText, originalText;

    try {
        btn = document.getElementById("vm-save-btn");
        if (!btn) {
            console.error("[SAVE] Botón vm-save-btn no encontrado");
            showToast("Error: Botón de guardado no encontrado", "error");
            return;
        }

        btnText = btn.querySelector("span");
        if (!btnText) {
            console.error("[SAVE] Span del botón no encontrado");
            showToast("Error: Estructura del botón incorrecta", "error");
            return;
        }

        originalText = btnText.textContent;

        const codeEl = document.getElementById("vm-code");
        if (!codeEl) {
            console.error("[SAVE] Elemento vm-code no encontrado");
            showToast("Error: Código de bono no encontrado", "error");
            return;
        }
        const code = codeEl.value;
        if (!code) {
            showToast("Error: No hay código de bono", "error");
            return;
        }

        // Asegurar que los items del breakdown están sincronizados antes de guardar
        if (window.updateBreakdownFromGlobalInputs) window.updateBreakdownFromGlobalInputs();

        const getInputValue = (id, defaultValue = '') => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`[SAVE] Elemento DOM con ID '${id}' no encontrado. Usando valor por defecto: ${defaultValue}`);
                return defaultValue;
            }
            return el.value;
        };

        const updates = {
            cliente: getInputValue("vm-cliente"),
            email: getInputValue("vm-email"),
            telefono: getInputValue("vm-telefono"),
            fecha_validez: getInputValue("vm-fecha-validez"),
            sesiones_totales: parseInt(getInputValue("vm-sesiones-total", '1')) || 1,
            sesiones_usadas: parseInt(getInputValue("vm-sesiones-usadas", '0')) || 0,
            pax_por_sesion: parseInt(getInputValue("vm-pax-sesion", '1')) || 1,
            notas_internas: getInputValue("vm-notas"),
            producto: getInputValue("vm-producto"),
            notes: getInputValue("vm-notas"), // Alias
            items_desglosados: cleanUndefined(state.editingVoucherItems || []),
            manual_update: true
        };

        // VALIDATION: Mandatory Phone
        if (!updates.telefono || updates.telefono.trim() === '') {
            showToast("El teléfono es obligatorio para guardar", "warning");
            // Highlight field
            const phoneField = document.getElementById("vm-telefono");
            if (phoneField) {
                phoneField.style.borderColor = "red";
                phoneField.focus();
                setTimeout(() => phoneField.style.borderColor = "", 3000);
            }
            return; // Stop saving
        }

        // Guardar fecha de compra (Canonical: purchase_date)
        const fechaCompra = getInputValue("vm-fecha-compra");
        if (fechaCompra) {
            updates.fecha = fechaCompra;          // Legacy
            updates.purchase_date = fechaCompra; // Canonical
        }

        // MANUAL DISCOUNT PERSISTENCE
        const discountInput = document.getElementById("vm-manual-discount");
        if (discountInput) {
            const discountVal = parseFloat(discountInput.value) || 0;
            // Si el usuario introduce algo, lo guardamos. Si borra, guardamos 0 (o null)
            updates.discount_percent_max = discountVal;
        }

        // Get voucher from state to access variation_id and product_id
        const v = state.bonos.find(b => b.bono === code);

        // PRESERVE PRICE ON SAVE: 
        // We no longer auto-recalculate on every save because it was causing pack prices to multiply incorrectly.
        // If the user wants to update the price, they use the "Recalcular" button which is visible when out of sync.
        updates.importe = v ? (v.importe || v.precio || 0) : 0;
        updates.precio = updates.importe;
        console.log(`[SAVE] Preservando precio actual: ${updates.importe}€`);

        // Auto estado logic (Item-aware)
        // Priority: If Global Counters say Completed (Used >= Total), force Completed.
        const globalComplete = updates.sesiones_usadas >= updates.sesiones_totales && updates.sesiones_totales > 0;
        const globalPartial = updates.sesiones_usadas > 0;

        if (globalComplete) {
            updates.estado = 'completed';
        } else if (updates.items_desglosados && updates.items_desglosados.length > 0) {
            // PACK: Completo solo si TODOS los items están completos (y global no forzó completado)
            const allItemsComplete = updates.items_desglosados.every(item => (item.used || 0) >= (item.sessions || 1));
            const anyItemUsed = updates.items_desglosados.some(item => (item.used || 0) > 0);

            if (allItemsComplete) {
                updates.estado = 'completed';
            } else if (anyItemUsed) {
                updates.estado = 'partially';
            } else {
                updates.estado = (v && v.estado) ? v.estado : 'pending';
            }
        } else {
            // Simple/Legacy logic
            if (globalPartial) {
                updates.estado = 'partially';
            } else {
                updates.estado = (v && v.estado) ? v.estado : 'pending';
            }
        }

        btn.disabled = true;
        btnText.textContent = "GUARDANDO...";

        const bonoData = { ...updates, bono: code };
        const cleanBonoData = cleanUndefined(bonoData);

        // 1. GUARDADO LOCAL INMEDIATO
        if (window.apiLocal) {
            await apiLocal.saveBono({ ...cleanBonoData, syncStatus: 'pending' });
            if (window.updateGlobalSyncStatus) updateGlobalSyncStatus('pending');
        }

        // UI Update inmediata en el state
        const idx = state.bonos.findIndex(b => (b.bono || b.codigo) === code);
        if (idx !== -1) {
            state.bonos[idx] = { ...state.bonos[idx], ...cleanBonoData };
            renderBonosFromState();
        }

        // 2. INTENTO FIRESTORE (Background-ish)
        try {
            // Ensure updates is also clean for Firestore
            const cleanUpdates = cleanUndefined(updates);
            await db.collection("spa_vouchers").doc(code).set(cleanUpdates, { merge: true });
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
        console.error("[SAVE] Error general guardando:", err);
        showToast("❌ Error al guardar: " + err.message, "error");
    } finally {
        if (btn && btnText && originalText) {
            btn.disabled = false;
            btnText.textContent = originalText;
        }
    }
}
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
            const sessionsTotal = item.sessions || item.sesiones || 1;
            item.used = sessionsTotal;
            item.usadas = sessionsTotal;
        });
        // Refrescar el desglose visual en el modal si es necesario
        if (typeof renderEditableBreakdown === 'function') {
            renderEditableBreakdown();
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
    if (space === 'hotel' || (item.name || '').toLowerCase().includes('alojamiento') || space.includes('hotel')) {
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
        if (!confirm(`¿Confirmas que quieres validar 1 sesión de "${item.name}" MANUALMENTE ?\n\nEsto descontará una sesión sin pasar por el calendario.`)) {
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
            sessions: item.sessions || item.sesiones || 1,
            space: item.space || '',
            used: item.used || item.usadas || 0,
            usadas: item.used || item.usadas || 0, // Duplicate for compatibility
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

    // Limpiar y prellenar campos con datos del bono
    document.getElementById("av-fecha").value = new Date().toISOString().split('T')[0];
    document.getElementById("av-nombre").value = voucher.cliente || '';
    document.getElementById("av-telefono").value = voucher.telefono || voucher.phone || '';
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

        // --- NEW: PROPAGATE PHONE & UPDATE STATE ---
        let phoneUpdated = false;
        if (telefono && (!voucher.telefono || voucher.telefono !== telefono)) {
            voucher.telefono = telefono;
            phoneUpdated = true;

            // Update in local state array immediately
            const stateIdx = state.bonos.findIndex(b => b.bono === code);
            if (stateIdx !== -1) {
                state.bonos[stateIdx].telefono = telefono;
            }

            // Background update to Firestore for the root document field
            try {
                db.collection("spa_vouchers").doc(code).update({ telefono: telefono });
                console.log("[PHONE] Teléfono actualizado en bono raíz:", telefono);
            } catch (err) {
                console.warn("[PHONE] Error actualizando teléfono raíz:", err);
            }
        }
        // -------------------------------------------

        // Incrementar uso del servicio individual
        item.used = (item.used || 0) + 1;

        // Agregar validación al servicio
        if (!item.validations) item.validations = [];
        item.validations.push(validationData);

        // Guardar usando función que limpia undefined fields y guarda el desglose
        await saveServiceBreakdownToFirestore(code);

        showToast("Alojamiento validado correctamente", "success");
        closeAccommodationValidation();

        // Actualizar vista - Force re-read from updated state
        // Re-open Management Panel to reflect changes
        await openVoucherManagement(code);

        // CRITICAL: Refresh history to show the new validation
        if (typeof renderVoucherHistory === 'function') {
            await renderVoucherHistory(code, state.editingVoucherItems);
        }

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

// --- ANULAR BONO ---
async function annulVoucher() {
    const code = document.getElementById("vm-code")?.value;
    if (!code) {
        showToast("No hay bono seleccionado", "error");
        return;
    }

    try {
        // 1. Obtener datos del bono actual
        const doc = await db.collection("spa_vouchers").doc(code).get();
        if (!doc.exists) {
            showToast("Bono no encontrado", "error");
            return;
        }
        const voucher = doc.data();

        // 2. VALIDACIÓN: No anular bonos caducados
        const expiryDate = voucher.validez || voucher.expiry || voucher.fecha_vencimiento;
        if (expiryDate) {
            const expiry = new Date(expiryDate);
            if (expiry < new Date()) {
                showToast("⚠️ No se puede anular un bono caducado", "warning");
                return;
            }
        }

        // 3. VALIDACIÓN: No anular bonos con servicios reservados
        const usedSessions = parseInt(voucher.sesiones_usadas) || 0;
        const hasReservations = voucher.reservas && voucher.reservas.length > 0;
        const hasItemsUsed = voucher.items_desglosados && voucher.items_desglosados.some(item => item.used > 0);

        if (usedSessions > 0 || hasReservations || hasItemsUsed) {
            showToast("⚠️ No se puede anular un bono con servicios usados o reservados", "warning");
            return;
        }

        // 4. Pedir motivo
        const motivo = prompt("Motivo de la anulación:");
        if (!motivo) {
            showToast("Anulación cancelada (sin motivo)", "info");
            return;
        }

        // 5. Pedir usuario que realiza
        const usuario = prompt("¿Quién realiza la anulación?", "recepcion");
        if (!usuario) {
            showToast("Anulación cancelada", "info");
            return;
        }

        // 6. Confirmar
        if (!confirm(`¿Confirmar ANULACIÓN del bono ${code}?\n\nMotivo: ${motivo}\nUsuario: ${usuario}`)) {
            return;
        }

        // 7. Actualizar en Firestore
        const updateData = {
            estado: 'anulado',
            estado_anterior: voucher.estado,
            anulacion: {
                fecha: new Date().toISOString(),
                motivo: motivo,
                usuario: usuario
            },
            updated_at: new Date().toISOString()
        };

        await db.collection("spa_vouchers").doc(code).update(updateData);

        // 8. Actualizar local si existe (dbLocal.bonos)
        try {
            if (window.dbLocal && window.dbLocal.bonos) {
                const localVoucher = await dbLocal.bonos.get(code);
                if (localVoucher) {
                    await dbLocal.bonos.put({ ...localVoucher, ...updateData });
                }
            }
        } catch (localErr) {
            console.warn("[ANULAR] Error actualizando local:", localErr);
        }

        showToast("✅ Bono anulado correctamente", "success");
        closeVoucherModal();
        cargarBonos();

    } catch (err) {
        console.error("[ANULAR] Error:", err);
        showToast("Error anulando bono: " + err.message, "error");
    }
}

// --- MODAL VENTA LOCAL (Nuevo con Carrito) ---

function openLocalVoucherModal() {
    state.lvCart = [];
    state.lvSelectedProduct = null;
    renderLVCart();
    loadActiveComplementos();

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
        const matchesQuery = !q || (prod.nombre || "").toLowerCase().includes(q);
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
                badgesHtml += `<span style="background:#ecfeff; color:#0e7490; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #cffafe; margin-left:4px;"><i class="fas fa-hot-tub"></i> Circuito</span>`;
            }
            if (includesMasaje) {
                badgesHtml += `<span style="background:#fdf4ff; color:#a21caf; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #fce7f3; margin-left:4px;"><i class="fas fa-spa"></i> Masaje</span>`;
            }
            if (isPack) {
                badgesHtml += `<span style="background:#fff7ed; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #ffedd5; margin-left:4px;"><i class="fas fa-box-open"></i> Pack</span>`;
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
                <div onclick="selectProductForLocalVoucher(${JSON.stringify({
                nombre: prod.nombre,
                wc_id: prod.wc_id,
                id: prod.id,
                product_id: prod.product_id,
                precio: prod.precio,
                sesiones: prod.sesiones,
                pax: prod.pax || prod.personas,
                espacio: prod.espacio
            }).replace(/"/g, '&quot;')})" 
            style="display: flex; gap: 12px; align-items: start; padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: all 0.2s;"
            onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                
                <div style="position:relative; flex-shrink:0;">
                    <img src="${prod.imagen || 'zenith-icon.png'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    ${pax > 1 ? '<div style="position:absolute; bottom:-6px; right:-6px; background:#2563eb; color:white; border-radius:50%; width:20px; height:20px; font-size:0.7rem; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">' + pax + '</div>' : ''}
                </div>
                
                <div style="flex: 1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: #0f172a; line-height:1.2; margin-bottom:4px;">
                            ${prod.nombre}
                            <span style="font-size:0.7rem; color:#94a3b8; font-weight:500; margin-left:5px;">ID: ${prod.wc_id || prod.id}</span>
                        </div>
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

window.selectProductForLocalVoucher = (productData) => {
    // 1. Normalización de entrada (Adapter pattern)
    let prod = null;
    let isCustom = false;

    if (productData === 'custom') {
        isCustom = true;
        prod = { nombre: 'Personalizado', custom: true };
    } else if (typeof productData === 'object' && productData !== null) {
        // Mejoramos la detección por ID para ser más precisos
        const catalogId = productData.wc_id || productData.id || productData.product_id;
        prod = state.catalogProducts.find(p => (
            p.wc_id === catalogId ||
            p.id === catalogId ||
            (p.wc_id && String(p.wc_id) === String(catalogId))
        )) || productData;
    } else if (typeof productData === 'string') {
        prod = state.catalogProducts.find(p => p.nombre === productData);
    }

    if (!prod) {
        console.warn("[LV] Producto no encontrado, usando fallback defensivo:", productData);
        prod = typeof productData === 'object' ? productData : { nombre: String(productData) };
    }

    const resultsDiv = document.getElementById("lv-search-results");
    const customInput = document.getElementById("lv-product-custom");
    const detailsDiv = document.getElementById("lv-product-details");
    const priceInput = document.getElementById("lv-price");
    const sessionsInput = document.getElementById("lv-sessions");
    const searchInput = document.getElementById("lv-product-search");

    if (resultsDiv) resultsDiv.style.display = 'none';
    state.lvSelectedProduct = prod;

    if (isCustom || prod.custom) {
        if (customInput) {
            customInput.style.display = 'block';
            customInput.value = prod.custom ? (prod.nombre || '') : '';
            if (!prod.custom) customInput.focus();
        }
        if (detailsDiv) detailsDiv.style.display = 'none';

        const priceContainer = document.getElementById("lv-price-container");
        if (priceContainer) priceContainer.style.display = 'block';
        if (priceInput) priceInput.value = prod.precio || '';
        if (sessionsInput) sessionsInput.value = prod.sesiones || 1;
        if (searchInput) searchInput.value = 'PRODUCTO PERSONALIZADO';
    } else {
        if (searchInput) searchInput.value = prod.nombre || '';
        if (customInput) customInput.style.display = 'none';

        // UI Details & Badges
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

        if (includesSpa) badgesHtml += `<span style="background:#ecfeff; color:#0e7490; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #cffafe; margin-left:4px;"><i class="fas fa-hot-tub"></i> Circuito</span>`;
        if (includesMasaje) badgesHtml += `<span style="background:#fdf4ff; color:#a21caf; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #fce7f3; margin-left:4px;"><i class="fas fa-spa"></i> Masaje</span>`;
        if (isPack) badgesHtml += `<span style="background:#fff7ed; color:#c2410c; padding:2px 6px; border-radius:4px; font-size:0.7em; border:1px solid #ffedd5; margin-left:4px;"><i class="fas fa-box-open"></i> Pack</span>`;

        const detailsName = document.getElementById("lv-details-name");
        if (detailsName) {
            detailsName.innerHTML = `
                <div style="font-size:1.1rem; line-height:1.2; margin-bottom:6px;">${prod.nombre || 'Sin nombre'}</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${badgesHtml}</div>
            `;
        }

        const imgPreview = document.getElementById("lv-img-preview");
        if (imgPreview) {
            if (prod.imagen) {
                imgPreview.src = prod.imagen;
                imgPreview.style.display = 'block';
            } else {
                imgPreview.style.display = 'none';
            }
        }

        let includesFull = (prod.incluye && Array.isArray(prod.incluye)) ? prod.incluye.join(", ") : (prod.incluye || '');
        if (!includesFull && prod.items_incluidos) {
            includesFull = prod.items_incluidos.map(i => i.name || i.producto || i).join(", ");
        }

        const detailsText = document.getElementById("lv-details-text");
        if (detailsText) detailsText.textContent = includesFull || "Servicio de catálogo";

        if (detailsDiv) detailsDiv.style.display = 'block';

        const priceContainer = document.getElementById("lv-price-container");
        if (priceContainer) priceContainer.style.display = 'none';

        // Defensive calculation inputs
        state.lvSelectedProductBasePrice = parseFloat(prod.precio) || 0;
        state.lvSelectedProductBasePax = parseInt(prod.personas || prod.pax || 1);
        if (priceInput) priceInput.value = state.lvSelectedProductBasePrice;

        let totalSessions = 1;
        if ((prod.items_incluidos && prod.items_incluidos.length > 0) || (prod.nombre || '').toLowerCase().includes('pack')) {
            totalSessions = 1;
        } else if (prod.sesiones) {
            totalSessions = prod.sesiones;
        } else if (typeof detectSessions === 'function') {
            totalSessions = detectSessions(prod).total;
        }

        if (sessionsInput) sessionsInput.value = totalSessions;

        const paxInput = document.getElementById("lv-pax");
        if (paxInput) {
            let parsedPax = 1;
            if (typeof detectSessions === 'function') {
                const det = detectSessions(prod);
                parsedPax = det.paxPerSession || 1;
            } else {
                parsedPax = parseInt(prod.personas || prod.pax || 1);
            }
            paxInput.value = String(parsedPax);
        }
    }
};

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
                const detected = detectSessions(prod);
                totalSessions = detected.total;
            }
            if (sessionsInput) sessionsInput.value = totalSessions;

            // Auto-set PAX
            const parsedPax = prod.personas || prod.pax || detectSessions(prod).paxPerSession || 1;
            const paxInput = document.getElementById("lv-pax");
            if (paxInput) paxInput.value = String(parsedPax);
        } else if (detailsDiv) {
            detailsDiv.style.display = 'none';
        }
    }
}

// Función para recalcular precio con descuento
window.updateLocalPriceWithDiscount = () => {
    // Si es producto custom, el precio base es el que pone el usuario, el descuento aplica sobre eso?
    // Habitualmente en custom, pones el precio final directamente. 
    // Pero si el usuario quiere usar el campo dto, lo permitimos.

    let basePrice = 0;

    if (state.lvSelectedProduct) {
        if (state.lvSelectedProduct.custom) {
            // Para custom, difícil saber el "base" original si ya editó el input.
            // Asumimos que el input tiene el precio.
            // Para simplificar: En custom NO aplicamos recálculo automático si no hay base conocida.
            return;
        } else {
            // Producto de catálogo: Recalcular desde base
            const pBase = state.lvSelectedProductBasePrice || 0;
            const pPaxBase = state.lvSelectedProductBasePax || 1;
            const currentPax = parseInt(document.getElementById("lv-pax").value) || 1;
            const ratio = currentPax / pPaxBase;
            basePrice = pBase * ratio;
        }
    } else {
        return;
    }

    const discount = parseFloat(document.getElementById("lv-discount").value) || 0;
    const finalPrice = basePrice * (1 - (discount / 100));

    document.getElementById("lv-price").value = finalPrice.toFixed(2);
};

// Hookear cambio de pax para que también recalcule con descuento
// (Necesitamos asegurar que el listener de pax llame a esto)
// En HTML: id="lv-pax" ... podríamos añadir onchange="updateLocalPriceWithDiscount()"
// Pero como ya existe lógica quizás, mejor lo hacemos en addToCartLocal o inyectamos.

function addToCartLocal() {
    const selected = state.lvSelectedProduct;
    if (!selected) return showToast("Primero selecciona un producto", "warning");

    // 1. Inputs del Modal
    let name = (selected.nombre || 'Servicio').trim();
    let price = 0;
    const sessions = parseInt(document.getElementById("lv-sessions").value) || 1;
    const pax = parseInt(document.getElementById("lv-pax").value) || 1;
    const discountVal = parseFloat(document.getElementById("lv-discount").value) || 0;

    console.log("[CART] Adding:", name, "Pax:", pax, "Dto:", discountVal);

    // 2. Lógica de Precio (Adapter)
    if (selected.custom) {
        name = document.getElementById("lv-product-custom").value.trim() || 'Servicio Personalizado';
        price = parseFloat(document.getElementById("lv-price").value) || 0;
    } else {
        const basePrice = state.lvSelectedProductBasePrice || 0;
        const basePax = state.lvSelectedProductBasePax || 1;
        const ratio = pax / basePax;
        let calculatedPrice = basePrice * ratio;

        if (discountVal > 0) {
            calculatedPrice = calculatedPrice * (1 - (discountVal / 100));
        }
        price = calculatedPrice;
    }

    // 3. Generación de Desglose (Components Adapter)
    let items = [];
    const itemsIncluidos = selected.items_incluidos || [];

    if (!selected.custom && itemsIncluidos.length > 0) {
        const itemCount = itemsIncluidos.length;
        const pricePerItem = price / itemCount;

        items = itemsIncluidos.map(it => {
            // Normalizar item del catálogo (puede ser string o objeto)
            const itemName = (typeof it === 'string') ? it : (it.name || it.producto || name);
            const itemSpace = (typeof it === 'object' && it.espacio) ? it.espacio : (getSpaceForService(itemName) || '');
            const itemNameLower = itemName.toLowerCase();

            // Detectar si es item de restaurante (siempre 1 sesión, pax = personas)
            const isRestaurant = itemNameLower.includes('menú') ||
                itemNameLower.includes('restaurante') ||
                (typeof itemSpace === 'string' && itemSpace.toLowerCase() === 'rest');

            // Para restaurante: siempre 1 sesión, pax = número de personas
            // Para otros servicios: sesiones del catálogo, pax del formulario
            const itemSessions = isRestaurant ? 1 : ((typeof it === 'object' && it.sesiones) ? it.sesiones : 1);
            const itemPax = isRestaurant ? pax : pax; // En restaurante, pax indica comensales

            return {
                name: itemName.trim(),
                sessions: itemSessions,
                space: itemSpace,
                pax: itemPax,
                price: pricePerItem,
                original_id: (typeof it === 'object') ? (it.wc_id || it.id) : null
            };
        });
    } else {
        // Caso servicio individual o personalizado
        items = [{
            name: name,
            sessions: 1,
            space: selected.custom ? '' : (selected.espacio || getSpaceForService(name) || ''),
            pax: pax,
            price: price
        }];
    }

    const finalName = discountVal > 0 ? `${name} (-${discountVal}%)` : name;

    // 4. Push al Carrito Único (Standardized Object)
    state.lvCart.push({
        name: finalName,
        price: parseFloat(price) || 0,
        sessions: sessions,
        pax: pax,
        originalProduct: selected.custom ? null : { ...selected },
        items_breakdown: items,
        discount_percent: discountVal,
        added_at: new Date().toISOString()
    });

    renderLVCart();

    // 5. Reset UI
    state.lvSelectedProduct = null;
    const searchInput = document.getElementById("lv-product-search");
    if (searchInput) searchInput.value = "";

    const customInput = document.getElementById("lv-product-custom");
    if (customInput) customInput.style.display = 'none';

    const priceInput = document.getElementById("lv-price");
    if (priceInput) priceInput.value = "";

    const discountInput = document.getElementById("lv-discount");
    if (discountInput) discountInput.value = "0";

    const sessionsInput = document.getElementById("lv-sessions");
    if (sessionsInput) sessionsInput.value = 1;

    const detailsDiv = document.getElementById("lv-product-details");
    if (detailsDiv) detailsDiv.style.display = 'none';
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
        const itemPrice = parseFloat(item.price) || 0;
        // FIX: Para packs con items_breakdown, no multiplicar por sessions
        const isPack = item.items_breakdown && item.items_breakdown.length > 1;
        const subtotal = isPack ? itemPrice : (itemPrice * (parseInt(item.sessions) || 1));

        return `
            <div style="display: flex; gap: 10px; align-items: center; background: #fff; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <img src="${itemImg}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 6px;">
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 700; font-size: 0.85rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">
                        ${(() => {
                const isRestaurant = item.isExtra || (item.name || '').toLowerCase().includes('menú') || (item.name || '').toLowerCase().includes('restaurante');
                if (isRestaurant) {
                    // Restaurante: 1 sesión × N personas × precio
                    return `1 ses. × ${item.pax || item.sessions} pers. × ${itemPrice.toFixed(2)}€ = <strong style=\"color: var(--accent);\">${subtotal.toFixed(2)}€</strong>`;
                } else {
                    // Servicios normales: N sesiones × precio
                    return `${item.sessions} ses. × ${itemPrice.toFixed(2)}€ = <strong style=\"color: var(--accent);\">${subtotal.toFixed(2)}€</strong>`;
                }
            })()}
                    </div>
                </div>
                <button onclick="removeFromLVCart(${index})" style="background: #fef2f2; border: 1px solid #fee2e2; color: #ef4444; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
    }).join('');

    // Single source of truth calculation - FIX: no multiplicar packs por sessions
    const totalPrice = state.lvCart.reduce((sum, i) => {
        const isPack = i.items_breakdown && i.items_breakdown.length > 1;
        return sum + (isPack ? parseFloat(i.price) || 0 : ((parseFloat(i.price) || 0) * (parseInt(i.sessions) || 1)));
    }, 0);
    const totalSessions = state.lvCart.reduce((sum, i) => sum + (parseInt(i.sessions) || 0), 0);

    if (totalDisplay) {
        totalDisplay.innerHTML = `<span style="color: #64748b; font-weight: 400; font-size: 0.8rem; margin-right: 5px;">TOTAL:</span> ${totalPrice.toFixed(2)}€ <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 5px;">(${totalSessions} Sesiones)</span>`;
    }
}

function removeFromLVCart(index) {
    state.lvCart.splice(index, 1);
    renderLVCart();
}

async function createLocalVoucher() {
    if (state.lvCart.length === 0) {
        return showToast("Añade al menos un producto al bono", "warning");
    }

    const clientName = document.getElementById("lv-client").value.trim();
    if (!clientName) return showToast("Escribe el nombre del cliente", "warning");

    const clientPhone = document.getElementById("lv-phone").value.trim();
    if (!clientPhone) {
        const phoneField = document.getElementById("lv-phone");
        phoneField.style.borderColor = "red";
        phoneField.focus();
        setTimeout(() => phoneField.style.borderColor = "", 3000);
        return showToast("El teléfono es obligatorio", "warning");
    }

    let codeInput = document.getElementById("lv-code").value.trim();
    // Si el usuario puso un código manual (ej: 18067), le ponemos el prefijo Tarj- 
    // si no tiene ya un prefijo conocido (Tarj-, LOC-, BONO-)
    if (codeInput && !/^(Tarj|LOC|BONO)-/i.test(codeInput)) {
        codeInput = `Tarj-${codeInput}`;
    }
    const code = codeInput || `LOC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // FIX: Para packs/rituales con items_breakdown > 1, el precio NO debe multiplicarse por sessions
    // porque el precio del pack ya incluye todos los componentes
    const totalPrice = state.lvCart.reduce((sum, i) => {
        const isPack = i.items_breakdown && i.items_breakdown.length > 1;
        // Para packs: precio fijo (no multiplicar). Para servicios simples: precio * sesiones
        return sum + (isPack ? i.price : (i.price * i.sessions));
    }, 0);
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
        // DISCOUNT PERSISTENCE
        discount_percent_max: state.lvCart.length > 0 ? Math.max(...state.lvCart.map(i => parseFloat(i.discount_percent) || 0)) : 0,
        discount_total_amount: state.lvCart.reduce((sum, i) => {
            const rawPrice = (i.originalProduct ? parseFloat(i.originalProduct.precio) : i.price) || i.price;
            const diff = (rawPrice - i.price) * i.sessions;
            return sum + (diff > 0 ? diff : 0);
        }, 0),
        createdAt: new Date().toISOString(),
        manual_update: true,
        updated_at: new Date().toISOString(),
        // === PAYMENT CONTROL FIELDS ===
        estado_pago: 'pendiente', // Local vouchers start as pending
        importe_pagado: 0,
        importe_pendiente: totalPrice,
        pagos: [],
        service_payment_status: null,
        snapshot_price: totalPrice // Capture price at creation
        // === END PAYMENT CONTROL ===
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

// --- EXTRAS LOGIC ---
async function loadActiveComplementos() {
    try {
        const snapshot = await db.collection("spa_complementos")
            .where("active", "!=", false)
            .get();

        state.complementos = [];
        snapshot.forEach(doc => state.complementos.push({ id: doc.id, ...doc.data() }));

        // Sort in memory to avoid Firestore index requirement error
        state.complementos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

        renderExtrasSelector();
    } catch (err) {
        console.error("Error loading extras:", err);
    }
}

function renderExtrasSelector() {
    const select = document.getElementById("lv-extras-select");
    if (!select) return;

    let html = '<option value="">-- Seleccionar Extra --</option>';
    state.complementos.forEach(c => {
        html += `<option value="${c.id}">${c.nombre} (+${parseFloat(c.precio).toFixed(2)}€)</option>`;
    });
    select.innerHTML = html;
}

function addExtraToCart() {
    const select = document.getElementById("lv-extras-select");
    const qtyInput = document.getElementById("lv-extras-qty");
    const id = select.value;
    const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;

    if (!id) return showToast("Selecciona un extra primero", "warning");

    const extra = state.complementos.find(c => c.id === id);
    if (!extra) return;

    // Add as a separate line item
    state.lvCart.push({
        name: extra.nombre,
        price: parseFloat(extra.precio) || 0,
        sessions: qty,
        pax: 1,
        isExtra: true,
        originalProduct: null,
        items_breakdown: [{
            name: extra.nombre,
            sessions: qty,
            space: extra.space || '',
            pax: 1,
            price: parseFloat(extra.precio) || 0,
            original_id: extra.id
        }],
        discount_percent: 0,
        added_at: new Date().toISOString()
    });

    renderLVCart(); // Update UI
    showToast(`${qty}x ${extra.nombre} añadido`, "success");
    select.value = ""; // Reset selector
    if (qtyInput) qtyInput.value = 1; // Reset quantity
}


// function goToReservation removed (duplicate legacy code)

async function markServiceUsed(itemIndex, voucher) {
    const item = state.editingVoucherItems[itemIndex];
    if (!item) return;

    // 1. Incrementar uso del componente
    item.used = (item.used || 0) + 1;

    // 2. Incrementar uso global del bono (para barra de progreso)
    const currentGlobalUsed = parseInt(document.getElementById("vm-sesiones-usadas").value) || 0;
    const totalGlobal = parseInt(document.getElementById("vm-sesiones-total").value) || 1;

    if (currentGlobalUsed < totalGlobal) {
        document.getElementById("vm-sesiones-usadas").value = currentGlobalUsed + 1;
    }

    // 3. Crear registro de Auditoría (Validation)
    const userEmail = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : 'admin';
    const validation = {
        fecha_validacion: new Date().toISOString(),
        validado_por: userEmail,
        tipo: 'consumo_manual',
        item_name: item.name,
        pax: item.pax || 1,
        espacio: item.space || ''
    };

    if (!item.validations) item.validations = [];
    item.validations.push(validation);

    const voucherCode = voucher.bono || voucher.codigo;

    // 4. Guardar en Firestore
    try {
        // saveVoucherChanges() se encargará de persistir todo (global + items)
        await saveVoucherChanges();
        showToast(`✔ Componente "${item.name}" validado`, "success");

        // Opcional: ofrecer abrir reservas si es un servicio de espacio físico
        setTimeout(() => {
            const space = (item.space || '').toLowerCase();
            const isComplemento = space === 'complemento';

            if (!isComplemento && item.used <= (item.sessions || 1)) {
                // Si el usuario quiere reservar ahora
                if (confirm(`¿Quieres crear una reserva en el calendario para "${item.name}" ahora?`)) {
                    goToReservation(voucher.cliente, item.name, voucherCode, space);
                }
            }
        }, 1000);

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
            // Cliente
            'Correo electrónico del cliente': 'email',
            'Correo electrónico (facturación)': 'email_billing',
            'Billing Email': 'email_billing',
            'Email': 'email',

            'Nombre (facturación)': 'nombre',
            'Billing First Name': 'nombre',
            'First Name (Billing)': 'nombre',
            'Nombre': 'nombre',

            'Apellidos (facturación)': 'apellidos',
            'Billing Last Name': 'apellidos',
            'Last Name (Billing)': 'apellidos',
            'Apellidos': 'apellidos',

            'Teléfono (facturación)': 'telefono',
            'Billing Phone': 'telefono',
            'Phone (Billing)': 'telefono',
            'Teléfono': 'telefono',
            'Phone': 'telefono',
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

            const bonoCode = `WC${orderKey} `;

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
        console.log(`Pedidos únicos detectados: ${orderCodes.length} `);

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

                    productNames.push(`${qty > 1 ? qty + 'x ' : ''}${item.producto} `);
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
                        console.log(`[UPDATE] Actualizando bono ${code} con más items(${itemsDesglosados.length} vs ${existingData.items_desglosados?.length})`);

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
        console.error("Error importando excel:", err);
        showToast("Error importando: " + err.message, "error");
    } finally {
        // Reset input para permitir reimportar el mismo archivo
        if (event && event.target) event.target.value = '';
    }
}

// --- SYNC SINGLE VOUCHER (Manual Refresh) ---
async function syncSingleVoucher(code) {
    // Protection: If it's a background sync, don't overwrite manual changes
    const existing = state.bonos.find(b => (b.bono || b.codigo) === code);
    if (existing && existing.manual_update && !window.forceSync) {
        console.log('[SYNC] Skipping sync for manually updated voucher:', code);
        return;
    }

    const btn = document.getElementById("vm-btn-refresh");
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spin fa-sync"></i>';
        btn.disabled = true;
    }

    try {
        console.log(`[DiffSync] Forzando actualización individual para: ${code} `);

        // 1. FIRST FETCH FROM FIRESTORE (Usage source of truth)
        const doc = await db.collection('spa_vouchers').doc(code).get();
        if (doc.exists) {
            const firestoreData = doc.data();
            console.log("[DiffSync] Firestore Data fetched:", firestoreData);

            // Update local state
            const localIdx = state.bonos.findIndex(lb => lb.bono === code || lb.codigo === code);
            if (localIdx >= 0) {
                state.bonos[localIdx] = { ...state.bonos[localIdx], ...firestoreData };
            }

            // Trigger UI Refresh for this voucher specifically
            window.dispatchEvent(new CustomEvent('vouchers-updated', { detail: { code, source: 'manual-sync-firestore' } }));
        }

        // 2. THEN FETCH FROM SHOP API (Customer info / WooCommerce source)
        let shopVouchers = [];
        if (typeof fetchBonosDirect === 'function') {
            let desdeForced;
            try {
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 5);
                desdeForced = oneYearAgo.toISOString().split('T')[0];

                console.log(`[DiffSync] Fetching with date ${desdeForced} to find ${code}...`);
                const params = { desde: desdeForced, per_page: 999, limit: 999 };
                shopVouchers = await fetchBonosDirect(params, 15000);
            } catch (e) {
                console.warn("[DiffSync] Opt failed", e);
                if (typeof fetchBonosWithFallback === 'function') {
                    shopVouchers = await fetchBonosWithFallback({ desde: desdeForced, per_page: 999, limit: 999 }, 15000);
                }
            }
        } else {
            const endpoint = getBonoEndpoint();
            const res = await fetch(endpoint);
            shopVouchers = await res.json();
            if (shopVouchers.contents) shopVouchers = JSON.parse(shopVouchers.contents);
        }

        if (!Array.isArray(shopVouchers)) shopVouchers = [];

        const targetBono = shopVouchers.find(b => {
            const rawCode = (b.bono || '').trim();
            if (rawCode === code) return true;
            if (code.includes(b.order_id)) return true;
            return false;
        });

        if (targetBono) {
            console.log("[DiffSync] Found in API:", targetBono);
            const b = targetBono;

            // --- NORMALIZACIÓN ROBUSTA (Igual que en sincronización masiva) ---

            // 1. Contacto
            if (b.billing && typeof b.billing === 'object') {
                const fName = b.billing.first_name || '';
                const lName = b.billing.last_name || '';
                if (!b.cliente) b.cliente = (fName + ' ' + lName).trim();
                if (!b.telefono && b.billing.phone) b.telefono = b.billing.phone;
                if (!b.email && b.billing.email) b.email = b.billing.email;
            }
            if (!b.cliente) {
                const fName = b.billing_first_name || b.first_name || '';
                const lName = b.billing_last_name || b.last_name || '';
                const candidate = (fName + ' ' + lName).trim();
                if (candidate) b.cliente = candidate;
            }
            if (!b.telefono) b.telefono = b.billing_phone || b.phone || '';
            if (!b.email) b.email = b.billing_email || b.email || '';
            if (!b.nombre && b.cliente) b.nombre = b.cliente;

            const updateData = {};

            // 2. Precio Real (Net-First logic for discounts)
            let realTotal = 0;

            // A. Try Net Totals Strategy first (total, item_total, amount)
            // This avoids issues where line_total is gross (pre-discount)
            realTotal = parseFloat(b.total) || parseFloat(b.item_total) ||
                parseFloat(b.amount) || parseFloat(b.order_total) || 0;

            // B. If net total not found, try summing items breakdown (if valid)
            if (realTotal === 0 && b.items_desglosados && Array.isArray(b.items_desglosados) && b.items_desglosados.length > 0) {
                realTotal = b.items_desglosados.reduce((sum, i) => sum + (parseFloat(i.price || i.precio || 0)), 0);
                updateData.items_desglosados = b.items_desglosados; // Trust the breakdown source
            }

            // C. Fallback to Gross/Simple fields if still zero
            if (realTotal === 0) {
                realTotal = parseFloat(b.line_total) || parseFloat(b.subtotal) ||
                    parseFloat(b.precio) || parseFloat(b.importe) || 0;
            }

            // D. Distributive Discount Safety Check
            // If we have an explicit order-level discount and the found price is higher than order total, clamp it.
            const orderDiscount = parseFloat(b.discount_total) || 0;
            const orderTotal = parseFloat(b.order_total) || parseFloat(b.total) || 0;

            if (orderDiscount > 0 && orderTotal > 0 && realTotal > orderTotal) {
                console.log(`[DiffSync] Applying distributive discount logic: ${realTotal} -> ${orderTotal}`);
                realTotal = orderTotal;
            }

            if (realTotal > 0) {
                b.precio = realTotal;
                b.importe = realTotal;
                updateData.precio = realTotal;
                updateData.importe = realTotal;
            } else {
                // Should not happen for valid orders, but keep fallback
                updateData.precio = parseFloat(b.precio || b.importe || 0);
                updateData.importe = updateData.precio;
            }

            // 3. Fecha (Universal Date Persistence - Canonical: purchase_date)
            const extractedDate = b.fecha || b.date_created || b.fecha_compra;
            if (extractedDate) {
                b.fecha = extractedDate; // Legacy support
                b.purchase_date = extractedDate; // New canonical field
                updateData.fecha = extractedDate;
                updateData.purchase_date = extractedDate;
            }

            // 4. IDs Técnicos (Para mapeo determinista)
            if (b.product_id) updateData.product_id = b.product_id;
            if (b.variation_id) updateData.variation_id = b.variation_id;

            // 5. PACK BREAKDOWN PERSISTENCE (Source of Truth: Internal Catalog)
            // Solo sincronizar si no tiene ya un desglose real guardado (evitar sobrescribir consumos)
            const hasExistingItems = (existing && existing.items_desglosados && existing.items_desglosados.length > 0 &&
                existing.items_desglosados.some(i => i.used > 0));

            if (!hasExistingItems) {
                console.log(`[SYNC] Generando desglose desde catálogo para ${code}...`);
                const components = resolveVoucherBreakdown(b);
                if (components && components.length > 0) {
                    updateData.items_desglosados = components;

                    // Si el catálogo especifica sesiones o pax, actualizar en el bono
                    const totalSessions = components.reduce((sum, s) => sum + (s.sessions || 1), 0);
                    const pax = components.length > 0 ? (components[0].pax || 1) : 1;

                    updateData.sesiones_totales = totalSessions;
                    updateData.pax_por_sesion = pax;
                }
            }

            // Merge explicit contact updates if any
            if (b.cliente) updateData.cliente = b.cliente;
            if (b.telefono) updateData.telefono = b.telefono;
            if (b.email) updateData.email = b.email;

            if (Object.keys(updateData).length > 0) {
                await db.collection("spa_vouchers").doc(code).update(updateData);
                console.log("[DiffSync] Firestore Updated with Shop Info:", updateData);

                const localIdx = state.bonos.findIndex(lb => lb.bono === code || lb.codigo === code);
                if (localIdx >= 0) {
                    state.bonos[localIdx] = { ...state.bonos[localIdx], ...updateData };
                    if (document.getElementById("vm-code")?.value === code) {
                        document.getElementById("vm-cliente").value = updateData.cliente || '';
                        document.getElementById("vm-telefono").value = updateData.telefono || '';
                        document.getElementById("vm-email").value = updateData.email || '';
                    }
                }
            }
            showToast("Sincronización completa", "success");
        } else {
            console.warn("[DiffSync] Bono not found in Shop API, but Firestore sync completed.");
            showToast("Bono actualizado desde servidor local", "info");
        }

        // Trigger UI Refresh
        window.dispatchEvent(new CustomEvent('vouchers-updated', { detail: { code, source: 'manual-sync' } }));

    } catch (e) {
        console.error("[DiffSync] Error:", e);
        showToast("Error al refrescar: " + e.message, "error");
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            btn.disabled = false;
        }
    }
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
                console.log(`[BÚSQUEDA DIRECTA] Buscando código específico: ${codigo} `);

                try {
                    const doc = await db.collection("spa_vouchers").doc(codigo).get();
                    if (doc.exists) {
                        const bonoData = { ...doc.data(), bono: doc.id };

                        // Añadir al state si no está ya cargado
                        const existingIndex = state.bonos.findIndex(b => b.bono === doc.id);
                        if (existingIndex === -1) {
                            state.bonos.unshift(bonoData); // Añadir al principio
                            console.log(`[BÚSQUEDA DIRECTA] ✓ Bono ${doc.id} encontrado(1 lectura)`);
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
                    console.warn(`[BÚSQUEDA DIRECTA]Error: ${err.message} `);
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
                    console.log(`[IMPORT] Cabecera detectada en fila ${i}: `, row);
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
                    const codigo = String(rawCodigo).startsWith("exc.Loc") ? rawCodigo : `exc.Loc ${rawCodigo} `;

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
                            console.log(`[Import] Forzando actualización de bono con fecha incorrecta(1970): ${codigo} `);
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
                                // FIX: Add 12 hours (+0.5) to target Noon to avoid midnight rollover issues
                                // Previous code subtracted 0.5 (-25569.5) which shifted to Previous Day Noon.
                                // Correct formula: (Raw - 25569 + 0.5)
                                const jsDate = new Date((fechaRaw - 25569 + 0.5) * 86400 * 1000);
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
                        console.log(`[Import] Saltando duplicado(en lote): ${codigo} `);
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
                            console.log(`[Import] Saltando duplicado(ya existe en BD): ${codigo} `);
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
                            console.log(`[Import] Forzando actualización en BD por fecha 1970: ${codigo} `);
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
                        console.warn(`[IMPORT] ⚠ Fallo subida Firestore para ${newBono.bono}. Permanece en local(pending).`, fsErr);
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
            if (skippedCount > 0) msg += ` Saltados(duplicados): ${skippedCount}.`;
            if (errorCount > 0) msg += ` Ignorados / Error: ${errorCount}.`;

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

        console.log(`[SYNC - UP] Subiendo ${pending.length} bonos pendientes a la nube...`);
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
            console.log(`[SYNC - UP] ${batchedCount} bonos subidos correctamente.`);

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

        console.log(`[FORCE - SYNC] Encontrados ${localOnly.length} bonos locales.Iniciando subida...`);

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
                console.log(`[FORCE - SYNC] Lote ${i / batchSize + 1} subido(${opsInBatch} docs).`);

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
// [DUPLICATE REMOVED: Usar implementación al inicio del archivo]


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
                console.log(`[MIGRATION] Bono ${b.bono}: Fecha inválida '${b.fecha}'.Cambiada a HOY.`);
            }
            const cleanDate = dateObj.toISOString().split('T')[0];
            const year = dateObj.getFullYear();

            // 2. Nuevo Código
            const newCode = `LOC - ${year} -${b.bono} `;

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
            console.error(`[MIGRATION] Error migrando bono ${b.bono}: `, e);
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

    if (!confirm(`⚠️ SE HAN DETECTADO ${toDelete.length} BONOS CORRUPTOS(Fecha 1970 o duplicados).\n\nSe eliminarán para dejar solo las versiones correctas o permitir re - importación.\n\n¿Proceder ? `)) return;

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
            console.error(`Error borrando ${b.bono} `, e);
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

    if (!confirm(`⚠️ SE VAN A ELIMINAR ${toDelete.length} BONOS INVÁLIDOS: \n` +
        `- ${toDelete.filter(b => b._fromFirestore).length} detectados solo en Nube.\n` +
        `- ${toDelete.length - toDelete.filter(b => b._fromFirestore).length} locales.\n\n` +
        `Ejemplos: ${toDelete.slice(0, 3).map(b => b.bono + ' (' + b.fecha + ')').join(', ')} \n\n` +
        `¿Estás seguro ? SE BORRARÁN DE FIRESTORE Y LOCAL.`)) {
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
            console.error(`Error borrando ${b.bono} `, err);
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
    if (!confirm(`⚠️ PELIGRO: Esto borrará TODOS los bonos que sean solo números(sin LOC -) menores o iguales a ${maxId}.\n¿Estás seguro ? `)) return;

    console.log(`[RANGE - DELETE] Buscando bonos numéricos <= ${maxId}...`);

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

    if (!confirm(`⚠️ SE DETECTARON ${toDelete.length} BONOS NUMÉRICOS <= ${maxId}.\nSe van a eliminar PERMANENTEMENTE.\n\nEscribe el número ${toDelete.length} para confirmar: `)) return;

    console.log(`[RANGE - DELETE] Borrando ${toDelete.length} bonos...`);
    let count = 0;

    for (const b of toDelete) {
        try {
            if (window.dbLocal) await dbLocal.bonos.delete(b.bono);
            await db.collection("spa_vouchers").doc(b.bono).delete();
            count++;
            if (count % 50 === 0) console.log(`Borrados ${count}...`);
        } catch (e) {
            console.error(`Fallo al borrar ${b.bono} `, e);
        }
    }

    alert(`✅ Operación terminada.${count} bonos eliminados.`);
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

    if (!confirm(`🚨 ¡ATENCIÓN! Se han encontrado ${uniqueToDelete.length} bonos corruptos.\n\n¿Quieres BORRARLOS TODOS de forma masiva ahora mismo ? `)) return;

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

    alert(`💪 ¡LIMPIEZA COMPLETADA!\n\nSe han eliminado ${deletedCount} bonos basura.\n${errors.length > 0 ? `Hubo ${errors.length} errores.` : ""} \n\nLa página se recargará para mostrar los cambios.`);
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
            console.log(`[DELETE] Borrado de Firestore: ${bonoCode} `);
        }

        alert("✅ Bono eliminado correctamente.");
    } catch (e) {
        console.error("Error borrando bono:", e);
        alert("❌ Error al borrar: " + e.message);
    }
};


/**
 * Recalcula un bono local basándose en el catálogo actual
 * Útil para corregir precios incorrectos o desactualizados
 */
window.recalculateVoucherFromCatalog = async function () {
    const code = document.getElementById("vm-code")?.value;
    const productName = document.getElementById("vm-cat-name")?.textContent || document.getElementById("vm-producto")?.value;

    if (!code) return;
    if (!productName) return showToast("No se detectó el producto para recalcular", "warning");

    try {
        // 1. Buscar en el catálogo
        const product = state.catalogProducts.find(p => p.nombre === productName);
        if (!product) {
            return showToast("Producto no encontrado en el catálogo para recálculo automático", "error");
        }

        // 2. Preparar nuevos datos respetando Pax y Sesiones actuales
        const basePrice = parseFloat(product.precio) || 0;
        // CHECK CATALOG PAX RULE: If catalog defines pax, it is fixed.
        // If catalog pax > 0 -> Price is TOTAL for that pax. Do NOT multiply.
        // If catalog pax is 0 or null -> Price is PER PERSON (usually).
        const catalogPax = parseInt(product.personas || product.pax || 0);
        const isFixedPax = catalogPax > 0;

        let finalPax = isFixedPax ? catalogPax : (parseInt(document.getElementById("vm-pax-sesion")?.value) || 1);
        const currentSessions = parseInt(document.getElementById("vm-sesiones-total")?.value) || 1;
        const catalogSessions = parseInt(product.sesiones || 1);

        // Price Calculation Logic
        let newPrice = basePrice;

        if (isFixedPax) {
            // Catalog says "Price is 100 for 2 people".
            // We use 100. We do NOT multiply by (2/2).
            // We allow session multiplication only if it's NOT a pack.
            const isPack = (product.items_incluidos && product.items_incluidos.length > 0) ||
                product.nombre.toLowerCase().includes('pack') ||
                product.nombre.toLowerCase().includes('bono');

            if (!isPack && currentSessions > catalogSessions) {
                newPrice = basePrice * (currentSessions / catalogSessions);
            }
        } else {
            // Variable pax (e.g. Masaje Individual 50€)
            // Price = 50 * pax * sessions
            newPrice = basePrice * finalPax * (currentSessions / catalogSessions);
        }

        if (!confirm(`¿Quieres actualizar el bono ${code} con los datos del catálogo?\n\nProducto: ${product.nombre}\nPrecio Catálogo: ${product.precio}€\nPax Fijo: ${isFixedPax ? 'SÍ (' + catalogPax + ')' : 'NO'}\n\nNuevo Precio Calculado: ${newPrice.toFixed(2)}€\n\nEsta acción estandarizará el bono según el catálogo OFICIAL.`)) {
            return;
        }

        showToast("Estandarizando bono según catálogo...", "info");

        // Generar nuevo desglose de items
        const itemsIncluidos = product.items_incluidos || [];
        let newItems = [];

        if (itemsIncluidos.length > 0) {
            const pricePerItem = newPrice / itemsIncluidos.length;
            newItems = await Promise.all(itemsIncluidos.map(async it => {
                const itemName = (typeof it === 'string') ? it : (it.name || it.producto || product.nombre);

                // CRITICAL: Read space from sub-item catalog if possible, do not guess
                let itemSpace = (typeof it === 'object' && it.espacio) ? it.espacio : '';

                // If sub-item space is not defined in the pack array, try to find the master item for that sub-service
                if (!itemSpace) {
                    const subItemConfig = await window.getItemConfig(itemName);
                    if (subItemConfig && subItemConfig.espacios && subItemConfig.espacios.length > 0) {
                        itemSpace = subItemConfig.espacios[0];
                    }
                }

                // Fallback (Only if really missing) - but user says "Inventing spaces prohibited"
                // If no space found, leave empty or use a generic safe default if logic requires it, but preferably empty for validation later.

                return {
                    itemId: 'it_' + Math.random().toString(36).substr(2, 9),
                    name: itemName.trim(),
                    sessions: (typeof it === 'object' && it.sesiones) ? it.sesiones : 1,
                    space: itemSpace || '', // Strict: read from catalog or empty
                    pax: finalPax,
                    price: pricePerItem,
                    used: 0
                };
            }));
        } else {
            // Single Item
            let itemSpace = product.espacio;
            if (!itemSpace && product.espacios && product.espacios.length > 0) {
                itemSpace = product.espacios[0];
            }

            newItems = [{
                itemId: 'it_' + Math.random().toString(36).substr(2, 9),
                name: product.nombre,
                sessions: currentSessions,
                space: itemSpace || '',
                pax: finalPax,
                price: newPrice,
                used: 0
            }];
        }

        // 3. Actualizar Firestore
        const docId = code;
        const updateData = {
            precio: newPrice,
            importe: newPrice,
            sesiones_totales: currentSessions,
            items_desglosados: newItems,
            recalculated_at: new Date().toISOString()
        };

        await db.collection("spa_vouchers").doc(docId).set(updateData, { merge: true });

        // 4. Actualizar estado local
        const idx = state.bonos.findIndex(b => (b.bono || b.codigo) === code);
        if (idx !== -1) {
            state.bonos[idx] = { ...state.bonos[idx], ...updateData };
        }

        showToast("✅ Bono recalculado y guardado correctamente", "success");

        // 5. Refrescar UI del modal
        closeVoucherModal();
        setTimeout(() => openVoucherManagement(code), 300);

    } catch (error) {
        console.error("[RECALCULATE] Error:", error);
        showToast("Error al recalcular: " + error.message, "error");
    }
};


// ============================================
// FORCE RE-SYNC FROM WOOCOMMERCE
// ============================================
window.resyncVoucherFromWooCommerce = async function () {
    const code = document.getElementById("vm-code")?.value;
    if (!code) {
        showToast("No hay código de bono para sincronizar", "error");
        return;
    }

    // CRITICAL: Don't try to sync local vouchers with WooCommerce
    if (code.startsWith('exc.Loc') || code.startsWith('LOC-')) {
        console.log(`[RESYNC] Skipping WooCommerce sync for local voucher: ${code}`);
        showToast("⚠️ Los bonos locales no se pueden sincronizar con WooCommerce", "warning");
        return;
    }

    const btn = document.getElementById("vm-resync-btn");
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';

    try {
        // Fetch fresh data from WooCommerce using the optimized endpoint
        console.log(`[RESYNC] Fetching fresh data for ${code} from WooCommerce...`);

        let freshVouchers = [];
        if (typeof fetchBonosDirect === 'function') {
            try {
                freshVouchers = await fetchBonosDirect({ per_page: 100 }, 10000);
            } catch (e) {
                console.warn('[RESYNC] Failed with optimized endpoint, trying fallback');
                if (typeof fetchBonosWithFallback === 'function') {
                    freshVouchers = await fetchBonosWithFallback(10000);
                } else {
                    throw new Error("No hay funciones de sincronización disponibles");
                }
            }
        } else {
            if (typeof fetchBonosWithFallback === 'function') {
                freshVouchers = await fetchBonosWithFallback(10000);
            } else {
                throw new Error("No hay funciones de sincronización disponibles");
            }
        }

        if (!Array.isArray(freshVouchers)) {
            throw new Error("Formato de respuesta inválido");
        }

        // Find the matching voucher
        const freshVoucher = freshVouchers.find(v => v.bono === code);
        if (!freshVoucher) {
            throw new Error(`Bono ${code} no encontrado en WooCommerce`);
        }

        console.log(`[RESYNC] Fresh data found:`, freshVoucher);

        // Extract price from fresh data
        let freshPrice = parseFloat(freshVoucher.precio) || parseFloat(freshVoucher.importe) || 0;

        if (freshPrice === 0) {
            freshPrice = parseFloat(freshVoucher.line_total) || parseFloat(freshVoucher.subtotal) ||
                parseFloat(freshVoucher.item_total) || parseFloat(freshVoucher.total) ||
                parseFloat(freshVoucher.order_total) || 0;
        }

        // Sum from items_desglosados if available
        if (freshPrice === 0 && freshVoucher.items_desglosados && Array.isArray(freshVoucher.items_desglosados)) {
            freshPrice = freshVoucher.items_desglosados.reduce((sum, item) => {
                return sum + (parseFloat(item.precio) || parseFloat(item.price) || parseFloat(item.total) || 0);
            }, 0);
        }

        if (freshPrice === 0) {
            throw new Error("No se pudo determinar el precio del bono desde WooCommerce");
        }

        console.log(`[RESYNC] Price extracted: ${freshPrice}€`);

        // Update Firestore
        const docRef = db.collection("spa_vouchers").doc(code);
        const updateData = {
            importe: freshPrice,
            precio: freshPrice,
            items_desglosados: freshVoucher.items_desglosados || [],
            product_id: freshVoucher.product_id || null,
            variation_id: freshVoucher.variation_id || null,
            manual_update: false, // Remove manual protection to allow future auto-syncs
            last_synced: new Date().toISOString()
        };

        // Fallback for IDs if missing in top level
        if (!updateData.product_id && updateData.items_desglosados.length === 1) {
            updateData.product_id = updateData.items_desglosados[0].product_id || updateData.items_desglosados[0].id;
            updateData.variation_id = updateData.items_desglosados[0].variation_id;
        }

        // Also update client info if available
        if (freshVoucher.cliente && freshVoucher.cliente !== "Nombre Cliente") {
            updateData.cliente = freshVoucher.cliente;
        }
        if (freshVoucher.email && freshVoucher.email.includes("@")) {
            updateData.email = freshVoucher.email;
        }
        if (freshVoucher.telefono && freshVoucher.telefono.length > 5) {
            updateData.telefono = freshVoucher.telefono;
        }

        await docRef.update(updateData);

        console.log(`[RESYNC] ✅ Voucher ${code} updated in Firestore`);

        // Update local state
        const localVoucher = state.bonos.find(b => b.bono === code);
        if (localVoucher) {
            Object.assign(localVoucher, updateData);
        }

        showToast(`✅ Bono re-sincronizado: ${freshPrice.toFixed(2)}€`, "success");

        // Reload the modal with fresh data
        setTimeout(() => {
            const modal = document.getElementById("voucher-modal");
            if (modal) modal.style.display = "none";
            setTimeout(() => openVoucherManagement(code), 300);
        }, 1000);

    } catch (error) {
        console.error("[RESYNC] Error:", error);
        showToast("❌ Error al re-sincronizar: " + error.message, "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};


function updatePriceBadgeCalculations(v) {
    const priceBadge = document.getElementById("vm-cat-price");
    if (!priceBadge) return;

    const catalogMatch = findCatalogProduct(v);
    const bonoPrice = parseFloat(v.snapshot_price) || parseFloat(v.importe) || parseFloat(v.precio) || 0;

    if (catalogMatch) {
        // Detect sessions/pax from voucher first, fallback to catalog defaults
        const sessions = parseInt(document.getElementById("vm-sesiones-total").value) || v.sesiones_totales || 1;
        const pax = parseInt(document.getElementById("vm-pax-sesion").value) || v.pax_por_sesion || 1;

        const basePrice = parseFloat(catalogMatch.precio) || 0;
        const catalogPax = parseInt(catalogMatch.personas || catalogMatch.pax || 0);
        const isFixedPax = catalogPax > 0;
        const catalogSessions = parseInt(catalogMatch.sesiones || 1);

        // UI: Lock Pax Input if Fixed in Catalog
        const paxInput = document.getElementById("vm-pax-sesion");
        if (paxInput) {
            if (isFixedPax) {
                paxInput.value = catalogPax;
                paxInput.readOnly = true;
                paxInput.title = "Pax definido por catálogo (fijo)";
                paxInput.style.backgroundColor = "#e2e8f0"; // Disabled look
            } else {
                paxInput.readOnly = false;
                paxInput.title = "";
                paxInput.style.backgroundColor = "";
            }
        }

        const effectivePax = isFixedPax ? catalogPax : (parseInt(document.getElementById("vm-pax-sesion")?.value) || 1);
        const effectiveSessions = parseInt(document.getElementById("vm-sesiones-total")?.value) || 1;

        // Strict Price Calculation
        let calculated = basePrice;

        if (isFixedPax) {
            // Catalog Price IS the total for fixed pax. Do NOT multiply by pax.
            // Only multiply by sessions ratio IF not a pack
            const prodNameLower = (v.producto || '').toLowerCase();
            const hasCatalogItems = catalogMatch.items_incluidos && catalogMatch.items_incluidos.length > 1;
            const isPackName = prodNameLower.includes('ritual') || prodNameLower.includes('pack') || prodNameLower.includes('fantasía') || prodNameLower.includes('sueño') || prodNameLower.includes('bono');
            const isPack = hasCatalogItems || isPackName;

            if (!isPack && effectiveSessions > catalogSessions) {
                calculated = basePrice * (effectiveSessions / catalogSessions);
            }
        } else {
            // Variable Pax -> Price is per person * sessions
            calculated = basePrice * effectivePax * (effectiveSessions / catalogSessions);
        }
        // NUEVA LÓGICA: Si hay items desglosados con extras, recalcular sumando items
        if (state.editingVoucherItems && state.editingVoucherItems.length > 0) {
            // Verificar si hay extras (items NO incluidos en el pack base)
            const hasExtras = state.editingVoucherItems.some(item => {
                const itemNameLower = (item.name || '').toLowerCase();
                const spaceName = (item.space || item.espacio || '').toLowerCase();
                return item.tipo === 'complemento' ||
                    (item.codigo && item.codigo.startsWith('ext.')) ||
                    spaceName === 'complemento' ||
                    itemNameLower.match(/(botella|cava|vino|ramo|flores|fruta|bombones|detalle)/i);
            });

            if (hasExtras) {

                // Calcular precio sumando items individuales
                calculated = 0;

                state.editingVoucherItems.forEach(item => {
                    // Buscar precio del item
                    let itemPrice = 0;

                    // PRIORIDAD 1: Usar precio directo del item si existe
                    if (item.precio) {
                        itemPrice = parseFloat(item.precio) || 0;
                    }
                    // PRIORIDAD 2: Buscar en productos del catálogo
                    else {
                        const catalogItem = state.catalogProducts?.find(p =>
                            p.nombre === item.name ||
                            p.codigo === item.codigo ||
                            p.id === item.product_id
                        );

                        if (catalogItem) {
                            itemPrice = parseFloat(catalogItem.precio) || 0;
                        } else if (item.codigo && item.codigo.startsWith('ext.')) {
                            // Buscar en complementos
                            const complement = state.catalogComplements?.find(c => c.codigo === item.codigo);
                            if (complement) {
                                itemPrice = parseFloat(complement.precio) || 0;
                            }
                        }
                    }

                    // Aplicar multiplicador según tipo de consumo
                    const itemPax = item.pax || effectivePax;
                    const itemSessions = item.sessions || 1;

                    // Determinar si es por persona o por servicio
                    const isPerPerson = item.consumo_tipo === 'por_persona';

                    if (isPerPerson) {
                        calculated += itemPrice * itemPax * itemSessions;
                    } else {
                        // Por servicio (default)
                        calculated += itemPrice * itemSessions;
                    }
                });
            }
        }

        // DISCOUNT LOGIC - ONLY FOR LOCAL VOUCHERS
        const isLocalVoucher = (v.bono && (String(v.bono).startsWith('LOC-') || String(v.bono).startsWith('exc.Loc'))) || v.origen === 'local';

        let effectiveDiscount = 0;
        if (isLocalVoucher) {
            // LIVE INPUT ADJUSTMENT (only for local vouchers)
            const manualInput = document.getElementById("vm-manual-discount");
            const liveDiscount = manualInput ? (parseFloat(manualInput.value) || 0) : 0;

            // Fallback to stored if input empty, but input handles current state
            const storedDiscount = parseFloat(v.discount_percent_max) || parseFloat(v.discount_rate) || 0;
            effectiveDiscount = liveDiscount > 0 ? liveDiscount : (manualInput && manualInput.value === '' ? storedDiscount : 0);

            if (effectiveDiscount > 0) {
                calculated = calculated * (1 - (effectiveDiscount / 100));
            }
        }

        // PRIORIDAD: Mostrar precio pagado si existe, sino el calculado
        if (bonoPrice > 0) {
            priceBadge.textContent = bonoPrice.toFixed(2) + '€';
        } else {
            priceBadge.textContent = calculated.toFixed(2) + '€';
        }

        // Si hay descuadre con el pagado, lo indicamos visualmente
        // Use 5€ tolerance OR 10% of the price (whichever is larger) to account for rounding and minor variations
        const tolerance = Math.max(5.0, calculated * 0.1);

        if (bonoPrice > 0 && Math.abs(bonoPrice - calculated) > tolerance) {
            priceBadge.style.background = '#f59e0b'; // Naranja para WARNING
            priceBadge.title = `Pagado: ${bonoPrice}€ / Catálogo${effectiveDiscount > 0 ? ` (Dto ${effectiveDiscount}%)` : ''}: ${calculated.toFixed(2)}€`;
        } else {
            priceBadge.style.background = '#15803d'; // Verde estándar
            priceBadge.title = effectiveDiscount > 0 ? `Precio ajustado por descuento local (-${effectiveDiscount}%)` : "Coincide con tarifa";
        }
    } else {
        priceBadge.textContent = (bonoPrice > 0 ? bonoPrice : 0) + '€';
        priceBadge.style.background = '#15803d';
        priceBadge.title = "";
    }

    // --- VISIBILIDAD DE BOTONES DE RECTIFICACIÓN (Nueva lógica) ---
    // Si el precio está en verde (#15803d), significa que coincide o es correcto -> OCULTAR BOTONES
    const isGreen = priceBadge.style.background === 'rgb(21, 128, 61)' || priceBadge.style.background === '#15803d';
    const isNumeric = /^\d+$/.test(String(v.bono || v.codigo || ''));
    const isLocal = isNumeric || (v.bono && (String(v.bono).startsWith('LOC-') || String(v.bono).startsWith('exc.Loc'))) || v.origen === 'local';

    const recalculateBtn = document.getElementById("vm-recalculate-btn");
    const resyncBtn = document.getElementById("vm-resync-btn");

    if (recalculateBtn) {
        // "Recalcular" solo para ventas locales con discrepancias
        recalculateBtn.style.display = (isLocal && !isGreen) ? "block" : "none";
    }

    if (resyncBtn) {
        // "Re-sync WC" solo para ventas online (WooCommerce) con discrepancias
        resyncBtn.style.display = (!isLocal && !isGreen) ? "block" : "none";
    }

    // --- BOTÓN GLOBAL DE REPARACIÓN (Solo si hay basura en el estado) ---
    const repairBtn = document.getElementById("repair-vouchers-btn");
    if (repairBtn && state.bonos) {
        const hasGarbage = state.bonos.some(b => {
            const code = String(b.bono || b.codigo || '');
            return code === '-' || /^\d+$/.test(code);
        });
        repairBtn.style.display = hasGarbage ? "block" : "none";
    }
}

/**
 * REPARACIÓN Y NORMALIZACIÓN ATÓMICA
 * Elimina duplicados, borra el bono '-', y normaliza numéricos a Tarj-
 */
window.repararBonosDuplicados = async function () {
    // 1. Identificar candidatos ANTES del confirm para poder listarlos
    const codes = state.bonos.map(b => String(b.bono || b.codigo || '').trim());
    const toDeleteDocs = []; // { id, code, label }
    const toMigrateDocs = []; // { bono, code }

    for (const b of state.bonos) {
        let code = String(b.bono || b.codigo || '').trim();
        let docId = b.id || code;

        // Caso A: Bono '-' o vacío (Corrupto)
        if (code === '-' || !code || code.length === 0) {
            toDeleteDocs.push({ id: docId, code: code, label: 'Corrupto/Vacío (-)' });
            continue;
        }

        // Caso B: Numérico puro
        if (/^\d+$/.test(code)) {
            const prefixed = `Tarj-${code}`;
            if (codes.includes(prefixed)) {
                // Ya existe el normalizado, marcamos el numérico para borrar
                toDeleteDocs.push({ id: docId, code: code, label: `Duplicado (ya existe Tarj-${code})` });
            } else {
                // Solo existe el numérico, hay que migrarlo
                toMigrateDocs.push(b);
            }
        }
    }

    if (toDeleteDocs.length === 0 && toMigrateDocs.length === 0) {
        return showToast("No se encontraron bonos para reparar", "info");
    }

    // Preparar mensaje detallado
    let msg = "¡Atención! Se han detectado los siguientes ajustes:\n\n";

    if (toDeleteDocs.length > 0) {
        msg += "🗑️ BONOS A ELIMINAR (Duplicados o Basura):\n";
        toDeleteDocs.forEach(d => msg += ` • ${d.code} -> ${d.label}\n`);
        msg += "\n";
    }

    if (toMigrateDocs.length > 0) {
        msg += "🔄 BONOS A NORMALIZAR (a formato Tarj-XXXX):\n";
        toMigrateDocs.forEach(b => msg += ` • ${b.bono || b.codigo} -> Tarj-${b.bono || b.codigo}\n`);
        msg += "\n";
    }

    msg += "¿Deseas proceder con la reparación automática?";

    if (!confirm(msg)) return;

    showToast("🕒 Iniciando reparación detallada...", "warning");

    const deletedNames = [];
    const migratedNames = [];

    // Ejecutar eliminaciones
    for (const target of toDeleteDocs) {
        try {
            await db.collection("spa_vouchers").doc(target.id).delete();
            deletedCount++;
            deletedNames.push(target.code);
        } catch (e) {
            console.error("[REPAIR] Error borrando", target.id, e);
        }
    }

    // Ejecutar migraciones (Crear -> Mover Reservas -> Eliminar Antiguo)
    const collections = [
        'reservas_spa', 'reservas_suite', 'reservas_panacea',
        'reservas_peluqueria', 'reservas_vip', 'reservas_restaurante',
        'reservas_gimnasio', 'reservas_complementos', 'reservas_rest',
        'reservas_menu', 'reservas', 'reservas_evento'
    ];

    for (const b of toMigrateDocs) {
        try {
            const oldCode = String(b.bono || b.codigo);
            const docId = b.id || oldCode;
            const newCode = `Tarj-${oldCode}`;

            console.log(`[REPAIR] Migrando: ${oldCode} -> ${newCode} (ID: ${docId})`);

            // 1. Clonar registro con el nuevo ID (usamos el código como ID para que sea canónico)
            const newBonoData = {
                ...b,
                bono: newCode,
                codigo: newCode,
                migration_repair: true,
                updated_at: new Date().toISOString()
            };
            if (newBonoData.id) delete newBonoData.id;

            await db.collection("spa_vouchers").doc(newCode).set(newBonoData);

            // 2. Mover Reservas en bloque
            for (const col of collections) {
                const snap = await db.collection(col).where("bono", "==", oldCode).get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.forEach(doc => batch.update(doc.ref, { bono: newCode }));
                    await batch.commit();
                }
            }

            // 3. ELIMINAR EL ANTIGUO INMEDIATAMENTE usando su ID REAL
            await db.collection("spa_vouchers").doc(docId).delete();
            migratedCount++;
            migratedNames.push(`${oldCode} -> ${newCode}`);
        } catch (e) {
            console.error("[REPAIR] Error migrando", b.bono, e);
        }
    }

    let finalMsg = "✅ OPERACIÓN COMPLETADA:\n\n";
    if (deletedNames.length > 0) {
        finalMsg += `🗑️ ELIMINADOS (${deletedNames.length}):\n${deletedNames.join(', ')}\n\n`;
    }
    if (migratedNames.length > 0) {
        finalMsg += `🔄 NORMALIZADOS (${migratedNames.length}):\n${migratedNames.join('\n')}\n\n`;
    }
    finalMsg += "La página se recargará para mostrar los cambios.";

    alert(finalMsg); // Feedback modal for user clarity

    // Recargar estado
    if (typeof cargarBonos === 'function') await cargarBonos();
};






