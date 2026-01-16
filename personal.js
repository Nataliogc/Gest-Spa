// personal.js - Staff Management System
// Gestión completa de personal para terapeutas del spa

const staffState = {
    staff: [],
    spaces: [],
    filter: 'active', // 'active' | 'inactive' | 'all'
    currentMonth: new Date(),
    selectedStaff: null,
    availability: {},
    currentCalendarDate: null,
    skillsList: [
        { id: 'masaje', name: 'Masajes' },
        { id: 'facial', name: 'Facial' },
        { id: 'corporal', name: 'Corporal' },
        { id: 'ritual', name: 'Rituales' },
        { id: 'suite', name: 'Suite Spa' },
        { id: 'manicura', name: 'Manicura/Pedicura' },
        { id: 'peluqueria', name: 'Peluquería' },
        { id: 'depilacion', name: 'Depilación' },
        { id: 'maquillaje', name: 'Maquillaje' },
        { id: 'circuito', name: 'Circuito Spa' }
    ]
};

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
    loadSpaces();
    loadStaff();
    setupEventListeners();
});

function setupEventListeners() {
    // Filter radio buttons
    document.querySelectorAll('input[name="staff-filter"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            staffState.filter = e.target.value;
            renderStaffList();
        });
    });
}

// ===== LOAD DATA =====
async function loadSpaces() {
    try {
        const snapshot = await db.collection("spa_spaces").orderBy("name", "asc").get();
        staffState.spaces = [];
        snapshot.forEach(doc => staffState.spaces.push({ id: doc.id, code: doc.data().code, name: doc.data().name }));
    } catch (err) {
        console.error("Error cargando espacios:", err);
    }
}

async function loadStaff() {
    try {
        const snapshot = await db.collection("spa_staff").orderBy("name", "asc").get();
        staffState.staff = [];
        snapshot.forEach(doc => staffState.staff.push({ id: doc.id, ...doc.data() }));
        renderStaffList();
    } catch (err) {
        console.error("Error cargando personal:", err);
        alert("Error cargando personal: " + err.message);
    }
}

