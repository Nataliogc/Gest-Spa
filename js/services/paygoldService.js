/**
 * ═════════════════════════════════════════════════════════════════════════════
 * NEXUS GROUPS — SERVICIO CLIENTE DE PAYGOLD REDSYS (MULTI-APP)
 * ═════════════════════════════════════════════════════════════════════════════
 * Compatible con:
 * - Nexus Groups
 * - MesaChef
 * - Spa
 */

(function (root) {
    "use strict";

    const CLOUD_FUNCTION_URL = "https://createpaygold-nls6pa6unq-uc.a.run.app";

    const PayGoldService = {
        /**
         * Detecta la clave del hotel ('cumbria' o 'guadiana')
         */
        getHotelKey: function (hotelRaw) {
            if (!hotelRaw) return 'cumbria';
            const s = String(hotelRaw).toLowerCase();
            if (s.includes('guad')) return 'guadiana';
            return 'cumbria';
        },

        /**
         * Indica si el hotel tiene PayGold activo en el sistema
         */
        isHotelReady: function (hotelKey) {
            const k = this.getHotelKey(hotelKey);
            return k === 'cumbria'; // Cumbria 100% activo; Guadiana pendiente de banco
        },

        /**
         * Formatea el código de pedido visual/localizador:
         * Para Spa: "SPA-XXXX" (ej. "SPA-WJZO")
         * Para Grupos: "XXXXXGRUPO"
         */
        formatOrderNumber: function (reservaId, app) {
            if (!reservaId) return "";
            const clean = String(reservaId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const appTag = String(app || 'spa').toLowerCase();

            if (appTag.includes('spa')) {
                const code = clean.replace(/^RS/, '') || clean;
                return `SPA-${code}`;
            }

            const matchDigits = clean.match(/^\d+/);
            let digits = matchDigits ? matchDigits[0] : "";
            let rest = clean.substring(digits.length);
            if (digits.length < 4) {
                digits = digits.padStart(4, '0');
            }
            let tag = '';
            if (appTag.includes('grupo')) {
                if (!rest.includes('GRUPO') && !digits.includes('GRUPO')) tag = 'GRUPO';
            } else if (appTag.includes('mesa') || appTag.includes('evento')) {
                if (!rest.includes('EVENTO') && !rest.includes('MESA')) tag = 'EVENTO';
            }
            let combined = digits + rest + tag;
            if (combined.length > 12) {
                const maxTail = 12 - digits.length;
                if (maxTail > 0) {
                    combined = digits + (rest + tag).slice(0, maxTail);
                } else {
                    combined = digits.slice(0, 12);
                }
            }
            return combined;
        },

        /**
         * Formatea el código de pedido estricto para Redsys (DS_MERCHANT_ORDER):
         * Los primeros 4 caracteres DEBEN ser numéricos (0-9) y máx 12 caracteres.
         * Para Spa: "0000SPA" + código (ej. "0000SPAWJZO")
         */
        formatRedsysOrderId: function (reservaId, app) {
            if (!reservaId) return "";
            const clean = String(reservaId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const appTag = String(app || 'spa').toLowerCase();

            if (appTag.includes('spa')) {
                const code = (clean.replace(/^RS/, '') || clean).slice(0, 5);
                return `0000SPA${code}`;
            }
            return this.formatOrderNumber(reservaId, app);
        },

        /**
         * Calcula las opciones sugeridas de pago para una reserva de Spa:
         * - Depósito de garantía (30% o 50%)
         * - Saldo total pendiente
         * - Importe personalizado
         */
        getSuggestedAmounts: function (record) {
            if (!record) return [];

            const total = parseFloat(record.precio_total || record.precio || record["Importe(*)"] || 0);
            let paid = 0;
            if (record.pagado === true || record.estado_pago === 'pagado') {
                paid = total;
            } else {
                paid = parseFloat(record.payment?.paid || record.paid_amount || record.pagado || record.Com_Pagado || 0) || 0;
            }
            const pendingTotal = Math.max(0, total - paid);

            const options = [];

            // Opción 1: Depósito de garantía (30% si > 60€, o 50%)
            const depPercent = total >= 100 ? 30 : 50;
            const depAmount = Math.round(pendingTotal * (depPercent / 100) * 100) / 100;

            if (depAmount > 0 && depAmount < pendingTotal) {
                options.push({
                    id: "deposit",
                    label: `Primer Depósito (${depPercent}%)`,
                    amount: depAmount,
                    description: `${depPercent}% de garantía: ${depAmount.toFixed(2)} €`
                });
            }

            // Opción 2: Saldo total pendiente
            if (pendingTotal > 0) {
                options.push({
                    id: "pending",
                    label: `Saldo Pendiente Total (${pendingTotal.toFixed(2)} €)`,
                    amount: pendingTotal,
                    description: `Total restante por abonar: ${pendingTotal.toFixed(2)} €`
                });
            } else {
                options.push({
                    id: "pending",
                    label: `Total Reserva (${total.toFixed(2)} €)`,
                    amount: total,
                    description: `Importe completo: ${total.toFixed(2)} €`
                });
            }

            // Opción 3: Personalizado
            options.push({
                id: "custom",
                label: "Importe Personalizado",
                amount: 0,
                description: "Introducir manualmente el importe a cobrar"
            });

            return options;
        },

        /**
         * Solicita a la Cloud Function la generación del enlace PayGold
         * Válido para Nexus Groups, MesaChef o Spa
         */
        generateLink: async function (params) {
            const hotelKey = this.getHotelKey(params.hotel || params.Hotel_Asignado);
            const amount = parseFloat(params.amount);

            if (isNaN(amount) || amount <= 0) {
                throw new Error("El importe a cobrar debe ser superior a 0,00 €.");
            }

            if (hotelKey === 'guadiana' && !this.isHotelReady('guadiana')) {
                throw new Error("Sercotel Guadiana está pendiente de activación de PayGold por parte de Eurocaja Rural. Hotel Cumbria sí está 100% operativo.");
            }

            const refId = String(params.referenceId || params.groupId || params.reservaId || "").trim();
            const redsysOrder = params.orderId || this.formatRedsysOrderId(refId, params.app || "spa");

            const cleanConcept = String(params.concept || `Rva Spa ${refId} - ${params.customerName || ''}`)
                .replace(/%/g, ' pct')
                .replace(/[<>"'\\]/g, '')
                .trim();
            const cleanDepositLabel = String(params.depositLabel || "")
                .replace(/%/g, ' pct')
                .replace(/[<>"'\\]/g, '')
                .trim();

            const bodyPayload = {
                app: params.app || "spa", // 'grupos', 'mesachef', 'spa'
                hotel: hotelKey,
                amountEuros: amount,
                groupId: refId,
                referenceId: refId,
                orderId: redsysOrder,
                orderSuffix: params.orderSuffix || "",
                concept: cleanConcept,
                customerEmail: params.customerEmail || "",
                customerMobile: params.customerMobile || "",
                customerName: params.customerName || "",
                expiryDate: params.expiryDate || "",
                depositLabel: cleanDepositLabel
            };

            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(bodyPayload)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || `Error Redsys ${data.errorCode || 'desconocido'}`);
            }

            return {
                paymentUrl: data.paymentUrl,
                orderId: data.orderId || redsysOrder,
                amountEuros: data.amountEuros,
                expiresAt: data.expiresAt,
                app: data.app || bodyPayload.app
            };
        }
    };

    root.PayGoldService = PayGoldService;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = PayGoldService;
    }
})(typeof window !== "undefined" ? window : globalThis);
