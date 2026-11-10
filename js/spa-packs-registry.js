/**
 * spa-packs-registry.js
 * Registro Unificado de Packs, Secuencias y Tratamientos Multicabina
 * Cumbia Spa & Hotel Guadiana
 */

(function (root) {
    'use strict';

    function normalizePackName(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/^pack\s*[-–—:]\s*/i, '')
            .replace(/[’′]/g, "'")
            .replace(/[–—]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const SPA_PACKS_REGISTRY = {
        // === PACKS PAREJA (2 PAX) ===
        'wc-6475': {
            id: 'wc-6475',
            nombre: 'Relax Oriental',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 100.00,
            secuencia: [
                { orden: 1, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 30, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'suite', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6477': {
            id: 'wc-6477',
            nombre: 'Encuentro Romántico',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 130.00,
            secuencia: [
                { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'suite', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6479': {
            id: 'wc-6479',
            nombre: 'Especial Parejas',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 150.00,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 },
                { orden: 3, nombre: 'Envoltura corporal con masaje cráneo-facial', espacio: 'panacea', duracion: 60, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6481': {
            id: 'wc-6481',
            nombre: 'Sueño para dos',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 140.00,
            includes_hotel: true,
            includes_restaurant: true,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6483': {
            id: 'wc-6483',
            nombre: 'Fantasía para dos',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 165.00,
            includes_hotel: true,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6485': {
            id: 'wc-6485',
            nombre: 'Aventura para dos',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 190.00,
            includes_hotel: true,
            includes_cava: true,
            secuencia: [
                { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6487': {
            id: 'wc-6487',
            nombre: 'Tiempo para dos',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 135.00,
            includes_restaurant: true,
            secuencia: [
                { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6489': {
            id: 'wc-6489',
            nombre: 'Cuento para dos',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 135.00,
            includes_restaurant: true,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Cráneo-Facial', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6529': {
            id: 'wc-6529',
            nombre: 'Masaje en Pareja',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 110.00,
            secuencia: [
                { orden: 1, nombre: 'Masaje Pareja', espacio: 'suite', duracion: 60, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6905': {
            id: 'wc-6905',
            nombre: 'Experiencia SPA en pareja',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 100.00,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Pareja', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },
        'wc-6906': {
            id: 'wc-6906',
            nombre: 'SPA y Sabores',
            pax: 2,
            modalidad: 'pareja',
            categoria: 'pack',
            precio_defecto: 90.00,
            includes_restaurant: true,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        },

        // === RITUALES (INDIVIDUAL / 1 PAX) ===
        'wc-6495': {
            id: 'wc-6495',
            nombre: 'Ritual Indian ritual',
            pax: 1,
            modalidad: 'individual',
            categoria: 'ritual',
            precio_defecto: 110.00,
            duracion_real: 120,
            duracion_comercial: 100,
            secuencia: [
                { orden: 1, nombre: 'Peeling con sal rosa del himalaya', espacio: 'panacea', duracion: 20, requires_therapist: true, terapeutas: 1 },
                { orden: 2, nombre: 'Envoltura corporal de flores de loto', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
                { orden: 3, nombre: 'Masaje relax de cañas de bambú', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
                { orden: 4, nombre: 'Baño en bañera de hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6497': {
            id: 'wc-6497',
            nombre: 'Ritual Baño Cítrico',
            pax: 1,
            modalidad: 'individual',
            categoria: 'ritual',
            precio_defecto: 120.00,
            duracion_real: 120,
            duracion_comercial: 90,
            secuencia: [
                { orden: 1, nombre: 'Peeling Corporal', espacio: 'panacea', duracion: 15, requires_therapist: true, terapeutas: 1 },
                { orden: 2, nombre: 'Envoltura corporal vit.c', espacio: 'panacea', duracion: 25, requires_therapist: true, terapeutas: 1 },
                { orden: 3, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
                { orden: 4, nombre: 'Baño en bañera de hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6501': {
            id: 'wc-6501',
            nombre: 'Ritual Chocolaterapia',
            pax: 1,
            modalidad: 'individual',
            categoria: 'ritual',
            precio_defecto: 110.00,
            duracion_real: 120,
            duracion_comercial: 90,
            secuencia: [
                { orden: 1, nombre: 'Peeling Corporal', espacio: 'panacea', duracion: 15, requires_therapist: true, terapeutas: 1 },
                { orden: 2, nombre: 'Envoltura corporal chocolate', espacio: 'panacea', duracion: 25, requires_therapist: true, terapeutas: 1 },
                { orden: 3, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
                { orden: 4, nombre: 'Baño en bañera de hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
            ]
        },

        // === PACKS INDIVIDUALES ===
        'wc-6942': {
            id: 'wc-6942',
            nombre: 'Experiencia SPA',
            pax: 1,
            modalidad: 'individual',
            categoria: 'pack',
            precio_defecto: 55.00,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'cabina', duracion: 30, requires_therapist: true, terapeutas: 1 }
            ]
        },
        'wc-6943': {
            id: 'wc-6943',
            nombre: 'SPA y Sabores - Individual',
            pax: 1,
            modalidad: 'individual',
            categoria: 'pack',
            precio_defecto: 50.00,
            includes_restaurant: true,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        },
        'wc-6944': {
            id: 'wc-6944',
            nombre: 'Relax Oriental - Individual',
            pax: 1,
            modalidad: 'individual',
            categoria: 'pack',
            precio_defecto: 60.00,
            secuencia: [
                { orden: 1, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 30, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Relax', espacio: 'cabina', duracion: 30, requires_therapist: true, terapeutas: 1 }
            ]
        },
        'wc-7305': {
            id: 'wc-7305',
            nombre: 'Ritual Amazonian Discovery',
            pax: 1,
            modalidad: 'individual',
            categoria: 'ritual',
            precio_defecto: 85.00,
            duracion_real: 90,
            duracion_comercial: 90,
            secuencia: [
                { orden: 1, nombre: 'Facial Completo', espacio: 'cabina', duracion: 45, requires_therapist: true, terapeutas: 1 },
                { orden: 2, nombre: 'Corporal Hidratante', espacio: 'cabina', duracion: 45, requires_therapist: true, terapeutas: 1 }
            ]
        }
    };

    /**
     * Busca la definición de un pack por nombre o id.
     */
    function findPackDefinition(nameOrId) {
        if (!nameOrId) return null;
        const norm = normalizePackName(nameOrId);
        const raw = String(nameOrId).trim().toLowerCase();

        // 1. Coincidencia directa por ID
        if (SPA_PACKS_REGISTRY[nameOrId]) return SPA_PACKS_REGISTRY[nameOrId];
        if (SPA_PACKS_REGISTRY[`wc-${nameOrId}`]) return SPA_PACKS_REGISTRY[`wc-${nameOrId}`];

        // 2. Coincidencia EXACTA por nombre normalizado (prioritaria sobre parciales)
        for (const key of Object.keys(SPA_PACKS_REGISTRY)) {
            const pack = SPA_PACKS_REGISTRY[key];
            const packNorm = normalizePackName(pack.nombre);
            if (norm === packNorm || raw === pack.nombre.toLowerCase()) {
                return pack;
            }
        }

        // 3. Coincidencia parcial secundaria (solo si no hubo coincidencia exacta)
        for (const key of Object.keys(SPA_PACKS_REGISTRY)) {
            const pack = SPA_PACKS_REGISTRY[key];
            const packNorm = normalizePackName(pack.nombre);
            if (norm.length > 5 && packNorm.length > 5 && (norm.includes(packNorm) || packNorm.includes(norm))) {
                return pack;
            }
        }

        return null;
    }

    /**
     * Determina si un servicio o nombre es un pack.
     */
    function isPackService(name, serviceObj = null) {
        if (findPackDefinition(name)) return true;
        if (serviceObj) {
            if (serviceObj.id && findPackDefinition(serviceObj.id)) return true;
            if (serviceObj.nombre && findPackDefinition(serviceObj.nombre)) return true;
            if (serviceObj.secuencia && Array.isArray(serviceObj.secuencia) && serviceObj.secuencia.length > 0) return true;
            if (serviceObj.items_incluidos && Array.isArray(serviceObj.items_incluidos) && serviceObj.items_incluidos.length > 1) return true;
            if (serviceObj.desglosados && Array.isArray(serviceObj.desglosados) && serviceObj.desglosados.length > 1) return true;
            const cat = (serviceObj.categoria || serviceObj.category || '').toLowerCase();
            if (cat.includes('pack')) return true;
        }
        const norm = normalizePackName(name);
        return norm.startsWith('pack') || String(name || '').toLowerCase().includes('pack');
    }

    /**
     * Obtiene los datos consolidados de un pack (secuencia, items, duraciones, salas y precio).
     */
    function getPackFullData(nameOrId, catalogServices = [], masterItems = []) {
        if (!nameOrId) return null;

        const regPack = findPackDefinition(nameOrId);
        const norm = normalizePackName(nameOrId);

        // Buscar coincidencia en catálogo Firestore spa_services
        const catalogMatch = (catalogServices || []).find(s => {
            const sName = normalizePackName(s.nombre || s.name);
            return sName === norm || (regPack && sName === normalizePackName(regPack.nombre));
        }) || null;

        // Buscar coincidencia en master items
        const masterMatch = (masterItems || []).find(m => {
            const mName = normalizePackName(m.name || m.nombre);
            return mName === norm || (regPack && mName === normalizePackName(regPack.nombre));
        }) || null;

        const isPack = !!regPack || isPackService(nameOrId, catalogMatch || masterMatch);
        if (!isPack && !catalogMatch && !masterMatch) return null;

        // Construir secuencia de fases
        let secuencia = [];
        if (regPack && Array.isArray(regPack.secuencia) && regPack.secuencia.length > 0) {
            secuencia = regPack.secuencia.map(f => ({ ...f }));
        } else if (catalogMatch && Array.isArray(catalogMatch.secuencia) && catalogMatch.secuencia.length > 0) {
            secuencia = catalogMatch.secuencia.map(f => ({ ...f }));
        } else {
            // Intentar extraer de items_incluidos o desglosados
            const items = catalogMatch?.items_incluidos || catalogMatch?.desglosados || masterMatch?.items_incluidos || [];
            if (Array.isArray(items) && items.length > 0) {
                secuencia = items.map((it, idx) => {
                    const itemName = typeof it === 'string' ? it.trim() : (it.nombre || it.name || `Servicio ${idx + 1}`);
                    const itMaster = (masterItems || []).find(m => normalizePackName(m.name || m.nombre) === normalizePackName(itemName)) || {};
                    const dur = it.duracion || itMaster.duracion || itMaster.duration || 60;
                    const sp = it.espacio || itMaster.space || itMaster.allowedSpaces?.[0] || 'spa';
                    return {
                        orden: idx + 1,
                        nombre: itemName,
                        espacio: sp,
                        duracion: dur,
                        requires_therapist: sp !== 'spa',
                        terapeutas: sp !== 'spa' ? 1 : 0
                    };
                });
            }
        }

        // Si aún no hay secuencia pero es un pack reconocido, asegurar fallback
        if (secuencia.length === 0 && regPack) {
            secuencia = regPack.secuencia || [];
        }

        // Resolver precio
        let resolvedPrice = 0;
        const priceSources = [
            catalogMatch?.precio, catalogMatch?.precio_total, catalogMatch?.price,
            catalogMatch?.pvp, catalogMatch?.importe, catalogMatch?.regular_price,
            masterMatch?.price_pax, masterMatch?.price, masterMatch?.precio,
            regPack?.precio_defecto
        ];

        for (const p of priceSources) {
            if (p !== null && p !== undefined && String(p).trim() !== '') {
                const num = Number(String(p).trim().replace(',', '.'));
                if (Number.isFinite(num) && num > 0) {
                    resolvedPrice = num;
                    break;
                }
            }
        }

        const pax = parseInt(catalogMatch?.pax || regPack?.pax || masterMatch?.pax_max || masterMatch?.pax || 2);
        const nombreFinal = regPack?.nombre || catalogMatch?.nombre || masterMatch?.name || nameOrId;

        return {
            isPack: true,
            id: regPack?.id || catalogMatch?.id || 'pack-custom',
            nombre: nombreFinal,
            pax: pax,
            modalidad: regPack?.modalidad || (pax > 1 ? 'pareja' : 'individual'),
            categoria: regPack?.categoria || catalogMatch?.categoria || 'pack',
            precio: resolvedPrice,
            secuencia: secuencia,
            items_count: secuencia.length,
            includes_restaurant: !!(regPack?.includes_restaurant || catalogMatch?.includes_restaurant),
            includes_hotel: !!(regPack?.includes_hotel || catalogMatch?.includes_hotel),
            includes_cava: !!(regPack?.includes_cava || catalogMatch?.includes_cava),
            duracion_total: secuencia.reduce((sum, f) => sum + (parseInt(f.duracion) || 0), 0)
        };
    }

    // Exponer en objeto global
    root.SPA_PACKS_REGISTRY = SPA_PACKS_REGISTRY;
    root.normalizePackName = normalizePackName;
    root.findPackDefinition = findPackDefinition;
    root.isPackService = isPackService;
    root.getPackFullData = getPackFullData;

    if (typeof module !== 'undefined') {
        module.exports = {
            SPA_PACKS_REGISTRY,
            normalizePackName,
            findPackDefinition,
            isPackService,
            getPackFullData
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
