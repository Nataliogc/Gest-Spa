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
    const staffSelect1 = document.getElementById("booking-staff") || document.getElementById("res-staff-1");
    const staffSelect2 = document.getElementById("booking-staff-2") || document.getElementById("res-staff-2");

    if (!staffSelect1) {
        console.warn('[STAFF] Elementos necesarios no encontrados en el DOM');
        return;
    }

    const dateField = document.getElementById("form-date") || document.getElementById("main-date-picker");
    const timeField = document.getElementById("form-time");
    const durationField = document.getElementById("inputDuration");
    const formIdField = document.getElementById("form-id");

    const date = dateField?.value;
    const time = timeField?.value;
    const duration = parseInt(durationField?.value || 60);
    const currentResId = formIdField?.value;
    const roomCode = (window.currentModule && window.currentModule.code) ? window.currentModule.code : 'spa';

    if (!date || !time) return;

    // Guardar valores previos
    const prev1 = staffSelect1.value;
    const prev2 = staffSelect2 ? staffSelect2.value : null;

    staffSelect1.innerHTML = '<option value="">Cargando...</option>';
    if (staffSelect2) staffSelect2.innerHTML = '<option value="">Cargando...</option>';

    try {
        const availableStaff = await window.getAvailableStaffForRoom(roomCode, date, time, duration, currentResId);

        const buildOptions = (selectedVal, excludeId) => {
            let html = '<option value="">Seleccionar...</option>';
            const uniqueStaff = [...availableStaff];
            uniqueStaff.sort((a, b) => {
                if (a._status === b._status) return (a.alias || a.nombre).localeCompare(b.alias || b.nombre);
                return a._status === 'free' ? -1 : 1;
            });

            uniqueStaff.forEach(s => {
                const isBusy = (s._status === 'busy' && s.id !== selectedVal);
                const isExcluded = (s.id === excludeId && s.id !== selectedVal);

                let label = s.alias || s.nombre || s.name || 'Sin nombre';
                if (isBusy) label += " (Ocupado)";
                if (isExcluded) label += " (Seleccionado)";

                const isSelected = (s.id === selectedVal) ? 'selected' : '';
                const isDisabled = (isBusy || isExcluded) ? 'disabled' : '';

                html += `<option value="${s.id}" ${isSelected} ${isDisabled} style="${(isBusy || isExcluded) ? 'color:red;' : ''}">${label}</option>`;
            });
            return html;
        };

        // Populate and set values
        staffSelect1.innerHTML = buildOptions(prev1, prev2);
        if (prev1) staffSelect1.value = prev1;

        if (staffSelect2) {
            staffSelect2.innerHTML = buildOptions(prev2, prev1);
            if (prev2) staffSelect2.value = prev2;
        }

        // Add listeners for mutual exclusion
        staffSelect1.onchange = () => {
            if (staffSelect2) {
                const v1 = staffSelect1.value;
                const v2 = staffSelect2.value;
                staffSelect2.innerHTML = buildOptions(v2, v1);
                staffSelect2.value = v2;
            }
        };

        if (staffSelect2) {
            staffSelect2.onchange = () => {
                const v1 = staffSelect1.value;
                const v2 = staffSelect2.value;
                staffSelect1.innerHTML = buildOptions(v1, v2);
                staffSelect1.value = v1;
            };
        }

        const msgSpan = document.getElementById("staff-availability-msg");
        if (msgSpan) {
            msgSpan.textContent = `(${availableStaff.length} disp.)`;
            msgSpan.style.color = availableStaff.length > 0 ? 'green' : 'red';
        }

    } catch (err) {
        console.error('[STAFF] Error al poblar select de personal:', err);
        staffSelect1.innerHTML = '<option value="">Error al cargar</option>';
    }
}

/**
 * Helper: Obtener todos los terapeutas activos
 * Utilizado por el modal de disponibilidad (Therapist Availability Dashboard) y la app externa.
 */
window.allStaff = []; // Cache global

async function loadStaff() {
    try {
        console.log('[STAFF] Cargando personal desde Firestore...');
        const snapshot = await db.collection('spa_staff').get();
        const staff = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Filtrar solo activos para la disponibilidad general
            if (data.activo === true || data.status === 'active') {
                staff.push({ id: doc.id, ...data });
            }
        });
        window.allStaff = staff;
        console.log(`[STAFF] ${window.allStaff.length} terapeutas activos cargados.`);
        return window.allStaff;
    } catch (e) {
        console.error("[STAFF] Error en loadStaff:", e);
        return [];
    }
}
window.loadStaff = loadStaff;

window.getActiveStaff = async function () {
    if (window.allStaff && window.allStaff.length > 0) return window.allStaff;
    return await loadStaff();
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
