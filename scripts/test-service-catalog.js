const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../js/service-catalog');
const master = [
    { id: 'relax30', name: "Masaje Relax - 30'", duration: 30, pax_max: 1, price_pax: 32, allowedSpaces: ['cabina', 'panacea', 'vip'], required_therapists: 1 },
    { id: 'relax60', name: "Masaje Relax - 60'", duration: 60, pax_max: 1, price_pax: 52, allowedSpaces: ['cabina'] },
    { id: 'pareja', name: "Masaje en pareja - 30'", duration: 30, pax_max: 2, allowedSpaces: ['panacea', 'vip'], required_therapists: 2 },
    { id: 'suite', name: 'MASAJE RELAX 30 MIN EN SUITE', duration: 30, pax_max: 2, price_pax: 0, allowedSpaces: ['suite'] },
    { id: 'bambu', name: "Masaje relax de cañas de bambú - 30'", duration: 30, allowedSpaces: ['cabina'] },
    { id: 'off', name: 'Inactivo', active: false, allowedSpaces: ['cabina'] },
    { id: 'component', name: 'Componente explícito', pack_only: true, allowedSpaces: ['cabina'] }
];
const catalog = [
    { nombre: "Masaje Relax -30'", duracion: 30, espacio: 'suite', precio: 999 },
    { nombre: "Masaje Relax 60'", duracion: 60 },
    { nombre: 'Masaje Relax', duracion: 30 }
];
assert.equal(api.resolve(catalog[0], master).id, 'relax30');
assert.equal(api.resolve(catalog[1], master).id, 'relax60');
assert.equal(api.resolve('Masaje Relax', master, catalog).id, 'relax30');
assert.equal(api.resolve('Masaje Relax', master), null);
assert.equal(api.resolve('Masaje Relax', master, [...catalog, { nombre: 'Masaje Relax', duracion: 60 }]), null);
assert.equal(api.resolve({ nombre: "Masaje Relax 30'", pax: 2 }, master), null);
assert.equal(api.resolve({ master_item_id: 'relax30', nombre: 'Nombre antiguo' }, master).id, 'relax30');
assert.equal(api.resolve("Masaje relax de canas de bambu -30'", master).id, 'bambu');
assert.equal(api.resolve("Masaje Relax 30'", [...master, { ...master[0], id: 'ambiguous' }]), null);
const packs = [{ nombre: 'PACK - Ritual completo', source: 'catalog_pack', secuencia: [{ nombre: master[3].name }] }];
const before = JSON.stringify({master, catalog});
assert.deepEqual(api.build(master, catalog, [], 'vip').map(i => i.masterItemId), ['relax30', 'pareja']);
assert.equal(api.build(master, catalog, [], 'vip')[0].precio, 32);
assert.equal(api.build(master, catalog, [], 'suite')[0].masterItemId, 'suite'); // Zero price does not imply pack-only.
assert.equal(api.build([{ id: 'test_pack_only', name: 'Solo Pack Item', allowedSpaces: ['vip'], sale_mode: 'solo_pack' }], [], [], 'vip').length, 0);
assert.equal(api.build([{ id: 'test_direct', name: 'Direct Item', allowedSpaces: ['vip'], sale_mode: 'directa' }], [], [], 'vip').length, 1);
assert.equal(api.build(master, catalog, packs, '').filter(i => i.source === 'catalog_pack').length, 1);
assert.equal(api.build(master, catalog, [], 'cabina2').length, 3);
const packMaster = { id: 'ritual', name: 'Ritual completo', allowedSpaces: ['vip'] };
const withPackMaster = api.build([...master, packMaster], catalog, packs, 'vip');
assert.equal(withPackMaster.filter(i => i.nombre.includes('Ritual completo')).length, 1);
assert.equal(withPackMaster.find(i => i.nombre.includes('Ritual completo')).secuencia.length, 1);
assert.equal(JSON.stringify({master, catalog}), before);
const { resolveServicePricing } = require('../js/service-pricing');
assert.equal(resolveServicePricing("Masaje Relax -30'", master, catalog).resolvedPrice, 32);
// Exercise the actual selectors, with stale/duplicate catalog entries and strict room assignments.
for (const file of ['reservas.html', 'reservas-salas.html', 'reservas-spa.html']) {
    const html = fs.readFileSync(require.resolve('../' + file), 'utf8');
    for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code);
    const select = { value: '', options: [], set innerHTML(v) { this.options = []; }, appendChild(o) { this.options.push(o); } };
    const room = { value: 'vip' };
    const context = vm.createContext({ console, currentServices: catalog, currentModule: { code: 'vip' },
        window: { masterItems: master, SpaServiceCatalog: api },
        document: { getElementById: id => ({'res-servicio': select, 'res-sala': room})[id], createElement: () => ({ dataset: {} }) },
        updatePriceAutomation() {}, syncServiceDuration() {} });
    vm.runInContext(html.slice(html.indexOf('        function populateServices()'), html.indexOf('        function showServiceDropdown()')), context);
    context.populateServices();
    assert.deepEqual(Array.from(select.options).filter(o => o.value).map(o => o.dataset.masterItemId).sort(), ['pareja', 'relax30'], file);
    select.value = "Masaje Relax -30'";
    context.populateServices();
    assert.equal(select.value, "Masaje Relax - 30'", file + ' restores legacy selection');
    room.value = 'cabina2';
    context.populateServices();
    assert.equal(select.options.filter(o => o.value && o.value.startsWith('Masaje Relax')).length, 2, file);
}
console.log('OK: aliases, durations, couples, master rooms/prices, packs, ambiguous names and all three selectors.');
