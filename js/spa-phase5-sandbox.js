/**
 * spa-phase5-sandbox.js
 * FASE 5 - Testing Operativo en SANDBOX
 * 
 * Valida el motor de matching con escenarios reales simulados
 * SIN MODIFICAR datos de producción
 */

// ============================================================================
// CONFIGURACIÓN SANDBOX
// ============================================================================

const SANDBOX_CONFIG = {
    // Fechas de prueba (viernes-sábado + festivo)
    TEST_DATES: {
        FRIDAY: '2026-02-13',      // Viernes tarde
        SATURDAY: '2026-02-14',    // San Valentín (sábado)
        HOLIDAY: '2026-02-14'      // Festivo acumulado
    },

    // Horas de operación
    HOURS: {
        MORNING_START: '10:00',
        MORNING_END: '14:00',
        AFTERNOON_START: '16:00',
        AFTERNOON_END: '20:00'
    },

    // Terapeutas simulados
    MOCK_STAFF: [
        { id: 'chon', name: 'Chon', skills: ['masaje', 'facial', 'corporal', 'ritual'], assigned_rooms: ['panacea', 'cabina'], status: 'active' },
        { id: 'mari', name: 'Mari', skills: ['masaje', 'facial', 'corporal', 'ritual', 'suite'], assigned_rooms: ['panacea', 'suite'], status: 'active' },
        { id: 'mar', name: 'Mar', skills: ['masaje', 'facial', 'corporal', 'ritual'], assigned_rooms: ['cabina'], status: 'active' }
    ],

    // Salas
    MOCK_SPACES: [
        { id: 'panacea', code: 'panacea', name: 'Panacea', camillas: 2, max_concurrent: 2, min_spacing: 15, compatible_categories: ['masaje', 'facial', 'corporal', 'ritual', 'envoltura'] },
        { id: 'suite', code: 'suite', name: 'Suite Spa', camillas: 2, max_concurrent: 1, min_spacing: 60, compatible_categories: ['masaje', 'ritual', 'suite', 'pack_pareja', 'hidromasaje'] },
        { id: 'vip', code: 'vip', name: 'Suite VIP', camillas: 2, max_concurrent: 1, min_spacing: 30, compatible_categories: ['masaje', 'ritual', 'suite', 'pack_pareja'] },
        { id: 'spa', code: 'spa', name: 'Circuito SPA', capacity: 16, optimal_capacity: 12, max_concurrent: 16, min_spacing: 0, compatible_categories: ['circuito', 'bono_circuito'] },
        { id: 'cabina', code: 'cabina', name: 'Cabina Tratamientos', camillas: 1, max_concurrent: 1, min_spacing: 15, compatible_categories: ['masaje', 'facial', 'corporal', 'ritual', 'envoltura'] }
    ],

    // Servicios clave (del catálogo real)
    MOCK_SERVICES: {
        // Individuales
        CIRCUITO: { id: 'circuito-60', nombre: 'Circuito SPA 60\'', categoria: 'circuito', duracion: 60, requires_therapist: false, allowed_spaces: ['spa'], pax: 1 },
        MASAJE_30: { id: 'masaje-30', nombre: 'Masaje Relax 30\'', categoria: 'masaje', duracion: 30, requires_therapist: true, terapeutas_requeridos: 1, allowed_spaces: ['panacea', 'cabina', 'suite'], pax: 1 },
        MASAJE_60: { id: 'masaje-60', nombre: 'Masaje Relax 60\'', categoria: 'masaje', duracion: 60, requires_therapist: true, terapeutas_requeridos: 1, allowed_spaces: ['panacea', 'cabina', 'suite'], pax: 1 },

        // Parejas
        MASAJE_PAREJA: { id: 'masaje-pareja', nombre: 'Masaje en Pareja 60\'', categoria: 'masaje', duracion: 60, requires_therapist: true, terapeutas_requeridos: 2, modalidad: 'pareja', allowed_spaces: ['suite', 'panacea'], pax: 2 },

        // Packs
        EXPERIENCIA_SPA_PAREJA: {
            id: 'wc-6905',
            nombre: 'Experiencia SPA en Pareja',
            modalidad: 'pareja',
            pax: 2,
            secuencia: [
                { orden: 1, nombre: 'Circuito Spa', espacio: 'spa', duracion: 60, requires_therapist: false, terapeutas: 0 },
                { orden: 2, nombre: 'Masaje Pareja', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 2 }
            ]
        },

        // Rituales
        RITUAL_CHOCOLATERAPIA: {
            id: 'wc-6501',
            nombre: 'Ritual Chocolaterapia',
            modalidad: 'individual',
            categoria: 'ritual',
            pax: 1,
            duracion_real: 120,
            secuencia: [
                { orden: 1, nombre: 'Peeling', espacio: 'panacea', duracion: 15, requires_therapist: true, terapeutas: 1 },
                { orden: 2, nombre: 'Envoltura', espacio: 'panacea', duracion: 25, requires_therapist: true, terapeutas: 1 },
                { orden: 3, nombre: 'Masaje', espacio: 'panacea', duracion: 30, requires_therapist: true, terapeutas: 1 },
                { orden: 4, nombre: 'Baño', espacio: 'suite', duracion: 20, requires_therapist: false, terapeutas: 0 }
            ]
        }
    }
};

