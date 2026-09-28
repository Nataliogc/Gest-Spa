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

// Estado del calendario individual
let calendarState = {
    staffId: null,
    staffName: '',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    staffSchedule: null,
    seasonalSchedules: [],
    dayExceptions: {}
};

// Estado del cuadrante semanal y vistas
let currentRosterDate = new Date();
let rosterExceptions = {};
let currentView = 'roster'; // 'roster' | 'cards'

// Helper de fechas
function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(d, days) {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res;
}

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

    // Cargar cuadrante semanal por defecto
    await loadWeeklyRoster();

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

    container.innerHTML = AVAILABLE_SKILLS.map(skill => {
        const prot = window.getServiceProtocol ? window.getServiceProtocol(skill.label) : { color: '#6366f1' };
        return `
            <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; 
                background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer;
                transition: all 0.2s; font-size: 0.85rem;">
                <input type="checkbox" name="skills" value="${skill.code}" 
                    style="width: 16px; height: 16px; accent-color: ${prot.color};">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${prot.color};"></span>
                <span>${skill.label}</span>
            </label>
        `;
    }).join('');
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
                    
                    ${skills.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                            ${skills.map(s => {
        const skill = AVAILABLE_SKILLS.find(as => as.code === s.toLowerCase());
        const label = skill ? skill.label : s;
        const prot = window.getServiceProtocol ? window.getServiceProtocol(label) : { color: '#7c3aed' };
        return `
                                    <span style="background: ${prot.color}20; color: ${prot.color}; padding: 3px 10px; 
                                        border-radius: 15px; font-size: 0.75rem; font-weight: 700; border: 1px solid ${prot.color}40; display: inline-flex; align-items: center; gap: 5px;">
                                        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${prot.color};"></span>
                                        ${label}
                                    </span>
                                `;
    }).join('')}
                        </div>
                    ` : ''}
                    
                    ${scheduleInfo ? `
                        <div style="font-size: 0.8rem; color: #64748b;">
                            <i class="fas fa-clock" style="margin-right: 5px;"></i>${scheduleInfo}
                        </div>
                    ` : ''}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px; min-width: 140px;">
                    <button onclick="toggleStaffStatus('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 6px 10px; font-size: 0.78rem; font-weight: 600; ${isActive ? 'color: #991b1b; border-color: #fca5a5; background: #fff1f2;' : 'color: #065f46; border-color: #a7f3d0; background: #f0fdf4;'}">
                        ${isActive ? '<i class="fas fa-user-slash"></i> Poner de Baja' : '<i class="fas fa-user-check"></i> Reactivar'}
                    </button>
                    <button onclick="openRangeAbsenceModal('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 6px 10px; font-size: 0.78rem; font-weight: 600; color: #e11d48; border-color: #fca5a5;">
                        <i class="fas fa-umbrella-beach"></i> Ausencia / Vac.
                    </button>
                    <button onclick="openQuickScheduleModal('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 6px 10px; font-size: 0.78rem; font-weight: 600; color: #4f46e5; border-color: #c7d2fe;">
                        <i class="fas fa-bolt"></i> Asignar Turno
                    </button>
                    <button onclick="openCalendarModal('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 6px 10px; font-size: 0.78rem; border-color: #cbd5e1; color: #475569;">
                        <i class="fas fa-calendar-alt"></i> Ver Mes
                    </button>
                    <button onclick="editStaff('${staff.id}')" class="btn btn-outline btn-sm" 
                        style="padding: 6px 10px; font-size: 0.78rem; border-color: #cbd5e1; color: #475569;">
                        <i class="fas fa-edit"></i> Editar Ficha
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

async function openDayDetail(dateStr, staffId = null) {
    if (staffId && staffId !== calendarState.staffId) {
        const staff = allStaffList.find(s => s.id === staffId);
        if (staff) {
            calendarState.staffId = staff.id;
            calendarState.staffName = staff.nombre || staff.name || 'Terapeuta';
            calendarState.staffSchedule = staff.default_schedule || {};
            calendarState.seasonalSchedules = staff.seasonal_schedules || [];
            await loadStaffExceptions(staff.id);
        }
    }

    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = date.toLocaleDateString('es-ES', options);

    const titleEl = document.getElementById('day-detail-date');
    if (titleEl) {
        titleEl.textContent = `${calendarState.staffName ? calendarState.staffName + ' - ' : ''}${formattedDate}`;
    }
    document.getElementById('day-detail-date-value').value = dateStr;

    // Get day of week for base schedule info
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
    const dayConfig = (calendarState.staffSchedule || {})[dayOfWeek];

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
        if (document.getElementById('calendar-modal') && document.getElementById('calendar-modal').style.display !== 'none') {
            renderCalendar();
        }
        if (currentView === 'roster') {
            await loadWeeklyRoster();
        }

    } catch (err) {
        console.error('[PERSONAL] Error guardando disponibilidad:', err);
        alert('Error al guardar: ' + err.message);
    }
}

// ============================================================================
// GESTIÓN DEL CUADRANTE SEMANAL (ROSTER)
// ============================================================================

function switchPersonalView(viewName) {
    currentView = viewName;
    const rosterContainer = document.getElementById('roster-view-container');
    const cardsContainer = document.getElementById('cards-view-container');
    const rosterBtn = document.getElementById('tab-btn-roster');
    const cardsBtn = document.getElementById('tab-btn-cards');

    if (viewName === 'roster') {
        if (rosterContainer) rosterContainer.style.display = 'block';
        if (cardsContainer) cardsContainer.style.display = 'none';
        if (rosterBtn) rosterBtn.classList.add('active');
        if (cardsBtn) cardsBtn.classList.remove('active');
        loadWeeklyRoster();
    } else {
        if (rosterContainer) rosterContainer.style.display = 'none';
        if (cardsContainer) cardsContainer.style.display = 'block';
        if (rosterBtn) rosterBtn.classList.remove('active');
        if (cardsBtn) cardsBtn.classList.add('active');
        renderStaffList();
    }
}

function navigateRosterWeek(direction) {
    if (direction === 0) {
        currentRosterDate = new Date();
    } else {
        currentRosterDate = addDays(currentRosterDate, direction * 7);
    }
    loadWeeklyRoster();
}

async function loadWeeklyRoster() {
    const monday = getMonday(currentRosterDate);
    const sunday = addDays(monday, 6);

    const mondayStr = formatDate(monday);
    const sundayStr = formatDate(sunday);

    const options = { day: 'numeric', month: 'short' };
    const mStr = monday.toLocaleDateString('es-ES', options);
    const sStr = sunday.toLocaleDateString('es-ES', { ...options, year: 'numeric' });
    const label = document.getElementById('roster-week-label');
    if (label) label.textContent = `Semana del ${mStr} al ${sStr}`;

    const tableContainer = document.getElementById('roster-table-container');
    if (tableContainer) {
        tableContainer.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                <p style="margin: 10px 0 0 0;">Cargando cuadrante semanal...</p>
            </div>
        `;
    }

    try {
        const snapshot = await db.collection('spa_staff_availability')
            .where('date', '>=', mondayStr)
            .where('date', '<=', sundayStr)
            .get();

        rosterExceptions = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!rosterExceptions[data.date]) rosterExceptions[data.date] = {};
            rosterExceptions[data.date][data.staff_id] = { id: doc.id, ...data };
        });

        renderWeeklyRoster();
    } catch (err) {
        console.error('[PERSONAL] Error cargando cuadrante semanal:', err);
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div style="padding: 30px; text-align: center; color: #ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i>
                    <p style="margin: 10px 0;">Error al cargar cuadrante semanal: ${err.message}</p>
                </div>
            `;
        }
    }
}

function renderWeeklyRoster() {
    const tableContainer = document.getElementById('roster-table-container');
    if (!tableContainer) return;

    const monday = getMonday(currentRosterDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        days.push({
            date: d,
            dateStr: formatDate(d),
            dayName: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
            dayKey: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getDay()],
            isToday: formatDate(new Date()) === formatDate(d)
        });
    }

    const roomFilter = document.getElementById('roster-room-filter')?.value || 'all';
    let filteredStaff = allStaffList;
    if (roomFilter !== 'all') {
        filteredStaff = allStaffList.filter(s => {
            const rooms = (s.assigned_rooms || s.salas || []).map(r => r.toLowerCase());
            return rooms.includes(roomFilter.toLowerCase());
        });
    }

    filteredStaff.sort((a, b) => {
        const actA = (a.activo === true || a.status === 'active') ? 0 : 1;
        const actB = (b.activo === true || b.status === 'active') ? 0 : 1;
        if (actA !== actB) return actA - actB;
        const nameA = a.nombre || a.name || '';
        const nameB = b.nombre || b.name || '';
        return nameA.localeCompare(nameB);
    });

    if (filteredStaff.length === 0) {
        tableContainer.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #94a3b8;">
                <p style="margin: 0; font-size: 1rem;">No hay personal asignado a esta sala</p>
            </div>
        `;
        return;
    }

    let html = `
        <table class="roster-table">
            <thead>
                <tr>
                    <th style="min-width: 220px;">Terapeuta / Personal</th>
                    ${days.map(d => `
                        <th style="${d.isToday ? 'background: #eff6ff; color: #1d4ed8; border-bottom: 2px solid #3b82f6;' : ''}">
                            <div style="font-size: 0.8rem; text-transform: uppercase;">${d.dayName}</div>
                            <div style="font-size: 1.05rem; font-weight: 700;">${d.date.getDate()} ${d.date.toLocaleDateString('es-ES', { month: 'short' })}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    filteredStaff.forEach(staff => {
        const isActive = staff.activo === true || staff.status === 'active';
        const name = staff.nombre || staff.name || 'Sin nombre';
        const rooms = staff.assigned_rooms || staff.salas || [];
        const roomTags = rooms.slice(0, 3).map(r => {
            const room = AVAILABLE_ROOMS.find(ar => ar.code === r.toLowerCase());
            return room ? room.label : r;
        }).join(', ');

        html += `
            <tr style="${!isActive ? 'opacity: 0.65; background: #fafafa;' : ''}">
                <td>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, var(--accent) 0%, #c9963a 100%); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0;">
                                ${getInitials(name)}
                            </div>
                            <div>
                                <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem; line-height: 1.2;">${name}</div>
                                <div style="font-size: 0.72rem; color: #64748b;">${roomTags || 'Sin sala'}</div>
                            </div>
                        </div>
                        <button onclick="toggleStaffStatus('${staff.id}')" class="btn-status-toggle ${isActive ? 'status-active' : 'status-inactive'}" title="${isActive ? 'Click para poner de baja médica' : 'Click para reincorporar/activar'}">
                            ${isActive ? '🟢 Activo' : '🔴 Baja'}
                        </button>
                    </div>
                </td>
        `;

        days.forEach(d => {
            const cellInfo = getRosterDayInfo(staff, d.dateStr, d.dayKey);
            html += `
                <td>
                    <div class="roster-day-cell" onclick="openDayDetail('${d.dateStr}', '${staff.id}')" title="Click para ajustar horario de este día" style="background: ${cellInfo.bgColor}; border: 1.5px solid ${cellInfo.borderColor};">
                        ${cellInfo.badgesHtml}
                    </div>
                </td>
            `;
        });

        html += `</tr>`;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;
}

function getRosterDayInfo(staff, dateStr, dayKey) {
    const isStaffActive = staff.activo === true || staff.status === 'active';
    if (!isStaffActive) {
        return {
            bgColor: '#f8fafc',
            borderColor: '#e2e8f0',
            badgesHtml: `<span class="roster-absence-badge" style="background: #fee2e2; color: #991b1b;"><i class="fas fa-user-slash"></i> Baja</span>`
        };
    }

    const exception = rosterExceptions[dateStr] ? rosterExceptions[dateStr][staff.id] : null;
    if (exception) {
        if (exception.status === 'unavailable' || exception.status === 'off' || exception.status === 'vacation') {
            const reason = exception.reason || 'No disponible';
            const icon = reason.toLowerCase().includes('vacacion') ? 'fa-umbrella-beach' : 'fa-ban';
            return {
                bgColor: '#fef2f2',
                borderColor: '#fca5a5',
                badgesHtml: `<span class="roster-absence-badge"><i class="fas ${icon}"></i> ${reason}</span>`
            };
        }
        if (exception.status === 'custom') {
            const shifts = exception.custom_schedule?.shifts || [];
            const shiftsBadges = shifts.map(s => `<span class="roster-custom-shift-badge">⚡ ${s.start} - ${s.end}</span>`).join('');
            return {
                bgColor: '#fff7ed',
                borderColor: '#fed7aa',
                badgesHtml: shiftsBadges || `<span class="roster-off-badge">Sin turnos</span>`
            };
        }
    }

    let activeSchedule = staff.default_schedule || {};
    if (staff.seasonal_schedules && Array.isArray(staff.seasonal_schedules)) {
        const activePeriod = staff.seasonal_schedules.find(p => dateStr >= p.start && dateStr <= p.end);
        if (activePeriod) {
            activeSchedule = activePeriod.schedule || {};
        }
    }

    const dayConfig = activeSchedule[dayKey];
    if (dayConfig?.enabled && dayConfig.shifts?.length > 0) {
        const shiftsBadges = dayConfig.shifts.map(s => `<span class="roster-shift-badge">${s.start} - ${s.end}</span>`).join('');
        return {
            bgColor: '#f0fdf4',
            borderColor: '#bbf7d0',
            badgesHtml: shiftsBadges
        };
    }

    return {
        bgColor: '#f8fafc',
        borderColor: '#e2e8f0',
        badgesHtml: `<span class="roster-off-badge">Descanso</span>`
    };
}

// ============================================================================
// ACCIÓN RÁPIDA: TOGGLE ACTIVO / BAJA
// ============================================================================

async function toggleStaffStatus(staffId) {
    const staff = allStaffList.find(s => s.id === staffId);
    if (!staff) return;

    const currentActive = staff.activo === true || staff.status === 'active';
    const newStatus = !currentActive;
    const name = staff.nombre || staff.name || 'Terapeuta';

    const confirmMsg = newStatus 
        ? `¿Reactivar a ${name}?\nVolverá a estar disponible para citas en sus horarios habituales.`
        : `¿Poner a ${name} de BAJA médica/temporal?\nNo estará disponible para asignar citas en ninguna sala hasta su reincorporación.`;

    if (!confirm(confirmMsg)) return;

    try {
        await db.collection('spa_staff').doc(staffId).update({
            activo: newStatus,
            status: newStatus ? 'active' : 'inactive',
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        staff.activo = newStatus;
        staff.status = newStatus ? 'active' : 'inactive';

        if (currentView === 'roster') {
            await loadWeeklyRoster();
        } else {
            renderStaffList();
        }

        // If newly set to inactive (Baja), check pending bookings for the next 30 days
        if (!newStatus) {
            const today = formatDate(new Date());
            const futureDate = formatDate(addDays(new Date(), 30));
            const bookings = await getBookingsForStaffInRange(staffId, today, futureDate);

            if (bookings.length > 0) {
                setTimeout(() => {
                    const openAssistant = confirm(`⚠️ ¡Atención! ${name} tiene ${bookings.length} cita(s) programada(s) a partir de hoy.\n\n¿Deseas abrir el asistente de reasignación para pasarlas a otra compañera o gestionarlas ahora?`);
                    if (openAssistant) {
                        openReassignBookingsModal(staffId, bookings, 'Baja médica');
                    }
                }, 300);
            }
        }
    } catch (err) {
        console.error('[PERSONAL] Error cambiando estado:', err);
        alert('Error al actualizar estado: ' + err.message);
    }
}

// ============================================================================
// MODAL: REGISTRAR AUSENCIA / VACACIONES POR RANGO
// ============================================================================

function openRangeAbsenceModal(staffId = null) {
    const modal = document.getElementById('range-absence-modal');
    if (!modal) return;

    const select = document.getElementById('absence-staff-id');
    select.innerHTML = allStaffList.map(s => `
        <option value="${s.id}" ${s.id === staffId ? 'selected' : ''}>
            ${s.nombre || s.name} (${(s.activo === true || s.status === 'active') ? 'Activo' : 'Baja'})
        </option>
    `).join('');

    const monday = getMonday(currentRosterDate);
    const sunday = addDays(monday, 6);
    document.getElementById('absence-start-date').value = formatDate(monday);
    document.getElementById('absence-end-date').value = formatDate(sunday);
    document.getElementById('absence-notes').value = '';
    document.getElementById('absence-type').value = 'Vacaciones';
    document.getElementById('absence-set-inactive').checked = false;

    modal.style.display = 'flex';
}

function closeRangeAbsenceModal() {
    const modal = document.getElementById('range-absence-modal');
    if (modal) modal.style.display = 'none';
}

function handleAbsenceTypeChange() {
    const type = document.getElementById('absence-type').value;
    const inactiveCheckbox = document.getElementById('absence-set-inactive');
    if (type === 'Baja médica') {
        inactiveCheckbox.checked = true;
    } else {
        inactiveCheckbox.checked = false;
    }
}

async function saveRangeAbsence(event) {
    event.preventDefault();

    const staffId = document.getElementById('absence-staff-id').value;
    const type = document.getElementById('absence-type').value;
    const startDateStr = document.getElementById('absence-start-date').value;
    const endDateStr = document.getElementById('absence-end-date').value;
    const notes = document.getElementById('absence-notes').value.trim();
    const setInactive = document.getElementById('absence-set-inactive').checked;

    if (!startDateStr || !endDateStr) {
        alert('Por favor selecciona las fechas de inicio y fin');
        return;
    }

    if (startDateStr > endDateStr) {
        alert('La fecha de fin no puede ser anterior a la de inicio');
        return;
    }

    const staff = allStaffList.find(s => s.id === staffId);
    const staffName = staff ? (staff.nombre || staff.name) : 'Terapeuta';
    const reason = notes ? `${type}: ${notes}` : type;

    try {
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        const batch = db.batch();

        let count = 0;
        let curr = new Date(start);

        const existingSnap = await db.collection('spa_staff_availability')
            .where('staff_id', '==', staffId)
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr)
            .get();

        const existingMap = {};
        existingSnap.forEach(d => {
            existingMap[d.data().date] = d.id;
        });

        while (curr <= end) {
            const dateStr = formatDate(curr);
            const docId = existingMap[dateStr];

            const docData = {
                staff_id: staffId,
                date: dateStr,
                status: 'unavailable',
                reason: reason,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (docId) {
                batch.update(db.collection('spa_staff_availability').doc(docId), docData);
            } else {
                docData.created_at = firebase.firestore.FieldValue.serverTimestamp();
                const newDocRef = db.collection('spa_staff_availability').doc();
                batch.set(newDocRef, docData);
            }

            count++;
            curr.setDate(curr.getDate() + 1);
        }

        if (setInactive) {
            batch.update(db.collection('spa_staff').doc(staffId), {
                activo: false,
                status: 'inactive',
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (staff) {
                staff.activo = false;
                staff.status = 'inactive';
            }
        }

        await batch.commit();
        alert(`✓ Se han registrado ${count} días de ausencia (${reason}) para ${staffName}.`);

        closeRangeAbsenceModal();
        if (currentView === 'roster') {
            await loadWeeklyRoster();
        } else {
            renderStaffList();
        }

        // Check if staff has pending bookings during this absence period
        const bookings = await getBookingsForStaffInRange(staffId, startDateStr, endDateStr);
        if (bookings.length > 0) {
            setTimeout(() => {
                const openAssistant = confirm(`⚠️ ¡Atención! ${staffName} tiene ${bookings.length} cita(s) programada(s) durante este periodo de ausencia (${startDateStr} al ${endDateStr}).\n\n¿Deseas abrir el asistente de reasignación para pasarlas a otra compañera o gestionarlas ahora?`);
                if (openAssistant) {
                    openReassignBookingsModal(staffId, bookings, reason);
                }
            }, 300);
        }
    } catch (err) {
        console.error('[PERSONAL] Error guardando ausencia por rango:', err);
        alert('Error al guardar ausencia: ' + err.message);
    }
}

// ============================================================================
// MODAL: ASIGNAR TURNO RÁPIDO POR RANGO / SEMANA
// ============================================================================

function openQuickScheduleModal(staffId = null) {
    const modal = document.getElementById('quick-schedule-modal');
    if (!modal) return;

    const select = document.getElementById('quick-sched-staff-id');
    select.innerHTML = allStaffList.map(s => `
        <option value="${s.id}" ${s.id === staffId ? 'selected' : ''}>
            ${s.nombre || s.name}
        </option>
    `).join('');

    const monday = getMonday(currentRosterDate);
    const sunday = addDays(monday, 6);
    document.getElementById('quick-sched-start-date').value = formatDate(monday);
    document.getElementById('quick-sched-end-date').value = formatDate(sunday);

    setQuickShifts([
        { start: '10:00', end: '14:00' },
        { start: '16:30', end: '20:30' }
    ]);

    modal.style.display = 'flex';
}

function closeQuickScheduleModal() {
    const modal = document.getElementById('quick-schedule-modal');
    if (modal) modal.style.display = 'none';
}

function setQuickShifts(shifts) {
    const container = document.getElementById('quick-sched-shifts-container');
    if (!container) return;

    container.innerHTML = shifts.map((sh, idx) => `
        <div style="display: flex; gap: 8px; align-items: center;">
            <span style="font-size: 0.75rem; color: #64748b; font-weight: 600; width: 60px;">Tramo ${idx + 1}:</span>
            <input type="time" value="${sh.start}" class="quick-shift-start" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
            <span style="color: #94a3b8;">a</span>
            <input type="time" value="${sh.end}" class="quick-shift-end" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
            ${idx > 0 ? `
                <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm" style="color: #ef4444; border-color: #ef4444; padding: 4px 8px;">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
}

function addQuickShiftRow() {
    const container = document.getElementById('quick-sched-shifts-container');
    if (!container) return;

    const count = container.children.length;
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    row.innerHTML = `
        <span style="font-size: 0.75rem; color: #64748b; font-weight: 600; width: 60px;">Tramo ${count + 1}:</span>
        <input type="time" value="16:30" class="quick-shift-start" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <span style="color: #94a3b8;">a</span>
        <input type="time" value="20:30" class="quick-shift-end" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;">
        <button type="button" onclick="this.parentElement.remove()" class="btn btn-outline btn-sm" style="color: #ef4444; border-color: #ef4444; padding: 4px 8px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(row);
}

function applyQuickShiftPreset(preset) {
    if (preset === 'partido-estetica') {
        setQuickShifts([
            { start: '10:00', end: '14:00' },
            { start: '16:30', end: '20:30' }
        ]);
        setQuickDays(['tuesday', 'wednesday', 'thursday', 'friday']);
    } else if (preset === 'partido-sabado') {
        setQuickShifts([
            { start: '10:00', end: '14:00' },
            { start: '16:00', end: '20:00' }
        ]);
        setQuickDays(['saturday']);
    } else if (preset === 'manana') {
        setQuickShifts([{ start: '10:00', end: '14:00' }]);
    } else if (preset === 'tarde') {
        setQuickShifts([{ start: '16:30', end: '20:30' }]);
    } else if (preset === 'continuo') {
        setQuickShifts([{ start: '10:00', end: '18:00' }]);
    }
}

function setQuickDays(activeDays) {
    document.querySelectorAll('input[name="quick-days"]').forEach(cb => {
        cb.checked = activeDays.includes(cb.value);
    });
}

async function saveQuickSchedule(event) {
    event.preventDefault();

    const staffId = document.getElementById('quick-sched-staff-id').value;
    const startDateStr = document.getElementById('quick-sched-start-date').value;
    const endDateStr = document.getElementById('quick-sched-end-date').value;

    const selectedDays = [];
    document.querySelectorAll('input[name="quick-days"]:checked').forEach(cb => {
        selectedDays.push(cb.value);
    });

    if (selectedDays.length === 0) {
        alert('Selecciona al menos un día de la semana');
        return;
    }

    const shifts = [];
    const container = document.getElementById('quick-sched-shifts-container');
    const starts = container.querySelectorAll('.quick-shift-start');
    const ends = container.querySelectorAll('.quick-shift-end');

    starts.forEach((s, idx) => {
        if (s.value && ends[idx]?.value) {
            shifts.push({ start: s.value, end: ends[idx].value });
        }
    });

    if (shifts.length === 0) {
        alert('Define al menos un tramo horario');
        return;
    }

    const staff = allStaffList.find(s => s.id === staffId);
    const staffName = staff ? (staff.nombre || staff.name) : 'Terapeuta';

    try {
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        const batch = db.batch();
        let appliedCount = 0;

        const existingSnap = await db.collection('spa_staff_availability')
            .where('staff_id', '==', staffId)
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr)
            .get();

        const existingMap = {};
        existingSnap.forEach(d => {
            existingMap[d.data().date] = d.id;
        });

        let curr = new Date(start);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        while (curr <= end) {
            const dayKey = dayNames[curr.getDay()];
            if (selectedDays.includes(dayKey)) {
                const dateStr = formatDate(curr);
                const docId = existingMap[dateStr];

                const docData = {
                    staff_id: staffId,
                    date: dateStr,
                    status: 'custom',
                    custom_schedule: { shifts: shifts },
                    updated_at: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (docId) {
                    batch.update(db.collection('spa_staff_availability').doc(docId), docData);
                } else {
                    docData.created_at = firebase.firestore.FieldValue.serverTimestamp();
                    const newDocRef = db.collection('spa_staff_availability').doc();
                    batch.set(newDocRef, docData);
                }
                appliedCount++;
            }
            curr.setDate(curr.getDate() + 1);
        }

        await batch.commit();
        const shiftsText = shifts.map(s => `${s.start}-${s.end}`).join(' y ');
        alert(`✓ Horario (${shiftsText}) aplicado con éxito a ${appliedCount} días para ${staffName}.`);

        closeQuickScheduleModal();
        if (currentView === 'roster') {
            await loadWeeklyRoster();
        } else {
            renderStaffList();
        }
    } catch (err) {
        console.error('[PERSONAL] Error guardando turnos rápidos:', err);
        alert('Error al guardar turnos: ' + err.message);
    }
}

// ============================================================================
// ASISTENTE DE REASIGNACIÓN DE CITAS (POR BAJA / AUSENCIA)
// ============================================================================

let currentReassignStaffId = null;
let currentReassignBookings = [];

async function getBookingsForStaffInRange(staffId, startDate, endDate) {
    const collections = [
        'reservas_cabina1', 'reservas_cabina2', 'reservas_cabina3',
        'reservas_suite', 'reservas_vip', 'reservas_panacea',
        'reservas_peluqueria', 'reservas_spa', 'reservas_cabinas',
        'reservas_gimnasio', 'reservas_complementos'
    ];

    const staff = allStaffList.find(s => s.id === staffId);
    const staffName = staff ? (staff.nombre || staff.name || '').toLowerCase().trim() : '';
    const staffAlias = staff ? (staff.alias || '').toLowerCase().trim() : '';

    const allBookings = [];
    const promises = collections.map(async col => {
        try {
            const snap = await db.collection(col)
                .where('fecha', '>=', startDate)
                .where('fecha', '<=', endDate)
                .get();

            snap.forEach(doc => {
                const d = doc.data();
                if (d.status === 'anulada') return;

                const bStaffId1 = d.staff_id || d.terapeuta_id;
                const bStaffName1 = (d.staff_name || d.terapeuta || '').toLowerCase().trim();
                const bStaffId2 = d.staff_id2 || d.terapeuta_id2;
                const bStaffName2 = (d.staff_name2 || d.terapeuta2 || '').toLowerCase().trim();

                const match1 = (bStaffId1 && bStaffId1 === staffId) || (staffName && (bStaffName1 === staffName || (staffAlias && bStaffName1 === staffAlias)));
                const match2 = (bStaffId2 && bStaffId2 === staffId) || (staffName && (bStaffName2 === staffName || (staffAlias && bStaffName2 === staffAlias)));

                if (match1 || match2) {
                    allBookings.push({
                        id: doc.id,
                        _collection: col,
                        ...d
                    });
                }
            });
        } catch (e) {
            console.warn(`[REASSIGN] Error consultando citas en ${col}:`, e);
        }
    });

    await Promise.all(promises);
    allBookings.sort((a, b) => {
        const dComp = (a.fecha || '').localeCompare(b.fecha || '');
        if (dComp !== 0) return dComp;
        return (a.hora || '').localeCompare(b.hora || '');
    });
    return allBookings;
}

function openReassignBookingsModal(staffId, bookings, reason = 'Baja médica') {
    currentReassignStaffId = staffId;
    currentReassignBookings = bookings || [];

    const modal = document.getElementById('reassign-bookings-modal');
    if (!modal) return;

    const staff = allStaffList.find(s => s.id === staffId);
    const staffName = staff ? (staff.nombre || staff.name) : 'Terapeuta';

    document.getElementById('reassign-modal-title').textContent = `Asistente de Reasignación — ${staffName}`;
    document.getElementById('reassign-modal-subtitle').textContent = `${staffName} está en ${reason}. Hay ${bookings.length} cita(s) asignadas que requieren atención.`;

    // Active other staff list for target select
    const otherActiveStaff = allStaffList.filter(s => s.id !== staffId && (s.activo === true || s.status === 'active'));
    const targetSelect = document.getElementById('reassign-all-target-staff');
    if (targetSelect) {
        if (otherActiveStaff.length === 0) {
            targetSelect.innerHTML = '<option value="">No hay otros terapeutas activos</option>';
        } else {
            targetSelect.innerHTML = otherActiveStaff.map(s => `
                <option value="${s.id}">
                    ${s.nombre || s.name} (${s.alias || 'Terapeuta'})
                </option>
            `).join('');
        }
    }

    renderReassignBookingsList();
    modal.style.display = 'flex';
}

function closeReassignBookingsModal() {
    const modal = document.getElementById('reassign-bookings-modal');
    if (modal) modal.style.display = 'none';
    currentReassignStaffId = null;
    currentReassignBookings = [];
}

function renderReassignBookingsList() {
    const container = document.getElementById('reassign-bookings-list');
    const summary = document.getElementById('reassign-modal-summary');
    if (!container) return;

    if (currentReassignBookings.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #16a34a;">
                <i class="fas fa-check-circle" style="font-size: 2.5rem; margin-bottom: 12px; color: #22c55e;"></i>
                <div style="font-weight: 800; font-size: 1.1rem; color: #15803d;">¡Todas las citas han sido gestionadas!</div>
                <div style="font-size: 0.85rem; color: #4b5563; margin-top: 4px;">No quedan citas pendientes sin cubrir para este periodo.</div>
            </div>
        `;
        if (summary) summary.textContent = '0 citas pendientes';
        return;
    }

    if (summary) {
        summary.textContent = `${currentReassignBookings.length} cita(s) pendiente(s) de reasignar`;
    }

    const otherActiveStaff = allStaffList.filter(s => s.id !== currentReassignStaffId && (s.activo === true || s.status === 'active'));

    container.innerHTML = currentReassignBookings.map(b => {
        const dateObj = new Date(b.fecha + 'T12:00:00');
        const dateFormatted = !isNaN(dateObj.getTime()) 
            ? dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
            : b.fecha;

        const dur = parseInt(b.duracion || 60);
        const [h, m] = (b.hora || '10:00').split(':').map(Number);
        const endMinutes = h * 60 + m + dur;
        const endHourStr = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

        const roomName = (b._collection || '').replace('reservas_', '').toUpperCase();
        const clientName = b.nombre || b.cliente || 'Cliente';
        const phone = b.telefono || b.tel || '';
        const cleanPhone = phone.replace(/\D/g, '');
        const waLink = cleanPhone ? `https://wa.me/34${cleanPhone.startsWith('34') ? cleanPhone.slice(2) : cleanPhone}` : '';

        return `
            <div id="reassign-card-${b.id}" style="background: white; border: 1.5px solid #fecaca; border-left: 5px solid #ef4444; border-radius: 12px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem;">
                                <i class="fas fa-calendar-alt"></i> ${dateFormatted}
                            </span>
                            <span style="font-weight: 800; font-size: 0.95rem; color: #1e293b;">
                                <i class="fas fa-clock" style="color: #64748b; font-size: 0.8rem;"></i> ${b.hora} — ${endHourStr} (${dur} min)
                            </span>
                            <span style="background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.72rem;">
                                <i class="fas fa-door-open"></i> ${roomName}
                            </span>
                        </div>
                        <div style="margin-top: 6px; font-size: 0.95rem; font-weight: 800; color: #0f172a;">
                            ${b.servicio || 'Servicio Spa'}
                        </div>
                    </div>

                    <!-- Client and Contacts -->
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 0.9rem; color: #1e293b;">
                            <i class="fas fa-user" style="color: #64748b; font-size: 0.75rem;"></i> ${clientName}
                        </div>
                        ${phone ? `
                            <div style="margin-top: 4px; display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                                <a href="tel:${cleanPhone}" style="color: #0284c7; font-weight: 600; font-size: 0.75rem; text-decoration: none; background: #e0f2fe; padding: 2px 7px; border-radius: 4px;">
                                    <i class="fas fa-phone-alt"></i> ${phone}
                                </a>
                                ${waLink ? `
                                    <a href="${waLink}" target="_blank" style="color: #15803d; font-weight: 600; font-size: 0.75rem; text-decoration: none; background: #dcfce7; padding: 2px 7px; border-radius: 4px;">
                                        <i class="fab fa-whatsapp"></i> WhatsApp
                                    </a>
                                ` : ''}
                            </div>
                        ` : '<span style="font-size: 0.75rem; color: #94a3b8;">Sin teléfono</span>'}
                    </div>
                </div>

                <!-- Action Controls -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 10px; margin-top: 4px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.78rem; font-weight: 700; color: #475569;">Reasignar a:</span>
                        <select id="single-target-staff-${b.id}" style="padding: 5px 8px; border-radius: 6px; border: 1.5px solid #cbd5e1; font-size: 0.8rem; font-weight: 600;">
                            ${otherActiveStaff.map(s => `<option value="${s.id}">${s.nombre || s.name}</option>`).join('')}
                        </select>
                        <button type="button" onclick="reassignSingleBooking('${b.id}', '${b._collection}')" class="btn btn-sm" style="background: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer;">
                            <i class="fas fa-check"></i> Reasignar
                        </button>
                    </div>

                    <div style="display: flex; gap: 6px;">
                        <button type="button" onclick="cancelBookingFromAssistant('${b.id}', '${b._collection}', '${clientName.replace(/'/g, "\\'")}', '${b.hora}')" class="btn btn-outline btn-sm" style="color: #dc2626; border-color: #fca5a5; font-size: 0.75rem; padding: 5px 10px;">
                            <i class="fas fa-times"></i> Anular Cita
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function reassignSingleBooking(bookingId, collection) {
    const select = document.getElementById(`single-target-staff-${bookingId}`);
    if (!select || !select.value) {
        alert('Selecciona un terapeuta de destino');
        return;
    }

    const targetStaffId = select.value;
    const targetStaff = allStaffList.find(s => s.id === targetStaffId);
    if (!targetStaff) return;
    const targetName = targetStaff.nombre || targetStaff.name || 'Terapeuta';

    try {
        await db.collection(collection).doc(bookingId).update({
            terapeuta: targetName,
            staff_name: targetName,
            terapeuta_id: targetStaffId,
            staff_id: targetStaffId,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Remove from list
        currentReassignBookings = currentReassignBookings.filter(b => b.id !== bookingId);
        renderReassignBookingsList();

        if (currentView === 'roster') {
            await loadWeeklyRoster();
        }
    } catch (err) {
        console.error('[REASSIGN] Error reasignando cita:', err);
        alert('Error al reasignar cita: ' + err.message);
    }
}

async function executeBatchReassign() {
    const targetSelect = document.getElementById('reassign-all-target-staff');
    if (!targetSelect || !targetSelect.value) {
        alert('Selecciona una compañera para reasignar todas las citas');
        return;
    }

    const targetStaffId = targetSelect.value;
    const targetStaff = allStaffList.find(s => s.id === targetStaffId);
    if (!targetStaff) return;
    const targetName = targetStaff.nombre || targetStaff.name || 'Terapeuta';

    if (currentReassignBookings.length === 0) return;

    if (!confirm(`¿Reasignar TODAS las ${currentReassignBookings.length} citas a ${targetName}?`)) return;

    try {
        const batch = db.batch();
        currentReassignBookings.forEach(b => {
            const ref = db.collection(b._collection).doc(b.id);
            batch.update(ref, {
                terapeuta: targetName,
                staff_name: targetName,
                terapeuta_id: targetStaffId,
                staff_id: targetStaffId,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        alert(`✓ Se han reasignado con éxito todas las citas a ${targetName}.`);

        currentReassignBookings = [];
        renderReassignBookingsList();

        if (currentView === 'roster') {
            await loadWeeklyRoster();
        }
    } catch (err) {
        console.error('[REASSIGN] Error en reasignación masiva:', err);
        alert('Error al reasignar citas: ' + err.message);
    }
}

async function cancelBookingFromAssistant(bookingId, collection, clientName, time) {
    if (!confirm(`¿Anular la cita de las ${time} para ${clientName}?\nLa cita quedará registrada como cancelada y se liberará la sala.`)) return;

    try {
        await db.collection(collection).doc(bookingId).update({
            status: 'anulada',
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentReassignBookings = currentReassignBookings.filter(b => b.id !== bookingId);
        renderReassignBookingsList();

        if (currentView === 'roster') {
            await loadWeeklyRoster();
        }
    } catch (err) {
        console.error('[REASSIGN] Error anulando cita:', err);
        alert('Error al anular cita: ' + err.message);
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

// Nuevas funciones del Cuadrante y Gestión Ágil
window.switchPersonalView = switchPersonalView;
window.navigateRosterWeek = navigateRosterWeek;
window.loadWeeklyRoster = loadWeeklyRoster;
window.renderWeeklyRoster = renderWeeklyRoster;
window.toggleStaffStatus = toggleStaffStatus;
window.openRangeAbsenceModal = openRangeAbsenceModal;
window.closeRangeAbsenceModal = closeRangeAbsenceModal;
window.handleAbsenceTypeChange = handleAbsenceTypeChange;
window.saveRangeAbsence = saveRangeAbsence;
window.openQuickScheduleModal = openQuickScheduleModal;
window.closeQuickScheduleModal = closeQuickScheduleModal;
window.applyQuickShiftPreset = applyQuickShiftPreset;
window.addQuickShiftRow = addQuickShiftRow;
window.saveQuickSchedule = saveQuickSchedule;

// Asistente de Reasignación
window.getBookingsForStaffInRange = getBookingsForStaffInRange;
window.openReassignBookingsModal = openReassignBookingsModal;
window.closeReassignBookingsModal = closeReassignBookingsModal;
window.renderReassignBookingsList = renderReassignBookingsList;
window.reassignSingleBooking = reassignSingleBooking;
window.executeBatchReassign = executeBatchReassign;
window.cancelBookingFromAssistant = cancelBookingFromAssistant;
