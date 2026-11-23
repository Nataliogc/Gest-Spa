const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('../js/service-catalog');
const { resolveServicePricing, reconcileEditBasePricePax } = require('../js/service-pricing');

console.log('--- TEST: PRICING UNIFICATION, EDIT RECONCILIATION, SPA ADDON PAX & PAYGOLD COLLECTION ---');

// 1. resolveServicePricing tests
{
    const master = [
        { id: 'quiro30', name: "Quiromasaje de espalda - 30'", duration: 30, pax_max: 1, price_pax: 30 },
        { id: 'relax30', name: "Masaje Relax - 30'", duration: 30, pax_max: 1, price_pax: 32 }
    ];
    const catalog = [
        {
            id: 'cat-quiro',
            nombre: 'Quiromasaje de espalda',
            precio: 40,
            pax: 1,
            sesiones: 1,
            items_incluidos: ["Quiromasaje de espalda - 30'"],
            price_updated_at: '2026-11-23T12:00:00Z'
        },
        {
            id: 'cat-bono-quiro',
            nombre: 'Bono 5 Quiromasaje de espalda',
            categoria: 'bono_masaje',
            precio: 160,
            pax: 1,
            sesiones: 5,
            es_bono: true,
            items_incluidos: ["Quiromasaje de espalda - 30'"]
        },
        {
            id: 'cat-pack-quiro',
            nombre: 'Pack Relax + Quiromasaje',
            precio: 60,
            pax: 1,
            sesiones: 1,
            items_incluidos: ["Quiromasaje de espalda - 30'", 'Circuito Spa']
        },
        {
            id: 'cat-legacy-relax',
            nombre: "Masaje Relax -30'",
            duracion: 30,
            precio: 999
        }
    ];

    const quiroRes = resolveServicePricing("Quiromasaje de espalda - 30'", master, catalog);
    assert.equal(quiroRes.resolvedPrice, 40, 'Linked single catalog price (40€) must resolve over stale master price (30€)');
    assert.equal(quiroRes.priceSource, 'catalog_linked');

    // Newer master price_updated_at must beat older catalog price
    const newerMaster = [
        { ...master[0], price_pax: 42, price_updated_at: '2026-11-23T15:00:00Z' }
    ];
    const newerMasterRes = resolveServicePricing("Quiromasaje de espalda - 30'", newerMaster, catalog);
    assert.equal(newerMasterRes.resolvedPrice, 42, 'Newer master price_updated_at must win over older catalog price');
    assert.equal(newerMasterRes.priceSource, 'master');

    // Bonos & multi-item packs must be ignored when resolving single service price
    const onlyBonoAndPackCatalog = catalog.filter(c => c.id === 'cat-bono-quiro' || c.id === 'cat-pack-quiro');
    const fallbackMasterRes = resolveServicePricing("Quiromasaje de espalda - 30'", master, onlyBonoAndPackCatalog);
    assert.equal(fallbackMasterRes.resolvedPrice, 30, 'Multi-session bono and multi-item pack must be ignored');

    // Unlinked legacy catalog record must NOT override master price
    const unlinkedRes = resolveServicePricing("Masaje Relax -30'", master, catalog);
    assert.equal(unlinkedRes.resolvedPrice, 32, 'Unlinked legacy catalog doc must not override master price');
    console.log('✓ resolveServicePricing: catálogo vinculado, timestamps, exclusión bonos/packs y legacy OK');
}

