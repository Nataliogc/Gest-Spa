/**
 * BRIDGE SCRIPT V6.0 - RESTAURANT INTEGRATION (AGGRESSIVE PATCH)
 * -----------------------------------------
 * Append this code to the END of js/restaurante.js in 'gestion-Salones'
 */

(function () {
    console.log("[Bridge] v6.0 Loading (Aggressive Mode)...");

    // 1. URL Parameter Parsing
    const urlParams = new URLSearchParams(window.location.search);
    const hotelParam = urlParams.get('hotel');
    const paxParam = urlParams.get('pax');
    const clientParam = urlParams.get('client');
    const phoneParam = urlParams.get('phone');
    const voucherParam = urlParams.get('voucher'); // Already decoded by browser/params
    const serviceParam = urlParams.get('service');

    if (!voucherParam) {
        console.log("[Bridge] No voucher param detected. Bridge inactive.");
        return;
    }

    // 2. Visual Indicator Helper
    const showBridgeToast = (msg) => {
        const div = document.createElement('div');
        div.innerText = "🔒 " + msg;
        div.style.position = 'fixed';
        div.style.top = '10px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.background = '#059669';
        div.style.color = 'white';
        div.style.padding = '10px 20px';
        div.style.borderRadius = '30px';
        div.style.zIndex = '99999';
        div.style.fontWeight = 'bold';
        div.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    };

    // 3. Immediate Context Override
    if (hotelParam) {
        localStorage.setItem('mesaChef_hotel', hotelParam);
    }

    // UI Pre-filling
    window.addEventListener('DOMContentLoaded', async () => {
        // Show banner
        const title = document.querySelector('.modal-title') || document.querySelector('h5');
        if (title && !title.innerText.includes('BONO')) {
            const badge = document.createElement('span');
            badge.innerText = " [VINCULADO: " + voucherParam + "]";
            badge.className = "badge bg-pink-500 text-white ml-2";
            badge.style.color = "#ec4899";
            badge.style.marginLeft = "10px";
            title.appendChild(badge);
        }

        // Auto-fill fields
        if (clientParam) {
            const n = document.getElementById('campoNombre');
            if (n) n.value = clientParam;
        }
        if (phoneParam) {
            const t = document.getElementById('campoTelefono');
            if (t) t.value = phoneParam;
        }
        if (paxParam) {
            const p = document.getElementById('campoPax');
            if (p) { p.value = paxParam; p.dispatchEvent(new Event('change')); }
        }
        const checkInc = document.getElementById('checkServicioIncluido');
        if (checkInc) { checkInc.checked = true; }
    });


    // 4. FIRESTORE INTERCEPTION (Logic)
    const patchCollectionRef = (colRef, colName) => {
        if (colRef._isPatched) return colRef;

        const originalAdd = colRef.add;
        const originalDoc = colRef.doc;

        // Intercept .add()
        colRef.add = async function (data) {
            console.log(`[Bridge] Intercepting .add to '${colName}':`, data);
            showBridgeToast("Vinculando Reserva a Bono...");
            enhanceData(data);
            try {
                const result = await originalAdd.call(this, data);
                notifyOpener(result.id);
                return result;
            } catch (e) {
                alert("Error guardando reserva vinculada: " + e.message);
                throw e;
            }
        };

        // Intercept .doc(...)
        colRef.doc = function (path) {
            const docRef = originalDoc.call(this, path);
            if (docRef._isPatched) return docRef;

            const originalSet = docRef.set;
            // Intercept .set()
            docRef.set = async function (data, options) {
                console.log(`[Bridge] Intercepting .set to '${colName}/${path || docRef.id}':`, data);
                showBridgeToast("Actualizando y Vinculando Bono...");
                enhanceData(data);
                try {
                    const result = await originalSet.call(this, data, options);
                    notifyOpener(docRef.id);
                    return result;
                } catch (e) {
                    alert("Error guardando reserva vinculada: " + e.message);
                    throw e;
                }
            };

            docRef._isPatched = true;
            return docRef;
        };

        colRef._isPatched = true;
        return colRef;
    };

    const enhanceData = (data) => {
        // Force inject voucher data
        data.bono = voucherParam; // "LOC - 2026 -1523"
        data.origen = 'bono';
        data.pax = paxParam || data.pax || 1;
        data.cliente_spa = clientParam || '';
        // Ensure service name is set if missing
        if (!data.servicio) {
            data.servicio = serviceParam || 'Restaurante';
        }
    };

    const notifyOpener = (id) => {
        console.log(`[Bridge] Notifying opener. ResID: ${id}`);
        if (window.opener) {
            window.opener.postMessage({
                type: 'RESERVATION_COMPLETED',
                code: voucherParam,
                item: serviceParam || 'Restaurante',
                reservationId: id
            }, '*');
            setTimeout(() => window.close(), 1000);
        }
    };

    // 5. APPLY PATCHES (Aggressive)
    const applyPatches = () => {
        let patchedCount = 0;

        // A) Patch window.db instance directly
        if (window.db && window.db.collection && !window.db._collectionPatched) {
            const originalCollection = window.db.collection;
            window.db.collection = function (name) {
                const colRef = originalCollection.call(this, name);
                return patchCollectionRef(colRef, name);
            };
            window.db._collectionPatched = true;
            patchedCount++;
            console.log("[Bridge] Patched window.db.collection");
        }

        // B) Patch Firebase Prototype (catches new instances)
        if (window.firebase && window.firebase.firestore && !window.firebase._polyPatched) {
            const originalFirestore = window.firebase.firestore;
            // Helper wrapping
            const wrapper = function () {
                const instance = originalFirestore.apply(this, arguments);
                if (!instance._collectionPatched) {
                    const originalCol = instance.collection;
                    instance.collection = function (name) {
                        const colRef = originalCol.call(this, name);
                        return patchCollectionRef(colRef, name);
                    };
                    instance._collectionPatched = true;
                    console.log("[Bridge] Patched new firestore instance via prototype");
                }
                return instance;
            };
            // Copy static props
            Object.assign(wrapper, originalFirestore);
            window.firebase.firestore = wrapper;
            window.firebase._polyPatched = true;
            patchedCount++;
            console.log("[Bridge] Patched firebase.firestore prototype");
        }

        if (patchedCount === 0) {
            // Retry
            setTimeout(applyPatches, 500);
        } else {
            console.log("[Bridge] Patching successful.");
        }
    };

    applyPatches();

})();
