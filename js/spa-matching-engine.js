/**
 * spa-matching-engine.js
 * Motor de Matching para Sistema Spa
 * Implementa la lógica definida en modelo-operativo.txt
 * 
 * FASE 3 - Solo lógica, sin UI
 */

// ============================================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================================

const SPA_MODALIDADES = {
    INDIVIDUAL: 'individual',
    PAREJA: 'pareja',
    MIXTO: 'mixto'
};

const SPA_ESTADO_PAGO = {
    PAGADO: 'pagado',
    PENDIENTE: 'pendiente',
    PARCIAL: 'parcial'
};

const SPA_METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'bizum'];

// Skills por defecto inferidas de categorías
const CATEGORY_TO_SKILL_MAP = {
    'circuito': 'circuito',
    'bono_circuito': 'circuito',
    'masaje': 'masaje',
    'bono_masaje': 'masaje',
    'facial': 'facial',
    'bono_facial': 'facial',
    'corporal': 'corporal',
    'bono_corporal': 'corporal',
    'ritual': 'ritual',
    'suite_privada': 'suite',
    'pack_pareja': 'suite',
    'pack_hosteleria': 'suite',
    'manicura': 'manicura',
    'pedicura': 'manicura',
    'peluqueria': 'peluqueria',
    'depilacion': 'depilacion',
    'maquillaje': 'maquillaje'
};

// Categorías que NO requieren terapeuta (autoservicio)
const AUTOSERVICE_CATEGORIES = ['circuito', 'bono_circuito', 'gimnasio', 'bono_gimnasio'];

// === COMPLEMENT DETECTION ===
// Keywords for detecting complements/extras (not reservable, only consumable)
const COMPLEMENT_KEYWORDS = /(botella|cava|vino|champagne|champán|ramo|flores|fruta|bombones|chocolate|detalle|benjamín|benjamin|regalo|extra|accesorio|toalla|albornoz|amenities|spa kit)/i;

/**
 * Detecta si un servicio/item es un complemento (no reservable)
 * @param {Object} item - Servicio o item
 * @returns {boolean} - true si es complemento
 */
function isComplement(item) {
    if (!item) return false;

    // Explicit flags
    if (item.tipo === 'complemento') return true;
    if (item.reservable === false) return true;
    if (item.codigo && item.codigo.startsWith('ext.')) return true;

    // Space/category based
    const space = (item.espacio || item.space || '').toLowerCase();
    if (space === 'complemento' || space === 'extra') return true;

    // Name based
    const name = (item.nombre || item.name || '').toLowerCase();
    if (name.match(COMPLEMENT_KEYWORDS)) return true;

    return false;
}

// ============================================================================
// MÓDULO DE NORMALIZACIÓN DE SERVICIOS
// ============================================================================

/**
 * Normaliza un servicio añadiendo campos del modelo operativo si faltan
 * @param {Object} service - Servicio de spa_services
 * @returns {Object} - Servicio con campos normalizados
 */
function normalizeServiceForMatching(service) {
    if (!service) return null;

    const s = { ...service };

    // 1. Modalidad
    if (!s.modalidad) {
        const pax = parseInt(s.pax || s.personas || 1);
        s.modalidad = pax >= 2 ? SPA_MODALIDADES.PAREJA : SPA_MODALIDADES.INDIVIDUAL;
        // Detectar mixto por secuencia o items_incluidos > 1
        if ((s.secuencia && s.secuencia.length > 1) ||
            (s.items_incluidos && s.items_incluidos.length > 1)) {
            s.modalidad = SPA_MODALIDADES.MIXTO;
        }
    }

    // 2. PAX
    if (s.pax === undefined || s.pax === null) {
        s.pax = s.modalidad === SPA_MODALIDADES.PAREJA ? 2 : 1;
    }

    // 3. Requires Therapist
    if (s.requires_therapist === undefined) {
        const cat = (s.categoria || '').toLowerCase();
        s.requires_therapist = !AUTOSERVICE_CATEGORIES.includes(cat);
    }

    // 4. Terapeutas Requeridos
    if (s.terapeutas_requeridos === undefined || s.terapeutas_requeridos === -1) {
        s.terapeutas_requeridos = calculateRequiredTherapists(s);
    }

    // 5. Duration Total
    if (!s.duration_total) {
        s.duration_total = parseInt(s.duracion || 60);
    }

    // 6. Allowed Spaces (from legacy espacio field)
    if (!s.allowed_spaces || s.allowed_spaces.length === 0) {
        if (s.allowedSpaces && s.allowedSpaces.length > 0) {
            s.allowed_spaces = s.allowedSpaces;
        } else if (s.espacio) {
            s.allowed_spaces = [s.espacio];
        } else {
            s.allowed_spaces = ['spa']; // Default
        }
    }

    // 7. Allowed Therapists (optional - null means any)
    if (s.allowed_therapists === undefined) {
        s.allowed_therapists = null;
    }

    return s;
}

