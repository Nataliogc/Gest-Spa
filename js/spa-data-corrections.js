/**
 * spa-data-corrections.js
 * FASE 4 - Corrección Funcional sobre datos reales
 * 
 * Este módulo aplica las correcciones del modelo operativo sobre
 * los datos existentes en Firestore, NO usa mocks.
 * 
 * Sin cambios de UI ni PDF.
 */

// ============================================================================
// DEPENDENCIAS
// ============================================================================

// Requiere: spa-matching-engine.js cargado primero
// Requiere: db (Firestore) disponible globalmente

// ============================================================================
// 1. CORRECCIÓN DE PRECIOS
// ============================================================================

/**
 * Calcula precio_final unificado para un bono
 * Prioridad: WooCommerce > items_desglosados > catálogo
 */
function calculatePrecioFinal(voucher, catalogProducts = []) {
    let precio_final = 0;
    let source = 'unknown';

    // 1. Si tiene precio/importe directo (WooCommerce), usar ese
    const directPrice = parseFloat(voucher.precio) || parseFloat(voucher.importe) || 0;
    if (directPrice > 0) {
        precio_final = directPrice;
        source = 'direct';
    }

    // 2. Si tiene items_desglosados con precios, sumar
    if (precio_final === 0 && voucher.items_desglosados && voucher.items_desglosados.length > 0) {
        const itemsSum = voucher.items_desglosados.reduce((sum, item) => {
            return sum + (parseFloat(item.precio) || parseFloat(item.price) || 0);
        }, 0);
        if (itemsSum > 0) {
            precio_final = itemsSum;
            source = 'items_desglosados';
        }
    }

    // 3. Fallback: buscar en catálogo y calcular
    if (precio_final === 0 && catalogProducts.length > 0) {
        const productName = (voucher.producto || '').toLowerCase();
        const match = catalogProducts.find(p =>
            (p.nombre || '').toLowerCase() === productName ||
            (p.wc_id && String(p.wc_id) === String(voucher.product_id))
        );

        if (match) {
            const basePrice = parseFloat(match.precio) || 0;
            const basePax = parseInt(match.pax || match.personas || 1);
            const voucherPax = parseInt(voucher.pax_por_sesion || voucher.pax || 1);
            const sessions = parseInt(voucher.sesiones_totales || 1);

            // Aplicar ratio solo si el pax del bono difiere del catálogo
            const paxRatio = voucherPax / basePax;
            precio_final = basePrice * paxRatio * sessions;
            source = 'catalog_calculated';
        }
    }

    return {
        precio_final: parseFloat(precio_final.toFixed(2)),
        source,
        original_precio: parseFloat(voucher.precio) || 0,
        original_importe: parseFloat(voucher.importe) || 0
    };
}

/**
 * Corrige precios de todos los bonos en Firestore
 */
async function correctAllVoucherPrices(options = {}) {
    const result = {
        processed: 0,
        corrected: 0,
        errors: [],
        details: []
    };

    try {
        // 1. Cargar catálogo
        let catalogProducts = options.catalogProducts;
        if (!catalogProducts && typeof db !== 'undefined') {
            const catSnapshot = await db.collection('spa_services').get();
            catalogProducts = [];
            catSnapshot.forEach(doc => catalogProducts.push({ id: doc.id, ...doc.data() }));
        }

        // 2. Cargar bonos
        let vouchers = options.vouchers;
        if (!vouchers && typeof db !== 'undefined') {
            const vouchersSnapshot = await db.collection('spa_vouchers').get();
            vouchers = [];
            vouchersSnapshot.forEach(doc => vouchers.push({ id: doc.id, ...doc.data() }));
        }

        // 3. Procesar cada bono
        for (const voucher of vouchers) {
            result.processed++;

            const priceCalc = calculatePrecioFinal(voucher, catalogProducts);
            const needsCorrection = !voucher.precio_final ||
                voucher.precio_final !== priceCalc.precio_final;

            if (needsCorrection && priceCalc.precio_final > 0) {
                const updateData = {
                    precio_final: priceCalc.precio_final,
                    precio_final_source: priceCalc.source,
                    updated_at: new Date().toISOString()
                };

                // Sincronizar precio e importe si estaban vacíos
                if (!voucher.precio || voucher.precio === 0) {
                    updateData.precio = priceCalc.precio_final;
                }
                if (!voucher.importe || voucher.importe === 0) {
                    updateData.importe = priceCalc.precio_final;
                }

                if (options.dryRun !== true && typeof db !== 'undefined') {
                    await db.collection('spa_vouchers').doc(voucher.id).update(updateData);
                }

                result.corrected++;
                result.details.push({
                    code: voucher.bono || voucher.codigo,
                    old: voucher.precio_final || voucher.precio || voucher.importe || 0,
                    new: priceCalc.precio_final,
                    source: priceCalc.source
                });
            }
        }

    } catch (err) {
        result.errors.push(`Error en corrección de precios: ${err.message}`);
    }

    return result;
}

