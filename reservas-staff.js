// reservas-staff.js - Staff Management for VIP/Panacea Reservations
// This script handles therapist availability checking and assignment

const ROOM_CODES = {
    'suite': 'suite',
    'vip': 'vip',
    'panacea': 'panacea',
    'spa': 'spa',
    'peluqueria': 'peluqueria'
};

// Get module type from URL
// const urlParams = new URLSearchParams(window.location.search);
// const moduleType = urlParams.get('type') || 'spa';

// ===== STAFF AVAILABILITY CHECKING =====

// Room code mappings - supports multiple aliases
const ROOM_ALIASES = {
    'peluqueria': ['peluqueria', 'peluq', 'pelu', 'hair'],
    'panacea': ['panacea', 'pan'],
    'vip': ['vip', 'sala_vip', 'vipspa'],
    'suite': ['suite', 'suitespa', 'suite_spa'],
    'spa': ['spa', 'circuito', 'circuito_spa']
};

const STAFF_POOLS = {
    'vip': ['vip', 'panacea'],
    'panacea': ['vip', 'panacea'],
    'suite': ['suite'],
    'spa': ['spa'],
    'peluqueria': ['peluqueria']
};

// Normalize room code for matching (case-insensitive, remove accents, resolve aliases)
function normalizeRoomCode(code) {
    if (!code) return '';
    let normalized = code.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/sala[\s_]*/gi, '') // Remove "Sala " or "Sala_" prefix
        .replace(/[\s_-]/g, '') // Remove spaces, underscores, hyphens
        .trim();

    // Resolve to canonical code using aliases
    for (const [canonical, aliases] of Object.entries(ROOM_ALIASES)) {
        if (aliases.includes(normalized) || normalized === canonical) {
            return canonical;
        }
    }
    return normalized;
}

