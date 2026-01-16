// reservas-staff.js - Optimized Staff Management
// caching to reduce READ quota usage

const ROOM_CODES = {
    'suite': 'suite',
    'vip': 'vip',
    'panacea': 'panacea',
    'spa': 'spa',
    'peluqueria': 'peluqueria',
    'cabina1': 'cabina1',
    'cabina2': 'cabina2',
    'cabina3': 'cabina3'
};

// Room code mappings
const ROOM_ALIASES = {
    'peluqueria': ['peluqueria', 'peluq', 'pelu', 'hair'],
    'panacea': ['panacea', 'pan'],
    'vip': ['vip', 'sala_vip', 'vipspa'],
    'suite': ['suite', 'suitespa', 'suite_spa'],
    'suite': ['suite', 'suitespa', 'suite_spa'],
    'spa': ['spa', 'circuito', 'circuito_spa'],
    'cabina1': ['cabina1', 'cab1', 'c1'],
    'cabina2': ['cabina2', 'cab2', 'c2'],
    'cabina3': ['cabina3', 'cab3', 'c3']
};

const STAFF_POOLS = {
    'vip': ['vip', 'panacea'],
    'panacea': ['vip', 'panacea'],
    'suite': ['suite'],
    'spa': ['spa'],
    'peluqueria': ['peluqueria'],
    'cabina1': ['spa', 'cabinas'],
    'cabina2': ['spa', 'cabinas'],
    'cabina3': ['spa', 'cabinas']
};

// === PAX LIMITS BY ROOM ===
// Cabinas are individual treatment rooms (pax_max: 1)
// Panacea, Suite, VIP support couples (pax_max: 2)
const ROOM_PAX_MAX = {
    'cabina1': 1,
    'cabina2': 1,
    'cabina3': 1,
    'panacea': 2,
    'suite': 2,
    'vip': 2,
    'spa': 99,  // Circuito no tiene límite fijo
    'peluqueria': 1
};

/**
 * Returns the max pax allowed for a room
 * @param {string} roomCode 
 * @returns {number} - max pax, defaults to 2
 */
function getRoomPaxMax(roomCode) {
    const code = normalizeRoomCode(roomCode);
    return ROOM_PAX_MAX[code] || 2;
}

/**
 * Checks if pax exceeds room limit
 * @param {string} roomCode 
 * @param {number} pax 
 * @returns {Object} - { valid, message, maxPax }
 */
function validatePaxForRoom(roomCode, pax) {
    const maxPax = getRoomPaxMax(roomCode);
    if (pax > maxPax) {
        return {
            valid: false,
            message: `⚠ Esta sala solo admite reservas ${maxPax === 1 ? 'individuales' : `de hasta ${maxPax} personas`}`,
            maxPax
        };
    }
    return { valid: true, message: '', maxPax };
}

let _cachedActiveStaff = null;
let _lastStaffFetch = 0;
const CACHE_TTL = 300000; // 5 minutes

function normalizeRoomCode(code) {
    if (!code) return '';
    let normalized = code.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/sala[\s_]*/gi, '')
        .replace(/[\s_-]/g, '')
        .trim();

    for (const [canonical, aliases] of Object.entries(ROOM_ALIASES)) {
        if (aliases.includes(normalized) || normalized === canonical) {
            return canonical;
        }
    }
    return normalized;
}

// 1. Fetch Active Staff (Cached)
async function getActiveStaff() {
    const now = Date.now();
    if (_cachedActiveStaff && (now - _lastStaffFetch < CACHE_TTL)) {
        return _cachedActiveStaff;
    }

    try {
        const snapshot = await db.collection("spa_staff")
            .where("status", "==", "active")
            .get();

        if (snapshot.empty) {
            _cachedActiveStaff = [];
            _lastStaffFetch = now;
            return [];
        }

        _cachedActiveStaff = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        _lastStaffFetch = now;
        return _cachedActiveStaff;
    } catch (err) {
        console.error("Error fetching staff:", err);
        return [];
    }
}

