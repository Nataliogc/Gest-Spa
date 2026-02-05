// app-core.js - Funciones compartidas y utilidades

// --- CONSTANTES ---
const URL_BONOS = "https://cumbriabienestar.es/wp-json/bonos/v1/listado/";
const URL_BONOS_OPTIMIZED = "https://cumbriabienestar.es/wp-json/robahotel/v1/bonos";

// --- CORS PROXY FALLBACKS ---
const CORS_PROXIES = [
    { name: 'CorsProxy.io', url: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}` },
    { name: 'AllOrigins', url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}` },
    { name: 'ThingProxy', url: (target) => `https://thingproxy.freeboard.io/fetch/${target}` },
    { name: 'CorsAnywhere', url: (target) => `https://cors-anywhere.herokuapp.com/${target}` }
];

/**
 * Generic fetch with Proxy Fallback
 * Tries multiple CORS proxies if the request fails
 */
window.fetchWithProxyFallback = async function (targetUrl, options = {}, timeout = 25000) {
    const errors = [];

    for (const proxy of CORS_PROXIES) {
        try {
            console.log(`[PROXY] Trying ${proxy.name} for:`, targetUrl);
            const proxyUrl = proxy.url(targetUrl);
            const response = await fetchWithTimeout(proxyUrl, options, timeout);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            console.log(`[PROXY] Success with ${proxy.name}`);
            return response;

        } catch (error) {
            console.warn(`[PROXY] ${proxy.name} failed:`, error.message);
            errors.push({ proxy: proxy.name, error: error.message });
            continue;
        }
    }

    const aggregateError = new Error('All CORS proxies failed');
    aggregateError.details = errors;
    throw aggregateError;
};

// Fetch with timeout wrapper
window.fetchWithTimeout = async function (url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            const timeoutError = new Error(`Request timeout after ${timeout}ms`);
            timeoutError.code = 'TIMEOUT';
            throw timeoutError;
        }
        throw error;
    }
};

// Get voucher endpoint with fallback support
window.getBonoEndpoint = () => {
    const cacheBuster = `?_=${Date.now()}`;
    return URL_BONOS + cacheBuster;
};

// Fetch bonos from optimized endpoint (direct, no CORS proxy)
window.fetchBonosDirect = async function (params = {}, timeout = 10000) {
    const url = new URL(URL_BONOS_OPTIMIZED);

    // Add query parameters
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
            url.searchParams.append(key, params[key]);
        }
    });

    console.log('[OPTIMIZED] Fetching from:', url.toString());

    const response = await fetchWithTimeout(url.toString(), {}, timeout);

    if (!response.ok) {
        const error = new Error(`HTTP Error: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    // Check cache status
    const cacheStatus = response.headers.get('X-Cache');
    if (cacheStatus) {
        console.log(`[OPTIMIZED] Cache status: ${cacheStatus}`);
    }

    return await response.json();
};

// Try fetching with multiple CORS proxies (legacy fallback)
window.fetchBonosWithFallback = async function (params = {}, timeout = 10000) {
    // Handle overload: shift if first arg is number
    if (typeof params === 'number') {
        timeout = params;
        params = {};
    }

    let targetUrl = getBonoEndpoint();

    // Append params to targetUrl
    const urlObj = new URL(targetUrl);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
            urlObj.searchParams.append(key, params[key]);
        }
    });
    targetUrl = urlObj.toString();

    const errors = [];

    // Try each CORS proxy in sequence
    for (const proxy of CORS_PROXIES) {
        try {
            console.log(`[CORS] Trying ${proxy.name}...`);
            const proxyUrl = proxy.url(targetUrl);
            const response = await fetchWithTimeout(proxyUrl, {}, timeout);

            if (!response.ok) {
                const error = new Error(`HTTP Error: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            console.log(`[CORS] Success with ${proxy.name}`);
            return await response.json();

        } catch (error) {
            console.warn(`[CORS] ${proxy.name} failed:`, error.message);
            errors.push({ proxy: proxy.name, error: error.message });

            // If it's a timeout, try next proxy immediately
            // If it's another error, also try next proxy
            continue;
        }
    }

    // All proxies failed
    const aggregateError = new Error('All CORS proxies failed');
    aggregateError.details = errors;
    aggregateError.code = 'ALL_PROXIES_FAILED';
    throw aggregateError;
};

