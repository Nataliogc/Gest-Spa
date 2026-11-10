const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { applyVoucherBookingContext } = require('../js/voucher-booking-context');
const agenda = fs.readFileSync(require.resolve('../agenda-salas.html'), 'utf8');
let url;
const ctx = vm.createContext({
    roomOpeningConfig: {}, roomClosureReason: () => '', toMin: () => 1035, SLOT_MIN: 15,
    currentDate: '2026-11-11', isSlotPast: () => false, encodeURIComponent,
    window: { currentVoucherBooking: { voucher: 'BON08119', client: 'genesis fernandez de marcos', service: "Masaje en pareja - 30'", pax: 2 } },
    openQuickForm: value => { url = value; }
});
vm.runInContext(agenda.slice(agenda.indexOf('function newBooking({'), agenda.indexOf('// === FORMULARIO DIRECTO')), ctx);
ctx.newBooking({ time: '17:15', room: 'vip' });
const params = new URL(url, 'https://example.org').searchParams;
assert.equal(params.get('voucher'), 'BON08119');
assert.equal(params.get('pax'), '2');
const fields = {};
for (const id of ['res-origen', 'res-bono', 'res-nombre', 'res-pax', 'res-sesiones', 'res-servicio-search', 'bono-saldo-notice']) fields[id] = { value: '', style: {} };
fields['res-servicio'] = { options: [], appendChild(option) { this.options.push(option); } };
const doc = { getElementById: id => fields[id], createElement: () => ({}) };
applyVoucherBookingContext(params, doc);
assert.equal(fields['res-origen'].value, 'bono');
assert.equal(fields['res-bono'].value, 'BON08119');
assert.equal(fields['res-nombre'].value, 'genesis fernandez de marcos');
assert.equal(fields['res-pax'].value, 2);
assert.equal(fields['res-sesiones'].value, 1);
assert.equal(fields['res-servicio'].value, "Masaje en pareja - 30'");
applyVoucherBookingContext(params, doc);
assert.equal(fields['res-servicio'].options.length, 1);
ctx.window.currentVoucherBooking = null;
ctx.newBooking({ time: '17:15', room: 'cabina2' });
const direct = new URL(url, 'https://example.org').searchParams;
assert.equal(direct.has('voucher'), false);
assert.equal(applyVoucherBookingContext(direct, doc), null);
const form = fs.readFileSync(require.resolve('../reservas-salas.html'), 'utf8');
for (const [, code] of form.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code);
const opening = form.slice(form.indexOf('window.openNewReservationFromUrl ='));
assert(opening.indexOf('applyVoucherBookingContext(urlParams, document)') > opening.indexOf('populateServices();'));
console.log('OK: planning → formulario conserva bono, cliente, tratamiento, PAX y sesión; reserva directa sin bono heredado.');
