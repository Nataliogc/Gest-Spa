(function (root) {
    function applyVoucherBookingContext(params, doc) {
        const voucher = params.get('voucher');
        if (!voucher) return null; // Una reserva directa nunca hereda un bono residual.
        const service = params.get('service') || '';
        const pax = Math.max(1, parseInt(params.get('pax'), 10) || 1);
        const set = (id, value) => { const field = doc.getElementById(id); if (field) field.value = value; };
        set('res-origen', 'bono');
        set('res-bono', voucher);
        set('res-nombre', params.get('client') || '');
        set('res-pax', pax);
        set('res-sesiones', 1);
        const select = doc.getElementById('res-servicio');
        if (service && select) {
            if (!Array.from(select.options).some(option => option.value === service)) {
                const option = doc.createElement('option');
                option.value = service;
                option.textContent = service;
                select.appendChild(option);
            }
            select.value = service;
            set('res-servicio-search', service);
        }
        const notice = doc.getElementById('bono-saldo-notice');
        if (notice) {
            notice.textContent = `Bono: ${voucher} · Cliente: ${params.get('client') || ''} · Servicio: ${service} · ${pax} personas`;
            notice.style.display = 'block';
        }
        return { voucher, service, pax };
    }
    root.applyVoucherBookingContext = applyVoucherBookingContext;
    if (typeof module !== 'undefined') module.exports = { applyVoucherBookingContext };
})(typeof window !== 'undefined' ? window : globalThis);