// 2. reconcileEditBasePricePax tests
{
    const calcFormTotal = (basePricePax, pax, extrasTotal = 0, spaAddonTotal = 0, descTipo = 'porcentaje', descValor = 0) => {
        let total = (pax * basePricePax) + extrasTotal + spaAddonTotal;
        if (descValor > 0 && total > 0) {
            const imp = descTipo === 'porcentaje' ? Math.min(total, (total * descValor) / 100) : Math.min(total, descValor);
            total = Math.max(0, total - imp);
        }
        return parseFloat(total.toFixed(2));
    };

    // 2a. New booking with 1x Quiromasaje (40) + 2x Circuito Spa (50) = 90€ across 5 open/save cycles
    let savedTotal = 90;
    let savedPricePax = 40;
    for (let cycle = 0; cycle < 5; cycle++) {
        savedPricePax = reconcileEditBasePricePax({
            savedTotal,
            savedPax: 1,
            rawPricePax: savedPricePax,
            extrasTotal: 0,
            spaAddonTotal: 50
        });
        assert.equal(savedPricePax, 40, `Cycle ${cycle + 1}: base price/pax must stay 40.00`);
        savedTotal = calcFormTotal(savedPricePax, 1, 0, 50);
        assert.equal(savedTotal, 90, `Cycle ${cycle + 1}: total must stay 90.00`);
    }

    // 2b. Healthy legacy booking: precio_pax 65, spaAddon 25, total 90 -> keeps 65.00
    assert.equal(reconcileEditBasePricePax({
        savedTotal: 90,
        savedPax: 1,
        rawPricePax: 65,
        spaAddonTotal: 25
    }), 65);

    // 2c. Corrupted legacy booking: precio_pax 90, spaAddon 25, total 90 -> reconciles to 65.00 so total stays 90.00
    const healed = reconcileEditBasePricePax({
        savedTotal: 90,
        savedPax: 1,
        rawPricePax: 90,
        spaAddonTotal: 25
    });
    assert.equal(healed, 65);
    assert.equal(calcFormTotal(healed, 1, 0, 25), 90);

    // 2d. Custom extra: precio_pax 40, extras 20, total 60 -> keeps 40.00
    assert.equal(reconcileEditBasePricePax({
        savedTotal: 60,
        savedPax: 1,
        rawPricePax: 40,
        extrasTotal: 20
    }), 40);

    // 2e. Discount: precio_pax 100, desc 20%, total 80 -> keeps 100.00 (no double discount to 64)
    const discBase = reconcileEditBasePricePax({
        savedTotal: 80,
        savedPax: 1,
        rawPricePax: 100,
        descTipo: 'porcentaje',
        descValor: 20
    });
    assert.equal(discBase, 100);
    assert.equal(calcFormTotal(discBase, 1, 0, 0, 'porcentaje', 20), 80);

    // 2f. 100% discount: precio_pax 40, desc 100%, total 0 -> keeps 40.00
    assert.equal(reconcileEditBasePricePax({
        savedTotal: 0,
        savedPax: 1,
        rawPricePax: 40,
        descTipo: 'porcentaje',
        descValor: 100
    }), 40);

    // 2g. Legacy Suite: precio_pax 25, pax 2, total 100, no extras/spa/desc -> reconciles to 50.00
    assert.equal(reconcileEditBasePricePax({
        savedTotal: 100,
        savedPax: 2,
        rawPricePax: 25
    }), 50);
    console.log('✓ reconcileEditBasePricePax: preservación exacta en ciclos de edición, extras, spa addon y descuentos OK');
}