window.setupNavigation = function () {
    const burger = document.querySelector('.burger-menu');
    const nav = document.querySelector('.nav-links');
    if (burger && nav) {
        burger.addEventListener('click', () => {
            nav.classList.toggle('nav-active');
            burger.classList.toggle('toggle');
        });
    }
};

// --- NOTIFICACIONES (TOAST) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// --- TEMA (OSCURO/CLARO) ---
function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // Actualizar icono si existe
    const icon = document.querySelector(".theme-toggle i");
    if (icon) {
        icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}

// Aplicar tema al cargar
function applyTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        const icon = document.querySelector(".theme-toggle i");
        if (icon) icon.className = "fas fa-sun";
    }
}

// --- UTILIDADES DE FECHA/FORMATO ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Unified lookup for service/item configuration from spa_item_master.
 * Prevents repeating logic across modules.
 */
window.getItemConfig = async function (serviceName) {
    if (!serviceName) return null;
    try {
        // Use global cache to reduce reads
        if (!window._itemMasterCache) {
            console.log("[CONFIG] Initializing Item Master Cache...");
            const snap = await db.collection("spa_item_master").get();
            window._itemMasterCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Periodically refresh cache (every 5 mins)
            setTimeout(() => { window._itemMasterCache = null; }, 300000);
        }

        const normSearch = serviceName.toLowerCase().trim();
        return window._itemMasterCache.find(item =>
            item.name.toLowerCase().trim() === normSearch ||
            (item.code && item.code.toLowerCase().trim() === normSearch)
        ) || null;
    } catch (e) {
        console.error("Error fetching item config:", e);
        return null;
    }
};

/**
 * Normalizes a list of items (usually from a pack) to their master equivalents.
 */
window.getDesgloseConfig = async function (itemsArray) {
    if (!itemsArray || !Array.isArray(itemsArray)) return [];
    const results = [];
    for (const itemName of itemsArray) {
        const config = await window.getItemConfig(itemName);
        results.push({
            name: itemName,
            config: config
        });
    }
    return results;
};

/**
 * Returns CSS class for payment status
 */
window.getPaymentStatusClass = function (status) {
    if (!status) return 'badge-pending';
    switch (status.toLowerCase()) {
        case 'paid': return 'badge-paid';
        case 'partial': return 'badge-partial';
        case 'pending_before_service': return 'badge-partial';
        default: return 'badge-pending';
    }
};

/**
 * Aggregates all payments recorded for a specific date across all collections.
 * @param {string} dateStr ISO Date (YYYY-MM-DD)
 */
window.fetchDailyRevenue = async function (dateStr) {
    if (!dateStr) return null;

    const collections = ["spa_reservas", "reservas_gimnasio", "reservas_complementos"];
    const report = {
        date: dateStr,
        methods: { "Efectivo": 0, "Tarjeta": 0, "Bizum": 0, "Otros": 0 },
        users: {},
        transactions: [],
        total: 0
    };

    try {
        for (const col of collections) {
            // We fetch all reservations for that specific date
            const snapshot = await db.collection(col).where("fecha", "==", dateStr).get();

            snapshot.forEach(doc => {
                const res = doc.data();
                if (res.payment && res.payment.history) {
                    res.payment.history.forEach(trx => {
                        // trx: { fecha, importe, metodo, usuario }
                        // Note: trx.fecha is a full ISO timestamp of when the payment was recorded.
                        // We check if the payment WAS RECORDED on the requested date.
                        // Actually, for "Cierre de Caja" users usually want payments RECORDED today,
                        // even if the reservation is for tomorrow.
                        const trxDate = trx.fecha.split('T')[0];
                        if (trxDate === dateStr) {
                            const amount = parseFloat(trx.importe) || 0;
                            const method = trx.metodo || "Otros";
                            const user = trx.usuario || "recepcion";

                            report.methods[method] = (report.methods[method] || 0) + amount;
                            report.users[user] = (report.users[user] || 0) + amount;
                            report.total += amount;

                            report.transactions.push({
                                ...trx,
                                resId: doc.id,
                                client: res.nombre,
                                service: res.servicio,
                                module: col
                            });
                        }
                    });
                }
            });
        }

        // Sort transactions by time
        report.transactions.sort((a, b) => a.fecha.localeCompare(b.fecha));

        return report;
    } catch (e) {
        console.error("Error generating Revenue Report:", e);
        throw e;
    }
};

