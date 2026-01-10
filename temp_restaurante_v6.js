/**
 * BRIDGE SCRIPT V7.0 - RESTAURANT INTEGRATION (WITH DIRECT VOUCHER UPDATE)
 * -----------------------------------------
 * Append this code to the END of js/restaurante.js in 'gestion-Salones'
 */

(function () {
    console.log("[Bridge] v7.0 Loading (Aggressive Mode + Direct Voucher Update)...");

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

    // 3.5 Initialize secondary Firebase for Gest-Spa (to update vouchers directly)
    let gestSpaDb = null;
    const initGestSpaFirebase = () => {
        const gestSpaConfig = {
            apiKey: "AIzaSyBhEbjopBY41V5rExPbsgkZMQueRIQIk",
            authDomain: "gest-spa.firebaseapp.com",
            projectId: "gest-spa",
            storageBucket: "gest-spa.appspot.com",
            messagingSenderId: "982069965360",
            appId: "1:982069965360:web:f10b51551ed913c506b3f5"
        };

        try {
            // Check if firebase is available
            if (typeof firebase === 'undefined') {
                console.log("[Bridge] Firebase not available, skipping secondary init.");
                return;
            }

            // Initialize secondary app if not already done
            let gestSpaApp;
            try {
                gestSpaApp = firebase.app('gestSpaApp');
            } catch (e) {
                gestSpaApp = firebase.initializeApp(gestSpaConfig, 'gestSpaApp');
            }

            gestSpaDb = gestSpaApp.firestore();
            gestSpaDb.settings({ experimentalForceLongPolling: true });
            console.log("[Bridge] Gest-Spa Firebase initialized successfully.");
        } catch (error) {
            console.error("[Bridge] Error initializing Gest-Spa Firebase:", error);
        }
    };

    // Initialize when Firebase is loaded
    if (typeof firebase !== 'undefined') {
        initGestSpaFirebase();
    } else {
        // Wait for firebase to load
        window.addEventListener('load', () => {
            setTimeout(initGestSpaFirebase, 500);
        });
    }

    // 3.6 Queue voucher update via localStorage (CORS-safe for file:// protocol)
    // bonos.js will check for pending updates when it loads
    const updateVoucherSessions = async (reservationId) => {
        try {
            console.log(`[Bridge] Queueing voucher update for ${voucherParam}...`);

            // Get existing pending reservations or create empty array
            const pendingKey = 'pendingVoucherReservations';
            let pending = [];
            try {
                pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
            } catch (e) {
                pending = [];
            }

            // Add new pending reservation
            const reservationData = {
                voucherCode: voucherParam,
                serviceName: serviceParam || 'Restaurante',
                reservationId: reservationId,
                timestamp: new Date().toISOString(),
                client: clientParam,
                pax: paxParam
            };

            pending.push(reservationData);

            // Save back to localStorage
            localStorage.setItem(pendingKey, JSON.stringify(pending));

            console.log("[Bridge] Reservation queued for voucher update:", reservationData);
            showBridgeToast("✅ Reserva guardada - Refresca bonos para ver cambios");

        } catch (error) {
            console.error("[Bridge] Error queueing voucher update:", error);
        }
    };


    // UI Pre-filling - Wait for modal to be visible
    const fillModalFields = () => {
        console.log("[Bridge] Attempting to fill modal fields...");

        // Check if the modal is TRULY visible (using computed style, not inline style)
        const modal = document.getElementById('modalReserva');
        if (!modal) {
            console.log("[Bridge] Modal element not found, will retry...");
            return false;
        }

        // Use getComputedStyle to get the ACTUAL display value (including CSS classes)
        const computedStyle = window.getComputedStyle(modal);
        const isModalVisible = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';

        if (!isModalVisible) {
            console.log("[Bridge] Modal not visible yet (display:", computedStyle.display, "), will retry...");
            return false;
        }

        console.log("[Bridge] Modal is visible, filling fields...");

        // Auto-fill client name
        if (clientParam) {
            const n = document.getElementById('campoNombre');
            if (n) { n.value = clientParam; n.dispatchEvent(new Event('input')); }
        }

        // Auto-fill phone
        if (phoneParam) {
            const t = document.getElementById('campoTelefono');
            if (t) { t.value = phoneParam; t.dispatchEvent(new Event('input')); }
        }

        // Auto-fill pax
        if (paxParam) {
            const p = document.getElementById('campoPax');
            if (p) { p.value = paxParam; p.dispatchEvent(new Event('change')); }
        }

        // Check "Servicio Incluido" checkbox to show the type selector
        const checkInc = document.getElementById('checkServicioIncluido');
        if (checkInc && !checkInc.checked) {
            checkInc.checked = true;
            checkInc.dispatchEvent(new Event('change'));
        }

        // Wait a bit for the DOM to update after checking the box
        setTimeout(() => {
            // Select "Spa (Nº Bono)" in the service type dropdown
            const tipoInc = document.getElementById('tipoIncluido');
            if (tipoInc) {
                tipoInc.value = 'spa';
                tipoInc.dispatchEvent(new Event('change'));
                console.log("[Bridge] Set tipoIncluido to 'spa'");
            }

            // Wait for Bono field to become visible
            setTimeout(() => {
                // Fill the voucher number
                const cBono = document.getElementById('campoBono');
                if (cBono && voucherParam) {
                    cBono.value = voucherParam;
                    cBono.dispatchEvent(new Event('input'));
                    console.log("[Bridge] Set campoBono to:", voucherParam);
                }

                showBridgeToast("✓ Campos de Bono Pre-rellenados");
            }, 100);
        }, 100);

        return true;
    };

    // Use MutationObserver to detect when modal opens
    const initBridge = () => {
        console.log("[Bridge] Initializing bridge script...");

        // Show banner immediately
        const title = document.querySelector('.modal-title') || document.querySelector('h5');
        if (title && !title.innerText.includes('BONO')) {
            const badge = document.createElement('span');
            badge.innerText = " [VINCULADO: " + voucherParam + "]";
            badge.className = "badge bg-pink-500 text-white ml-2";
            badge.style.color = "#ec4899";
            badge.style.marginLeft = "10px";
            title.appendChild(badge);
        }

        // Setup observer for modal visibility
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' || mutation.type === 'childList') {
                    if (fillModalFields()) {
                        observer.disconnect();
                        console.log("[Bridge] Fields filled, observer disconnected.");
                        return;
                    }
                }
            }
        });

        // Start observing the body for changes (modal being added/shown)
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        // Also try immediately and with a fallback interval
        if (!fillModalFields()) {
            // Retry every 500ms for up to 30 seconds
            let attempts = 0;
            const maxAttempts = 60;
            const interval = setInterval(() => {
                attempts++;
                if (fillModalFields() || attempts >= maxAttempts) {
                    clearInterval(interval);
                    if (attempts >= maxAttempts) {
                        console.log("[Bridge] Max attempts reached, stopping retry.");
                    }
                }
            }, 500);
        }
    };

    // Run immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initBridge);
    } else {
        // DOM already loaded, run immediately
        initBridge();
    }


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

    const notifyOpener = async (id) => {
        console.log(`[Bridge] Notifying opener. ResID: ${id}`);

        // FIRST: Update voucher directly in Gest-Spa database
        await updateVoucherSessions(id);

        // THEN: Try to notify opener window (may fail with file:// protocol)
        if (window.opener) {
            try {
                window.opener.postMessage({
                    type: 'RESERVATION_COMPLETED',
                    code: voucherParam,
                    item: serviceParam || 'Restaurante',
                    reservationId: id
                }, '*');
            } catch (e) {
                console.log("[Bridge] postMessage failed (expected with file:// protocol):", e);
            }
        }

        // Close window after a delay
        showBridgeToast("✅ Reserva vinculada correctamente");
        setTimeout(() => {
            if (window.opener) {
                window.close();
            }
        }, 2000);
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
