const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BonoSessionsHelper = require('../js/bono-sessions-helper');
const {
    resolveStandaloneSpaAddonUnitPrice,
    reconcileIncludedOriginSpaAddonEdit
} = require('../js/service-pricing');

console.log('--- TEST: BONO SESSIONS HELPER, NO DOUBLE DEDUCTION & INCLUDED SPA ADDON PRICING ---');

// 1. Caso exacto BONO7683: 2 artículos en carrito (Masaje Relax variación 6521 + Masaje Craneo-facial 6537)
{
    const catalog = [
        { id: 'wc-6519', wc_id: 6519, nombre: 'Masaje Relax (Bono 5)', sesiones: 5 },
        { id: 'wc-6521', wc_id: 6521, variation_id: 6521, product_id: 6519, nombre: "Masaje Relax - Sesión de 30'", sesiones: 1 },
        { id: 'wc-6537', wc_id: 6537, product_id: 6537, nombre: 'Masaje Craneo-facial y espalda', sesiones: 1 }
    ];

    const match1 = BonoSessionsHelper.findCatalogMatchForSessionDetection({
        product_id: 6519,
        variation_id: 6521,
        producto: "Masaje Relax - Sesión de 30'"
    }, catalog);
    assert.equal(match1?.id, 'wc-6521', 'variation_id 6521 must resolve to 1-session variation, not parent product 6519');

    const s1 = BonoSessionsHelper.calculateItemSessions({
        name: "Masaje Relax - Sesión de 30'",
        catalogMatch: match1,
        apiSessions: 1,
        quantity: 1,
        detectedTextSessions: 1
    });
    const match2 = BonoSessionsHelper.findCatalogMatchForSessionDetection({
        product_id: 6537,
        variation_id: 0,
        producto: 'Masaje Craneo-facial y espalda'
    }, catalog);
    const s2 = BonoSessionsHelper.calculateItemSessions({
        name: 'Masaje Craneo-facial y espalda',
        catalogMatch: match2,
        apiSessions: 1,
        quantity: 1,
        detectedTextSessions: 1
    });

    assert.equal(s1, 1);
    assert.equal(s2, 1);
    const items = [
        { name: "Masaje Relax - Sesión de 30'", product_id: 6519, variation_id: 6521, sessions: s1, used: 0 },
        { name: 'Masaje Craneo-facial y espalda', product_id: 6537, sessions: s2, used: 0 }
    ];
    assert.equal(BonoSessionsHelper.sumReservableItemSessions(items), 2, 'BONO7683 must sum to 2 total sessions');
    assert.equal(BonoSessionsHelper.isMultiItemCartVoucher({ items_desglosados: items }), true, 'BONO7683 must preserve combined cart title');
}

// 2. Sin doble multiplicación quantity^2
{
    assert.equal(BonoSessionsHelper.calculateItemSessions({ name: 'Masaje Relax', quantity: 2 }), 2);
    assert.equal(BonoSessionsHelper.calculateItemSessions({ name: 'Masaje Relax', quantity: 3 }), 3);
    assert.equal(BonoSessionsHelper.calculateItemSessions({
        name: 'Bono 5 Masaje Relax',
        catalogMatch: { nombre: 'Bono 5 Masaje Relax', sesiones: 5 },
        quantity: 2
    }), 10);
}

// 3. Colisión variation_id vs parent product_id aunque la variación no exista en el catálogo
{
    const catalogOnlyParent = [
        { id: 'wc-6519', wc_id: 6519, nombre: 'Bono 5 Masaje Relax', sesiones: 5 }
    ];
    const match = BonoSessionsHelper.findCatalogMatchForSessionDetection({
        product_id: 6519,
        variation_id: 6521,
        producto: "Masaje Relax - Sesión de 30'"
    }, catalogOnlyParent);
    assert.equal(match, null, 'Must never fall back to multi-session parent product_id when variation_id is present');
}