/**
 * Calcula terapeutas requeridos según reglas del modelo
 */
function calculateRequiredTherapists(service) {
    if (!service.requires_therapist) return 0;

    const cat = (service.categoria || '').toLowerCase();
    const modalidad = service.modalidad;

    // Mixto: sumar de secuencia
    if (modalidad === SPA_MODALIDADES.MIXTO && service.secuencia) {
        return service.secuencia.reduce((sum, fase) => {
            return sum + (fase.terapeutas || (fase.requires_therapist ? 1 : 0));
        }, 0);
    }

    // Pareja
    if (modalidad === SPA_MODALIDADES.PAREJA) {
        // Suite: 1 terapeuta para 2 personas
        if (cat.includes('suite') || cat.includes('privada')) return 1;
        // Masaje pareja: 2 terapeutas
        if (cat.includes('masaje')) return 2;
        // Otros tratamientos pareja: 1 por defecto
        return 1;
    }

    // Individual con tratamiento
    return service.requires_therapist ? 1 : 0;
}

// ============================================================================
// MÓDULO DE NORMALIZACIÓN DE PERSONAL
// ============================================================================

/**
 * Normaliza un terapeuta añadiendo campo skills si falta
 * @param {Object} staff - Terapeuta de spa_staff
 * @returns {Object} - Terapeuta con skills normalizados
 */
function normalizeStaffForMatching(staff) {
    if (!staff) return null;

    const s = { ...staff };

    // Inferir skills de assigned_rooms si no existen
    if (!s.skills || s.skills.length === 0) {
        s.skills = inferSkillsFromRooms(s.assigned_rooms || []);
    }

    return s;
}

/**
 * Infiere skills basándose en las salas asignadas
 */
function inferSkillsFromRooms(rooms) {
    const skills = new Set();

    rooms.forEach(room => {
        const roomLower = (room || '').toLowerCase();
        if (roomLower.includes('panacea') || roomLower.includes('cabina')) {
            skills.add('masaje');
            skills.add('facial');
            skills.add('corporal');
            skills.add('ritual');
        }
        if (roomLower.includes('suite') || roomLower.includes('vip')) {
            skills.add('suite');
            skills.add('masaje');
            skills.add('ritual');
        }
        if (roomLower.includes('peluqueria')) {
            skills.add('peluqueria');
        }
        if (roomLower.includes('spa')) {
            skills.add('circuito');
        }
    });

    return Array.from(skills);
}

// ============================================================================
// MÓDULO DE NORMALIZACIÓN DE SALAS
// ============================================================================

/**
 * Normaliza una sala añadiendo campos del modelo si faltan
 */
function normalizeSpaceForMatching(space) {
    if (!space) return null;

    const s = { ...space };

    // Compatible categories
    if (!s.compatible_categories || s.compatible_categories.length === 0) {
        s.compatible_categories = inferCategoriesFromSpaceType(s);
    }

    // Max concurrent
    if (s.max_concurrent === undefined) {
        s.max_concurrent = inferMaxConcurrent(s);
    }

    // Min spacing (default 0)
    if (s.min_spacing === undefined) {
        s.min_spacing = 0;
    }

    return s;
}

