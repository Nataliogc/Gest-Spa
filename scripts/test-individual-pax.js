const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/service-catalog');
const { getPackFullData } = require('../js/spa-packs-registry');
const { resolveServicePricing } = require('../js/service-pricing');
const name = "Masaje Relax - 60'";
const master = [{ id: 'relax60', name, pax_max: 1, duration: 60, price_pax: 52 }];
const catalog = [{ nombre: name, pax: 2, precio: 52 }];
assert.equal(getPackFullData(name, catalog, master), null);
const data = resolveServicePricing(name, master, catalog);
assert.equal(data.pax, 1);
assert.equal(data.pax_max, 1);
assert.equal(data.isPack, false);
assert.equal(data.resolvedPrice, 52);
for (const file of ['reservas.html', 'reservas-salas.html', 'reservas-spa.html']) {
    const html = fs.readFileSync(require.resolve('../' + file), 'utf8');
    for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code);
    const start = html.indexOf('            const catalogPax =');
    const end = html.indexOf('            if (isFixedPricing) {', start);
    const code = html.slice(start, end) + '\nresult = isFixedPricing;';
    const ctx = vm.createContext({serviceData: data, currentModule: {code: 'cabinas'}, paxInput: {value: 2}});
    vm.runInContext(code, ctx);
    assert.equal(ctx.result, false, file + ': individual is editable');
    assert.equal(ctx.paxInput.value, 1, file + ': stale 2 is reset to 1');
    ctx.serviceData = {pax: 2, isPack: true};
    vm.runInNewContext(code, {serviceData: ctx.serviceData, currentModule: {code: 'cabinas'}, paxInput: {value: 2}});
}
console.log('OK: real registry does not classify individual Relax as a pack; master PAX wins; all forms reset 2 to editable 1.');