// 4. Guardia de nombres vacíos en catálogo, falsos positivos de "bono" y "Sesión de XX'"
{
    const dirtyCatalog = [
        { id: 'empty-name', nombre: '', sesiones: 10 },
        { id: 'short-name', nombre: 'de', sesiones: 8 },
        { id: 'bono-relax', nombre: 'Bono 5 Relax', sesiones: 5 },
        { id: 'single-relax', nombre: 'Masaje Relax', sesiones: 1 }
    ];
    const m = BonoSessionsHelper.findCatalogMatchForSessionDetection({
        producto: "Masaje Relax - Sesión de 30'"
    }, dirtyCatalog);
    assert.equal(m?.id, 'single-relax', 'Should match single massage instead of multi-session Bono or empty catalog entry');

    const singularSessions = BonoSessionsHelper.calculateItemSessions({
        name: "Masaje Relax - Sesión de 30'",
        catalogMatch: { nombre: 'Bono 5 Relax', sesiones: 5 },
        apiSessions: 5,
        quantity: 1,
        detectedTextSessions: 5
    });
    assert.equal(singularSessions, 1, 'Explicit singular "Sesión de 30\'" must force 1 session per unit');
}

// 5. redistributeSessionsAcrossItems: asimétricos, complementos y saneamiento de 7 -> 2
{
    const asymmetric = [
        { name: 'Bono 5 Masajes', sessions: 5, used: 0 },
        { name: 'Circuito Spa', sessions: 1, used: 0 }
    ];
    const preserved = BonoSessionsHelper.redistributeSessionsAcrossItems(asymmetric, 6);
    assert.deepEqual(preserved.map(i => i.sessions), [5, 1], 'Asymmetric [5, 1] totaling 6 must stay [5, 1]');

    const withComplement = [
        { name: 'Circuito Spa', sessions: 1, space: 'spa' },
        { name: 'Masaje Relax', sessions: 1, space: 'cabina' },
        { name: 'Botella de Cava', sessions: 1, tipo: 'complemento', reservable: false }
    ];
    assert.equal(BonoSessionsHelper.sumReservableItemSessions(withComplement), 2, 'Complements must not inflate reservable session count');
    const keptComp = BonoSessionsHelper.redistributeSessionsAcrossItems(withComplement, 2);
    assert.deepEqual(keptComp.map(i => i.sessions), [1, 1, 1]);

    const corrupted7 = [
        { name: "Masaje Relax - Sesión de 30'", sessions: 3, used: 0 },
        { name: 'Masaje Craneo-facial y espalda', sessions: 4, used: 0 }
    ];
    const healed2 = BonoSessionsHelper.redistributeSessionsAcrossItems(corrupted7, 2);
    assert.deepEqual(healed2.map(i => i.sessions), [1, 1], 'Changing total 7 -> 2 must restore [1, 1]');
}

// 6. getReservationConsumedSessions: respetar 0 explícito e hijos _spa_addon / pack_child
{
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({ sesiones_consumidas: 0 }, 'res1'), 0);
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({}, 'abc_spa_addon'), 0);
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({ is_pack_child: true }, 'res2'), 0);
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({ is_pack_element: true }, 'res3'), 0);
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({ is_pack_child: true, is_primary_pack: true }, 'res4'), 1);
    assert.equal(BonoSessionsHelper.getReservationConsumedSessions({ origen: 'bono' }, 'res5'), 1);
}

// 7. dedupeChildReservationsForItem: caso exacto exc.Loc 17936 (RS-1QXY + _spa_addon)
{
    const historyExcLoc = [
        {
            id: 'm1aiJEtJ1ajviW23edJN',
            res_id: 'RS-1QXY',
            servicio: "Masaje en pareja - 30'",
            sesiones_consumidas: 1
        },
        {
            id: 'm1aiJEtJ1ajviW23edJN_spa_addon',
            parent_id: 'm1aiJEtJ1ajviW23edJN',
            is_pack_child: true,
            sesiones_consumidas: 0,
            servicio: 'Circuito Spa'
        }
    ];
    const dedupedSingleItem = BonoSessionsHelper.dedupeChildReservationsForItem(historyExcLoc);
    assert.equal(dedupedSingleItem.length, 1, 'Parent + _spa_addon child matching same single item must count 1, not 2/1');
    assert.equal(dedupedSingleItem[0].res_id, 'RS-1QXY');

    // Pack de 2 items donde cada item filtra solo su fase correspondiente: la fase Circuito Spa no incluye al padre y debe mantenerse
    const spaItemOnly = [historyExcLoc[1]];
    assert.equal(BonoSessionsHelper.dedupeChildReservationsForItem(spaItemOnly).length, 1);
}

