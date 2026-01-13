/**
 * spa-matching-tests.js
 * Tests de Validación para Motor de Matching
 * FASE 3 - Testing interno
 */

// ============================================================================
// TEST RUNNER
// ============================================================================

const SpaMatchingTests = {
    results: [],
    passed: 0,
    failed: 0,

    async runAll() {
        console.log('═══════════════════════════════════════════════════');
        console.log('  FASE 3 - TESTS DE MATCHING ENGINE');
        console.log('═══════════════════════════════════════════════════');

        this.results = [];
        this.passed = 0;
        this.failed = 0;

        // Ejecutar todos los tests
        await this.testServiceNormalization();
        await this.testStaffNormalization();
        await this.testSpaceNormalization();
        await this.testPaxMatching();
        await this.testPaymentNormalization();
        await this.testCoupleService();
        await this.testMixedPack();
        await this.testMatchingFlow();

        this.printReport();
        return this.generateReport();
    },

    assert(condition, testName, details = '') {
        if (condition) {
            this.passed++;
            this.results.push({ test: testName, status: 'PASS', details });
            console.log(`  ✅ ${testName}`);
        } else {
            this.failed++;
            this.results.push({ test: testName, status: 'FAIL', details });
            console.log(`  ❌ ${testName} - ${details}`);
        }
    },

    // =========================================================================
    // TEST: Normalización de Servicios
    // =========================================================================
    async testServiceNormalization() {
        console.log('\n📋 TEST: Normalización de Servicios');
        const engine = window.SpaMatchingEngine;

        // Test 1: Servicio individual sin campos nuevos
        const svcIndividual = engine.normalizeService({
            nombre: 'Masaje Relajante',
            categoria: 'masaje',
            duracion: 50,
            espacio: 'panacea'
        });
        this.assert(
            svcIndividual.modalidad === 'individual',
            'Individual: Modalidad inferida correctamente',
            `modalidad=${svcIndividual.modalidad}`
        );
        this.assert(
            svcIndividual.pax === 1,
            'Individual: Pax=1 por defecto',
            `pax=${svcIndividual.pax}`
        );
        this.assert(
            svcIndividual.requires_therapist === true,
            'Individual (masaje): Requiere terapeuta',
            `requires_therapist=${svcIndividual.requires_therapist}`
        );
        this.assert(
            svcIndividual.terapeutas_requeridos === 1,
            'Individual: 1 terapeuta',
            `terapeutas_requeridos=${svcIndividual.terapeutas_requeridos}`
        );

        // Test 2: Circuito (autoservicio)
        const svcCircuito = engine.normalizeService({
            nombre: 'Circuito Spa',
            categoria: 'circuito',
            duracion: 90
        });
        this.assert(
            svcCircuito.requires_therapist === false,
            'Circuito: NO requiere terapeuta',
            `requires_therapist=${svcCircuito.requires_therapist}`
        );
        this.assert(
            svcCircuito.terapeutas_requeridos === 0,
            'Circuito: 0 terapeutas',
            `terapeutas_requeridos=${svcCircuito.terapeutas_requeridos}`
        );

        // Test 3: Servicio pareja
        const svcPareja = engine.normalizeService({
            nombre: 'Masaje Pareja',
            categoria: 'masaje',
            pax: 2,
            duracion: 50
        });
        this.assert(
            svcPareja.modalidad === 'pareja',
            'Pareja: Modalidad inferida de pax=2',
            `modalidad=${svcPareja.modalidad}`
        );
        this.assert(
            svcPareja.terapeutas_requeridos === 2,
            'Pareja (masaje): 2 terapeutas',
            `terapeutas_requeridos=${svcPareja.terapeutas_requeridos}`
        );

        // Test 4: Suite (pareja con 1 terapeuta)
        const svcSuite = engine.normalizeService({
            nombre: 'Suite Romántica',
            categoria: 'suite_privada',
            pax: 2,
            duracion: 90
        });
        this.assert(
            svcSuite.terapeutas_requeridos === 1,
            'Suite: 1 terapeuta aunque sea pareja',
            `terapeutas_requeridos=${svcSuite.terapeutas_requeridos}`
        );

        // Test 5: Pack mixto
        const svcMixto = engine.normalizeService({
            nombre: 'Fantasía para Dos',
            categoria: 'pack_pareja',
            pax: 2,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', duracion: 90, requires_therapist: false },
                { orden: 2, nombre: 'Masaje Pareja', duracion: 50, requires_therapist: true, terapeutas: 2 }
            ]
        });
        this.assert(
            svcMixto.modalidad === 'mixto',
            'Pack: Modalidad=mixto detectada por secuencia',
            `modalidad=${svcMixto.modalidad}`
        );
    },

    // =========================================================================
    // TEST: Normalización de Personal
    // =========================================================================
    async testStaffNormalization() {
        console.log('\n👤 TEST: Normalización de Personal');
        const engine = window.SpaMatchingEngine;

        // Test: Staff sin skills, con salas asignadas
        const staff = engine.normalizeStaff({
            name: 'María López',
            assigned_rooms: ['panacea', 'suite']
        });
        this.assert(
            staff.skills && staff.skills.length > 0,
            'Skills inferidos de assigned_rooms',
            `skills=${staff.skills.join(',')}`
        );
        this.assert(
            staff.skills.includes('masaje'),
            'Skill "masaje" inferido de panacea',
            `skills=${staff.skills.join(',')}`
        );
        this.assert(
            staff.skills.includes('suite'),
            'Skill "suite" inferido de suite',
            `skills=${staff.skills.join(',')}`
        );
    },

    // =========================================================================
    // TEST: Normalización de Salas
    // =========================================================================
    async testSpaceNormalization() {
        console.log('\n🏠 TEST: Normalización de Salas');
        const engine = window.SpaMatchingEngine;

        // Test: Suite sin campos nuevos
        const suite = engine.normalizeSpace({
            name: 'Suite Spa',
            code: 'suite',
            type: 'private',
            capacity: 2
        });
        this.assert(
            suite.compatible_categories && suite.compatible_categories.length > 0,
            'Suite: Categorías compatibles inferidas',
            `categories=${suite.compatible_categories.join(',')}`
        );
        this.assert(
            suite.max_concurrent === 1,
            'Suite (private): max_concurrent=1',
            `max_concurrent=${suite.max_concurrent}`
        );
        this.assert(
            suite.min_spacing === 0,
            'Min spacing por defecto = 0',
            `min_spacing=${suite.min_spacing}`
        );

        // Test: Suite con min_spacing definido
        const suiteWithSpacing = engine.normalizeSpace({
            code: 'suite',
            type: 'private',
            min_spacing: 30
        });
        this.assert(
            suiteWithSpacing.min_spacing === 30,
            'Min spacing respetado cuando está definido',
            `min_spacing=${suiteWithSpacing.min_spacing}`
        );
    },

    // =========================================================================
    // TEST: Matching Pax
    // =========================================================================
    async testPaxMatching() {
        console.log('\n👥 TEST: Matching Pax');
        const engine = window.SpaMatchingEngine;

        // Test: Individual con pax=1
        const match1 = engine.matchServiceToPax({ pax: 1, modalidad: 'individual' }, 1);
        this.assert(match1.valid, 'Individual pax=1 válido', match1.message);

        // Test: Individual con pax=2 (inválido)
        const match2 = engine.matchServiceToPax({ pax: 1, modalidad: 'individual' }, 2);
        this.assert(!match2.valid, 'Individual pax=2 inválido detectado', match2.message);

        // Test: Pareja con pax=2
        const match3 = engine.matchServiceToPax({ pax: 2, modalidad: 'pareja' }, 2);
        this.assert(match3.valid, 'Pareja pax=2 válido', match3.message);
    },

    // =========================================================================
    // TEST: Normalización Estado de Pago
    // =========================================================================
    async testPaymentNormalization() {
        console.log('\n💰 TEST: Estado de Pago');
        const engine = window.SpaMatchingEngine;

        // Test: Bono pagado
        const pagado = engine.normalizeVoucherPayment(
            { precio: 100, importe: 100 },
            { estado_pago: 'pagado', metodo_pago: 'tarjeta' }
        );
        this.assert(
            pagado.estado_pago === 'pagado',
            'Estado pagado establecido',
            `estado_pago=${pagado.estado_pago}`
        );
        this.assert(
            pagado.importe_pagado === 100 && pagado.importe_pendiente === 0,
            'Pagado: importe_pagado=100, pendiente=0',
            `pagado=${pagado.importe_pagado}, pendiente=${pagado.importe_pendiente}`
        );
        this.assert(
            pagado.metodo_pago === 'tarjeta',
            'Método de pago guardado',
            `metodo_pago=${pagado.metodo_pago}`
        );

        // Test: Bono pendiente
        const pendiente = engine.normalizeVoucherPayment(
            { precio: 80 },
            { estado_pago: 'pendiente' }
        );
        this.assert(
            pendiente.importe_pagado === 0 && pendiente.importe_pendiente === 80,
            'Pendiente: importe_pagado=0, pendiente=80',
            `pagado=${pendiente.importe_pagado}, pendiente=${pendiente.importe_pendiente}`
        );

        // Test: Bono parcial
        const parcial = engine.normalizeVoucherPayment(
            { precio: 100 },
            { estado_pago: 'parcial', importe_pagado: 30 }
        );
        this.assert(
            parcial.importe_pagado === 30 && parcial.importe_pendiente === 70,
            'Parcial: importe_pagado=30, pendiente=70',
            `pagado=${parcial.importe_pagado}, pendiente=${parcial.importe_pendiente}`
        );
    },

    // =========================================================================
    // TEST: Servicio Pareja
    // =========================================================================
    async testCoupleService() {
        console.log('\n💑 TEST: Servicio Pareja');
        const engine = window.SpaMatchingEngine;

        const masajePareja = engine.normalizeService({
            nombre: 'Masaje Pareja',
            categoria: 'masaje',
            pax: 2,
            duracion: 50,
            espacio: 'suite'
        });

        this.assert(
            masajePareja.modalidad === 'pareja',
            'Masaje pareja: modalidad=pareja',
            `modalidad=${masajePareja.modalidad}`
        );
        this.assert(
            masajePareja.terapeutas_requeridos === 2,
            'Masaje pareja: requiere 2 terapeutas',
            `terapeutas=${masajePareja.terapeutas_requeridos}`
        );
        this.assert(
            masajePareja.pax === 2,
            'Masaje pareja: pax=2',
            `pax=${masajePareja.pax}`
        );
    },

    // =========================================================================
    // TEST: Pack Mixto
    // =========================================================================
    async testMixedPack() {
        console.log('\n📦 TEST: Pack Mixto');
        const engine = window.SpaMatchingEngine;

        const pack = engine.normalizeService({
            nombre: 'Fantasía para Dos',
            categoria: 'pack_pareja',
            pax: 2,
            items_incluidos: ['Circuito Spa', 'Masaje Pareja', 'Menú'],
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 90, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Pareja', espacio: 'suite', duracion: 50, requires_therapist: true, terapeutas: 2 },
                { orden: 3, nombre: 'Menú', espacio: 'restaurante', duracion: 60, requires_therapist: false, terapeutas: 0 }
            ]
        });

        this.assert(
            pack.modalidad === 'mixto',
            'Pack mixto: modalidad=mixto',
            `modalidad=${pack.modalidad}`
        );
        this.assert(
            pack.secuencia && pack.secuencia.length === 3,
            'Pack mixto: 3 fases',
            `fases=${pack.secuencia?.length}`
        );

        // Validar cálculo de terapeutas (suma de fases)
        const totalTerapeutas = engine.calculateRequiredTherapists(pack);
        this.assert(
            totalTerapeutas === 2,
            'Pack mixto: total 2 terapeutas (solo fase masaje)',
            `total_terapeutas=${totalTerapeutas}`
        );
    },

    // =========================================================================
    // TEST: Flujo Completo de Matching
    // =========================================================================
    async testMatchingFlow() {
        console.log('\n🔄 TEST: Flujo Matching Completo');
        const engine = window.SpaMatchingEngine;

        // Preparar datos mock
        const mockService = {
            id: 'svc_test',
            nombre: 'Masaje Test',
            categoria: 'masaje',
            duracion: 50,
            pax: 1,
            allowed_spaces: ['panacea']
        };

        const mockSpaces = [
            { id: 'sp1', code: 'panacea', type: 'service', capacity: 5, compatible_categories: ['masaje'] }
        ];

        const mockStaff = [
            { id: 'st1', name: 'Test Staff', status: 'active', assigned_rooms: ['panacea'], skills: ['masaje'] }
        ];

        // Test: Matching Sala (con mocks)
        const roomResult = await engine.matchServiceToRooms('svc_test', '2026-01-15', '10:00', {
            service: mockService,
            spaces: mockSpaces,
            bookings: []
        });
        this.assert(
            roomResult.success,
            'Matching sala exitoso con mocks',
            `salas disponibles=${roomResult.availableRooms.length}`
        );

        // Test: Matching Terapeuta (con mocks)
        const therapistResult = await engine.matchServiceToTherapists('svc_test', 'panacea', '2026-01-15', '10:00', 50, {
            service: mockService,
            staff: mockStaff,
            dayBookings: []
        });
        this.assert(
            therapistResult.success,
            'Matching terapeuta exitoso con mocks',
            `terapeutas disponibles=${therapistResult.availableTherapists.length}`
        );
    },

    // =========================================================================
    // REPORT
    // =========================================================================
    printReport() {
        console.log('\n═══════════════════════════════════════════════════');
        console.log(`  RESULTADOS: ${this.passed} PASADOS / ${this.failed} FALLIDOS`);
        console.log('═══════════════════════════════════════════════════');
    },

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.passed + this.failed,
                passed: this.passed,
                failed: this.failed,
                passRate: ((this.passed / (this.passed + this.failed)) * 100).toFixed(1) + '%'
            },
            tests: this.results,
            categories: {
                normalizacion_servicios: this.results.filter(r => r.test.includes('Individual') || r.test.includes('Circuito') || r.test.includes('Pareja') || r.test.includes('Suite') || r.test.includes('Pack')),
                normalizacion_personal: this.results.filter(r => r.test.includes('Skills')),
                normalizacion_salas: this.results.filter(r => r.test.includes('Suite:') || r.test.includes('spacing')),
                matching_pax: this.results.filter(r => r.test.includes('pax')),
                estado_pago: this.results.filter(r => r.test.includes('Pagado') || r.test.includes('Pendiente') || r.test.includes('Parcial') || r.test.includes('Método')),
                matching_flow: this.results.filter(r => r.test.includes('Matching'))
            }
        };
        return report;
    }
};

// Auto-ejecutar si se carga el script
if (typeof window !== 'undefined') {
    window.SpaMatchingTests = SpaMatchingTests;
    console.log('[SPA-MATCHING-TESTS] ✅ Loaded - Run window.SpaMatchingTests.runAll()');
}
