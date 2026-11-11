const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require.resolve('../reservas-salas.html'), 'utf8');
for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code);
function select() {
    return { options: [], value: '', appendChild(option) { this.options.push(option); },
        set innerHTML(value) { this.options = []; } };
}
const rooms = select(), services = select();
const modules = {
    cabina1: { name: 'CHON' }, cabina2: { name: 'MAR' }, cabina3: { name: 'MARI' },
    vip: { name: 'SALA VIP' }, vip_copy: { name: ' Sala   VIP ' },
    peluqueria: { name: 'PELUQUERÍA' }, hair: { name: 'PELUQUERIA' }
};
const ctx = vm.createContext({ URLSearchParams, console, currentModule: { code: 'cabinas' },
    currentServices: [], window: { SpaServiceCatalog: require('../js/service-catalog'), MODULES: modules, location: { search: '?action=new' },
        masterItems: [{ name: 'Masaje de prueba', space: 'cabina', duration: 0, price_pax: 35, pax: 1 }] },
    document: { getElementById: id => ({ 'res-sala': rooms, 'res-servicio': services })[id] || null,
        createElement: () => ({ dataset: {} }) }, updatePriceAutomation() {}, syncServiceDuration() {}
});
vm.runInContext(html.slice(html.indexOf('function populateRoomOptions('), html.indexOf('function showServiceDropdown(')), ctx);
ctx.populateRoomOptions('');
assert.equal(rooms.options.length, 8); // Blanco + siete salas, sin duplicados.
assert.equal(rooms.options.filter(o => o.textContent === 'SALA VIP').length, 1);
ctx.populateRoomOptions('vip_copy');
assert.equal(rooms.value, 'vip_copy'); // Conserva el código de una reserva existente.
assert.equal(rooms.options.length, 8);
rooms.value = 'cabina2';
ctx.populateServices();
assert.ok(services.options.some(o => o.value === 'Masaje de prueba'));
assert.ok(ctx.window._allServiceOptions.some(o => o.value === 'Masaje de prueba'));
assert(!html.includes('}, 150);')); // No hay apertura anticipada independiente de la carga.
const init = html.slice(html.indexOf('await Promise.all([', html.indexOf('const initialDate =')), html.indexOf('// Manejar nueva reserva directa desde URL'));
assert(init.includes('loadMasterItems()') && init.includes('fetchBasePrice()'));
console.log('OK: salas únicas, código existente preservado, servicios de MAR y duración cero, apertura tras carga.');