// 8. computeVoucherDeltaOnEdit: evitar descuento repetido al editar reservas de bono
{
    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: true,
            newOrigen: 'bono',
            newBono: 'exc.Loc 17936',
            newConsumed: 1
        }),
        { refundBono: '', refundAmount: 0, deductBono: 'exc.Loc 17936', deductAmount: 1 }
    );

    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: false,
            prevRes: { origen: 'bono', bono: 'exc.Loc 17936', sesiones_consumidas: 1 },
            prevDocId: 'm1aiJEtJ1ajviW23edJN',
            newOrigen: 'bono',
            newBono: 'exc.Loc 17936',
            newConsumed: 1
        }),
        { refundBono: '', refundAmount: 0, deductBono: '', deductAmount: 0 },
        'Editing an existing bono reservation without session changes must NOT deduct again'
    );

    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: false,
            prevRes: { origen: 'bono', bono: 'BONO1', sesiones_consumidas: 1 },
            newOrigen: 'bono',
            newBono: 'BONO1',
            newConsumed: 2
        }),
        { refundBono: '', refundAmount: 0, deductBono: 'BONO1', deductAmount: 1 }
    );

    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: false,
            prevRes: { origen: 'bono', bono: 'BONO1', sesiones_consumidas: 2 },
            newOrigen: 'bono',
            newBono: 'BONO1',
            newConsumed: 1
        }),
        { refundBono: 'BONO1', refundAmount: 1, deductBono: '', deductAmount: 0 }
    );

    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: false,
            prevRes: { origen: 'bono', bono: 'BONO1', sesiones_consumidas: 1 },
            newOrigen: 'bono',
            newBono: 'BONO2',
            newConsumed: 1
        }),
        { refundBono: 'BONO1', refundAmount: 1, deductBono: 'BONO2', deductAmount: 1 }
    );

    assert.deepEqual(
        BonoSessionsHelper.computeVoucherDeltaOnEdit({
            isNewReservation: false,
            prevRes: { origen: 'bono', bono: 'BONO1', sesiones_consumidas: 1 },
            newOrigen: 'particular',
            newBono: '',
            newConsumed: 1
        }),
        { refundBono: 'BONO1', refundAmount: 1, deductBono: '', deductAmount: 0 }
    );
}

// 9. Caso exacto RS-1QXY / exc.Loc 17936: Circuito Spa adicional a 0€ para bonos y orígenes incluidos
{
    const cfg = { hotelPriceWeekday: 12, hotelPriceWeekend: 18, particularPriceWeekday: 25, particularPriceWeekend: 25 };
    for (const orig of ['bono', 'hotel_inc', 'smartbox', 'wonderbox', 'ego', 'groupon']) {
        assert.equal(
            resolveStandaloneSpaAddonUnitPrice({ origen: orig, isMonedero: false, dateStr: '2026-12-02', spaConfig: cfg }),
            0,
            `Included origin ${orig} must price standalone spa addon at 0€`
        );
    }
    assert.equal(resolveStandaloneSpaAddonUnitPrice({ origen: 'particular', isMonedero: false, dateStr: '2026-12-02', spaConfig: cfg }), 25);
    assert.equal(resolveStandaloneSpaAddonUnitPrice({ origen: 'bono', isMonedero: true, dateStr: '2026-12-02', spaConfig: cfg }), 25);
    assert.equal(resolveStandaloneSpaAddonUnitPrice({ origen: 'hotel_no_inc', isMonedero: false, dateStr: '2026-12-02', spaConfig: cfg }), 12);
    assert.equal(resolveStandaloneSpaAddonUnitPrice({ origen: 'hotel_no_inc', isMonedero: false, dateStr: '2026-12-05', spaConfig: cfg }), 18);

    const healedRs1qxy = reconcileIncludedOriginSpaAddonEdit({
        origen: 'bono',
        isMonedero: false,
        savedTotal: 50,
        rawPricePax: 0,
        savedExtrasSum: 0,
        hasSpaAddon: true,
        storedSpaTotal: 50
    });
    assert.deepEqual(healedRs1qxy, {
        isIncludedOrigin: true,
        effectiveSpaAddonTotal: 0,
        effectiveSavedTotal: 0,
        healed: true
    });

    const withPaidExtra = reconcileIncludedOriginSpaAddonEdit({
        origen: 'bono',
        isMonedero: false,
        savedTotal: 70,
        rawPricePax: 0,
        savedExtrasSum: 20,
        hasSpaAddon: true,
        storedSpaTotal: 50
    });
    assert.deepEqual(withPaidExtra, {
        isIncludedOrigin: true,
        effectiveSpaAddonTotal: 0,
        effectiveSavedTotal: 20,
        healed: true
    });

    const particularUnchanged = reconcileIncludedOriginSpaAddonEdit({
        origen: 'particular',
        isMonedero: false,
        savedTotal: 110,
        rawPricePax: 30,
        savedExtrasSum: 0,
        hasSpaAddon: true,
        storedSpaTotal: 50
    });
    assert.deepEqual(particularUnchanged, {
        isIncludedOrigin: false,
        effectiveSpaAddonTotal: 50,
        effectiveSavedTotal: 110,
        healed: false
    });
}