async function getAvailableStaffForRoom(roomCode, date, time, duration) {
    try {
        // Fetch ALL active staff and filter in memory to handle shared pools (OR logic)
        // This solves the issue where staff is assigned to 'vip' but not 'panacea' explicitly
        const staffSnapshot = await db.collection("spa_staff")
            .where("status", "==", "active")
            .get();

        if (staffSnapshot.empty) {
            console.warn(`No active staff found.`);
            return [];
        }

        const pool = STAFF_POOLS[roomCode] || [roomCode];
        const availableStaff = [];

        for (const doc of staffSnapshot.docs) {
            const staff = { ...doc.data(), id: doc.id };
            const assigned = staff.assigned_rooms || [];

            // Check if staff is assigned to ANY room in the pool (case-insensitive)
            const normalizedPool = pool.map(p => normalizeRoomCode(p));
            const isAssigned = assigned.some(r => normalizedPool.includes(normalizeRoomCode(r)));
            if (!isAssigned) continue;

            // Check if available on this date/time
            const isAvailable = await checkStaffAvailability(staff, date, time, duration);

            // Check if not already booked
            const isBooked = await isStaffBooked(staff.id, date, time, duration);

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

async function checkStaffAvailability(staff, date, time, duration) {
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];

    // Check for exception first (unavailable or custom schedule)
    try {
        const availSnapshot = await db.collection("spa_staff_availability")
            .where("staff_id", "==", staff.id)
            .get();

        // Filter by date in JavaScript
        const dateAvailability = availSnapshot.docs.find(doc => doc.data().date === date);

        if (dateAvailability) {
            const availability = dateAvailability.data();

            if (availability.status === 'unavailable') {
                return false;
            }

            if (availability.status === 'custom') {
                return isTimeInShifts(time, availability.custom_schedule.shifts, duration);
            }
        }
    } catch (err) {
        console.error("Error checking availability exception:", err);
    }

    // Use default schedule
    const daySchedule = staff.default_schedule ? staff.default_schedule[dayOfWeek] : null;

    if (!daySchedule || !daySchedule.enabled) {
        return false;
    }

    return isTimeInShifts(time, daySchedule.shifts, duration);
}

function isTimeInShifts(time, shifts, duration) {
    if (!shifts || shifts.length === 0) return false;

    const startMinutes = timeToMinutes(time);
    const endMinutes = startMinutes + parseInt(duration);

    for (const shift of shifts) {
        const shiftStart = timeToMinutes(shift.start);
        const shiftEnd = timeToMinutes(shift.end);

        // Booking must fit entirely within shift
        if (startMinutes >= shiftStart && endMinutes <= shiftEnd) {
            return true;
        }
    }

    return false;
}

// Check if staff already has a booking at this time
async function isStaffBooked(staffId, date, time, duration) {
    try {
        // Collect all bookings from all module collections
        const collections = ['reservas_panacea', 'reservas_vip', 'reservas_peluqueria', 'reservas_suite', 'reservas_spa'];
        const allBookings = [];

        for (const col of collections) {
            const snapshot = await db.collection(col)
                .where("staff_id", "==", staffId)
                .where("fecha", "==", date) // Note: reservas.html uses 'fecha', reservas-staff.js previously used 'date'
                .get();

            snapshot.forEach(doc => {
                const b = doc.data();
                if (b.status !== 'anulada') {
                    allBookings.push(b);
                }
            });
        }

        // Check for time overlap
        for (const booking of allBookings) {
            if (timesOverlap(booking.hora, booking.duracion || 60, time, duration)) {
                return true;
            }
        }

        return false;
    } catch (err) {
        console.error("Error checking if staff booked:", err);
        return true; // Assume booked on error for safety
    }
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

// ===== UI UPDATES =====

function updateStaffDropdown(availableStaff) {
    const staffSelect = document.getElementById('booking-staff');
    const msgEl = document.getElementById('staff-availability-msg');

    if (!staffSelect) {
        console.error('Staff select element not found');
        return;
    }

    if (availableStaff.length === 0) {
        staffSelect.innerHTML = '<option value="">No hay terapeutas disponibles</option>';
        staffSelect.disabled = true;

        if (msgEl) {
            msgEl.textContent = '⚠️ No hay terapeutas disponibles en este horario. Por favor, selecciona otro horario.';
            msgEl.style.color = '#ef4444';
        }

        // Disable submit button
        const submitBtn = document.querySelector('#booking-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        return;
    }

    staffSelect.innerHTML = '<option value="">Seleccionar terapeuta...</option>' +
        availableStaff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    staffSelect.disabled = false;

    if (msgEl) {
        msgEl.textContent = `✅ ${availableStaff.length} terapeuta(s) disponible(s)`;
        msgEl.style.color = '#10b981';
    }

    // Enable submit button if there are  staff available
    const submitBtn = document.querySelector('#booking-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;
}

async function handleStaffFieldsChange() {
    let date = document.getElementById('form-date')?.value;
    if (!date) date = document.getElementById('main-date-picker')?.value;

    let time = document.getElementById('form-time')?.value;
    if (!time && typeof window.selectedTime !== 'undefined') time = window.selectedTime;

    const durationInput = document.getElementById('inputDuration');
    const duration = durationInput ? durationInput.value : 60;

    console.log("DEBUG handleStaffFieldsChange:", { date, time, duration });

    if (!date || !time) {
        console.warn("DEBUG: Fecha o hora faltante");
        const staffSelect = document.getElementById('booking-staff');
        if (staffSelect) {
            staffSelect.innerHTML = '<option value="">Seleccione fecha, hora y duración primero</option>';
            staffSelect.disabled = true;
        }
        return;
    }

    // Use global currentModule.code if available (set by reservas.html when clicking slot)
    // Otherwise fallback to global moduleType variable if defined
    let roomCode = null;
    if (typeof window.currentModule !== 'undefined' && window.currentModule.code) {
        roomCode = window.currentModule.code;
    } else if (typeof moduleType !== 'undefined') {
        roomCode = ROOM_CODES[moduleType];
    }

    if (!roomCode && typeof window.moduleType !== 'undefined') {
        roomCode = window.moduleType;
    }

    if (!roomCode) {
        console.error("No valid room code found for staff check.");
        return;
    }
    console.log('Verificando terapeutas disponibles:', { roomCode, date, time, duration });

    const availableStaff = await getAvailableStaffForRoom(roomCode, date, time, duration);
    updateStaffDropdown(availableStaff);
}

// ===== WhatsApp NOTIFICATION =====

async function sendStaffWhatsAppNotification(staff, booking) {
    // Get WhatsApp template from spa_config
    try {
        const configDoc = await db.collection("spa_config").doc("settings").get();

        if (!configDoc.exists) {
            console.warn('No WhatsApp template configured');
            return;
        }

        const template = configDoc.data().whatsappTemplate || '';

        // Replace placeholders
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

        // Create WhatsApp link (staffmust have phone in profile)
        if (staff.phone) {
            const phone = staff.phone.replace(/[^0-9]/g, ''); // Clean phone number
            const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

            console.log('WhatsApp notification ready:', whatsappUrl);

            // Auto-open in new tab (optional - can be changed to just log)
            // window.open(whatsappUrl, '_blank');

            return whatsappUrl;
        }
    } catch (err) {
        console.error('Error sending WhatsApp notification:', err);
    }

    return null;
}

function getSpaceName(moduleType) {
    const names = {
        'vip': 'Sala VIP',
        'panacea': 'Sala Panacea',
        'suite': 'Suite Spa',
        'spa': 'Circuito Spa'
    };
    return names[moduleType] || moduleType;
}

// ===== WORKLOAD REPORT =====

async function getStaffWorkloadReport(startDate, endDate) {
    try {
        const snapshot = await db.collection("spa_reservations")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate)
            .where("status", "!=", "cancelled")
            .get();

        const workload = {};

        snapshot.forEach(doc => {
            const booking = doc.data();
            const staffId = booking.staff_id;

            if (!staffId) return;

            if (!workload[staffId]) {
                workload[staffId] = {
                    staff_name: booking.staff_name,
                    total_bookings: 0,
                    total_hours: 0,
                    bookings: []
                };
            }

            workload[staffId].total_bookings++;
            workload[staffId].total_hours += (parseInt(booking.duration) || 60) / 60;
            workload[staffId].bookings.push(booking);
        });

        return workload;
    } catch (err) {
        console.error('Error getting workload report:', err);
        return {};
    }
}

async function showWorkloadReport() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday

    const startDate = weekStart.toISOString().split('T')[0];
    const endDate = weekEnd.toISOString().split('T')[0];

    const workload = await getStaffWorkloadReport(startDate, endDate);

    console.log('=== CARGA DE TRABAJO SEMANAL ===');
    console.log(`Semana: ${startDate} al ${endDate}`);
    console.log('');

    Object.values(workload).forEach(staff => {
        console.log(`${staff.staff_name}:`);
        console.log(`  - Reservas: ${staff.total_bookings}`);
        console.log(`  - Horas totales: ${staff.total_hours.toFixed(1)}h`);
        console.log('');
    });

    return workload;
}

async function getDailyStaffAvailability(roomCode, date) {
    // Returns a map of time -> boolean (is at least one staff available?)
    // Default hours: 10:00 to 22:00
    try {
        // Fetch ALL active staff and filter by pool
        const staffList = await db.collection("spa_staff")
            .where("status", "==", "active")
            .get();

        if (staffList.empty) return {};

        const pool = STAFF_POOLS[roomCode] || [roomCode];
        const normalizedPool = pool.map(p => normalizeRoomCode(p));

        const allStaff = [];
        staffList.forEach(doc => {
            const s = { id: doc.id, ...doc.data() };
            // Case-insensitive matching
            if (s.assigned_rooms && s.assigned_rooms.some(r => normalizedPool.includes(normalizeRoomCode(r)))) {
                allStaff.push(s);
            }
        });

        const staffIds = allStaff.map(s => s.id);

        if (staffIds.length === 0) return {};

        // Fetch all bookings for these staff on this date across all module collections
        const collections = ['reservas_panacea', 'reservas_vip', 'reservas_peluqueria', 'reservas_suite', 'reservas_spa'];
        const allBookings = [];

        for (const col of collections) {
            const snapshot = await db.collection(col)
                .where("fecha", "==", date)
                .get();

            snapshot.forEach(doc => {
                const b = doc.data();
                if (staffIds.includes(b.staff_id) && b.status !== 'anulada') {
                    allBookings.push(b);
                }
            });
        }

        // Fetch exceptions (remains the same as it uses a dedicated collection)
        const exceptionsSnap = await db.collection("spa_staff_availability")
            .where("date", "==", date)
            .get();

        const exceptionsByStaff = {};
        exceptionsSnap.forEach(doc => {
            const e = doc.data();
            if (staffIds.includes(e.staff_id)) {
                exceptionsByStaff[e.staff_id] = e;
            }
        });

        // Calculate availability for each 15 min slot from 10:00 to 21:45
        const timeMap = {};
        const step = 15;

        for (let h = 10; h < 22; h++) {
            for (let m = 0; m < 60; m += step) {
                if (h === 21 && m > 45) continue;
                const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                // Check how many staff are free at this time
                let availableCount = 0;

                for (const staff of allStaff) {
                    // Check exception
                    const exception = exceptionsByStaff[staff.id];
                    let isShiftAvailable = false;

                    if (exception) {
                        if (exception.status === 'unavailable') isShiftAvailable = false;
                        else if (exception.status === 'custom') {
                            isShiftAvailable = isTimeInShifts(timeStr, exception.custom_schedule.shifts, 60); // Check for 60m min slot
                        } else {
                            isShiftAvailable = checkDefaultSchedule(staff, date, timeStr);
                        }
                    } else {
                        isShiftAvailable = checkDefaultSchedule(staff, date, timeStr);
                    }

                    if (isShiftAvailable) {
                        // Check collisions
                        const isBooked = allBookings.some(b =>
                            b.staff_id === staff.id && timesOverlap(b.hora, b.duracion || 60, timeStr, 60)
                        );

                        if (!isBooked) {
                            availableCount++;
                        }
                    }
                }

                timeMap[timeStr] = availableCount;
            }
        }

        return timeMap;

    } catch (err) {
        console.error("Error calculating daily availability:", err);
        return {};
    }
}

function checkDefaultSchedule(staff, date, time) {
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];
    const daySchedule = staff.default_schedule ? staff.default_schedule[dayOfWeek] : null;

    if (!daySchedule || !daySchedule.enabled) return false;
    return isTimeInShifts(time, daySchedule.shifts, 60);
}


// ===== EXPOSE FUNCTIONS =====
window.getAvailableStaffForRoom = getAvailableStaffForRoom;
window.handleStaffFieldsChange = handleStaffFieldsChange;
window.sendStaffWhatsAppNotification = sendStaffWhatsAppNotification;
window.showWorkloadReport = showWorkloadReport;
window.isStaffBooked = isStaffBooked;
window.getDailyStaffAvailability = getDailyStaffAvailability;

