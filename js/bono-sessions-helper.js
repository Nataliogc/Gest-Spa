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

    function normMatchServiceName(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/\s*-\s*\d+\s*['"minutos]*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function matchReservationsForVoucherItem(item, activeReservations = [], options = {}) {
        if (!item || typeof item !== 'object') {
            return { validReservations: [], dedupedReservations: [], consumedCount: 0 };
        }
        const { allowGenericMassageFallback = true } = options || {};
        const iName = normMatchServiceName(item.name || item.nombre || item.producto || '');
        const allowed = Array.isArray(item.allowedSpaces)
            ? item.allowedSpaces
            : (item.space ? [item.space] : (item.espacio ? [item.espacio] : []));

        const validReservations = (Array.isArray(activeReservations) ? activeReservations : []).filter(h => {
            if (!h) return false;
            const st = String(h.status || '').toLowerCase().trim();
            const est = String(h.estado || '').toLowerCase().trim();
            if (st === 'anulada' || est === 'anulada' || est === 'cancelada') return false;

            const hName = normMatchServiceName(h.servicio || h.tratamiento || h.producto || '');

            let nameMatch = false;
            if (hName && iName) {
                nameMatch = hName === iName
                    || hName.includes(iName)
                    || iName.includes(hName)
                    || (allowGenericMassageFallback && iName.includes('masaje') && hName.includes('masaje'));
            }

            let spaceMatch = false;
            const hSrv = String(h.servicio || '').toLowerCase();
            const isRestCollection = ['reservas_restaurante', 'reservas_rest', 'reservas_menu', 'reservas', 'reservas_evento'].includes(h._col);
            const isRestName = hSrv.includes('restaurante') || hSrv.includes('menu') || hSrv.includes('menú') || hSrv.includes('almuerzo') || hSrv.includes('cena');

            for (const rawS of allowed) {
                const s = String(rawS || '').toLowerCase().trim();
                if (!s) continue;

                if (s === 'hotel' && ((h.origen || '').toLowerCase().includes('hotel') || hName.includes('alojamiento') || hName.includes('hotel'))) {
                    spaceMatch = true;
                }

                const isItemRest = (s === 'restaurante' || s === 'rest' || s === 'restauracion') || iName.includes('restaurante') || iName.includes('menu') || iName.includes('menú');
                if (isItemRest && (isRestCollection || isRestName)) {
                    spaceMatch = true;
                }

                if (s === 'spa' && h._col === 'reservas_spa' && !isRestName && (iName.includes('circuito') || iName.includes('spa'))) {
                    spaceMatch = true;
                }

                if ((s === 'gimnasio' || s === 'gym') && (h._col === 'reservas_gimnasio' || hName.includes('gimnasio'))) {
                    spaceMatch = true;
                }

                if (spaceMatch) break;
            }

            if (!spaceMatch && allowed.length === 0 && (iName.includes('gimnasio') || iName.includes('gym')) && (h._col === 'reservas_gimnasio' || hName.includes('gimnasio'))) {
                spaceMatch = true;
            }

            return nameMatch || spaceMatch;
        });

        const deduped = dedupeChildReservationsForItem(validReservations);
        const consumedFromReservations = deduped.reduce((sum, r) => {
            const raw = r && r.sesiones_consumidas;
            if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
                const parsed = parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed > 1) return sum + parsed;
            }
            return sum + 1;
        }, 0);

        const hasInternalEntries = validReservations.some(h => h && h._col === 'internal');
        const internalValidationsCount = (!hasInternalEntries && Array.isArray(item.validations))
            ? item.validations.filter(v => v && v.source !== 'mesachef' && !v.external_id && (v.fecha_validacion || v.fecha)).length
            : 0;

        return {
            validReservations,
            dedupedReservations: deduped,
            consumedCount: consumedFromReservations + internalValidationsCount
        };
    }

    function reconcileVoucherUsageFromHistory(voucher, activeReservations = []) {
        const v = voucher && typeof voucher === 'object' ? voucher : {};
        const code = String(v.bono || v.codigo || '').trim();
        const rawEstado = String(v.estado || '').toLowerCase().trim();
        const rawItems = Array.isArray(v.items_desglosados)
            ? v.items_desglosados
            : (Array.isArray(v.desglosados) ? v.desglosados : []);
        const storedUsed = Math.max(0, parseInt(v.sesiones_usadas, 10) || 0);

        const reservableRaw = rawItems.filter(it => !isComplementVoucherItem(it));
        const parsedRawTotal = parseInt(v.sesiones_totales || v.sesiones_total, 10);
        const isSingleSessionPack = (rawItems.some(it => Boolean(it && it.parent_pack)) && ((Number.isFinite(parsedRawTotal) ? parsedRawTotal : 1) === 1))
            || (reservableRaw.length <= 1 && /(ritual|experien|fantas[ií]a|sue[ñn]o|escapada)/i.test(String(v.producto || '')));

        const itemsSessionsTotal = sumReservableItemSessions(rawItems);
        const total = isSingleSessionPack
            ? (Number.isFinite(parsedRawTotal) && parsedRawTotal > 0 ? parsedRawTotal : 1)
            : ((Number.isFinite(parsedRawTotal) && parsedRawTotal > 0) ? parsedRawTotal : (itemsSessionsTotal || 1));

        const isExcluded = ['anulado', 'cancelled', 'cancelado', 'expired', 'caducado'].includes(rawEstado)
            || v.tipo_bono === 'monedero'
            || v.es_monedero === true
            || code.toLowerCase().startsWith('exc.loc');

        if (isExcluded) {
            return {
                total,
                used: storedUsed,
                balance: Math.max(0, total - storedUsed),
                items: rawItems.map(it => ({ ...it })),
                estado: rawEstado || 'pending',
                reconciled: false,
                previousUsed: storedUsed,
                itemsChanged: false
            };
        }

        const activeList = (Array.isArray(activeReservations) ? activeReservations : []).filter(h => {
            if (!h) return false;
            const st = String(h.status || '').toLowerCase().trim();
            const est = String(h.estado || '').toLowerCase().trim();
            return st !== 'anulada' && est !== 'anulada' && est !== 'cancelada';
        });

        const isCompletedState = ['completed', 'canjeado', 'agotado'].includes(rawEstado);
        const hasAnyTrackedHistory = activeList.length > 0;
        const hasImpossibleOvercount = storedUsed > total || reservableRaw.some(it => {
            const u = parseInt(it.used ?? it.usadas, 10) || 0;
            const t = Math.max(1, parseInt(it.sessions ?? it.sesiones ?? it.total, 10) || 1);
            return u > t;
        });
        const canReconcileDownward = !isCompletedState || hasAnyTrackedHistory || hasImpossibleOvercount;

        const massageItemCount = reservableRaw.filter(it => String(it.name || it.nombre || '').toLowerCase().includes('masaje')).length;
        const allowGenericMassageFallback = (massageItemCount === 1);

        let itemsChanged = false;
        const reconciledItems = rawItems.map(rawIt => {
            const item = { ...rawIt };
            if (isComplementVoucherItem(item)) return item;

            const { consumedCount } = matchReservationsForVoucherItem(item, activeList, { allowGenericMassageFallback });
            const prevItemUsed = Math.max(0, parseInt(item.used ?? item.usadas, 10) || 0);
            const itemTotal = Math.max(1, parseInt(item.sessions ?? item.sesiones ?? item.total, 10) || 1);

            let nextItemUsed = prevItemUsed;
            if (consumedCount > prevItemUsed) {
                nextItemUsed = consumedCount;
            } else if (canReconcileDownward && prevItemUsed > consumedCount) {
                if (hasAnyTrackedHistory || !isCompletedState) {
                    nextItemUsed = consumedCount;
                } else {
                    nextItemUsed = Math.min(prevItemUsed, itemTotal);
                }
            }

            if (nextItemUsed !== prevItemUsed || (item.used !== nextItemUsed) || (item.usadas !== nextItemUsed)) {
                if (nextItemUsed !== prevItemUsed) itemsChanged = true;
                item.used = nextItemUsed;
                item.usadas = nextItemUsed;
                if (item.status !== undefined) {
                    item.status = nextItemUsed >= itemTotal ? 'completado' : (nextItemUsed > 0 ? 'parcial' : 'pendiente');
                }
            }
            return item;
        });

        const reservableReconciled = reconciledItems.filter(it => !isComplementVoucherItem(it));
        const historyConsumedSum = activeList.reduce((sum, h) => sum + getReservationConsumedSessions(h, h.id), 0);
        const itemsUsedSum = reservableReconciled.reduce((sum, it) => sum + (parseInt(it.used, 10) || 0), 0);

        let computedUsed = 0;
        if (reconciledItems.length > 0 && reservableReconciled.length > 0) {
            if (isSingleSessionPack) {
                const allComplete = reservableReconciled.every(it => (parseInt(it.used, 10) || 0) >= Math.max(1, parseInt(it.sessions ?? it.sesiones ?? it.total, 10) || 1));
                computedUsed = allComplete ? total : Math.min(total, Math.max(historyConsumedSum, itemsUsedSum > 0 ? 1 : 0));
            } else {
                computedUsed = Math.max(itemsUsedSum, historyConsumedSum);
            }
        } else {
            computedUsed = historyConsumedSum;
        }

        let finalUsed = storedUsed;
        if (computedUsed > storedUsed) {
            finalUsed = computedUsed;
        } else if (canReconcileDownward && storedUsed > computedUsed) {
            if (hasAnyTrackedHistory || !isCompletedState) {
                finalUsed = computedUsed;
            } else {
                finalUsed = Math.min(storedUsed, total);
            }
        }

        let nextEstado = rawEstado || 'pending';
        if (reservableReconciled.length > 0) {
            const allComplete = reservableReconciled.every(it => (parseInt(it.used, 10) || 0) >= Math.max(1, parseInt(it.sessions ?? it.sesiones ?? it.total, 10) || 1));
            const anyUsed = reservableReconciled.some(it => (parseInt(it.used, 10) || 0) > 0);
            if (allComplete && (finalUsed >= total || isSingleSessionPack)) {
                nextEstado = 'completed';
            } else if (anyUsed || finalUsed > 0) {
                nextEstado = 'partially';
            } else {
                nextEstado = (isCompletedState && !canReconcileDownward) ? rawEstado : 'pending';
            }
        } else {
            if (finalUsed >= total) {
                nextEstado = 'completed';
            } else if (finalUsed > 0) {
                nextEstado = 'partially';
            } else {
                nextEstado = (isCompletedState && !canReconcileDownward) ? rawEstado : 'pending';
            }
        }

        const reconciled = (finalUsed !== storedUsed)
            || itemsChanged
            || (nextEstado !== rawEstado && !(rawEstado === '' && nextEstado === 'pending'));

        return {
            total,
            used: finalUsed,
            balance: Math.max(0, total - finalUsed),
            items: reconciledItems,
            estado: nextEstado,
            reconciled,
            previousUsed: storedUsed,
            itemsChanged
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
        computeVoucherDeltaOnEdit,
        matchReservationsForVoucherItem,
        reconcileVoucherUsageFromHistory
    };

    root.BonoSessionsHelper = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