// 10. Reconciliación unificada de uso y aislamiento multi-masaje (matchReservationsForVoucherItem + reconcileVoucherUsageFromHistory)
{
    // 10a. Caso exacto BONO7873 antes de Re-sync WC (Total: 2, Usadas: 4, estado: completed, items [2/1, 2/1] con solo 2 citas RS-QQQ7)
    const bono7873Before = {
        bono: 'BONO7873',
        producto: 'Circuito SPA',
        sesiones_totales: 2,
        sesiones_usadas: 4,
        estado: 'completed',
        items_desglosados: [
            { name: 'Masaje con Piedras Volcánicas', space: 'panacea', sessions: 1, used: 2 },
            { name: 'Circuito SPA - Circuito Spa', space: 'spa', sessions: 1, used: 2 }
        ]
    };
    const history7873 = [
        { id: 'cab3_qqq7', res_id: 'RS-QQQ7', _col: 'reservas_cabina3', servicio: 'Masaje con Piedras Volcánicas', sesiones_consumidas: 1 },
        { id: 'spa_qqq7', res_id: 'RS-QQQ7', _col: 'reservas_spa', servicio: 'Circuito SPA - Circuito Spa', sesiones_consumidas: 0 }
    ];
    const recBefore = BonoSessionsHelper.reconcileVoucherUsageFromHistory(bono7873Before, history7873);
    assert.deepEqual(recBefore.items.map(it => it.used), [1, 1], 'BONO7873 items must heal from [2, 2] to [1, 1]');
    assert.equal(recBefore.used, 2, 'BONO7873 total used must heal from 4 to 2');
    assert.equal(recBefore.reconciled, true);

    // 10b. Caso exacto BONO7873 tras Re-sync WC (Total: 4, Usadas: 4, estado: completed, items [2/2, 2/2] con las mismas 2 citas)
    const bono7873AfterResync = {
        bono: 'BONO7873',
        producto: 'Masaje con Piedras Volcánicas + Circuito SPA - Circuito Spa',
        sesiones_totales: 4,
        sesiones_usadas: 4,
        estado: 'completed',
        items_desglosados: [
            { name: 'Masaje con Piedras Volcánicas', space: 'panacea', sessions: 2, used: 2 },
            { name: 'Circuito SPA - Circuito Spa', space: 'spa', sessions: 2, used: 2 }
        ]
    };
    const recAfterResync = BonoSessionsHelper.reconcileVoucherUsageFromHistory(bono7873AfterResync, history7873);
    assert.deepEqual(recAfterResync.items.map(it => it.used), [1, 1], 'Each item of BONO7873 must reconcile to 1/2');
    assert.equal(recAfterResync.used, 2);
    assert.equal(recAfterResync.balance, 2);
    assert.equal(recAfterResync.estado, 'partially');
    assert.equal(recAfterResync.reconciled, true);

    // 10c. BONO7873 cuando el SPA (2 pax) consumió 2 y Cabina 3 consumió 1 (Total: 4 -> Masaje sigue 1/2 reservable)
    const history7873Spa2 = [
        { id: 'cab3_qqq7', res_id: 'RS-QQQ7', _col: 'reservas_cabina3', servicio: 'Masaje con Piedras Volcánicas', sesiones_consumidas: 1 },
        { id: 'spa_qqq7', res_id: 'RS-QQQ7', _col: 'reservas_spa', servicio: 'Circuito SPA - Circuito Spa', sesiones_consumidas: 2 }
    ];
    const recSpa2 = BonoSessionsHelper.reconcileVoucherUsageFromHistory(bono7873AfterResync, history7873Spa2);
    assert.deepEqual(recSpa2.items.map(it => it.used), [1, 2], 'Massage must remain 1/2 when SPA reservation consumed 2 sessions');
    assert.equal(recSpa2.used, 3);
    assert.equal(recSpa2.balance, 1);
    assert.equal(recSpa2.estado, 'partially');

    // 10d. Aislamiento de múltiples masajes en BONO7683
    const bono7683 = {
        bono: 'BONO7683',
        producto: "Masaje Relax - Sesión de 30' + Masaje Craneo-facial y espalda",
        sesiones_totales: 2,
        sesiones_usadas: 0,
        estado: 'pending',
        items_desglosados: [
            { name: "Masaje Relax - Sesión de 30'", space: 'panacea', sessions: 1, used: 0 },
            { name: 'Masaje Craneo-facial y espalda', space: 'panacea', sessions: 1, used: 0 }
        ]
    };
    const recRelaxOnly = BonoSessionsHelper.reconcileVoucherUsageFromHistory(bono7683, [
        { id: 'res_relax', _col: 'reservas_cabina1', servicio: "Masaje Relax - 30'", sesiones_consumidas: 1 }
    ]);
    assert.deepEqual(recRelaxOnly.items.map(it => it.used), [1, 0], 'Booking Masaje Relax must NOT mark Masaje Craneo-facial as used');
    assert.equal(recRelaxOnly.used, 1);
    assert.equal(recRelaxOnly.estado, 'partially');

    // 10e. Pack de 1 sesión (Ritual Indian Ritual con 2 fases) -> siempre 1/1 completed, nunca 2/1
    const singlePack = {
        bono: 'BONO9001',
        producto: 'Ritual Indian Ritual',
        sesiones_totales: 1,
        sesiones_usadas: 1,
        estado: 'completed',
        items_desglosados: [
            { name: 'Circuito Spa', space: 'spa', sessions: 1, used: 1, parent_pack: 'Ritual Indian Ritual' },
            { name: 'Masaje Ritual Indian', space: 'panacea', sessions: 1, used: 1, parent_pack: 'Ritual Indian Ritual' }
        ]
    };
    const recSinglePack = BonoSessionsHelper.reconcileVoucherUsageFromHistory(singlePack, [
        { id: 'p_main', res_id: 'RS-ABCD', _col: 'reservas_panacea', servicio: 'Masaje Ritual Indian', sesiones_consumidas: 1 },
        { id: 'p_spa', res_id: 'RS-ABCD', _col: 'reservas_spa', servicio: 'Circuito Spa', is_pack_element: true, sesiones_consumidas: 0 }
    ]);
    assert.equal(recSinglePack.used, 1, 'Single-session pack with 2 phase bookings must count as 1, never 2/1');
    assert.equal(recSinglePack.estado, 'completed');

    // 10f. Bono histórico legítimamente completado sin historial en Firestore -> NO tocar
    const legacyCompleted = {
        bono: 'BONO1000',
        producto: 'Masaje Relax',
        sesiones_totales: 1,
        sesiones_usadas: 1,
        estado: 'completed',
        items_desglosados: [{ name: 'Masaje Relax', space: 'cabina', sessions: 1, used: 1 }]
    };
    const recLegacy = BonoSessionsHelper.reconcileVoucherUsageFromHistory(legacyCompleted, []);
    assert.equal(recLegacy.reconciled, false);
    assert.equal(recLegacy.used, 1);
    assert.equal(recLegacy.estado, 'completed');

    // 10g. Bono parcialmente usado cuyas citas fueron todas anuladas -> vuelve a 0 / pending
    const orphanedPartial = {
        bono: 'BONO2000',
        producto: 'Bono 5 Masajes',
        sesiones_totales: 5,
        sesiones_usadas: 2,
        estado: 'partially',
        items_desglosados: [{ name: 'Masaje Relax', space: 'cabina', sessions: 5, used: 2 }]
    };
    const recOrphaned = BonoSessionsHelper.reconcileVoucherUsageFromHistory(orphanedPartial, []);
    assert.equal(recOrphaned.used, 0);
    assert.equal(recOrphaned.items[0].used, 0);
    assert.equal(recOrphaned.estado, 'pending');
    assert.equal(recOrphaned.reconciled, true);
}

