// bonos.js - Lógica de Gestión de Bonos
// Versión Consolidada con Carrito, Reservas y Utilidades Locales

// Estado local específico para Bonos
const state = {
    bonos: [],
    catalogProducts: [], // Para el selector de venta local
    lvCart: [] // Carrito de venta local
};

// --- INIT ---
const db = window.db || firebase.firestore();

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
            // Si el usuario escribe, limpiamos la fecha para buscar en todo el histórico
            if (e.target.value.length > 0) {
                const dateInput = document.getElementById("voucher-date");
                if (dateInput) dateInput.value = "";
            }
            renderBonosFromState();
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
function findCatalogProduct(voucher) {
    if (!voucher || !state.catalogProducts.length) return null;

    // 1. Intentar match por product_id (WooCommerce ID)
    if (voucher.product_id) {
        const idMatch = state.catalogProducts.find(p =>
            p.wc_id === String(voucher.product_id) ||
            p.id === `wc-${voucher.product_id}`
        );
        if (idMatch) return idMatch;
    }

    // 2. Fallback a match por nombre + precio
    const productName = (voucher.producto || '').toLowerCase();
    const voucherPrice = parseFloat(voucher.importe) || parseFloat(voucher.precio) || 0;
    if (!productName) return null;

    // Exact name match (Highest priority)
    let match = state.catalogProducts.find(p => p.nombre.toLowerCase() === productName);
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

// --- CARGA DE DATOS ---


// Helper para redirección
function goToReservation(client, service, code) {
    service = unescape(service).trim();
    client = unescape(client).trim();
    if (!confirm(`¿Ir al calendario para reservar '${service}' para ${client}?`)) return;

    // 1. Buscar producto en catálogo (Match exacto o parcial)
    const lowerService = service.toLowerCase();
    let prod = state.catalogProducts.find(p => p.nombre.toLowerCase() === lowerService);

    // Si no encuentra exacto, intenta "starts with" o includes
    if (!prod) {
        prod = state.catalogProducts.find(p => p.nombre.toLowerCase().includes(lowerService) || lowerService.includes(p.nombre.toLowerCase()));
    }

    let category = prod ? (prod.categoria || '').toLowerCase() : '';
    let space = prod ? (prod.espacio || '').toLowerCase() : '';

    // 2. Determinar módulo (type)
    let type = 'spa'; // Default

    // Use explicit space if defined
    if (space && space !== '') {
        type = space;
    } else {
        // Fallback checks on category AND name (if product not found or no category)
        const checkStr = (category + ' ' + lowerService).trim();

        if (checkStr.includes('peluqueria') || checkStr.includes('estetica') || checkStr.includes('manicura') || checkStr.includes('pedicura') || checkStr.includes('depilacion')) {
            type = 'peluqueria';
        } else if (checkStr.includes('suite')) {
            type = 'suite';
        } else if (checkStr.includes('masaje') || checkStr.includes('tratamiento') || checkStr.includes('ritual') || checkStr.includes('facial') || checkStr.includes('envoltura') || checkStr.includes('panacea') || checkStr.includes('maderoterapia') || checkStr.includes('bambu')) {
            type = 'panacea';
        }
    }

    // Corrección final: Si se determinó 'spa' (por defecto o catálogo) pero el nombre GRITA masaje, forzar panacea
    // Esto arregla casos donde el catálogo tenga mal puesto el espacio o no se encuentre
    if (type === 'spa' && (lowerService.includes('masaje') || lowerService.includes('tratamiento') || lowerService.includes('ritual') || lowerService.includes('facial'))) {
        type = 'panacea';
    }

    const url = `reservas.html?type=${type}&action=new&client=${encodeURIComponent(client)}&service=${encodeURIComponent(service)}&voucher=${code}`;
    window.location.href = url;
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
                imagen: data.imagen || ''
            });
        });
        state.catalogProducts.sort((a, b) => a.nombre.localeCompare(b.nombre));
        console.log("Catálogo cargado para bonos:", state.catalogProducts.length, "productos");
    } catch (err) {
        console.error("Error cargando catálogo para bonos:", err);
    }
}


