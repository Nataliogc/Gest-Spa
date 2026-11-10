const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { roomClosureReason } = require('../js/room-opening');
const date = '2026-11-15'; // Domingo de la incidencia.
const config = { hours: { schedule: { sunday: { enabled: true, shifts: [{ start: '10:00', end: '14:00' }] } } } };
assert.equal(roomClosureReason(date, 825, 15, config), '');
assert.ok(roomClosureReason(date, 840, 15, config));
assert.ok(roomClosureReason(date, 825, 30, config));
assert.ok(roomClosureReason(date, 600, 15, { hours: { sunday: { enabled: false } } }));
assert.ok(roomClosureReason(date, 900, 15, {}));
assert.equal(roomClosureReason(date, 885, 15, {}), '');
assert.equal(roomClosureReason(date, 600, 15, { closedDates: [{ date, reason: 'Mantenimiento' }] }), 'Mantenimiento');
assert.ok(roomClosureReason(date, 600, 15, { closedDates: [date] }));
assert.ok(roomClosureReason(date, 840, 15, { hours: { sunday: { enabled: true, shifts: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }] } } }));

// Ejecutar el render real con datos de prueba, sin conexión a Firebase.
const html = fs.readFileSync(require.resolve('../agenda-salas.html'), 'utf8');
for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code);
const render = html.slice(html.indexOf('function renderRooms('), html.indexOf('// ---------- TERAPEUTAS'));
const elements = { 'grid-salas': {}, 'stats-salas': {} };
let cells;
const ctx = vm.createContext({
    window: {},
    ROOMS: [{ code: 'suite', name: 'Suite', capacity: 2 }], TIME_SLOTS: [825, 840, 855], SLOT_MIN: 15,
    currentDate: date, roomOpeningConfig: config, roomClosureReason,
    roomCodeOf: b => b.room, isBlock: b => !!b.isBlock, bStart: b => b.start, bEnd: b => b.end,
    isSlotPast: () => false, todayISO: () => '2026-11-10', nowMinutes: () => 600,
    esc: String, toHHMM: String, tableHead: () => '', getServiceColor: () => '#000',
    buildCells: states => { cells = states; return ''; }, document: { getElementById: id => elements[id] }
});
vm.runInContext(render, ctx);
ctx.renderRooms([]);
assert.equal(cells[0].cls, 'c-free');
assert.equal(cells[1].cls, 'c-block');
assert.equal(cells[1].onclick, undefined);
assert.ok(elements['stats-salas'].innerHTML.includes('0.3 h libres'));
ctx.renderRooms([{ id: 'existing', room: 'suite', start: 840, end: 870 }]);
assert.equal(cells[1].cls, 'c-booked'); // Las reservas existentes siguen accesibles.
assert.ok(cells[1].onclick.endsWith('null)')); // Sin ofrecer plazas durante el cierre.
ctx.renderRooms([{ id: 'block', room: 'suite', start: 830, end: 835, isBlock: true }]);
assert.equal(cells[0].cls, 'c-block'); // Bloqueo parcial dentro de una celda.
assert.ok(elements['stats-salas'].innerHTML.includes('0 h libres'));
console.log('OK: domingo, cierres completos, horario partido, límites, bloqueos parciales, reservas existentes y horas libres.');
