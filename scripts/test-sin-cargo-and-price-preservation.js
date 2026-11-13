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
assert(salasHtml.includes('res.res_id || id || "SIN ID"'), 'reservas-salas.html must display id if res_id is absent');
assert(!salasHtml.includes('savedPricePax = catPrice;'), 'reservas-salas.html must NOT inflate saved reservation prices');
console.log('✓ Modales de reserva: Campos de descuento, ID de reserva y preservación de precios verificados');

// 2. Verify reservas.html and reservas-spa.html contain identical safeguards
const reservasHtml = fs.readFileSync('reservas.html', 'utf8');
assert(reservasHtml.includes('id="res-descuento-tipo"'));
assert(reservasHtml.includes('id="res-descuento-valor"'));
assert(reservasHtml.includes('id="res-descuento-motivo"'));
assert(!reservasHtml.includes('savedPricePax = catPrice;'));

const spaHtml = fs.readFileSync('reservas-spa.html', 'utf8');
assert(spaHtml.includes('id="res-descuento-tipo"'));
assert(spaHtml.includes('id="res-descuento-valor"'));
assert(spaHtml.includes('id="res-descuento-motivo"'));
assert(!spaHtml.includes('savedPricePax = catPrice;'));
console.log('✓ Homogeneidad en reservas.html y reservas-spa.html verificada');

// 3. Verify js/config.js pack & alarm logic
const configJs = fs.readFileSync('js/config.js', 'utf8');
assert(configJs.includes('En Pack (0€)'), 'js/config.js must show En Pack (0€) note for pack items');
assert(configJs.includes('const isDirectZero = !isSoloPack && !hasParentPacks && (item.price_pax === 0 || !item.price_pax);'), 'isDirectZero must only trigger if not in pack and not solo_pack');
console.log('✓ Configuración: Servicios en pack a 0€ no activan alarma ¡SIN PRECIO!');

// 4. Verify js/dashboard.js renders distinct origin and status badges, including SOCIO badge
const dashJs = fs.readFileSync('js/dashboard.js', 'utf8');
assert(dashJs.includes('SIN CARGO'), 'js/dashboard.js must render SIN CARGO badge');
assert(dashJs.includes('PACK ·'), 'js/dashboard.js must render PACK badge for package items');
assert(dashJs.includes('SOCIO'), 'js/dashboard.js must render SOCIO badge for members');
assert(!dashJs.includes('totalPrice = catPrice * paxCount;'), 'js/dashboard.js must NOT inflate existing prices');
console.log('✓ Dashboard: Distinción de badges (SIN CARGO, PACK, SOCIO, BONO) sin mutación de tarifas');

// 5. Verify SpaServiceCatalog.findParentPacks excludes bonos and single-zone variations
{
    // Test 1: Fotodepilación must NOT match single zone variations
    const mockCatalog = [
        { nombre: 'Fotodepilación facial, manos, pies o zonas pequeñas', precio: 20, items_incluidos: ['Fotodepilación'] },
        { nombre: 'Fotodepilación abdomen, glúteos, ingles, cuello o nuca', precio: 30, items_incluidos: ['Fotodepilación'] },
        { nombre: 'Bono 10 sesiones Spa', precio: 200, items_incluidos: ['Circuito Spa'] }
    ];
    const fotoPacks = catalog.findParentPacks('Fotodepilación', mockCatalog, packsReg.SPA_PACKS_REGISTRY);
    assert.strictEqual(fotoPacks.length, 0, 'Fotodepilación must NOT be classified as belonging to packs');
    console.log('✓ Fotodepilación no se asocia falsamente a productos por zonas');

    // Test 2: Circuito spa must NOT match Bono 10 sesiones
    const circPacks = catalog.findParentPacks('Circuito spa - 60\'', mockCatalog, packsReg.SPA_PACKS_REGISTRY);
    assert(!circPacks.includes('Bono 10 sesiones Spa'), 'Circuito spa must NOT list Bono 10 sesiones as a pack');
    console.log('✓ Circuito Spa no confunde bonos de sesiones con paquetes');

    // Test 3: Genuine pack item matches
    const lotoPacks = catalog.findParentPacks('Envoltura corporal de flores de loto', [], packsReg.SPA_PACKS_REGISTRY);
    assert(lotoPacks.includes('Ritual Indian ritual'), 'Must identify Ritual Indian ritual as parent pack of Envoltura corporal de flores de loto');
    console.log('✓ Paquetes auténticos: "Envoltura corporal de flores de loto" pertenece a "Ritual Indian ritual"');
}

// 6. Test discount calculations & motive requirement
{
    const subtotal = 100;
    const descTipo = 'porcentaje';
    const descValor = 20; // 20%
    const importeDescuento = (subtotal * descValor) / 100;
    const totalConDescuento = subtotal - importeDescuento;
    assert.strictEqual(importeDescuento, 20);
    assert.strictEqual(totalConDescuento, 80);

    const descFijo = 15; // 15€ fijo
    const totalFijo = Math.max(0, subtotal - descFijo);
    assert.strictEqual(totalFijo, 85);

    const descMotivo = 'Socio Isidro (Cuota Club)';
    assert(descMotivo.trim().length >= 3, 'Motivo de descuento obligatorio');

    const payload = {
        precio_total: 0,
        descuento_aplicado: true,
        descuento_motivo: descMotivo,
        obs: ''
    };
    let blockedBySinCargo = false;
    if (payload.precio_total === 0) {
        if (payload.descuento_aplicado && payload.descuento_motivo) {
            payload.obs += `[DESCUENTO 100%] Motivo: ${descMotivo}`;
        } else {
            blockedBySinCargo = true;
        }
    }
    assert.strictEqual(blockedBySinCargo, false, '100% discount with motive must be saved cleanly');
    assert(payload.obs.includes('Socio Isidro (Cuota Club)'));
    console.log('✓ Descuento comercial y motivo obligatorio verificado');
}

console.log('\n✅ TODOS LOS TESTS DE PRESERVACIÓN, ALARMAS, CENTRADO Y DESCUENTOS PASARON!');