async function cargarBonos() {
    const tableBody = document.getElementById("vouchers-table-body");
    if (!tableBody) return;

    // Feedback visual
    const btn = document.getElementById("sync-vouchers-btn");
    const originalText = btn ? btn.innerHTML : 'Sincronizar';
    if (btn) {
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        btn.style.opacity = "0.7";
    }

    if (state.bonos.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;" class="muted">Cargando bonos...</td></tr>`;
    }

    let persistentData = {};

    try {
        // 1. Carga desde Firestore
        const snapshot = await db.collection("spa_vouchers").get();
        snapshot.forEach(doc => persistentData[doc.id] = doc.data());

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
            sincronizarConTienda(persistentData, btn, originalText);
        } else {
            restoreButton(btn, originalText);
        }

    } catch (err) {
        console.error("Error cargando bonos:", err);
        tableBody.innerHTML = `<tr><td colspan="7" class="error" style="text-align:center;">Error: ${err.message}</td></tr>`;
        restoreButton(btn, originalText);
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

        const webVouchers = shopVouchers.map(b => {
            // Fix potential undefined issue for 'b' if not object
            if (!b || typeof b !== 'object') return null;

            const persisted = persistentData[b.bono];
            let finalState = 'pending';

            if (persisted) {
                const isManuallyManaged = persisted.notas_internas || persisted.fecha_validez || persisted.manual_update;
                finalState = isManuallyManaged ? persisted.estado : 'pending';
            } else {
                const docRef = db.collection("spa_vouchers").doc(b.bono);
                batch.set(docRef, { ...b, estado: 'pending', synced_at: new Date().toISOString() });
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

    if (!productName && !productId) return { total: 1, paxPerSession: 1 };
    const lower = productName.toLowerCase().trim();

    // 1. Intentar buscar en el catálogo (state.catalogProducts)
    let catalogMatch = null;
    if (productId) {
        const idStr = String(productId);
        catalogMatch = state.catalogProducts.find(p =>
            p.wc_id === idStr || p.id === `wc-${idStr}` || String(p.id) === idStr
        );
    }

    if (!catalogMatch && lower) {
        catalogMatch = state.catalogProducts.find(p =>
            p.nombre.toLowerCase() === lower ||
            lower.includes(p.nombre.toLowerCase())
        );
    }

    let detectedTotal = 1;
    let textDetected = false;

    // 2. Detección por texto (Regex más flexible)
    if (lower) {
        const matchPlus = lower.match(/\((\d+)\s*\+\s*(\d+)\)/); // (5+1) o (5 + 1)
        const matchBono = lower.match(/bono\s*(\d+)/i); // Bono 10, Bono10
        const matchSes = lower.match(/(\d+)\s*sesiones/i); // 10 sesiones
        const matchX = lower.match(/(\d+)\s*x\s+/i); // 10 x circuito

        if (matchPlus) {
            detectedTotal = parseInt(matchPlus[1]) + parseInt(matchPlus[2]);
            textDetected = true;
        } else if (matchBono) {
            detectedTotal = parseInt(matchBono[1]);
            textDetected = true;
        } else if (matchSes) {
            detectedTotal = parseInt(matchSes[1]);
            textDetected = true;
        } else if (matchX) {
            detectedTotal = parseInt(matchX[1]);
            textDetected = true;
        } else {
            if (lower.includes("b5")) { detectedTotal = 5; textDetected = true; }
            else if (lower.includes("b10")) { detectedTotal = 10; textDetected = true; }
        }
    }

    // 3. Consolidar resultados
    let total = 1;
    let pax = 1;

    if (catalogMatch) {
        total = catalogMatch.sesiones || 1;
        pax = catalogMatch.pax || 1;

        // --- LÓGICA DE RATIO POR PRECIO (MEJORA) ---
        // Si el precio del bono es múltiplo del precio del catálogo, 
        // ajustamos sesiones o pax según el nombre.
        if (catalogMatch.precio > 0 && voucherPrice > 0) {
            const catalogPrice = parseFloat(catalogMatch.precio);
            const ratio = Math.round(voucherPrice / catalogPrice);

            // Solo aplicamos multiplicador si el ratio es un múltiplo claro (> 1.1 para evitar redondeos)
            // y si el precio del bono es significativamente mayor.
            if (ratio > 1 && Math.abs((catalogPrice * ratio) - voucherPrice) < 2) {
                const isBono = lower.includes("bono") || lower.includes("sesion") || lower.includes("pack");

                if (isBono || ratio > 3) {
                    // Si parece un bono o son muchas unidades, multiplicamos sesiones
                    total = (catalogMatch.sesiones || 1) * ratio;
                } else {
                    // Si son pocas unidades (2 o 3) y no dice "bono", suele ser PAX (Dúo/Trío)
                    pax = (catalogMatch.pax || 1) * ratio;
                }
            }
        }

        // Si el catálogo dice 1 pero el nombre dice más explícitamente (ej: "Bono 10"), priorizamos el nombre
        if (total === 1 && detectedTotal > 1) {
            total = detectedTotal;
        }
    } else {
        total = detectedTotal;
    }

    // Detección de PAX por palabras clave (sobreescribe si es explícito)
    if (lower && (lower.includes("pareja") || lower.includes("2 personas") || lower.includes("doble") || lower.includes("duo") || lower.includes("2 pax"))) {
        pax = 2;
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

        if (b.estado === 'completed') { badgeClass = 'st-completed'; statusLabel = 'CANJEADO'; }
        else if (b.estado === 'expired') { badgeClass = 'st-expired'; statusLabel = 'CADUCADO'; }
        else if (b.estado === 'partially') { badgeClass = 'st-partial'; statusLabel = `PARCIAL ${b.sesiones_usadas || 0}/${dbTotal}`; }

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

function openVoucherManagement(code) {
    const v = state.bonos.find(b => b.bono === code);
    if (!v) return;

    const detected = detectSessions(v);

    document.getElementById("vm-title-code").textContent = code;
    document.getElementById("vm-code").value = code;
    document.getElementById("vm-cliente").value = v.cliente || '';
    document.getElementById("vm-email").value = v.email || '';
    document.getElementById("vm-producto").value = v.producto || '';
    document.getElementById("vm-producto").value = v.producto || '';
    document.getElementById("vm-fecha-compra").value = v.fecha || '';

    // Renderizar historial de uso (async)
    renderVoucherHistory(code);

    // --- Vincular con Catálogo y Detectar Servicios ---
    const catalogInfo = document.getElementById("vm-catalog-info");

    // Función para detectar servicios en el nombre del producto
    // Ahora usa findCatalogProduct para mejor matching por ID/precio
    function detectServicesInProduct(voucher) {
        const services = [];

        // Usar la función centralizada que considera precio e ID
        const primaryMatch = findCatalogProduct(voucher);

        if (primaryMatch) {
            // Unificamos con la detección global de sesiones del bono
            let sessionsCount = primaryMatch.sesiones || 1;
            if (sessionsCount === 1 && detected.total > 1) {
                sessionsCount = detected.total;
            }

            let paxCount = primaryMatch.pax || 1;
            if (paxCount === 1 && detected.paxPerSession > 1) {
                paxCount = detected.paxPerSession;
            }

            // SI TIENE ITEMS INCLUIDOS (PACK DESGLOSADO)
            if (primaryMatch.items_incluidos && primaryMatch.items_incluidos.length > 0) {
                primaryMatch.items_incluidos.forEach(itemName => {
                    services.push({
                        name: itemName.trim(),
                        imagen: primaryMatch.imagen, // Usamos la misma imagen del pack por ahora
                        descripcion: `Parte del pack: ${primaryMatch.nombre}`,
                        // Asumimos 1 sesión de cada item por cada sesión del pack
                        // Si es un Pack de 2 personas, cada item es para 2 personas también.
                        sessions: sessionsCount, // Mantenemos el total de sesiones/usos del bono
                        precio: 0, // Precio incluido en bono
                        pax: paxCount
                    });
                });
            } else {
                // SI NO, MODALIDAD ESTÁNDAR (O INTENTO DE PARSEO DE STRING SI TIENE "+")
                if (primaryMatch.nombre.includes("+") && !primaryMatch.nombre.toLowerCase().includes("pack")) {
                    // Intento muy básico de separar "Circuito + Masaje" si no está definido en catálogo
                    const parts = primaryMatch.nombre.split("+");
                    parts.forEach(part => {
                        services.push({
                            name: part.trim(),
                            imagen: primaryMatch.imagen,
                            descripcion: primaryMatch.descripcion,
                            sessions: sessionsCount,
                            precio: 0,
                            pax: paxCount
                        });
                    });
                } else {
                    // CASO NORMAL
                    services.push({
                        name: primaryMatch.nombre,
                        imagen: primaryMatch.imagen,
                        descripcion: primaryMatch.descripcion || primaryMatch.incluye || '',
                        sessions: sessionsCount,
                        precio: primaryMatch.precio || 0,
                        pax: paxCount
                    });
                }
            }
        }

        return services;
    }

    // Usar items_desglosados si existe, si no, detectar del nombre
    let detectedServices = [];

    if (v.items_desglosados && v.items_desglosados.length > 0) {
        detectedServices = v.items_desglosados;
    } else {
        // Detectar servicios del nombre del producto - ahora pasamos el voucher completo
        detectedServices = detectServicesInProduct(v);
    }

    // Debug logging
    console.log("Bono:", v.bono, "Producto:", v.producto, "Importe:", v.importe);
    console.log("Servicios detectados:", detectedServices);

    // Mostrar el primer servicio en la vista previa del catálogo
    if (detectedServices.length > 0) {
        const firstService = detectedServices[0];

        // Ensure displayDesc is a string (could be array from items_incluidos)
        let rawDesc = firstService.descripcion || firstService.incluye || '';
        if (Array.isArray(rawDesc)) {
            rawDesc = rawDesc.join(', ');
        }
        const displayDesc = String(rawDesc || 'Sin descripción en catálogo');

        console.log("Primer servicio:", firstService.name, "Pax:", firstService.pax, "Desc:", displayDesc.substring(0, 50));

        document.getElementById("vm-cat-img").src = firstService.imagen || 'zenith-icon.png';
        document.getElementById("vm-cat-name").textContent = firstService.name;
        document.getElementById("vm-cat-desc").textContent = displayDesc;

        // Mostrar precio pagado
        const priceEl = document.getElementById("vm-cat-price");
        if (priceEl) {
            const pricePaid = parseFloat(v.importe) || parseFloat(v.precio) || 0;
            priceEl.textContent = `${pricePaid.toFixed(2)}€`;
        }

        if (detectedServices.length > 1) {
            document.getElementById("vm-cat-desc").textContent += ` (+${detectedServices.length - 1} servicio(s) más)`;
        }

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


    // -- LISTA DE SERVICIOS CON RESERVA --
    const productInput = document.getElementById("vm-producto");
    const listDivId = 'vm-merged-list';
    const container = productInput.parentNode;
    let listDiv = document.getElementById(listDivId);

    if (detectedServices.length > 0) {
        const detalle = detectedServices.map(i => `• ${i.name} (${i.sessions} ses)`).join('\n');
        productInput.title = detalle;

        if (!listDiv) {
            listDiv = document.createElement('div');
            listDiv.id = listDivId;
            listDiv.style = "font-size:0.8rem; color:#334155; margin-top:6px; border:1px solid #cbd5e1; padding:8px; border-radius:6px; max-height:150px; overflow-y:auto; background:#f1f5f9;";
            container.appendChild(listDiv);
        }

        listDiv.innerHTML = `<div style="margin-bottom:6px; font-weight:600; color:#475569;">Servicios Incluidos:</div>`;
        listDiv.innerHTML += detectedServices.map((item, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:6px; margin-bottom:4px; border-radius:4px; border:1px solid #e2e8f0;">
                <div style="display: flex; gap: 8px; align-items: center; flex: 1;">
                    ${item.imagen ? `<img src="${item.imagen}" referrerpolicy="no-referrer" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;">` : ''}
                    <span>${item.name} <small style="color:#64748b;">(${item.sessions} ses)</small></span>
                </div>
                <button class="btn btn-sm btn-outline" style="font-size:0.75rem; padding:2px 8px; border-color: #2563eb; color: #2563eb;" 
                    onclick="goToReservation('${escape(v.cliente || '')}', '${escape(item.name)}', '${v.bono}')">
                    <i class="fas fa-calendar-plus"></i> Reservar
                </button>
            </div>
       `).join('');
        listDiv.style.display = 'block';

    } else {
        if (listDiv) listDiv.style.display = 'none';
    }
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
    const badge = document.getElementById("vm-status-badge");
    const statusMap = {
        'pending': 'ACTIVO',
        'completed': 'CANJEADO',
        'expired': 'CADUCADO',
        'partially': 'EN USO'
    };

    let label = statusMap[v.estado] || v.estado.toUpperCase();

    const days = getDaysRemaining(v);
    // Add days if active/partial
    if ((v.estado === 'pending' || v.estado === 'partially') && days !== null) {
        if (days < 0) label += ` (Caducó hace ${Math.abs(days)} días)`;
        else label += ` (Quedan ${days} días)`;
    }

    badge.textContent = label;
    badge.className = `st-badge st-${v.estado}`;

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
        manual_update: true
    };

    // Auto estado logic
    if (updates.sesiones_usadas >= updates.sesiones_totales) {
        updates.estado = 'completed';
    } else if (updates.sesiones_usadas > 0) {
        updates.estado = 'partially';
    } else {
        updates.estado = 'pending';
    }

    try {
        btn.disabled = true;
        btnText.textContent = "GUARDANDO...";
        await db.collection("spa_vouchers").doc(code).set(updates, { merge: true });
        showToast("Cambios guardados", "success");
        closeVoucherModal();
        cargarBonos();
    } catch (err) {
        showToast("Error guardando: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
    }
}

function marcarCanjeado() {
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
    saveVoucherChanges();
}

function reactivarBono() {
    if (!confirm("¿Quieres reactivar este bono y poner las sesiones usadas a 0?")) return;
    document.getElementById("vm-sesiones-usadas").value = 0;
    saveVoucherChanges();
}

async function deleteVoucher() {
    if (!confirm("¿Seguro que quieres eliminar este bono? Esta acción es irreversible.")) return;
    const code = document.getElementById("vm-code").value;
    try {
        await db.collection("spa_vouchers").doc(code).delete();
        showToast("Bono eliminado", "success");
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

    state.catalogProducts.forEach(prod => {
        select.innerHTML += `<option value="${prod.nombre}">${prod.nombre}</option>`;
    });

    document.getElementById("local-voucher-modal").style.display = "flex";

    // Reset inputs
    document.getElementById("lv-product-details").style.display = 'none';
    document.getElementById("lv-price").value = '';
    document.getElementById("lv-sessions").value = 1;
}

function closeLocalVoucherModal() {
    document.getElementById("local-voucher-modal").style.display = "none";
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
                <div style="font-size: 0.7rem; color: #64748b;">${item.sessions} ses. | ${item.price.toFixed(2)}€</div>
            </div>
            <button onclick="removeFromCart(${index})" style="background:none; border:none; color: #ef4444; cursor: pointer;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    const totalPrice = state.lvCart.reduce((sum, i) => sum + i.price, 0);
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

    const totalPrice = state.lvCart.reduce((sum, i) => sum + i.price, 0);
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
        items_desglosados: state.lvCart
    };

    try {
        const btn = document.getElementById("lv-save-btn");
        const btnText = btn.querySelector("span") || btn;
        const originalText = btnText.textContent;

        btn.disabled = true;
        if (btnText.tagName === 'SPAN') btnText.textContent = "CREANDO...";
        else btn.textContent = "CREANDO...";

        await db.collection("spa_vouchers").doc(code).set(newVoucher);
        showToast("Bono local creado", "success");
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
function goToReservation(client, service, code) {
    if (!confirm(`¿Ir al calendario para reservar '${unescape(service)}' para ${unescape(client)}?`)) return;
    const url = `reservas.html?action=new&client=${client}&service=${service}&voucher=${code}`;
    window.location.href = url;
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

                await db.collection('bonos').doc(bonoCode).set(bonoData);
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
