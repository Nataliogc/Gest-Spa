/**
 * spa-phase4-corrections.js
 * FASE 4 - Correcciones Funcionales Operativas
 * 
 * REGLAS VALIDADAS:
 * - snapshot_price: NO recalcular precios históricos
 * - Packs: secuencias operativas (sin hotel/restaurante/complementos)
 * - Salas: Panacea 2 camillas, Suite min_spacing 60min
 * - Rituales: 120min real en Panacea
 * - Masaje pareja: siempre 2 terapeutas
 * - Complementos: unitarios, sin fases
 */

// ============================================================================
// CONFIGURACIÓN OPERATIVA VALIDADA
// ============================================================================

const FASE4_CONFIG = {
    // Salas
    ROOMS: {
        panacea: {
            camillas: 2,
            max_concurrent: 2,
            compatible_categories: ['masaje', 'facial', 'corporal', 'ritual', 'envoltura'],
            min_spacing: 15
        },
        suite: {
            camillas: 2,
            max_concurrent: 1,
            compatible_categories: ['masaje', 'ritual', 'suite', 'pack_pareja', 'hidromasaje'],
            min_spacing: 60 // Ideal 60, mínimo 30
        },
        vip: {
            camillas: 2,
            max_concurrent: 1,
            compatible_categories: ['masaje', 'ritual', 'suite', 'pack_pareja'],
            min_spacing: 30
        },
        spa: {
            capacity: 16, // Máximo operativo
            optimal_capacity: 12,
            max_concurrent: 16,
            compatible_categories: ['circuito', 'bono_circuito', 'gimnasio'],
            min_spacing: 0,
            requires_therapist: false
        },
        cabina: {
            camillas: 1,
            max_concurrent: 1,
            compatible_categories: ['masaje', 'facial', 'corporal', 'ritual', 'envoltura'],
            min_spacing: 15
        },
        restaurante: {
            max_concurrent: 50,
            compatible_categories: ['restaurante', 'menu'],
            min_spacing: 0,
            requires_therapist: false,
            outside_spa_motor: true // No genera fase en motor SPA
        },
        hotel: {
            outside_spa_motor: true // No genera fase en motor SPA
        }
    },

    // Rituales - Duración real operativa
    RITUALES: {
        duracion_real: 120,
        duracion_comercial: 90,
        espacio: 'panacea',
        requires_therapist: true,
        terapeutas: 1
    },

    // Masajes pareja
    MASAJE_PAREJA: {
        terapeutas: 2,
        espacios: ['suite', 'panacea', 'vip']
    },

    // Complementos
    COMPLEMENTOS: {
        tipo: 'unitario',
        genera_fase: false,
        bloquea_sala: false,
        bloquea_terapeuta: false,
        requiere_reserva: false,
        requiere_stock: false,
        entrega_en: ['suite', 'panacea', 'cabina', 'vip', 'hotel', 'restaurante'],
        no_entrega_en: ['spa'] // No se entregan en Circuito
    }
};

// ============================================================================
// SECUENCIAS OPERATIVAS PARA 18 PACKS
// ============================================================================

