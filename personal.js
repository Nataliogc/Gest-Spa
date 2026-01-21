/**
 * personal.js - Gestión de Personal para Zenith Manager
 * Maneja terapeutas, horarios y disponibilidad
 */

// ============================================================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================================================

const db = firebase.firestore();

let allStaffList = [];
let currentFilter = 'active';
let editingStaffId = null;
let globalBaseSchedule = null;

// Configuración de salas disponibles
const AVAILABLE_ROOMS = [
    { code: 'cabina', label: 'Cabinas', icon: 'fa-door-closed' },
    { code: 'panacea', label: 'Panacea', icon: 'fa-spa' },
    { code: 'suite', label: 'Suite', icon: 'fa-gem' },
    { code: 'vip', label: 'VIP', icon: 'fa-crown' },
    { code: 'peluqueria', label: 'Peluquería', icon: 'fa-cut' },
    { code: 'spa', label: 'Circuito Spa', icon: 'fa-water' }
];

// Habilidades disponibles
const AVAILABLE_SKILLS = [
    { code: 'masaje', label: 'Masajes' },
    { code: 'facial', label: 'Faciales' },
    { code: 'corporal', label: 'Corporales' },
    { code: 'ritual', label: 'Rituales' },
    { code: 'circuito', label: 'Circuito Spa' },
    { code: 'peluqueria', label: 'Peluquería' },
    { code: 'manicura', label: 'Manicura/Pedicura' }
];

// Días de la semana
const WEEKDAYS = [
    { key: 'monday', label: 'Lunes' },
    { key: 'tuesday', label: 'Martes' },
    { key: 'wednesday', label: 'Miércoles' },
    { key: 'thursday', label: 'Jueves' },
    { key: 'friday', label: 'Viernes' },
    { key: 'saturday', label: 'Sábado' },
    { key: 'sunday', label: 'Domingo' }
];

// Estado del calendario
let calendarState = {
    staffId: null,
    staffName: '',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    staffSchedule: null,
    seasonalSchedules: [],
    dayExceptions: {}
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[PERSONAL] Inicializando módulo de personal...');

    // Inicializar checkboxes de espacios asignados
    renderRoomCheckboxes();

    // Inicializar checkboxes de habilidades
    renderSkillsCheckboxes();

    // Cargar lista de personal
    await loadStaffList();

    // Configurar listeners de filtros
    setupFilterListeners();

    // Configurar toggling de opciones en modal de día
    setupDayDetailListeners();

    // Cargar horario base global
    await loadGlobalBaseSchedule();

    // Configurar delegación para colapsar periodos estacionales
    setupSeasonalCollapsible();

    console.log('[PERSONAL] Módulo inicializado correctamente');
});

function setupSeasonalCollapsible() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.seasonal-toggle-btn')) {
            const card = e.target.closest('.seasonal-period-card');
            const body = card.querySelector('.seasonal-schedule-body');
            const icon = e.target.closest('.seasonal-toggle-btn').querySelector('i');
            if (body.style.display === 'none') {
                body.style.display = 'block';
                icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                body.style.display = 'none';
                icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        }
    });
}

// ============================================================================
// RENDERIZADO DE UI
// ============================================================================

function renderRoomCheckboxes() {
    const container = document.getElementById('assigned-rooms-container');
    if (!container) return;

    container.innerHTML = AVAILABLE_ROOMS.map(room => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; 
            background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer;
            transition: all 0.2s; font-size: 0.85rem;">
            <input type="checkbox" name="assigned_rooms" value="${room.code}" 
                style="width: 16px; height: 16px; accent-color: var(--accent);">
            <i class="fas ${room.icon}" style="color: var(--accent); width: 16px;"></i>
            <span>${room.label}</span>
        </label>
    `).join('');
}

function renderSkillsCheckboxes() {
    const container = document.getElementById('staff-skills-container');
    if (!container) return;

    container.innerHTML = AVAILABLE_SKILLS.map(skill => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; 
            background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer;
            transition: all 0.2s; font-size: 0.85rem;">
            <input type="checkbox" name="skills" value="${skill.code}" 
                style="width: 16px; height: 16px; accent-color: #6366f1;">
            <span>${skill.label}</span>
        </label>
    `).join('');
}

function setupFilterListeners() {
    document.querySelectorAll('input[name="staff-filter"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderStaffList();
        });
    });
}

function setupDayDetailListeners() {
    // Toggle visibilidad del motivo cuando se selecciona "no disponible"
    document.querySelectorAll('input[name="day-status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const reasonContainer = document.getElementById('unavailable-reason-container');
            const customContainer = document.getElementById('custom-schedule-container');

            if (e.target.value === 'unavailable') {
                reasonContainer.style.display = 'block';
                customContainer.style.display = 'none';
            } else if (e.target.value === 'custom') {
                reasonContainer.style.display = 'none';
                customContainer.style.display = 'block';
            } else {
                reasonContainer.style.display = 'none';
                customContainer.style.display = 'none';
            }
        });
    });
}