// ===== RENDER STAFF LIST =====
function renderStaffList() {
    const container = document.getElementById("staff-list");
    if (!container) return;

    let filtered = staffState.staff;

    // Apply filter
    if (staffState.filter === 'active') {
        filtered = staffState.staff.filter(s => s.status === 'active');
    } else if (staffState.filter === 'inactive') {
        filtered = staffState.staff.filter(s => s.status === 'inactive');
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: #94a3b8;">
            <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;"></i>
            <p style="margin: 0;">No hay personal ${staffState.filter === 'all' ? '' : (staffState.filter === 'active' ? 'activo' : 'dado de baja')}</p>
        </div>`;
        return;
    }

    container.innerHTML = filtered.map(staff => {
        const statusClass = staff.status === 'active' ? 'status-active' : 'status-inactive';
        const statusLabel = staff.status === 'active' ? 'Activo' : 'Baja';

        // Format schedule summary
        const scheduleSummary = getScheduleSummary(staff.default_schedule);

        // Format assigned rooms
        const assignedRooms = (staff.assigned_rooms || []).map(code => {
            const space = staffState.spaces.find(s => s.code === code);
            return space ? space.name : code;
        }).join(', ') || 'Sin asignar';

        return `
            <div class="staff-card">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text);">${staff.name}</h3>
                            <span class="staff-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #64748b;">
                            <div><i class="fas fa-clock" style="width: 16px;"></i> ${scheduleSummary}</div>
                            <div><i class="fas fa-door-open" style="width: 16px;"></i> ${assignedRooms}</div>
                            ${staff.phone ? `<div><i class="fas fa-phone" style="width: 16px;"></i> ${staff.phone}</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="openStaffModal('${staff.id}')" class="btn btn-outline btn-sm" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="openCalendarModal('${staff.id}')" class="btn btn-outline btn-sm" title="Calendario" style="color: #8b5cf6; border-color: #8b5cf6;">
                            <i class="fas fa-calendar-alt"></i>
                        </button>
                        <button onclick="toggleStaffStatus('${staff.id}')" class="btn btn-outline btn-sm" title="${staff.status === 'active' ? 'Dar de baja' : 'Reactivar'}" style="color: ${staff.status === 'active' ? '#ef4444' : '#10b981'};">
                            <i class="fas fa-${staff.status === 'active' ? 'user-times' : 'user-check'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getScheduleSummary(schedule) {
    if (!schedule) return 'Sin horario definido';

    const activeDays = [];
    const dayNames = {
        monday: 'L', tuesday: 'M', wednesday: 'X', thursday: 'J',
        friday: 'V', saturday: 'S', sunday: 'D'
    };

    for (const [day, config] of Object.entries(schedule)) {
        if (config.enabled && config.shifts && config.shifts.length > 0) {
            activeDays.push(dayNames[day]);
        }
    }

    if (activeDays.length === 0) return 'Sin horario';

    // Get typical shift time from first enabled day
    const firstEnabledDay = Object.values(schedule).find(d => d.enabled && d.shifts && d.shifts.length);
    const shiftSummary = firstEnabledDay ?
        firstEnabledDay.shifts.map(s => `${s.start}-${s.end}`).join(', ') : '';

    return `${activeDays.join('-')} ${shiftSummary}`;
}

// ===== STAFF MODAL (CREATE/EDIT) =====
function openStaffModal(staffId = null) {
    const modal = document.getElementById("staff-modal");
    const form = document.getElementById("staff-form");
    const title = document.getElementById("staff-modal-title");

    form.reset();
    document.getElementById("staff-id").value = "";

    // Populate rooms and skills checkboxes FIRST
    renderRoomsCheckboxes();
    renderSkillsCheckboxes();

    if (staffId) {
        const staff = staffState.staff.find(s => s.id === staffId);
        if (staff) {
            title.textContent = "Editar Personal";
            document.getElementById("staff-id").value = staff.id;
            document.getElementById("staff-name").value = staff.name;
            document.getElementById("staff-email").value = staff.email || '';
            document.getElementById("staff-phone").value = staff.phone || '';
            document.getElementById("staff-notes").value = staff.notes || '';
            document.getElementById("staff-status").value = staff.status || 'active';

            // Set assigned rooms checkboxes
            (staff.assigned_rooms || []).forEach(code => {
                const checkbox = document.querySelector(`input[name="assigned-rooms"][value="${code}"]`);
                if (checkbox) checkbox.checked = true;
            });

            // Set skills checkboxes
            (staff.skills || []).forEach(skillId => {
                const checkbox = document.querySelector(`input[name="staff-skills"][value="${skillId}"]`);
                if (checkbox) checkbox.checked = true;
            });

            // Set schedule
            if (staff.default_schedule) {
                populateScheduleInputs(staff.default_schedule);
            }
        }
    } else {
        title.textContent = "Nuevo Personal";
    }

    modal.style.display = "flex";
}

function renderRoomsCheckboxes() {
    const container = document.getElementById("assigned-rooms-container");
    if (!container) return;

    container.innerHTML = staffState.spaces.map(space => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f8fafc; border-radius: 6px; cursor: pointer;">
            <input type="checkbox" name="assigned-rooms" value="${space.code}">
            <span style="font-size: 0.85rem;">${space.name}</span>
        </label>
    `).join('');
}

