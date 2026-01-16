// config.js - Lógica de Configuración del Sistema

const spaConfigState = {
    spaConfig: {
        capacity: 20,
        cleaningTime: 30,
        closedDates: [],
        whatsappTemplate: "Hola {{nombre}}, le confirmamos su reserva...",
        wc_url: "https://cumbriabienestar.es",
        wc_key: "",
        wc_secret: "",
        wc_push_key: ""
    },
    masterItems: [],
    spaces: [],
    complementos: [],
    catalogServices: [], // Para contar usos
    schedules: null
};

const DAYS_MAP = {
    'monday': 'Lunes',
    'tuesday': 'Martes',
    'wednesday': 'Miércoles',
    'thursday': 'Jueves',
    'friday': 'Viernes',
    'saturday': 'Sábado',
    'sunday': 'Domingo'
};

const DEFAULT_SCHEDULE = {
    monday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    tuesday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    wednesday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    thursday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    friday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    saturday: ["10:00", "11:00", "12:15", "13:30", "15:45", "16:45", "18:00", "19:00", "20:30"],
    sunday: ["10:00", "11:00", "12:15", "13:30"]
};


// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation(); // From app-core.js
    initConfig();
});

function initConfig() {
    cargarSpaConfig();
    cargarCatalogServices(); // Cargar catálogo para conteos
    cargarMasterItems();
    cargarSpaces();
    cargarComplementos();
    injectMultiSelectStyles();
}

function injectMultiSelectStyles() {
    if (document.getElementById('ms-styles')) return;
    const style = document.createElement('style');
    style.id = 'ms-styles';
    style.innerHTML = `
        .ms-container { position: relative; width: 100%; min-width: 140px; }
        .ms-trigger {
            width: 100%;
            padding: 6px 10px;
            background: #fff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            color: #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s;
        }
        .ms-trigger:hover { border-color: #94a3b8; background: #f8fafc; }
        .ms-options {
            position: absolute;
            top: 100%;
            left: 0;
            width: 100%; 
            min-width: 220px;
            z-index: 99999;
            background: #fff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            padding: 6px;
            display: none;
            max-height: 250px;
            overflow-y: auto;
            margin-top: 4px;
        }
        .ms-options.show { display: block; animation: fadeIn 0.15s ease-out; }
        .ms-option {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 0.85rem;
            border-radius: 4px;
            color: #475569;
            transition: background 0.1s;
        }
        .ms-option:hover { background: #f1f5f9; color: #0f172a; }
        .ms-option input { margin-right: 10px; accent-color: var(--accent, #d4af37);  }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
}

// --- TABS ---
let connectionsAuth = false;

function switchConfigTab(tabId, btn) {
    if (tabId === 'tab-conexiones' && !connectionsAuth) {
        const u = prompt("Usuario de Acceso:");
        if (u !== 'Admin') {
            alert("Acceso denegado");
            return;
        }
        const p = prompt("Clave de Acceso:");
        if (p !== 'ZENITH2026') {
            alert("Acceso denegado");
            return;
        }
        connectionsAuth = true;
    }

    document.querySelectorAll(".config-tab-content").forEach(tab => tab.style.display = "none");
    document.getElementById(tabId).style.display = "block";
    document.querySelectorAll(".config-tab").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- GLOBAL SETTINGS ---
async function cargarSpaConfig() {
    try {
        const doc = await db.collection("spa_config").doc("settings").get();
        if (doc.exists) {
            spaConfigState.spaConfig = { ...spaConfigState.spaConfig, ...doc.data() };

            // Ensure schedules exist
            if (!spaConfigState.spaConfig.schedules) {
                spaConfigState.spaConfig.schedules = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
            }

            updateSettingsUI();
            renderClosedDates();
            renderScheduleEditor();
        }
    } catch (err) {
        console.error("Error cargando spa_config:", err);
    }
}

function updateSettingsUI() {
    const ids = {
        "cfg-spa-capacity": spaConfigState.spaConfig.capacity,
        "cfg-spa-cleaning": spaConfigState.spaConfig.cleaningTime,
        "cfg-whatsapp-template": spaConfigState.spaConfig.whatsappTemplate,
        "cfg-wc-url": spaConfigState.spaConfig.wc_url,
        "cfg-wc-key": spaConfigState.spaConfig.wc_key,
        "cfg-wc-secret": spaConfigState.spaConfig.wc_secret,
        "cfg-wc-push-key": spaConfigState.spaConfig.wc_push_key,
        // Dynamic Pricing for Hotel (no incluido)
        "cfg-price-weekday-hotel": spaConfigState.spaConfig.hotelPriceWeekday || 12,
        "cfg-price-weekend-hotel": spaConfigState.spaConfig.hotelPriceWeekend || 18,
        // Dynamic Pricing for Particular
        "cfg-price-weekday-particular": spaConfigState.spaConfig.particularPriceWeekday || 25,
        "cfg-price-weekend-particular": spaConfigState.spaConfig.particularPriceWeekend || 25
    };
    for (const [id, val] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    }
}

async function saveSpaSettings() {
    const capacity = parseInt(document.getElementById("cfg-spa-capacity").value) || 20;
    const cleaning = parseInt(document.getElementById("cfg-spa-cleaning").value) || 0;
    const template = document.getElementById("cfg-whatsapp-template").value;

    // WooCommerce Config
    const wcUrl = document.getElementById("cfg-wc-url").value.trim();
    const wcKey = document.getElementById("cfg-wc-key").value.trim();
    const wcSecret = document.getElementById("cfg-wc-secret").value.trim();
    const wcPushKey = document.getElementById("cfg-wc-push-key").value.trim();

    spaConfigState.spaConfig.capacity = capacity;
    spaConfigState.spaConfig.cleaningTime = cleaning;
    spaConfigState.spaConfig.whatsappTemplate = template;
    spaConfigState.spaConfig.wc_url = wcUrl;
    spaConfigState.spaConfig.wc_key = wcKey;
    spaConfigState.spaConfig.wc_secret = wcSecret;
    spaConfigState.spaConfig.wc_key = wcKey;
    spaConfigState.spaConfig.wc_secret = wcSecret;
    spaConfigState.spaConfig.wc_push_key = wcPushKey;

    // Dynamic Pricing for Hotel (no incluido)
    const priceWeekdayHotel = parseFloat(document.getElementById("cfg-price-weekday-hotel")?.value) || 12;
    const priceWeekendHotel = parseFloat(document.getElementById("cfg-price-weekend-hotel")?.value) || 18;
    spaConfigState.spaConfig.hotelPriceWeekday = priceWeekdayHotel;
    spaConfigState.spaConfig.hotelPriceWeekend = priceWeekendHotel;

    // Dynamic Pricing for Particular
    const priceWeekdayParticular = parseFloat(document.getElementById("cfg-price-weekday-particular")?.value) || 25;
    const priceWeekendParticular = parseFloat(document.getElementById("cfg-price-weekend-particular")?.value) || 25;
    spaConfigState.spaConfig.particularPriceWeekday = priceWeekdayParticular;
    spaConfigState.spaConfig.particularPriceWeekend = priceWeekendParticular;

    // Save Schedules
    const newSchedules = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const input = document.getElementById(`sched-${day}`);
        if (input) {
            const val = input.value.trim();
            console.log(`[DEBUG] Found input for ${day}:`, val);
            // Parse comma separated
            const slots = val.split(',').map(s => s.trim()).filter(s => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(s));
            // Sort times
            slots.sort();
            newSchedules[day] = slots;
        } else {
            console.warn(`[DEBUG] Input not found for ${day}`);
            newSchedules[day] = spaConfigState.spaConfig.schedules ? (spaConfigState.spaConfig.schedules[day] || []) : [];
        }
    });

    console.log("[DEBUG] New Schedules Object:", newSchedules);
    spaConfigState.spaConfig.schedules = newSchedules;

    // Force create a plain object for saving to ensure no reference issues
    const payload = JSON.parse(JSON.stringify(spaConfigState.spaConfig));
    payload.schedules = newSchedules; // Ensure it is definitely there

    console.log("[DEBUG] Saving SPA Config (PAYLOAD):", payload);

    try {
        await db.collection("spa_config").doc("settings").set(payload);
        showToast("Configuración guardada", "success");
    } catch (err) {
        showToast("Error guardando: " + err.message, "error");
    }
}

// --- DISABLED DATES ---
// --- DISABLED DATES ---
function renderClosedDates() {
    const list = document.getElementById("cfg-closed-dates-list");
    if (!list) return;

    if (!spaConfigState.spaConfig.closedDates || spaConfigState.spaConfig.closedDates.length === 0) {
        list.innerHTML = `<div class="muted" style="padding: 10px; text-align: center; font-size: 0.75rem;">No hay días de cierre configurados</div>`;
        return;
    }

    // Sort by date
    spaConfigState.spaConfig.closedDates.sort((a, b) => {
        const da = typeof a === 'string' ? a : a.date;
        const db = typeof b === 'string' ? b : b.date;
        return da.localeCompare(db);
    });

    list.innerHTML = spaConfigState.spaConfig.closedDates.map(item => {
        const date = typeof item === 'string' ? item : item.date;
        const reason = (typeof item === 'object' && item.reason) ? item.reason : '';
        const reasonHtml = reason ? `<span style="font-size: 0.75rem; color: #64748b; margin-left: 10px; font-style: italic;">(${reason})</span>` : '';

        return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: white; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 2px;">
            <div style="display: flex; align-items: center;">
                <span style="font-size: 0.8rem; font-weight: 500;"><i class="fas fa-calendar-day" style="color: var(--accent); margin-right: 8px;"></i>${formatDate(date)}</span>
                ${reasonHtml}
            </div>
            <button onclick="removeClosedDate('${date}')" style="background:none; border:none; color:#ff5252; cursor:pointer; padding: 4px;"><i class="fas fa-trash-alt"></i></button>
        </div>
    `}).join('');
}

