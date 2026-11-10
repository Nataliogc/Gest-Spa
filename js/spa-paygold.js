/**
 * ═════════════════════════════════════════════════════════════════════════════
 * GEST-SPA (CUMBRIA BIENESTAR) — MÓDULO OFICIAL REDSYS PAYGOLD
 * ═════════════════════════════════════════════════════════════════════════════
 * Integración con el Payment Hub de Cumbria Spa & Hotel para cobro de reservas.
 */

(function () {
    'use strict';

    let currentPayGoldUrl = '';
    let currentPayGoldOrderId = '';

    /**
     * Construye el texto comercial oficial para WhatsApp / Email con el enlace PayGold.
     * Incorpora el número de pedido oficial (SPA-XXXX) y la cláusula de garantía de 24 horas.
     */
    function buildPayGoldCommercialMessage(params) {
        if (!params) params = {};
        const clientName = (params.clientName || params.nombre || 'Estimado/a cliente').trim();
        const serviceName = (params.serviceName || params.servicio || 'Circuito Spa').trim();
        const paymentUrl = params.paymentUrl || params.link || '';
        const amountVal = parseFloat(params.amount || params.pending || params.precio_total || 0).toFixed(2);
        const paxCount = parseInt(params.pax || 1, 10);
        const paxStr = paxCount > 1 ? ` (${paxCount} personas)` : '';
        const orderNumber = params.orderNumber || (params.loc ? `SPA-${String(params.loc).replace(/^RS-?/i, '')}` : '');

        let dateStr = params.dateVal || params.fecha || '';
        if (dateStr && dateStr.includes('-')) {
            const p = dateStr.split('-');
            if (p.length === 3) dateStr = `${p[2]}/${p[1]}/${p[0]}`;
        }
        const timeStr = (params.timeVal || params.hora || '').trim();
        const dateLine = dateStr ? `📅 *Fecha:* ${dateStr}\n` : '';
        const timeLine = timeStr ? `⏰ *Hora:* ${timeStr.replace(/h$/i, '')}h\n` : '';

        return `🌿 *CUMBRIA BIENESTAR — Spa & Hotel* 🌿\n\n` +
            `Estimado/a *${clientName}*,\n\n` +
            `Le confirmamos los detalles de su reserva para disfrutar de una experiencia única de relajación y bienestar:\n\n` +
            (orderNumber ? `🔖 *Nº Pedido / Reserva:* ${orderNumber}\n` : '') +
            `✨ *Servicio:* ${serviceName}${paxStr}\n` +
            dateLine +
            timeLine +
            `💶 *Importe a abonar:* ${amountVal} €\n\n` +
            `💳 *Garantía de Reserva:*\n` +
            `Para garantizar y formalizar su cita, es imprescindible completar el pago con un mínimo de *24 horas de antelación* al servicio mediante nuestra pasarela oficial y 100% segura de Redsys (con Tarjeta bancaria):\n` +
            `👉 ${paymentUrl}\n\n` +
            `⚠️ *Política de Cancelación:* Con el fin de asegurar la disponibilidad de nuestras instalaciones y terapeutas exclusivos, en caso de no recibir el pago antes de 24 horas del servicio, la reserva podrá ser cancelada automáticamente para liberar el espacio a otros clientes.\n\n` +
            `Si necesita realizar cualquier consulta o ajuste en su cita, estamos a su total disposición.\n\n` +
            `¡Será un placer recibirle y cuidar de su bienestar!\n` +
            `*Cumbria Spa & Hotel*`;
    }

    // Exponer generador de mensaje comercial globalmente
    window.buildPayGoldCommercialMessage = buildPayGoldCommercialMessage;

    // Helper para parsear documentos REST de Firestore
    function parseFirestoreDoc(doc) {
        if (!doc || !doc.fields) return null;
        const res = {};
        for (const [key, valObj] of Object.entries(doc.fields)) {
            if ('stringValue' in valObj) res[key] = valObj.stringValue;
            else if ('integerValue' in valObj) res[key] = parseInt(valObj.integerValue, 10);
            else if ('doubleValue' in valObj) res[key] = parseFloat(valObj.doubleValue);
            else if ('booleanValue' in valObj) res[key] = valObj.booleanValue;
            else if ('timestampValue' in valObj) res[key] = valObj.timestampValue;
            else res[key] = valObj;
        }
        return res;
    }

    /**
     * Aplica el éxito de un pago PayGold en la reserva (Firestore + Memoria local + UI)
     */
    window.applyPayGoldPaymentSuccess = async function (resId, paymentData) {
        if (!resId || !paymentData) return;

        // Localizar reserva en memoria
        let res = null;
        if (typeof currentData !== 'undefined' && Array.isArray(currentData)) {
            res = currentData.find(r => r.id === resId || r.res_id === resId);
        }
        if (!res && window.state && Array.isArray(window.state.citas)) {
            res = window.state.citas.find(r => r.id === resId || r.res_id === resId);
        }

        const paidAmount = parseFloat(paymentData.amountEuros || paymentData.amount || 0);
        const authCode = String(paymentData.authCode || paymentData.autorizacion || '').trim();
        const orderId = String(paymentData.orderId || '').trim();
        const paidAt = paymentData.paidAt || new Date().toISOString();

        const total = parseFloat(res?.precio_total || res?.precio || document.getElementById("res-precio-total")?.value || 0);
        const existingPaid = (res?.payment && typeof res.payment.paid === 'number') ? res.payment.paid : (parseFloat(res?.paid_amount || res?.pagado || 0) || 0);
        const newPaid = Math.max(existingPaid, paidAmount);
        const isFullyPaid = (newPaid >= total - 0.05) || (total <= 0 && newPaid > 0);

        const historyItem = {
            fecha: paidAt,
            importe: paidAmount,
            metodo: 'TPV Redsys PayGold',
            autorizacion: authCode,
            orderId: orderId,
            usuario: 'Redsys Online (Automático)',
            timestamp: new Date().toISOString()
        };

        const existingHistory = (res?.payment && Array.isArray(res.payment.history)) ? res.payment.history : [];
        const alreadyLogged = existingHistory.some(h => (h.orderId && h.orderId === orderId) || (authCode && h.autorizacion && h.autorizacion === authCode));
        const newHistory = alreadyLogged ? existingHistory : [...existingHistory, historyItem];

        const paymentUpdate = {
            paid: newPaid,
            history: newHistory,
            status: isFullyPaid ? 'paid' : 'partial'
        };

        const updatePayload = {
            payment: paymentUpdate,
            pagado: isFullyPaid,
            estado_pago: isFullyPaid ? 'pagado' : 'parcial',
            service_payment_status: isFullyPaid ? 'paid' : 'partial',
            paygold_status: 'COBRADO',
            paygold_auth: authCode,
            paygold_paid_at: paidAt,
            updated_at: new Date().toISOString()
        };

        // Identificar colección de Firestore correspondiente
        let targetColl = 'reservas_spa';
        if (res && res._moduleCode && window.MODULES && window.MODULES[res._moduleCode]) {
            targetColl = window.MODULES[res._moduleCode].collection;
        } else if (res && res.collection) {
            targetColl = res.collection;
        } else if (res && res.moduleType && window.MODULES && window.MODULES[res.moduleType]) {
            targetColl = window.MODULES[res.moduleType].collection;
        } else if (window.currentModule && window.currentModule.collection) {
            targetColl = window.currentModule.collection;
        }

        // 1. Guardar en Firestore del Spa
        if (typeof db !== 'undefined' && db && resId) {
            try {
                await db.collection(targetColl).doc(resId).update(updatePayload);
                console.log(`[PayGold AutoSync] ✅ Reserva ${resId} actualizada en Firestore como PAGADA (${targetColl}).`);
            } catch (dbErr) {
                console.warn(`[PayGold AutoSync] Error actualizando en Firestore para ${resId}:`, dbErr);
            }
        }

        // 2. Actualizar memoria local
        if (res) {
            res.payment = paymentUpdate;
            res.pagado = updatePayload.pagado;
            res.estado_pago = updatePayload.estado_pago;
            res.service_payment_status = updatePayload.service_payment_status;
            res.paygold_status = 'COBRADO';
            res.paygold_auth = authCode;
            res.paygold_paid_at = paidAt;
        }

        // 3. Actualizar UI si la ficha de esta reserva está en pantalla
        const openResId = document.getElementById("form-id")?.value;
        if (openResId === resId || (res && res.id === openResId)) {
            if (typeof window.updatePaymentControlBlock === 'function') {
                window.updatePaymentControlBlock();
            }
            const banner = document.getElementById("pp-paygold-banner");
            if (banner) {
                banner.style.display = "block";
                banner.style.background = "#ecfdf5";
                banner.style.borderColor = "#10b981";
                banner.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.3rem;">✅</span>
                            <div>
                                <div style="font-weight:800; color:#065f46; font-size:0.85rem;">
                                    PAGO REDSYS RECIBIDO Y REGISTRADO AUTOMÁTICAMENTE
                                </div>
                                <div style="font-size:0.75rem; color:#047857; margin-top:2px;">
                                    Importe abonado: <b>${paidAmount.toFixed(2)} €</b> | Pedido: <b>${orderId || res?.paygold_order || ''}</b> ${authCode ? `| Aut: <b style="font-family:monospace; background:#d1fae5; padding:1px 5px; border-radius:4px;">${authCode}</b>` : ''}
                                </div>
                            </div>
                        </div>
                        <span style="background:#047857; color:#fff; font-size:0.7rem; font-weight:800; padding:4px 10px; border-radius:6px; letter-spacing:0.5px;">
                            COBRADO ONLINE
                        </span>
                    </div>
                `;
            }
        }

        // 4. Refrescar listados del Dashboard si aplica
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
        const mainDate = document.getElementById("main-date-picker")?.value;
        if (typeof window.loadReservas === 'function' && mainDate) {
            window.loadReservas(mainDate);
        }

        // 5. Notificación emergente al usuario
        if (typeof showToast === 'function') {
            showToast(`🎉 ¡Pago Redsys de ${paidAmount.toFixed(2)}€ RECIBIDO y REGISTRADO automáticamente! (Aut: ${authCode})`, 'success');
        }
    };

    /**
     * SISTEMA REACTIVO EN TIEMPO REAL (onSnapshot) — CERO POLLING
     * Escucha activamente la reserva en Firestore del proyecto Gest-Spa.
     * En cuanto el webhook valida el pago y actualiza Firestore, la UI se actualiza al instante.
     */
    let activeReservationUnsubscribe = null;
    let currentListeningResId = null;

    const PayGoldAutoSync = {
        start: function () {
            console.log("[PayGold RealTime] Sistema reactivo onSnapshot iniciado (Cero Polling).");
        },

        listenActiveReservation: function (resId, targetColl = 'reservas_spa') {
            if (!resId || resId === 'NUEVA' || !window.db) return;
            if (currentListeningResId === resId && activeReservationUnsubscribe) return;

            if (activeReservationUnsubscribe) {
                activeReservationUnsubscribe();
                activeReservationUnsubscribe = null;
            }

            currentListeningResId = resId;

            try {
                activeReservationUnsubscribe = window.db.collection(targetColl).doc(resId).onSnapshot(docSnap => {
                    if (!docSnap.exists) return;
                    const data = docSnap.data();

                    const isCobrado = data.paygold_status === 'COBRADO' ||
                                      data.paygold_status === 'PAGADO' ||
                                      data.pagado === true ||
                                      (data.payment && data.payment.status === 'paid');

                    if (isCobrado) {
                        // Sincronizar en memoria local
                        if (typeof currentData !== 'undefined' && Array.isArray(currentData)) {
                            const idx = currentData.findIndex(r => r.id === resId || r.res_id === resId);
                            if (idx >= 0) {
                                currentData[idx] = { ...currentData[idx], ...data, id: resId };
                            }
                        }
                        if (window.state && Array.isArray(window.state.citas)) {
                            const cIdx = window.state.citas.findIndex(r => r.id === resId || r.res_id === resId);
                            if (cIdx >= 0) {
                                window.state.citas[cIdx] = { ...window.state.citas[cIdx], ...data, id: resId };
                            }
                        }

                        // Actualizar bloque de pago en UI si está abierto
                        const openResId = document.getElementById("form-id")?.value;
                        if (openResId === resId && typeof window.updatePaymentControlBlock === 'function') {
                            window.updatePaymentControlBlock();
                        }
                    }
                }, err => {
                    console.debug("[PayGold RealTime] Listener Firestore aviso:", err.message);
                });
            } catch (listenErr) {
                console.warn("[PayGold RealTime] Error vinculando listener:", listenErr);
            }
        },

        stopListening: function () {
            if (activeReservationUnsubscribe) {
                activeReservationUnsubscribe();
                activeReservationUnsubscribe = null;
                currentListeningResId = null;
            }
        },

        checkByOrderId: async function (orderId, resId, resObj) {
            if (!resId || !window.db) return null;
            const targetColl = (resObj && resObj.collection) || (window.currentModule && window.currentModule.collection) || 'reservas_spa';
            try {
                const docSnap = await window.db.collection(targetColl).doc(resId).get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (data.paygold_status === 'COBRADO' || data.paygold_status === 'PAGADO' || data.pagado) {
                        return { status: 'COBRADO', ...data };
                    }
                }
            } catch (_) {}
            return { status: 'PENDIENTE' };
        },

        checkReservation: async function (res) {
            if (!res) return null;
            const resId = res.id || res.res_id;
            const orderId = res.paygold_redsys_order || res.paygold_order;
            if (!resId) return null;
            return await this.checkByOrderId(orderId, resId, res);
        }
    };

    window.PayGoldAutoSync = PayGoldAutoSync;
    window.PayGoldRealTimeSync = PayGoldAutoSync;

    /**
     * Verificación manual bajo demanda con botón "Comprobar Pago Online"
     */
    window.verificarPagoPayGoldManual = async function () {
        const resId = document.getElementById("form-id")?.value || window.currentEditingId;
        if (!resId || resId === 'NUEVA') {
            if (typeof showToast === 'function') showToast("Primero selecciona o guarda la reserva", "info");
            return;
        }

        const btn = document.getElementById("btn-check-paygold-status");
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Comprobando...';
        }

        try {
            let res = (typeof currentData !== 'undefined' && Array.isArray(currentData))
                ? currentData.find(r => r.id === resId)
                : (window.state && Array.isArray(window.state.citas) ? window.state.citas.find(r => r.id === resId) : null);

            const redsysOrder = res?.paygold_redsys_order ||
                (window.PayGoldService ? window.PayGoldService.formatRedsysOrderId(res?.id || resId) : null);

            if (!redsysOrder) {
                if (typeof showToast === 'function') showToast("Esta reserva no tiene un pedido PayGold asociado aún.", "info");
                return;
            }

            const data = await PayGoldAutoSync.checkByOrderId(redsysOrder, resId, res);

            if (data && (data.status === 'COBRADO' || data.status === 'AUTORIZADO')) {
                // Ya se actualizó automáticamente en applyPayGoldPaymentSuccess
            } else if (data && data.status === 'PENDIENTE') {
                if (typeof showToast === 'function') {
                    showToast(`⏳ Pago aún pendiente en Redsys. En cuanto el cliente introduzca su tarjeta y acepte en su banco, el sistema lo registrará automáticamente.`, 'info');
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast(`Estado en Redsys: ${data?.status || 'Pendiente'}`, 'info');
                }
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast("Error al verificar: " + e.message, "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    };

    // Helper para formatear fechas en el selector de caducidad (+24h, +48h, etc.)
    window.setPayGoldExpiryDays = function (days) {
        const d = new Date(Date.now() + days * 86400000);
        const dateInput = document.getElementById('pg-modal-expiry-date');
        if (dateInput) {
            dateInput.value = d.toISOString().split('T')[0];
        }
    };

    // Helper para cambiar opción de importe (depósito, total, personalizado)
    window.onPayGoldAmountOptionChange = function (option) {
        const customBox = document.getElementById('pg-custom-amount-box');
        const customInput = document.getElementById('pg-modal-custom-amount');
        if (option === 'custom') {
            if (customBox) customBox.style.display = 'block';
            if (customInput) customInput.focus();
        } else {
            if (customBox) customBox.style.display = 'none';
        }
    };

    // Inyectar HTML del Modal PayGold en el body si no existe
    function injectPayGoldModal() {
        if (document.getElementById('paygold-spa-modal')) return;

        const modalHtml = `
        <div id="paygold-spa-modal" class="modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.75); z-index:999999; align-items:center; justify-content:center; backdrop-filter:blur(4px); padding:16px;">
            <div style="background:#fff; border-radius:18px; width:95%; max-width:820px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); position:relative; max-height:92vh; overflow-y:auto; border:1px solid #334155; font-family:inherit; padding:0;">
                
                <!-- Header Oscuro Premium estilo Nexus Groups -->
                <div style="background:#0f172a; padding:18px 24px; border-radius:16px 16px 0 0; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:42px; height:42px; border-radius:12px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); display:flex; align-items:center; justify-content:center; color:#f59e0b; font-size:1.3rem;">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:#fff; letter-spacing:-0.2px;">Generar Pasarela PayGold (Redsys)</h3>
                                <span style="background:#064e3b; color:#34d399; font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:12px; letter-spacing:0.5px;">CUMBRIA SPA & HOTEL</span>
                            </div>
                            <div style="font-size:0.75rem; color:#94a3b8; margin-top:3px;">Crea un enlace de pago bancario seguro y envíalo al cliente por WhatsApp, SMS o Email al instante.</div>
                        </div>
                    </div>
                    <button type="button" onclick="closePayGoldModalSpa()" style="background:none; border:none; font-size:1.6rem; color:#94a3b8; cursor:pointer; line-height:1; padding:4px 8px;" title="Cerrar">&times;</button>
                </div>

                <!-- Cuerpo del Modal -->
                <div style="padding:22px 24px;">

                    <!-- Info Card: Reserva & Nº Pedido -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                        <div>
                            <div style="font-size:0.65rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Reserva</div>
                            <div id="pg-modal-res-title" style="font-size:1rem; font-weight:800; color:#0f172a; margin-top:2px;">RS-XXXX · Cliente</div>
                            <div style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                                <span style="font-size:0.7rem; font-weight:700; color:#64748b;">Nº PEDIDO (LOCALIZADOR):</span>
                                <span id="pg-modal-order-tag" style="background:#fef3c7; color:#92400e; font-family:monospace; font-weight:800; padding:2px 8px; border-radius:6px; font-size:0.76rem; border:1px solid #fde68a;">SPA-XXXX</span>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.65rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Total / Pendiente</div>
                            <div id="pg-modal-total-display" style="font-size:1.35rem; font-weight:800; color:#047857; margin-top:1px;">0.00 €</div>
                            <div id="pg-modal-paid-display" style="font-size:0.72rem; color:#64748b;">Ya pagado: 0.00 €</div>
                        </div>
                    </div>

                    <!-- Layout 2 Columnas -->
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap:20px; margin-bottom:18px;">
                        
                        <!-- Columna Izquierda: Importe a Cobrar -->
                        <div>
                            <label style="display:block; font-size:0.75rem; font-weight:800; color:#334155; text-transform:uppercase; margin-bottom:8px; letter-spacing:0.4px;">Importe a cobrar</label>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                
                                <!-- Opción 1: Depósito -->
                                <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border:1px solid #cbd5e1; border-radius:10px; cursor:pointer; background:#fff; transition:all 0.15s ease;" id="pg-lbl-deposit">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <input type="radio" name="pg-amount-radio" value="deposit" onchange="onPayGoldAmountOptionChange('deposit')" style="accent-color:#f59e0b; width:16px; height:16px;">
                                        <div>
                                            <div style="font-weight:700; font-size:0.85rem; color:#1e293b;" id="pg-deposit-label">Primer Depósito (30%)</div>
                                            <div style="font-size:0.72rem; color:#64748b;" id="pg-deposit-desc">Garantía de reserva</div>
                                        </div>
                                    </div>
                                    <strong id="pg-deposit-val" style="font-size:0.95rem; color:#1e293b;">0.00 €</strong>
                                </label>

                                <!-- Opción 2: Saldo Pendiente Total -->
                                <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border:2px solid #f59e0b; border-radius:10px; cursor:pointer; background:#fffbeb; transition:all 0.15s ease;" id="pg-lbl-total">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <input type="radio" name="pg-amount-radio" value="total" checked onchange="onPayGoldAmountOptionChange('total')" style="accent-color:#f59e0b; width:16px; height:16px;">
                                        <div>
                                            <div style="font-weight:800; font-size:0.85rem; color:#92400e;" id="pg-total-label">Saldo Pendiente Total</div>
                                            <div style="font-size:0.72rem; color:#b45309;" id="pg-total-desc">Total restante por abonar</div>
                                        </div>
                                    </div>
                                    <strong id="pg-total-val" style="font-size:1.05rem; color:#047857;">0.00 €</strong>
                                </label>

                                <!-- Opción 3: Personalizado -->
                                <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border:1px solid #cbd5e1; border-radius:10px; cursor:pointer; background:#fff; transition:all 0.15s ease;" id="pg-lbl-custom">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <input type="radio" name="pg-amount-radio" value="custom" onchange="onPayGoldAmountOptionChange('custom')" style="accent-color:#f59e0b; width:16px; height:16px;">
                                        <div>
                                            <div style="font-weight:700; font-size:0.85rem; color:#1e293b;">Importe Personalizado</div>
                                            <div style="font-size:0.72rem; color:#64748b;">Introducir manualmente el importe a cobrar</div>
                                        </div>
                                    </div>
                                </label>

                                <!-- Caja input si selecciona personalizado -->
                                <div id="pg-custom-amount-box" style="display:none; padding:10px 14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px;">
                                    <div style="display:flex; align-items:center; background:#fff; border:2px solid #cbd5e1; border-radius:8px; padding:6px 12px;">
                                        <input type="number" id="pg-modal-custom-amount" step="0.01" style="flex:1; border:none; background:transparent; font-size:1.15rem; font-weight:800; color:#1e293b; outline:none;" placeholder="0.00">
                                        <span style="font-size:1.1rem; font-weight:800; color:#64748b; margin-left:6px;">€</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Columna Derecha: Caducidad y Envío Automático -->
                        <div style="display:flex; flex-direction:column; gap:16px;">
                            
                            <!-- Fecha Límite (Caducidad) -->
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <label style="font-size:0.75rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.4px;">Fecha límite del enlace</label>
                                    <span style="font-size:0.65rem; color:#94a3b8; font-weight:700;">HASTA LAS 23:59H</span>
                                </div>
                                <input type="date" id="pg-modal-expiry-date" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.88rem; font-weight:700; color:#1e293b; box-sizing:border-box; outline:none; margin-bottom:8px;">
                                
                                <!-- Botones rápidos de caducidad -->
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button type="button" class="btn btn-xs" onclick="setPayGoldExpiryDays(1)" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">+24 horas</button>
                                    <button type="button" class="btn btn-xs" onclick="setPayGoldExpiryDays(2)" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">+48 horas</button>
                                    <button type="button" class="btn btn-xs" onclick="setPayGoldExpiryDays(7)" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">+7 días</button>
                                    <button type="button" class="btn btn-xs" onclick="setPayGoldExpiryDays(15)" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">+15 días</button>
                                </div>
                            </div>

                            <!-- Envío Automático (Opcional) -->
                            <div>
                                <label style="display:block; font-size:0.75rem; font-weight:800; color:#334155; text-transform:uppercase; margin-bottom:8px; letter-spacing:0.4px;">Envío automático (Opcional)</label>
                                
                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    <label style="display:flex; align-items:center; gap:8px; font-size:0.78rem; color:#475569; cursor:pointer;">
                                        <input type="checkbox" id="pg-modal-send-sms" style="accent-color:#d97706; width:16px; height:16px;">
                                        <span>Enviar enlace por SMS mediante Redsys</span>
                                    </label>
                                    <input type="tel" id="pg-modal-mobile" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem; font-weight:600; color:#1e293b; box-sizing:border-box; outline:none;" placeholder="Móvil del cliente (ej. 600000000)">

                                    <label style="display:flex; align-items:center; gap:8px; font-size:0.78rem; color:#475569; cursor:pointer; margin-top:2px;">
                                        <input type="checkbox" id="pg-modal-send-email" style="accent-color:#d97706; width:16px; height:16px;">
                                        <span>Enviar enlace por Email mediante Redsys</span>
                                    </label>
                                    <input type="email" id="pg-modal-email" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem; font-weight:600; color:#1e293b; box-sizing:border-box; outline:none;" placeholder="Email del cliente (ej. cliente@email.com)">
                                </div>

                                <div style="font-size:0.72rem; color:#64748b; font-style:italic; margin-top:8px; line-height:1.4;">
                                    💡 Si no marcas SMS/Email, Redsys genera el enlace para copiar y compartir directamente por WhatsApp.
                                </div>
                            </div>

                        </div>
                    </div>

                    <!-- Mensajes de Error y Resultado -->
                    <div id="pg-modal-error" style="display:none; padding:10px 14px; border-radius:10px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:0.78rem; font-weight:600; margin-bottom:14px;"></div>

                    <div id="pg-modal-success" style="display:none; padding:16px; border-radius:12px; background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; font-size:0.78rem; margin-bottom:16px;">
                        <div style="font-weight:800; display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:0.9rem;">
                            <span>✅</span> Enlace generado con éxito en Redsys
                        </div>
                        <div style="background:#fff; border:1px solid #a7f3d0; border-radius:8px; padding:9px 12px; word-break:break-all; font-family:monospace; font-size:0.78rem; color:#047857; margin-bottom:12px;" id="pg-modal-link-text"></div>
                        
                        <div style="margin-bottom:12px;">
                            <span style="font-weight:700; font-size:0.74rem; color:#065f46; display:block; margin-bottom:4px;">Mensaje comercial listo para WhatsApp (con garantía 24h):</span>
                            <div id="pg-modal-msg-preview" style="background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; font-size:0.74rem; color:#334155; white-space:pre-wrap; max-height:150px; overflow-y:auto; line-height:1.45;"></div>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="btn" style="background:#047857; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer;" onclick="copyPayGoldResultSpa()" title="Copiar URL del enlace de pago">
                                🔗 Copiar Enlace
                            </button>
                            <button type="button" class="btn" style="background:#065f46; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer;" onclick="copyPayGoldMessageSpa()" title="Copiar texto comercial completo listo para enviar">
                                📋 Copiar Mensaje
                            </button>
                            <a id="pg-modal-wa-btn" href="#" target="_blank" class="btn" style="background:#25d366; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:0.78rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                                <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
                            </a>
                        </div>
                    </div>

                    <!-- Botonera Inferior -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:16px;">
                        <button type="button" onclick="closePayGoldModalSpa()" class="btn" style="background:transparent; border:1px solid #cbd5e1; color:#64748b; padding:10px 20px; border-radius:10px; font-size:0.85rem; font-weight:800; text-transform:uppercase; cursor:pointer;">
                            Cerrar
                        </button>
                        <button type="button" id="pg-modal-generate-btn" onclick="submitPayGoldSpa()" class="btn" style="background:#f59e0b; color:#fff; border:none; padding:10px 26px; border-radius:10px; font-size:0.88rem; font-weight:800; text-transform:uppercase; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 10px rgba(245,158,11,0.35);">
                            <i class="fas fa-bolt"></i> Generar Enlace Redsys
                        </button>
                    </div>

                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Inicializar botones y banners en el bloque de pago
    function setupPayGoldControls() {
        injectPayGoldModal();
        const pagoBlock = document.getElementById('pago-particular-block');
        if (!pagoBlock) return;

        // Inyectar botón en la botonera de pago si no está ya
        const btnContainer = pagoBlock.querySelector('#pp-status-badge')?.parentElement;
        if (btnContainer && !document.getElementById('btn-paygold-action')) {
            const btnHtml = `
            <button type="button" class="btn" id="btn-paygold-action"
                style="background: #f59e0b; color: white; border: none; padding: 6px 12px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
                onclick="openPayGoldModalSpa()" title="Generar enlace de pago seguro Redsys PayGold para esta reserva">
                <i class="fas fa-link"></i> 💳 Enlace PayGold
            </button>`;
            
            const btnReg = btnContainer.querySelector('button[onclick*="registrarPagoParticular"]');
            if (btnReg) {
                btnReg.insertAdjacentHTML('beforebegin', btnHtml);
            } else {
                btnContainer.insertAdjacentHTML('beforeend', btnHtml);
            }
        }

        // Inyectar banner de enlace activo si no existe
        if (!document.getElementById('pp-paygold-banner')) {
            const bannerHtml = `
            <div id="pp-paygold-banner" style="display:none; margin-top: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px; font-size: 0.75rem; color: #065f46;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color: #10b981; font-size: 1rem;">💳</span>
                        <span><b>Enlace Redsys PayGold Activo</b> (<span id="pp-paygold-order-display" style="font-family:monospace; font-weight:700;"></span>)</span>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-sm" style="background:#fff; border:1px solid #10b981; color:#047857; padding:4px 9px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="copyPayGoldLinkSpa()" title="Copiar URL del enlace de pago">🔗 Copiar Enlace</button>
                        <button type="button" class="btn btn-sm" style="background:#fff; border:1px solid #059669; color:#065f46; padding:4px 9px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="copyPayGoldMessageSpa()" title="Copiar texto comercial completo">📋 Copiar Mensaje</button>
                        <a id="pp-paygold-whatsapp-btn" href="#" target="_blank" class="btn btn-sm" style="background:#25d366; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="fab fa-whatsapp"></i> WhatsApp</a>
                    </div>
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #a7f3d0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:0.72rem;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-xs" id="btn-check-paygold-status" style="background:#2563eb; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" onclick="verificarPagoPayGoldManual()" title="Consultar en Redsys si el cliente ya completó el pago">
                            <i class="fas fa-sync-alt"></i> Comprobar Pago Online
                        </button>
                        <span id="paygold-sync-status-indicator" style="font-size:0.72rem; color:#047857; font-weight:600;">
                            <i class="fas fa-magic" style="color:#10b981;"></i> Auto-registro activo cada 15s
                        </span>
                    </div>
                    <button type="button" class="btn btn-xs" style="background:#047857; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" onclick="marcarPayGoldComoPagado()">
                        <i class="fas fa-check"></i> Marcar como Pagado
                    </button>
                </div>
            </div>`;
            pagoBlock.insertAdjacentHTML('beforeend', bannerHtml);
        }

        // Arrancar motor de auto-sync si no ha arrancado ya
        if (window.PayGoldAutoSync && typeof window.PayGoldAutoSync.start === 'function') {
            window.PayGoldAutoSync.start();
        }
    }

    // Funciones Globales
    window.openPayGoldModalSpa = async function () {
        injectPayGoldModal();

        let resId = document.getElementById("form-id")?.value || window.currentEditingId;
        if (!resId || resId === 'NUEVA') {
            const clientName = (document.getElementById("res-nombre")?.value || document.getElementById("res-client")?.value || '').trim();
            if (!clientName) {
                if (typeof showToast === 'function') showToast("Por favor, introduce el nombre del cliente para generar la pasarela", "warning");
                else alert("Por favor, introduce el nombre del cliente para generar la pasarela");
                const nInput = document.getElementById("res-nombre") || document.getElementById("res-client");
                if (nInput) nInput.focus();
                return;
            }

            // Auto-guardar la reserva para asignar ID/localizador y abrir PayGold inmediatamente
            window._openPayGoldAfterSave = true;
            if (typeof window.handleFormSubmit === 'function') {
                await window.handleFormSubmit();
                return;
            } else if (typeof window.submitBooking === 'function') {
                await window.submitBooking();
                return;
            } else {
                if (typeof showToast === 'function') showToast("Primero guarda la reserva para generar el enlace PayGold", "info");
                else alert("Primero guarda la reserva para generar el enlace PayGold");
                return;
            }
        }

        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;

        const total = parseFloat(document.getElementById("res-precio-total")?.value) 
            || parseFloat(document.getElementById("res-price-total")?.value) 
            || (res ? parseFloat(res.precio_total || res.precio || 0) : 0);
        const clientName = document.getElementById("res-nombre")?.value 
            || document.getElementById("res-client")?.value 
            || res?.nombre || 'Cliente';
        const tel = document.getElementById("res-tel")?.value 
            || document.getElementById("res-phone")?.value 
            || res?.tel || res?.telefono || '';
        const email = document.getElementById("res-email")?.value || res?.email || '';
        const loc = document.getElementById("res-id-display")?.textContent || res?.res_id || resId;
        const serviceName = document.getElementById("res-servicio")?.value 
            || document.getElementById("res-servicio-search")?.value 
            || res?.servicio 
            || (window.currentModule ? window.currentModule.name : 'Circuito Spa');

        // Extraer fecha y hora de forma robusta
        const dateVal = document.getElementById("form-date")?.value 
            || document.getElementById("res-date")?.value 
            || res?.fecha 
            || document.getElementById("main-date-picker")?.value 
            || '';

        const timeVal = document.getElementById("form-time")?.value 
            || document.getElementById("res-time")?.value 
            || res?.hora 
            || '';

        // Formatear Nº Pedido SPA-XXXX
        const cleanCode = String(loc).replace(/[^A-Za-z0-9]/g, '').replace(/^RS/i, '').toUpperCase() || loc;
        const spaOrderNumber = `SPA-${cleanCode}`;
        currentPayGoldOrderId = spaOrderNumber;

        let paid = 0;
        if (res) {
            if (res.pagado === true || res.estado_pago === 'pagado') paid = total;
            else paid = parseFloat(res.payment?.paid || res.paid_amount || res.pagado || 0) || 0;
        } else {
            paid = parseFloat(document.getElementById("res-price-paid")?.value || 0);
        }
        const pending = Math.max(0, total - paid);

        // Guardar fecha y hora en el dataset del modal para uso garantizado
        const modal = document.getElementById("paygold-spa-modal");
        if (modal) {
            modal.dataset.resId = resId;
            modal.dataset.dateVal = dateVal;
            modal.dataset.timeVal = timeVal;
            modal.dataset.clientName = clientName;
            modal.dataset.serviceName = serviceName;
            modal.dataset.orderNumber = spaOrderNumber;
        }

        // Actualizar Cabecera de la ficha en el modal
        const titleEl = document.getElementById("pg-modal-res-title");
        if (titleEl) titleEl.textContent = `${loc} · ${clientName}`;

        const orderTagEl = document.getElementById("pg-modal-order-tag");
        if (orderTagEl) orderTagEl.textContent = spaOrderNumber;

        const totalDisp = document.getElementById("pg-modal-total-display");
        if (totalDisp) totalDisp.textContent = `${(pending > 0 ? pending : total).toFixed(2)} €`;

        const paidDisp = document.getElementById("pg-modal-paid-display");
        if (paidDisp) paidDisp.textContent = `Ya pagado: ${paid.toFixed(2)} € (Total: ${total.toFixed(2)} €)`;

        // Configurar opciones de importe
        const depPercent = total >= 100 ? 30 : 50;
        const depAmount = Math.round((pending > 0 ? pending : total) * (depPercent / 100) * 100) / 100;

        const depLbl = document.getElementById("pg-deposit-label");
        if (depLbl) depLbl.textContent = `Primer Depósito (${depPercent}%)`;
        const depDesc = document.getElementById("pg-deposit-desc");
        if (depDesc) depDesc.textContent = `${depPercent}% de garantía: ${depAmount.toFixed(2)} €`;
        const depVal = document.getElementById("pg-deposit-val");
        if (depVal) depVal.textContent = `${depAmount.toFixed(2)} €`;

        const totalLbl = document.getElementById("pg-total-label");
        if (totalLbl) totalLbl.textContent = `Saldo Pendiente Total (${(pending > 0 ? pending : total).toFixed(2)} €)`;
        const totalVal = document.getElementById("pg-total-val");
        if (totalVal) totalVal.textContent = `${(pending > 0 ? pending : total).toFixed(2)} €`;

        // Preseleccionar opción 'total'
        const radioTotal = document.querySelector('input[name="pg-amount-radio"][value="total"]');
        if (radioTotal) radioTotal.checked = true;
        const customBox = document.getElementById('pg-custom-amount-box');
        if (customBox) customBox.style.display = 'none';

        const customInput = document.getElementById("pg-modal-custom-amount");
        if (customInput) customInput.value = (pending > 0 ? pending : total).toFixed(2);

        // Fecha de caducidad por defecto: +48 horas
        setPayGoldExpiryDays(2);

        // Móvil y Email
        const mobileInput = document.getElementById("pg-modal-mobile");
        if (mobileInput) mobileInput.value = tel.replace(/\s/g, '');
        const emailInput = document.getElementById("pg-modal-email");
        if (emailInput) emailInput.value = email;

        const sendSmsBox = document.getElementById("pg-modal-send-sms");
        if (sendSmsBox) sendSmsBox.checked = false;
        const sendEmailBox = document.getElementById("pg-modal-send-email");
        if (sendEmailBox) sendEmailBox.checked = false;

        document.getElementById("pg-modal-error").style.display = "none";
        document.getElementById("pg-modal-success").style.display = "none";

        if (modal) modal.style.display = "flex";
    };

    window.closePayGoldModalSpa = function () {
        const modal = document.getElementById("paygold-spa-modal");
        if (modal) modal.style.display = "none";
    };

    window.submitPayGoldSpa = async function () {
        const modal = document.getElementById("paygold-spa-modal");
        const resId = document.getElementById("form-id")?.value || modal?.dataset.resId || window.currentEditingId;
        const loc = document.getElementById("res-id-display")?.textContent || resId;
        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;

        const clientName = document.getElementById("res-nombre")?.value || modal?.dataset.clientName || res?.nombre || 'Cliente';
        const serviceName = document.getElementById("res-servicio")?.value || modal?.dataset.serviceName || res?.servicio || (window.currentModule ? window.currentModule.name : 'Circuito Spa');
        const pax = document.getElementById("res-pax")?.value || res?.pax || 1;

        // Recuperar fecha y hora garantizadas
        const dateVal = document.getElementById("form-date")?.value 
            || modal?.dataset.dateVal 
            || res?.fecha 
            || document.getElementById("main-date-picker")?.value 
            || '';

        const timeVal = document.getElementById("form-time")?.value 
            || modal?.dataset.timeVal 
            || res?.hora 
            || '';

        // Determinar importe según la opción seleccionada
        const selectedRadio = document.querySelector('input[name="pg-amount-radio"]:checked')?.value || 'total';
        const total = parseFloat(document.getElementById("res-precio-total")?.value) || (res ? parseFloat(res.precio_total || res.precio || 0) : 0);
        let paid = 0;
        if (res && res.payment) paid = res.payment.paid || 0;
        const pending = Math.max(0, total - paid);
        const basePending = pending > 0 ? pending : total;

        let amount = basePending;
        if (selectedRadio === 'deposit') {
            const depPercent = total >= 100 ? 30 : 50;
            amount = Math.round(basePending * (depPercent / 100) * 100) / 100;
        } else if (selectedRadio === 'custom') {
            amount = parseFloat(document.getElementById("pg-modal-custom-amount")?.value);
        }

        const mobile = (document.getElementById("pg-modal-mobile")?.value || '').replace(/\D/g, '');
        const email = (document.getElementById("pg-modal-email")?.value || '').trim();
        const sendSms = document.getElementById("pg-modal-send-sms")?.checked || false;
        const sendEmail = document.getElementById("pg-modal-send-email")?.checked || false;
        const expiryDate = document.getElementById("pg-modal-expiry-date")?.value || '';

        const errBox = document.getElementById("pg-modal-error");
        const succBox = document.getElementById("pg-modal-success");
        const genBtn = document.getElementById("pg-modal-generate-btn");

        errBox.style.display = "none";
        succBox.style.display = "none";

        if (isNaN(amount) || amount <= 0) {
            errBox.textContent = "Por favor, introduce un importe superior a 0,00 €.";
            errBox.style.display = "block";
            return;
        }

        if (!window.PayGoldService) {
            errBox.textContent = "Error: El servicio PayGoldService no está cargado.";
            errBox.style.display = "block";
            return;
        }

        // Formato oficial de pedido:
        // Visual: SPA-XXXX
        // Redsys: 0000SPAXXXX (4 números iniciales para cumplir norma Redsys)
        const cleanCode = String(loc).replace(/[^A-Za-z0-9]/g, '').replace(/^RS/i, '').toUpperCase() || loc;
        const spaOrderDisplay = `SPA-${cleanCode}`;
        const redsysOrderId = `0000SPA${cleanCode.slice(0, 5)}`;

        try {
            errBox.style.display = "none";
            errBox.textContent = "";
            succBox.style.display = "none";

            genBtn.disabled = true;
            genBtn.innerHTML = '<span class="fas fa-spinner fa-spin"></span> Contactando con Redsys...';

            const result = await window.PayGoldService.generateLink({
                app: "spa",
                hotel: "cumbria",
                amount: amount,
                groupId: loc || resId,
                referenceId: resId,
                orderId: redsysOrderId,
                concept: `Rva Spa ${spaOrderDisplay} - ${clientName}`.slice(0, 50),
                customerMobile: sendSms ? mobile : "",
                customerEmail: sendEmail ? email : "",
                customerName: clientName,
                expiryDate: expiryDate,
                depositLabel: serviceName
            });

            currentPayGoldUrl = result.paymentUrl;
            currentPayGoldOrderId = spaOrderDisplay;

            // Actualizar doc en Firestore si está disponible
            let targetColl = (window.currentModule && window.currentModule.collection) 
                ? window.currentModule.collection 
                : (window.currentEditingCollection || document.getElementById('res-room')?.value || 'reservas_spa');
            if (typeof db !== 'undefined' && db && resId) {
                try {
                    await db.collection(targetColl).doc(resId).update({
                        payment_link: result.paymentUrl,
                        paygold_order: spaOrderDisplay,
                        paygold_redsys_order: result.orderId || redsysOrderId,
                        paygold_amount: amount,
                        paygold_status: "PENDIENTE",
                        paygold_expiry: expiryDate,
                        paygold_created_at: new Date().toISOString()
                    });
                    // Actualizar memoria local si existe
                    if (typeof currentData !== 'undefined' && Array.isArray(currentData)) {
                        const localRes = currentData.find(r => r.id === resId);
                        if (localRes) {
                            localRes.payment_link = result.paymentUrl;
                            localRes.paygold_order = spaOrderDisplay;
                            localRes.paygold_redsys_order = result.orderId || redsysOrderId;
                            localRes.paygold_amount = amount;
                            localRes.paygold_status = "PENDIENTE";
                            localRes.paygold_expiry = expiryDate;
                        }
                    }
                } catch (dbErr) {
                    console.warn("[PayGold Spa] Error actualizando documento:", dbErr);
                }
            }

            // Mostrar resultado en modal
            document.getElementById("pg-modal-link-text").textContent = result.paymentUrl;

            const msg = buildPayGoldCommercialMessage({
                clientName,
                serviceName,
                dateVal,
                timeVal,
                amount,
                paymentUrl: result.paymentUrl,
                pax,
                orderNumber: spaOrderDisplay
            });

            const prevBox = document.getElementById("pg-modal-msg-preview");
            if (prevBox) prevBox.textContent = msg;

            const waBtn = document.getElementById("pg-modal-wa-btn");
            if (waBtn) {
                const targetPhone = mobile || (res?.tel || res?.telefono || document.getElementById("res-tel")?.value || "").replace(/\D/g, "");
                waBtn.href = `https://wa.me/34${targetPhone}?text=${encodeURIComponent(msg)}`;
            }

            succBox.style.display = "block";
            errBox.style.display = "none";
            if (typeof updatePaymentControlBlock === 'function') {
                try {
                    updatePaymentControlBlock();
                } catch (uiErr) {
                    console.warn("[PayGold] Error secundario actualizando bloque UI:", uiErr);
                }
            }
            if (typeof showToast === 'function') showToast("¡Enlace PayGold generado con éxito!", "success");

        } catch (err) {
            console.error("[PayGold] Error Redsys:", err);
            // Si el enlace ya fue generado con éxito, evitar que un fallo secundario oculte el éxito
            if (currentPayGoldUrl || (succBox && succBox.style.display === "block")) {
                console.warn("[PayGold] Error secundario tras generación exitosa:", err);
                errBox.style.display = "none";
            } else {
                errBox.textContent = "Error Redsys: " + (err.message || err);
                errBox.style.display = "block";
                if (succBox) succBox.style.display = "none";
            }
        } finally {
            genBtn.disabled = false;
            genBtn.innerHTML = '<i class="fas fa-bolt"></i> Generar Enlace Redsys';
        }
    };

    window.copyPayGoldResultSpa = function () {
        if (currentPayGoldUrl && navigator.clipboard) {
            navigator.clipboard.writeText(currentPayGoldUrl).then(() => {
                if (typeof showToast === 'function') showToast("Enlace de pago copiado al portapapeles", "success");
                else alert("Enlace copiado al portapapeles.");
            }).catch(() => {
                prompt("Copia el enlace de pago:", currentPayGoldUrl);
            });
        } else if (currentPayGoldUrl) {
            prompt("Copia el enlace de pago:", currentPayGoldUrl);
        }
    };

    window.copyPayGoldLinkSpa = function () {
        const resId = document.getElementById("form-id")?.value || window.currentEditingId;
        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;
        const link = res?.payment_link || res?.paygold_link || currentPayGoldUrl;
        if (link && navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => {
                if (typeof showToast === 'function') showToast("Enlace de pago copiado al portapapeles", "success");
                else alert("Enlace copiado");
            }).catch(() => {
                prompt("Copia el enlace de pago:", link);
            });
        } else if (link) {
            prompt("Copia el enlace de pago:", link);
        }
    };

    window.copyPayGoldMessageSpa = function () {
        const resId = document.getElementById("form-id")?.value || window.currentEditingId;
        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;
        const link = res?.payment_link || res?.paygold_link || currentPayGoldUrl;
        
        if (!link) {
            if (typeof showToast === 'function') showToast("Primero debes generar el enlace PayGold", "warning");
            else alert("Primero debes generar el enlace PayGold");
            return;
        }

        const total = parseFloat(document.getElementById("res-precio-total")?.value) || (res ? parseFloat(res.precio_total || res.precio || 0) : 0);
        let paid = 0;
        if (res && res.payment) paid = res.payment.paid || 0;
        const pending = Math.max(0, total - paid);
        const loc = document.getElementById("res-id-display")?.textContent || (res ? (res.res_id || res.id) : '');
        const cleanCode = String(loc).replace(/[^A-Za-z0-9]/g, '').replace(/^RS/i, '').toUpperCase() || loc;
        const spaOrderDisplay = res?.paygold_order || `SPA-${cleanCode}`;

        // Extraer fecha y hora
        const dateVal = document.getElementById("form-date")?.value 
            || res?.fecha 
            || document.getElementById("main-date-picker")?.value 
            || '';

        const timeVal = document.getElementById("form-time")?.value 
            || res?.hora 
            || '';

        const msg = buildPayGoldCommercialMessage({
            clientName: document.getElementById("res-nombre")?.value || res?.nombre || 'Cliente',
            serviceName: document.getElementById("res-servicio")?.value || res?.servicio || 'Circuito Spa',
            dateVal: dateVal,
            timeVal: timeVal,
            amount: pending > 0 ? pending : total,
            paymentUrl: link,
            pax: document.getElementById("res-pax")?.value || res?.pax || 1,
            orderNumber: spaOrderDisplay
        });

        if (navigator.clipboard) {
            navigator.clipboard.writeText(msg).then(() => {
                if (typeof showToast === 'function') showToast("Mensaje comercial copiado al portapapeles", "success");
                else alert("Mensaje comercial copiado al portapapeles");
            }).catch(() => {
                prompt("Copia el mensaje para el cliente:", msg);
            });
        } else {
            prompt("Copia el mensaje para el cliente:", msg);
        }
    };

    /**
     * Permite al usuario marcar una reserva con PayGold activo como pagada una vez verificado el cobro en Redsys.
     */
    window.marcarPayGoldComoPagado = function () {
        const resId = document.getElementById("form-id")?.value || window.currentEditingId;
        if (!resId || resId === 'NUEVA') {
            if (typeof showToast === 'function') showToast("Primero guarda o selecciona una reserva", "info");
            return;
        }

        const total = parseFloat(document.getElementById("res-precio-total")?.value) || 0;
        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;
        let paid = 0;
        if (res && res.payment) paid = res.payment.paid || 0;
        const pending = Math.max(0, total - paid);

        if (pending <= 0 && total > 0) {
            if (typeof showToast === 'function') showToast("Esta reserva ya está totalmente pagada", "success");
            return;
        }

        // Abrir modal de cobro local con método Tarjeta preseleccionado
        const lpAmount = document.getElementById("lp-amount");
        const lpPendingInfo = document.getElementById("lp-pending-info");
        const lpMethod = document.getElementById("lp-method");

        if (lpAmount) lpAmount.value = pending.toFixed(2);
        if (lpPendingInfo) lpPendingInfo.textContent = `Pendiente: ${pending.toFixed(2)}€ (Cobro Redsys PayGold)`;
        if (lpMethod) lpMethod.value = 'Tarjeta';
        if (typeof window.selectPaymentMethod === 'function') window.selectPaymentMethod('Tarjeta');

        const modal = document.getElementById("local-payment-modal");
        if (modal) {
            modal.style.display = "flex";
        } else if (typeof window.registrarPagoParticular === 'function') {
            window.registrarPagoParticular();
        }
    };

    // Enganchar en el ciclo de vida de la página
    document.addEventListener('DOMContentLoaded', () => {
        setupPayGoldControls();
        if (window.PayGoldAutoSync && typeof window.PayGoldAutoSync.start === 'function') {
            window.PayGoldAutoSync.start();
        }
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setupPayGoldControls();
        if (window.PayGoldAutoSync && typeof window.PayGoldAutoSync.start === 'function') {
            window.PayGoldAutoSync.start();
        }
    }

    // Interceptar o extender updatePaymentControlBlock para reflejar enlaces activos
    const origUpdate = window.updatePaymentControlBlock;
    window.updatePaymentControlBlock = function () {
        if (typeof origUpdate === 'function') origUpdate();

        setupPayGoldControls();

        const banner = document.getElementById("pp-paygold-banner");
        const btnPaygold = document.getElementById("btn-paygold-action");
        const resId = document.getElementById("form-id")?.value || window.currentEditingId;
        const res = (typeof currentData !== 'undefined' && Array.isArray(currentData) && resId) ? currentData.find(r => r.id === resId) : null;

        // Activar escucha en tiempo real reactiva sobre esta reserva
        if (resId && window.PayGoldAutoSync && typeof window.PayGoldAutoSync.listenActiveReservation === 'function') {
            const targetColl = (res && res.collection) || (window.currentModule && window.currentModule.collection) || 'reservas_spa';
            window.PayGoldAutoSync.listenActiveReservation(resId, targetColl);
        }

        const total = parseFloat(document.getElementById("res-precio-total")?.value) 
            || parseFloat(document.getElementById("res-price-total")?.value) 
            || (res ? parseFloat(res.precio_total || res.precio || 0) : 0);
        let paid = 0;
        if (res) {
            if (res.pagado === true || res.estado_pago === 'pagado') paid = total;
            else paid = parseFloat(res.payment?.paid || res.paid_amount || res.pagado || 0) || 0;
        } else {
            paid = parseFloat(document.getElementById("res-price-paid")?.value || 0);
        }
        const pending = Math.max(0, total - paid);

        if (banner) {
            const payUrl = res?.payment_link || res?.paygold_link || res?.Enlace_TPV || (res && res.id === resId ? currentPayGoldUrl : '');
            const isCobrado = res?.paygold_status === 'COBRADO' || (res?.payment && res.payment.history && res.payment.history.some(h => String(h.metodo || '').includes('PayGold')));

            if (isCobrado && (paid > 0 || res?.pagado)) {
                banner.style.display = "block";
                banner.style.background = "#ecfdf5";
                banner.style.borderColor = "#10b981";
                const authCode = res?.paygold_auth || (res?.payment?.history?.find(h => h.autorizacion)?.autorizacion) || '';
                const orderNumber = res?.paygold_order || '';

                banner.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.3rem;">✅</span>
                            <div>
                                <div style="font-weight:800; color:#065f46; font-size:0.85rem;">
                                    PAGO REDSYS RECIBIDO Y REGISTRADO AUTOMÁTICAMENTE
                                </div>
                                <div style="font-size:0.75rem; color:#047857; margin-top:2px;">
                                    Total abonado: <b>${paid.toFixed(2)} €</b> ${orderNumber ? `| Pedido: <b>${orderNumber}</b>` : ''} ${authCode ? `| Aut: <b style="font-family:monospace; background:#d1fae5; padding:1px 5px; border-radius:4px;">${authCode}</b>` : ''}
                                </div>
                            </div>
                        </div>
                        <span style="background:#047857; color:#fff; font-size:0.7rem; font-weight:800; padding:4px 10px; border-radius:6px; letter-spacing:0.5px;">
                            COBRADO ONLINE
                        </span>
                    </div>
                `;
            } else if (payUrl && pending > 0) {
                banner.style.display = "block";
                banner.style.background = "#ecfdf5";
                banner.style.borderColor = "#a7f3d0";

                const loc = document.getElementById("res-id-display")?.textContent || (res ? (res.res_id || res.id) : '');
                const cleanCode = String(loc).replace(/[^A-Za-z0-9]/g, '').replace(/^RS/i, '').toUpperCase() || loc;
                const orderDisp = document.getElementById("pp-paygold-order-display");
                if (orderDisp) orderDisp.textContent = res?.paygold_order || `SPA-${cleanCode}`;

                const waBtn = document.getElementById("pp-paygold-whatsapp-btn");
                if (waBtn) {
                    const cleanTel = (res?.tel || res?.telefono || document.getElementById("res-tel")?.value || "").replace(/\D/g, "");
                    const dateVal = document.getElementById("form-date")?.value || res?.fecha || document.getElementById("main-date-picker")?.value || '';
                    const timeVal = document.getElementById("form-time")?.value || res?.hora || '';

                    const msg = buildPayGoldCommercialMessage({
                        clientName: res?.nombre || document.getElementById("res-nombre")?.value || '',
                        serviceName: res?.servicio || document.getElementById("res-servicio")?.value || 'Circuito Spa',
                        dateVal: dateVal,
                        timeVal: timeVal,
                        amount: pending,
                        paymentUrl: payUrl,
                        pax: res?.pax || document.getElementById("res-pax")?.value || 1,
                        orderNumber: res?.paygold_order || `SPA-${cleanCode}`
                    });
                    waBtn.href = `https://wa.me/34${cleanTel}?text=${encodeURIComponent(msg)}`;
                }

                // Disparo de verificación automática silenciosa para esta reserva en segundo plano
                if (window.PayGoldAutoSync && typeof window.PayGoldAutoSync.checkReservation === 'function' && res) {
                    try {
                        window.PayGoldAutoSync.checkReservation(res).catch(() => {});
                    } catch (_) {}
                }
            } else {
                banner.style.display = "none";
            }
        }

        if (btnPaygold) {
            btnPaygold.style.display = (pending > 0) ? "inline-flex" : "none";
        }
    };
})();