/**
 * Creates a parent reservation and linked child reservations for a pack.
 * Uses Firestore batch writes for atomicity.
 * 
 * @param {Object} parentData - Base reservation data (client, total, voucher, etc.)
 * @param {Array} childItems - Array of objects: { name, space, collection, hora, duracion, pax }
 * @returns {Object} { parentId, childIds }
 */
window.createPackReservations = async function (parentData, childItems) {
    if (!parentData || !childItems || childItems.length === 0) {
        throw new Error("createPackReservations: Missing parent data or child items.");
    }

    const batch = db.batch();
    const parentRef = db.collection("spa_reservas_packs").doc();
    const parentId = parentRef.id;
    const childIds = [];

    // Create parent document
    const parentPayload = {
        ...parentData,
        is_pack_parent: true,
        childs: [], // Will be updated after child creation
        created_at: new Date().toISOString(),
        status: parentData.status || 'confirmada'
    };

    // Create child documents
    childItems.forEach((child, index) => {
        const childCollection = child.collection || "spa_reservas";
        const childRef = db.collection(childCollection).doc();
        childIds.push(childRef.id);

        const childPayload = {
            parent_id: parentId,
            pack_sequence_index: index,
            service_item: child.name,
            is_pack_element: true,
            nombre: parentData.nombre,
            tel: parentData.tel || "",
            fecha: child.fecha || parentData.fecha,
            hora: child.hora,
            duracion: child.duracion || 60,
            pax: child.pax || parentData.pax || 1,
            servicio: child.name,
            origen: parentData.origen,
            hotel: parentData.hotel || "",
            hab: parentData.hab || "",
            bono: parentData.bono || "",
            status: 'confirmada',
            created_at: new Date().toISOString(),
            // Child has NO payment info
        };

        batch.set(childRef, childPayload);
    });

    // Update parent with child IDs
    parentPayload.childs = childIds;
    batch.set(parentRef, parentPayload);

    await batch.commit();

    console.log(`[PACK] Created parent ${parentId} with ${childIds.length} children:`, childIds);

    return { parentId, childIds };
};

/**
 * Cancels a pack (parent + all children).
 * @param {string} parentId - ID of the parent reservation.
 */
window.cancelPackReservation = async function (parentId) {
    if (!parentId) throw new Error("Missing parentId");

    // 1. Get parent
    const parentDoc = await db.collection("spa_reservas_packs").doc(parentId).get();
    if (!parentDoc.exists) throw new Error("Parent reservation not found.");

    const parentData = parentDoc.data();
    const childIds = parentData.childs || [];

    const batch = db.batch();

    // 2. Cancel all children
    for (const childId of childIds) {
        // Children can be in different collections, we need to find them
        // Best approach: query all possible collections (or store collection in parent)
        for (const col of ["spa_reservas", "reservas_gimnasio", "reservas_complementos"]) {
            const childRef = db.collection(col).doc(childId);
            const childDoc = await childRef.get();
            if (childDoc.exists) {
                batch.update(childRef, {
                    status: 'anulada',
                    cancelled_at: new Date().toISOString()
                });
                break;
            }
        }
    }

    // 3. Cancel parent
    batch.update(db.collection("spa_reservas_packs").doc(parentId), {
        status: 'anulada',
        cancelled_at: new Date().toISOString()
    });

    await batch.commit();
    console.log(`[PACK] Cancelled parent ${parentId} and ${childIds.length} children.`);
};

function formatDateToISO(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split('T')[0];
}


/**
 * Utility to determine the base URL for external modules (salones, peluqueria, etc.)
 * Detects if running on GitHub Pages, localhost or local filesystem.
 */
window.getBaseURL = function (moduleName) {
    const host = window.location.hostname;
    const isGitHub = host.includes('github.io');
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    // Canonical mapping for modules (to handle casing if needed)
    const moduleMap = {
        'gestion-Salones': 'gestion-Salones',
        'mesachef': 'gestion-Salones' // Alias for restaurant module
    };
    const targetModule = moduleMap[moduleName] || moduleName;

    if (isGitHub) {
        const user = host.split('.')[0];
        return `https://${user}.github.io/${targetModule}/`;
    } else if (isLocalhost) {
        return `../${targetModule}/`;
    } else {
        // Fallback for file:// protocol (Sibling folders)
        const path = `../${targetModule}/`;
        console.log(`[getBaseURL] Local file detected, using sibling path: ${path}`);
        return path;
    }
};