async function addClosedDate() {
    const inputDate = document.getElementById("cfg-spa-closed-date");
    const inputReason = document.getElementById("cfg-spa-closed-reason");
    const date = inputDate.value;
    const reason = inputReason ? inputReason.value.trim() : "";

    if (!date) return;
    if (!reason) {
        showToast("El motivo de cierre es obligatorio", "warning");
        return;
    }

    // Check if checks already in list
    const exists = spaConfigState.spaConfig.closedDates.some(d => (typeof d === 'string' ? d : d.date) === date);
    if (exists) {
        showToast("Esa fecha ya está en la lista de cierres", "warning");
        return;
    }

    // CHECK FOR EXISTING RESERVATIONS
    // Collections to check
    const collections = ['reservas_spa', 'reservas_suite', 'reservas_panacea', 'reservas_vip', 'reservas_peluqueria', 'reservas_cabina1', 'reservas_cabina2', 'reservas_cabina3'];

    let hasConflict = false;
    let conflictCount = 0;

    // Show loading feedback
    const btn = document.querySelector("button[onclick='addClosedDate()']");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const checks = collections.map(col => db.collection(col).where("fecha", "==", date).get());
        const results = await Promise.all(checks);

        results.forEach(snap => {
            snap.forEach(doc => {
                const d = doc.data();
                if (d.status !== 'anulada') {
                    hasConflict = true;
                    conflictCount++;
                }
            });
        });

        if (hasConflict) {
            alert(`NO SE PUEDE CERRAR EL DÍA:\n\nSe han encontrado ${conflictCount} reserva(s) activa(s) para el ${formatDate(date)}.\n\nDebes cancelar o mover estas reservas antes de poder bloquear la fecha.`);
            return;
        }

        // Add new date object
        spaConfigState.spaConfig.closedDates.push({ date, reason });
        renderClosedDates();

        // Clear inputs
        inputDate.value = "";
        if (inputReason) inputReason.value = "";
        showToast("Fecha cerrada correctamente", "success");

    } catch (err) {
        console.error("Error checking reservations:", err);
        showToast("Error verificando reservas: " + err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function removeClosedDate(date) {
    // Filter out by string or object.date
    spaConfigState.spaConfig.closedDates = spaConfigState.spaConfig.closedDates.filter(d => {
        const dDate = typeof d === 'string' ? d : d.date;
        return dDate !== date;
    });
    renderClosedDates();
}

// --- SCHEDULE EDITOR ---
function renderScheduleEditor() {
    const container = document.getElementById("cfg-schedule-container");
    if (!container) return;

    if (!spaConfigState.spaConfig.schedules) {
        spaConfigState.spaConfig.schedules = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
    }

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    container.innerHTML = days.map(day => {
        const slots = spaConfigState.spaConfig.schedules[day] || [];
        const label = DAYS_MAP[day] || day;
        const value = slots.join(', ');

        return `
        <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; align-items: start; background: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="font-weight: 600; font-size: 0.9rem; color: #1e293b; text-transform: capitalize; padding-top: 8px;">${label}</div>
            <textarea id="sched-${day}" rows="3" placeholder="Ej: 10:00, 11:15..." 
                class="param-input" style="width: 100%; font-family: monospace; resize: vertical; padding: 10px; border-color: #cbd5e1; line-height: 1.5;">${value}</textarea>
        </div>
        `;
    }).join('');
}

function copyMondayToWeekdays() {
    const mondayInput = document.getElementById("sched-monday");
    if (!mondayInput) return;

    const val = mondayInput.value;
    const weekdays = ['tuesday', 'wednesday', 'thursday', 'friday'];

    if (confirm("¿Copiar el horario del Lunes a Martes, Miércoles, Jueves y Viernes?")) {
        weekdays.forEach(day => {
            const el = document.getElementById(`sched-${day}`);
            if (el) el.value = val;
        });
        showToast("Horario copiado L -> V", "success");
    }
}

// --- CATALOG SERVICES (for counting) ---
async function cargarCatalogServices() {
    try {
        const snapshot = await db.collection("spa_services").where("active", "!=", false).get();
        spaConfigState.catalogServices = [];
        snapshot.forEach(doc => spaConfigState.catalogServices.push({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error("Error cargando catálogo:", err);
    }
}

// --- MASTER ITEMS ---
async function cargarMasterItems() {
    try {
        const snapshot = await db.collection("spa_item_master").orderBy("name", "asc").get();
        spaConfigState.masterItems = [];
        snapshot.forEach(doc => spaConfigState.masterItems.push({ id: doc.id, ...doc.data() }));
        renderMasterItems();
    } catch (err) {
        console.error("Error items maestros:", err);
    }
}

/**
 * Sanitizes space value - rejects 'bono' and other invalid values.
 * Returns null for agenda-less items or invalid spaces.
 * @param {string|null} space - The space value to sanitize
 * @returns {string|null} - Valid space code or null
 */
function sanitizeSpace(space) {
    if (!space || space === '') return null;

    const normalized = space.toLowerCase().trim();

    // BLOCK 'bono' - this is an invalid legacy value
    if (normalized === 'bono') {
        console.warn("[SANITIZE] Rejecting invalid space 'bono' -> null");
        return null;
    }

    // List of valid spaces (gym, complemento = null = agenda-less)
    const validSpaces = [
        'spa', 'suite', 'vip', 'panacea',
        'cabina', 'cabina1', 'cabina2', 'cabina3',
        'peluqueria', 'gym', 'gimnasio', 'fitness'
    ];

    // Gym/fitness services should return null (agenda-less)
    if (normalized === 'gym' || normalized === 'gimnasio' || normalized === 'fitness') {
        return null;
    }

    // Check if space is valid
    if (!validSpaces.includes(normalized)) {
        console.warn(`[SANITIZE] Rejecting invalid space '${space}' -> null`);
        return null;
    }

    return space; // Return original (with original casing)
}

/**
 * Sanitizes allowedSpaces array - removes 'bono' and invalid values.
 * @param {Array} spaces - Array of space codes
 * @returns {Array} - Cleaned array
 */
function sanitizeAllowedSpaces(spaces) {
    if (!Array.isArray(spaces)) return [];

    return spaces
        .map(s => sanitizeSpace(s))
        .filter(s => s !== null);
}

// Export for use in other scripts
window.sanitizeSpace = sanitizeSpace;
window.sanitizeAllowedSpaces = sanitizeAllowedSpaces;


function renderMasterItems() {
    const list = document.getElementById("master-items-tbody");
    if (!list) return;


    if (spaConfigState.masterItems.length === 0) {
        list.innerHTML = `<tr><td colspan="6" style="padding: 30px; text-align: center; color: #94a3b8;">No hay items configurados.</td></tr>`;
        return;
    }

    // Sort items by name
    spaConfigState.masterItems.sort((a, b) => a.name.localeCompare(b.name));

    list.innerHTML = spaConfigState.masterItems.map(item => {
        // Contar cuántos productos usan este item
        const usageCount = spaConfigState.catalogServices.filter(service => {
            if (!service.items_incluidos || !Array.isArray(service.items_incluidos)) return false;
            return service.items_incluidos.some(includedItem =>
                includedItem.toLowerCase().trim() === item.name.toLowerCase().trim()
            );
        }).length;

        // -- LOGICA MULTI-SELECT --
        // Determinar espacios seleccionados (Legacy 'space' string vs New 'allowedSpaces' array)
        let selectedCodes = [];
        if (item.allowedSpaces && Array.isArray(item.allowedSpaces)) {
            selectedCodes = item.allowedSpaces;
        } else if (item.space) {
            selectedCodes = [item.space];
        }

        // Texto resumen para el trigger
        let summaryText = "Sin asignar";
        if (selectedCodes.length > 0) {
            if (selectedCodes.length === 1) {
                const s = spaConfigState.spaces.find(sp => sp.code === selectedCodes[0]);
                summaryText = s ? s.name : selectedCodes[0];
            } else {
                summaryText = `${selectedCodes.length} espacios`;
            }
        }

        return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px;">
                <input type="text" value="${item.code || ''}" placeholder="ID..." onchange="updateMasterItemField('${item.id}', 'code', this.value)" 
                    class="param-input" style="width:100%;">
            </td>
            <td style="padding: 10px 12px;">
                <input type="text" value="${item.name}" onchange="updateMasterItemField('${item.id}', 'name', this.value)" 
                    class="param-input" style="width:100%;">
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <input type="number" value="${item.duration || 0}" onchange="updateMasterItemField('${item.id}', 'duration', parseInt(this.value))" 
                        class="param-input" style="width: 90px; text-align: center;" min="0" max="300">
            </td>
            <td style="padding: 10px 12px; overflow: visible;">
                <div class="ms-container" id="ms-${item.id}">
                    <div class="ms-trigger" onclick="toggleMultiSelect('${item.id}', event)">
                        <span>${summaryText}</span>
                        <i class="fas fa-chevron-down" style="font-size: 0.7em; opacity: 0.5;"></i>
                    </div>
                    <div class="ms-options">
                        ${spaConfigState.spaces.map(s => {
            const checked = selectedCodes.includes(s.code) ? 'checked' : '';
            return `
                                <label class="ms-option">
                                    <input type="checkbox" ${checked} onchange="updateMasterItemSpaces('${item.id}', '${s.code}', this.checked)">
                                    ${s.name}
                                </label>
                            `;
        }).join('')}
                    </div>
                </div>
            </td>
            <td style="padding: 10px 12px;">
                <select onchange="updateMasterItemField('${item.id}', 'required_skill', this.value)" class="param-input" style="width: 100%;">
                    <option value="">-- Ninguna --</option>
                    <option value="masaje" ${item.required_skill === 'masaje' ? 'selected' : ''}>Masajes</option>
                    <option value="facial" ${item.required_skill === 'facial' ? 'selected' : ''}>Facial</option>
                    <option value="corporal" ${item.required_skill === 'corporal' ? 'selected' : ''}>Corporal</option>
                    <option value="ritual" ${item.required_skill === 'ritual' ? 'selected' : ''}>Rituales</option>
                    <option value="suite" ${item.required_skill === 'suite' ? 'selected' : ''}>Suite Spa</option>
                    <option value="circuito" ${item.required_skill === 'circuito' ? 'selected' : ''}>Circuito Spa</option>
                    <option value="manicura" ${item.required_skill === 'manicura' ? 'selected' : ''}>Manicura/Pedicura</option>
                    <option value="peluqueria" ${item.required_skill === 'peluqueria' ? 'selected' : ''}>Peluquería</option>
                    <option value="depilacion" ${item.required_skill === 'depilacion' ? 'selected' : ''}>Depilación</option>
                    <option value="maquillaje" ${item.required_skill === 'maquillaje' ? 'selected' : ''}>Maquillaje</option>
                </select>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <input type="number" value="${item.pax_max || 1}" onchange="updateMasterItemField('${item.id}', 'pax_max', parseInt(this.value))" 
                        class="param-input" style="width: 60px; text-align: center;" min="1" max="50">
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <input type="number" step="0.01" value="${item.price_pax || 0}" onchange="updateMasterItemField('${item.id}', 'price_pax', parseFloat(this.value))" 
                        class="param-input" style="width: 85px; text-align: center; color: var(--accent); font-weight: 700;" min="0">
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <select onchange="updateMasterItemField('${item.id}', 'agenda_required', this.value === 'true')" class="param-input" style="width: 80px;">
                    <option value="true" ${item.agenda_required !== false ? 'selected' : ''}>SÍ</option>
                    <option value="false" ${item.agenda_required === false ? 'selected' : ''}>NO</option>
                </select>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <span onclick="showItemUsage('${item.id}', '${item.name.replace(/'/g, "\\'")}')"
                    style="display: inline-block; background: ${usageCount > 0 ? '#e0f2fe' : '#f1f5f9'}; color: ${usageCount > 0 ? '#0369a1' : '#94a3b8'}; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.75rem; cursor: ${usageCount > 0 ? 'pointer' : 'default'}; transition: all 0.2s;" 
                    ${usageCount > 0 ? 'onmouseover="this.style.background=\'#bfdbfe\'" onmouseout="this.style.background=\'#e0f2fe\'"' : ''}>
                    <i class="fas fa-${usageCount > 0 ? 'box-open' : 'inbox'}" style="margin-right: 4px; font-size: 0.65rem;"></i>
                    ${usageCount} ${usageCount === 1 ? 'producto' : 'productos'}
                </span>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <button onclick="deleteMasterItem('${item.id}')" class="btn-icon danger"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `}).join('');
}

// --- MULTI-SELECT HELPERS ---

function toggleMultiSelect(id, event) {
    console.log("Toggle Multi Select", id);
    if (event) event.stopPropagation();
    // Close others
    document.querySelectorAll('.ms-options').forEach(el => {
        if (el.parentElement.id !== `ms-${id}`) el.classList.remove('show');
    });

    const container = document.getElementById(`ms-${id}`);
    if (container) {
        const opts = container.querySelector('.ms-options');
        opts.classList.toggle('show');
    }
}

// Close dropdowns when clicking outside (Added once in styles init or global)
document.addEventListener('click', () => {
    document.querySelectorAll('.ms-options.show').forEach(el => el.classList.remove('show'));
});


async function updateMasterItemField(id, field, value) {
    try {
        await db.collection("spa_item_master").doc(id).update({
            [field]: value,
            updated_at: new Date().toISOString()
        });
        // Si cambiamos nombre, la UI se refresca sola con el onchange, 
        // pero para consistencia estado local:
        const item = spaConfigState.masterItems.find(i => i.id === id);
        if (item) item[field] = value;

    } catch (err) {
        showToast("Error actualizando: " + err.message, "error");
    }
}

async function updateMasterItemSpaces(id, spaceCode, isChecked) {
    try {
        const item = spaConfigState.masterItems.find(i => i.id === id);
        if (!item) return;

        // Migración on-the-fly: si no tiene allowedSpaces, lo creamos desde space
        let currentSpaces = item.allowedSpaces || [];
        if (!item.allowedSpaces && item.space) {
            currentSpaces = [item.space];
        }

        if (isChecked) {
            if (!currentSpaces.includes(spaceCode)) currentSpaces.push(spaceCode);
        } else {
            currentSpaces = currentSpaces.filter(c => c !== spaceCode);
        }

        // Optimistic update local state
        item.allowedSpaces = currentSpaces;
        // Update Legacy 'space' property just in case (optional, maybe keep sync for backward compat or clear it)
        // Let's clear it or set to first to avoid confusing old logic? 
        // For now: Leave 'space' as is OR update it to the first one for limited backward compat
        // item.space = currentSpaces.length > 0 ? currentSpaces[0] : ""; 

        // Rerender row partially or fully? Fully is safer to update Summary Text
        renderMasterItems(); // This might close the dropdown, which is annoying.
        // Better: Don't re-render fully, just update state and DB. 
        // The user presumably wants to keep clicking.
        // We will manually update the summary text if we don't full render.
        updateSummaryText(id, currentSpaces);

        await db.collection("spa_item_master").doc(id).update({
            allowedSpaces: currentSpaces,
            updated_at: new Date().toISOString()
        });

    } catch (err) {
        console.error(err);
        showToast("Error al actualizar espacios: " + err.message, "error");
        renderMasterItems(); // Revert on error
    }
}

function updateSummaryText(id, codes) {
    const container = document.getElementById(`ms-${id}`);
    if (!container) return;
    const summarySpan = container.querySelector('.ms-trigger span');

    let text = "Sin asignar";
    if (codes.length > 0) {
        if (codes.length === 1) {
            const s = spaConfigState.spaces.find(sp => sp.code === codes[0]);
            text = s ? s.name : codes[0];
        } else {
            text = `${codes.length} espacios`;
        }
    }
    summarySpan.textContent = text;
}

function showItemUsage(itemId, itemName) {
    // Encontrar productos que usan este item
    const usedByProducts = spaConfigState.catalogServices.filter(service => {
        if (!service.items_incluidos || !Array.isArray(service.items_incluidos)) return false;
        return service.items_incluidos.some(includedItem =>
            includedItem.toLowerCase().trim() === itemName.toLowerCase().trim()
        );
    });

    if (usedByProducts.length === 0) {
        showToast("Este item no está siendo usado por ningún producto", "info");
        return;
    }

    // Crear mensaje con la lista de productos
    const productList = usedByProducts
        .map((p, i) => `${i + 1}. ${p.nombre} (${p.precio}€)`)
        .join('\n');

    alert(`📦 Productos que usan "${itemName}":\n\n${productList}\n\nTotal: ${usedByProducts.length} producto${usedByProducts.length !== 1 ? 's' : ''}`);
}


/**
 * Normaliza profundamente un nombre para detectar duplicados "borrosos" y semánticos
 */
function normalizeItemName(name) {
    if (!name) return "";
    let low = name.toString().toLowerCase().trim();

    // Ignorar etiquetas de metadatos que no son items per se
    if (low.startsWith("duracion:") || low.startsWith("pax:") || low.startsWith("incluye:") || low.startsWith("categoria:")) {
        return "";
    }

    let n = low
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9]/g, "") // Quitar todo lo que no sea letra o número
        .trim();

    // Mapping semántico para items que el usuario considera "lo mismo"
    if (n.includes("alojamiento") || n.includes("desayuno") || n.includes("pensioncompleta") || n.includes("mediapension")) {
        return "alojamientohotel";
    }
    if (n.includes("circuitospa")) {
        return "circuitospa";
    }
    if (n.includes("depilacion")) {
        return "depilacion";
    }

    return n;
}

async function addMasterItem() {
    const name = prompt("Nombre del nuevo item:");
    if (!name || !name.trim()) return;

    const normName = normalizeItemName(name);
    const exists = spaConfigState.masterItems.some(i => normalizeItemName(i.name) === normName);
    if (exists) {
        showToast("Este item ya existe (o uno muy similar) en el catálogo maestro", "warning");
        return;
    }

    try {
        const code = "It" + Math.floor(100 + Math.random() * 900); // Auto-generate Code
        await db.collection("spa_item_master").add({
            name: name.trim(),
            code: code,
            duration: 0,
            pax_max: 1, // Default to 1
            price_pax: 0,
            agenda_required: true, // Default to true
            space: "",
            created_at: new Date().toISOString()
        });
        cargarMasterItems();
        showToast("Item añadido correctamente", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

/**
 * Utility to clean up duplicates in spa_item_master
 * Keeps the item with more info (duration or space) or the oldest one.
 */
async function deduplicateMasterItems() {
    if (!confirm("¿Deseas buscar y eliminar items duplicados automáticamente?")) return;

    try {
        const snapshot = await db.collection("spa_item_master").get();
        const map = {}; // name.toLowerCase() -> [docs]

        snapshot.forEach(doc => {
            const data = doc.data();
            const n = normalizeItemName(data.name);
            if (!n) {
                batch.delete(doc.ref);
                deleteCount++;
                return;
            }
            if (!map[n]) map[n] = [];
            map[n].push({ id: doc.id, ...data });
        });

        const batch = db.batch();
        let deleteCount = 0;

        for (const name in map) {
            const docs = map[name];
            if (docs.length > 1) {
                // Sort by "quality": favor those with duration > 0 or assigned space
                docs.sort((a, b) => {
                    const scoreA = (a.duration ? 1 : 0) + (a.space ? 1 : 0);
                    const scoreB = (b.duration ? 1 : 0) + (b.space ? 1 : 0);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    // Fallback to earliest created_at
                    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                });

                // Keep the first (best) one, delete the rest
                for (let i = 1; i < docs.length; i++) {
                    batch.delete(db.collection("spa_item_master").doc(docs[i].id));
                    deleteCount++;
                }
            }
        }

        if (deleteCount > 0) {
            await batch.commit();
            showToast(`Se han eliminado ${deleteCount} duplicados`, "success");
            cargarMasterItems();
        } else {
            showToast("No se encontraron duplicados", "info");
        }
    } catch (err) {
        console.error("Deduplicación fallida:", err);
        showToast("Error al deduplicar: " + err.message, "error");
    }
}

/**
 * CRITICAL CATALOG NORMALIZATION
 * Enforces strict structure:
 * 1. Code is primary key (ltXXX).
 * 2. AllowedSpaces is ALWAYS an array of valid strings.
 * 3. Removes "X espacios", "bono", etc.
 */
async function normalizeCatalogStruct() {
    if (!confirm("⚠️ ATENCIÓN: Esta acción normalizará la estructura del catálogo completo.\n\n- Convertirá espacios a arrays strictos.\n- Eliminará valores basura ('3 espacios', 'bono').\n- Generará códigos ltXXX si faltan.\n\n¿Estás seguro?")) return;

    try {
        const snapshot = await db.collection("spa_item_master").get();
        const batch = db.batch();
        let updateCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const ref = doc.ref;
            let needsUpdate = false;
            let updates = {};

            // 1. Ensure Code (ltXXX) if completely missing
            if (!data.code || !data.code.startsWith('lt')) {
                // Only generate if totally missing, keep existing "It..." if they have it from before
                if (!data.code) {
                    updates.code = "lt" + Math.floor(10000 + Math.random() * 90000);
                    needsUpdate = true;
                }
            }

            // 2. Normalize Spaces
            let newSpaces = [];

            // Prioritize existing array if valid
            if (Array.isArray(data.allowedSpaces) && data.allowedSpaces.length > 0) {
                newSpaces = data.allowedSpaces;
            }
            // Fallback to legacy string
            else if (data.space) {
                const s = data.space.toLowerCase().trim();
                if (['spa', 'circuitospa'].includes(s)) newSpaces = ['spa'];
                else if (['suite', 'suite_privada'].includes(s)) newSpaces = ['suite'];
                else if (['vip', 'panacea'].includes(s)) newSpaces = ['vip', 'panacea'];
                else if (s.includes('cabina')) newSpaces = ['cabina'];
                else if (['gym', 'gimnasio', 'fitness'].includes(s)) newSpaces = ['gimnasio'];
                else if (['hotel', 'restaurante', 'peluqueria'].includes(s)) newSpaces = [s];
                // "3 espacios", "bono", "sin asignar" -> [] (Empty)
            }

            // Sanitization Check
            const cleanSpaces = newSpaces.filter(s => {
                const sv = String(s).toLowerCase();
                return !sv.includes('espacios') && !sv.includes('bono') && sv !== 'sin asignar';
            });

            // Compare with current
            const currentStr = JSON.stringify(data.allowedSpaces || []);
            const newStr = JSON.stringify(cleanSpaces);

            if (currentStr !== newStr) {
                updates.allowedSpaces = cleanSpaces;
                needsUpdate = true;
            }

            // 3. Clear Legacy Junk
            if (data.space && (data.space.includes('espacios') || data.space === 'bono')) {
                updates.space = ""; // Clear confusing legacy field
                needsUpdate = true;
            }

            if (needsUpdate) {
                updates.updated_at = new Date().toISOString();
                updates.normalization_version = 1;
                batch.update(ref, updates);
                updateCount++;
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            alert(`✅ Normalización completada.\n\nSe han actualizado ${updateCount} items con el formato estricto.`);
        } else {
            alert("El catálogo ya está normalizado.");
        }

        cargarMasterItems();

    } catch (err) {
        console.error(err);
        alert("Error durante la normalización: " + err.message);
    }
}

async function deleteMasterItem(id) {
    if (!confirm("¿Eliminar este item maestro?")) return;
    try {
        await db.collection("spa_item_master").doc(id).delete();
        cargarMasterItems();
        showToast("Item eliminado", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

async function syncExistingItemsToMaster() {
    if (!confirm("¿Sincronizar items de servicios existentes?")) return;

    try {
        const snapshot = await db.collection("spa_services").get();
        const allItems = new Set();
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.items_incluidos) {
                d.items_incluidos.forEach(i => {
                    const trimmed = i.trim();
                    if (normalizeItemName(trimmed)) {
                        allItems.add(trimmed);
                    }
                });
            }
        });

        const existing = new Set(spaConfigState.masterItems.map(i => normalizeItemName(i.name)));
        const newItems = [...allItems].filter(n => !existing.has(normalizeItemName(n)));

        if (newItems.length === 0) return showToast("Todo actualizado", "info");

        const batch = db.batch();
        newItems.forEach(name => {
            let duration = 0;
            let space = "";
            const norm = normalizeItemName(name);

            const durMatch = name.match(/(\d+)\s*['|min|m]/i);
            if (durMatch) duration = parseInt(durMatch[1]);

            let agenda_required = true;
            let pax_max = 1;
            let allowedSpaces = [];

            if (norm === "alojamientohotel") {
                name = "Alojamiento / Hotel";
                space = "hotel";
                allowedSpaces = ["hotel"];
                agenda_required = false;
            } else if (norm === "circuitospa" || name.toLowerCase().includes("circuito")) {
                space = "spa";
                allowedSpaces = ["spa"];
                pax_max = 16;
            } else if (name.toLowerCase().includes("masaje") || name.toLowerCase().includes("tratamiento")) {
                space = "cabina";
                allowedSpaces = ["cabina1", "cabina2", "cabina3"];
            } else if (name.toLowerCase().includes("gimnasio") || name.toLowerCase().includes("gym")) {
                agenda_required = false;
                pax_max = 10;
                allowedSpaces = ["gym"];
                space = "gym";
            }

            const ref = db.collection("spa_item_master").doc();
            batch.set(ref, {
                name,
                duration,
                space,
                allowedSpaces,
                pax_max,
                agenda_required,
                created_at: new Date().toISOString()
            });
        });

        await batch.commit();
        cargarMasterItems();
        showToast(`${newItems.length} items sincronizados`, "success");
    } catch (e) {
        showToast("Error sync: " + e.message, "error");
    }
}

/**
 * MIGRATION UTILITY: Removes 'bono' space from all collections.
 * Run this once to clean legacy data.
 */
async function migrateBonoSpaceToNull() {
    if (!confirm("¿Deseas corregir todos los items con espacio 'bono' inválido?\n\nEsto actualizará:\n- spa_item_master\n- spa_services\n- spa_vouchers")) {
        return;
    }

    let totalFixed = 0;

    try {
        // 1. Fix spa_item_master
        const masterSnap = await db.collection("spa_item_master").get();
        const masterBatch = db.batch();
        let masterCount = 0;

        masterSnap.forEach(doc => {
            const data = doc.data();
            let needsUpdate = false;
            const updates = {};

            // Check space field
            if (data.space && data.space.toLowerCase() === 'bono') {
                updates.space = null;
                needsUpdate = true;
            }

            // Check allowedSpaces array
            if (data.allowedSpaces && Array.isArray(data.allowedSpaces)) {
                const cleaned = data.allowedSpaces.filter(s => s.toLowerCase() !== 'bono');
                if (cleaned.length !== data.allowedSpaces.length) {
                    updates.allowedSpaces = cleaned.length > 0 ? cleaned : null;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                masterBatch.update(doc.ref, updates);
                masterCount++;
            }
        });

        if (masterCount > 0) {
            await masterBatch.commit();
            totalFixed += masterCount;
            console.log(`[MIGRATION] Fixed ${masterCount} items in spa_item_master`);
        }

        // 2. Fix spa_services
        const servicesSnap = await db.collection("spa_services").get();
        const servicesBatch = db.batch();
        let servicesCount = 0;

        servicesSnap.forEach(doc => {
            const data = doc.data();

            // Check items_incluidos or desglosados for nested espacio
            if (data.items_compra && Array.isArray(data.items_compra)) {
                const cleaned = data.items_compra.map(item => {
                    if (item.espacio && item.espacio.toLowerCase() === 'bono') {
                        return { ...item, espacio: null };
                    }
                    return item;
                });

                const hasChanges = JSON.stringify(cleaned) !== JSON.stringify(data.items_compra);
                if (hasChanges) {
                    servicesBatch.update(doc.ref, { items_compra: cleaned });
                    servicesCount++;
                }
            }
        });

        if (servicesCount > 0) {
            await servicesBatch.commit();
            totalFixed += servicesCount;
            console.log(`[MIGRATION] Fixed ${servicesCount} services in spa_services`);
        }

        // 3. Fix spa_vouchers
        const vouchersSnap = await db.collection("spa_vouchers").get();
        let vouchersBatches = [];
        let currentBatch = db.batch();
        let batchCount = 0;
        let vouchersCount = 0;

        vouchersSnap.forEach(doc => {
            const data = doc.data();
            let needsUpdate = false;
            const updates = {};

            // Check items_compra array
            if (data.items_compra && Array.isArray(data.items_compra)) {
                const cleaned = data.items_compra.map(item => {
                    if (item.espacio && item.espacio.toLowerCase() === 'bono') {
                        return { ...item, espacio: null };
                    }
                    return item;
                });

                const hasChanges = JSON.stringify(cleaned) !== JSON.stringify(data.items_compra);
                if (hasChanges) {
                    updates.items_compra = cleaned;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                currentBatch.update(doc.ref, updates);
                batchCount++;
                vouchersCount++;

                // Firestore batch limit is 500
                if (batchCount >= 450) {
                    vouchersBatches.push(currentBatch);
                    currentBatch = db.batch();
                    batchCount = 0;
                }
            }
        });

        if (batchCount > 0) {
            vouchersBatches.push(currentBatch);
        }

        for (const batch of vouchersBatches) {
            await batch.commit();
        }

        if (vouchersCount > 0) {
            totalFixed += vouchersCount;
            console.log(`[MIGRATION] Fixed ${vouchersCount} vouchers in spa_vouchers`);
        }

        showToast(`Migración completada: ${totalFixed} documentos corregidos`, "success");

    } catch (err) {
        console.error("[MIGRATION] Error:", err);
        showToast("Error en migración: " + err.message, "error");
    }
}

// Export migration function
window.migrateBonoSpaceToNull = migrateBonoSpaceToNull;

// --- SPACES ---
async function cargarSpaces() {
    try {
        const snapshot = await db.collection("spa_spaces").orderBy("name", "asc").get();
        spaConfigState.spaces = [];
        snapshot.forEach(doc => spaConfigState.spaces.push({ id: doc.id, ...doc.data() }));

        // FALLBACK DEFAULT SPACES IF DB EMPTY
        if (spaConfigState.spaces.length === 0) {
            console.warn("No spaces in DB, using defaults.");
            const DEFAULT_SPACES = [
                { code: 'spa', name: 'Spa', capacity: 20, type: 'circuit' },
                { code: 'panacea', name: 'Panacea (Cabinas)', capacity: 5, type: 'service' },
                { code: 'suite', name: 'Suite Spa', capacity: 2, type: 'private' },
                { code: 'vip', name: 'Sala VIP', capacity: 4, type: 'private' },
                { code: 'peluqueria', name: 'Peluquería', capacity: 2, type: 'service' },
                { code: 'gimnasio', name: 'Gimnasio', capacity: 10, type: 'other' },
                { code: 'restaurante', name: 'Restaurante', capacity: 50, type: 'other' },
                { code: 'terraza', name: 'Terraza', capacity: 30, type: 'other' },
                { code: 'jardin', name: 'Jardín', capacity: 20, type: 'other' }
            ];
            spaConfigState.spaces = DEFAULT_SPACES;
        }

        renderSpaces();
        renderMasterItems(); // Refresh dropdowns
    } catch (err) {
        console.error("Error spaces:", err);
    }
}

function renderSpaces() {
    const grid = document.getElementById("spaces-grid");
    if (!grid) return;

    if (spaConfigState.spaces.length === 0) {
        grid.innerHTML = `<div class="muted" style="grid-column:1/-1; text-align:center; padding:30px;">No hay salas. Crea la primera.</div>`;
        return;
    }

    const typeLabels = { 'private': 'Privada', 'circuit': 'Circuito', 'service': 'Servicios', 'other': 'Otro' };

    grid.innerHTML = spaConfigState.spaces.map(s => `
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; border-top: 4px solid ${s.color || '#8b5cf6'};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600;">${s.name}</h4>
                    <p style="margin: 4px 0 0 0; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase;">${s.code}</p>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="openSpaceModal('${s.id}')" class="btn-icon"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteSpace('${s.id}')" class="btn-icon danger"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div style="display: flex; gap: 10px; font-size: 0.75rem;">
                 <div style="flex: 1; background: #f8fafc; padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: #64748b; font-size: 0.65rem;">CAPACIDAD</div>
                    <div style="font-weight: 600;">${s.capacity || 1}</div>
                </div>
                <div style="flex: 1; background: #f8fafc; padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: #64748b; font-size: 0.65rem;">TIPO</div>
                    <div style="font-weight: 600;">${typeLabels[s.type] || 'N/A'}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function openSpaceModal(id = null) {
    const form = document.getElementById("space-form");
    form.reset();
    document.getElementById("space-id").value = "";
    document.getElementById("space-modal-title").textContent = "Nueva Sala";

    if (id) {
        const s = spaConfigState.spaces.find(x => x.id === id);
        if (s) {
            document.getElementById("space-modal-title").textContent = "Editar Sala";
            document.getElementById("space-id").value = s.id;
            document.getElementById("space-name").value = s.name;
            document.getElementById("space-code").value = s.code;
            document.getElementById("space-capacity").value = s.capacity;
            document.getElementById("space-type").value = s.type;
            document.getElementById("space-color").value = s.color;
            document.getElementById("space-description").value = s.description || '';
        }
    }
    document.getElementById("space-modal").style.display = "flex";
}

function closeSpaceModal() {
    document.getElementById("space-modal").style.display = "none";
}

async function saveSpace(e) {
    e.preventDefault();
    const id = document.getElementById("space-id").value;
    const data = {
        name: document.getElementById("space-name").value.trim(),
        code: document.getElementById("space-code").value.trim().toLowerCase(),
        capacity: parseInt(document.getElementById("space-capacity").value),
        type: document.getElementById("space-type").value,
        color: document.getElementById("space-color").value,
        description: document.getElementById("space-description").value.trim(),
        updated_at: new Date().toISOString()
    };

    try {
        if (id) {
            await db.collection("spa_spaces").doc(id).update(data);
        } else {
            data.created_at = new Date().toISOString();
            await db.collection("spa_spaces").add(data);
        }
        closeSpaceModal();
        cargarSpaces();
        showToast("Sala guardada", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

async function deleteSpace(id) {
    if (!confirm("¿Eliminar esta sala?")) return;
    try {
        await db.collection("spa_spaces").doc(id).delete();
        cargarSpaces();
        showToast("Sala eliminada", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

// --- COMPLEMENTOS ---
async function cargarComplementos() {
    try {
        const snapshot = await db.collection("spa_complementos").orderBy("nombre", "asc").get();
        spaConfigState.complementos = [];
        snapshot.forEach(doc => spaConfigState.complementos.push({ id: doc.id, ...doc.data() }));
        renderComplementos();
    } catch (err) {
        console.error("Error complementos:", err);
    }
}

function renderComplementos() {
    const list = document.getElementById("complementos-tbody");
    if (!list) return;

    if (spaConfigState.complementos.length === 0) {
        list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;" class="muted">No hay complementos.</td></tr>`;
        return;
    }

    list.innerHTML = spaConfigState.complementos.map(c => {
        // Space Name Lookup
        let spaceName = '-';
        if (c.space) {
            const s = spaConfigState.spaces.find(sp => sp.code === c.space);
            spaceName = s ? s.name : c.space;
        }

        // Calculate Included In (PROD)
        // Assuming window.currentServices or spaConfigState.services exists. 
        // If not, we try to use a global if available or default to 0.
        // We'll trust existing patterns. renderMasterItems likely uses window.currentServices.

        let includedCount = 0;
        if (spaConfigState.catalogServices) {
            includedCount = spaConfigState.catalogServices.filter(s =>
                s.items_incluidos && s.items_incluidos.some(i => i.toLowerCase() === c.nombre.toLowerCase())
            ).length;
        }

        return `
        <tr style="opacity: ${c.active === false ? 0.5 : 1}; border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px; font-family: monospace; color: #64748b; font-size: 0.8rem;">${c.code || '-'}</td>
            <td style="padding: 10px 12px; font-weight: 500; font-size: 0.85rem;">${c.nombre}</td>
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #475569;">${spaceName}</td>
            <td style="padding: 10px 12px; text-align: center;">
                <span class="badge badge-blue-light" style="font-size: 0.75rem; cursor:pointer;" onclick="showIncludedInDetails('${c.id}')" title="Ver qué packs lo incluyen">
                    <i class="fas fa-box-open"></i> ${includedCount} packs
                </span>
            </td>
            <td style="padding: 10px 12px;">
                <span class="badge badge-outline" style="font-size:0.7rem;">${c.categoria || 'Var'}</span>
                <div style="font-size: 0.65rem; color: #64748b; margin-top: 2px;">
                    ${c.consumption_type === 'person' ? '<i class="fas fa-user"></i> Pers.' : '<i class="fas fa-box"></i> Unit.'}
                </div>
            </td>
            <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-size: 0.85rem;">${parseFloat(c.precio).toFixed(2)} €</td>
            <td style="padding: 10px 12px; text-align: center; font-size: 0.75rem;">${c.active !== false ? '<span style="color:var(--success)">Activo</span>' : '<span style="color:var(--text-muted)">Inactivo</span>'}</td>
            <td style="padding: 10px 12px; text-align: center;">
                <button onclick="openComplementoModal('${c.id}')" class="btn-icon"><i class="fas fa-edit"></i></button>
                <button onclick="deleteComplemento('${c.id}')" class="btn-icon danger"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `}).join('');
}

function openComplementoModal(id = null) {
    document.getElementById("complemento-form").reset();
    document.getElementById("complemento-id").value = "";

    // Auto-generate code for new item
    const newCode = "ext." + Math.floor(100 + Math.random() * 900);
    const codeInput = document.getElementById("complemento-code");
    codeInput.value = newCode;
    codeInput.disabled = true; // Prevent editing
    codeInput.style.backgroundColor = "#f1f5f9"; // Visual output

    document.getElementById("complemento-modal-title").textContent = "Nuevo Complemento";

    // Populate Space Dropdown (Multi-select)
    const spaceSelect = document.getElementById("complemento-space");
    // Ensure we have "All" option + Dynamic spaces
    let spaceOptions = `<option value="-">Todos (Cualquiera)</option>`;
    // Fallback if spaConfigState.spaces is empty/undefined, though it resembles 'spaces' config
    if (typeof spaConfigState !== 'undefined' && spaConfigState.spaces) {
        spaceOptions += spaConfigState.spaces.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
    } else {
        // Fallback hardcoded if needed, or trust existing innerHTML if we don't overwrite it?
        // Step 742 overwrites it. So I must provide options.
        spaceOptions += `
            <option value="spa">Spa</option>
            <option value="suite">Suite</option>
            <option value="panacea">Panacea</option>
            <option value="vip">Sala Vip</option>
            <option value="peluqueria">Peluquería</option>
            <option value="hotel">Hotel</option>
            <option value="restaurante">Restaurante</option>
        `;
    }
    spaceSelect.innerHTML = spaceOptions;

    if (id) {
        const c = spaConfigState.complementos.find(x => x.id === id);
        if (c) {
            document.getElementById("complemento-modal-title").textContent = "Editar Complemento";
            document.getElementById("complemento-id").value = c.id;
            document.getElementById("complemento-name").value = c.nombre;
            document.getElementById("complemento-code").value = c.code || '';
            document.getElementById("complemento-code").disabled = true;
            document.getElementById("complemento-code").style.backgroundColor = "#f1f5f9";

            // Handle Space Selection (String vs Array)
            const selectedSpaces = Array.isArray(c.space) ? c.space : (c.space ? [c.space] : []);
            Array.from(spaceSelect.options).forEach(opt => {
                opt.selected = selectedSpaces.includes(opt.value);
            });

            document.getElementById("complemento-category").value = c.categoria || 'complemento';
            document.getElementById("complemento-consumption").value = c.consumption_type || 'unit';
            document.getElementById("complemento-price").value = c.precio;
            document.getElementById("complemento-enabled").value = c.active !== false ? "true" : "false";
            document.getElementById("complemento-id-display").textContent = c.code || '';
        }
    }
    // Display Code in Badge
    document.getElementById("complemento-id-display").textContent = document.getElementById("complemento-code").value;

    document.getElementById("complemento-modal").style.display = "flex";
}

function closeComplementoModal() {
    document.getElementById("complemento-modal").style.display = "none";
}

async function saveComplemento(e) {
    e.preventDefault();
    const id = document.getElementById("complemento-id").value;
    // Multi-select for Space
    const spaceSelect = document.getElementById("complemento-space");
    const spaces = Array.from(spaceSelect.selectedOptions).map(opt => opt.value);

    // Logic: If "-" is selected alongside others, maybe treat as "All"? 
    // Or just save the array.
    // If array is empty, default to ["-"]?

    const data = {
        nombre: document.getElementById("complemento-name").value.trim(),
        code: document.getElementById("complemento-code").value.trim(),
        consumption_type: document.getElementById("complemento-consumption").value,
        duration: parseInt(document.getElementById("complemento-duration").value) || 0,
        space: spaces.length > 0 ? spaces : ["-"], // Save as Array
        categoria: document.getElementById("complemento-category").value,
        precio: parseFloat(document.getElementById("complemento-price").value),
        active: document.getElementById("complemento-enabled").value === "true",
        updated_at: new Date().toISOString()
    };

    try {
        if (id) {
            await db.collection("spa_complementos").doc(id).update(data);
        } else {
            data.created_at = new Date().toISOString();
            await db.collection("spa_complementos").add(data);
        }
        closeComplementoModal();
        cargarComplementos();
        showToast("Complemento guardado", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

async function deleteComplemento(id) {
    if (!confirm("¿Eliminar este complemento?")) return;
    try {
        await db.collection("spa_complementos").doc(id).delete();
        cargarComplementos();
        showToast("Complemento eliminado", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

// --- AUTO-ASSIGN CODES TOOL ---
async function autoAssignCodes() {
    if (!confirm("⚠️ ATENCIÓN: Esta acción SOBRESCRIBIRÁ TODOS los códigos existentes.\n\n- Se buscará coincidencia en el catálogo (SKU).\n- Si no existe, se generará un NUEVO código (It... o ext...).\n\n¿Estás seguro de que quieres regenerar todo?")) return;

    const btn = document.getElementById("btn-auto-codes");
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;
    }

    try {
        console.log("Iniciando regeneración masiva de códigos...");

        // 1. Fetch Catalog Services to match
        const servicesSnap = await db.collection("spa_services").get();
        const services = [];
        servicesSnap.forEach(doc => services.push({ id: doc.id, ...doc.data() }));

        // Helper: Find Code from Service
        function findServiceCode(name) {
            const match = services.find(s => s.nombre && s.nombre.toLowerCase().trim() === name.toLowerCase().trim());
            if (match) {
                // Priority: SKU -> Code (if exists) -> WC ID
                if (match.wc_sku) return match.wc_sku;
                if (match.code) return match.code;
                if (match.wc_id) return String(match.wc_id);
            }
            return null;
        }

        // Helper: Generate Numeric-like Code (ItXXX)
        function generateItCode() {
            const num = Math.floor(100 + Math.random() * 900); // 3 digits for Itxxx
            return 'It' + num;
        }

        // Helper: Generate Extra Code (ext.XXX)
        function generateExtCode() {
            const num = Math.floor(10 + Math.random() * 90); // 10-99 to match example ext.22 roughly, or larger
            // To be safer on collisions let's use 3 digits: 100-999
            const safeNum = Math.floor(100 + Math.random() * 900);
            return 'ext.' + safeNum;
        }

        const batch = db.batch();
        let count = 0;
        const CONFIG_LIMIT = 450; // Safety buffer for Firestore batch limit (500)

        // 2. Process Master Items
        if (spaConfigState.masterItems) {
            for (const item of spaConfigState.masterItems) {
                // REMOVED check: if (item.code) continue; -> We want to overwrite!

                let newCode = findServiceCode(item.name);
                // If no match, use random itXXX
                if (!newCode) newCode = generateItCode();

                const ref = db.collection("spa_item_master").doc(item.id);
                batch.update(ref, { code: newCode });
                count++;

                if (count >= CONFIG_LIMIT) break;
            }
        }

        // 3. Process Complements
        if (spaConfigState.complementos && count < CONFIG_LIMIT) {
            for (const comp of spaConfigState.complementos) {
                // REMOVED check: if (comp.code) continue; -> We want to overwrite!

                // For complements, we prefer the ext.XXX format if no service match found
                // Or maybe ALWAYS ext.XXX?
                // The user said "extras also have to have id e.g. ext.22".
                // If we match a service catalog item (e.g. botellacava sku: CA-001), maybe we want that?
                // But usually extras are internal. Let's try to match service first, else ext.
                let newCode = findServiceCode(comp.nombre);

                // Fallback to ext.XXX
                if (!newCode) newCode = generateExtCode();

                const ref = db.collection("spa_complementos").doc(comp.id);
                batch.update(ref, { code: newCode });
                count++;

                if (count >= CONFIG_LIMIT) break;
            }
        }

        if (count > 0) {
            await batch.commit();
            showToast(`Se han regenerado ${count} códigos correctamente.`, "success");

            // Reload UI
            if (typeof cargarMasterItems === 'function') cargarMasterItems();
            if (typeof cargarComplementos === 'function') cargarComplementos();
        } else {
            showToast("No se encontraron elementos para actualizar.", "info");
        }

    } catch (err) {
        console.error("Error auto-assigning codes:", err);
        showToast("Error: " + err.message, "error");
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-magic"></i> Auto-Códigos';
            btn.disabled = false;
        }
    }
}

function showIncludedInDetails(id) {
    const comp = spaConfigState.complementos.find(c => c.id === id);
    if (!comp) return;

    if (!spaConfigState.catalogServices) {
        return showToast("Cargando catálogo...", "info");
    }

    const includedIn = spaConfigState.catalogServices.filter(s =>
        s.items_incluidos && s.items_incluidos.some(i => i.toLowerCase() === comp.nombre.toLowerCase())
    );

    if (includedIn.length === 0) {
        alert(`"${comp.nombre}" no está incluido en ningún pack actualmente.`);
        return;
    }

    const names = includedIn.map(s => `• ${s.nombre}`).join('\n');
    alert(`"${comp.nombre}" está incluido en ${includedIn.length} packs:\n\n${names}`);
}