// 11. Verificación de integración HTML/JS y compilación sintáctica con vm.Script
{
    const rootDir = path.resolve(__dirname, '..');

    for (const file of ['bonos.html', 'reservas-salas.html', 'reservas-spa.html', 'reservas.html']) {
        const html = fs.readFileSync(path.join(rootDir, file), 'utf8');
        assert(html.includes('bono-sessions-helper.js?v=2.3.99'), `${file} must load bono-sessions-helper.js?v=2.3.99`);
        assert(html.includes('app-core.js?v=2.3.99'), `${file} must load app-core.js?v=2.3.99`);
        for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
            if (code.trim()) new vm.Script(code, { filename: file });
        }
    }

    const bonosHtml = fs.readFileSync(path.join(rootDir, 'bonos.html'), 'utf8');
    assert(bonosHtml.includes('bonos.js?v=2.3.99'), 'bonos.html must load bonos.js?v=2.3.99');

    for (const bookingFile of ['reservas-salas.html', 'reservas-spa.html', 'reservas.html']) {
        const html = fs.readFileSync(path.join(rootDir, bookingFile), 'utf8');
        assert(html.includes('service-pricing.js?v=2.3.98'), `${bookingFile} must load service-pricing.js?v=2.3.98`);
        assert(html.includes('computeVoucherDeltaOnEdit'), `${bookingFile} must use computeVoucherDeltaOnEdit`);
    }

    const salasHtml = fs.readFileSync(path.join(rootDir, 'reservas-salas.html'), 'utf8');
    assert(salasHtml.includes('!id && !!(window._packItems'), 'reservas-salas.html must guard pack creation check with !id');
    assert(salasHtml.includes('sesiones_consumidas: 0'), 'reservas-salas.html must set sesiones_consumidas: 0 on spaAddonPayload');
    assert(salasHtml.includes('resolveStandaloneSpaAddonUnitPrice'), 'reservas-salas.html must use resolveStandaloneSpaAddonUnitPrice');
    assert(salasHtml.includes('reconcileIncludedOriginSpaAddonEdit'), 'reservas-salas.html must use reconcileIncludedOriginSpaAddonEdit');
    assert(salasHtml.includes('Incluido (0.00 €)'), 'reservas-salas.html must show Incluido (0.00 €) badge');

    const appCoreCode = fs.readFileSync(path.join(rootDir, 'js/app-core.js'), 'utf8');
    assert(appCoreCode.includes('reconcileVoucherUsageFromHistory'), 'js/app-core.js must call reconcileVoucherUsageFromHistory');

    for (const jsFile of ['js/bono-sessions-helper.js', 'js/service-pricing.js', 'js/bonos.js', 'js/app-core.js']) {
        const code = fs.readFileSync(path.join(rootDir, jsFile), 'utf8');
        new vm.Script(code, { filename: jsFile });
    }
}

console.log('✓ Todos los tests de sesiones de bonos, edición sin doble descuento y Spa adicional 0€ pasaron correctamente');
