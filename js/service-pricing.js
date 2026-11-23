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
    function isNonBonoSingleCatalogService(c, m, normalizeFn) {
        if (!c || !m || c.active === false || c.deleted) return false;
        if (c.es_bono === true || c.tipo === 'bono') return false;
        const cat = String(c.categoria || c.category || '').toLowerCase();
        if (cat.includes('bono')) return false;
        const cNameNorm = normalizeFn(c.nombre || c.name || '');
        if (cNameNorm.startsWith('bono') || cNameNorm.includes('sesion') || cNameNorm.includes('sesiones')) return false;
        if ((parseInt(c.sesiones, 10) || 1) > 1) return false;
        if (c.pax === 'group') return false;
        if (!Array.isArray(c.items_incluidos) || c.items_incluidos.length !== 1) return false;
        if (Array.isArray(c.secuencia) && c.secuencia.length > 1) return false;

        const incName = c.items_incluidos[0];
        const mName = m.name || m.nombre || '';
        const catNorm = root.SpaServiceCatalog?.normalize;
        const sameName = (normalizeFn(incName) === normalizeFn(mName))
            || (typeof catNorm === 'function' && catNorm(incName) === catNorm(mName));
        if (!sameName) return false;

        const cPax = parseInt(c.pax, 10);
        const mPax = parseInt(m.pax_max ?? m.pax, 10);
        if (Number.isFinite(cPax) && cPax > 0 && Number.isFinite(mPax) && mPax > 0 && cPax !== mPax) {
            return false;
        }
        return true;
    }

    function findLinkedSingleCatalog(m, catalog = []) {
        if (!m || !Array.isArray(catalog) || catalog.length === 0) return null;
        const matches = catalog.filter(c => isNonBonoSingleCatalogService(c, m, normalize));
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        const positivePrices = new Set();
        matches.forEach(item => {
            const p = priceOf(item);
            if (p !== null && p > 0) positivePrices.add(p);
        });
        if (positivePrices.size > 1) return null;

        const tsOf = item => {
            const parsed = Date.parse(item.price_updated_at || item.last_updated || item.updated_at || '');
            return Number.isFinite(parsed) ? parsed : 0;
        };
        const sorted = [...matches].sort((a, b) => {
            const ap = (priceOf(a) || 0) > 0 ? 1 : 0;
            const bp = (priceOf(b) || 0) > 0 ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return tsOf(b) - tsOf(a);
        });
        return sorted[0];
    }

    function resolveServicePricing(name, master = [], catalog = []) {
        if (!name) return null;
        const key = normalize(name);
        const match = item => item.active !== false && !item.deleted && normalize(item.name || item.nombre) === key;
        const m = root.SpaServiceCatalog?.resolve(name, master, catalog) || master.find(match), c = catalog.find(match);

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
        const linkedC = (m && !packInfo) ? findLinkedSingleCatalog(m, catalog) : null;
        const lcp = priceOf(linkedC);

        let amount;
        let priceSource;
        if (linkedC && lcp !== null && lcp > 0) {
            const mPriceTime = Date.parse(m.price_updated_at || '');
            const cPriceTime = Date.parse(linkedC.price_updated_at || linkedC.last_updated || linkedC.updated_at || '');
            if (Number.isFinite(mPriceTime) && (!Number.isFinite(cPriceTime) || mPriceTime > cPriceTime) && mp !== null && mp > 0) {
                amount = mp;
                priceSource = 'master';
            } else {
                amount = lcp;
                priceSource = 'catalog_linked';
            }
        } else {
            amount = mp > 0 ? mp : cp > 0 ? cp : mp ?? cp;
            priceSource = mp > 0 ? 'master' : cp > 0 ? 'catalog' : (packInfo?.precio > 0 ? 'pack_registry' : 'unpriced');
        }

        // Si el precio resuelto es 0 o null y es un pack reconocido, usar tarifa del registro
        if ((!amount || amount <= 0) && packInfo && packInfo.precio > 0) {
            amount = packInfo.precio;
            priceSource = 'pack_registry';
        }

        const merged = { ...(c || {}), ...(m || {}), resolvedPrice: amount, priceSource };

        // Both field names must agree: legacy catalog pax must not override
        // the capacity configured on the master item.
        if (m && !packInfo) {
            const masterPax = parseInt(m.pax_max ?? m.pax, 10);
            if (masterPax > 0) merged.pax = merged.pax_max = masterPax;
            merged.isPack = false;
        }

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

    function reconcileEditBasePricePax({
        savedTotal,
        savedPax,
        rawPricePax,
        extrasTotal = 0,
        spaAddonTotal = 0,
        descTipo = 'porcentaje',
        descValor = 0
    } = {}) {
        const pax = Math.max(1, parseInt(savedPax, 10) || 1);
        let total = Number(savedTotal);
        if (!Number.isFinite(total) || total < 0) total = 0;
        const extras = Number.isFinite(Number(extrasTotal)) ? Number(extrasTotal) : 0;
        const spa = Number.isFinite(Number(spaAddonTotal)) ? Number(spaAddonTotal) : 0;
        const dVal = Number.isFinite(Number(descValor)) ? Number(descValor) : 0;

        const calcTotal = (pp) => {
            const sub = (pax * pp) + extras + spa;
            let imp = 0;
            if (dVal > 0 && sub > 0) {
                imp = (descTipo === 'porcentaje')
                    ? Math.min(sub, (sub * dVal) / 100)
                    : Math.min(sub, dVal);
            }
            return Math.max(0, sub - imp);
        };

        const hasRaw = rawPricePax !== null && rawPricePax !== undefined && String(rawPricePax).trim() !== ''
            && Number.isFinite(Number(rawPricePax)) && Number(rawPricePax) >= 0;
        if (hasRaw) {
            const raw = Number(rawPricePax);
            if (Math.abs(calcTotal(raw) - total) <= 0.05) {
                return raw;
            }
            if (dVal > 0 && descTipo === 'porcentaje' && dVal >= 100 && total <= 0.05) {
                return raw;
            }
        }

        if (total <= 0) return 0;

        let targetSubtotal = total;
        if (dVal > 0 && descTipo === 'porcentaje' && dVal < 100) {
            targetSubtotal = total / (1 - dVal / 100);
        } else if (dVal > 0 && descTipo !== 'porcentaje') {
            targetSubtotal = total + dVal;
        }

        const baseServiceTotal = Math.max(0, targetSubtotal - extras - spa);
        return parseFloat((baseServiceTotal / pax).toFixed(2));
    }

    root.resolveServicePricing = resolveServicePricing;
    root.reconcileEditBasePricePax = reconcileEditBasePricePax;
    if (typeof module !== 'undefined') module.exports = { resolveServicePricing, reconcileEditBasePricePax };
})(typeof window !== 'undefined' ? window : globalThis);
