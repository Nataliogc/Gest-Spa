/**
 * reservas-staff.js - Gestión de terapeutas y disponibilidad
 * Este archivo maneja la lógica de filtrado y población de los selectores de terapeutas.
 */

console.log('[STAFF] reservas-staff.js loaded');

let _globalStaffBaseSchedule = null;

/**
 * Carga el horario base global del spa si no está en caché
 */
async function getGlobalStaffBaseSchedule() {
    if (_globalStaffBaseSchedule) return _globalStaffBaseSchedule;
    try {
        const doc = await db.collection('spa_config').doc('staff_base_schedule').get();
        if (doc.exists) {
            _globalStaffBaseSchedule = doc.data().schedule;
        } else {
            _globalStaffBaseSchedule = {};
        }
    } catch (e) {
        console.warn("[STAFF] Error cargando horario base global:", e);
        _globalStaffBaseSchedule = {};
    }
    return _globalStaffBaseSchedule;
}

/**
 * Maneja los cambios en los campos relacionados con el personal/terapeutas
 * Se llama cuando cambia el servicio, la duración, la fecha o la hora.
 */
async function handleStaffFieldsChange() {
    console.log('[STAFF] handleStaffFieldsChange called');

    // 1. Obtener elementos del DOM
    const staffSelect = document.getElementById("booking-staff");
    const staffSelect2 = document.getElementById("booking-staff-2");
    const dateField = document.getElementById("form-date");
    const timeField = document.getElementById("form-time");
    const durationField = document.getElementById("inputDuration");
    const formIdField = document.getElementById("form-id");
    const serviceField = document.getElementById("res-servicio");

    if (!staffSelect || !dateField || !timeField) {
        console.warn('[STAFF] Elementos necesarios no encontrados en el DOM');
        return;
    }

    // 2. Obtener valores actuales
    const date = dateField.value;
    const time = timeField.value;
    const duration = parseInt(durationField?.value || 60);
    const excludeResId = formIdField?.value;
    const roomCode = (window.currentModule && window.currentModule.code) ? window.currentModule.code : 'spa';
    const serviceName = serviceField?.value;

    if (!date || !time) {
        console.log('[STAFF] Fecha o hora no definidas, saltando población de staff');
        return;
    }

    // 3. Guardar valores seleccionados actualmente para intentar restaurarlos
    const currentStaffId = staffSelect.value;
    const currentStaffId2 = staffSelect2 ? staffSelect2.value : '';

    // 4. Mostrar estado de carga
    staffSelect.innerHTML = '<option value="">Buscando disponibles...</option>';
    if (staffSelect2) staffSelect2.innerHTML = '<option value="">Buscando disponibles...</option>';

    try {
        // 5. Obtener staff disponible llamando a la función core en reservas.html
        // Esta función filtra por SALA, HORARIO y COLISIONES.
        let available = await window.getAvailableStaffForRoom(roomCode, date, time, duration, excludeResId);

        // 6. FILTRO ADICIONAL: Por Skill (Habilidad) si hay un servicio seleccionado
        if (serviceName && typeof window.getItemConfig === 'function') {
            const itemConfig = await window.getItemConfig(serviceName);
            if (itemConfig && itemConfig.required_skill) {
                const reqSkill = itemConfig.required_skill.toLowerCase().trim();
                console.log(`[STAFF] Filtrando por habilidad requerida: ${reqSkill}`);

                available = available.filter(s => {
                    const skills = (s.skills || []).map(x => x.toLowerCase().trim());
                    // Si el terapeuta no tiene skills definidos, asumimos que puede hacer todo (flotante)
                    // Si tiene skills, debe tener el requerido.
                    return skills.length === 0 || skills.includes(reqSkill);
                });
            }
        }

        console.log(`[STAFF] ${available.length} terapeutas aptos encontrados para ${roomCode}`);

        // 7. Generar opciones
        const generateOptions = (selectedValue) => {
            let html = '<option value="">Seleccionar...</option>';
            available.forEach(staff => {
                const name = staff.nombre || staff.name || 'Sin nombre';
                const isSelected = (staff.id === selectedValue) ? 'selected' : '';
                html += `<option value="${staff.id}" ${isSelected}>${name}</option>`;
            });
            return html;
        };

        // 8. Actualizar selects
        staffSelect.innerHTML = generateOptions(currentStaffId);
        if (staffSelect2) {
            staffSelect2.innerHTML = generateOptions(currentStaffId2);
        }

        // 9. Auto-selección inteligente
        // Si no había selección previa (nueva reserva) y tenemos opciones disponibles
        if (!currentStaffId && available.length > 0) {
            // Regla: Auto-seleccionar si es Peluquería (prioridad UX) o si solo hay 1 opción globalmente
            // Esto evita clics innecesarios
            if (roomCode === 'peluqueria' || available.length === 1) {
                staffSelect.value = available[0].id;
                console.log(`[STAFF] Auto-seleccionado ${available[0].nombre} para ${roomCode}`);
            }
        }

    } catch (err) {
        console.error('[STAFF] Error al poblar select de personal:', err);
        staffSelect.innerHTML = '<option value="">Error al cargar</option>';
    }
}