const PACK_SEQUENCES = {
    // === PACKS PAREJA ===
    'wc-6475': { // Relax Oriental (pareja)
        nombre: 'Relax Oriental',
        pax: 2,
        modalidad: 'pareja',
        secuencia: [
            { orden: 1, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 30, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'suite', duracion: 30, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6477': { // Encuentro Romántico
        nombre: 'Encuentro Romántico',
        pax: 2,
        modalidad: 'pareja',
        secuencia: [
            { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'suite', duracion: 30, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6479': { // Especial Parejas
        nombre: 'Especial Parejas',
        pax: 2,
        modalidad: 'pareja',
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 },
            { orden: 3, nombre: 'Envoltura + Cráneo-Facial', espacio: 'panacea', duracion: 60, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6481': { // Sueño para dos (con hotel - solo fase SPA)
        nombre: 'Sueño para dos',
        pax: 2,
        modalidad: 'pareja',
        includes_hotel: true,
        includes_restaurant: true,
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            // Hotel y Restaurante fuera del motor SPA
        ]
    },
    'wc-6483': { // Fantasía para dos (con hotel)
        nombre: 'Fantasía para dos',
        pax: 2,
        modalidad: 'pareja',
        includes_hotel: true,
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6485': { // Aventura para dos (con hotel)
        nombre: 'Aventura para dos',
        pax: 2,
        modalidad: 'pareja',
        includes_hotel: true,
        includes_cava: true,
        secuencia: [
            { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 }
            // Hotel y Cava fuera del motor SPA
        ]
    },
    'wc-6487': { // Tiempo para dos
        nombre: 'Tiempo para dos',
        pax: 2,
        modalidad: 'pareja',
        includes_restaurant: true,
        secuencia: [
            { orden: 1, nombre: 'Suite Spa', espacio: 'suite', duracion: 60, requires_therapist: false, terapeutas: 0 }
            // Restaurante fuera del motor SPA
        ]
    },
    'wc-6489': { // Cuento para dos (CORREGIR pax 1→2)
        nombre: 'Cuento para dos',
        pax: 2, // CORREGIDO de 1 a 2
        modalidad: 'pareja',
        includes_restaurant: true,
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Cráneo-Facial', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
            // Restaurante fuera del motor SPA
        ]
    },
    'wc-6529': { // Masaje en Pareja
        nombre: 'Masaje en Pareja',
        pax: 2,
        modalidad: 'pareja',
        secuencia: [
            { orden: 1, nombre: 'Masaje Pareja', espacio: 'suite', duracion: 60, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6905': { // Experiencia SPA en pareja
        nombre: 'Experiencia SPA en pareja',
        pax: 2,
        modalidad: 'pareja',
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Pareja', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
        ]
    },
    'wc-6906': { // SPA y Sabores (pareja)
        nombre: 'SPA y Sabores',
        pax: 2,
        modalidad: 'pareja',
        includes_restaurant: true,
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            // Restaurante fuera del motor SPA
        ]
    },

    // === RITUALES ===
    'wc-6495': { // Ritual Indian ritual
        nombre: 'Ritual Indian',
        pax: 1,
        modalidad: 'individual',
        categoria: 'ritual',
        secuencia: [
            { orden: 1, nombre: 'Peeling Himalaya', espacio: 'panacea', duracion: 20, requires_therapist: true, terapeutas: 1 },
            { orden: 2, nombre: 'Envoltura Flores Loto', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
            { orden: 3, nombre: 'Masaje Bambú', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
            { orden: 4, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
        ],
        duracion_real: 120,
        duracion_comercial: 100
    },
    'wc-6497': { // Ritual Baño Cítrico
        nombre: 'Ritual Baño Cítrico',
        pax: 1,
        modalidad: 'individual',
        categoria: 'ritual',
        secuencia: [
            { orden: 1, nombre: 'Peeling Corporal', espacio: 'panacea', duracion: 15, requires_therapist: true, terapeutas: 1 },
            { orden: 2, nombre: 'Envoltura Vit.C', espacio: 'panacea', duracion: 25, requires_therapist: true, terapeutas: 1 },
            { orden: 3, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
            { orden: 4, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
        ],
        duracion_real: 120,
        duracion_comercial: 90
    },
    'wc-6501': { // Ritual Chocolaterapia
        nombre: 'Ritual Chocolaterapia',
        pax: 1,
        modalidad: 'individual',
        categoria: 'ritual',
        secuencia: [
            { orden: 1, nombre: 'Peeling Corporal', espacio: 'panacea', duracion: 15, requires_therapist: true, terapeutas: 1 },
            { orden: 2, nombre: 'Envoltura Chocolate', espacio: 'panacea', duracion: 25, requires_therapist: true, terapeutas: 1 },
            { orden: 3, nombre: 'Masaje Relax', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
            { orden: 4, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
        ],
        duracion_real: 120,
        duracion_comercial: 90
    },

    // === PACKS INDIVIDUALES ===
    'wc-6942': { // Experiencia SPA (individual)
        nombre: 'Experiencia SPA',
        pax: 1,
        modalidad: 'individual',
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'cabina', duracion: 30, requires_therapist: true, terapeutas: 1 }
        ]
    },
    'wc-6943': { // SPA y Sabores (individual)
        nombre: 'SPA y Sabores',
        pax: 1,
        modalidad: 'individual',
        includes_restaurant: true,
        secuencia: [
            { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 }
            // Restaurante fuera del motor SPA
        ]
    },
    'wc-6944': { // Relax Oriental (individual)
        nombre: 'Relax Oriental - Individual',
        pax: 1,
        modalidad: 'individual',
        secuencia: [
            { orden: 1, nombre: 'Baño Hidromasaje', espacio: 'suite', duracion: 30, requires_therapist: false, terapeutas: 0 },
            { orden: 2, nombre: 'Masaje Relax', espacio: 'cabina', duracion: 30, requires_therapist: true, terapeutas: 1 }
        ]
    },
    'wc-7305': { // Ritual Amazonian Discovery
        nombre: 'Ritual Amazonian Discovery',
        pax: 1,
        modalidad: 'individual',
        categoria: 'ritual',
        secuencia: [
            { orden: 1, nombre: 'Facial Completo', espacio: 'cabina', duracion: 45, requires_therapist: true, terapeutas: 1 },
            { orden: 2, nombre: 'Corporal Hidratante', espacio: 'cabina', duracion: 45, requires_therapist: true, terapeutas: 1 }
        ],
        duracion_real: 90,
        duracion_comercial: 90
    }
};

// ============================================================================
// FUNCIONES DE CORRECCIÓN
// ============================================================================

/**
 * Añade secuencia a un pack específico
 */
async function addSequenceToPack(packId, options = {}) {
    const sequenceData = PACK_SEQUENCES[packId];
    if (!sequenceData) {
        return { success: false, error: `Pack ${packId} no tiene secuencia definida` };
    }

    const updateData = {
        secuencia: sequenceData.secuencia,
        modalidad: sequenceData.modalidad,
        pax: sequenceData.pax,
        updated_at: new Date().toISOString()
    };

    // Añadir flags opcionales
    if (sequenceData.includes_hotel) updateData.includes_hotel = true;
    if (sequenceData.includes_restaurant) updateData.includes_restaurant = true;
    if (sequenceData.includes_cava) updateData.includes_cava = true;
    if (sequenceData.duracion_real) updateData.duracion_real = sequenceData.duracion_real;
    if (sequenceData.duracion_comercial) updateData.duracion_comercial = sequenceData.duracion_comercial;

    if (options.dryRun) {
        return { success: true, dryRun: true, packId, updateData };
    }

    try {
        await db.collection('spa_services').doc(packId).update(updateData);
        return { success: true, packId, updateData };
    } catch (err) {
        return { success: false, packId, error: err.message };
    }
}

/**
 * Añade secuencias a todos los packs detectados
 */
async function addAllPackSequences(options = {}) {
    const results = {
        processed: 0,
        success: 0,
        failed: 0,
        details: []
    };

    for (const packId of Object.keys(PACK_SEQUENCES)) {
        results.processed++;
        const result = await addSequenceToPack(packId, options);

        if (result.success) {
            results.success++;
        } else {
            results.failed++;
        }
        results.details.push(result);
    }

    return results;
}

/**
 * Configura salas con parámetros operativos
 */
async function configureRooms(options = {}) {
    const results = {
        processed: 0,
        updated: 0,
        details: []
    };

    for (const [roomCode, config] of Object.entries(FASE4_CONFIG.ROOMS)) {
        results.processed++;

        const updateData = {
            compatible_categories: config.compatible_categories,
            max_concurrent: config.max_concurrent,
            min_spacing: config.min_spacing || 0,
            updated_at: new Date().toISOString()
        };

        if (config.camillas) updateData.camillas = config.camillas;
        if (config.capacity) updateData.capacity = config.capacity;
        if (config.optimal_capacity) updateData.optimal_capacity = config.optimal_capacity;
        if (config.requires_therapist !== undefined) updateData.requires_therapist = config.requires_therapist;
        if (config.outside_spa_motor) updateData.outside_spa_motor = config.outside_spa_motor;

        if (options.dryRun) {
            results.details.push({ room: roomCode, dryRun: true, updateData });
            results.updated++;
            continue;
        }

        try {
            // Buscar sala por code
            const snapshot = await db.collection('spa_spaces').where('code', '==', roomCode).get();
            if (!snapshot.empty) {
                await snapshot.docs[0].ref.update(updateData);
                results.updated++;
                results.details.push({ room: roomCode, success: true });
            } else {
                results.details.push({ room: roomCode, error: 'Sala no encontrada' });
            }
        } catch (err) {
            results.details.push({ room: roomCode, error: err.message });
        }
    }

    return results;
}

/**
 * Añade snapshot_price a vouchers existentes (sin recalcular)
 */
async function addSnapshotPriceToVouchers(options = {}) {
    const results = {
        processed: 0,
        updated: 0,
        skipped: 0,
        details: []
    };

    try {
        const snapshot = await db.collection('spa_vouchers').get();

        for (const doc of snapshot.docs) {
            results.processed++;
            const voucher = doc.data();

            // Si ya tiene snapshot_price, saltar
            if (voucher.snapshot_price !== undefined) {
                results.skipped++;
                continue;
            }

            // Usar precio existente como snapshot (NO recalcular)
            const snapshotPrice = parseFloat(voucher.precio) ||
                parseFloat(voucher.importe) ||
                parseFloat(voucher.precio_final) || 0;

            if (snapshotPrice === 0) {
                results.skipped++;
                continue;
            }

            const updateData = {
                snapshot_price: snapshotPrice,
                snapshot_date: voucher.fecha || voucher.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            if (options.dryRun) {
                results.details.push({
                    code: voucher.bono || voucher.codigo,
                    dryRun: true,
                    snapshot_price: snapshotPrice
                });
                results.updated++;
                continue;
            }

            await doc.ref.update(updateData);
            results.updated++;
        }

    } catch (err) {
        results.error = err.message;
    }

    return results;
}

/**
 * Corrige pax de "Cuento para dos" específicamente
 */
async function correctCuentoParaDosPax(options = {}) {
    const packId = 'wc-6489';

    if (options.dryRun) {
        return { success: true, dryRun: true, packId, pax: 2, previous: 1 };
    }

    try {
        await db.collection('spa_services').doc(packId).update({
            pax: 2,
            updated_at: new Date().toISOString()
        });
        return { success: true, packId, pax: 2 };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================================
// EJECUTOR MAESTRO FASE 4
// ============================================================================

async function runPhase4Corrections(options = { dryRun: true }) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`  FASE 4 - CORRECCIONES OPERATIVAS (${options.dryRun ? 'DRY-RUN' : 'REAL'})`);
    console.log('═══════════════════════════════════════════════════');

    const report = {
        timestamp: new Date().toISOString(),
        mode: options.dryRun ? 'dry-run' : 'real',
        corrections: {}
    };

    // 1. Secuencias de packs
    console.log('\n📦 Añadiendo secuencias a 18 packs...');
    report.corrections.packs = await addAllPackSequences(options);
    console.log(`   Éxito: ${report.corrections.packs.success}/${report.corrections.packs.processed}`);

    // 2. Corrección Cuento para Dos
    console.log('\n🔧 Corrigiendo "Cuento para dos" pax 1→2...');
    report.corrections.cuentoParaDos = await correctCuentoParaDosPax(options);
    console.log(`   ${report.corrections.cuentoParaDos.success ? '✅ Corregido' : '❌ Error'}`);

    // 3. Configuración de salas
    console.log('\n🏠 Configurando salas operativas...');
    report.corrections.rooms = await configureRooms(options);
    console.log(`   Actualizadas: ${report.corrections.rooms.updated}/${report.corrections.rooms.processed}`);

    // 4. Snapshot de precios (sin recalcular)
    console.log('\n💰 Añadiendo snapshot_price a vouchers...');
    report.corrections.snapshots = await addSnapshotPriceToVouchers(options);
    console.log(`   Actualizados: ${report.corrections.snapshots.updated}, Omitidos: ${report.corrections.snapshots.skipped}`);

    // 5. Usar correcciones base de spa-data-corrections.js
    if (window.SpaDataCorrections) {
        console.log('\n👤 Añadiendo skills a terapeutas...');
        report.corrections.staff = await window.SpaDataCorrections.correctStaffSkills(options);
        console.log(`   Corregidos: ${report.corrections.staff.corrected}`);

        console.log('\n📋 Añadiendo campos a servicios...');
        report.corrections.services = await window.SpaDataCorrections.correctServicesConfiguration(options);
        console.log(`   Corregidos: ${report.corrections.services.corrected}`);

        console.log('\n💳 Añadiendo estado_pago a bonos locales...');
        report.corrections.payment = await window.SpaDataCorrections.correctLocalVouchersPaymentStatus(options);
        console.log(`   Corregidos: ${report.corrections.payment.corrected}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  FASE 4 COMPLETADA');
    console.log('═══════════════════════════════════════════════════');

    return report;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.SpaPhase4 = {
        // Config
        CONFIG: FASE4_CONFIG,
        PACK_SEQUENCES,

        // Correcciones individuales
        addSequenceToPack,
        addAllPackSequences,
        configureRooms,
        addSnapshotPriceToVouchers,
        correctCuentoParaDosPax,

        // Ejecutor
        runCorrections: runPhase4Corrections,
        dryRun: () => runPhase4Corrections({ dryRun: true }),
        apply: () => runPhase4Corrections({ dryRun: false })
    };

    console.log('[SPA-PHASE4] ✅ Loaded - Correcciones Operativas');
    console.log('  → DRY-RUN: SpaPhase4.dryRun()');
    console.log('  → APLICAR: SpaPhase4.apply() [ESPERAR CONFIRMACIÓN]');
}