// ============================================================================
// CARGA DE DATOS
// ============================================================================

async function loadStaffList() {
    try {
        const container = document.getElementById('staff-list');
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                <p style="margin: 10px 0 0 0;">Cargando personal...</p>
            </div>
        `;

        const snapshot = await db.collection('spa_staff').get();
        allStaffList = [];

        snapshot.forEach(doc => {
            allStaffList.push({ id: doc.id, ...doc.data() });
        });

        console.log(`[PERSONAL] Cargados ${allStaffList.length} miembros del personal`);
        renderStaffList();

    } catch (err) {
        console.error('[PERSONAL] Error cargando personal:', err);
        document.getElementById('staff-list').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                <p style="margin: 10px 0 0 0;">Error cargando personal</p>
                <button onclick="loadStaffList()" class="btn btn-outline" style="margin-top: 15px;">
                    <i class="fas fa-sync"></i> Reintentar
                </button>
            </div>
        `;
    }
}

function renderStaffList() {
    const container = document.getElementById('staff-list');

    // Filtrar según el filtro actual
    let filteredList = allStaffList.filter(staff => {
        const isActive = staff.activo === true || staff.status === 'active';

        if (currentFilter === 'active') return isActive;
        if (currentFilter === 'inactive') return !isActive;
        return true; // 'all'
    });

    if (filteredList.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px; text-align: center; color: #94a3b8;">
                <i class="fas fa-user-slash" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p style="margin: 0; font-size: 1.1rem;">No hay personal en esta categoría</p>
                <p style="margin: 5px 0 0 0; font-size: 0.9rem;">
                    ${currentFilter === 'active' ? 'Todos los empleados están dados de baja' :
                currentFilter === 'inactive' ? 'No hay empleados dados de baja' :
                    'Añade personal con el botón "Nuevo Personal"'}
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredList.map(staff => renderStaffCard(staff)).join('');
}

function renderStaffCard(staff) {
    const isActive = staff.activo === true || staff.status === 'active';
    const name = staff.nombre || staff.name || 'Sin nombre';
    const email = staff.email || '';
    const phone = staff.telefono || staff.phone || '';

    // Salas asignadas
    const rooms = staff.assigned_rooms || staff.salas || [];
    const roomLabels = rooms.map(r => {
        const room = AVAILABLE_ROOMS.find(ar => ar.code === r.toLowerCase());
        return room ? room.label : r;
    });

    // Skills
    const skills = staff.skills || [];
    const skillLabels = skills.map(s => {
        const skill = AVAILABLE_SKILLS.find(as => as.code === s.toLowerCase());
        return skill ? skill.label : s;
    });

    // Horario resumido
    const scheduleInfo = getScheduleSummary(staff.default_schedule);

    return `
        <div class="staff-card" id="staff-card-${staff.id}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="width: 45px; height: 45px; background: linear-gradient(135deg, var(--accent) 0%, #c9963a 100%); 
                            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                            color: white; font-weight: 700; font-size: 1.1rem;">
                            ${getInitials(name)}
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--text);">${name}</h3>
                            <span class="staff-status ${isActive ? 'status-active' : 'status-inactive'}">
                                ${isActive ? 'Activo' : 'Baja'}
                            </span>
                        </div>
                    </div>
                    
                    ${email || phone ? `
                        <div style="display: flex; gap: 15px; margin-bottom: 10px; font-size: 0.85rem; color: #64748b;">
                            ${email ? `<span><i class="fas fa-envelope" style="margin-right: 5px;"></i>${email}</span>` : ''}
                            ${phone ? `<span><i class="fas fa-phone" style="margin-right: 5px;"></i>${phone}</span>` : ''}
                        </div>
                    ` : ''}
                    
                    ${roomLabels.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                            ${roomLabels.map(r => `
                                <span style="background: #e0f2fe; color: #0369a1; padding: 3px 10px; 
                                    border-radius: 15px; font-size: 0.75rem; font-weight: 600;">
                                    ${r}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${skillLabels.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                            ${skillLabels.map(s => `
                                <span style="background: #f3e8ff; color: #7c3aed; padding: 3px 10px; 
                                    border-radius: 15px; font-size: 0.75rem; font-weight: 600;">
                                    ${s}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${scheduleInfo ? `
                        <div style="font-size: 0.8rem; color: #64748b;">
                            <i class="fas fa-clock" style="margin-right: 5px;"></i>${scheduleInfo}
                        </div>
                    ` : ''}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button onclick="editStaff('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 8px 12px; font-size: 0.8rem;">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button onclick="openCalendarModal('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 8px 12px; font-size: 0.8rem; border-color: #6366f1; color: #6366f1;">
                        <i class="fas fa-calendar-alt"></i> Calendario
                    </button>
                </div>
            </div>
            
            ${staff.notes ? `
                <div style="margin-top: 10px; padding: 10px; background: #fffbeb; border-radius: 6px; 
                    font-size: 0.8rem; color: #92400e; border-left: 3px solid #f59e0b;">
                    <i class="fas fa-sticky-note" style="margin-right: 5px;"></i>${staff.notes}
                </div>
            ` : ''}
        </div>
    `;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getScheduleSummary(schedule) {
    if (!schedule) return null;

    const workingDays = WEEKDAYS.filter(day => schedule[day.key]?.enabled).map(d => d.label.substring(0, 3));

    if (workingDays.length === 0) return 'Sin horario definido';
    if (workingDays.length === 7) return 'Todos los días';

    return workingDays.join(', ');
}

// ============================================================================
// MODAL DE PERSONAL
// ============================================================================

function openStaffModal(staffId = null) {
    editingStaffId = staffId;

    const modal = document.getElementById('staff-modal');
    const title = document.getElementById('staff-modal-title');
    const form = document.getElementById('staff-form');

    // Reset form
    form.reset();
    document.getElementById('staff-id').value = '';

    // Limpiar periodos estacionales
    const seasonalContainer = document.getElementById('seasonal-periods-container');
    if (seasonalContainer) seasonalContainer.innerHTML = '';

    if (staffId) {
        const staff = allStaffList.find(s => s.id === staffId);
        if (staff) {
            title.textContent = 'Editar Personal';
            populateForm(staff);
        }
    } else {
        title.textContent = 'Nuevo Personal';
        // Set default schedule checkboxes (Mon-Fri checked)
        setDefaultSchedule();
    }

    modal.style.display = 'flex';
}

function closeStaffModal() {
    document.getElementById('staff-modal').style.display = 'none';
    editingStaffId = null;
}

function editStaff(staffId) {
    openStaffModal(staffId);
}

function populateForm(staff) {
    document.getElementById('staff-id').value = staff.id;
    document.getElementById('staff-name').value = staff.nombre || staff.name || '';
    document.getElementById('staff-email').value = staff.email || '';
    document.getElementById('staff-phone').value = staff.telefono || staff.phone || '';
    document.getElementById('staff-status').value = (staff.activo === true || staff.status === 'active') ? 'active' : 'inactive';
    document.getElementById('staff-notes').value = staff.notes || '';

    // Set assigned rooms
    const rooms = staff.assigned_rooms || staff.salas || [];
    document.querySelectorAll('input[name="assigned_rooms"]').forEach(cb => {
        cb.checked = rooms.map(r => r.toLowerCase()).includes(cb.value.toLowerCase());
    });

    // Set skills
    const skills = staff.skills || [];
    document.querySelectorAll('input[name="skills"]').forEach(cb => {
        cb.checked = skills.map(s => s.toLowerCase()).includes(cb.value.toLowerCase());
    });

    // Set schedule
    const schedule = staff.default_schedule || {};
    WEEKDAYS.forEach(day => {
        const dayConfig = schedule[day.key];
        const checkbox = document.getElementById(`schedule-${day.key}-enabled`);
        if (checkbox) {
            checkbox.checked = dayConfig?.enabled || false;
        }

        // Set shift times
        const shiftsContainer = document.getElementById(`schedule-${day.key}-shifts`);
        if (shiftsContainer) {
            // Limpiar turnos extra previos
            const extraShifts = shiftsContainer.querySelectorAll('div');
            extraShifts.forEach(s => s.remove());

            if (dayConfig?.shifts?.length > 0) {
                const firstStart = shiftsContainer.querySelector('.schedule-shift-start');
                const firstEnd = shiftsContainer.querySelector('.schedule-shift-end');
                if (firstStart) firstStart.value = dayConfig.shifts[0].start || '10:00';
                if (firstEnd) firstEnd.value = dayConfig.shifts[0].end || '18:00';

                // Añadir turnos extra si existen
                for (let i = 1; i < dayConfig.shifts.length; i++) {
                    addShift(day.key);
                    const allStarts = shiftsContainer.querySelectorAll('.schedule-shift-start');
                    const allEnds = shiftsContainer.querySelectorAll('.schedule-shift-end');
                    if (allStarts[i]) allStarts[i].value = dayConfig.shifts[i].start;
                    if (allEnds[i]) allEnds[i].value = dayConfig.shifts[i].end;
                }
            }
        }
    });

    // Cargar horarios por temporadas
    const seasonalContainer = document.getElementById('seasonal-periods-container');
    if (seasonalContainer) {
        seasonalContainer.innerHTML = '';
        const seasonalSchedules = staff.seasonal_schedules || [];
        seasonalSchedules.forEach(data => addSeasonalPeriod(data));
    }
}

function setDefaultSchedule() {
    if (!globalBaseSchedule) {
        // Fallback hardcoded if global not loaded
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
            const checkbox = document.getElementById(`schedule-${day}-enabled`);
            if (checkbox) checkbox.checked = true;
        });
        return;
    }

    WEEKDAYS.forEach(day => {
        const config = globalBaseSchedule[day.key];
        const checkbox = document.getElementById(`schedule-${day.key}-enabled`);
        if (checkbox) checkbox.checked = config?.enabled || false;

        const container = document.getElementById(`schedule-${day.key}-shifts`);
        if (container && config?.shifts?.length > 0) {
            // Clear existing shifts except first one
            const shifts = container.querySelectorAll('div');
            shifts.forEach(s => s.remove());

            // Set first shift
            const startInput = container.querySelector('.schedule-shift-start');
            const endInput = container.querySelector('.schedule-shift-end');
            if (startInput) startInput.value = config.shifts[0].start;
            if (endInput) endInput.value = config.shifts[0].end;

            // Add additional shifts if any
            for (let i = 1; i < config.shifts.length; i++) {
                const newShift = document.createElement('div');
                newShift.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 8px;';
                newShift.innerHTML = `
                    <input type="time" value="${config.shifts[i].start}" class="schedule-shift-start"
                        style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
                    <span style="color: #94a3b8;">-</span>
                    <input type="time" value="${config.shifts[i].end}" class="schedule-shift-end"
                        style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
                    <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm"
                        style="padding: 6px 8px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                container.appendChild(newShift);
            }
        }
    });
}

async function saveStaff(event) {
    event.preventDefault();

    const staffId = document.getElementById('staff-id').value;
    const name = document.getElementById('staff-name').value.trim();

    if (!name) {
        alert('El nombre es obligatorio');
        return;
    }

    // Collect assigned rooms
    const assignedRooms = [];
    document.querySelectorAll('input[name="assigned_rooms"]:checked').forEach(cb => {
        assignedRooms.push(cb.value);
    });

    // Collect skills
    const skills = [];
    document.querySelectorAll('input[name="skills"]:checked').forEach(cb => {
        skills.push(cb.value);
    });

    // Collect schedule
    const defaultSchedule = {};
    WEEKDAYS.forEach(day => {
        const enabled = document.getElementById(`schedule-${day.key}-enabled`)?.checked || false;
        const shiftsContainer = document.getElementById(`schedule-${day.key}-shifts`);

        const shifts = [];
        if (shiftsContainer) {
            const shiftPairs = shiftsContainer.querySelectorAll('.schedule-shift-start');
            shiftPairs.forEach((startInput, index) => {
                const endInput = shiftsContainer.querySelectorAll('.schedule-shift-end')[index];
                if (startInput?.value && endInput?.value) {
                    shifts.push({
                        start: startInput.value,
                        end: endInput.value
                    });
                }
            });
        }

        defaultSchedule[day.key] = {
            enabled,
            shifts: shifts.length > 0 ? shifts : [{ start: '10:00', end: '18:00' }]
        };
    });

    // Recopilar horarios por temporadas
    const seasonalSchedules = [];
    document.querySelectorAll('.seasonal-period-card').forEach(card => {
        const name = card.querySelector('.seasonal-name').value.trim();
        const start = card.querySelector('.seasonal-start').value;
        const end = card.querySelector('.seasonal-end').value;

        if (start && end) {
            const periodSchedule = {};
            WEEKDAYS.forEach(day => {
                const dayEnabled = card.querySelector(`.seasonal-${day.key}-enabled`)?.checked || false;
                const dayShifts = [];

                // Nota: Por simplicidad ahora tomamos el primer turno, pero podríamos extenderlo
                const shiftStartInputs = card.querySelectorAll(`.seasonal-${day.key}-shifts .schedule-shift-start`);
                shiftStartInputs.forEach((startInput, index) => {
                    const endInput = card.querySelectorAll(`.seasonal-${day.key}-shifts .schedule-shift-end`)[index];
                    if (startInput?.value && endInput?.value) {
                        dayShifts.push({ start: startInput.value, end: endInput.value });
                    }
                });

                periodSchedule[day.key] = {
                    enabled: dayEnabled,
                    shifts: dayShifts.length > 0 ? dayShifts : [{ start: '10:00', end: '18:00' }]
                };
            });

            seasonalSchedules.push({
                name,
                start,
                end,
                schedule: periodSchedule
            });
        }
    });

    const staffData = {
        nombre: name,
        name: name, // Legacy compatibility
        email: document.getElementById('staff-email').value.trim() || null,
        telefono: document.getElementById('staff-phone').value.trim() || null,
        phone: document.getElementById('staff-phone').value.trim() || null, // Legacy
        activo: document.getElementById('staff-status').value === 'active',
        status: document.getElementById('staff-status').value, // Legacy
        notes: document.getElementById('staff-notes').value.trim() || null,
        assigned_rooms: assignedRooms,
        salas: assignedRooms, // Legacy compatibility
        skills: skills,
        default_schedule: defaultSchedule,
        seasonal_schedules: seasonalSchedules,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (staffId) {
            // Update existing
            await db.collection('spa_staff').doc(staffId).update(staffData);
            console.log('[PERSONAL] Personal actualizado:', staffId);
        } else {
            // Create new
            staffData.created_at = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('spa_staff').add(staffData);
            console.log('[PERSONAL] Personal creado:', docRef.id);
        }

        closeStaffModal();
        await loadStaffList();

    } catch (err) {
        console.error('[PERSONAL] Error guardando personal:', err);
        alert('Error al guardar: ' + err.message);
    }
}

function addShift(day, containerId = null) {
    const id = containerId || `schedule-${day}-shifts`;
    const container = document.getElementById(id);
    if (!container) return;

    const newShift = document.createElement('div');
    newShift.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 8px;';
    newShift.innerHTML = `
        <input type="time" value="14:00" class="schedule-shift-start"
            style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <span style="color: #94a3b8;">-</span>
        <input type="time" value="18:00" class="schedule-shift-end"
            style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm"
            style="padding: 6px 8px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(newShift);
}

function addShiftToGlobal(day) {
    addShift(day, `global-schedule-${day}-shifts`);
}

// ============================================================================
// HORARIO BASE GLOBAL
// ============================================================================

async function loadGlobalBaseSchedule() {
    try {
        const doc = await db.collection('spa_config').doc('staff_base_schedule').get();
        if (doc.exists) {
            globalBaseSchedule = doc.data().schedule;
            console.log('[PERSONAL] Horario base global cargado');
        } else {
            // Default fallback
            globalBaseSchedule = {};
            WEEKDAYS.forEach(day => {
                globalBaseSchedule[day.key] = {
                    enabled: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day.key),
                    shifts: [{ start: '10:00', end: '18:00' }]
                };
            });
            console.log('[PERSONAL] Horario base global no encontrado, usando web por defecto');
        }
    } catch (err) {
        console.error('[PERSONAL] Error cargando horario base global:', err);
    }
}

function openGlobalScheduleModal() {
    const modal = document.getElementById('global-schedule-modal');
    if (!modal) return;

    renderGlobalScheduleGrid();
    modal.style.display = 'flex';
}

function closeGlobalScheduleModal() {
    document.getElementById('global-schedule-modal').style.display = 'none';
}

function renderGlobalScheduleGrid() {
    const container = document.getElementById('global-schedule-container');
    if (!container) return;

    let html = '';
    WEEKDAYS.forEach(day => {
        const dayConfig = globalBaseSchedule[day.key] || { enabled: false, shifts: [{ start: '10:00', end: '18:00' }] };
        const isEnabled = dayConfig.enabled;

        html += `
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <label style="min-width: 90px; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="global-schedule-${day.key}-enabled" ${isEnabled ? 'checked' : ''}
                        style="width: 18px; height: 18px; cursor: pointer;">
                    <span>${day.label}</span>
                </label>
                <div id="global-schedule-${day.key}-shifts" style="flex: 1; display: flex; flex-direction: column; gap: 5px;">
                    ${dayConfig.shifts.map((shift, index) => `
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <input type="time" value="${shift.start}" class="schedule-shift-start"
                                style="width: 100px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
                            <span style="color: #94a3b8;">-</span>
                            <input type="time" value="${shift.end}" class="schedule-shift-end"
                                style="width: 100px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
                            ${index > 0 ? `
                                <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#ef4444;">
                                    <i class="fas fa-times"></i>
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                <button type="button" onclick="addShiftToGlobal('${day.key}')" class="btn btn-outline btn-sm"
                    style="padding: 6px 10px; font-size: 0.75rem;" title="Añadir turno">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function saveGlobalSchedule() {
    const newSchedule = {};
    WEEKDAYS.forEach(day => {
        const enabled = document.getElementById(`global-schedule-${day.key}-enabled`)?.checked || false;
        const shiftsContainer = document.getElementById(`global-schedule-${day.key}-shifts`);

        const shifts = [];
        if (shiftsContainer) {
            const startInputs = shiftsContainer.querySelectorAll('.schedule-shift-start');
            startInputs.forEach((startInput, index) => {
                const endInput = shiftsContainer.querySelectorAll('.schedule-shift-end')[index];
                if (startInput?.value && endInput?.value) {
                    shifts.push({ start: startInput.value, end: endInput.value });
                }
            });
        }

        newSchedule[day.key] = {
            enabled,
            shifts: shifts.length > 0 ? shifts : [{ start: '10:00', end: '18:00' }]
        };
    });

    try {
        await db.collection('spa_config').doc('staff_base_schedule').set({
            schedule: newSchedule,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        globalBaseSchedule = newSchedule;
        alert('Horario base global guardado correctamente');
        closeGlobalScheduleModal();
    } catch (err) {
        console.error('[PERSONAL] Error guardando horario base global:', err);
        alert('Error al guardar: ' + err.message);
    }
}

function addSeasonalPeriod(data = null) {
    const container = document.getElementById('seasonal-periods-container');
    if (!container) return;

    // Generar un ID único para los inputs de este periodo
    const card = document.createElement('div');
    card.className = 'seasonal-period-card';
    card.style.cssText = 'background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px;';

    const name = data?.name || '';
    const start = data?.start || '';
    const end = data?.end || '';
    const schedule = data?.schedule || {};

    let scheduleHtml = '';
    WEEKDAYS.forEach(day => {
        const dayConfig = schedule[day.key] || { enabled: false, shifts: [{ start: '10:00', end: '18:00' }] };
        scheduleHtml += `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: white; border-bottom: 1px solid #f1f5f9;">
                <label style="min-width: 85px; font-weight: 600; font-size: 0.8rem; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                    <input type="checkbox" class="seasonal-${day.key}-enabled" ${dayConfig.enabled ? 'checked' : ''} style="width: 16px; height: 16px;">
                    <span>${day.label.substring(0, 3)}</span>
                </label>
                <div class="seasonal-${day.key}-shifts" style="flex: 1; display: flex; gap: 6px; flex-wrap: wrap;">
                    ${(dayConfig.shifts || [{ start: '10:00', end: '18:00' }]).map(sh => `
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="time" value="${sh.start}" class="schedule-shift-start" style="padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.75rem;">
                            <span style="color: #94a3b8;">-</span>
                            <input type="time" value="${sh.end}" class="schedule-shift-end" style="padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.75rem;">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    card.innerHTML = `
        <div style="padding: 12px; background: #f1f5f9; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0;">
            <div style="display: flex; gap: 10px; align-items: center; flex: 1;">
                <input type="text" class="seasonal-name" value="${name}" placeholder="Ej: Temporada Alta" style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; font-weight: 600; width: 140px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <input type="date" class="seasonal-start" value="${start}" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem;">
                    <span style="color: #64748b;">al</span>
                    <input type="date" class="seasonal-end" value="${end}" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem;">
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" class="seasonal-toggle-btn btn-icon-only" style="background:none; border:none; color:#64748b; cursor:pointer;" title="Ver horario">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button type="button" onclick="this.closest('.seasonal-period-card').remove()" class="btn-icon-only" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Eliminar periodo">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
        <div class="seasonal-schedule-body" style="display: none; padding: 5px; background: white;">
            <div style="font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; padding: 5px 8px; border-bottom: 1px solid #f1f5f9;">
                Configuración Horaria Semanal
            </div>
            ${scheduleHtml}
        </div>
    `;

    container.appendChild(card);
}

// ============================================================================
// MODAL DE CALENDARIO
// ============================================================================

async function openCalendarModal(staffId) {
    const staff = allStaffList.find(s => s.id === staffId);
    if (!staff) return;

    calendarState.staffId = staffId;
    calendarState.staffName = staff.nombre || staff.name;
    calendarState.staffSchedule = staff.default_schedule || {};
    calendarState.seasonalSchedules = staff.seasonal_schedules || [];

    // Load exceptions for this staff
    await loadStaffExceptions(staffId);

    document.getElementById('calendar-staff-name').textContent = calendarState.staffName;
    renderCalendar();

    document.getElementById('calendar-modal').style.display = 'flex';
}

function closeCalendarModal() {
    document.getElementById('calendar-modal').style.display = 'none';
}

async function loadStaffExceptions(staffId) {
    calendarState.dayExceptions = {};

    try {
        const startDate = new Date(calendarState.currentYear, calendarState.currentMonth, 1);
        const endDate = new Date(calendarState.currentYear, calendarState.currentMonth + 1, 0);

        const startStr = formatDate(startDate);
        const endStr = formatDate(endDate);

        const snapshot = await db.collection('spa_staff_availability')
            .where('staff_id', '==', staffId)
            .where('date', '>=', startStr)
            .where('date', '<=', endStr)
            .get();

        snapshot.forEach(doc => {
            const data = doc.data();
            calendarState.dayExceptions[data.date] = { id: doc.id, ...data };
        });

        console.log(`[PERSONAL] Cargadas ${snapshot.size} excepciones para ${calendarState.staffName}`);

    } catch (err) {
        console.error('[PERSONAL] Error cargando excepciones:', err);
    }
}

function changeMonth(delta) {
    calendarState.currentMonth += delta;

    if (calendarState.currentMonth > 11) {
        calendarState.currentMonth = 0;
        calendarState.currentYear++;
    } else if (calendarState.currentMonth < 0) {
        calendarState.currentMonth = 11;
        calendarState.currentYear--;
    }

    loadStaffExceptions(calendarState.staffId).then(() => renderCalendar());
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    document.getElementById('calendar-month-year').textContent =
        `${monthNames[calendarState.currentMonth]} ${calendarState.currentYear}`;

    const firstDay = new Date(calendarState.currentYear, calendarState.currentMonth, 1);
    const lastDay = new Date(calendarState.currentYear, calendarState.currentMonth + 1, 0);

    // Adjust for Monday start (0 = Sunday in JS, we want 0 = Monday)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    let html = `
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Lun</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Mar</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Mié</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Jue</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Vie</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Sáb</div>
            <div style="padding: 8px; font-weight: 700; color: #64748b; font-size: 0.8rem;">Dom</div>
    `;

    // Empty cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div></div>';
    }

    // Days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = formatDate(new Date(calendarState.currentYear, calendarState.currentMonth, day));
        const dayInfo = getDayInfo(dateStr);

        html += `
            <div onclick="openDayDetail('${dateStr}')" 
                style="padding: 10px; border-radius: 8px; cursor: pointer; transition: all 0.2s;
                    background: ${dayInfo.bgColor}; border: 2px solid ${dayInfo.borderColor};"
                onmouseover="this.style.transform='scale(1.05)'"
                onmouseout="this.style.transform='scale(1)'">
                <div style="font-weight: 600; font-size: 0.9rem; color: ${dayInfo.textColor};">${day}</div>
                <div style="font-size: 0.7rem;">${dayInfo.icon}</div>
            </div>
        `;
    }

    html += '</div>';
    grid.innerHTML = html;
}

function getDayInfo(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];

    // Check exceptions first
    const exception = calendarState.dayExceptions[dateStr];
    if (exception) {
        if (exception.status === 'unavailable' || exception.status === 'off') {
            return { bgColor: '#fee2e2', borderColor: '#fca5a5', textColor: '#991b1b', icon: '🔴' };
        }
        if (exception.status === 'custom') {
            return { bgColor: '#ffedd5', borderColor: '#fed7aa', textColor: '#9a3412', icon: '🟠' };
        }
    }

    // Check active schedule (Season vs Base)
    let activeSchedule = calendarState.staffSchedule || {};
    if (calendarState.seasonalSchedules && Array.isArray(calendarState.seasonalSchedules)) {
        const activePeriod = calendarState.seasonalSchedules.find(p => dateStr >= p.start && dateStr <= p.end);
        if (activePeriod) {
            activeSchedule = activePeriod.schedule || {};
        }
    }

    const dayConfig = activeSchedule[dayOfWeek];
    if (dayConfig?.enabled) {
        return { bgColor: '#d1fae5', borderColor: '#a7f3d0', textColor: '#065f46', icon: '🟢' };
    }

    return { bgColor: '#f1f5f9', borderColor: '#e2e8f0', textColor: '#64748b', icon: '⚪' };
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ============================================================================
// MODAL DE DETALLE DE DÍA
// ============================================================================

function openDayDetail(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = date.toLocaleDateString('es-ES', options);

    document.getElementById('day-detail-date').textContent = formattedDate;
    document.getElementById('day-detail-date-value').value = dateStr;

    // Get day of week for base schedule info
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
    const dayConfig = calendarState.staffSchedule[dayOfWeek];

    if (dayConfig?.enabled && dayConfig.shifts?.length > 0) {
        const shiftsText = dayConfig.shifts.map(s => `${s.start}-${s.end}`).join(', ');
        document.getElementById('day-base-schedule-info').textContent = `(${shiftsText})`;
    } else {
        document.getElementById('day-base-schedule-info').textContent = '(No trabaja este día)';
    }

    // Check for existing exception
    const exception = calendarState.dayExceptions[dateStr];
    if (exception) {
        if (exception.status === 'unavailable' || exception.status === 'off') {
            document.querySelector('input[name="day-status"][value="unavailable"]').checked = true;
            document.getElementById('day-reason').value = exception.reason || '';
            document.getElementById('unavailable-reason-container').style.display = 'block';
            document.getElementById('custom-schedule-container').style.display = 'none';
        } else if (exception.status === 'custom') {
            document.querySelector('input[name="day-status"][value="custom"]').checked = true;
            document.getElementById('unavailable-reason-container').style.display = 'none';
            document.getElementById('custom-schedule-container').style.display = 'block';
            renderCustomShifts(exception.custom_schedule?.shifts || []);
        } else {
            document.querySelector('input[name="day-status"][value="available"]').checked = true;
            document.getElementById('unavailable-reason-container').style.display = 'none';
            document.getElementById('custom-schedule-container').style.display = 'none';
        }
    } else {
        document.querySelector('input[name="day-status"][value="available"]').checked = true;
        document.getElementById('day-reason').value = '';
        document.getElementById('unavailable-reason-container').style.display = 'none';
        document.getElementById('custom-schedule-container').style.display = 'none';
        renderCustomShifts([{ start: '10:00', end: '14:00' }]);
    }

    document.getElementById('day-detail-modal').style.display = 'flex';
}

function closeDayDetailModal() {
    document.getElementById('day-detail-modal').style.display = 'none';
}

function renderCustomShifts(shifts) {
    const container = document.getElementById('custom-shifts-container');
    if (shifts.length === 0) shifts = [{ start: '10:00', end: '14:00' }];

    container.innerHTML = shifts.map((shift, index) => `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <input type="time" value="${shift.start}" class="custom-shift-start"
                style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
            <span style="color: #94a3b8;">-</span>
            <input type="time" value="${shift.end}" class="custom-shift-end"
                style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
            ${index > 0 ? `
                <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm"
                    style="padding: 6px 8px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
}

function addCustomShift() {
    const container = document.getElementById('custom-shifts-container');
    const newShift = document.createElement('div');
    newShift.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    newShift.innerHTML = `
        <input type="time" value="14:00" class="custom-shift-start"
            style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <span style="color: #94a3b8;">-</span>
        <input type="time" value="18:00" class="custom-shift-end"
            style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm"
            style="padding: 6px 8px; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(newShift);
}

async function saveDayAvailability(event) {
    event.preventDefault();

    const dateStr = document.getElementById('day-detail-date-value').value;
    const status = document.querySelector('input[name="day-status"]:checked').value;

    const exceptionData = {
        staff_id: calendarState.staffId,
        date: dateStr,
        status: status,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'unavailable') {
        exceptionData.reason = document.getElementById('day-reason').value.trim() || null;
    } else if (status === 'custom') {
        const shifts = [];
        document.querySelectorAll('#custom-shifts-container .custom-shift-start').forEach((startInput, index) => {
            const endInput = document.querySelectorAll('#custom-shifts-container .custom-shift-end')[index];
            if (startInput?.value && endInput?.value) {
                shifts.push({ start: startInput.value, end: endInput.value });
            }
        });
        exceptionData.custom_schedule = { shifts };
    }

    try {
        const existingException = calendarState.dayExceptions[dateStr];

        if (status === 'available' && existingException) {
            // Remove exception to use base schedule
            await db.collection('spa_staff_availability').doc(existingException.id).delete();
            delete calendarState.dayExceptions[dateStr];
            console.log('[PERSONAL] Excepción eliminada para', dateStr);
        } else if (status !== 'available') {
            if (existingException) {
                await db.collection('spa_staff_availability').doc(existingException.id).update(exceptionData);
            } else {
                exceptionData.created_at = firebase.firestore.FieldValue.serverTimestamp();
                const docRef = await db.collection('spa_staff_availability').add(exceptionData);
                calendarState.dayExceptions[dateStr] = { id: docRef.id, ...exceptionData };
            }
            console.log('[PERSONAL] Excepción guardada para', dateStr);
        }

        closeDayDetailModal();
        renderCalendar();

    } catch (err) {
        console.error('[PERSONAL] Error guardando disponibilidad:', err);
        alert('Error al guardar: ' + err.message);
    }
}

// ============================================================================
// EXPOSICIÓN GLOBAL
// ============================================================================

// Hacer funciones disponibles globalmente para onclick handlers
window.openStaffModal = openStaffModal;
window.closeStaffModal = closeStaffModal;
window.editStaff = editStaff;
window.saveStaff = saveStaff;
window.addShift = addShift;
window.addSeasonalPeriod = addSeasonalPeriod;
window.openCalendarModal = openCalendarModal;
window.closeCalendarModal = closeCalendarModal;
window.changeMonth = changeMonth;
window.openDayDetail = openDayDetail;
window.closeDayDetailModal = closeDayDetailModal;
window.addCustomShift = addCustomShift;
window.saveDayAvailability = saveDayAvailability;
window.loadStaffList = loadStaffList;