function inferCategoriesFromSpaceType(space) {
    const type = (space.type || '').toLowerCase();
    const code = (space.code || '').toLowerCase();

    if (code.includes('suite') || code.includes('vip')) {
        return ['masaje', 'ritual', 'suite', 'pack_pareja'];
    }
    if (code.includes('panacea') || code.includes('cabina')) {
        return ['masaje', 'facial', 'corporal', 'ritual'];
    }
    if (code.includes('peluqueria')) {
        return ['peluqueria', 'manicura', 'pedicura', 'maquillaje'];
    }
    if (code.includes('spa')) {
        return ['circuito', 'bono_circuito', 'gimnasio'];
    }
    if (code.includes('restaurante')) {
        return ['restaurante', 'menu'];
    }

    return ['all']; // Default: acepta todo
}

function inferMaxConcurrent(space) {
    const type = (space.type || '').toLowerCase();
    if (type === 'private') return 1;
    if (type === 'service') return space.capacity || 5;
    if (type === 'circuit') return space.capacity || 20;
    return space.capacity || 10;
}

// ============================================================================
// MATCHING ENGINE - CORE LOGIC
// ============================================================================

/**
 * MATCHING 7.1: Servicio → Sala
 * Encuentra salas disponibles para un servicio en fecha/hora
 */
async function matchServiceToRooms(serviceId, date, time, options = {}) {
    const result = {
        success: false,
        availableRooms: [],
        errors: [],
        debug: []
    };

    try {
        // 1. Obtener servicio
        let service = options.service;
        if (!service && typeof db !== 'undefined') {
            const doc = await db.collection('spa_services').doc(serviceId).get();
            if (!doc.exists) {
                result.errors.push(`Servicio ${serviceId} no encontrado`);
                return result;
            }
            service = { id: doc.id, ...doc.data() };
        }

        service = normalizeServiceForMatching(service);
        result.debug.push(`Servicio normalizado: ${service.nombre}, allowed_spaces: ${service.allowed_spaces.join(',')}`);

        // 2. Obtener salas permitidas
        const allowedSpaces = service.allowed_spaces || [];
        if (allowedSpaces.length === 0) {
            result.errors.push('Servicio sin salas permitidas definidas');
            return result;
        }

        // 3. Cargar salas de Firestore
        let spaces = options.spaces;
        if (!spaces && typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_spaces').get();
            spaces = [];
            snapshot.forEach(doc => spaces.push({ id: doc.id, ...doc.data() }));
        }
        spaces = spaces.map(normalizeSpaceForMatching);

        // 4. Filtrar por allowed_spaces
        const candidateSpaces = spaces.filter(s =>
            allowedSpaces.includes(s.code) || allowedSpaces.includes(s.id)
        );
        result.debug.push(`Salas candidatas: ${candidateSpaces.length}`);

        // 5. Verificar compatibilidad de categoría
        const serviceCategory = (service.categoria || '').toLowerCase();
        const compatibleSpaces = candidateSpaces.filter(s => {
            if (s.compatible_categories.includes('all')) return true;
            return s.compatible_categories.some(cat =>
                cat === serviceCategory || serviceCategory.includes(cat)
            );
        });
        result.debug.push(`Salas compatibles por categoría: ${compatibleSpaces.length}`);

        // 6. Verificar disponibilidad (max_concurrent + min_spacing)
        const duration = service.duration_total || 60;
        const availableSpaces = [];

        for (const space of compatibleSpaces) {
            const isAvailable = await checkRoomAvailability(space, date, time, duration, options);
            if (isAvailable.available) {
                availableSpaces.push({
                    ...space,
                    availability: isAvailable
                });
            } else {
                result.debug.push(`Sala ${space.code} no disponible: ${isAvailable.reason}`);
            }
        }

        result.availableRooms = availableSpaces;
        result.success = availableSpaces.length > 0;
        result.debug.push(`Salas disponibles finales: ${availableSpaces.length}`);

    } catch (err) {
        result.errors.push(`Error en matching sala: ${err.message}`);
    }

    return result;
}

/**
 * Verifica disponibilidad de una sala específica
 */
