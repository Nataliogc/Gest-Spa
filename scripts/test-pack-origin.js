const assert = require('assert');
const reg = require('../js/spa-packs-registry.js');
const SpaServiceCatalog = require('../js/service-catalog.js');

const mockCatalog = [
    {
        nombre: 'Ritual Indian ritual',
        precio: 110,
        items_incluidos: [
            'Peeling con sal rosa del himalaya',
            'Envoltura corporal de flores de loto',
            'Masaje relax de cañas de bambú - 30\'',
            'Baño en bañera de hidromasaje - 30\''
        ]
    }
];

const lotoPacks = SpaServiceCatalog.findParentPacks('Envoltura corporal de flores de loto', mockCatalog, reg.SPA_PACKS_REGISTRY);
console.log('Loto packs:', lotoPacks);
assert(lotoPacks.includes('Ritual Indian ritual'), 'Should find Ritual Indian ritual for loto');

const peelingPacks = SpaServiceCatalog.findParentPacks('Peeling con sal rosa del himalaya', mockCatalog, reg.SPA_PACKS_REGISTRY);
console.log('Peeling packs:', peelingPacks);
assert(peelingPacks.includes('Ritual Indian ritual'), 'Should find Ritual Indian ritual for peeling');

const bambuPacks = SpaServiceCatalog.findParentPacks("Masaje relax de cañas de bambú - 30'", mockCatalog, reg.SPA_PACKS_REGISTRY);
console.log('Bambu packs:', bambuPacks);
assert(bambuPacks.includes('Ritual Indian ritual'), 'Should find Ritual Indian ritual for bambu');

const vitCPacks = SpaServiceCatalog.findParentPacks('Envoltura corporal vit.c', mockCatalog, reg.SPA_PACKS_REGISTRY);
console.log('Vit C packs:', vitCPacks);
assert(vitCPacks.includes('Ritual Baño Cítrico'), 'Should find Ritual Baño Cítrico for vit C');

console.log('ALL PACK ORIGIN TESTS PASSED OK!');
