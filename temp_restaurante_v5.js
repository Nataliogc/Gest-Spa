
/**
 * BRIDGE SCRIPT V5.1 - RESTAURANT INTEGRATION (FIXED)
 * -----------------------------------------
 * Append this code to the END of js/restaurante.js in 'gestion-Salones'
 */

(function () {
    console.log("[Bridge] v5.1 Loading...");

    // 1. URL Parameter Parsing
    const urlParams = new URLSearchParams(window.location.search);
    const hotelParam = urlParams.get('hotel');
    const paxParam = urlParams.get('pax');
    const clientParam = urlParams.get('client');
    const phoneParam = urlParams.get('phone');
    const voucherParam = urlParams.get('voucher');
    const serviceParam = urlParams.get('service');

    // 2. Immediate Context Override
    if (hotelParam) {
        localStorage.setItem('mesaChef_hotel', hotelParam);
    }

    // 3. FIRESTORE INTERCEPTION (Broadened Scope)
    const interceptFirestore = () => {
        if (window.db && !window.db._isPatched) {
            console.log("[Bridge] Patching Firestore...");

            const originalCollection = window.db.collection;
            window.db.collection = function (name) {
                const colRef = originalCollection.call(this, name);

                // If we have a voucher, we intercept EVERYTHING to be safe.
                // We assume if the user is in the Restaurant App with a voucher, 
                // ANY save should probably be linked to that voucher.
                if (voucherParam) {
                    const originalAdd = colRef.add;
                    const originalDoc = colRef.doc;

                    // Intercept .add()
                    colRef.add = async function (data) {
                        console.log(`[Bridge] Intercepting .add to '${name}':`, data);
                        enhanceData(data);
                        const result = await originalAdd.call(this, data);
                        notifyOpener(result.id);
                        return result;
                    };

                    // Intercept .doc().set()
                    colRef.doc = function (path) {
                        const docRef = originalDoc.call(this, path);
                        const originalSet = docRef.set;

                        docRef.set = async function (data, options) {
                            console.log(`[Bridge] Intercepting .set to '${name}/${path || docRef.id}':`, data);
                            enhanceData(data);
                            const result = await originalSet.call(this, data, options);
                            notifyOpener(docRef.id);
                            return result;
                        };
                        return docRef;
                    };

                    function enhanceData(data) {
                        data.bono = voucherParam;
                        data.origen = 'bono';
                        data.pax = paxParam || data.pax || 1;
                        data.cliente_spa = clientParam || '';

                        if (name === 'reservas_spa') {
                            data.servicio = data.servicio || serviceParam || 'Menú Restaurante';
                        }
                    }

                    function notifyOpener(id) {
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'RESERVATION_COMPLETED',
                                code: voucherParam,
                                item: serviceParam || 'Restaurante',
                                reservationId: id
                            }, '*');
                            setTimeout(() => window.close(), 500);
                        }
                    }
                }
                return colRef;
            };
            window.db._isPatched = true;
        } else {
            setTimeout(interceptFirestore, 500);
        }
    };
    interceptFirestore();

    // 4. UI Pre-filling
    window.addEventListener('DOMContentLoaded', async () => {
        const btn = document.getElementById('btnGuardar');
        if (btn) {
            btn.classList.remove('hidden');
            btn.style.display = 'block';
            btn.disabled = false;
        }

        if (clientParam) {
            const el = document.getElementById('campoNombre');
            if (el) el.value = clientParam;
        }
        if (phoneParam) {
            const el = document.getElementById('campoTelefono');
            if (el) el.value = phoneParam;
        }
        if (paxParam) {
            const el = document.getElementById('campoPax');
            if (el) {
                el.value = paxParam;
                el.dispatchEvent(new Event('input'));
                el.dispatchEvent(new Event('change'));
            }
        }

        if (voucherParam) {
            const title = document.querySelector('.modal-title') || document.querySelector('h5');
            if (title && !title.innerText.includes('BONO')) {
                const badge = document.createElement('span');
                badge.innerText = " [SPA/BONO]";
                badge.style.color = "#ec4899";
                badge.style.fontWeight = "bold";
                title.appendChild(badge);
            }
            const checkInc = document.getElementById('checkServicioIncluido');
            if (checkInc) {
                checkInc.checked = true;
                checkInc.dispatchEvent(new Event('change'));
            }
        }
    });

})();