async function checkRoomAvailability(space, date, time, duration, options = {}) {
    const result = { available: true, reason: null, conflicts: [] };

    try {
        // Obtener reservas existentes para esa sala y fecha
        let bookings = options.bookings;
        if (!bookings && typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_bookings')
                .where('room', '==', space.code)
                .where('date', '==', date)
                .get();
            bookings = [];
            snapshot.forEach(doc => bookings.push({ id: doc.id, ...doc.data() }));
        }
        bookings = bookings || [];

        // Contar reservas simultáneas
        const startMinutes = timeToMinutes(time);
        const endMinutes = startMinutes + duration;
        const minSpacing = space.min_spacing || 0;

        let concurrent = 0;
        for (const booking of bookings) {
            const bStart = timeToMinutes(booking.time);
            const bEnd = bStart + (booking.duration || 60);

            // Check overlap including spacing
            const effectiveStart = startMinutes;
            const effectiveEnd = endMinutes + minSpacing;
            const bEffectiveEnd = bEnd + minSpacing;

            if (!(effectiveEnd <= bStart || effectiveStart >= bEffectiveEnd)) {
                concurrent++;
                result.conflicts.push(booking);
            }
        }

        if (concurrent >= (space.max_concurrent || 1)) {
            result.available = false;
            result.reason = `Máximo ${space.max_concurrent} reservas simultáneas alcanzado (actual: ${concurrent})`;
        }

    } catch (err) {
        result.available = false;
        result.reason = `Error verificando disponibilidad: ${err.message}`;
    }

    return result;
}

/**
 * MATCHING 7.2: Servicio → Terapeuta
 * Encuentra terapeutas disponibles para un servicio
 */
async function matchServiceToTherapists(serviceId, roomCode, date, time, duration, options = {}) {
    const result = {
        success: false,
        availableTherapists: [],
        requiredCount: 0,
        errors: [],
        debug: []
    };

    try {
        // 1. Obtener servicio
        let service = options.service;
        if (!service && typeof db !== 'undefined') {
            const doc = await db.collection('spa_services').doc(serviceId).get();
            if (doc.exists) service = { id: doc.id, ...doc.data() };
        }

        service = normalizeServiceForMatching(service);
        result.requiredCount = service.terapeutas_requeridos || 0;

        // Si no requiere terapeuta, retornar éxito vacío
        if (!service.requires_therapist) {
            result.success = true;
            result.debug.push('Servicio no requiere terapeuta');
            return result;
        }

        result.debug.push(`Requiere ${result.requiredCount} terapeuta(s)`);

        // 2. Obtener terapeutas activos
        let staff = options.staff;
        if (!staff && typeof db !== 'undefined') {
            const snapshot = await db.collection('spa_staff')
                .where('status', '==', 'active')
                .get();
            staff = [];
            snapshot.forEach(doc => staff.push({ id: doc.id, ...doc.data() }));
        }
        staff = staff.map(normalizeStaffForMatching);
        result.debug.push(`Terapeutas activos: ${staff.length}`);

        // 3. Filtrar por allowed_therapists si está definido
        if (service.allowed_therapists && service.allowed_therapists.length > 0) {
            staff = staff.filter(s => service.allowed_therapists.includes(s.id));
            result.debug.push(`Filtrado por allowed_therapists: ${staff.length}`);
        }

        // 4. Filtrar por sala asignada
        staff = staff.filter(s => {
            const assigned = s.assigned_rooms || [];
            // Si no tiene salas asignadas, es "flotante" (disponible para todo)
            if (assigned.length === 0) return true;
            return assigned.some(r =>
                r.toLowerCase() === roomCode.toLowerCase() ||
                r.toLowerCase().includes(roomCode.toLowerCase())
            );
        });
        result.debug.push(`Filtrado por sala ${roomCode}: ${staff.length}`);

        // 5. Filtrar por skill
        // Buscamos si hay una habilidad específica requerida (prioridad: service field > item master field > category fallback)
        let requiredSkill = service.required_skill || service.skill;

        if (!requiredSkill && typeof db !== 'undefined') {
            // Intentar buscar en Master Items si no viene en el servicio
            try {
                const itemConfig = await window.getItemConfig(service.nombre);
                if (itemConfig && itemConfig.required_skill) {
                    requiredSkill = itemConfig.required_skill;
                }
            } catch (e) {
                console.warn("No se pudo consultar Item Master para skill:", e);
            }
        }

        if (!requiredSkill) {
            const serviceCategory = (service.categoria || '').toLowerCase();
            requiredSkill = CATEGORY_TO_SKILL_MAP[serviceCategory] || serviceCategory;
        }

        staff = staff.filter(s => {
            const skills = s.skills || [];
            // Si no tiene skills definidos, asumimos que puede hacer todo
            if (skills.length === 0) return true;
            return skills.some(skill =>
                skill.toLowerCase() === requiredSkill ||
                skill.toLowerCase().includes(requiredSkill)
            );
        });
        result.debug.push(`Filtrado por skill ${requiredSkill}: ${staff.length}`);

        // 6. Verificar disponibilidad horaria y conflictos
        const available = [];
        for (const therapist of staff) {
            const availability = await checkTherapistAvailability(
                therapist, date, time, duration, options
            );
            if (availability.available) {
                available.push({
                    ...therapist,
                    availability
                });
            } else {
                result.debug.push(`Terapeuta ${therapist.name} no disponible: ${availability.reason}`);
            }
        }

        result.availableTherapists = available;
        result.success = available.length >= result.requiredCount;
        result.debug.push(`Terapeutas disponibles: ${available.length}, requeridos: ${result.requiredCount}`);

    } catch (err) {
        result.errors.push(`Error en matching terapeuta: ${err.message}`);
    }

    return result;
}

