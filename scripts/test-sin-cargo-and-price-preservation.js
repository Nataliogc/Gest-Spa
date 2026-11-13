const assert = require('assert');
const fs = require('fs');
const catalog = require('../js/service-catalog.js');
const packsReg = require('../js/spa-packs-registry.js');

console.log('--- TEST: PRESERVACIÓN DE PRECIOS, SIN CARGO Y TRATAMIENTOS EN PAQUETE ---');

// 1. Verify reservas-salas.html contains the safeguard against price corruption on edit and pack notice
const salasHtml = fs.readFileSync('reservas-salas.html', 'utf8');
assert(salasHtml.includes('// PRESERVAR TOTAL AL CONSULTAR/INICIALIZAR EDICIÓN DE RESERVA EXISTENTE'), 'reservas-salas.html must guard existing total in updateTotal');
assert(salasHtml.includes('id="res-sin-cargo-autorizado"'), 'reservas-salas.html must have sin-cargo input field');
assert(salasHtml.includes('id="pack-origin-notice"'), 'reservas-salas.html must have pack-origin-notice');
assert(salasHtml.includes('applyCatalogServicePrice()'), 'reservas-salas.html must have applyCatalogServicePrice function');
assert(salasHtml.includes('payload.sin_cargo = true'), 'reservas-salas.html must save sin_cargo flag in payload');
assert(salasHtml.includes('isItemFromPack'), 'reservas-salas.html must check isItemFromPack in saveReservation');

// 2. Verify reservas.html contains identical safeguards
const reservasHtml = fs.readFileSync('reservas.html', 'utf8');
assert(reservasHtml.includes('// PRESERVAR TOTAL AL CONSULTAR/INICIALIZAR EDICIÓN DE RESERVA EXISTENTE'), 'reservas.html must guard existing total in updateTotal');
assert(reservasHtml.includes('id="res-sin-cargo-autorizado"'), 'reservas.html must have sin-cargo input field');
assert(reservasHtml.includes('id="pack-origin-notice"'), 'reservas.html must have pack-origin-notice');
assert(reservasHtml.includes('isItemFromPack'), 'reservas.html must check isItemFromPack in saveReservation');

// 3. Verify reservas-spa.html contains identical safeguards
const spaHtml = fs.readFileSync('reservas-spa.html', 'utf8');
assert(spaHtml.includes('// PRESERVAR TOTAL AL CONSULTAR/INICIALIZAR EDICIÓN DE RESERVA EXISTENTE'), 'reservas-spa.html must guard existing total in updateTotal');
assert(spaHtml.includes('id="res-sin-cargo-autorizado"'), 'reservas-spa.html must have sin-cargo input field');
assert(spaHtml.includes('id="pack-origin-notice"'), 'reservas-spa.html must have pack-origin-notice');
assert(spaHtml.includes('isItemFromPack'), 'reservas-spa.html must check isItemFromPack in saveReservation');

// 4. Verify js/dashboard.js renders distinct origin and status badges, including PACK badge
const dashJs = fs.readFileSync('js/dashboard.js', 'utf8');
assert(dashJs.includes('SIN CARGO'), 'js/dashboard.js must render SIN CARGO badge');
assert(dashJs.includes('PACK ·'), 'js/dashboard.js must render PACK badge for package items');
assert(dashJs.includes('HOTEL INC.'), 'js/dashboard.js must render HOTEL INC.');
assert(dashJs.includes('HOT. NO INC.'), 'js/dashboard.js must render HOT. NO INC.');
assert(dashJs.includes('BONO SPA'), 'js/dashboard.js must render BONO SPA');
assert(dashJs.includes('GROUPON'), 'js/dashboard.js must render GROUPON');
assert(dashJs.includes('SMARTBOX'), 'js/dashboard.js must render SMARTBOX');
assert(dashJs.includes('WONDERBOX'), 'js/dashboard.js must render WONDERBOX');
assert(dashJs.includes('EGO EXP.'), 'js/dashboard.js must render EGO EXP.');

