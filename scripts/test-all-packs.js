const assert = require('node:assert/strict');
const path = require('node:path');

// Cargar módulos
const packRegistry = require('../js/spa-packs-registry.js');
const servicePricing = require('../js/service-pricing.js');

console.log('--- TEST: REGISTRO DE PACKS Y PRECIOS ---');

const packs = packRegistry.SPA_PACKS_REGISTRY;
const packKeys = Object.keys(packs);
console.log(`Verificando los ${packKeys.length} packs estándar del sistema:`);

assert.equal(packKeys.length, 18, 'Debe haber 18 packs registrados');

// 1. Verificar cada pack del registro
packKeys.forEach(key => {
    const p = packs[key];
    assert.ok(p.nombre, `Pack ${key} debe tener nombre`);
    assert.ok(p.pax >= 1, `Pack ${p.nombre} debe tener pax válido`);
    assert.ok(p.precio_defecto > 0, `Pack ${p.nombre} debe tener precio por defecto > 0`);
    assert.ok(Array.isArray(p.secuencia) && p.secuencia.length > 0, `Pack ${p.nombre} debe tener secuencia`);
    
    // Verificar fases
    p.secuencia.forEach((f, idx) => {
        assert.ok(f.nombre, `Fase ${idx} de ${p.nombre} debe tener nombre`);
        assert.ok(f.espacio, `Fase ${idx} de ${p.nombre} debe tener espacio`);
        assert.ok(f.duracion > 0, `Fase ${idx} de ${p.nombre} debe tener duracion > 0`);
    });

    // Test de detección
    assert.ok(packRegistry.isPackService(p.nombre), `isPackService debe detectar "${p.nombre}"`);
    assert.ok(packRegistry.isPackService(`PACK - ${p.nombre}`), `isPackService debe detectar "PACK - ${p.nombre}"`);

    // Test de obtención de datos completos
    const full = packRegistry.getPackFullData(p.nombre);
    assert.ok(full, `getPackFullData debe resolver "${p.nombre}"`);
    assert.equal(full.isPack, true);
    assert.equal(full.pax, p.pax);
    assert.equal(full.precio, p.precio_defecto);
    assert.equal(full.secuencia.length, p.secuencia.length);

    // Test con prefijo "PACK - "
    const fullPrefixed = packRegistry.getPackFullData(`PACK - ${p.nombre}`);
    assert.ok(fullPrefixed, `getPackFullData debe resolver "PACK - ${p.nombre}"`);
    assert.equal(fullPrefixed.secuencia.length, p.secuencia.length);

    console.log(`  ✓ ${p.nombre} [${p.pax} pax, ${p.precio_defecto}€, ${p.secuencia.length} fases] OK`);
});

// 2. Probar caso específico de usuario: "PACK - Cuento para dos"
console.log('\n--- TEST ESPECÍFICO: PACK - Cuento para dos ---');
const cuentoData = packRegistry.getPackFullData('PACK - Cuento para dos');
assert.ok(cuentoData, 'Debe resolver Cuento para dos');
assert.equal(cuentoData.pax, 2, 'Cuento para dos debe ser para 2 pax');
assert.equal(cuentoData.includes_restaurant, true, 'Cuento para dos incluye restaurante');
assert.equal(cuentoData.secuencia.length, 2, 'Cuento para dos tiene 2 fases (Spa + Masaje)');
assert.equal(cuentoData.secuencia[0].nombre, 'Circuito Spa');
assert.equal(cuentoData.secuencia[0].duracion, 60);
assert.equal(cuentoData.secuencia[1].nombre, 'Masaje Cráneo-Facial');
assert.equal(cuentoData.secuencia[1].duracion, 30);
assert.equal(cuentoData.secuencia[1].terapeutas, 2);
console.log('  ✓ Secuencia de Cuento para dos verificada con éxito');

// 3. Probar resolveServicePricing con "PACK - Cuento para dos"
const pricingResult = servicePricing.resolveServicePricing('PACK - Cuento para dos', [], []);
assert.ok(pricingResult, 'resolveServicePricing debe resolver el precio');
assert.ok(pricingResult.resolvedPrice > 0, `Precio debe ser > 0, obtenido: ${pricingResult.resolvedPrice}`);
assert.equal(pricingResult.pax, 2);
assert.equal(pricingResult.isPack, true);
console.log(`  ✓ Tarifa resuelta: ${pricingResult.resolvedPrice} € para ${pricingResult.pax} pax`);

console.log('\n✅ TODOS LOS TESTS DE PACKS PASARON EXITOSAMENTE!');
