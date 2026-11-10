(function (root) {
    function normalize(name) {
        return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/^pack\s*[-–—:]\s*/i, '').replace(/[’′]/g, "'")
            .replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
    }
    function priceOf(item) {
        if (!item) return null;
        const values = [
            'precio', 'precio_total', 'price', 'pvp', 'importe',
            'regular_price', 'sale_price', 'price_pax', 'tarifa',
            'precio_tarifa', 'precio_final', 'price_total', 'total'
        ].map(key => {
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

        // Consultar registro unificado de packs si existe
        const packInfo = (typeof root.getPackFullData === 'function')
            ? root.getPackFullData(name, catalog, master)
            : null;

        if (!m && !c) {
            if (packInfo && packInfo.precio > 0) {
                return {
                    nombre: packInfo.nombre,
                    pax: packInfo.pax,
                    categoria: packInfo.categoria,
                    secuencia: packInfo.secuencia,
                    isPack: true,
                    packData: packInfo,
                    resolvedPrice: packInfo.precio,
                    priceSource: 'pack_registry'
                };
            }
            return null;
        }

        const mp = priceOf(m), cp = priceOf(c);
        let amount = mp > 0 ? mp : cp > 0 ? cp : mp ?? cp;

        // Si el precio resuelto es 0 o null y es un pack reconocido, usar tarifa del registro
        if ((!amount || amount <= 0) && packInfo && packInfo.precio > 0) {
            amount = packInfo.precio;
        }

        const merged = { ...(c || {}), ...(m || {}), resolvedPrice: amount,
            priceSource: mp > 0 ? 'master' : cp > 0 ? 'catalog' : (packInfo?.precio > 0 ? 'pack_registry' : 'unpriced') };

        if (packInfo) {
            merged.isPack = true;
            merged.packData = packInfo;
            if (!merged.pax || merged.pax <= 1) merged.pax = packInfo.pax || 2;
            if (!merged.secuencia || !Array.isArray(merged.secuencia) || merged.secuencia.length === 0) {
                merged.secuencia = packInfo.secuencia;
            }
            if (!merged.resolvedPrice || merged.resolvedPrice <= 0) {
                merged.resolvedPrice = packInfo.precio;
            }
        }

        return merged;
    }
    root.resolveServicePricing = resolveServicePricing;
    if (typeof module !== 'undefined') module.exports = { resolveServicePricing };
})(typeof window !== 'undefined' ? window : globalThis);
