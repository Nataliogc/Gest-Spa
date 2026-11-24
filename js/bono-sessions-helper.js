(function (root) {
    const COMPLEMENT_KEYWORDS_RE = /(botella|cava|vino|champagne|champán|ramo|flores|fruta|bombones|chocolate|detalle|benjamín|benjamin|regalo|extra|accesorio|toalla|albornoz|amenities|spa kit)/i;

    function normalizeText(str) {
        return String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function normalizeOptionalId(val) {
        if (val === null || val === undefined) return null;
        const s = String(val).trim();
        if (!s || s === '0') return null;
        return s;
    }

    function isComplementVoucherItem(item) {
        if (!item || typeof item !== 'object') return false;
        if (item.tipo === 'complemento' || item.reservable === false) return true;
        if (item.codigo && String(item.codigo).trim().toLowerCase().startsWith('ext.')) return true;
        const rawSpace = Array.isArray(item.space) ? item.space[0] : (item.space || item.espacio || '');
        const spaceLower = typeof rawSpace === 'string' ? rawSpace.trim().toLowerCase() : '';
        if (spaceLower === 'complemento' || spaceLower === 'extra') return true;
        const name = String(item.name || item.nombre || item.producto || '');
        return COMPLEMENT_KEYWORDS_RE.test(name);
    }

    function getReservationConsumedSessions(res, docId = '') {
        const cleanDocId = String(docId || (res && res.id) || '').trim();
        if (!res || typeof res !== 'object') {
            return cleanDocId.endsWith('_spa_addon') ? 0 : 1;
        }
        const raw = res.sesiones_consumidas;
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
            const parsed = parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        }
        if (
            cleanDocId.endsWith('_spa_addon') ||
            (res.is_pack_child && !res.is_primary_pack) ||
            (res.is_pack_element && !res.is_primary_pack)
        ) {
            return 0;
        }
        return 1;
    }

    function findCatalogMatchForSessionDetection(voucher, catalogProducts = []) {
        if (!voucher || !Array.isArray(catalogProducts) || catalogProducts.length === 0) return null;

        const vId = normalizeOptionalId(voucher.variation_id);
        const pId = normalizeOptionalId(voucher.product_id);

        if (vId) {
            const vMatch = catalogProducts.find(p => {
                if (!p) return false;
                const pVar = normalizeOptionalId(p.variation_id);
                const pWc = normalizeOptionalId(p.wc_id);
                const pIdStr = String(p.id || '').trim();
                return (pVar && pVar === vId) || (pWc && pWc === vId) || pIdStr === `wc-${vId}`;
            });
            if (vMatch) return vMatch;
        } else if (pId) {
            const pMatch = catalogProducts.find(p => {
                if (!p) return false;
                const pWc = normalizeOptionalId(p.wc_id);
                const pProd = normalizeOptionalId(p.product_id);
                const pIdStr = String(p.id || '').trim();
                return (pWc && pWc === pId) || (pProd && pProd === pId) || pIdStr === `wc-${pId}`;
            });
            if (pMatch) return pMatch;
        }

        const lower = normalizeText(voucher.producto || voucher.nombre || voucher.name || '');
        if (!lower) return null;

        const exact = catalogProducts.find(p => p && normalizeText(p.nombre || p.name) === lower);
        if (exact) return exact;

        const textMentionsMulti = /(bono|sesiones|b5|b10|\d+\s*\+\s*\d+|\d+\s*x\s+)/i.test(lower);
        const candidates = catalogProducts.filter(p => {
            if (!p) return false;
            const pName = normalizeText(p.nombre || p.name);
            if (pName.length < 3) return false;
            const pSessions = parseInt(p.sesiones, 10) || 1;
            if (!textMentionsMulti && (pSessions > 1 || pName.includes('bono'))) {
                return false;
            }
            return lower.includes(pName);
        });

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => normalizeText(b.nombre || b.name).length - normalizeText(a.nombre || a.name).length);
        return candidates[0];
    }

    function calculateItemSessions({ name = '', catalogMatch = null, apiSessions = null, quantity = 1, detectedTextSessions = 1 } = {}) {
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const lower = normalizeText(name);
        const isExplicitSingleSession = /sesi[oó]n\s+de\s+\d+/i.test(lower)
            && !/(bono|pack|sesiones|\d+\s*\+\s*\d+|\d+\s*x\s+)/i.test(lower);

        let perUnit = 1;
        const parsedApi = parseInt(apiSessions, 10);
        const parsedText = parseInt(detectedTextSessions, 10) || 1;

        if (isExplicitSingleSession) {
            perUnit = 1;
        } else if (Number.isFinite(parsedApi) && parsedApi > 1) {
            perUnit = parsedApi;
        } else {
            const catSes = catalogMatch ? (parseInt(catalogMatch.sesiones, 10) || 1) : 1;
            perUnit = (catSes === 1 && parsedText > 1) ? parsedText : catSes;
        }

        return Math.max(1, perUnit) * qty;
    }

    function sumReservableItemSessions(items = []) {
        if (!Array.isArray(items) || items.length === 0) return 0;
        const reservable = items.filter(it => !isComplementVoucherItem(it));
        const list = reservable.length > 0 ? reservable : items;
        return list.reduce((sum, it) => {
            const ses = Math.max(1, parseInt(it?.sessions ?? it?.sesiones ?? it?.total, 10) || 1);
            return sum + ses;
        }, 0);
    }

    function redistributeSessionsAcrossItems(items = [], targetTotal = 1) {
        if (!Array.isArray(items) || items.length === 0) return [];
        const cloned = items.map(it => ({ ...it }));
        const targetIndices = [];
        cloned.forEach((it, idx) => {
            if (!isComplementVoucherItem(it)) targetIndices.push(idx);
        });

        if (targetIndices.length === 0) return cloned;

        const target = Math.max(1, parseInt(targetTotal, 10) || 1);
        const currentSum = targetIndices.reduce((sum, idx) => {
            return sum + Math.max(1, parseInt(cloned[idx].sessions ?? cloned[idx].sesiones ?? cloned[idx].total, 10) || 1);
        }, 0);

        if (currentSum === target) return cloned;

        const count = targetIndices.length;
        if (count === 1) {
            const idx = targetIndices[0];
            cloned[idx].sessions = target;
            if (cloned[idx].sesiones !== undefined) cloned[idx].sesiones = target;
            return cloned;
        }

        let remaining = target;
        targetIndices.forEach((itemIdx, pos) => {
            const slotsLeft = count - pos;
            const rawShare = Math.floor(remaining / slotsLeft);
            const share = target >= count ? Math.max(1, rawShare) : Math.max(0, rawShare);
            cloned[itemIdx].sessions = share;
            if (cloned[itemIdx].sesiones !== undefined) cloned[itemIdx].sesiones = share;
            remaining -= share;
        });

        return cloned;
    }

    function dedupeChildReservationsForItem(reservations = []) {
        if (!Array.isArray(reservations) || reservations.length === 0) return [];
        const presentIds = new Set();
        reservations.forEach(r => {
            if (!r) return;
            if (r.id) presentIds.add(String(r.id).trim());
            if (r.res_id) presentIds.add(String(r.res_id).trim());
        });

        return reservations.filter(r => {
            if (!r) return false;
            const docId = String(r.id || '').trim();
            const isChild = Boolean(r.is_pack_child)
                || docId.endsWith('_spa_addon')
                || getReservationConsumedSessions(r, docId) === 0;
            if (!isChild) return true;
            const parentId = String(r.parent_id || '').trim();
            if (parentId && presentIds.has(parentId)) {
                return false;
            }
            return true;
        });
    }

    function isMultiItemCartVoucher(voucher) {
        if (!voucher || !Array.isArray(voucher.items_desglosados)) return false;
        const reservable = voucher.items_desglosados.filter(it => !isComplementVoucherItem(it));
        if (reservable.length < 2) return false;
        return !reservable.some(it => Boolean(it && it.parent_pack));
    }

    function computeVoucherDeltaOnEdit({
        isNewReservation = true,
        prevRes = null,
        prevDocId = '',
        newOrigen = '',
        newBono = '',
        newConsumed = 1
    } = {}) {
        const cleanNewBono = newOrigen === 'bono' ? String(newBono || '').trim() : '';
        const parsedNewConsumed = parseInt(newConsumed, 10);
        const cleanNewConsumed = cleanNewBono
            ? Math.max(0, Number.isFinite(parsedNewConsumed) ? parsedNewConsumed : 1)
            : 0;

        if (isNewReservation) {
            return {
                refundBono: '',
                refundAmount: 0,
                deductBono: cleanNewBono,
                deductAmount: cleanNewConsumed
            };
        }

        const cleanPrevBono = (prevRes && prevRes.origen === 'bono') ? String(prevRes.bono || '').trim() : '';
        const prevConsumed = cleanPrevBono ? getReservationConsumedSessions(prevRes, prevDocId) : 0;

        if (cleanPrevBono === cleanNewBono) {
            if (!cleanNewBono) {
                return { refundBono: '', refundAmount: 0, deductBono: '', deductAmount: 0 };
            }
            if (cleanNewConsumed > prevConsumed) {
                return {
                    refundBono: '',
                    refundAmount: 0,
                    deductBono: cleanNewBono,
                    deductAmount: cleanNewConsumed - prevConsumed
                };
            }
            if (cleanNewConsumed < prevConsumed) {
                return {
                    refundBono: cleanPrevBono,
                    refundAmount: prevConsumed - cleanNewConsumed,
                    deductBono: '',
                    deductAmount: 0
                };
            }
            return { refundBono: '', refundAmount: 0, deductBono: '', deductAmount: 0 };
        }

        return {
            refundBono: prevConsumed > 0 ? cleanPrevBono : '',
            refundAmount: prevConsumed > 0 ? prevConsumed : 0,
            deductBono: cleanNewConsumed > 0 ? cleanNewBono : '',
            deductAmount: cleanNewConsumed > 0 ? cleanNewConsumed : 0
        };
    }

    const api = {
        isComplementVoucherItem,
        getReservationConsumedSessions,
        findCatalogMatchForSessionDetection,
        calculateItemSessions,
        sumReservableItemSessions,
        redistributeSessionsAcrossItems,
        dedupeChildReservationsForItem,
        isMultiItemCartVoucher,
        computeVoucherDeltaOnEdit
    };

    root.BonoSessionsHelper = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