// ============================================================================
// 2. CORRECCIÓN DE TERAPEUTAS (Skills)
// ============================================================================

/**
 * Infiere y añade skills a terapeutas que no los tienen
 */
async function correctStaffSkills(options = {}) {
    const result = {
        processed: 0,
        corrected: 0,
        errors: [],
        details: []
    };

    try {
        // 1. Cargar terapeutas
        let staff;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_staff').get();
            staff = [];
            snapshot.forEach(doc => staff.push({ id: doc.id, ...doc.data() }));
        }

        // 2. Procesar cada terapeuta
        for (const therapist of staff) {
            result.processed++;

            // Si ya tiene skills definidos, saltar
            if (therapist.skills && therapist.skills.length > 0) continue;

            // Inferir skills de assigned_rooms
            const engine = window.SpaMatchingEngine;
            if (!engine) {
                result.errors.push('SpaMatchingEngine no disponible');
                break;
            }

            const inferredSkills = engine.inferSkillsFromRooms(therapist.assigned_rooms || []);

            if (inferredSkills.length > 0) {
                const updateData = {
                    skills: inferredSkills,
                    skills_inferred: true,
                    updated_at: new Date().toISOString()
                };

                if (options.dryRun !== true && typeof db !== 'undefined') {
                    await db.collection('spa_staff').doc(therapist.id).update(updateData);
                }

                result.corrected++;
                result.details.push({
                    name: therapist.name,
                    assigned_rooms: therapist.assigned_rooms || [],
                    inferred_skills: inferredSkills
                });
            }
        }

    } catch (err) {
        result.errors.push(`Error en corrección de skills: ${err.message}`);
    }

    return result;
}

// ============================================================================
// 3. CORRECCIÓN DE SALAS (allowed_spaces y compatibilidad)
// ============================================================================

/**
 * Añade campos del modelo operativo a salas existentes
 */
async function correctSpacesConfiguration(options = {}) {
    const result = {
        processed: 0,
        corrected: 0,
        errors: [],
        details: []
    };

    try {
        let spaces;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_spaces').get();
            spaces = [];
            snapshot.forEach(doc => spaces.push({ id: doc.id, ...doc.data() }));
        }

        const engine = window.SpaMatchingEngine;
        if (!engine) {
            result.errors.push('SpaMatchingEngine no disponible');
            return result;
        }

        for (const space of spaces) {
            result.processed++;

            const needsUpdate = !space.compatible_categories ||
                !space.max_concurrent ||
                space.min_spacing === undefined;

            if (needsUpdate) {
                const normalized = engine.normalizeSpace(space);
                const updateData = {};

                if (!space.compatible_categories) {
                    updateData.compatible_categories = normalized.compatible_categories;
                }
                if (!space.max_concurrent) {
                    updateData.max_concurrent = normalized.max_concurrent;
                }
                if (space.min_spacing === undefined) {
                    updateData.min_spacing = normalized.min_spacing || 0;
                }

                updateData.updated_at = new Date().toISOString();

                if (Object.keys(updateData).length > 1) { // más que solo updated_at
                    if (options.dryRun !== true && typeof db !== 'undefined') {
                        await db.collection('spa_spaces').doc(space.id).update(updateData);
                    }

                    result.corrected++;
                    result.details.push({
                        code: space.code,
                        name: space.name,
                        added_fields: Object.keys(updateData).filter(k => k !== 'updated_at')
                    });
                }
            }
        }

    } catch (err) {
        result.errors.push(`Error en corrección de salas: ${err.message}`);
    }

    return result;
}