/**
 * Helper: Obtener todos los terapeutas activos
 * Utilizado por el modal de disponibilidad (Therapist Availability Dashboard)
 */
window.getActiveStaff = async function () {
    if (window.allStaff && window.allStaff.length > 0) return window.allStaff;

    // Si no están cargados, forzar carga
    if (typeof window.loadStaff === 'function') {
        await window.loadStaff();
        return window.allStaff;
    }

    return [];
};

/**
 * Helper: Obtener todas las excepciones de disponibilidad para una fecha
 */
window.getDayExceptionsForDate = async function (date) {
    try {
        const snap = await db.collection('spa_staff_availability')
            .where('date', '==', date)
            .get();

        const exceptions = {};
        snap.forEach(doc => {
            const data = doc.data();
            if (data.staff_id) {
                exceptions[data.staff_id] = data;
            }
        });
        return exceptions;
    } catch (e) {
        console.warn("[STAFF] Error cargando excepciones del día:", e);
        return {};
    }
};

/**
 * Helper: Obtener todas las reservas de todas las salas para una fecha
 */
window.getAllBookingsForDate = async function (date) {
    const collections = [
        'reservas_cabina1', 'reservas_cabina2', 'reservas_cabina3',
        'reservas_suite', 'reservas_vip', 'reservas_panacea',
        'reservas_peluqueria'
    ];

    let allBookings = [];
    const promises = collections.map(col =>
        db.collection(col).where('fecha', '==', date).get()
            .then(snap => {
                snap.forEach(doc => {
                    const d = doc.data();
                    // Normalizar para que funcione con getTherapistStatusForSlot
                    allBookings.push({
                        id: doc.id,
                        _collection: col,
                        terapeuta: d.terapeuta || d.staff_name,
                        staff: d.staff_name || d.terapeuta,
                        ...d
                    });
                });
            })
            .catch(e => console.warn(`Error cargando ${col}:`, e))
    );

    await Promise.all(promises);
    return allBookings;
};

/**
 * Helper: Comprobar disponibilidad horaria de un staff
 * @param {Object} staff Objeto del terapeuta
 * @param {string} date Fecha YYYY-MM-DD
 * @param {string} time Hora HH:mm
 * @param {number} duration Duración en minutos
 * @param {Object} preFetchedExceptions Opcional: Diccionario de excepciones {staff_id: data}
 */
window.checkStaffAvailability = async function (staff, date, time, duration, preFetchedExceptions = null) {
    if (!staff) return false;

    const reqStart = timeToMinutes(time);
    const reqEnd = reqStart + parseInt(duration);

    // 1. Horario Base / Temporada
    let workingSchedule = staff.default_schedule || {};
    if (staff.seasonal_schedules && Array.isArray(staff.seasonal_schedules)) {
        const activePeriod = staff.seasonal_schedules.find(p => date >= p.start && date <= p.end);
        if (activePeriod) {
            workingSchedule = activePeriod.schedule || workingSchedule;
        }
    }

    const dateObj = new Date(date + 'T12:00:00');
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[dateObj.getDay()];

    let dayConfig = workingSchedule ? workingSchedule[dayKey] : null;

    // Fallback al horario base global si el individual NO tiene configurado este día
    // Si el individual tiene el día pero está desactivado (enabled: false), NO debe haber fallback, se respeta que no trabaja.
    if (!dayConfig) {
        const globalSchedule = await getGlobalStaffBaseSchedule();
        const globalDayConfig = globalSchedule[dayKey];
        if (globalDayConfig && globalDayConfig.enabled) {
            dayConfig = globalDayConfig;
            console.log(`[STAFF] Usando horario GLOBAL para ${staff.nombre || staff.name} el día ${dayKey}`);
        }
    }

    if (!dayConfig || !dayConfig.enabled || !dayConfig.shifts) return false;

    const isWithinShift = dayConfig.shifts.some(sh => {
        const sStart = timeToMinutes(sh.start);
        const sEnd = timeToMinutes(sh.end);
        return (reqStart >= sStart && reqEnd <= sEnd);
    });

    if (!isWithinShift) return false;

    // 2. Excepciones
    try {
        let exc = null;
        if (preFetchedExceptions) {
            exc = preFetchedExceptions[staff.id];
        } else {
            const snap = await db.collection('spa_staff_availability')
                .where('staff_id', '==', staff.id)
                .where('date', '==', date)
                .get();
            if (!snap.empty) exc = snap.docs[0].data();
        }

        if (exc) {
            if (exc.status === 'unavailable' || exc.status === 'off' || exc.status === 'vacation') return false;
            if (exc.status === 'custom' && exc.custom_schedule) {
                return (exc.custom_schedule.shifts || []).some(sh => {
                    const sStart = timeToMinutes(sh.start);
                    const sEnd = timeToMinutes(sh.end);
                    return (reqStart >= sStart && reqEnd <= sEnd);
                });
            }
        }
    } catch (e) {
        console.warn("Error checkStaffAvailability:", e);
    }

    return true;
};

// Helper interno para conversión de tiempo
function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

// Exportar para uso global
window.handleStaffFieldsChange = handleStaffFieldsChange;