function renderSkillsCheckboxes() {
    const container = document.getElementById("staff-skills-container");
    if (!container) return;

    container.innerHTML = staffState.skillsList.map(skill => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f8fafc; border-radius: 6px; cursor: pointer;">
            <input type="checkbox" name="staff-skills" value="${skill.id}">
            <span style="font-size: 0.85rem;">${skill.name}</span>
        </label>
    `).join('');
}

function populateScheduleInputs(schedule) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    days.forEach(day => {
        const config = schedule[day];
        const enabledCheckbox = document.getElementById(`schedule-${day}-enabled`);
        const shiftsContainer = document.getElementById(`schedule-${day}-shifts`);

        if (enabledCheckbox) {
            enabledCheckbox.checked = config.enabled;
        }

        if (shiftsContainer && config.shifts) {
            shiftsContainer.innerHTML = config.shifts.map((shift, idx) => `
                <div style="display: flex; gap: 5px; align-items: center;">
                    <input type="time" value="${shift.start}" class="schedule-shift-start" style="flex: 1;">
                    <span>-</span>
                    <input type="time" value="${shift.end}" class="schedule-shift-end" style="flex: 1;">
                    ${idx > 0 ? '<button type="button" onclick="this.parentElement.remove()" class="btn-icon-sm" style="color: #ef4444;"><i class="fas fa-times"></i></button>' : ''}
                </div>
            `).join('');
        }
    });
}

function closeStaffModal() {
    document.getElementById("staff-modal").style.display = "none";
}

async function saveStaff(e) {
    e.preventDefault();

    const id = document.getElementById("staff-id").value;
    const name = document.getElementById("staff-name").value.trim();
    const email = document.getElementById("staff-email").value.trim();
    const phone = document.getElementById("staff-phone").value.trim();
    const notes = document.getElementById("staff-notes").value.trim();
    const status = document.getElementById("staff-status").value;

    // Get assigned rooms
    const assignedRooms = Array.from(document.querySelectorAll('input[name="assigned-rooms"]:checked'))
        .map(cb => cb.value);

    // Get skills
    const skills = Array.from(document.querySelectorAll('input[name="staff-skills"]:checked'))
        .map(cb => cb.value);

    // Build schedule from inputs
    const schedule = buildScheduleFromInputs();

    const staffData = {
        name,
        email,
        phone,
        notes,
        status,
        assigned_rooms: assignedRooms,
        skills: skills,
        default_schedule: schedule,
        updated_at: new Date().toISOString()
    };

    try {
        if (id) {
            await db.collection("spa_staff").doc(id).update(staffData);
            alert("Personal actualizado correctamente.");
        } else {
            staffData.created_at = new Date().toISOString();
            await db.collection("spa_staff").add(staffData);
            alert("Personal creado correctamente.");
        }

        closeStaffModal();
        loadStaff();
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("Error guardando personal:", err);
        alert("Error al guardar: " + err.message);
    }
}

function buildScheduleFromInputs() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const schedule = {};

    days.forEach(day => {
        const enabled = document.getElementById(`schedule-${day}-enabled`)?.checked || false;
        const shiftsContainer = document.getElementById(`schedule-${day}-shifts`);

        const shifts = [];
        if (shiftsContainer) {
            const shiftDivs = shiftsContainer.querySelectorAll('div');
            shiftDivs.forEach(div => {
                const start = div.querySelector('.schedule-shift-start')?.value;
                const end = div.querySelector('.schedule-shift-end')?.value;
                if (start && end) {
                    shifts.push({ start, end });
                }
            });
        }

        schedule[day] = { enabled, shifts };
    });

    return schedule;
}

function addShift(day) {
    const container = document.getElementById(`schedule-${day}-shifts`);
    if (!container) return;

    const div = document.createElement('div');
    div.style.cssText = 'display: flex; gap: 5px; align-items: center; margin-top: 5px;';
    div.innerHTML = `
        <input type="time" value="10:00" class="schedule-shift-start" style="flex: 1;">
        <span>-</span>
        <input type="time" value="18:00" class="schedule-shift-end" style="flex: 1;">
        <button type="button" onclick="this.parentElement.remove()" class="btn-icon-sm" style="color: #ef4444;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

// ===== TOGGLE STATUS =====
async function toggleStaffStatus(staffId) {
    const staff = staffState.staff.find(s => s.id === staffId);
    if (!staff) return;

    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? 'dar de baja' : 'reactivar';

    if (!confirm(`¿Seguro que quieres ${action} a ${staff.name}?`)) return;

    try {
        await db.collection("spa_staff").doc(staffId).update({
            status: newStatus,
            updated_at: new Date().toISOString()
        });

        alert(`${staff.name} ${newStatus === 'inactive' ? 'dado de baja' : 'reactivado'} correctamente.`);
        loadStaff();
    } catch (err) {
        if (window.checkFirestoreError && window.checkFirestoreError(err)) return;
        console.error("Error cambiando estado:", err);
        alert("Error: " + err.message);
    }
}

// ===== CALENDAR MODAL =====
function openCalendarModal(staffId) {
    const staff = staffState.staff.find(s => s.id === staffId);
    if (!staff) return;

    staffState.selectedStaff = staff;
    staffState.currentCalendarDate = new Date();

    document.getElementById("calendar-staff-name").textContent = staff.name;
    document.getElementById("calendar-modal").style.display = "flex";

    loadStaffAvailability(staffId);
}

function closeCalendarModal() {
    document.getElementById("calendar-modal").style.display = "none";
    staffState.selectedStaff = null;
}

async function loadStaffAvailability(staffId) {
    try {
        const year = staffState.currentCalendarDate.getFullYear();
        const month = staffState.currentCalendarDate.getMonth() + 1;

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

        // Simplified query - no composite index needed
        const snapshot = await db.collection("spa_staff_availability")
            .where("staff_id", "==", staffId)
            .get();

        staffState.availability = {};
        snapshot.forEach(doc => {
            const date = doc.data().date;
            // Filter by date range in JavaScript
            if (date >= startDate && date <= endDate) {
                staffState.availability[date] = { id: doc.id, ...doc.data() };
            }
        });

        renderCalendar();
    } catch (err) {
        console.error("Error cargando disponibilidad:", err);
    }
}

function renderCalendar() {
    const container = document.getElementById("calendar-grid");
    if (!container) return;

    const year = staffState.currentCalendarDate.getFullYear();
    const month = staffState.currentCalendarDate.getMonth();

    // Update month/year display
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    document.getElementById("calendar-month-year").textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday = 0

    let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">';

    // Day headers
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(day => {
        html += `<div style="text-align: center; font-weight: 600; color: #64748b; padding: 8px; font-size: 0.75rem;">${day}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div></div>';
    }

    // Days
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const defaultSchedule = staffState.selectedStaff.default_schedule || {};

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const availability = staffState.availability[dateStr];
        const dayOfWeek = dayNames[dateObj.getDay()];
        const dayConfig = defaultSchedule[dayOfWeek];

        let status = 'available'; // default
        let icon = '🟢';
        let title = 'Disponible (horario base)';

        // Check default schedule first
        if (!dayConfig || !dayConfig.enabled) {
            status = 'default-unavailable';
            icon = '🔴'; // Visualmente igual a No disponible
            title = 'No laborable (Horario habitual)';
        } else {
            // Add schedule info to title
            const shiftsStr = dayConfig.shifts ? dayConfig.shifts.map(s => `${s.start}-${s.end}`).join(', ') : '';
            title = `Disponible (${shiftsStr})`;
        }

        if (availability) {
            if (availability.status === 'unavailable') {
                status = 'unavailable';
                icon = '🔴';
                title = availability.reason || 'No disponible';
            } else if (availability.status === 'custom') {
                status = 'custom';
                icon = '🟠';
                title = 'Horario personalizado';
            }
        }

        const bgStyle = (status === 'unavailable' || status === 'default-unavailable') ? '#fee2e2' :
            (status === 'custom' ? '#fef3c7' : '#dcfce7'); // Light green for available

        html += `
            <div onclick="openDayDetailModal('${dateStr}')" style="
                padding: 8px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                cursor: pointer;
                text-align: center;
                background: ${bgStyle};
                transition: all 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="${title}">
                <div style="font-size: 0.75rem; color: #64748b;">${day}</div>
                <div style="font-size: 1.2rem;">${icon}</div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function changeMonth(delta) {
    staffState.currentCalendarDate.setMonth(staffState.currentCalendarDate.getMonth() + delta);
    loadStaffAvailability(staffState.selectedStaff.id);
}

// ===== DAY DETAIL MODAL =====
function openDayDetailModal(dateStr) {
    const modal = document.getElementById("day-detail-modal");
    const availability = staffState.availability[dateStr];

    document.getElementById("day-detail-date").textContent = new Date(dateStr + 'T00:00').toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Set current status
    if (availability) {
        document.querySelector(`input[name="day-status"][value="${availability.status}"]`).checked = true;
        if (availability.status === 'unavailable') {
            document.getElementById("day-reason").value = availability.reason || '';
        } else if (availability.status === 'custom') {
            renderCustomShifts(availability.custom_schedule.shifts);
        }
    } else {
        document.querySelector('input[name="day-status"][value="available"]').checked = true;
    }

    document.getElementById("day-detail-date-value").value = dateStr;

    // Update label for default status
    const dateObj = new Date(dateStr + 'T00:00');
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];
    const defaultSchedule = staffState.selectedStaff.default_schedule || {};
    const dayConfig = defaultSchedule[dayOfWeek];
    const defaultSpan = document.querySelector('input[name="day-status"][value="available"]').nextElementSibling;

    if (!dayConfig || !dayConfig.enabled) {
        defaultSpan.textContent = "🔴 Usar horario base (No laborable)";
    } else {
        const shiftsStr = dayConfig.shifts ? dayConfig.shifts.map(s => `${s.start}-${s.end}`).join(', ') : '';
        defaultSpan.textContent = `🟢 Usar horario base (${shiftsStr})`;
    }

    // Determine default shifts for this day
    let defaultShiftsForDay = [];
    if (dayConfig && dayConfig.enabled && dayConfig.shifts) {
        defaultShiftsForDay = JSON.parse(JSON.stringify(dayConfig.shifts));
    } else {
        // Fallback if day is disabled default to standard shift
        defaultShiftsForDay = [{ start: '10:00', end: '14:00' }];
    }

    // Identify current active shifts for custom view
    let activeCustomShifts = [];
    if (availability && availability.status === 'custom' && availability.custom_schedule) {
        activeCustomShifts = availability.custom_schedule.shifts;
    }

    // Initial render of custom shifts (hidden or shown based on status)
    renderCustomShifts(activeCustomShifts);

    // Setup radio button listeners to toggle visibility and re-populate if needed
    const radios = document.querySelectorAll('input[name="day-status"]');
    const customContainer = document.getElementById("custom-schedule-container");
    const unavailableContainer = document.getElementById("unavailable-reason-container");

    function updateVisibility() {
        const checkedRadio = document.querySelector('input[name="day-status"]:checked');
        if (!checkedRadio) return;

        const value = checkedRadio.value;

        if (customContainer) customContainer.style.display = value === 'custom' ? 'block' : 'none';
        if (unavailableContainer) unavailableContainer.style.display = value === 'unavailable' ? 'block' : 'none';

        // If switching to custom, start empty unless we are already editing an existing custom schedule
        if (value === 'custom') {
            if (!availability || availability.status !== 'custom') {
                renderCustomShifts([]);
            }
        }
    }

    radios.forEach(radio => {
        radio.onclick = updateVisibility;
    });

    // Initial visibility check
    setTimeout(updateVisibility, 0);

    modal.style.display = "flex";
}

function renderCustomShifts(shifts) {
    const container = document.getElementById("custom-shifts-container");
    if (!container) return;

    if (!shifts || shifts.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = shifts.map((shift, idx) => `
        <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
            <input type="time" value="${shift.start}" class="custom-shift-start" style="flex: 1;">
            <span>-</span>
            <input type="time" value="${shift.end}" class="custom-shift-end" style="flex: 1;">
            ${idx > 0 ? '<button type="button" onclick="this.parentElement.remove()" class="btn-icon-sm" style="color: #ef4444;"><i class="fas fa-times"></i></button>' : ''}
        </div>
    `).join('');
}

function addCustomShift() {
    const container = document.getElementById("custom-shifts-container");
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; gap: 5px; align-items: center; margin-bottom: 5px;';
    div.innerHTML = `
        <input type="time" value="10:00" class="custom-shift-start" style="flex: 1;">
        <span>-</span>
        <input type="time" value="18:00" class="custom-shift-end" style="flex: 1;">
        <button type="button" onclick="this.parentElement.remove()" class="btn-icon-sm" style="color: #ef4444;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

function closeDayDetailModal() {
    document.getElementById("day-detail-modal").style.display = "none";
}

async function saveDayAvailability(e) {
    e.preventDefault();

    const dateStr = document.getElementById("day-detail-date-value").value;
    const status = document.querySelector('input[name="day-status"]:checked').value;
    const staffId = staffState.selectedStaff.id;

    let data = {
        staff_id: staffId,
        date: dateStr,
        status: status,
        updated_at: new Date().toISOString()
    };

    if (status === 'unavailable') {
        data.reason = document.getElementById("day-reason").value.trim();
    } else if (status === 'custom') {
        const shifts = [];
        const container = document.getElementById("custom-shifts-container");
        container.querySelectorAll('div').forEach(div => {
            const start = div.querySelector('.custom-shift-start')?.value;
            const end = div.querySelector('.custom-shift-end')?.value;
            if (start && end) shifts.push({ start, end });
        });
        data.custom_schedule = { shifts };
    }

    try {
        const existing = staffState.availability[dateStr];

        if (status === 'available') {
            // Remove exception if exists
            if (existing && existing.id) {
                await db.collection("spa_staff_availability").doc(existing.id).delete();
            }
        } else {
            // Create or update exception
            if (existing && existing.id) {
                await db.collection("spa_staff_availability").doc(existing.id).update(data);
            } else {
                data.created_at = new Date().toISOString();
                await db.collection("spa_staff_availability").add(data);
            }
        }

        closeDayDetailModal();
        loadStaffAvailability(staffId);
        alert("Disponibilidad actualizada correctamente.");
    } catch (err) {
        console.error("Error guardando disponibilidad:", err);
        alert("Error: " + err.message);
    }
}

// ===== UTILITY: Get available staff for booking =====
// NOTE: These functions were removed because they caused N+1 query performance issues.
// Use 'reservas-staff.js' and 'getAvailableStaffForRoom' instead, which uses batch fetching.
// - getAvailableStaff() [REMOVED]
// - checkStaffAvailability() [REMOVED]
// - isTimeInShifts() [REMOVED]