// ============================================================================
// 4. CORRECCIÓN DE SERVICIOS (modalidad, allowed_spaces, etc.)
// ============================================================================

/**
 * Añade campos del modelo operativo a servicios existentes
 */
async function correctServicesConfiguration(options = {}) {
    const result = {
        processed: 0,
        corrected: 0,
        errors: [],
        details: []
    };

    try {
        let services;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_services').get();
            services = [];
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        }

        const engine = window.SpaMatchingEngine;
        if (!engine) {
            result.errors.push('SpaMatchingEngine no disponible');
            return result;
        }

        for (const service of services) {
            result.processed++;

            const needsUpdate = !service.modalidad ||
                service.requires_therapist === undefined ||
                service.terapeutas_requeridos === undefined ||
                !service.allowed_spaces ||
                !service.duration_total;

            if (needsUpdate) {
                const normalized = engine.normalizeService(service);
                const updateData = {};

                if (!service.modalidad) {
                    updateData.modalidad = normalized.modalidad;
                }
                if (service.requires_therapist === undefined) {
                    updateData.requires_therapist = normalized.requires_therapist;
                }
                if (service.terapeutas_requeridos === undefined) {
                    updateData.terapeutas_requeridos = normalized.terapeutas_requeridos;
                }
                if (!service.allowed_spaces || service.allowed_spaces.length === 0) {
                    updateData.allowed_spaces = normalized.allowed_spaces;
                }
                if (!service.duration_total) {
                    updateData.duration_total = normalized.duration_total;
                }
                if (service.pax === undefined) {
                    updateData.pax = normalized.pax;
                }

                updateData.updated_at = new Date().toISOString();

                if (Object.keys(updateData).length > 1) {
                    if (options.dryRun !== true && typeof db !== 'undefined') {
                        await db.collection('spa_services').doc(service.id).update(updateData);
                    }

                    result.corrected++;
                    result.details.push({
                        nombre: service.nombre,
                        added_fields: Object.keys(updateData).filter(k => k !== 'updated_at'),
                        modalidad: updateData.modalidad || service.modalidad,
                        terapeutas: updateData.terapeutas_requeridos ?? service.terapeutas_requeridos
                    });
                }
            }
        }

    } catch (err) {
        result.errors.push(`Error en corrección de servicios: ${err.message}`);
    }

    return result;
}

// ============================================================================
// 5. CORRECCIÓN DE BONOS LOCALES (estado_pago)
// ============================================================================

/**
 * Añade campos de estado de pago a bonos locales que no los tienen
 */
async function correctLocalVouchersPaymentStatus(options = {}) {
    const result = {
        processed: 0,
        corrected: 0,
        errors: [],
        details: []
    };

    try {
        let vouchers;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_vouchers')
                .where('origen', '==', 'local')
                .get();
            vouchers = [];
            snapshot.forEach(doc => vouchers.push({ id: doc.id, ...doc.data() }));
        }

        const engine = window.SpaMatchingEngine;
        if (!engine) {
            result.errors.push('SpaMatchingEngine no disponible');
            return result;
        }

        for (const voucher of vouchers) {
            result.processed++;

            // Si ya tiene estado_pago, saltar
            if (voucher.estado_pago) continue;

            // Aplicar normalización de pago (default: pendiente)
            const normalized = engine.normalizeVoucherPayment(voucher, {
                estado_pago: 'pendiente' // Default conservador
            });

            const updateData = {
                estado_pago: normalized.estado_pago,
                importe_pagado: normalized.importe_pagado,
                importe_pendiente: normalized.importe_pendiente,
                updated_at: new Date().toISOString()
            };

            if (options.dryRun !== true && typeof db !== 'undefined') {
                await db.collection('spa_vouchers').doc(voucher.id).update(updateData);
            }

            result.corrected++;
            result.details.push({
                code: voucher.bono || voucher.codigo,
                precio: voucher.precio || voucher.importe,
                estado_pago: normalized.estado_pago,
                importe_pendiente: normalized.importe_pendiente
            });
        }

    } catch (err) {
        result.errors.push(`Error en corrección de estado_pago: ${err.message}`);
    }

    return result;
}