// 2. Fetch ALL bookings for a date (Optimized Batch Read)
async function getAllBookingsForDate(date) {
    const collections = ['reservas_panacea', 'reservas_vip', 'reservas_peluqueria', 'reservas_suite', 'reservas_spa'];
    const promises = collections.map(col =>
        db.collection(col).where("fecha", "==", date).get()
    );

    try {
        const snapshots = await Promise.all(promises);
        const allBookings = [];
        snapshots.forEach(snap => {
            snap.forEach(doc => allBookings.push({ ...doc.data(), id: doc.id }));
        });
        return allBookings;
    } catch (err) {
        console.error("Error fetching bookings batch:", err);
        return [];
    }
}

// Optimized availability checker
async function getAvailableStaffForRoom(roomCode, date, time, duration, excludeId = null) {
    try {
        // Step 1: Get Staff (1 Read or Cached)
        const allStaff = await getActiveStaff();
        if (allStaff.length === 0) return [];

        // Step 2: Get ALL Bookings for this date (5 Reads total) - INSTEAD of N * 5 Reads
        const dayBookings = await getAllBookingsForDate(date);

        const pool = STAFF_POOLS[roomCode] || [roomCode];
        const normalizedPool = pool.map(p => normalizeRoomCode(p));

        const availableStaff = [];

        // Step 3: Filter in memory
        for (const staff of allStaff) {
            // Room Assignment Check
            const assigned = staff.assigned_rooms || [];
            // Relaxed Rule: If no rooms assigned, assume available for ALL (Float). 
            // Otherwise, must match pool.
            const isAssigned = (assigned.length === 0) || assigned.some(r => normalizedPool.includes(normalizeRoomCode(r)));

            if (!isAssigned) continue;

            // Schedule Check (Availability Rules) - This might still query exceptions, caching needed?
            // Exceptions are "spa_staff_availability". Ideally cache this too, but let's stick to 5 reads save first.
            const isAvailable = await checkStaffAvailability(staff, date, time, duration);

            // Booking Collision Check (In-Memory using dayBookings)
            const isBooked = isStaffBookedInMemory(staff.id, dayBookings, time, duration, excludeId);

            if (isAvailable && !isBooked) {
                availableStaff.push(staff);
            }
        }

        return availableStaff;
    } catch (err) {
        console.error("Error getting available staff:", err);
        return [];
    }
}

// Replaces the DB-querying isStaffBooked
function isStaffBookedInMemory(staffId, dayBookings, time, duration, excludeId) {
    // Filter bookings for this staff member
    const staffBookings = dayBookings.filter(b => b.staff_id === staffId && b.status !== 'anulada');

    for (const booking of staffBookings) {
        if (excludeId && (booking.res_id === excludeId || booking.id === excludeId)) continue;

        if (timesOverlap(booking.hora, booking.duracion || 60, time, duration)) {
            return true;
        }
    }
    return false;
}

// Keep original signature for compatibility if called elsewhere, but warn
async function isStaffBooked(staffId, date, time, duration, excludeId = null) {
    console.warn("Performance Warning: isStaffBooked called directly. Use batch fetching if possible.");
    // Fallback to original DB method if needed, or implement single check
    // For now, implementing the original slow logic to ensure no breakage if called externally
    return isStaffBookedLegacy(staffId, date, time, duration, excludeId);
}

// Original logic moved here for fallback
async function isStaffBookedLegacy(staffId, date, time, duration, excludeId) {
    const collections = ['reservas_panacea', 'reservas_vip', 'reservas_peluqueria', 'reservas_suite', 'reservas_spa'];
    const allBookings = [];
    for (const col of collections) {
        const snapshot = await db.collection(col)
            .where("staff_id", "==", staffId)
            .where("fecha", "==", date)
            .get();
        snapshot.forEach(doc => {
            const b = doc.data();
            if (b.status !== 'anulada') {
                if (excludeId && (b.res_id === excludeId || b.id === excludeId)) return;
                allBookings.push(b);
            }
        });
    }
    return allBookings.some(b => timesOverlap(b.hora, b.duracion || 60, time, duration));
}

