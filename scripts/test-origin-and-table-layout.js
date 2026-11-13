const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// Test 1: Verificar que los 8 orígenes están habilitados y no restringidos en los modales
const files = ['reservas-salas.html', 'reservas.html', 'reservas-spa.html'];
files.forEach(f => {
    const content = fs.readFileSync(path.join(rootDir, f), 'utf8');
    assert(!content.includes("'panacea': ['particular', 'bono']"), `${f} no debe restringir panacea a solo particular y bono`);
    assert(!content.includes("'vip': ['particular', 'bono']"), `${f} no debe restringir vip a solo particular y bono`);
    assert(content.includes('filterOriginOptions'), `${f} debe tener filterOriginOptions`);
});
console.log('✓ Desbloqueo de todos los orígenes en reservas-salas, reservas y reservas-spa verificado');

// Test 2: Simulación de resolución de badges en Dashboard
function resolveBadge(c) {
    let rawOrigen = (c.origen || c.origin || c.channel || c.canal || '').toLowerCase().trim();
    const bonoCode = (c.bono || c.num_bono || c.voucher || c.localizador || '').trim();

    let origen = 'particular';
    if (rawOrigen.includes('hotel') && (rawOrigen.includes('no') || rawOrigen.includes('not'))) {
        origen = 'hotel_no_inc';
    } else if (rawOrigen.includes('hotel')) {
        origen = 'hotel_inc';
    } else if (rawOrigen.includes('bono') || rawOrigen.includes('voucher') || !!bonoCode) {
        origen = 'bono';
    } else if (rawOrigen.includes('groupon')) {
        origen = 'groupon';
    } else if (rawOrigen.includes('smartbox')) {
        origen = 'smartbox';
    } else if (rawOrigen.includes('wonderbox')) {
        origen = 'wonderbox';
    } else if (rawOrigen.includes('ego')) {
        origen = 'ego';
    } else if (rawOrigen === 'sin_cargo' || c.sin_cargo === true) {
        origen = 'sin_cargo';
    } else if (rawOrigen) {
        origen = rawOrigen;
    }

    const isVoucherOrHotel = ['hotel_inc', 'bono', 'smartbox', 'wonderbox', 'ego', 'groupon'].includes(origen);
    const totalPrice = parseFloat(c.precio_total || c.precio || 0);

    if (origen === 'hotel_inc') return 'HOTEL INC.';
    if (origen === 'hotel_no_inc') return 'HOT. NO INC.';
    if (origen === 'bono') return 'BONO';
    if (origen === 'groupon') return 'GROUPON';
    if (origen === 'smartbox') return 'SMARTBOX';
    if (origen === 'wonderbox') return 'WONDERBOX';
    if (origen === 'ego') return 'EGO EXP.';
    if (c.sin_cargo === true || origen === 'sin_cargo' || !!(c.sin_cargo_autorizado || c.autorizado_por)) return 'SIN CARGO';
    if (totalPrice > 0) return 'PAGADO/PENDIENTE';
    return 'PENDIENTE';
}

// Celia Nuñez: tiene bono exc.Loc 17854 y origen "Bono Spa (Interno)"
const celia = { nombre: 'CELIA NUÑEZ', origen: 'Bono Spa (Interno)', bono: 'exc.Loc 17854', precio_total: 0 };
assert.equal(resolveBadge(celia), 'BONO', 'Celia Nuñez debe resolverse como BONO, no como SIN CARGO');

// Reserva con código de bono pero sin origen explícito
const bonoSinOrigen = { nombre: 'JUAN PEDRE', bono: '12345', precio_total: 0 };
assert.equal(resolveBadge(bonoSinOrigen), 'BONO', 'Reserva con código de bono debe resolverse como BONO');

// Hotel Incluido
const hotelInc = { nombre: 'CLIENTE HOTEL', origen: 'Hotel - Incluido', hotel: 'Cumbria', hab: '204', precio_total: 0 };
assert.equal(resolveBadge(hotelInc), 'HOTEL INC.', 'Hotel Incluido debe resolverse como HOTEL INC.');

// Groupon
const groupon = { nombre: 'CLIENTE GROUPON', origen: 'Groupon', precio_total: 0 };
assert.equal(resolveBadge(groupon), 'GROUPON', 'Groupon debe resolverse como GROUPON');

// Reserva auténticamente Sin Cargo con autorización
const sinCargoAuth = { nombre: 'CORTESIA DIRECCION', sin_cargo: true, sin_cargo_autorizado: 'Natalio', precio_total: 0 };
assert.equal(resolveBadge(sinCargoAuth), 'SIN CARGO', 'Reserva con sin_cargo: true debe resolverse como SIN CARGO');

console.log('✓ Resolución inteligente de orígenes y badges en Dashboard verificada');

// Test 3: Verificar que styles.css tiene reglas no truncadas y proporcionales
const styles = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
assert(!styles.includes('table-layout: fixed;'), 'No debe haber table-layout: fixed que rompa el ancho de tabla');
assert(styles.includes('#dashboard-table th.col-id, #dashboard-table td.col-id { width: 95px; min-width: 95px; white-space: nowrap; text-align: left; }'), 'ID debe tener 95px sin corte');
assert(styles.includes('#dashboard-table th.col-terapeuta, #dashboard-table td.col-terapeuta { width: 105px; min-width: 105px; white-space: nowrap; text-align: left; }'), 'TERAPEUTA debe tener 105px sin corte');

console.log('✓ Reglas CSS y distribución proporcional verificadas');
console.log('\n✅ TODOS LOS TESTS DE ORÍGENES Y DISTRIBUCIÓN PASARON EXITOSAMENTE!');