/**
 * Verifica disponibilidad de un terapeuta específico
 */
async function checkTherapistAvailability(therapist, date, time, duration, options = {}) {
    const result = { available: true, reason: null };

    try {
        // 1. Verificar horario del día
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];

        // Verificar excepciones
        if (typeof db !== 'undefined' && !options.skipExceptions) {
            try {
                const exceptionsSnapshot = await db.collection('spa_staff_availability')
                    .where('staff_id', '==', therapist.id)
                    .where('date', '==', date)
                    .get();

                if (!exceptionsSnapshot.empty) {
                    const exception = exceptionsSnapshot.docs[0].data();
                    if (exception.status === 'unavailable' || exception.status === 'off' ||
                        exception.status === 'vacation' || exception.status === 'sick') {
                        result.available = false;
                        result.reason = `Estado del día: ${exception.status}`;
                        return result;
                    }
                    if (exception.status === 'custom' && exception.custom_schedule) {
                        const inShift = isTimeInShifts(time, exception.custom_schedule.shifts || [], duration);
                        if (!inShift) {
                            result.available = false;
                            result.reason = 'Fuera de horario personalizado';
                            return result;
                        }
                    }
                }
            } catch (e) {
                // Ignorar error de excepciones, continuar con horario por defecto
            }
        }

        // Verificar horario por defecto
        const schedule = therapist.default_schedule || {};
        const daySchedule = schedule[dayOfWeek];

        if (!daySchedule || !daySchedule.enabled) {
            // Fallback: si no hay horario definido, asumir disponible (legacy)
            if (!daySchedule) {
                result.available = true;
            } else {
                result.available = false;
                result.reason = `No trabaja los ${dayOfWeek}`;
            }
        } else {
            const inShift = isTimeInShifts(time, daySchedule.shifts || [], duration);
            if (!inShift) {
                result.available = false;
                result.reason = 'Fuera de turno';
            }
        }

        // 2. Verificar conflictos con otras reservas
        if (result.available && typeof db !== 'undefined') {
            let existingBookings = options.dayBookings;
            if (!existingBookings) {
                const bookingsSnapshot = await db.collection('spa_bookings')
                    .where('date', '==', date)
                    .get();
                existingBookings = [];
                bookingsSnapshot.forEach(doc => existingBookings.push({ id: doc.id, ...doc.data() }));
            }

            const startMin = timeToMinutes(time);
            const endMin = startMin + duration;

            for (const booking of existingBookings) {
                // Verificar si este terapeuta está en la reserva
                const isAssigned = booking.staff_id === therapist.id ||
                    (booking.terapeutas && booking.terapeutas.some(t => t.id === therapist.id));

                if (isAssigned) {
                    const bStart = timeToMinutes(booking.time);
                    const bEnd = bStart + (booking.duration || 60);

                    if (!(endMin <= bStart || startMin >= bEnd)) {
                        result.available = false;
                        result.reason = `Conflicto con reserva existente (${booking.time})`;
                        break;
                    }
                }
            }
        }

    } catch (err) {
        result.available = false;
        result.reason = `Error: ${err.message}`;
    }

    return result;
}

