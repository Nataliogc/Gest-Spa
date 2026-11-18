(function (root) {
    const _voucherCache = new Map();

    function isMonedero(v) {
        return Boolean(v && (v.tipo_bono === 'monedero' || v.es_monedero === true));
    }

    function registerVoucher(bonoId, data) {
        const cleanId = String(bonoId || data?.bono || data?.id || '').trim();
        if (cleanId && data) {
            _voucherCache.set(cleanId, data);
        }
        if (typeof window !== 'undefined') {
            window._activeMonederoVoucher = isMonedero(data) ? { id: cleanId, ...data } : null;
            if (isMonedero(data)) {
                window._isMonederoBookingMode = true;
            }
        }
    }

    function clearActiveVoucher() {
        if (typeof window !== 'undefined') {
            window._activeMonederoVoucher = null;
            window._isMonederoBookingMode = false;
        }
    }

    function isActiveBookingMonedero() {
        if (typeof document === 'undefined') return false;
        const origen = document.getElementById('res-origen')?.value;
        if (origen !== 'bono') return false;
        const bonoId = (document.getElementById('res-bono')?.value || '').trim();
        if (typeof window !== 'undefined') {
            if (window._activeMonederoVoucher && (!bonoId || window._activeMonederoVoucher.bono === bonoId || window._activeMonederoVoucher.id === bonoId)) {
                return true;
            }
            if (bonoId && _voucherCache.has(bonoId)) {
                return isMonedero(_voucherCache.get(bonoId));
            }
            if (window._isMonederoBookingMode) return true;
            try {
                const urlMode = new URLSearchParams(window.location.search).get('mode');
                if (urlMode === 'monedero') return true;
            } catch (_) {}
        }
        return false;
    }

    function syncMonederoFormUI() {
        if (typeof document === 'undefined') return;
        const active = isActiveBookingMonedero();
        const sessionsGroup = document.getElementById('sessions-group');
        const bonoSaldoNotice = document.getElementById('bono-saldo-notice');
        const pricePaxInput = document.getElementById('res-precio-pax');
        const priceGroup = document.getElementById('price-group') || (pricePaxInput ? (pricePaxInput.closest('.form-group') || pricePaxInput.parentElement) : null);

        if (active) {
            if (sessionsGroup) sessionsGroup.style.display = 'none';
            if (bonoSaldoNotice) bonoSaldoNotice.style.display = 'none';
            if (priceGroup) {
                priceGroup.style.display = 'block';
                priceGroup.style.opacity = '1';
                priceGroup.style.pointerEvents = 'all';
            }
            if (pricePaxInput) {
                pricePaxInput.disabled = false;
            }
        }
    }

    function getSaldoDisponible(v) {
        if (!v) return 0;
        const total = parseFloat(v.saldo_total ?? v.importe ?? v.precio ?? 0) || 0;
        const consumido = parseFloat(v.saldo_consumido ?? 0) || 0;
        return Math.max(0, parseFloat(v.saldo_disponible ?? (total - consumido)) || 0);
    }

    async function fetchVoucher(db, bonoId) {
        if (!db || !bonoId) return null;
        const cleanId = String(bonoId).trim();
        let doc = await db.collection('spa_vouchers').doc(cleanId).get();
        if (!doc.exists) {
            const qs = await db.collection('spa_vouchers').where('bono', '==', cleanId).limit(1).get();
            if (!qs.empty) doc = qs.docs[0];
        }
        if (doc.exists) {
            const v = { id: doc.id, ...doc.data() };
            _voucherCache.set(cleanId, v);
            return v;
        }
        return null;
    }

    function renderReservationBalanceNotice(v, serviceTotal, noticeEl, existingRes = null) {
        if (!noticeEl || !isMonedero(v)) return;
        syncMonederoFormUI();
        let saldo = getSaldoDisponible(v);
        if (existingRes && existingRes.bono === (v.bono || v.id) && parseFloat(existingRes.monedero_descontado) > 0) {
            saldo += parseFloat(existingRes.monedero_descontado);
        }

        const total = Math.max(0, parseFloat(serviceTotal) || 0);
        const descontar = Math.min(saldo, total);
        const exceso = Math.max(0, total - saldo);
        const restante = Math.max(0, saldo - descontar);

        noticeEl.style.display = 'flex';
        if (saldo <= 0) {
            noticeEl.style.background = '#fff2f2';
            noticeEl.style.color = '#d32f2f';
            noticeEl.style.border = '1px solid #ffdada';
            noticeEl.innerHTML = `<i class="fas fa-wallet"></i> <span><b>MONEDERO AGOTADO (0.00 €).</b> Importe del servicio: <b>${total.toFixed(2)} €</b> (a abonar por el cliente).</span>`;
        } else if (total <= 0) {
            noticeEl.style.background = '#ecfdf5';
            noticeEl.style.color = '#065f46';
            noticeEl.style.border = '1px solid #86efac';
            noticeEl.innerHTML = `<i class="fas fa-wallet"></i> <span><b>MONEDERO (${saldo.toFixed(2)} € disponibles):</b> Selecciona el servicio para calcular el importe a descontar.</span>`;
        } else if (exceso > 0) {
            noticeEl.style.background = '#fffbeb';
            noticeEl.style.color = '#92400e';
            noticeEl.style.border = '1px solid #fcd34d';
            noticeEl.innerHTML = `<i class="fas fa-wallet"></i> <span><b>MONEDERO (${saldo.toFixed(2)} €):</b> Precio servicio: <b>${total.toFixed(2)} €</b> · Se descontarán <b>${descontar.toFixed(2)} €</b> (saldo restante: 0.00 €) · <b style="color:#dc2626;">A PAGAR DIFERENCIA: ${exceso.toFixed(2)} €</b></span>`;
        } else {
            noticeEl.style.background = '#ecfdf5';
            noticeEl.style.color = '#065f46';
            noticeEl.style.border = '1px solid #86efac';
            noticeEl.innerHTML = `<i class="fas fa-wallet"></i> <span><b>MONEDERO (${saldo.toFixed(2)} €):</b> Precio servicio: <b>${total.toFixed(2)} €</b> · Se descontarán <b>${descontar.toFixed(2)} €</b> · Saldo restante: <b>${restante.toFixed(2)} €</b>.</span>`;
        }
    }

    function refreshActiveNotice(currentData = null) {
        if (typeof document === 'undefined' || !isActiveBookingMonedero()) return;
        syncMonederoFormUI();
        const bonoId = (document.getElementById('res-bono')?.value || '').trim();
        const v = (typeof window !== 'undefined' && window._activeMonederoVoucher) || (bonoId ? _voucherCache.get(bonoId) : null);
        if (!v || !isMonedero(v)) return;
        const notice = document.getElementById('v-balance-notice');
        if (!notice) return;
        const resId = document.getElementById('form-id')?.value;
        const existingRes = (resId && Array.isArray(currentData)) ? currentData.find(r => r.id === resId) : null;
        const serviceTotal = parseFloat(document.getElementById('res-precio-total')?.value) || 0;
        renderReservationBalanceNotice(v, serviceTotal, notice, existingRes);
    }

    async function applyMonederoDeduction({ db, bonoId, serviceTotal, serviceName, reservationId, collection, existingRes }) {
        const v = await fetchVoucher(db, bonoId);
        if (!v || !isMonedero(v)) return null;

        let saldoActual = getSaldoDisponible(v);
        let consumidoActual = parseFloat(v.saldo_consumido ?? 0) || 0;

        // Si estamos editando una reserva que ya había descontado del monedero, revertimos primero su descuento previo
        const prevDescontado = (existingRes && existingRes.bono === (v.bono || v.id))
            ? (parseFloat(existingRes.monedero_descontado) || 0)
            : 0;
        if (prevDescontado > 0) {
            saldoActual += prevDescontado;
            consumidoActual = Math.max(0, consumidoActual - prevDescontado);
        }

        const total = Math.max(0, parseFloat(serviceTotal) || 0);
        const descontado = Math.min(saldoActual, total);
        const exceso = Math.max(0, total - descontado);
        const nuevoSaldo = Math.max(0, saldoActual - descontado);
        const nuevoConsumido = consumidoActual + descontado;
        const nowIso = new Date().toISOString();

        const movs = Array.isArray(v.movimientos_monedero) ? [...v.movimientos_monedero] : [];
        if (descontado > 0) {
            movs.push({
                id: 'mov_' + Math.random().toString(36).substr(2, 9),
                tipo: 'consumo_reserva',
                fecha: nowIso,
                concepto: serviceName || 'Reserva de servicio',
                importe_servicio: total,
                importe_descontado: descontado,
                exceso_a_pagar: exceso,
                saldo_resultante: nuevoSaldo,
                reserva_id: reservationId || null,
                coleccion: collection || null,
                usuario: (typeof window !== 'undefined' && window.currentUser?.name) ? window.currentUser.name : 'Recepción'
            });
        }

        const docId = v.id || bonoId;
        await db.collection('spa_vouchers').doc(docId).update({
            saldo_consumido: nuevoConsumido,
            saldo_disponible: nuevoSaldo,
            estado: nuevoSaldo <= 0 ? 'completed' : 'partially',
            movimientos_monedero: movs,
            last_updated: nowIso
        });

        _voucherCache.set(String(bonoId).trim(), {
            ...v,
            saldo_consumido: nuevoConsumido,
            saldo_disponible: nuevoSaldo,
            movimientos_monedero: movs
        });

        return { monederoDescontado: descontado, excesoAPagar: exceso, saldoRestante: nuevoSaldo };
    }

    async function refundMonederoDeduction({ db, bonoId, amount, serviceName, reservationId }) {
        const refund = parseFloat(amount) || 0;
        if (refund <= 0 || !bonoId) return;
        const v = await fetchVoucher(db, bonoId);
        if (!v || !isMonedero(v)) return;

        const saldoActual = getSaldoDisponible(v);
        const consumidoActual = parseFloat(v.saldo_consumido ?? 0) || 0;
        const nuevoSaldo = saldoActual + refund;
        const nuevoConsumido = Math.max(0, consumidoActual - refund);
        const nowIso = new Date().toISOString();

        const movs = Array.isArray(v.movimientos_monedero) ? [...v.movimientos_monedero] : [];
        movs.push({
            id: 'mov_' + Math.random().toString(36).substr(2, 9),
            tipo: 'devolucion_anulacion',
            fecha: nowIso,
            concepto: `Anulación: ${serviceName || 'Reserva'}`,
            importe_servicio: refund,
            importe_descontado: refund,
            exceso_a_pagar: 0,
            saldo_resultante: nuevoSaldo,
            reserva_id: reservationId || null,
            usuario: (typeof window !== 'undefined' && window.currentUser?.name) ? window.currentUser.name : 'Recepción'
        });

        await db.collection('spa_vouchers').doc(v.id || bonoId).update({
            saldo_consumido: nuevoConsumido,
            saldo_disponible: nuevoSaldo,
            estado: nuevoConsumido > 0 ? 'partially' : 'pending',
            movimientos_monedero: movs,
            last_updated: nowIso
        });
    }

    root.MonederoHelper = {
        isMonedero,
        registerVoucher,
        clearActiveVoucher,
        isActiveBookingMonedero,
        syncMonederoFormUI,
        refreshActiveNotice,
        getSaldoDisponible,
        fetchVoucher,
        renderReservationBalanceNotice,
        applyMonederoDeduction,
        refundMonederoDeduction
    };
})(typeof window !== 'undefined' ? window : globalThis);
