// app-core.js - Funciones compartidas y utilidades

// --- CONSTANTES ---
const URL_BONOS = "https://cumbriabienestar.es/wp-json/bonos/v1/listado/";
const URL_BONOS_OPTIMIZED = "https://cumbriabienestar.es/wp-json/robahotel/v1/bonos";

// --- CORS PROXY FALLBACKS ---
const CORS_PROXIES = [
    { name: 'CorsProxy.io', url: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}` },
    { name: 'Codetabs', url: (target) => `https://api.codetabs.com/v1/proxy?url=${encodeURIComponent(target)}` },
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

    // Add cache buster
    url.searchParams.append('_', Date.now());

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

    // Try direct fetch first (works when server allows CORS)
    try {
        const directRes = await fetchWithTimeout(targetUrl, {}, Math.min(timeout, 6000));
        if (directRes.ok) {
            return await directRes.json();
        }
        errors.push({ proxy: 'Direct', error: `HTTP Error: ${directRes.status}` });
    } catch (directErr) {
        errors.push({ proxy: 'Direct', error: directErr.message });
    }

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
    const cleanName = String(serviceName).replace(/^PACK\s*[-–—:]\s*/i, '').trim();
    try {
        // Use global cache to reduce reads
        if (!window._itemMasterCache) {
            console.log("[CONFIG] Initializing Item Master Cache...");
            const snap = await db.collection("spa_item_master").get();
            window._itemMasterCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Periodically refresh cache (every 5 mins)
            setTimeout(() => { window._itemMasterCache = null; }, 300000);
        }

        const canonical = window.SpaServiceCatalog?.resolve(cleanName, window._itemMasterCache, window.currentServices || []);
        if (canonical) return canonical;
        const normSearch = cleanName.toLowerCase();
        return window._itemMasterCache.find(item =>
            (item.name || item.nombre || '').toLowerCase().trim() === normSearch ||
            (item.code && String(item.code).toLowerCase().trim() === normSearch)
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
window.generateResCode = function () {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = '';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return `RS-${res}`;
};

function getCollectionForSpaceCore(space) {
    const spaceNorm = String(space || "").toLowerCase().trim();
    if (spaceNorm === 'gym' || spaceNorm === 'gimnasio') return "reservas_gimnasio";
    if (spaceNorm === 'vip') return "reservas_vip";
    if (spaceNorm === 'suite') return "reservas_suite";
    if (spaceNorm === 'panacea') return "reservas_panacea";
    if (spaceNorm === 'peluqueria') return "reservas_peluqueria";
    if (spaceNorm === 'cabina') return "reservas_cabina1";
    if (spaceNorm.startsWith('cabina')) return `reservas_${spaceNorm}`;
    return "reservas_spa";
}

window.createPackReservations = async function (parentData, childItems) {
    if (!parentData || !childItems || childItems.length === 0) {
        throw new Error("createPackReservations: Missing parent data or child items.");
    }

    const batch = db.batch();
    const parentRef = db.collection("spa_reservas_packs").doc();
    const parentId = parentRef.id;
    const childIds = [];
    const sharedResId = parentData.res_id || window.generateResCode();
    const nowIso = new Date().toISOString();
    const packTitle = parentData.servicio || parentData.service || "";

    // Identify primary phase (therapy/room phase first, fallback to index 0)
    let primaryIdx = childItems.findIndex(c => (c.space || '').toLowerCase() !== 'spa');
    if (primaryIdx === -1) primaryIdx = 0;

    // Create parent document
    const parentPayload = {
        ...parentData,
        res_id: sharedResId,
        is_pack_parent: true,
        childs: [], // Will be updated after child creation
        created_at: nowIso,
        status: parentData.status || 'confirmada'
    };

    // Create child documents
    childItems.forEach((child, index) => {
        const childCollection = child.collection || getCollectionForSpaceCore(child.space);
        const childRef = db.collection(childCollection).doc();
        childIds.push(childRef.id);
        const isPrimary = (index === primaryIdx);

        const childPayload = {
            res_id: sharedResId,
            parent_id: parentId,
            parent_service: packTitle,
            pack_name: packTitle,
            pack_origen: packTitle,
            pack_sequence_index: child.index !== undefined ? child.index : index,
            service_item: child.name,
            is_pack_element: true,
            pack_children_synced: true,
            collection: childCollection,
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
            localizador: parentData.bono || "",
            obs: parentData.obs || "",
            complementos: isPrimary ? (parentData.complementos || []) : [],
            extras_info: isPrimary ? (parentData.extras_info || []) : [],
            precio_pax: isPrimary ? (parseFloat(parentData.precio_pax) || 0) : 0,
            precio_total: isPrimary ? (parseFloat(parentData.precio_total) || 0) : 0,
            sesiones_consumidas: isPrimary ? (parseInt(parentData.sesiones_consumidas) || 1) : 0,
            status: parentData.status || 'confirmada',
            created_at: nowIso,
            updated_at: nowIso
        };

        if (isPrimary) {
            if (parentData.payment) childPayload.payment = parentData.payment;
            if (parentData.estado_pago) childPayload.estado_pago = parentData.estado_pago;
            if (parentData.descuento_aplicado) {
                childPayload.descuento_aplicado = true;
                childPayload.descuento_tipo = parentData.descuento_tipo || 'porcentaje';
                childPayload.descuento_valor = parentData.descuento_valor || 0;
                childPayload.descuento_motivo = parentData.descuento_motivo || '';
            }
        }

        // Sala y terapeutas de la fase (solo si se han indicado para esa fase)
        if (child.space) childPayload.sala = child.space;
        ['staff_id', 'staff_name', 'staff_id2', 'staff_name2', 'terapeuta', 'terapeuta2'].forEach(k => {
            if (child[k]) childPayload[k] = child[k];
        });

        batch.set(childRef, childPayload);
    });

    // Update parent with child IDs
    parentPayload.childs = childIds;
    batch.set(parentRef, parentPayload);

    await batch.commit();

    console.log(`[PACK] Created parent ${parentId} (${sharedResId}) with ${childIds.length} children:`, childIds);

    return { parentId, childIds, res_id: sharedResId };
};

/**
 * Updates voucher session usage when a multi-service pack is booked from a voucher.
 */
window.updateVoucherSessionsForPack = async function (bonoId, activeItems = []) {
    if (!bonoId || !window.db) return;
    const cleanBonoId = String(bonoId).trim();
    if (!cleanBonoId) return;

    try {
        let vRef = db.collection("spa_vouchers").doc(cleanBonoId);
        let vDoc = await vRef.get();
        if (!vDoc.exists) {
            const vDocSpace = await db.collection("spa_vouchers").doc(cleanBonoId + ' ').get();
            if (vDocSpace.exists) {
                vDoc = vDocSpace;
                vRef = vDocSpace.ref;
            }
        }
        if (!vDoc.exists) return;

        const vData = vDoc.data();
        const consumedCount = (Array.isArray(activeItems) && activeItems.length > 0) ? activeItems.length : 1;
        const newUsedTotal = (vData.sesiones_usadas || 0) + consumedCount;
        const updates = {
            sesiones_usadas: newUsedTotal,
            last_updated: new Date().toISOString()
        };

        const rawItems = Array.isArray(vData.items_desglosados)
            ? vData.items_desglosados
            : (Array.isArray(vData.desglosados) ? vData.desglosados : []);

        if (rawItems.length > 0) {
            const items = rawItems.map(it => ({ ...it }));
            const complementRegex = /(botella|cava|vino|champagne|champán|ramo|flores|fruta|bombones|chocolate|detalle|benjamín|benjamin|regalo|extra|accesorio|toalla|albornoz|amenities|spa kit)/i;
            const isItemReservableUnused = (it) => {
                const used = it.used ?? it.usadas ?? 0;
                const total = it.sessions ?? it.sesiones ?? 1;
                if (used >= total) return false;
                const nm = (it.name || it.nombre || '').toLowerCase();
                const sp = (Array.isArray(it.space) ? it.space[0] : (it.space || '')).toLowerCase();
                if (it.tipo === 'complemento' || it.reservable === false || sp === 'complemento' || sp === 'extra' || complementRegex.test(nm)) return false;
                if (sp === 'gimnasio' || sp === 'gym' || sp.includes('hotel') || sp.includes('rest')) return false;
                return true;
            };

            let anyMatched = false;
            (activeItems || []).forEach(act => {
                const actName = (act.name || act.nombre || '').toLowerCase().trim();
                const actSpace = (act.space || act.espacio || '').toLowerCase().trim();

                // 1. Exact or substring name match
                let matchIdx = items.findIndex(it => {
                    if (!isItemReservableUnused(it)) return false;
                    const itName = (it.name || it.nombre || '').toLowerCase().trim();
                    return itName && actName && (itName === actName || actName.includes(itName) || itName.includes(actName));
                });

                // 2. Space match fallback (e.g. "MASAJE RELAX 30 MIN EN SUITE" in panacea vs "Encuentro Romántico (Masaje Relax 30 min)" in panacea)
                if (matchIdx === -1 && actSpace) {
                    matchIdx = items.findIndex(it => {
                        if (!isItemReservableUnused(it)) return false;
                        const rawSp = Array.isArray(it.space) ? it.space[0] : (it.space || '');
                        const itSpace = String(rawSp).toLowerCase().trim();
                        return itSpace && (itSpace === actSpace || itSpace.includes(actSpace) || actSpace.includes(itSpace));
                    });
                }

                // 3. First unused reservable item fallback
                if (matchIdx === -1) {
                    matchIdx = items.findIndex(it => isItemReservableUnused(it));
                }

                if (matchIdx !== -1) {
                    const currentUsed = items[matchIdx].used ?? items[matchIdx].usadas ?? 0;
                    items[matchIdx].used = currentUsed + 1;
                    items[matchIdx].usadas = items[matchIdx].used;
                    anyMatched = true;
                }
            });

            if (anyMatched) {
                updates.items_desglosados = items;
            }
        }

        await vRef.update(updates);
        console.log(`[BONO-PACK] Updated voucher ${cleanBonoId}: +${consumedCount} sessions (total used: ${newUsedTotal})`);
    } catch (err) {
        console.warn("[BONO-PACK] Error updating voucher sessions for pack:", err);
    }
};

/**
 * Loads all sibling reservation documents belonging to the same pack as `res`.
 */
window.loadPackSiblingsForEdit = async function (res) {
    if (!res || !window.db) return [];
    const ALL_COLS = [
        "reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip",
        "reservas_peluqueria", "reservas_cabina1", "reservas_cabina2", "reservas_cabina3"
    ];
    const results = new Map();
    if (res.id) {
        results.set(res.id, { ...res, _collection: res.collection || res._collection || getCollectionForSpaceCore(res.sala) });
    }

    const parentId = res.parent_id || res.id;
    const resIdCode = res.res_id || "";
    const fecha = res.fecha || "";
    const clientNorm = String(res.nombre || "").trim().toLowerCase();

    try {
        const queries = [];
        ALL_COLS.forEach(col => {
            if (parentId) {
                queries.push(
                    db.collection(col).where("parent_id", "==", parentId).get()
                        .then(snap => snap.forEach(d => results.set(d.id, { id: d.id, _collection: col, ...d.data() })))
                        .catch(() => {})
                );
            }
            if (fecha) {
                queries.push(
                    db.collection(col).where("fecha", "==", fecha).get()
                        .then(snap => {
                            snap.forEach(d => {
                                const data = d.data();
                                if (data.status === 'anulada') return;
                                const sameParent = parentId && (data.parent_id === parentId || d.id === parentId);
                                const sameResId = resIdCode && resIdCode.startsWith('RS-') && data.res_id === resIdCode;
                                const sameClientPack = clientNorm && String(data.nombre || "").trim().toLowerCase() === clientNorm &&
                                    (data.is_pack_element || data.parent_id || data.pack_origen || (typeof window.isPackService === 'function' && window.isPackService(data.servicio)));
                                if (sameParent || sameResId || sameClientPack) {
                                    results.set(d.id, { id: d.id, _collection: col, ...data });
                                }
                            });
                        })
                        .catch(() => {})
                );
            }
        });
        await Promise.all(queries);
    } catch (e) {
        console.warn("[PACK SIBLINGS] Error loading siblings:", e);
    }

    return Array.from(results.values());
};

/**
 * Updates/creates all phases of a multi-service pack when editing an existing reservation.
 */
window.syncPackReservationsOnEdit = async function (id, existingRes, payload, packItems, originalColl = null) {
    if (!id || !payload || !Array.isArray(packItems) || packItems.length === 0) {
        throw new Error("syncPackReservationsOnEdit: Missing arguments.");
    }

    const parentId = existingRes?.parent_id || id;
    const sharedResId = existingRes?.res_id || payload.res_id || window.generateResCode();
    const packTitle = payload.servicio || existingRes?.pack_origen || existingRes?.parent_service || "";
    const nowIso = new Date().toISOString();

    // Load any existing siblings so we update in-place rather than duplicating
    const siblings = await window.loadPackSiblingsForEdit({ ...existingRes, ...payload, id, parent_id: parentId, res_id: sharedResId });

    // Determine which packItem corresponds to the currently edited document `id`
    let primaryItem = packItems.find(it => it.existingDocId === id);
    if (!primaryItem) {
        const curRoom = String(payload.sala || "").toLowerCase();
        primaryItem = packItems.find(it => String(it.space || "").toLowerCase() === curRoom || it.collection === payload.collection);
    }
    if (!primaryItem) {
        primaryItem = packItems.find(it => String(it.space || "").toLowerCase() !== 'spa') || packItems[0];
    }

    const batch = db.batch();
    const childIds = [];

    for (const item of packItems) {
        const idx = item.index !== undefined ? item.index : packItems.indexOf(item);
        const itemColl = item.collection || getCollectionForSpaceCore(item.space);
        const isPrimaryDoc = (item === primaryItem);

        // Find if a sibling document already exists for this phase
        let matchedSibling = null;
        if (isPrimaryDoc) {
            matchedSibling = { id, _collection: originalColl || payload.collection || itemColl };
        } else if (item.existingDocId) {
            matchedSibling = siblings.find(s => s.id === item.existingDocId) || { id: item.existingDocId, _collection: item.existingCollection || itemColl };
        } else {
            matchedSibling = siblings.find(s =>
                s.id !== id && (
                    s.pack_sequence_index === idx ||
                    String(s.service_item || s.servicio || "").toLowerCase() === String(item.name || "").toLowerCase() ||
                    (s._collection === itemColl && String(item.space || "").toLowerCase() === 'spa')
                )
            );
        }

        const targetDocId = isPrimaryDoc ? id : (matchedSibling ? matchedSibling.id : `${parentId}_phase_${idx}`);
        const prevColl = matchedSibling ? matchedSibling._collection : itemColl;

        if (item.active === false) {
            if (matchedSibling) {
                batch.update(db.collection(prevColl).doc(targetDocId), {
                    status: 'anulada',
                    cancelled_at: nowIso,
                    updated_at: nowIso
                });
            }
            continue;
        }

        childIds.push(targetDocId);
        const needsStaff = (item.terapeutas !== undefined ? item.terapeutas > 0 : String(item.space || "").toLowerCase() !== 'spa');

        const itemPayload = {
            ...(isPrimaryDoc ? payload : {}),
            res_id: sharedResId,
            parent_id: parentId,
            parent_service: packTitle,
            pack_name: packTitle,
            pack_origen: packTitle,
            pack_sequence_index: idx,
            service_item: item.name,
            servicio: isPrimaryDoc ? (item.name || payload.servicio) : item.name,
            is_pack_element: true,
            pack_children_synced: true,
            collection: itemColl,
            sala: item.space || (isPrimaryDoc ? payload.sala : "spa"),
            nombre: payload.nombre,
            tel: payload.tel || "",
            fecha: item.fecha || payload.fecha,
            hora: item.hora || payload.hora,
            duracion: parseInt(item.duracion) || (isPrimaryDoc ? payload.duracion : 60) || 60,
            pax: payload.pax || 2,
            origen: payload.origen,
            hotel: payload.hotel || "",
            hab: payload.hab || "",
            bono: payload.bono || "",
            localizador: payload.bono || "",
            obs: payload.obs || "",
            status: payload.status || 'confirmada',
            updated_at: nowIso
        };

        if (!isPrimaryDoc) {
            itemPayload.precio_pax = 0;
            itemPayload.precio_total = 0;
            itemPayload.sesiones_consumidas = 0;
            if (!matchedSibling) itemPayload.created_at = nowIso;
        }

        if (needsStaff) {
            itemPayload.staff_id = item.staff_id || payload.staff_id || null;
            itemPayload.staff_name = item.staff_name || payload.staff_name || null;
            itemPayload.staff_id2 = item.staff_id2 || payload.staff_id2 || null;
            itemPayload.staff_name2 = item.staff_name2 || payload.staff_name2 || null;
            itemPayload.terapeuta = item.terapeuta || payload.terapeuta || "";
            itemPayload.terapeuta2 = item.terapeuta2 || payload.terapeuta2 || "";
        } else {
            itemPayload.staff_id = null;
            itemPayload.staff_name = null;
            itemPayload.staff_id2 = null;
            itemPayload.staff_name2 = null;
            itemPayload.terapeuta = "";
            itemPayload.terapeuta2 = "";
        }

        if (prevColl && prevColl !== itemColl) {
            batch.set(db.collection(itemColl).doc(targetDocId), itemPayload, { merge: true });
            batch.delete(db.collection(prevColl).doc(targetDocId));
        } else {
            batch.set(db.collection(itemColl).doc(targetDocId), itemPayload, { merge: true });
        }
    }

    // Update or create pack parent record
    const parentRef = db.collection("spa_reservas_packs").doc(parentId);
    batch.set(parentRef, {
        ...payload,
        res_id: sharedResId,
        servicio: packTitle,
        is_pack_parent: true,
        childs: childIds,
        updated_at: nowIso
    }, { merge: true });

    await batch.commit();
    console.log(`[PACK EDIT SYNC] Synced pack ${parentId} (${sharedResId}) across ${childIds.length} active items:`, childIds);
    return { parentId, childIds, res_id: sharedResId };
};

/**
 * Automatically ensures that any single-document multi-service Pack reservation on `date`
 * (e.g. "PACK - Experiencia SPA en pareja" saved only in `reservas_vip`) has its companion
 * phase reservation(s) (e.g. "Circuito Spa" at 17:00 in `reservas_spa`) created in Firestore.
 */
const _syncedPackDatesInSession = new Set();
window.ensurePackChildrenSyncedForDate = async function (date, preloadedDocs = null) {
    if (!date || !window.db) return [];
    const findPack = window.findPackDefinition;
    if (typeof findPack !== 'function') return [];

    // Fast in-memory check when preloadedDocs are provided (e.g. from Dashboard):
    // If no unsplit multi-service pack exists in preloadedDocs, return immediately in 0ms without querying Firestore!
    if (Array.isArray(preloadedDocs) && preloadedDocs.length > 0) {
        const needsSync = preloadedDocs.some(r => {
            if (!r || r.status === 'anulada' || r.status === 'cancelled' || r.pack_children_synced) return false;
            const rawSvc = r.pack_origen || r.parent_service || r.servicio || "";
            const packDef = findPack(rawSvc);
            return !!(packDef && packDef.categoria !== 'ritual' && Array.isArray(packDef.secuencia) && packDef.secuencia.length > 1);
        });
        if (!needsSync) {
            _syncedPackDatesInSession.add(date);
            return [];
        }
    } else if (_syncedPackDatesInSession.has(date)) {
        return [];
    }

    const ROOM_COLS = [
        "reservas_vip", "reservas_panacea", "reservas_suite",
        "reservas_cabina1", "reservas_cabina2", "reservas_cabina3", "reservas_spa"
    ];

    try {
        let allDocs = [];
        if (Array.isArray(preloadedDocs) && preloadedDocs.length > 0) {
            allDocs = preloadedDocs.map(d => ({
                ...d,
                _col: d._col || d.collection || getCollectionForSpaceCore(d.moduleType || d.sala || 'spa')
            }));
        } else {
            const snaps = await Promise.all(ROOM_COLS.map(col => db.collection(col).where("fecha", "==", date).get()));
            snaps.forEach((snap, idx) => {
                const col = ROOM_COLS[idx];
                snap.forEach(doc => {
                    allDocs.push({ id: doc.id, _col: col, ...doc.data() });
                });
            });
        }

        const createdCompanions = [];

        for (const r of allDocs) {
            if (r.status === 'anulada' || r.status === 'cancelled') continue;
            if (r.pack_children_synced) continue;

            const rawSvc = r.pack_origen || r.parent_service || r.servicio || "";
            const packDef = findPack(rawSvc);
            if (!packDef || packDef.categoria === 'ritual' || !Array.isArray(packDef.secuencia) || packDef.secuencia.length <= 1) {
                continue;
            }

            // Compute times for each phase using the exact same rule as updatePackInfo()
            const seq = packDef.secuencia;
            const hasSpaPhase = seq.some(it => String(it.espacio || '').toLowerCase() === 'spa');
            const therapyIndices = [];
            seq.forEach((it, idx) => {
                if (String(it.espacio || '').toLowerCase() !== 'spa' && it.requires_therapist !== false) {
                    therapyIndices.push(idx);
                }
            });
            const firstTherapyIdx = therapyIndices.length > 0 ? therapyIndices[0] : -1;

            const baseTime = String(r.hora || "10:00").replace(/h$/i, '').trim();
            const [bH, bM] = baseTime.split(':').map(Number);
            const baseMin = (isNaN(bH) ? 10 : bH) * 60 + (isNaN(bM) ? 0 : bM);

            const computedTimes = [];
            if (hasSpaPhase && firstTherapyIdx !== -1 && r._col !== 'reservas_spa') {
                let runningTherapyMin = baseMin;
                let totalTherapyDuration = 0;
                therapyIndices.forEach(tIdx => {
                    const h = Math.floor(runningTherapyMin / 60) % 24;
                    const m = runningTherapyMin % 60;
                    computedTimes[tIdx] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    const dur = parseInt(seq[tIdx].duracion) || 30;
                    runningTherapyMin += dur;
                    totalTherapyDuration += dur;
                });

                const obsLower = String(r.obs || r.observaciones || "").toLowerCase();
                const forceAfter = /despu[eé]s\s*spa|spa\s*despu[eé]s/i.test(obsLower);
                const forceBefore = /antes\s*spa|spa\s*antes/i.test(obsLower);

                seq.forEach((it, idx) => {
                    if (String(it.espacio || '').toLowerCase() === 'spa') {
                        if (!forceAfter && (forceBefore || (idx < firstTherapyIdx && baseMin >= 11 * 60))) {
                            const prevSlotMin = Math.floor((baseMin - 60) / 60) * 60;
                            const pH = Math.floor(prevSlotMin / 60) % 24;
                            computedTimes[idx] = `${String(pH).padStart(2, '0')}:00`;
                        } else {
                            const endTherapyMin = baseMin + totalTherapyDuration;
                            const nextSlotMin = Math.ceil(endTherapyMin / 60) * 60;
                            const nH = Math.floor(nextSlotMin / 60) % 24;
                            computedTimes[idx] = `${String(nH).padStart(2, '0')}:00`;
                        }
                    }
                });
            } else {
                let cumMin = 0;
                seq.forEach((it, idx) => {
                    const totalMin = baseMin + cumMin;
                    const h = Math.floor(totalMin / 60) % 24;
                    const m = totalMin % 60;
                    computedTimes[idx] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    cumMin += (parseInt(it.duracion) || 60) + 15;
                });
            }

            // Identify which phase `r` itself represents
            const rSpace = String(r.sala || r._col.replace('reservas_', '')).toLowerCase();
            let myPhaseIdx = seq.findIndex(it => {
                const sp = String(it.espacio || '').toLowerCase();
                if (sp === rSpace) return true;
                if (['panacea', 'vip', 'suite'].includes(sp) && ['panacea', 'vip', 'suite'].includes(rSpace)) return true;
                if (sp === 'cabina' && rSpace.startsWith('cabina')) return true;
                return false;
            });
            if (myPhaseIdx === -1) myPhaseIdx = firstTherapyIdx !== -1 ? firstTherapyIdx : 0;

            const parentId = r.parent_id || r.id;
            const sharedResId = r.res_id || window.generateResCode();
            const packTitle = rawSvc.toUpperCase().startsWith('PACK') ? rawSvc : `PACK - ${packDef.nombre}`;
            const clientNorm = String(r.nombre || "").trim().toLowerCase();

            // Recover bono code if missing
            let effectiveBono = String(r.bono || r.localizador || r.num_bono || r.voucher || "").trim();
            if (!effectiveBono && typeof window.recoverMissingBonoCode === 'function') {
                effectiveBono = await window.recoverMissingBonoCode(r, r._col);
            }

            const batch = db.batch();
            let didWrite = false;

            for (let idx = 0; idx < seq.length; idx++) {
                if (idx === myPhaseIdx) continue;
                const phase = seq[idx];
                const phaseSpace = String(phase.espacio || 'spa').toLowerCase();
                const phaseColl = getCollectionForSpaceCore(phaseSpace);
                const companionId = `${parentId}_phase_${idx}`;

                // Check if companion already exists in allDocs
                const alreadyExists = allDocs.some(d =>
                    d.id !== r.id &&
                    d.status !== 'anulada' &&
                    d._col === phaseColl && (
                        d.id === companionId ||
                        (d.parent_id && d.parent_id === parentId) ||
                        (sharedResId && d.res_id === sharedResId) ||
                        (clientNorm && String(d.nombre || "").trim().toLowerCase() === clientNorm)
                    )
                );

                if (!alreadyExists) {
                    const nowIso = new Date().toISOString();
                    const companionPayload = {
                        res_id: sharedResId,
                        parent_id: parentId,
                        parent_service: packTitle,
                        pack_name: packTitle,
                        pack_origen: packTitle,
                        pack_sequence_index: idx,
                        service_item: phase.nombre,
                        servicio: phase.nombre,
                        is_pack_element: true,
                        pack_children_synced: true,
                        collection: phaseColl,
                        sala: phaseSpace,
                        nombre: r.nombre || "",
                        tel: r.tel || "",
                        fecha: r.fecha,
                        hora: computedTimes[idx] || r.hora,
                        duracion: parseInt(phase.duracion) || 60,
                        pax: parseInt(r.pax) || packDef.pax || 2,
                        origen: r.origen || "particular",
                        hotel: r.hotel || "",
                        hab: r.hab || "",
                        bono: effectiveBono,
                        localizador: effectiveBono,
                        obs: r.obs || "",
                        precio_pax: 0,
                        precio_total: 0,
                        sesiones_consumidas: 0,
                        status: r.status || 'confirmada',
                        created_at: r.created_at || nowIso,
                        updated_at: nowIso
                    };
                    batch.set(db.collection(phaseColl).doc(companionId), companionPayload, { merge: true });
                    createdCompanions.push({ id: companionId, _col: phaseColl, ...companionPayload });
                    allDocs.push({ id: companionId, _col: phaseColl, ...companionPayload });
                    didWrite = true;
                }
            }

            // Mark `r` as synced so we don't re-process it
            const myPhase = seq[myPhaseIdx];
            const rUpdates = {
                res_id: sharedResId,
                parent_id: parentId,
                parent_service: packTitle,
                pack_name: packTitle,
                pack_origen: packTitle,
                pack_sequence_index: myPhaseIdx,
                service_item: myPhase ? myPhase.nombre : (r.service_item || r.servicio),
                is_pack_element: true,
                pack_children_synced: true
            };
            if (effectiveBono && !r.bono) {
                rUpdates.bono = effectiveBono;
                rUpdates.localizador = effectiveBono;
            }
            Object.assign(r, rUpdates);
            batch.update(db.collection(r._col).doc(r.id), rUpdates);
            didWrite = true;

            if (didWrite) {
                await batch.commit();
                console.log(`[PACK AUTO-SYNC] Synced missing pack phase(s) for ${r.nombre} (${sharedResId}) on ${date}`);
            }
        }

        _syncedPackDatesInSession.add(date);
        return createdCompanions;
    } catch (err) {
        console.warn("[PACK AUTO-SYNC] Error syncing pack children for date:", date, err);
        return [];
    }
};

/**
 * Recovers a missing voucher/bono code for a reservation by checking alternate fields,
 * parent pack document, observations, or matching client name in `spa_vouchers`.
 */
let _voucherRecoveryCache = null;
window.recoverMissingBonoCode = async function (res, targetColl = null) {
    if (!res) return "";
    const direct = String(
        res.bono || res.localizador || res.num_bono || res.voucher ||
        res.bono_id || res.codigo_bono || res.campoBono || res.referencia || ""
    ).trim();
    if (direct) return direct;

    // 1. Check observations for an explicit code
    const obs = String(res.obs || res.observaciones || "");
    const obsMatch = obs.match(/\b(LOC-[A-Z0-9-]+|WC-?\d{3,}|\d{5,}\/\d+|\d{4,}-\d+)\b/i);
    if (obsMatch && obsMatch[1]) {
        return obsMatch[1].trim();
    }

    if (!window.db) return "";

    // 2. Check parent pack document if parent_id exists
    if (res.parent_id) {
        try {
            const pDoc = await db.collection("spa_reservas_packs").doc(res.parent_id).get();
            if (pDoc.exists) {
                const pd = pDoc.data();
                const pCode = String(pd.bono || pd.localizador || pd.num_bono || pd.voucher || "").trim();
                if (pCode) return pCode;
            }
        } catch (e) {}
    }

    // 3. If origin is bono, look up in `spa_vouchers` by client name
    const rawOrigin = String(res.origen || res.origin || "").toLowerCase();
    const clientName = String(res.nombre || res.cliente || "").trim();
    if (!clientName || (!rawOrigin.includes('bono') && !rawOrigin.includes('voucher'))) {
        return "";
    }

    try {
        if (!_voucherRecoveryCache) {
            const snap = await db.collection("spa_vouchers").get();
            _voucherRecoveryCache = [];
            snap.forEach(doc => {
                _voucherRecoveryCache.push({ _id: doc.id, ...doc.data() });
            });
        }

        const normStr = (s) => String(s || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

        const targetClient = normStr(clientName);
        if (!targetClient || targetClient.length < 3) return "";

        const candidates = _voucherRecoveryCache.filter(v => {
            if (v.estado === 'anulado') return false;
            const vClient = normStr(v.cliente || v.comprador || v.beneficiario || v.nombre || "");
            if (!vClient) return false;
            return vClient === targetClient || vClient.includes(targetClient) || targetClient.includes(vClient);
        });

        if (candidates.length === 0) return "";

        // Prefer candidate matching the reservation's service/pack name, exact client name, and active status
        const targetSvc = normStr(res.pack_origen || res.parent_service || res.servicio || "").replace(/^pack\s+/, "");
        const scored = candidates.map(v => {
            let score = 0;
            const vClient = normStr(v.cliente || v.comprador || v.beneficiario || v.nombre || "");
            const vp = normStr(v.producto || v.nombre || "");
            if (vClient === targetClient) score += 50;
            else score += 10;
            if (targetSvc && vp && (vp.includes(targetSvc) || targetSvc.includes(vp))) score += 100;
            if (v.estado !== 'completed') score += 20;
            return { v, score };
        }).sort((a, b) => b.score - a.score);

        const best = scored[0].v;
        const recovered = String(best.bono || best.codigo || best.localizador || best._id || "").trim();
        if (recovered && res.id) {
            const colToUpdate = targetColl || res.collection || res._collection || getCollectionForSpaceCore(res.sala);
            if (colToUpdate) {
                db.collection(colToUpdate).doc(res.id).update({ bono: recovered, localizador: recovered }).catch(() => {});
            }
            const rootId = res.parent_id || String(res.id).replace(/_(spa|suite|vip|panacea|cabina\d*|peluqueria)(_\d+)?$/i, '');
            if (rootId && rootId !== res.id) {
                ['reservas_vip', 'reservas_panacea', 'reservas_suite', 'reservas_cabina1', 'reservas_cabina2', 'reservas_cabina3', 'reservas_spa'].forEach(c => {
                    db.collection(c).doc(rootId).update({ bono: recovered, localizador: recovered }).catch(() => {});
                });
            }
            if (rootId) {
                db.collection('reservas_spa').doc(`${rootId}_spa`).update({ bono: recovered, localizador: recovered }).catch(() => {});
            }
        }
        return recovered;
    } catch (e) {
        console.warn("[BONO RECOVERY] Error searching spa_vouchers:", e);
        return "";
    }
};

/**
 * Cancels a pack (parent + all children).
 * @param {string} parentId - ID of the parent reservation.
 */
window.cancelPackReservation = async function (parentId, specificChildId = null) {
    if (!parentId) throw new Error("Missing parentId");

    const ALL_COLS = [
        "reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip",
        "reservas_peluqueria", "reservas_cabinas", "reservas_cabina1", "reservas_cabina2", "reservas_cabina3",
        "spa_reservas", "reservas_gimnasio", "reservas_complementos"
    ];

    // 1. Get parent doc if exists
    let parentDoc = null;
    let childIds = [];
    try {
        parentDoc = await db.collection("spa_reservas_packs").doc(parentId).get();
        if (parentDoc.exists) {
            const parentData = parentDoc.data();
            childIds = Array.isArray(parentData.childs) ? [...parentData.childs] : [];
        }
    } catch (e) {
        console.warn("[PACK CANCEL] Error fetching parent doc:", e);
    }

    if (specificChildId && !childIds.includes(specificChildId)) {
        childIds.push(specificChildId);
    }

    const batch = db.batch();
    const nowIso = new Date().toISOString();
    const updatedIds = new Set();

    // 2. Cancel all children by explicit ID across all collections
    for (const childId of childIds) {
        for (const col of ALL_COLS) {
            try {
                const childRef = db.collection(col).doc(childId);
                const childDoc = await childRef.get();
                if (childDoc.exists) {
                    batch.update(childRef, {
                        status: 'anulada',
                        cancelled_at: nowIso
                    });
                    updatedIds.add(childId);
                    break;
                }
            } catch (colErr) {
                console.warn(`[PACK CANCEL] Col check error on ${col}/${childId}:`, colErr);
            }
        }
    }

    // 3. Fallback: Search all collections for any doc where parent_id == parentId
    for (const col of ALL_COLS) {
        try {
            const snap = await db.collection(col).where("parent_id", "==", parentId).get();
            snap.forEach(doc => {
                if (!updatedIds.has(doc.id)) {
                    batch.update(doc.ref, {
                        status: 'anulada',
                        cancelled_at: nowIso
                    });
                    updatedIds.add(doc.id);
                }
            });
        } catch (queryErr) {
            console.warn(`[PACK CANCEL] Query error on ${col}:`, queryErr);
        }
    }

    // 4. Cancel parent doc
    if (parentDoc && parentDoc.exists) {
        batch.update(db.collection("spa_reservas_packs").doc(parentId), {
            status: 'anulada',
            cancelled_at: nowIso
        });
    }

    await batch.commit();
    console.log(`[PACK] Cancelled parent ${parentId} and ${updatedIds.size} children.`);

    if (typeof window.cancelReservationInMesachef === 'function') {
        const pData = (parentDoc && parentDoc.exists) ? parentDoc.data() : {};
        await window.cancelReservationInMesachef(
            parentId,
            [...updatedIds, pData.res_id, pData.referencia, pData.bono, pData.codigo_bono, pData.localizador],
            {
                fecha: pData.fecha,
                nombre: pData.nombre || pData.cliente,
                telefono: pData.tel || pData.telefono
            }
        );
    }

    return { parentId, cancelledCount: updatedIds.size };
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
    const host = window.location.hostname || '';
    const protocol = window.location.protocol || '';
    const isGitHub = host.includes('github.io');
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    // Canonical mapping for modules (to handle casing if needed)
    const moduleMap = {
        'gestion-Salones': 'Mesachef',
        'mesachef': 'Mesachef' // Alias for restaurant module
    };
    const targetModule = moduleMap[moduleName] || moduleName;

    if (isGitHub) {
        const user = host.split('.')[0] || 'nataliogc';
        return `https://${user}.github.io/${targetModule}/`;
    } else if (isLocalhost) {
        return `../${targetModule}/`;
    } else if (protocol === 'file:') {
        // Fallback for file:// protocol (local browsers block cross-file script navigation)
        return `https://nataliogc.github.io/${targetModule}/`;
    } else {
        // Fallback for intranet/custom hosts
        return `https://nataliogc.github.io/${targetModule}/`;
    }
};

/**
 * Opens Mesachef restaurant booking page pre-filled with the current reservation modal data.
 */
window.openMesachefFromPack = function (overrideService) {
    const base = (typeof window.getBaseURL === 'function' ? window.getBaseURL('mesachef') : '') || 'https://nataliogc.github.io/Mesachef/';
    const basePath = `${base.replace(/\/+$/, '')}/restaurante.html`;

    const client = (document.getElementById('res-nombre')?.value || '').trim();
    const phone = (document.getElementById('res-tel')?.value || '').trim();
    const pax = document.getElementById('res-pax')?.value || 1;
    const date = (document.getElementById('form-date')?.value || '').trim();
    const voucher = (document.getElementById('res-bono')?.value || '').trim();
    const rawRef = (document.getElementById('res-id-display')?.textContent || '').trim();
    const resRef = (rawRef && rawRef.toUpperCase() !== 'NUEVA') ? rawRef : '';
    const hotel = (document.getElementById('res-hotel')?.value || 'Cumbria').trim();
    const service = (overrideService || document.getElementById('res-servicio-search')?.value || document.getElementById('res-servicio')?.value || 'Restaurante').trim();

    const params = new URLSearchParams({
        client,
        service,
        voucher: voucher || resRef,
        space: 'Restaurante',
        pax,
        phone,
        hotel,
        date,
        source: 'bono'
    });

    const finalUrl = `${basePath}?${params.toString()}`;
    const win = window.open(finalUrl, 'GestSpa_Mesachef');
    if (!win || win.closed || typeof win.closed === 'undefined') {
        if (typeof showToast === 'function') {
            showToast(`⚠️ El navegador bloqueó la apertura de Mesachef. <a href="${finalUrl}" target="_blank" style="color:#fff;text-decoration:underline;font-weight:bold;margin-left:8px;">Haz clic aquí para abrirlo</a>`, 'warning', 15000);
        } else {
            window.location.href = finalUrl;
        }
    } else {
        win.focus();
    }
};

/**
 * Renders the external extras notice (Restaurante/Mesachef, Hotel, Cava) for pack modals.
 */
window.renderPackExternalExtrasHtml = function (hasRestaurant, hasHotel, hasCava) {
    if (!hasRestaurant && !hasHotel && !hasCava) return '';
    let html = `<div style="margin-top: 8px; padding: 6px 10px; background: #fefce8; border: 1px solid #fef08a; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: #854d0e;">`;
    if (hasRestaurant) {
        html += `<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;"><span><i class="fas fa-utensils" style="color:#d97706; margin-right:5px;"></i> <strong>Restaurante:</strong> Incluye servicio de comida/menú en Restaurante Cumbria (gestión directa fuera de agenda SPA).</span><button type="button" id="btn-open-mesachef-pack" onclick="window.openMesachefFromPack()" style="padding:3px 10px; background:#d97706; color:#fff; border:none; border-radius:5px; font-size:0.7rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;"><i class="fas fa-external-link-alt"></i> Reservar en Mesachef</button></div>`;
        html += `<div id="mesachef-booking-status" style="font-size:0.7rem;"></div>`;
        setTimeout(() => { if (typeof window.refreshMesachefBookingStatus === 'function') window.refreshMesachefBookingStatus(); }, 50);
    }
    if (hasHotel) html += `<div><i class="fas fa-hotel" style="color:#2563eb; margin-right:5px;"></i> <strong>Hotel:</strong> Incluye alojamiento en Hotel Cumbria.</div>`;
    if (hasCava) html += `<div><i class="fas fa-wine-bottle" style="color:#7c3aed; margin-right:5px;"></i> <strong>Detalle:</strong> Incluye botella de Cava.</div>`;
    html += `</div>`;
    return html;
};

/**
 * Finds Mesachef restaurant reservations linked by document ID, voucher/reference fields,
 * or fallback date + client/phone match when created manually.
 */
window.findMesachefReservations = async function (codes = [], context = {}) {
    const mesachefDb = typeof window.getMesachefFirestore === 'function' ? window.getMesachefFirestore() : null;
    if (!mesachefDb) return [];
    if (typeof window.ensureMesachefAuth === 'function') {
        await window.ensureMesachefAuth();
    }

    const normText = (v) => (v || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const normPhone = (v) => {
        const d = (v || '').toString().replace(/\D/g, '');
        return d.length >= 9 ? d.slice(-9) : d;
    };
    const toIsoDate = (f) => {
        if (!f) return '';
        if (typeof f === 'string') return f.slice(0, 10);
        try {
            const dt = f.toDate ? f.toDate() : new Date(f);
            if (!isNaN(dt.getTime())) {
                const y = dt.getFullYear();
                const m = String(dt.getMonth() + 1).padStart(2, '0');
                const d = String(dt.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
        } catch (e) { /* ignore */ }
        return '';
    };

    const rawCodes = (Array.isArray(codes) ? codes : [codes])
        .map(c => (c || '').toString().trim())
        .filter(c => c && !['NUEVA', 'SIN ID', '?'].includes(c.toUpperCase()));
    const cleanCodes = Array.from(new Set(rawCodes));
    const upperCodes = Array.from(new Set(cleanCodes.flatMap(c => [c, c.toUpperCase()])));
    const upperCodeSet = new Set(cleanCodes.map(c => c.toUpperCase()));

    const resultsMap = new Map();
    const col = mesachefDb.collection('reservas_restaurante');

    for (const code of cleanCodes) {
        try {
            const byId = await col.doc(code).get();
            if (byId.exists) resultsMap.set(byId.id, { id: byId.id, ...byId.data() });
        } catch (e) { /* ignore */ }
    }

    if (upperCodes.length > 0) {
        const codeFields = ['campoBono', 'bono', 'referencia', 'external_id'];
        const chunks = [];
        for (let i = 0; i < upperCodes.length; i += 10) {
            chunks.push(upperCodes.slice(i, i + 10));
        }
        await Promise.all(chunks.flatMap(chunk =>
            codeFields.map(async (field) => {
                try {
                    const snap = await col.where(field, 'in', chunk).get();
                    snap.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                } catch (e) {
                    console.warn(`[MESACHEF] Error querying ${field}:`, e);
                }
            })
        ));
    }

    // Fallback: if no code match, inspect reservations on the same date (notes code or phone/client match)
    const ctxFecha = toIsoDate(context?.fecha);
    const ctxPhone = normPhone(context?.telefono);
    const ctxName = normText(context?.nombre);
    if (resultsMap.size === 0 && ctxFecha && (ctxPhone.length >= 6 || ctxName.length >= 3 || cleanCodes.length > 0)) {
        try {
            const [y, m, d] = ctxFecha.split('-').map(Number);
            if (y && m && d && typeof firebase !== 'undefined' && firebase.firestore?.Timestamp) {
                const start = firebase.firestore.Timestamp.fromDate(new Date(y, m - 1, d - 1, 0, 0, 0));
                const end = firebase.firestore.Timestamp.fromDate(new Date(y, m - 1, d + 1, 23, 59, 59));
                const dateSnap = await col.where('fecha', '>=', start).where('fecha', '<=', end).get();
                dateSnap.forEach(doc => {
                    const data = doc.data() || {};
                    const docCodes = [data.campoBono, data.bono, data.referencia, data.external_id]
                        .map(v => (v || '').toString().trim().toUpperCase())
                        .filter(Boolean);
                    const notesUpper = (typeof data.notas === 'string' ? data.notas : '').toUpperCase();
                    const codeInFields = docCodes.some(dc => upperCodeSet.has(dc));
                    const codeInNotes = Array.from(upperCodeSet).some(c => c.length >= 4 && notesUpper.includes(c));

                    const docFecha = toIsoDate(data.fecha);
                    const docPhone = normPhone(data.telefono);
                    const docName = normText(data.nombre || data.cliente);
                    const sameDate = !docFecha || docFecha === ctxFecha;
                    const phoneMatch = ctxPhone.length >= 6 && docPhone === ctxPhone;
                    const nameMatch = ctxName.length >= 3 && docName && (docName === ctxName || docName.includes(ctxName) || ctxName.includes(docName));

                    if (codeInFields || codeInNotes || (sameDate && (phoneMatch || nameMatch))) {
                        resultsMap.set(doc.id, { id: doc.id, ...data });
                    }
                });
            }
        } catch (e) {
            console.warn('[MESACHEF] Error in date fallback query:', e);
        }
    }

    return Array.from(resultsMap.values());
};

/**
 * Updates the Mesachef booking status badge inside the Gest-Spa reservation modal.
 */
window.refreshMesachefBookingStatus = async function () {
    const box = document.getElementById('mesachef-booking-status');
    if (!box) return;

    const rawRef = (document.getElementById('res-id-display')?.textContent || '').trim();
    const formId = (document.getElementById('form-id')?.value || '').trim();
    const voucher = (document.getElementById('res-bono')?.value || '').trim();
    const codes = [formId, rawRef, voucher].filter(c => c && !['NUEVA', 'SIN ID'].includes(c.toUpperCase()));

    const context = {
        fecha: (document.getElementById('form-date')?.value || '').trim(),
        nombre: (document.getElementById('res-nombre')?.value || '').trim(),
        telefono: (document.getElementById('res-tel')?.value || '').trim()
    };

    if (codes.length === 0 && !context.fecha) {
        box.innerHTML = `<span style="color:#92400e;"><i class="fas fa-info-circle"></i> Guarda la reserva primero o usa un bono para vincular la reserva de Mesachef.</span>`;
        return;
    }

    box.innerHTML = `<span style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Comprobando reserva en Mesachef...</span>`;
    const docs = await window.findMesachefReservations(codes, context);
    if (!document.getElementById('mesachef-booking-status')) return;

    const active = docs.filter(d => !['anulada', 'cancelada'].includes((d.estado || '').toLowerCase()));
    const btn = document.getElementById('btn-open-mesachef-pack');

    if (active.length > 0) {
        const r = active[0];
        let fechaTxt = '';
        try {
            const d = r.fecha?.toDate ? r.fecha.toDate() : (r.fecha ? new Date(r.fecha) : null);
            if (d && !isNaN(d.getTime())) fechaTxt = d.toLocaleDateString('es-ES');
        } catch (e) { /* ignore */ }
        const turnoTxt = r.turno ? ` (${r.turno === 'almuerzo' ? 'Almuerzo' : (r.turno === 'cena' ? 'Cena' : r.turno)})` : '';
        const horaTxt = r.hora ? ` · ${r.hora}` : '';
        const refTxt = r.referencia ? ` · Ref: ${r.referencia}` : '';
        box.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:5px; background:#dcfce7; color:#166534; font-weight:700; border:1px solid #86efac;"><i class="fas fa-check-circle"></i> Reservado en Mesachef: ${fechaTxt}${horaTxt}${turnoTxt}${refTxt}</span>`;
        if (btn) btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Nueva / Ver en Mesachef';
    } else if (docs.length > 0) {
        box.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:5px; background:#fee2e2; color:#991b1b; font-weight:700; border:1px solid #fca5a5;"><i class="fas fa-times-circle"></i> Reserva en Mesachef anulada</span>`;
        if (btn) btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Reservar en Mesachef';
    } else {
        box.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:5px; background:#fff7ed; color:#9a3412; font-weight:600; border:1px solid #fed7aa;"><i class="fas fa-clock"></i> Pendiente de reservar en Mesachef <button type="button" onclick="window.refreshMesachefBookingStatus()" title="Comprobar de nuevo" style="background:none;border:none;color:#9a3412;cursor:pointer;padding:0 2px;margin-left:4px;"><i class="fas fa-sync-alt"></i></button></span>`;
        if (btn) btn.innerHTML = '<i class="fas fa-external-link-alt"></i> Reservar en Mesachef';
    }
};

if (typeof window !== 'undefined' && !window._mesachefFocusListenerAdded) {
    window._mesachefFocusListenerAdded = true;
    window.addEventListener('focus', () => {
        if (document.getElementById('mesachef-booking-status')) {
            window.refreshMesachefBookingStatus();
        }
    });
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'RESTAURANT_RESERVATION_CREATED') {
            if (document.getElementById('mesachef-booking-status')) {
                window.refreshMesachefBookingStatus();
            }
        }
    });
}

/**
 * Resolves the exact "SPA y Sabores" service data and per-pax price for the given PAX.
 */
window.resolveSpaSaboresData = function (pax) {
    const p = Math.max(1, parseInt(pax, 10) || 2);
    const catalog = (typeof currentServices !== 'undefined' && Array.isArray(currentServices)) ? currentServices : [];
    const saboresList = catalog.filter(s => ((s.nombre || s.name || '').toLowerCase().includes('sabores')));

    let unitPrice = 45;
    let matched = null;
    if (p === 1) {
        matched = saboresList.find(s => parseInt(s.pax || s.pax_max || 0, 10) === 1 || (s.nombre || '').toLowerCase().includes('individual'));
        if (matched && parseFloat(matched.precio || matched.price || 0) > 0) {
            unitPrice = parseFloat(matched.precio || matched.price);
        }
    } else {
        matched = saboresList.find(s => parseInt(s.pax || s.pax_max || 0, 10) >= 2 || !(s.nombre || '').toLowerCase().includes('individual'));
        if (matched && parseFloat(matched.precio || matched.price || 0) > 0) {
            const mPax = Math.max(1, parseInt(matched.pax || matched.pax_max || 2, 10) || 2);
            unitPrice = parseFloat(matched.precio || matched.price) / mPax;
        }
    }

    return {
        ...(matched || {}),
        nombre: p === 1 ? 'SPA y Sabores - Individual' : 'SPA y Sabores',
        name: p === 1 ? 'SPA y Sabores - Individual' : 'SPA y Sabores',
        pax: 1,
        pax_max: 25,
        precio: unitPrice,
        price: unitPrice,
        price_pax: unitPrice,
        duracion: 60,
        duration: 60,
        includes_restaurant: true
    };
};

/**
 * Syncs the "SPA y Sabores" quick toggle button in the Spa reservation modal.
 */
window.syncSpaSaboresUi = function () {
    const wrap = document.getElementById('spa-sabores-toggle-wrap');
    const btn = document.getElementById('btn-toggle-spa-sabores');
    const badge = document.getElementById('spa-sabores-badge');
    if (!wrap || !btn) return;

    const isSpaModule = (typeof currentModule !== 'undefined' && currentModule && currentModule.code === 'spa');
    wrap.style.display = isSpaModule ? 'flex' : 'none';
    if (!isSpaModule) {
        window._spaSaboresActive = false;
        return;
    }

    const sel = document.getElementById('res-servicio');
    const currentVal = (sel?.value || '').toLowerCase();
    const isActive = currentVal.includes('sabores');
    window._spaSaboresActive = isActive;

    const pax = Math.max(1, parseInt(document.getElementById('res-pax')?.value || '2', 10) || 2);
    if (isActive) {
        btn.style.background = '#d97706';
        btn.style.color = '#fff';
        btn.style.borderColor = '#b45309';
        btn.innerHTML = '<i class="fas fa-check"></i> SPA y Sabores incluido';
        if (badge) {
            badge.style.display = 'inline';
            badge.textContent = pax === 1
                ? 'Modo Individual (1 pax · 45€ · Menú Restaurante incluido)'
                : `Modo Pareja (${pax} pax · Menú Restaurante incluido)`;
        }
    } else {
        btn.style.background = '#fffbeb';
        btn.style.color = '#b45309';
        btn.style.borderColor = '#f59e0b';
        btn.innerHTML = '<i class="fas fa-utensils"></i> + Añadir SPA y Sabores';
        if (badge) {
            badge.style.display = 'none';
            badge.textContent = '';
        }
    }
};

/**
 * Toggles "SPA y Sabores" in the Spa modal, auto-selecting 1 pax or 2 pax variant.
 */
window.toggleSpaSaboresMode = function (forceState = null) {
    const sel = document.getElementById('res-servicio');
    const searchInp = document.getElementById('res-servicio-search');
    if (!sel) return;

    const nextState = (forceState !== null) ? !!forceState : !window._spaSaboresActive;
    const pax = Math.max(1, parseInt(document.getElementById('res-pax')?.value || '2', 10) || 2);
    const options = Array.from(sel.options || []);

    let targetOpt = null;
    if (nextState) {
        const saboresOpts = options.filter(o => (o.value || '').toLowerCase().includes('sabores'));
        if (pax === 1) {
            targetOpt = saboresOpts.find(o => o.value.toLowerCase().includes('individual') || parseInt(o.dataset?.paxMax || '0', 10) === 1)
                || saboresOpts[0];
        } else {
            targetOpt = saboresOpts.find(o => !o.value.toLowerCase().includes('individual') && parseInt(o.dataset?.paxMax || '2', 10) >= 2)
                || saboresOpts.find(o => !o.value.toLowerCase().includes('individual'))
                || saboresOpts[0];
        }
        if (!targetOpt) {
            const fallbackName = (pax === 1) ? 'SPA y Sabores - Individual' : 'SPA y Sabores';
            const opt = document.createElement('option');
            opt.value = fallbackName;
            opt.textContent = fallbackName;
            opt.dataset.paxMax = pax === 1 ? '1' : '2';
            opt.dataset.duration = '60';
            opt.dataset.precio = pax === 1 ? '45' : '90';
            sel.appendChild(opt);
            targetOpt = opt;
        }
    } else {
        targetOpt = options.find(o => (o.value || '').toLowerCase().includes('circuito')) || options.find(o => o.value);
    }

    if (targetOpt) {
        sel.value = targetOpt.value;
        if (searchInp) searchInp.value = targetOpt.value;
    }
    delete sel.dataset.pricingMode;
    delete sel.dataset.fixedTotal;

    window._spaSaboresActive = nextState;
    window.syncSpaSaboresUi();

    if (typeof updatePackInfo === 'function') updatePackInfo();
    if (typeof updatePriceAutomation === 'function') updatePriceAutomation();
    if (typeof syncServiceDuration === 'function') syncServiceDuration();
};

/**
 * Re-evaluates "SPA y Sabores" variant when PAX changes in the Spa modal.
 */
window.onSpaPaxChange = function () {
    const isSpaModule = (typeof currentModule !== 'undefined' && currentModule && currentModule.code === 'spa');
    if (isSpaModule && window._spaSaboresActive) {
        window.toggleSpaSaboresMode(true);
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
                    // Sanitizar id: Priorizar código del bono sobre la clave primaria autoincremental de IndexedDB
                    const docId = item.bono || item.codigo || item.id;
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

/**
 * PROTOCOLO DE TRATAMIENTO POR SERVICIO
 * Devuelve color y categoría según el nombre del servicio
 * @param {string} serviceName - Nombre del servicio
 * @returns {Object} - { color, tratamiento, category }
 */
window.getServiceProtocol = function (serviceName) {
    if (!serviceName) return { color: '#64748b', tratamiento: 'General', category: 'general' };

    const name = serviceName.toLowerCase().trim();

    // 1. Check for custom color in global catalog cache (Services)
    const catalog = window.catalogServices || window.currentServices || [];
    const customItem = catalog.find(s => s.nombre && s.nombre.toLowerCase().trim() === name);
    if (customItem && customItem.color) {
        return {
            color: customItem.color,
            tratamiento: (customItem.categoria || 'Servicio personalizado').toUpperCase(),
            category: customItem.categoria || 'custom'
        };
    }

    // 1b. Check for custom color in Master Items (Configuration)
    if (window.masterItems) {
        const mItem = window.masterItems.find(i => i.name && i.name.toLowerCase().trim() === name);
        if (mItem && mItem.color) {
            return {
                color: mItem.color,
                tratamiento: 'PERSONALIZADO',
                category: 'custom_master'
            };
        }
    }

    // 2. Priority Overrides (Specific services with fixed colors from image)
    // These act as defaults if no custom color is set in the catalog.

    // PELUQUERIA (#BFBFBF - Grey)
    if (name.includes('peluqueria') || name.includes('manicura') || name.includes('pedicura') || name.includes('uñas') || name.includes('maquillaje') || name.includes('corte') || name.includes('peinado') || name.includes('tinte') || name.includes('mechas'))
        return { color: '#BFBFBF', tratamiento: 'PELUQUERIA Y ESTÉTICA', category: 'peluqueria' };

    // ENCUENTRO ROMANTICO (#FFFF00 - Yellow)
    if (name.includes('encuentro romantico'))
        return { color: '#FFFF00', tratamiento: 'ENCUENTRO ROMÁNTICO', category: 'especiales' };

    // ESPECIAL PAREJA (#00FF00 - Bright Green)
    if (name.includes('especial pareja'))
        return { color: '#00FF00', tratamiento: 'ESPECIAL PAREJA', category: 'pareja' };

    // CUENTO PARA DOS (#44B3E1 - Light Blue)
    if (name.includes('cuento para dos'))
        return { color: '#44B3E1', tratamiento: 'CUENTO PARA DOS', category: 'tematicas' };

    // SUITE SPA (#FFFF00 - Yellow)
    if (name.includes('suite spa') || name.includes('suite'))
        return { color: '#FFFF00', tratamiento: 'SUITE SPA', category: 'suite' };

    // PRESOTERAPIA (#FF0066 - Hot Pink)
    if (name.includes('presoterapia'))
        return { color: '#FF0066', tratamiento: 'PRESOTERAPIA', category: 'aparatologia' };

    // RADIOFRECUENCIA FACIAL (#00B050 - Dark Green)
    if ((name.includes('radiofrecuencia') && name.includes('facial')) || name.includes('facial tecnologico'))
        return { color: '#00B050', tratamiento: 'RADIOFRECUENCIA FACIAL', category: 'faciales_tech' };

    // HIGIENES Y TRAT. FACIALES (#47D359 - Light Green)
    if (name.includes('higiene') || name.includes('facial') || name.includes('facial basico'))
        return { color: '#47D359', tratamiento: 'HIGIENES Y TRAT. FACIALES', category: 'faciales' };

    // MASAJES (#8B4307 - Brown)
    if (name.includes('masaje') || name.includes('corporal manual') || name.includes('quiromasaje') || name.includes('relax'))
        return { color: '#8B4307', tratamiento: 'MASAJES', category: 'masajes' };

    // ENVOLTURAS (#996600 - Gold/Brown)
    if (name.includes('envoltura') || name.includes('peeling') || name.includes('ritual'))
        return { color: '#996600', tratamiento: 'ENVOLTURAS', category: 'envolventes' };

    // CERAS (#FF99FF - Pink)
    if (name.includes('cera') || name.includes('depilacion'))
        return { color: '#FF99FF', tratamiento: 'CERAS', category: 'depilacion' };

    // 3. Generic Fallbacks

    // PACKS GENERIC (Purple/Gold) - Only if not caught by specific packs above
    if (name.includes('pack') || name.includes('experiencia') || name.includes('para dos') || name.includes('pareja') || name.includes('romantico') || name.includes('fantasia') || name.includes('aventura') || name.includes('sueño'))
        return { color: '#9b59b6', tratamiento: 'PACKS Y EXPERIENCIAS', category: 'premium' };

    if (name.includes('aparatologia') || name.includes('radiofrecuencia corporal'))
        return { color: '#FF0066', tratamiento: 'TRATAMIENTOS CORPORALES APARATOLOGÍA', category: 'aparatologia' };

    if (name.includes('spa') || name.includes('circuito'))
        return { color: '#3b82f6', tratamiento: 'CIRCUITO SPA', category: 'spa' };

    if (name.includes('gym') || name.includes('gimnasio'))
        return { color: '#6366f1', tratamiento: 'GIMNASIO', category: 'gym' };

    return { color: '#64748b', tratamiento: 'SERVICIOS VARIOS', category: 'otros' };
};

const MESACHEF_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAXv_wKD48EFDe8FBQ-6m0XGUNoxSRiTJY",
    authDomain: "mesa-chef-prod.firebaseapp.com",
    projectId: "mesa-chef-prod",
    storageBucket: "mesa-chef-prod.firebasestorage.app",
    messagingSenderId: "43170330072",
    appId: "1:43170330072:web:bcdd09e39930ad08bf2ead"
};

let _mesachefDbInstance = null;
let _mesachefAuthPromise = null;

window.getMesachefApp = function () {
    if (typeof firebase === 'undefined') return null;
    let app = (firebase.apps || []).find(a => a.name === 'mesachefApp');
    if (!app) {
        app = firebase.initializeApp(MESACHEF_FIREBASE_CONFIG, 'mesachefApp');
    }
    return app;
};

window.ensureMesachefAuth = async function () {
    const app = window.getMesachefApp();
    if (!app) return false;
    if (typeof app.auth !== 'function') {
        if (!document.querySelector('script[src*="firebase-auth-compat.js"]')) {
            await new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js';
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
    }
    if (typeof app.auth !== 'function') return false;
    const auth = app.auth();
    if (auth.currentUser) return true;
    if (!_mesachefAuthPromise) {
        _mesachefAuthPromise = auth.signInAnonymously()
            .then(() => true)
            .catch((err) => {
                console.warn('[MESACHEF AUTH] Anonymous sign-in failed:', err);
                _mesachefAuthPromise = null;
                return false;
            });
    }
    return _mesachefAuthPromise;
};

window.getMesachefFirestore = function () {
    if (_mesachefDbInstance) return _mesachefDbInstance;
    try {
        const app = window.getMesachefApp();
        if (!app) return null;
        _mesachefDbInstance = app.firestore();
        return _mesachefDbInstance;
    } catch (e) {
        console.warn('[MESACHEF SYNC] Could not initialize Mesachef Firestore instance:', e);
        return null;
    }
};

/**
 * Synchronizes a spa reservation to Mesachef (reservas_restaurante collection)
 * if it contains restaurant-related services or complements.
 * Uses the same reservation ID for both documents to enable seamless editing and cancellation.
 */
window.syncReservationToMesachef = async function (id, payload) {
    if (!id || !payload) return;
    try {
        const statusNorm = (payload.status || payload.estado || '').toLowerCase();
        if (statusNorm === 'anulada' || statusNorm === 'cancelada') {
            await window.cancelReservationInMesachef(
                id,
                [payload.res_id, payload.referencia, payload.bono, payload.codigo_bono, payload.localizador],
                {
                    fecha: payload.fecha,
                    nombre: payload.nombre || payload.cliente,
                    telefono: payload.tel || payload.telefono
                }
            );
            return;
        }
        const serviceName = (payload.servicio || '').toLowerCase();
        const complementos = payload.complementos || [];
        
        // 1. Check if the reservation is restaurant-related
        const isRestaurantService = serviceName.includes('restaurante') || 
                                    serviceName.includes('menu') || 
                                    serviceName.includes('menú') || 
                                    serviceName.includes('comida') || 
                                    serviceName.includes('cena') || 
                                    serviceName.includes('almuerzo');
                                    
        const isRestaurantComplement = complementos.some(comp => {
            const compLower = comp.toLowerCase();
            return compLower.includes('restaurante') || 
                   compLower.includes('menu') || 
                   compLower.includes('menú') || 
                   compLower.includes('comida') || 
                   compLower.includes('cena') || 
                   compLower.includes('almuerzo');
        });
        
        const isRestaurantCollection = payload.collection === 'reservas_restaurante' || payload.origen === 'restaurante';

        const isRestaurantRelated = isRestaurantService || isRestaurantComplement || isRestaurantCollection;

        const mesachefDb = window.getMesachefFirestore();
        if (mesachefDb && typeof window.ensureMesachefAuth === 'function') {
            await window.ensureMesachefAuth();
        }

        if (!isRestaurantRelated) {
            // If it is NOT restaurant-related, check if there's an existing document in Mesachef to remove
            // to handle cases where a service was edited from restaurant to something else.
            const docRef = db.collection("reservas_restaurante").doc(id);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                console.log(`[MESACHEF SYNC] Removing non-restaurant reservation from local: ${id}`);
                await docRef.delete();
            }
            if (mesachefDb) {
                try {
                    await mesachefDb.collection("reservas_restaurante").doc(id).delete();
                    console.log(`[MESACHEF SYNC] Removing non-restaurant reservation from Mesachef prod: ${id}`);
                } catch (delErr) {
                    console.warn(`[MESACHEF SYNC] Could not delete non-restaurant from Mesachef prod:`, delErr);
                }
            }
            return;
        }

        console.log(`[MESACHEF SYNC] Syncing reservation ${id} to Mesachef...`);

        // 2. Prepare Mesachef payload
        const hour = parseInt((payload.hora || '12:00').split(':')[0]) || 12;
        const turno = hour < 18 ? 'almuerzo' : 'cena';
        
        // Parse the reservation date to Firestore Timestamp
        let firebaseFecha = null;
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.Timestamp) {
            const dateParts = (payload.fecha || '').split('-');
            if (dateParts.length === 3) {
                const y = parseInt(dateParts[0]);
                const m = parseInt(dateParts[1]) - 1;
                const d = parseInt(dateParts[2]);
                const dateObj = new Date(y, m, d, 12, 0, 0); // 12:00 noon to avoid timezone issues
                firebaseFecha = firebase.firestore.Timestamp.fromDate(dateObj);
            }
        }
        if (!firebaseFecha) {
            firebaseFecha = payload.fecha; // fallback to string
        }

        const name = payload.nombre || payload.cliente || '';
        
        const mesachefPayload = {
            hotel: "Cumbria", // Always Cumbria as requested
            referencia: payload.bono ? payload.bono : id, // Bono or Reservation ID
            fecha: firebaseFecha,
            espacio: 'Restaurante',
            nombre: name,
            cliente: name,
            telefono: payload.tel || payload.telefono || '',
            hora: payload.hora || '14:00',
            mesa: payload.mesa || '',
            pax: parseInt(payload.pax) || 1,
            ninos: parseInt(payload.ninos) || 0,
            precio: 0, // Always 0.00 since it is included
            turno: turno,
            estado: payload.status === 'anulada' ? 'anulada' : 'confirmada',
            notas: (payload.obs || '') + (payload.bono ? ` [Bono: ${payload.bono}]` : '') + ` [Sincronizado desde Gest-Spa]`,
            notaCliente: '',
            servicioIncluido: true, // Always marked as included
            tipoIncluido: 'spa', // Always Spa (Nº Bono)
            campoHabitacion: payload.hab || null,
            campoBono: payload.bono || null,
            external_id: id,
            updatedAt: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString()
        };

        if (payload.status === 'anulada') {
            mesachefPayload.cancelledAt = typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString();
        }

        // 3. Write to reservas_restaurante collection in local db
        await db.collection("reservas_restaurante").doc(id).set(mesachefPayload, { merge: true });
        console.log(`[MESACHEF SYNC] Successfully synced reservation ${id} to local db.`);

        // 4. Also write to Mesachef production database (mesa-chef-prod)
        if (mesachefDb) {
            try {
                await mesachefDb.collection("reservas_restaurante").doc(id).set(mesachefPayload, { merge: true });
                console.log(`[MESACHEF SYNC] Successfully synced reservation ${id} to Mesachef production DB.`);
            } catch (prodErr) {
                console.warn(`[MESACHEF SYNC] Could not sync reservation ${id} to Mesachef production DB:`, prodErr);
            }
        }
    } catch (err) {
        console.error(`[MESACHEF SYNC] Error syncing reservation ${id} to Mesachef:`, err);
    }
};

/**
 * Cancels a spa reservation in Mesachef if it exists.
 */
window.cancelReservationInMesachef = async function (id, extraCodes = [], context = {}) {
    if (!id) return;
    try {
        const docRef = db.collection("reservas_restaurante").doc(id);
        const docSnap = await docRef.get();
        const updatePayload = {
            estado: 'anulada',
            cancelledAt: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString(),
            updatedAt: typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString()
        };

        if (docSnap.exists) {
            console.log(`[MESACHEF SYNC] Cancelling reservation in local Mesachef: ${id}`);
            await docRef.update(updatePayload);
        }

        const mesachefDb = window.getMesachefFirestore();
        if (mesachefDb && typeof window.ensureMesachefAuth === 'function') {
            await window.ensureMesachefAuth();
        }
        if (mesachefDb) {
            const codes = Array.from(new Set([id, ...(Array.isArray(extraCodes) ? extraCodes : [extraCodes])].map(c => (c || '').toString().trim()).filter(c => c && c.toUpperCase() !== 'NUEVA')));
            const matchedDocs = typeof window.findMesachefReservations === 'function'
                ? await window.findMesachefReservations(codes, context)
                : [];
            for (const matched of matchedDocs) {
                if (['anulada', 'cancelada'].includes((matched.estado || '').toLowerCase())) continue;
                try {
                    await mesachefDb.collection("reservas_restaurante").doc(matched.id).update(updatePayload);
                    console.log(`[MESACHEF SYNC] Cancelled reservation in Mesachef prod: ${matched.id}`);
                } catch (prodErr) {
                    console.warn(`[MESACHEF SYNC] Could not cancel ${matched.id} in Mesachef prod:`, prodErr);
                }
            }
        }
    } catch (err) {
        console.error(`[MESACHEF SYNC] Error cancelling reservation ${id} in Mesachef:`, err);
    }
};

/**
 * Permanently deletes a spa reservation in Mesachef if it exists.
 */
window.deleteReservationInMesachef = async function (id, extraCodes = [], context = {}) {
    if (!id) return;
    try {
        const docRef = db.collection("reservas_restaurante").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            console.log(`[MESACHEF SYNC] Deleting reservation in local Mesachef: ${id}`);
            await docRef.delete();
        }

        const mesachefDb = window.getMesachefFirestore();
        if (mesachefDb && typeof window.ensureMesachefAuth === 'function') {
            await window.ensureMesachefAuth();
        }
        if (mesachefDb) {
            const codes = Array.from(new Set([id, ...(Array.isArray(extraCodes) ? extraCodes : [extraCodes])].map(c => (c || '').toString().trim()).filter(c => c && c.toUpperCase() !== 'NUEVA')));
            const matchedDocs = typeof window.findMesachefReservations === 'function'
                ? await window.findMesachefReservations(codes, context)
                : [];
            for (const matched of matchedDocs) {
                try {
                    await mesachefDb.collection("reservas_restaurante").doc(matched.id).delete();
                    console.log(`[MESACHEF SYNC] Deleted reservation in Mesachef prod: ${matched.id}`);
                } catch (prodErr) {
                    console.warn(`[MESACHEF SYNC] Could not delete ${matched.id} from Mesachef prod:`, prodErr);
                }
            }
        }
    } catch (err) {
        console.error(`[MESACHEF SYNC] Error deleting reservation ${id} in Mesachef:`, err);
    }
};

/**
 * Returns active Mesachef reservations linked to a Gest-Spa reservation and a readable summary.
 */
window.getActiveMesachefReservationsForRes = async function (id, resData = {}) {
    if (typeof window.findMesachefReservations !== 'function') return { activeDocs: [], summary: '' };
    const codes = [
        id,
        resData?.res_id,
        resData?.referencia,
        resData?.bono,
        resData?.codigo_bono,
        resData?.localizador
    ].filter(Boolean);
    const context = {
        fecha: resData?.fecha || '',
        nombre: resData?.nombre || resData?.cliente || '',
        telefono: resData?.tel || resData?.telefono || ''
    };
    const docs = await window.findMesachefReservations(codes, context);
    const activeDocs = docs.filter(d => !['anulada', 'cancelada'].includes((d.estado || '').toLowerCase()));
    if (activeDocs.length === 0) return { activeDocs: [], summary: '' };

    const r = activeDocs[0];
    let fechaTxt = '';
    try {
        const d = r.fecha?.toDate ? r.fecha.toDate() : (r.fecha ? new Date(r.fecha) : null);
        if (d && !isNaN(d.getTime())) fechaTxt = d.toLocaleDateString('es-ES');
    } catch (e) { /* ignore */ }
    const turnoTxt = r.turno ? ` (${r.turno === 'almuerzo' ? 'Almuerzo' : (r.turno === 'cena' ? 'Cena' : r.turno)})` : '';
    const horaTxt = r.hora ? ` · ${r.hora}` : '';
    const refTxt = r.referencia ? ` · Ref: ${r.referencia}` : '';
    return {
        activeDocs,
        summary: `${fechaTxt}${horaTxt}${turnoTxt}${refTxt}`.replace(/^\s*·\s*/, '')
    };
};

/**
 * Prompts the user when date or time changes on an edited reservation that has an active Mesachef booking.
 */
window.promptMesachefOnDateTimeChange = async function ({ id, payload, oldDate, newDate, oldTime, newTime }) {
    if (!id || !payload) return;
    const normOldTime = (oldTime || '').replace(/h$/i, '').trim();
    const normNewTime = (newTime || '').replace(/h$/i, '').trim();
    const dateChanged = Boolean(oldDate && newDate && oldDate !== newDate);
    const timeChanged = Boolean(normOldTime && normNewTime && normOldTime !== normNewTime);
    if (!dateChanged && !timeChanged) return;

    const { activeDocs, summary } = await window.getActiveMesachefReservationsForRes(id, {
        ...payload,
        fecha: oldDate || payload.fecha
    });
    if (!activeDocs || activeDocs.length === 0 || typeof Swal === 'undefined') return;

    const fmtDate = (iso) => {
        if (!iso || !iso.includes('-')) return iso || '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };
    const openMesachefHome = () => {
        const base = (typeof window.getBaseURL === 'function' ? window.getBaseURL('mesachef') : '') || 'https://nataliogc.github.io/Mesachef/';
        const finalUrl = `${base.replace(/\/+$/, '')}/restaurante.html`;
        const win = window.open(finalUrl, 'GestSpa_Mesachef');
        if (win) win.focus();
    };

    if (dateChanged) {
        const res = await Swal.fire({
            title: 'Reserva en Mesachef vinculada',
            icon: 'question',
            html: `<div style="font-size:0.92rem; line-height:1.5; color:#334155;">
                Has cambiado la fecha del Spa del <strong>${fmtDate(oldDate)}</strong> al <strong>${fmtDate(newDate)}</strong>.<br><br>
                <span style="display:inline-block; padding:6px 10px; border-radius:6px; background:#fef3c7; border:1px solid #fcd34d; color:#92400e; font-size:0.85rem;">
                    <i class="fas fa-utensils"></i> Mesachef actual: <strong>${summary || 'Reserva activa'}</strong>
                </span><br><br>
                ¿Quieres cambiar también la fecha en Mesachef?
            </div>`,
            showConfirmButton: true,
            confirmButtonText: 'Cambiar fecha en Mesachef',
            confirmButtonColor: '#d97706',
            showDenyButton: true,
            denyButtonText: 'Abrir Mesachef',
            denyButtonColor: '#0f172a',
            showCancelButton: true,
            cancelButtonText: 'Mantener igual'
        });

        if (res.isConfirmed) {
            const mesachefDb = window.getMesachefFirestore();
            if (mesachefDb) {
                if (typeof window.ensureMesachefAuth === 'function') await window.ensureMesachefAuth();
                const newTs = (typeof firebase !== 'undefined' && firebase.firestore?.Timestamp)
                    ? firebase.firestore.Timestamp.fromDate(new Date(newDate))
                    : newDate;
                const upd = {
                    fecha: newTs,
                    updatedAt: (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
                        ? firebase.firestore.FieldValue.serverTimestamp()
                        : new Date().toISOString()
                };
                for (const doc of activeDocs) {
                    try {
                        await mesachefDb.collection('reservas_restaurante').doc(doc.id).update(upd);
                    } catch (e) {
                        console.warn('[MESACHEF] Error updating date in Mesachef:', e);
                    }
                }
                if (typeof showToast === 'function') showToast(`Fecha actualizada en Mesachef al ${fmtDate(newDate)}`, 'success');
            }
        } else if (res.isDenied) {
            openMesachefHome();
        }
    } else if (timeChanged) {
        const res = await Swal.fire({
            title: '¿Cambiar hora en Mesachef?',
            icon: 'info',
            html: `<div style="font-size:0.92rem; line-height:1.5; color:#334155;">
                Has cambiado la hora del Spa de <strong>${normOldTime}h</strong> a <strong>${normNewTime}h</strong>.<br><br>
                <span style="display:inline-block; padding:6px 10px; border-radius:6px; background:#fef3c7; border:1px solid #fcd34d; color:#92400e; font-size:0.85rem;">
                    <i class="fas fa-utensils"></i> Mesachef actual: <strong>${summary || 'Reserva activa'}</strong>
                </span><br><br>
                ¿Quieres abrir Mesachef para modificar también la reserva del restaurante?
            </div>`,
            showConfirmButton: true,
            confirmButtonText: 'Abrir Mesachef',
            confirmButtonColor: '#d97706',
            showCancelButton: true,
            cancelButtonText: 'No, mantener hora'
        });

        if (res.isConfirmed) {
            openMesachefHome();
        }
    }
};