/**
 * MATCHING 7.3: Servicio → Pax
 * Valida que el pax de la reserva coincida con el servicio
 */
function matchServiceToPax(service, requestedPax) {
    const normalizedService = normalizeServiceForMatching(service);
    const servicePax = normalizedService.pax || 1;

    return {
        valid: requestedPax === servicePax ||
            (normalizedService.modalidad === SPA_MODALIDADES.MIXTO && requestedPax <= servicePax),
        servicePax,
        requestedPax,
        modalidad: normalizedService.modalidad,
        message: requestedPax === servicePax ?
            'PAX válido' :
            `PAX inválido: servicio requiere ${servicePax}, solicitado ${requestedPax}`
    };
}

/**
 * MATCHING 7.4: Servicio → Secuencia (Packs Mixtos)
 * Valida y planifica todas las fases de un pack
 */
async function matchPackSequence(serviceId, date, startTime, options = {}) {
    const result = {
        success: false,
        phases: [],
        totalDuration: 0,
        errors: [],
        debug: []
    };

    try {
        // 1. Obtener servicio
        let service = options.service;
        if (!service && typeof db !== 'undefined') {
            const doc = await db.collection('spa_services').doc(serviceId).get();
            if (doc.exists) service = { id: doc.id, ...doc.data() };
        }

        service = normalizeServiceForMatching(service);

        if (service.modalidad !== SPA_MODALIDADES.MIXTO || !service.secuencia) {
            result.errors.push('Servicio no es pack mixto o no tiene secuencia');
            return result;
        }

        const secuencia = service.secuencia.sort((a, b) => (a.orden || 0) - (b.orden || 0));
        result.debug.push(`Pack con ${secuencia.length} fases`);

        // 2. Procesar cada fase
        let currentTime = startTime;
        let allAvailable = true;

        for (const fase of secuencia) {
            const phaseResult = {
                orden: fase.orden,
                nombre: fase.nombre,
                espacio: fase.espacio,
                duracion: fase.duracion || 30,
                hora_inicio: currentTime,
                hora_fin: addMinutesToTime(currentTime, fase.duracion || 30),
                requires_therapist: fase.requires_therapist !== false,
                terapeutas_requeridos: fase.terapeutas || (fase.requires_therapist ? 1 : 0),
                room_available: false,
                therapists_available: []
            };

            // Matching sala para esta fase
            const roomMatch = await matchServiceToRooms(serviceId, date, currentTime, {
                ...options,
                service: {
                    ...service,
                    allowed_spaces: [fase.espacio],
                    duration_total: fase.duracion
                }
            });

            if (roomMatch.success) {
                phaseResult.room_available = true;
                phaseResult.room = roomMatch.availableRooms[0];
            } else {
                allAvailable = false;
                result.debug.push(`Fase ${fase.orden} (${fase.nombre}): Sala no disponible`);
            }

            // Matching terapeuta si requiere
            if (phaseResult.requires_therapist && phaseResult.room_available) {
                const therapistMatch = await matchServiceToTherapists(
                    serviceId, fase.espacio, date, currentTime, fase.duracion,
                    {
                        ...options,
                        service: {
                            ...service,
                            requires_therapist: true,
                            terapeutas_requeridos: phaseResult.terapeutas_requeridos,
                            categoria: inferCategoryFromPhaseName(fase.nombre)
                        }
                    }
                );

                if (therapistMatch.success) {
                    phaseResult.therapists_available = therapistMatch.availableTherapists;
                } else {
                    allAvailable = false;
                    result.debug.push(`Fase ${fase.orden} (${fase.nombre}): Terapeuta no disponible`);
                }
            }

            result.phases.push(phaseResult);
            result.totalDuration += fase.duracion || 30;
            currentTime = phaseResult.hora_fin;
        }

        result.success = allAvailable;
        result.debug.push(`Pack ${allAvailable ? 'disponible' : 'NO disponible'}`);

    } catch (err) {
        result.errors.push(`Error en matching pack: ${err.message}`);
    }

    return result;
}

