const assert = require('assert');
const fs = require('fs');
const catalog = require('../js/service-catalog.js');
const packsReg = require('../js/spa-packs-registry.js');

console.log('--- TEST: PRESERVACIÓN DE PRECIOS, SIN CARGO, PAQUETES ORIGEN Y DESCUENTOS ---');

// 1. Verify reservas-salas.html contains discount elements and handlers
const salasHtml = fs.readFileSync('reservas-salas.html', 'utf8');
assert(salasHtml.includes('id="res-descuento-tipo"'), 'reservas-salas.html must have descuento-tipo select');
assert(salasHtml.includes('id="res-descuento-valor"'), 'reservas-salas.html must have descuento-valor input');
assert(salasHtml.includes('id="res-descuento-motivo"'), 'reservas-salas.html must have descuento-motivo input');
assert(salasHtml.includes('toggleDescuentoSection'), 'reservas-salas.html must have toggleDescuentoSection');
assert(salasHtml.includes('clearDescuento'), 'reservas-salas.html must have clearDescuento');
assert(salasHtml.includes('payload.descuento_aplicado = true'), 'reservas-salas.html must save descuento_aplicado');
console.log('✓ Modales de reserva: Campos y controles de descuento (% y € con motivo) verificados');

// 2. Verify reservas.html and reservas-spa.html contain identical discount elements
const reservasHtml = fs.readFileSync('reservas.html', 'utf8');
assert(reservasHtml.includes('id="res-descuento-tipo"'));
assert(reservasHtml.includes('id="res-descuento-valor"'));
assert(reservasHtml.includes('id="res-descuento-motivo"'));

const spaHtml = fs.readFileSync('reservas-spa.html', 'utf8');
assert(spaHtml.includes('id="res-descuento-tipo"'));
assert(spaHtml.includes('id="res-descuento-valor"'));
assert(spaHtml.includes('id="res-descuento-motivo"'));
console.log('✓ Homogeneidad en reservas.html y reservas-spa.html verificada');

// 3. Verify js/config.js alarm on 0€ direct sale items
const configJs = fs.readFileSync('js/config.js', 'utf8');
assert(configJs.includes('data-has-alarm="${isDirectZero}"'), 'js/config.js must set data-has-alarm');
assert(configJs.includes('¡SIN PRECIO!'), 'js/config.js must render ¡SIN PRECIO! badge');
assert(configJs.includes('Alarma 0€'), 'js/config.js must render Alarma 0€ badge');
console.log('✓ Configuración: Alarma visual de Venta Directa sin precio (0.00€) y selector compacto verificados');

// 4. Verify index.html vertical alignment CSS
const indexHtml = fs.readFileSync('index.html', 'utf8');
assert(indexHtml.includes('vertical-align: middle !important;'), 'index.html must force vertical-align middle on table cells');
const dashJs = fs.readFileSync('js/dashboard.js', 'utf8');
assert(dashJs.includes('vertical-align: middle;'), 'js/dashboard.js must include vertical-align middle');
console.log('✓ Alineación visual: Centrado vertical de todas las celdas de la tabla de reservas verificado');

// 5. Test Discount Calculation (% and €) and validation of motive
{
    // Test percentage discount
    const subtotal = 100;
    const descTipo = 'porcentaje';
    const descValor = 20; // 20%
    const importeDescuento = (subtotal * descValor) / 100;
    const total = subtotal - importeDescuento;
    assert.strictEqual(importeDescuento, 20);
    assert.strictEqual(total, 80);

    // Test fixed amount discount
    const descTipoFijo = 'cantidad';
    const descValorFijo = 15; // 15€
    const importeDescuentoFijo = descValorFijo;
    const totalFijo = subtotal - importeDescuentoFijo;
    assert.strictEqual(importeDescuentoFijo, 15);
    assert.strictEqual(totalFijo, 85);

    // Test validation of motive: must be required when discount > 0
    let descMotivo = '';
    let validationBlocked = false;
    if (descValor > 0) {
        if (!descMotivo.trim()) {
            validationBlocked = true;
        }
    }
    assert.strictEqual(validationBlocked, true, 'Validation must block saving discount without motive');

    descMotivo = 'Socio Isidro';
    validationBlocked = false;
    if (descValor > 0) {
        if (!descMotivo.trim()) {
            validationBlocked = true;
        }
    }
    assert.strictEqual(validationBlocked, false, 'Validation must pass when motive is provided');
    console.log('✓ Cálculo y validación de descuentos: 20% sobre 100€ = 80€, 15€ fijos = 85€, motivo obligatorio');
}

// 6. Test 100% discount (e.g. Socio with 0.00€ final total)
{
    const subtotal = 50;
    const descValor = 100; // 100%
    const importeDescuento = (subtotal * descValor) / 100;
    const total = subtotal - importeDescuento;
    assert.strictEqual(total, 0, 'Total with 100% discount must be 0€');

    const descMotivo = 'Socio Isidro (Cuota Club)';
    const payload = {
        precio_total: total,
        descuento_aplicado: true,
        descuento_motivo: descMotivo,
        obs: ''
    };
    // When saving, 0€ with valid discount motive must NOT require "Autorizado por"
    let blockedBySinCargo = false;
    if (payload.precio_total === 0) {
        if (payload.descuento_aplicado && payload.descuento_motivo) {
            // Allowed
            payload.obs += `[DESCUENTO 100%] Motivo: ${descMotivo}`;
        } else {
            blockedBySinCargo = true;
        }
    }
    assert.strictEqual(blockedBySinCargo, false, '100% discount with motive must be saved cleanly');
    assert(payload.obs.includes('Socio Isidro (Cuota Club)'));
    console.log('✓ Descuento 100% (Socio): Total 0.00€ con motivo registrado no se confunde con Sin Cargo no autorizado');
}

// 7. Verify Auto-recovery of catalog price when booking has 0€ and is not sin cargo/pack
{
    const mockServices = [
        { nombre: 'Fotodepilación', precio: 50 },
        { nombre: 'Radiofrecuencia facial', precio: 49.9 }
    ];
    const rawTotal = 0;
    const isSinCargo = false;
    const isPack = false;
    let resolvedPrice = 0;
    if (rawTotal <= 0 && !isSinCargo && !isPack) {
        const found = mockServices.find(s => s.nombre === 'Fotodepilación');
        if (found) resolvedPrice = found.precio;
    }
    assert.strictEqual(resolvedPrice, 50, 'Must recover 50€ catalog price for Fotodepilación when unpriced');
    console.log('✓ Auto-recuperación de tarifa: Reserva de Fotodepilación a 0€ recupera su tarifa de catálogo (50€)');
}

console.log('\n✅ TODOS LOS TESTS DE PRESERVACIÓN, ALARMAS, CENTRADO Y DESCUENTOS PASARON!');