async function checkStaffAvailability(staff, date, time, duration) {
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];

    // Exception Check - This is still 1 READ per staff per check.
    // Optimization: We could fetch ALL exceptions for the date once. 
    // But let's start with the big win (bookings).
    try {
        const availSnapshot = await db.collection("spa_staff_availability")
            .where("staff_id", "==", staff.id)
            .get();
        const dateAvailability = availSnapshot.docs.find(doc => doc.data().date === date);

        if (dateAvailability) {
            const availability = dateAvailability.data();
            if (availability.status === 'unavailable') return false;
            if (availability.status === 'custom') {
                return isTimeInShifts(time, availability.custom_schedule.shifts, duration);
            }
        }
    } catch (err) { console.error(err); }

    const daySchedule = staff.default_schedule ? staff.default_schedule[dayOfWeek] : null;
    if (!daySchedule || !daySchedule.enabled) return false;
    return isTimeInShifts(time, daySchedule.shifts, duration);
}

function isTimeInShifts(time, shifts, duration) {
    if (!shifts || shifts.length === 0) return false;
    const startMinutes = timeToMinutes(time);
    const endMinutes = startMinutes + parseInt(duration);
    for (const shift of shifts) {
        const shiftStart = timeToMinutes(shift.start);
        const shiftEnd = timeToMinutes(shift.end);
        if (startMinutes >= shiftStart && endMinutes <= shiftEnd) return true;
    }
    return false;
}

function timesOverlap(time1, duration1, time2, duration2) {
    const start1 = timeToMinutes(time1);
    const end1 = start1 + parseInt(duration1);
    const start2 = timeToMinutes(time2);
    const end2 = start2 + parseInt(duration2);
    return !(end1 <= start2 || end2 <= start1);
}

function timeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes = 0] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// Exported UI function
function updateStaffDropdown(availableStaff) {
    const staffSelect = document.getElementById('booking-staff');
    const staffSelect2 = document.getElementById('booking-staff-2');
    const msgEl = document.getElementById('staff-availability-msg');

    if (!staffSelect) return;

    // Get current value to preserve if possible
    const currentValue = staffSelect.value;
    const currentValue2 = staffSelect2 ? staffSelect2.value : "";

    if (availableStaff.length === 0) {
        staffSelect.innerHTML = '<option value="">No hay terapeutas disponibles</option>';
        if (staffSelect2) staffSelect2.innerHTML = '<option value="">No hay terapeutas disponibles</option>';
        staffSelect.disabled = true;
        if (staffSelect2) staffSelect2.disabled = true;
        if (msgEl) {
            msgEl.textContent = '⚠️ No hay terapeutas disponibles en este horario.';
            msgEl.style.color = '#ef4444';
        }
        const submitBtn = document.querySelector('#booking-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    const optionsHtml = '<option value="">Seleccionar terapeuta...</option>' +
        availableStaff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    staffSelect.innerHTML = optionsHtml;
    if (staffSelect2) staffSelect2.innerHTML = optionsHtml;

    // Restore value if invalid
    if (currentValue && availableStaff.some(s => s.id === currentValue)) {
        staffSelect.value = currentValue;
    }

    if (staffSelect2 && currentValue2 && availableStaff.some(s => s.id === currentValue2)) {
        staffSelect2.value = currentValue2;
    }

    staffSelect.disabled = false;
    if (staffSelect2) staffSelect2.disabled = false;

    if (msgEl) {
        msgEl.textContent = `✅ ${availableStaff.length} terapeuta(s) disponible(s)`;
        msgEl.style.color = '#10b981';
    }
    const submitBtn = document.querySelector('#booking-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;

    // Prevention of duplicate selection
    const preventDuplicate = () => {
        const v1 = staffSelect.value;
        const v2 = staffSelect2 ? staffSelect2.value : "";
        if (v1 && v2 && v1 === v2) {
            alert("Atención: No puedes seleccionar al mismo terapeuta para ambos puestos.");
            staffSelect2.value = "";
        }
    };
    staffSelect.addEventListener('change', preventDuplicate);
    if (staffSelect2) staffSelect2.addEventListener('change', preventDuplicate);
}

/**
 * Reset staff dropdown to initial/waiting state
 * Called when form opens or service not yet selected
 */
function resetStaffDropdown(message = 'Selecciona servicio y hora primero') {
    const staffSelect = document.getElementById('booking-staff');
    const msgEl = document.getElementById('staff-availability-msg');

    if (staffSelect) {
        staffSelect.innerHTML = `<option value="">${message}</option>`;
        staffSelect.disabled = true;
    }
    if (msgEl) {
        msgEl.textContent = 'ℹ️ ' + message;
        msgEl.style.color = '#64748b';
    }
}

async function handleStaffFieldsChange() {
    let date = document.getElementById('form-date')?.value;
    if (!date) date = document.getElementById('main-date-picker')?.value;

    let time = document.getElementById('form-time')?.value;
    if (!time && typeof window.selectedTime !== 'undefined') time = window.selectedTime;

    const durationInput = document.getElementById('inputDuration');
    const duration = durationInput ? durationInput.value : 60;

    // === CHECK: Date and time required ===
    if (!date || !time) {
        resetStaffDropdown('Selecciona fecha y hora primero');
        return;
    }

    let roomCode = null;
    if (typeof window.currentModule !== 'undefined' && window.currentModule.code) {
        roomCode = window.currentModule.code;
    } else if (typeof moduleType !== 'undefined') {
        roomCode = ROOM_CODES[moduleType];
    }
    if (!roomCode && typeof window.moduleType !== 'undefined') {
        roomCode = window.moduleType;
    }

    if (!roomCode) return;

    // === CHECK: Service required for particulares (no bono) ===
    const origenSelect = document.getElementById('res-origen');
    const servicioInput = document.getElementById('res-servicio') || document.getElementById('inputServicio');
    const isParticular = origenSelect && origenSelect.value === 'particular';

    // Only require service for particular reservations (no bono)
    if (isParticular || !origenSelect?.value) {
        if (!servicioInput || !servicioInput.value || servicioInput.value.trim() === '') {
            resetStaffDropdown('Selecciona un servicio primero');
            return;
        }
    }

    // === PAX VALIDATION ===
    const paxInput = document.getElementById('res-pax');
    const pax = paxInput ? parseInt(paxInput.value) || 1 : 1;
    const paxValidation = validatePaxForRoom(roomCode, pax);

    const msgEl = document.getElementById('staff-availability-msg');
    const staffSelect = document.getElementById('booking-staff');

    if (!paxValidation.valid) {
        // Block - pax exceeds room limit
        if (msgEl) {
            msgEl.textContent = paxValidation.message;
            msgEl.style.color = '#ef4444';
        }
        if (staffSelect) {
            staffSelect.innerHTML = '<option value="">No disponible para este pax</option>';
            staffSelect.disabled = true;
        }
        const submitBtn = document.querySelector('#booking-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }
    // === END PAX VALIDATION ===

    // Toggle Staff 2 Selector visibility based on PAX
    const staff2Container = document.getElementById('staff-2-container');
    const labelStaff1 = document.getElementById('label-staff-1');

    if (staff2Container) {
        if (pax > 1) {
            staff2Container.style.display = 'block';
            if (labelStaff1) labelStaff1.textContent = 'Terapeuta 1';
        } else {
            staff2Container.style.display = 'none';
            if (labelStaff1) labelStaff1.textContent = 'Terapeuta';
            const staffSelect2 = document.getElementById('booking-staff-2');
            if (staffSelect2) staffSelect2.value = "";
        }
    }

    // Get current booking ID to exclude from collision check
    const excludeId = document.getElementById('form-id')?.value;
    const availableStaff = await getAvailableStaffForRoom(roomCode, date, time, duration, excludeId);
    updateStaffDropdown(availableStaff);
}

// Export resetStaffDropdown
window.resetStaffDropdown = resetStaffDropdown;

// WhatsApp Helper
async function sendStaffWhatsAppNotification(staff, booking) {
    try {
        const configDoc = await db.collection("spa_config").doc("settings").get();
        if (!configDoc.exists) return;
        const template = configDoc.data().whatsappTemplate || '';
        const message = template
            .replace(/{{nombre}}/g, booking.client_name)
            .replace(/{{fecha}}/g, new Date(booking.date).toLocaleDateString('es-ES'))
            .replace(/{{hora}}/g, booking.time)
            .replace(/{{espacio}}/g, getSpaceName(moduleType))
            .replace(/{{servicio}}/g, booking.service || 'Servicio')
            .replace(/{{telefono}}/g, booking.client_tel || "")
            .replace(/{{pax}}/g, booking.pax || "")
            .replace(/{{total}}/g, (booking.total_price || 0) + "€")
            .replace(/{{notas}}/g, booking.observations || "");

        if (staff.phone) {
            const phone = staff.phone.replace(/[^0-9]/g, '');
            window.open(`https://wa.me/34${phone}?text=${encodeURIComponent(message)}`, '_blank');
        } else {
            alert('El terapeuta no tiene teléfono configurado.');
        }
    } catch (err) {
        console.error("Error sending staff whatsapp:", err);
    }
}

function getSpaceName(code) {
    const names = {
        'vip': 'Sala VIP',
        'panacea': 'Sala Panacea',
        'suite': 'Suite Spa',
        'spa': 'Circuito Spa',
        'peluqueria': 'Peluquería'
    };
    return names[code] || code;
}

// === NEW: Optimized Daily Availability (Batch for Timeline) ===
async function getStaffExceptionsForDate(date) {
    try {
        const snap = await db.collection("spa_staff_availability").where("date", "==", date).get();
        const exceptions = {};
        snap.forEach(doc => {
            const data = doc.data();
            exceptions[data.staff_id] = data;
        });
        return exceptions;
    } catch (e) {
        console.error("Error fetching staff exceptions:", e);
        return {};
    }
}

window.getDailyStaffAvailability = async function (roomCode, date) {
    if (!roomCode || !date) return {};

    try {
        // 1. Fetch all necessary data in parallel (3 reads total)
        // Note: getActiveStaff is cached (0 reads if hot)
        const [allStaff, dayBookings, exceptions] = await Promise.all([
            getActiveStaff(),
            getAllBookingsForDate(date),
            getStaffExceptionsForDate(date)
        ]);

        // 2. Filter Staff for this Room
        const pool = STAFF_POOLS[roomCode] || [roomCode];
        const normalizedPool = pool.map(p => normalizeRoomCode(p));

        const roomStaff = allStaff.filter(staff => {
            const assigned = staff.assigned_rooms || [];
            // Relaxed Rule: If no rooms assigned, assume available for ALL
            return (assigned.length === 0) || assigned.some(r => normalizedPool.includes(normalizeRoomCode(r)));
        });

        const availabilityMap = {};

        // 3. Generate all 15-min slots for the day (Standard Spa operating hours)
        const slots = [];
        // Use noon to avoid timezone shift on day detection
        const dateObj = new Date(date + 'T12:00:00');
        const isSun = dateObj.getDay() === 0;
        const closingH = isSun ? 15 : 22; // Dom hasta 15h, resto hasta 22h

        for (let h = 10; h < closingH; h++) {
            for (let m of [0, 15, 30, 45]) {
                if (h === 21 && m > 45) continue; // Cierre a las 22:00
                const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                slots.push(time);
            }
        }

        // 4. Check availability for each slot (In-Memory)
        const duration = 60; // Validar disponibilidad para una reserva estándar de 1h
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];

        for (const time of slots) {
            let count = 0;

            for (const staff of roomStaff) {
                // A. Check Schedule / Exception
                let isAvailable = false;
                const exc = exceptions[staff.id];

                if (exc) {
                    if (exc.status === 'custom') {
                        isAvailable = isTimeInShifts(time, exc.custom_schedule.shifts, duration);
                    }
                    // if 'unavailable', remains false
                } else {
                    // Default Schedule
                    const sched = staff.default_schedule ? staff.default_schedule[dayOfWeek] : null;
                    if (sched && sched.enabled) {
                        isAvailable = isTimeInShifts(time, sched.shifts, duration);
                    }
                }

                // B. Check Bookings Collision
                if (isAvailable) {
                    if (!isStaffBookedInMemory(staff.id, dayBookings, time, duration, null)) {
                        count++;
                    }
                }
            }
            availabilityMap[time] = count;
        }

        return availabilityMap;

    } catch (err) {
        console.error("Error inside getDailyStaffAvailability:", err);
        return {};
    }
};

// Export pax validation functions
window.getRoomPaxMax = getRoomPaxMax;
window.validatePaxForRoom = validatePaxForRoom;
window.ROOM_PAX_MAX = ROOM_PAX_MAX;