// ============================================================================
// UTILIDADES DE TIEMPO
// ============================================================================

function timeToMinutes(time) {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutesToTime(time, minutes) {
    return minutesToTime(timeToMinutes(time) + minutes);
}

function isTimeInShifts(time, shifts, duration = 0) {
    if (!shifts || shifts.length === 0) return true;

    const startMin = timeToMinutes(time);
    const endMin = startMin + duration;

    return shifts.some(shift => {
        const shiftStart = timeToMinutes(shift.start);
        const shiftEnd = timeToMinutes(shift.end);
        return startMin >= shiftStart && endMin <= shiftEnd;
    });
}

function inferCategoryFromPhaseName(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('masaje')) return 'masaje';
    if (lower.includes('facial')) return 'facial';
    if (lower.includes('circuito') || lower.includes('spa')) return 'circuito';
    if (lower.includes('ritual')) return 'ritual';
    if (lower.includes('menu') || lower.includes('restaurante')) return 'restaurante';
    return 'servicio';
}

// ============================================================================
// GENERADOR DE RESERVAS VINCULADAS
// ============================================================================

/**
 * Genera reservas vinculadas para un pack mixto
 */
function generateLinkedBookings(packSequenceResult, clientData, voucherCode = null) {
    if (!packSequenceResult.success || packSequenceResult.phases.length === 0) {
        return { success: false, bookings: [], errors: ['Pack no disponible'] };
    }

    const packId = 'PACK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const bookings = [];

    packSequenceResult.phases.forEach((phase, index) => {
        const booking = {
            // Datos estándar
            room: phase.espacio,
            date: clientData.date,
            time: phase.hora_inicio,
            duration: phase.duracion,
            client_name: clientData.client_name,
            client_phone: clientData.client_phone,
            client_email: clientData.client_email || '',
            service: phase.nombre,
            pax: clientData.pax || 1,
            voucher_code: voucherCode,
            status: 'confirmed',
            notes: `Fase ${phase.orden} de pack`,
            created_at: new Date().toISOString(),

            // Campos nuevos del modelo
            salas: [phase.espacio],
            terapeutas: phase.therapists_available.slice(0, phase.terapeutas_requeridos).map(t => ({
                id: t.id,
                name: t.name
            })),
            items: [{ name: phase.nombre, completed: false }],
            precio: 0, // Se distribuye del precio total
            pack_id: packId,
            fase_orden: phase.orden,

            // Legacy compatibility
            staff_id: phase.therapists_available[0]?.id || null,
            staff_name: phase.therapists_available[0]?.name || null
        };

        bookings.push(booking);
    });

    return {
        success: true,
        bookings,
        packId,
        totalPhases: packSequenceResult.phases.length
    };
}

// ============================================================================
// NORMALIZACIÓN DE BONOS LOCALES (ESTADO PAGO)
// ============================================================================

/**
 * Normaliza campos de pago en un bono local
 * SOPORTA: string | number | null | undefined | boolean | object
 */