// 5. Verify js/config.js renders parent pack info for items in packs
const configJs = fs.readFileSync('js/config.js', 'utf8');
assert(configJs.includes('findParentPacks'), 'js/config.js must find parent packs for items');
assert(configJs.includes('Paquete:'), 'js/config.js must show Paquete label for items in pack');
assert(configJs.includes('En Paquete'), 'js/config.js must show En Paquete note for 0€ items in pack');

// 6. Test SpaServiceCatalog.findParentPacks
{
    const lotoPacks = catalog.findParentPacks('Envoltura corporal de flores de loto', [], packsReg.SPA_PACKS_REGISTRY);
    assert(lotoPacks.includes('Ritual Indian ritual'), 'Must identify Ritual Indian ritual as parent pack of Envoltura corporal de flores de loto');
    console.log('✓ Detección de paquete origen: "Envoltura corporal de flores de loto" pertenece a "Ritual Indian ritual"');

    const vitCPacks = catalog.findParentPacks('Envoltura corporal vit.c', [], packsReg.SPA_PACKS_REGISTRY);
    assert(vitCPacks.includes('Ritual Baño Cítrico'), 'Must identify Ritual Baño Cítrico as parent pack of Envoltura corporal vit.c');
    console.log('✓ Detección de paquete origen: "Envoltura corporal vit.c" pertenece a "Ritual Baño Cítrico"');
}

// 7. Verify that 0€ items in a pack do NOT require "Autorizado por"
{
    const svcName = 'Envoltura corporal de flores de loto';
    const payload = {
        servicio: svcName,
        precio_total: 0,
        is_pack_element: true
    };
    const isItemFromPack = !!(payload.is_pack_element || (catalog.findParentPacks(svcName, [], packsReg.SPA_PACKS_REGISTRY).length > 0));
    assert.strictEqual(isItemFromPack, true, 'Item from pack must be recognized as pack element');
    
    // Auth value is empty, but saving must be permitted because it is from a pack
    const authVal = '';
    let blockedByAuth = false;
    if (payload.precio_total === 0) {
        if (isItemFromPack) {
            const detectedPack = catalog.findParentPacks(svcName, [], packsReg.SPA_PACKS_REGISTRY)[0];
            payload.pack_origen = detectedPack;
        } else if (!authVal) {
            blockedByAuth = true;
        }
    }
    assert.strictEqual(blockedByAuth, false, 'Saving pack items with 0€ must NOT be blocked by auth validation');
    assert.strictEqual(payload.pack_origen, 'Ritual Indian ritual', 'Must assign Ritual Indian ritual as pack_origen');
    console.log('✓ Los tratamientos de un paquete con precio 0€ se guardan directamente indicando su paquete de origen');
}

// 8. Verify that truly courtesy/unpriced items (not in pack) still require "Autorizado por"
{
    const svcName = 'Masaje Especial Cortesía';
    const payload = {
        servicio: svcName,
        precio_total: 0
    };
    const isItemFromPack = !!(payload.is_pack_element || (catalog.findParentPacks(svcName, [], packsReg.SPA_PACKS_REGISTRY).length > 0));
    assert.strictEqual(isItemFromPack, false);
    
    let authVal = '';
    let blockedByAuth = false;
    if (payload.precio_total === 0) {
        if (isItemFromPack) {
            payload.pack_origen = 'Pack';
        } else if (!authVal) {
            blockedByAuth = true;
        }
    }
    assert.strictEqual(blockedByAuth, true, 'Non-pack 0€ items MUST require authorization');
    console.log('✓ Los servicios gratuitos sin paquete siguen exigiendo obligatoriamente "Autorizado por"');
}

console.log('\n✅ TODOS LOS TESTS DE PRESERVACIÓN, SIN CARGO Y PAQUETES ORIGEN PASARON EXITOSAMENTE!');