// ============================================================================
// 6. VALIDACIÓN DE PACKS Y PAREJAS
// ============================================================================

/**
 * Valida que los servicios pareja tengan configuración correcta
 */
async function validateCoupleServices(options = {}) {
    const result = {
        total: 0,
        valid: 0,
        invalid: 0,
        issues: []
    };

    try {
        let services;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_services').get();
            services = [];
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        }

        const engine = window.SpaMatchingEngine;

        // Filtrar servicios que deberían ser pareja
        const coupleServices = services.filter(s => {
            const pax = parseInt(s.pax || s.personas || 1);
            return pax >= 2;
        });

        for (const service of coupleServices) {
            result.total++;
            const normalized = engine.normalizeService(service);
            const issues = [];

            // Verificar modalidad
            if (normalized.modalidad !== 'pareja' && normalized.modalidad !== 'mixto') {
                issues.push(`Modalidad incorrecta: ${normalized.modalidad} (esperado: pareja)`);
            }

            // Verificar terapeutas para masaje pareja
            const categoria = (service.categoria || '').toLowerCase();
            if (categoria.includes('masaje') && normalized.terapeutas_requeridos !== 2) {
                issues.push(`Masaje pareja debe tener 2 terapeutas, tiene: ${normalized.terapeutas_requeridos}`);
            }

            // Verificar terapeutas para suite
            if ((categoria.includes('suite') || categoria.includes('privada')) &&
                normalized.terapeutas_requeridos !== 1) {
                issues.push(`Suite debe tener 1 terapeuta, tiene: ${normalized.terapeutas_requeridos}`);
            }

            if (issues.length > 0) {
                result.invalid++;
                result.issues.push({
                    nombre: service.nombre,
                    pax: normalized.pax,
                    categoria,
                    issues
                });
            } else {
                result.valid++;
            }
        }

    } catch (err) {
        result.issues.push({ error: err.message });
    }

    return result;
}

/**
 * Valida que los packs mixtos tengan secuencia correcta
 */
async function validateMixedPacks(options = {}) {
    const result = {
        total: 0,
        valid: 0,
        invalid: 0,
        issues: []
    };

    try {
        let services;
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_services').get();
            services = [];
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        }

        const engine = window.SpaMatchingEngine;

        // Filtrar packs (tienen items_incluidos > 1 o categoría pack)
        const packs = services.filter(s => {
            const hasMultipleItems = s.items_incluidos && s.items_incluidos.length > 1;
            const isPackCategory = (s.categoria || '').toLowerCase().includes('pack');
            return hasMultipleItems || isPackCategory;
        });

        for (const pack of packs) {
            result.total++;
            const issues = [];
            const normalized = engine.normalizeService(pack);

            // Verificar modalidad
            if (normalized.modalidad !== 'mixto') {
                issues.push(`Pack debe ser modalidad=mixto, tiene: ${normalized.modalidad}`);
            }

            // Verificar que tiene secuencia si tiene items_incluidos
            if (pack.items_incluidos && pack.items_incluidos.length > 1 && !pack.secuencia) {
                issues.push(`Pack tiene ${pack.items_incluidos.length} items pero no tiene secuencia definida`);
            }

            // Verificar secuencia si existe
            if (pack.secuencia && pack.secuencia.length > 0) {
                // Verificar orden
                const orders = pack.secuencia.map(f => f.orden);
                const sortedOrders = [...orders].sort((a, b) => a - b);
                if (JSON.stringify(orders) !== JSON.stringify(sortedOrders)) {
                    issues.push('Secuencia no está ordenada por campo orden');
                }

                // Verificar que cada fase tiene espacio
                pack.secuencia.forEach((fase, idx) => {
                    if (!fase.espacio) {
                        issues.push(`Fase ${idx + 1} (${fase.nombre}) no tiene espacio definido`);
                    }
                });
            }

            if (issues.length > 0) {
                result.invalid++;
                result.issues.push({
                    nombre: pack.nombre,
                    items_count: (pack.items_incluidos || []).length,
                    has_secuencia: !!pack.secuencia,
                    issues
                });
            } else {
                result.valid++;
            }
        }

    } catch (err) {
        result.issues.push({ error: err.message });
    }

    return result;
}