function normalizeVoucherPayment(voucher, paymentData = {}) {
    const v = { ...voucher };

    // Normalizar estado_pago desde cualquier tipo de entrada
    let rawEstado = paymentData.estado_pago ?? v.estado_pago;

    // Convertir a string normalizado
    if (rawEstado === null || rawEstado === undefined) {
        v.estado_pago = SPA_ESTADO_PAGO.PENDIENTE;
    } else if (typeof rawEstado === 'boolean') {
        // true = pagado, false = pendiente
        v.estado_pago = rawEstado ? SPA_ESTADO_PAGO.PAGADO : SPA_ESTADO_PAGO.PENDIENTE;
    } else if (typeof rawEstado === 'number') {
        // 0 = pendiente, 1 = pagado, 2 = parcial
        const numMap = { 0: SPA_ESTADO_PAGO.PENDIENTE, 1: SPA_ESTADO_PAGO.PAGADO, 2: SPA_ESTADO_PAGO.PARCIAL };
        v.estado_pago = numMap[rawEstado] || SPA_ESTADO_PAGO.PENDIENTE;
    } else if (typeof rawEstado === 'object') {
        // Si es objeto, intentar extraer .estado o .value
        const extracted = rawEstado.estado || rawEstado.value || rawEstado.status || null;
        v.estado_pago = (typeof extracted === 'string') ? extracted.toLowerCase() : SPA_ESTADO_PAGO.PENDIENTE;
    } else if (typeof rawEstado === 'string') {
        // Normalizar string
        const normalized = rawEstado.toLowerCase().trim();
        if (['pagado', 'paid', 'completed', 'complete'].includes(normalized)) {
            v.estado_pago = SPA_ESTADO_PAGO.PAGADO;
        } else if (['parcial', 'partial'].includes(normalized)) {
            v.estado_pago = SPA_ESTADO_PAGO.PARCIAL;
        } else {
            v.estado_pago = SPA_ESTADO_PAGO.PENDIENTE;
        }
    } else {
        // Fallback
        v.estado_pago = SPA_ESTADO_PAGO.PENDIENTE;
    }

    // Método de pago
    let rawMetodo = paymentData.metodo_pago ?? v.metodo_pago;
    if (typeof rawMetodo === 'string' && SPA_METODOS_PAGO.includes(rawMetodo.toLowerCase())) {
        v.metodo_pago = rawMetodo.toLowerCase();
    } else {
        v.metodo_pago = null;
    }

    // Importes - usar snapshot_price si existe, sino precio/importe
    const totalPrice = parseFloat(v.snapshot_price) || parseFloat(v.precio) || parseFloat(v.importe) || 0;

    if (v.estado_pago === SPA_ESTADO_PAGO.PAGADO) {
        v.importe_pagado = totalPrice;
        v.importe_pendiente = 0;
        v.fecha_pago = paymentData.fecha_pago || v.fecha_pago || new Date().toISOString();
    } else if (v.estado_pago === SPA_ESTADO_PAGO.PENDIENTE) {
        v.importe_pagado = 0;
        v.importe_pendiente = totalPrice;
        v.fecha_pago = null;
    } else if (v.estado_pago === SPA_ESTADO_PAGO.PARCIAL) {
        v.importe_pagado = parseFloat(paymentData.importe_pagado) || parseFloat(v.importe_pagado) || 0;
        v.importe_pendiente = totalPrice - v.importe_pagado;
        v.fecha_pago = paymentData.fecha_pago || v.fecha_pago || new Date().toISOString();
    }

    // Notas de venta
    if (paymentData.notas_venta !== undefined) {
        v.notas_venta = paymentData.notas_venta;
    }

    return v;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Hacer funciones disponibles globalmente para el sistema
if (typeof window !== 'undefined') {
    window.SpaMatchingEngine = {
        // Constantes
        MODALIDADES: SPA_MODALIDADES,
        ESTADO_PAGO: SPA_ESTADO_PAGO,
        METODOS_PAGO: SPA_METODOS_PAGO,

        // Normalización
        normalizeService: normalizeServiceForMatching,
        normalizeStaff: normalizeStaffForMatching,
        normalizeSpace: normalizeSpaceForMatching,
        normalizeVoucherPayment,

        // Matching
        matchServiceToRooms,
        matchServiceToTherapists,
        matchServiceToPax,
        matchPackSequence,

        // Utilidades
        checkRoomAvailability,
        checkTherapistAvailability,
        generateLinkedBookings,

        // Helpers
        calculateRequiredTherapists,
        inferSkillsFromRooms,
        timeToMinutes,
        minutesToTime,
        addMinutesToTime,
        isTimeInShifts,

        // Complement Detection
        isComplement,
        COMPLEMENT_KEYWORDS
    };

    console.log('[SPA-MATCHING-ENGINE] ✅ Loaded - Fase 3 Implementation');
}
