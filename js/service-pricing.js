(function (root) {
    function normalize(name) {
        return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/^pack\s*-\s*/, '').replace(/[’′]/g, "'")
            .replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
    }
    function priceOf(item) {
        if (!item) return null;
        const values = ['price_pax', 'precio', 'price'].map(key => {
            const raw = item[key];
            if (raw === null || raw === undefined || String(raw).trim() === '') return null;
            const value = Number(String(raw).trim().replace(',', '.'));
            return Number.isFinite(value) && value >= 0 ? value : null;
        });
        return values.find(value => value !== null && value > 0) ?? values.find(value => value !== null) ?? null;
    }
    function resolveServicePricing(name, master = [], catalog = []) {
        if (!name) return null;
        const key = normalize(name);
        const match = item => item.active !== false && !item.deleted && normalize(item.name || item.nombre) === key;
        const m = master.find(match), c = catalog.find(match);
        if (!m && !c) return null;
        const mp = priceOf(m), cp = priceOf(c);
        // Los maestros creados sin tarifa llevan 0: recuperar el PVP del mismo servicio.
        const amount = mp > 0 ? mp : cp > 0 ? cp : mp ?? cp;
        return { ...(c || {}), ...(m || {}), resolvedPrice: amount,
            priceSource: mp > 0 ? 'master' : cp > 0 ? 'catalog' : 'unpriced' };
    }
    root.resolveServicePricing = resolveServicePricing;
    if (typeof module !== 'undefined') module.exports = { resolveServicePricing };
})(typeof window !== 'undefined' ? window : globalThis);