/**
 * Returns the base URL for shared assets (like bridge scripts)
 */
window.getResourceBase = function () {
    const host = window.location.hostname;
    const isGitHub = host.includes('github.io');
    if (isGitHub) {
        const user = host.split('.')[0];
        return `https://${user}.github.io/Gest-Spa/`;
    }
    // Local fallback
    return '';
};

function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Inicialización básica
document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    setupQuotaWarning(); // Init quota warning system

    // Inyectar base de datos local
    if (!document.querySelector('script[src*="db-local.js"]')) {
        const script = document.createElement('script');
        // Cache busting: Force reload to avoid using old cached version causing ReferenceError
        script.src = "js/db-local.js?v=" + Date.now();
        document.head.appendChild(script);
    }

    // Crear indicador de sincronización si no existe
    // setupSyncIndicator(); // DISABLED: Using SyncManager instead

    // Initialize Sync Engine (Background Sync)
    if (typeof SyncManager !== 'undefined') {
        console.log("Initializing SyncManager...");
        window.syncEngine = new SyncManager();
        window.syncEngine.init();
    }

    // Setup theme toggles
    document.querySelectorAll(".theme-toggle").forEach(btn => {
        btn.addEventListener("click", toggleTheme);
    });
});

function setupSyncIndicator() {
    if (document.getElementById('global-sync-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'global-sync-indicator';
    indicator.style = "position:fixed; bottom:20px; right:20px; z-index:9999; background:rgba(0,0,0,0.8); color:white; padding:8px 12px; border-radius:20px; font-size:0.75rem; display:flex; align-items:center; gap:8px; backdrop-filter:blur(4px); border:1px solid rgba(255,255,255,0.1); cursor:help; transition: all 0.3s ease;";
    indicator.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> <span id="sync-text">Sincronizado</span>';

    document.body.appendChild(indicator);
}

window.updateGlobalSyncStatus = function (status, info = "") {
    const indicator = document.getElementById('global-sync-indicator');
    const text = document.getElementById('sync-text');
    if (!indicator || !text) return;

    if (status === 'pending') {
        indicator.innerHTML = '<i class="fas fa-sync fa-spin" style="color:#f59e0b;"></i> <span id="sync-text">Sincronizando...</span>';
        indicator.style.borderColor = "#f59e0b";
    } else if (status === 'offline') {
        indicator.innerHTML = '<i class="fas fa-wifi-slash" style="color:#ef4444;"></i> <span id="sync-text">Modo Local (Sin Cuota)</span>';
        indicator.style.borderColor = "#ef4444";
    } else if (status === 'synced') {
        indicator.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> <span id="sync-text">Sincronizado</span>';
        indicator.style.borderColor = "rgba(255,255,255,0.1)";
    }

    if (info) indicator.title = info;
};


// --- SISTEMA DE AVISO DE CUOTA (QUOTA EXCEEDED) ---
function setupQuotaWarning() {
    // Solo registrar estilos una vez
    if (!document.getElementById('quota-animation-style')) {
        const style = document.createElement('style');
        style.id = 'quota-animation-style';
        style.innerHTML = `
            @keyframes blink-red-quota {
                0% { background-color: #ef4444; }
                50% { background-color: #b91c1c; }
                100% { background-color: #ef4444; }
            }
            .quota-blink-banner {
                animation: blink-red-quota 2s infinite;
            }
        `;
        document.head.appendChild(style);
    }
}

window.showQuotaWarning = function (info = "") {
    if (document.getElementById('quota-warning-banner')) return;

    console.warn("⚠️ ACTIVANDO AVISO DE CUOTA (Info: " + info + ")");

    const banner = document.createElement('div');
    banner.id = 'quota-warning-banner';
    banner.className = 'quota-blink-banner';
    // Estilos forzados para estar por encima de TODO y ser visible
    banner.style = "position:fixed; top:0; left:0; width:100%; height:42px; color:white; z-index:999999999; display:flex; align-items:center; justify-content:center; gap:12px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.5); font-family:sans-serif; font-size:0.9rem; letter-spacing:0.5px; cursor:pointer; border-bottom:2px solid rgba(255,255,255,0.2);";
    banner.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:1.2rem;"></i>
        <span>⚠️ LÍMITE DE GOOGLE ALCANZADO: El sistema no puede leer ni guardar datos hasta mañana.</span>
        <button style="background:rgba(255,255,255,0.2); border:none; color:white; padding:4px 8px; border-radius:4px; font-size:0.7rem; margin-left:15px; cursor:pointer;">CERRAR</button>
    `;

    banner.onclick = () => {
        banner.remove();
        document.body.style.marginTop = "0px";
        const nav = document.querySelector('.sidebar');
        if (nav) nav.style.top = "0px";
    };

    document.body.prepend(banner);
    document.body.style.marginTop = "42px";
    document.body.style.transition = "margin-top 0.3s ease";

    // Mover también el nav si es fijo
    const nav = document.querySelector('.sidebar');
    if (nav) {
        nav.style.top = "42px";
        nav.style.transition = "top 0.3s ease";
    }

    // Auto-verificador cada 2 minutos
    const checkInterval = setInterval(async () => {
        try {
            if (window.db || (typeof firebase !== 'undefined' && firebase.firestore)) {
                const testDb = window.db || firebase.firestore();
                await testDb.collection("spa_config").doc("general").get();
                console.log("✅ Cuota recuperada. Eliminando aviso.");
                if (document.getElementById('quota-warning-banner')) {
                    document.getElementById('quota-warning-banner').click();
                }
                clearInterval(checkInterval);
            }
        } catch (e) { /* Sigue fallando */ }
    }, 120000);
};

window.checkFirestoreError = function (error) {
    if (!error) return false;
    const msg = (error.message || String(error) || '').toLowerCase();
    const code = (error.code || '').toLowerCase();

    const isQuota = msg.includes('resource-exhausted') ||
        code === 'resource-exhausted' ||
        msg.includes('quota exceeded') ||
        msg.includes('429');

    if (isQuota) {
        window.showQuotaWarning(code || msg);
        return true;
    }
    return false;
};

// --- INTERCEPTACIÓN NUCLEAR DE CONSOLA PARA ERRORES DEL SDK ---
const originalConsoleError = console.error;
console.error = function () {
    originalConsoleError.apply(console, arguments);
    const args = Array.from(arguments).join(' ').toLowerCase();
    if (args.includes('resource-exhausted') || args.includes('quota exceeded')) {
        if (window.showQuotaWarning) window.showQuotaWarning("Auto-detected (Console Intercept)");
    }
};

// --- LISTENER GLOBAL DE ERRORES (FALLBACK ÚLTIMO) ---
window.addEventListener('unhandledrejection', event => {
    if (event.reason && window.checkFirestoreError(event.reason)) {
        event.preventDefault();
        document.head.appendChild(script);
        script.onload = () => {
            console.log("LocalDB loaded, initializing SyncEngine...");
            window.syncEngine = new SyncManager();
            window.syncEngine.init();
        };
    }
});

// --- SYNC ENGINE & UI ---
class SyncManager {
    constructor() {
        this.interval = 3 * 60 * 1000; // 3 minutos
        this.timer = null;
        this.isSyncing = false;
        this.status = 'synced'; // synced, pending, offline, error
        this.lastSync = null;
        this.container = null;
    }

    init() {
        this.createUI();
        this.setupListeners();
        this.startLoop();
        this.checkPending(); // Check inicial
    }

    createUI() {
        // Buscar dónde insertar (en el nav, antes del user o theme toggle)
        const nav = document.querySelector('.nav-links');
        if (!nav) return;

        const li = document.createElement('li');
        li.id = 'sync-status-container';
        li.style.cssText = "display: flex; align-items: center; margin-right: 15px;";

        // El diseño solicitado: Píldora oscura con texto
        li.innerHTML = `
            <div id="global-sync-indicator" 
                 onclick="window.syncEngine.forceSync()"
                 title="Click para sincronizar ahora"
                 style="
                    background: #1e293b; 
                    color: white; 
                    padding: 6px 16px; 
                    border-radius: 50px; 
                    display: flex; 
                    align-items: center; 
                    gap: 8px; 
                    font-size: 0.85rem; 
                    font-weight: 500; 
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                 ">
                <div id="sync-icon-wrapper" style="
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    width: 18px; 
                    height: 18px; 
                    border-radius: 50%; 
                    background: #10b981; 
                    color: white; 
                    font-size: 10px;
                ">
                    <i class="fas fa-check"></i>
                </div>
                <span id="sync-text">Sincronizado</span>
                <span id="sync-time" style="font-size: 0.7rem; opacity: 0.6; margin-left: 4px;"></span>
            </div>
        `;

        // Insertar antes del último elemento (asumiendo user/logout es el último)
        if (nav.lastElementChild) {
            nav.insertBefore(li, nav.lastElementChild);
        } else {
            nav.appendChild(li);
        }

        this.updateTimeDisplay();
        // Actualizar tiempo relativo cada minuto
        setInterval(() => this.updateTimeDisplay(), 60000);
    }

    updateUI(status, message = null) {
        this.status = status;
        const pill = document.getElementById('global-sync-indicator');
        const iconWrapper = document.getElementById('sync-icon-wrapper');
        const text = document.getElementById('sync-text');

        if (!pill) return;

        // Reset styles
        iconWrapper.className = '';
        iconWrapper.innerHTML = '';

        switch (status) {
            case 'synced':
                iconWrapper.style.background = '#10b981'; // Green
                iconWrapper.innerHTML = '<i class="fas fa-check"></i>';
                text.textContent = 'Sincronizado';
                this.lastSync = new Date();
                this.updateTimeDisplay();
                break;

            case 'syncing':
                iconWrapper.style.background = '#3b82f6'; // Blue
                iconWrapper.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
                text.textContent = 'Sincronizando...';
                break;

            case 'pending':
                iconWrapper.style.background = '#f59e0b'; // Amber
                iconWrapper.innerHTML = '<i class="fas fa-clock"></i>';
                text.textContent = 'Cambios pendientes';
                break;

            case 'offline':
                iconWrapper.style.background = '#64748b'; // Slate
                iconWrapper.innerHTML = '<i class="fas fa-wifi-slash"></i>';
                text.textContent = 'Modo Local';
                break;

            case 'error':
                iconWrapper.style.background = '#ef4444'; // Red
                iconWrapper.innerHTML = '<i class="fas fa-exclamation"></i>';
                text.textContent = 'Error Sync';
                break;
        }
    }

    updateTimeDisplay() {
        const timeSpan = document.getElementById('sync-time');
        if (!timeSpan || !this.lastSync) {
            if (timeSpan) timeSpan.textContent = '';
            return;
        }

        const now = new Date();
        const diffMin = Math.floor((now - this.lastSync) / 60000);

        if (diffMin < 1) timeSpan.textContent = 'ahora';
        else if (diffMin < 60) timeSpan.textContent = `hace ${diffMin} min`;
        else timeSpan.textContent = `hace ${Math.floor(diffMin / 60)} h`;
    }

    setupListeners() {
        window.addEventListener('online', () => {
            console.log("Network online - Triggering sync");
            this.forceSync();
        });

        // Listener para eventos de guardado local
        window.addEventListener('local-save', () => {
            this.updateUI('pending');
            // Opcional: Trigger sync inmediato si se prefiere agilidad sobre batching
            // this.forceSync(); 
        });
    }

    startLoop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.processQueue();
            }
        }, this.interval);
    }

    async forceSync() {
        if (this.isSyncing) return;
        if (!navigator.onLine) {
            showToast("Sin conexión a internet", "warning");
            return;
        }
        await this.processQueue();
    }

    async checkPending() {
        if (!window.apiLocal) return;
        try {
            const pendingBonos = await apiLocal.getPendingSync('bonos');
            // const pendingReservas = await apiLocal.getPendingSync('reservas'); // Futuro

            if (pendingBonos.length > 0) {
                this.updateUI('pending');
            } else {
                this.updateUI('synced');
            }
        } catch (e) {
            console.error("Error checking pending:", e);
        }
    }

    async processQueue() {
        if (!window.apiLocal || this.isSyncing) return;

        this.isSyncing = true;
        this.updateUI('syncing');

        let errorCount = 0;
        let successCount = 0;

        try {
            // 1. SYNC BONOS
            const pendingBonos = await apiLocal.getPendingSync('bonos');
            console.log(`[SYNC] Encontrados ${pendingBonos.length} bonos pendientes`);

            for (const item of pendingBonos) {
                try {
                    // Sanitizar id
                    const docId = item.id || item.bono || item.codigo;
                    if (!docId) continue;

                    // Preparar payload (excluir campos locales)
                    const { syncStatus, lastSyncAt, ...payload } = item;

                    // Subir a Firestore
                    await db.collection('spa_vouchers').doc(String(docId)).set(payload, { merge: true });

                    // Marcar como synced localmente
                    await apiLocal.markSynced('bonos', item.id, docId);
                    successCount++;

                } catch (err) {
                    console.error(`[SYNC] Error subiendo bono ${item.id}:`, err);
                    errorCount++;
                    // Si es error de cuota, paramos todo
                    if (err.message && err.message.includes('Quota')) {
                        this.updateUI('offline'); // Forzamos estado offline/local
                        throw err; // Salir del loop
                    }
                }
            }

            // 2. SYNC RESERVAS
            const pendingReservas = await apiLocal.getPendingSync('reservas');
            if (pendingReservas.length > 0) {
                console.log(`[SYNC] Encontradas ${pendingReservas.length} reservas pendientes`);

                for (const item of pendingReservas) {
                    try {
                        // Default collection fallback
                        let targetCol = item.collection || (item._moduleCode === 'panacea' ? 'panacea_reservas' : 'spa_reservas');
                        if (!targetCol && item.servicio) {
                            // Heurística simple si falta info
                            targetCol = 'spa_reservas';
                        }

                        const docId = item.id || item.res_id;
                        if (!docId) continue;

                        const { syncStatus, lastSyncAt, ...payload } = item;

                        await db.collection(targetCol).doc(docId).set(payload, { merge: true });
                        await apiLocal.markSynced('reservas', item.id, docId);
                        successCount++;

                    } catch (err) {
                        console.error(`[SYNC] Error subiendo reserva ${item.id}:`, err);
                        errorCount++;
                        if (err.message && err.message.includes('Quota')) {
                            this.updateUI('offline');
                            throw err;
                        }
                    }
                }
            }


            // 2. Refresh UI
            if (errorCount > 0) {
                if (successCount > 0) showToast(`${successCount} items sincronizados. ${errorCount} fallos.`, 'warning');
                this.updateUI('pending'); // Siguen quedando cosas
            } else {
                if (successCount > 0) showToast("Sincronización completada", "success");
                this.updateUI('synced');
            }

        } catch (globalErr) {
            console.error("[SYNC] Fallo crítico:", globalErr);
            if (globalErr.message && globalErr.message.includes('Quota')) {
                this.updateUI('offline');
            } else {
                this.updateUI('error');
            }
        } finally {
            this.isSyncing = false;
        }
    }
}

// Hook global para actualizar estado desde otros módulos
window.updateGlobalSyncStatus = (status) => {
    if (window.syncEngine) window.syncEngine.updateUI(status);
};

// --- ATTENDANCE & NO-SHOW DB HELPERS ---
window.dbCoreUpdateAttendance = async function (resId, moduleType, isAttended) {
    const colMap = {
        'spa': 'reservas_spa',
        'suite': 'reservas_suite',
        'panacea': 'reservas_panacea',
        'vip': 'reservas_vip',
        'peluqueria': 'reservas_peluqueria',
        'gym': 'reservas_gimnasio',
        'complementos': 'reservas_complementos',
        'cabina1': 'reservas_cabina1',
        'cabina2': 'reservas_cabina2',
        'cabina3': 'reservas_cabina3'
    };
    const col = colMap[moduleType] || 'reservas_spa';
    return db.collection(col).doc(resId).update({
        attended: !!isAttended,
        attended_at: isAttended ? new Date().toISOString() : null,
        status: isAttended ? 'confirmada' : 'confirmada' // Keep as confirmed even if attending/unattending
    });
};

window.dbCoreUpdateNoShow = async function (resId, moduleType, isNoShow) {
    const colMap = {
        'spa': 'reservas_spa',
        'suite': 'reservas_suite',
        'panacea': 'reservas_panacea',
        'vip': 'reservas_vip',
        'peluqueria': 'reservas_peluqueria',
        'gym': 'reservas_gimnasio',
        'complementos': 'reservas_complementos',
        'cabina1': 'reservas_cabina1',
        'cabina2': 'reservas_cabina2',
        'cabina3': 'reservas_cabina3'
    };
    const col = colMap[moduleType] || 'reservas_spa';
    return db.collection(col).doc(resId).update({
        no_show: !!isNoShow,
        status: isNoShow ? 'no_show' : 'confirmada',
        no_show_marked_at: isNoShow ? new Date().toISOString() : null,
        attended: false // Reset attendance if marking as no-show
    });
};