// ============================================================================
// ESCENARIOS DE PRUEBA
// ============================================================================

const TEST_SCENARIOS = {

    // ESCENARIO 1: Viernes tarde normal
    FRIDAY_AFTERNOON: {
        name: 'Viernes Tarde - Carga Normal',
        date: SANDBOX_CONFIG.TEST_DATES.FRIDAY,
        description: 'Validar operación de viernes con mix de servicios',
        bookings: [
            { time: '16:00', service: 'CIRCUITO', pax: 4, client: 'Cliente 1' },
            { time: '16:00', service: 'MASAJE_30', client: 'Cliente 2' },
            { time: '17:00', service: 'CIRCUITO', pax: 6, client: 'Cliente 3' },
            { time: '17:30', service: 'MASAJE_60', client: 'Cliente 4' },
            { time: '18:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 1' },
            { time: '19:00', service: 'CIRCUITO', pax: 3, client: 'Cliente 5' }
        ],
        expected: {
            all_valid: true,
            max_spa_concurrent: 13,
            therapist_conflicts: 0
        }
    },

    // ESCENARIO 2: San Valentín - Carga Máxima
    SAN_VALENTIN_PEAK: {
        name: 'San Valentín - Carga Máxima',
        date: SANDBOX_CONFIG.TEST_DATES.SATURDAY,
        description: 'Stress test: 16 pax spa + parejas + rituales simultáneos',
        bookings: [
            // Mañana: Circuitos llenos
            { time: '10:00', service: 'CIRCUITO', pax: 12, client: 'Grupo 1' },
            { time: '10:00', service: 'EXPERIENCIA_SPA_PAREJA', pax: 2, client in: 'Pareja VIP 1' },
            { time: '10:30', service: 'RITUAL_CHOCOLATERAPIA', client: 'Cliente Ritual' },

            // Mediodía: Pico
            { time: '11:30', service: 'CIRCUITO', pax: 4, client: 'Grupo 2' }, // Total: 16 en spa
            { time: '11:30', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 2' },
            { time: '12:00', service: 'MASAJE_30', client: 'Individual 1' },
            { time: '12:00', service: 'MASAJE_30', client: 'Individual 2' },

            // Tarde: Segunda ola
            { time: '16:00', service: 'CIRCUITO', pax: 10, client: 'Grupo 3' },
            { time: '16:00', service: 'EXPERIENCIA_SPA_PAREJA', pax: 2, client: 'Pareja VIP 2' },
            { time: '17:00', service: 'CIRCUITO', pax: 6, client: 'Grupo 4' }, // Supera 16!
            { time: '17:00', service: 'RITUAL_CHOCOLATERAPIA', client: 'Cliente Ritual 2' },
            { time: '18:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 3' },
            { time: '18:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 4' } // ¿Hay terapeutas?
        ],
        expected: {
            all_valid: false, // Debe detectar overflow
            bottlenecks: ['spa_capacity', 'therapist_availability'],
            max_spa_concurrent: 16
        }
    },

    // ESCENARIO 3: Cuello de botella Panacea
    PANACEA_BOTTLENECK: {
        name: 'Cuello Panacea - 2 camillas',
        date: SANDBOX_CONFIG.TEST_DATES.SATURDAY,
        description: 'Validar max_concurrent=2 en Panacea',
        bookings: [
            { time: '10:00', service: 'MASAJE_60', room_preference: 'panacea', client: 'Cliente 1' },
            { time: '10:00', service: 'MASAJE_60', room_preference: 'panacea', client: 'Cliente 2' },
            { time: '10:30', service: 'MASAJE_60', room_preference: 'panacea', client: 'Cliente 3' }, // Debe rechazar o redirigir
            { time: '11:00', service: 'RITUAL_CHOCOLATERAPIA', client: 'Cliente Ritual' } // Ocupa Panacea 90 min
        ],
        expected: {
            all_valid: false,
            rejected: 1,
            reason: 'max_concurrent exceeded'
        }
    },

    // ESCENARIO 4: Suite min_spacing
    SUITE_SPACING: {
        name: 'Suite - min_spacing 60min',
        date: SANDBOX_CONFIG.TEST_DATES.FRIDAY,
        description: 'Validar que Suite requiere 60 min entre sesiones',
        bookings: [
            { time: '16:00', service: 'MASAJE_PAREJA', room_preference: 'suite', client: 'Pareja 1' }, // 60 min
            { time: '17:00', service: 'MASAJE_PAREJA', room_preference: 'suite', client: 'Pareja 2' }, // Debe fallar (solo 0 min gap)
            { time: '17:30', service: 'MASAJE_PAREJA', room_preference: 'suite', client: 'Pareja 3' }  // Debe fallar (solo 30 min gap)
        ],
        expected: {
            valid_count: 1,
            rejected_count: 2,
            reason: 'min_spacing not respected'
        }
    },

    // ESCENARIO 5: Capacidad Circuito SPA
    SPA_CAPACITY: {
        name: 'Circuito SPA - 12 óptimo / 16 máximo',
        date: SANDBOX_CONFIG.TEST_DATES.SATURDAY,
        description: 'Validar capacidades del circuito',
        bookings: [
            { time: '10:00', service: 'CIRCUITO', pax: 8, client: 'Grupo A' },
            { time: '10:00', service: 'CIRCUITO', pax: 4, client: 'Grupo B' }, // Total: 12 (óptimo)
            { time: '10:30', service: 'CIRCUITO', pax: 4, client: 'Grupo C' }, // Total: 16 (máximo)
            { time: '10:30', service: 'CIRCUITO', pax: 2, client: 'Extra' }    // Total: 18 - DEBE FALLAR
        ],
        expected: {
            valid_count: 3,
            rejected_count: 1,
            max_reached: 16,
            warning_at: 12
        }
    },

    // ESCENARIO 6: Pack Multi-Fase
    PACK_SEQUENCE: {
        name: 'Pack Multi-Fase - Secuencia Completa',
        date: SANDBOX_CONFIG.TEST_DATES.FRIDAY,
        description: 'Validar reservas vinculadas con pack_id',
        bookings: [
            { time: '16:00', service: 'EXPERIENCIA_SPA_PAREJA', pax: 2, client: 'Pareja Pack' }
        ],
        expected: {
            phases_created: 2,
            phase_1: { espacio: 'spa', duracion: 60, terapeutas: 0 },
            phase_2: { espacio: 'panacea', duracion: 30, terapeutas: 2 },
            pack_id_generated: true
        }
    },

    // ESCENARIO 7: Ritual 120 minutos
    RITUAL_DURATION: {
        name: 'Ritual - Duración Real 120min',
        date: SANDBOX_CONFIG.TEST_DATES.SATURDAY,
        description: 'Validar que rituales bloquean recursos 120 min',
        bookings: [
            { time: '10:00', service: 'RITUAL_CHOCOLATERAPIA', client: 'Cliente Ritual' },
            { time: '11:00', service: 'MASAJE_60', room_preference: 'panacea', client: 'Cliente Masaje' } // Debe fallar - Panacea ocupada
        ],
        expected: {
            all_valid: false,
            ritual_blocks_panacea_until: '11:30', // Peeling(15) + Envoltura(25) + Masaje(30) = 70 min en Panacea
            ritual_blocks_suite_from: '11:10',    // Baño empieza después
            rejected: 1
        }
    },

    // ESCENARIO 8: Mix Completo
    FULL_MIX: {
        name: 'Mix Completo - Operación Real',
        date: SANDBOX_CONFIG.TEST_DATES.SATURDAY,
        description: 'Simular día completo San Valentín',
        bookings: [
            // 10:00 - Apertura
            { time: '10:00', service: 'CIRCUITO', pax: 6, client: 'Grupo Mañana 1' },
            { time: '10:00', service: 'EXPERIENCIA_SPA_PAREJA', pax: 2, client: 'Pareja 1' },
            { time: '10:00', service: 'MASAJE_60', client: 'Individual 1' },

            // 11:00
            { time: '11:00', service: 'CIRCUITO', pax: 4, client: 'Grupo Mañana 2' },
            { time: '11:00', service: 'RITUAL_CHOCOLATERAPIA', client: 'Ritual 1' },
            { time: '11:30', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 2' },

            // 12:00
            { time: '12:00', service: 'CIRCUITO', pax: 6, client: 'Grupo Mañana 3' }, // Verifica acumulación
            { time: '12:00', service: 'MASAJE_30', client: 'Individual 2' },
            { time: '12:30', service: 'MASAJE_30', client: 'Individual 3' },

            // 16:00 - Tarde
            { time: '16:00', service: 'CIRCUITO', pax: 8, client: 'Grupo Tarde 1' },
            { time: '16:00', service: 'EXPERIENCIA_SPA_PAREJA', pax: 2, client: 'Pareja 3' },
            { time: '16:30', service: 'RITUAL_CHOCOLATERAPIA', client: 'Ritual 2' },

            // 17:00
            { time: '17:00', service: 'CIRCUITO', pax: 4, client: 'Grupo Tarde 2' },
            { time: '17:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 4' },
            { time: '17:30', service: 'MASAJE_60', client: 'Individual 4' },

            // 18:00
            { time: '18:00', service: 'CIRCUITO', pax: 4, client: 'Grupo Tarde 3' },
            { time: '18:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 5' },
            { time: '18:30', service: 'MASAJE_30', client: 'Individual 5' },

            // 19:00
            { time: '19:00', service: 'CIRCUITO', pax: 2, client: 'Grupo Cierre' },
            { time: '19:00', service: 'MASAJE_PAREJA', pax: 2, client: 'Pareja 6' }
        ],
        expected: {
            total_bookings: 20,
            spa_max_concurrent_morning: 16,
            spa_max_concurrent_afternoon: 14,
            therapist_utilization: { chon: '85%', mari: '90%', mar: '75%' },
            bottlenecks: []
        }
    }
};

// ============================================================================
// MOTOR DE SIMULACIÓN
// ============================================================================

class SandboxSimulator {
    constructor() {
        this.bookings = [];
        this.occupancy = {};
        this.therapistSchedule = {};
        this.logs = [];
        this.errors = [];
        this.warnings = [];
    }

    reset() {
        this.bookings = [];
        this.occupancy = {};
        this.therapistSchedule = {};
        this.logs = [];
        this.errors = [];
        this.warnings = [];
    }

    log(msg, type = 'info') {
        const entry = { time: new Date().toISOString(), type, msg };
        this.logs.push(entry);
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    /**
     * Simula una reserva y verifica disponibilidad
     */
    async simulateBooking(bookingRequest, scenario) {
        const result = {
            valid: false,
            booking: null,
            errors: [],
            warnings: []
        };

        const serviceKey = bookingRequest.service;
        const service = SANDBOX_CONFIG.MOCK_SERVICES[serviceKey];

        if (!service) {
            result.errors.push(`Servicio ${serviceKey} no encontrado`);
            return result;
        }

        const date = scenario.date;
        const time = bookingRequest.time;
        const pax = bookingRequest.pax || service.pax || 1;

        // 1. Verificar sala
        let roomResult;
        if (service.secuencia) {
            // Pack multi-fase
            roomResult = await this.checkPackSequence(service, date, time, bookingRequest);
        } else {
            roomResult = await this.checkRoomAvailability(service, date, time, pax, bookingRequest);
        }

        if (!roomResult.available) {
            result.errors.push(roomResult.reason);
            return result;
        }

        // 2. Verificar terapeutas si necesita
        if (service.requires_therapist) {
            const therapistResult = await this.checkTherapistAvailability(
                service, date, time, roomResult.room, service.duracion
            );

            if (!therapistResult.available) {
                result.errors.push(therapistResult.reason);
                return result;
            }

            result.therapists = therapistResult.assigned;
        }

        // 3. Crear reserva simulada
        result.valid = true;
        result.booking = {
            id: 'SIM_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            date,
            time,
            service: service.nombre,
            room: roomResult.room,
            pax,
            client: bookingRequest.client,
            therapists: result.therapists || [],
            duration: service.duracion || 60,
            phases: roomResult.phases || null
        };

        // Registrar ocupación
        this.registerOccupancy(result.booking);
        this.bookings.push(result.booking);

        return result;
    }

    checkRoomAvailability(service, date, time, pax, request) {
        const result = { available: false, room: null, reason: null };

        const allowedSpaces = service.allowed_spaces || [];
        const preferredRoom = request.room_preference;

        // Buscar sala disponible
        const spacesToCheck = preferredRoom ?
            SANDBOX_CONFIG.MOCK_SPACES.filter(s => s.code === preferredRoom) :
            SANDBOX_CONFIG.MOCK_SPACES.filter(s => allowedSpaces.includes(s.code));

        for (const space of spacesToCheck) {
            const occKey = `${date}_${space.code}_${time}`;
            const currentOcc = this.occupancy[occKey] || 0;

            // Verificar max_concurrent
            if (space.code === 'spa') {
                const totalInSlot = currentOcc + pax;
                if (totalInSlot > space.max_concurrent) {
                    result.reason = `Circuito SPA: ${totalInSlot}/${space.max_concurrent} (máximo excedido)`;
                    continue;
                }
                if (totalInSlot > (space.optimal_capacity || 12)) {
                    this.warnings.push(`Circuito SPA: ${totalInSlot} pax (óptimo: ${space.optimal_capacity})`);
                }
                result.available = true;
                result.room = space.code;
                result.currentOccupancy = totalInSlot;
                return result;
            }

            // Para salas privadas
            if (currentOcc >= (space.max_concurrent || 1)) {
                result.reason = `Sala ${space.code}: ocupada (${currentOcc}/${space.max_concurrent})`;
                continue;
            }

            // Verificar min_spacing
            if (space.min_spacing > 0) {
                const conflictTime = this.checkSpacing(space, date, time, service.duracion || 60);
                if (conflictTime) {
                    result.reason = `Sala ${space.code}: min_spacing ${space.min_spacing}min no respetado (conflicto con ${conflictTime})`;
                    continue;
                }
            }

            result.available = true;
            result.room = space.code;
            return result;
        }

        if (!result.reason) {
            result.reason = 'No hay salas disponibles';
        }

        return result;
    }

    checkSpacing(space, date, time, duration) {
        const startMin = this.timeToMinutes(time);
        const endMin = startMin + duration;
        const spacing = space.min_spacing || 0;

        // Buscar reservas conflictivas
        for (const booking of this.bookings) {
            if (booking.date !== date || booking.room !== space.code) continue;

            const bStart = this.timeToMinutes(booking.time);
            const bEnd = bStart + (booking.duration || 60);

            // Nueva reserva debe empezar después de (bEnd + spacing)
            // O terminar antes de (bStart - spacing)
            if (!(endMin + spacing <= bStart || startMin >= bEnd + spacing)) {
                return booking.time;
            }
        }

        return null;
    }

    async checkPackSequence(service, date, startTime, request) {
        const result = { available: false, room: null, phases: [], reason: null };

        if (!service.secuencia) {
            result.reason = 'Pack sin secuencia';
            return result;
        }

        let currentTime = startTime;
        const phases = [];

        for (const fase of service.secuencia) {
            const pax = request.pax || service.pax || 1;

            const roomCheck = this.checkRoomAvailability(
                { ...service, allowed_spaces: [fase.espacio], duracion: fase.duracion },
                date, currentTime, pax, {}
            );

            if (!roomCheck.available) {
                result.reason = `Fase ${fase.orden} (${fase.nombre}): ${roomCheck.reason}`;
                return result;
            }

            phases.push({
                ...fase,
                hora_inicio: currentTime,
                hora_fin: this.addMinutes(currentTime, fase.duracion),
                room: roomCheck.room
            });

            currentTime = this.addMinutes(currentTime, fase.duracion);
        }

        result.available = true;
        result.phases = phases;
        result.room = phases[0]?.room;

        return result;
    }

    checkTherapistAvailability(service, date, time, room, duration) {
        const result = { available: false, assigned: [], reason: null };

        const required = service.terapeutas_requeridos || 1;
        const startMin = this.timeToMinutes(time);
        const endMin = startMin + (duration || 60);

        const availableTherapists = [];

        for (const therapist of SANDBOX_CONFIG.MOCK_STAFF) {
            // Verificar si está asignado a la sala
            if (therapist.assigned_rooms && !therapist.assigned_rooms.includes(room)) {
                continue;
            }

            // Verificar conflictos
            const schedKey = `${date}_${therapist.id}`;
            const schedule = this.therapistSchedule[schedKey] || [];

            let hasConflict = false;
            for (const slot of schedule) {
                if (!(endMin <= slot.start || startMin >= slot.end)) {
                    hasConflict = true;
                    break;
                }
            }

            if (!hasConflict) {
                availableTherapists.push(therapist);
            }
        }

        if (availableTherapists.length < required) {
            result.reason = `Solo ${availableTherapists.length} terapeutas disponibles (requeridos: ${required})`;
            return result;
        }

        // Asignar terapeutas
        result.available = true;
        result.assigned = availableTherapists.slice(0, required);

        // Registrar en schedule
        for (const t of result.assigned) {
            const schedKey = `${date}_${t.id}`;
            if (!this.therapistSchedule[schedKey]) {
                this.therapistSchedule[schedKey] = [];
            }
            this.therapistSchedule[schedKey].push({ start: startMin, end: endMin });
        }

        return result;
    }

    registerOccupancy(booking) {
        const key = `${booking.date}_${booking.room}_${booking.time}`;
        this.occupancy[key] = (this.occupancy[key] || 0) + (booking.pax || 1);
    }

    timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + (m || 0);
    }

    addMinutes(time, minutes) {
        const total = this.timeToMinutes(time) + minutes;
        const h = Math.floor(total / 60);
        const m = total % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * Ejecuta un escenario completo
     */
    async runScenario(scenarioKey) {
        const scenario = TEST_SCENARIOS[scenarioKey];
        if (!scenario) {
            return { success: false, error: `Escenario ${scenarioKey} no encontrado` };
        }

        this.reset();
        this.log(`\n${'='.repeat(60)}`);
        this.log(`ESCENARIO: ${scenario.name}`);
        this.log(`Fecha: ${scenario.date}`);
        this.log(`${scenario.description}`);
        this.log('='.repeat(60));

        const results = {
            scenario: scenario.name,
            date: scenario.date,
            total: scenario.bookings.length,
            valid: 0,
            rejected: 0,
            bookings: [],
            errors: []
        };

        for (const booking of scenario.bookings) {
            const result = await this.simulateBooking(booking, scenario);

            if (result.valid) {
                results.valid++;
                this.log(`✅ ${booking.time} - ${booking.service} (${booking.client})`);
            } else {
                results.rejected++;
                results.errors.push({ booking, errors: result.errors });
                this.log(`❌ ${booking.time} - ${booking.service} (${booking.client}): ${result.errors.join(', ')}`, 'error');
            }

            results.bookings.push(result);
        }

        // Calcular métricas
        results.metrics = {
            occupancy: { ...this.occupancy },
            therapistUtilization: this.calculateTherapistUtilization(scenario.date),
            warnings: [...this.warnings]
        };

        // Comparar con expected
        if (scenario.expected) {
            results.comparison = this.compareWithExpected(results, scenario.expected);
        }

        this.log(`\nRESULTADO: ${results.valid}/${results.total} válidas, ${results.rejected} rechazadas`);

        return results;
    }

    calculateTherapistUtilization(date) {
        const utilization = {};
        const WORK_HOURS = 8 * 60; // 8 horas en minutos

        for (const therapist of SANDBOX_CONFIG.MOCK_STAFF) {
            const schedKey = `${date}_${therapist.id}`;
            const schedule = this.therapistSchedule[schedKey] || [];

            let totalMinutes = 0;
            for (const slot of schedule) {
                totalMinutes += (slot.end - slot.start);
            }

            utilization[therapist.name] = Math.round((totalMinutes / WORK_HOURS) * 100) + '%';
        }

        return utilization;
    }

    compareWithExpected(results, expected) {
        const comparison = { passed: true, details: [] };

        if (expected.all_valid !== undefined) {
            const allValid = results.rejected === 0;
            if (allValid !== expected.all_valid) {
                comparison.passed = false;
                comparison.details.push(`all_valid: esperado ${expected.all_valid}, obtenido ${allValid}`);
            }
        }

        if (expected.rejected_count !== undefined) {
            if (results.rejected !== expected.rejected_count) {
                comparison.passed = false;
                comparison.details.push(`rejected: esperado ${expected.rejected_count}, obtenido ${results.rejected}`);
            }
        }

        if (expected.valid_count !== undefined) {
            if (results.valid !== expected.valid_count) {
                comparison.passed = false;
                comparison.details.push(`valid: esperado ${expected.valid_count}, obtenido ${results.valid}`);
            }
        }

        return comparison;
    }

    /**
     * Ejecuta todos los escenarios
     */
    async runAllScenarios() {
        const allResults = {
            timestamp: new Date().toISOString(),
            scenarios: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                bottlenecks: []
            }
        };

        console.log('\n' + '═'.repeat(70));
        console.log('  FASE 5 - SANDBOX TESTING');
        console.log('═'.repeat(70));

        for (const key of Object.keys(TEST_SCENARIOS)) {
            const result = await this.runScenario(key);
            allResults.scenarios[key] = result;
            allResults.summary.total++;

            if (result.comparison?.passed !== false) {
                allResults.summary.passed++;
            } else {
                allResults.summary.failed++;
            }
        }

        console.log('\n' + '═'.repeat(70));
        console.log('  RESUMEN FINAL');
        console.log('═'.repeat(70));
        console.log(`Escenarios: ${allResults.summary.passed}/${allResults.summary.total} pasados`);

        return allResults;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.SpaPhase5Sandbox = {
        CONFIG: SANDBOX_CONFIG,
        SCENARIOS: TEST_SCENARIOS,
        Simulator: SandboxSimulator,

        // Quick runners
        runAll: async () => {
            const simulator = new SandboxSimulator();
            return await simulator.runAllScenarios();
        },

        runScenario: async (key) => {
            const simulator = new SandboxSimulator();
            return await simulator.runScenario(key);
        }
    };

    console.log('[SPA-PHASE5-SANDBOX] ✅ Loaded');
    console.log('  → Ejecutar todo: SpaPhase5Sandbox.runAll()');
    console.log('  → Ejecutar uno: SpaPhase5Sandbox.runScenario("SCENARIO_KEY")');
}