// 3. HTML / JS integration and syntax compilation checks
{
    const rootDir = path.resolve(__dirname, '..');
    const salasHtml = fs.readFileSync(path.join(rootDir, 'reservas-salas.html'), 'utf8');
    assert(salasHtml.includes('id="spa-addon-pax"'), 'reservas-salas.html must include #spa-addon-pax');
    assert(salasHtml.includes('function getStandaloneSpaAddonPax()'), 'reservas-salas.html must define getStandaloneSpaAddonPax');
    assert(salasHtml.includes('skipRecalc'), 'reservas-salas.html must support skipRecalc in toggleSpaAddonTab');
    assert(salasHtml.includes('spa_addon: isSpaAddonSaving'), 'reservas-salas.html must persist payload.spa_addon');
    assert(salasHtml.includes('_spa_addon'), 'reservas-salas.html must manage _spa_addon lifecycle');
    assert(salasHtml.includes('reconcileEditBasePricePax'), 'reservas-salas.html must use reconcileEditBasePricePax');

    for (const file of ['reservas-salas.html', 'reservas-spa.html', 'reservas.html']) {
        const html = fs.readFileSync(path.join(rootDir, file), 'utf8');
        assert(html.includes('reconcileEditBasePricePax'), `${file} must use reconcileEditBasePricePax`);
        assert(html.includes('service-pricing.js?v=2.3.97'), `${file} must load service-pricing.js?v=2.3.97`);
        assert(html.includes('spa-paygold.js?v=2.3.97'), `${file} must load spa-paygold.js?v=2.3.97`);
        for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
            if (code.trim()) new vm.Script(code, { filename: file });
        }
    }

    for (const htmlFile of ['catalogo.html', 'disponibilidad-terapeutas.html']) {
        const html = fs.readFileSync(path.join(rootDir, htmlFile), 'utf8');
        for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
            if (code.trim()) new vm.Script(code, { filename: htmlFile });
        }
    }

    for (const jsFile of ['js/config.js', 'js/spa-paygold.js', 'js/service-pricing.js']) {
        const code = fs.readFileSync(path.join(rootDir, jsFile), 'utf8');
        new vm.Script(code, { filename: jsFile });
    }
    console.log('✓ Integración HTML/JS y compilación sintáctica de scripts verificadas');
}

// 4. resolvePayGoldCollection runtime checks in VM
{
    const rootDir = path.resolve(__dirname, '..');
    const paygoldCode = fs.readFileSync(path.join(rootDir, 'js/spa-paygold.js'), 'utf8');
    let domRoomValue = '';
    const ctx = vm.createContext({
        console,
        window: {
            MODULES: {
                cabina1: { code: 'cabina1', collection: 'reservas_cabina1' },
                cabina2: { code: 'cabina2', collection: 'reservas_cabina2' },
                cabina3: { code: 'cabina3', collection: 'reservas_cabina3' },
                cabinas: { code: 'cabinas', collection: 'reservas_cabinas_placeholder' },
                spa: { code: 'spa', collection: 'reservas_spa' }
            },
            currentModule: { code: 'cabinas', collection: 'reservas_cabinas_placeholder' },
            currentEditingCollection: null
        },
        document: {
            readyState: 'loading',
            addEventListener() {},
            getElementById: (id) => (id === 'res-sala' || id === 'res-room') ? { value: domRoomValue } : null
        },
        setTimeout,
        clearTimeout
    });
    ctx.window.window = ctx.window;
    vm.runInContext(paygoldCode, ctx);

    const resolveFn = ctx.window.resolvePayGoldCollection;
    assert.equal(typeof resolveFn, 'function', 'resolvePayGoldCollection must be exposed on window');

    assert.equal(resolveFn({ id: '1', collection: 'reservas_cabina2' }, '1'), 'reservas_cabina2');
    assert.equal(resolveFn({ id: '2', collection: 'reservas_cabinas_placeholder', sala: 'cabina2' }, '2'), 'reservas_cabina2');
    assert.equal(resolveFn({ id: '3', sala: 'MAR' }, '3'), 'reservas_cabina2');

    domRoomValue = 'cabina2';
    assert.equal(resolveFn({ id: '4' }, '4'), 'reservas_cabina2');

    domRoomValue = '';
    assert.notEqual(resolveFn({ id: '5' }, '5'), 'reservas_cabinas_placeholder', 'Must never return reservas_cabinas_placeholder');
    assert.equal(resolveFn({ id: '5' }, '5'), 'reservas_spa');
    console.log('✓ resolvePayGoldCollection: nunca devuelve placeholder y resuelve reservas_cabina2 correctamente');
}

console.log('\n✅ TODOS LOS TESTS DE PRECIOS, CIRCUITO SPA ADICIONAL Y PAYGOLD PASARON!');