// ============================================================================
// 7. EJECUTOR MAESTRO
// ============================================================================

/**
 * Ejecuta todas las correcciones en modo dry-run o real
 */
async function runAllCorrections(options = { dryRun: true }) {
    console.log('═══════════════════════════════════════════════════');
    console.log(`  FASE 4 - CORRECCIONES (${options.dryRun ? 'DRY-RUN' : 'REAL'})`);
    console.log('═══════════════════════════════════════════════════');

    const report = {
        timestamp: new Date().toISOString(),
        mode: options.dryRun ? 'dry-run' : 'real',
        corrections: {},
        validations: {}
    };

    // 1. Precios
    console.log('\n💰 Corrigiendo precios...');
    report.corrections.prices = await correctAllVoucherPrices(options);
    console.log(`   Procesados: ${report.corrections.prices.processed}, Corregidos: ${report.corrections.prices.corrected}`);

    // 2. Skills de terapeutas
    console.log('\n👤 Corrigiendo skills de terapeutas...');
    report.corrections.staff = await correctStaffSkills(options);
    console.log(`   Procesados: ${report.corrections.staff.processed}, Corregidos: ${report.corrections.staff.corrected}`);

    // 3. Configuración de salas
    console.log('\n🏠 Corrigiendo configuración de salas...');
    report.corrections.spaces = await correctSpacesConfiguration(options);
    console.log(`   Procesados: ${report.corrections.spaces.processed}, Corregidos: ${report.corrections.spaces.corrected}`);

    // 4. Configuración de servicios
    console.log('\n📋 Corrigiendo configuración de servicios...');
    report.corrections.services = await correctServicesConfiguration(options);
    console.log(`   Procesados: ${report.corrections.services.processed}, Corregidos: ${report.corrections.services.corrected}`);

    // 5. Estado de pago de bonos locales
    console.log('\n💳 Corrigiendo estado de pago de bonos locales...');
    report.corrections.payment = await correctLocalVouchersPaymentStatus(options);
    console.log(`   Procesados: ${report.corrections.payment.processed}, Corregidos: ${report.corrections.payment.corrected}`);

    // 6. Validaciones
    console.log('\n🔍 Validando servicios pareja...');
    report.validations.couples = await validateCoupleServices(options);
    console.log(`   Total: ${report.validations.couples.total}, Válidos: ${report.validations.couples.valid}, Inválidos: ${report.validations.couples.invalid}`);

    console.log('\n📦 Validando packs mixtos...');
    report.validations.packs = await validateMixedPacks(options);
    console.log(`   Total: ${report.validations.packs.total}, Válidos: ${report.validations.packs.valid}, Inválidos: ${report.validations.packs.invalid}`);

    // Resumen
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  RESUMEN');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Precios corregidos: ${report.corrections.prices.corrected}`);
    console.log(`  Terapeutas con skills añadidos: ${report.corrections.staff.corrected}`);
    console.log(`  Salas actualizadas: ${report.corrections.spaces.corrected}`);
    console.log(`  Servicios actualizados: ${report.corrections.services.corrected}`);
    console.log(`  Bonos con estado_pago: ${report.corrections.payment.corrected}`);
    console.log(`  Servicios pareja válidos: ${report.validations.couples.valid}/${report.validations.couples.total}`);
    console.log(`  Packs válidos: ${report.validations.packs.valid}/${report.validations.packs.total}`);

    return report;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.SpaDataCorrections = {
        // Correcciones individuales
        correctAllVoucherPrices,
        correctStaffSkills,
        correctSpacesConfiguration,
        correctServicesConfiguration,
        correctLocalVouchersPaymentStatus,

        // Validaciones
        validateCoupleServices,
        validateMixedPacks,

        // Helper
        calculatePrecioFinal,

        // Ejecutor maestro
        runAllCorrections,

        // Shortcuts
        dryRun: () => runAllCorrections({ dryRun: true }),
        apply: () => runAllCorrections({ dryRun: false })
    };

    console.log('[SPA-DATA-CORRECTIONS] ✅ Loaded - Fase 4 Implementation');
    console.log('  → Para ver cambios sin aplicar: SpaDataCorrections.dryRun()');
    console.log('  → Para aplicar cambios reales: SpaDataCorrections.apply()');
}
