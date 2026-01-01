// config.js - Lógica de Configuración del Sistema

const state = {
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
    complementos: []
};

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation(); // From app-core.js
    initConfig();
});

function initConfig() {
    cargarSpaConfig();
    cargarMasterItems();
    cargarSpaces();
    cargarComplementos();
}

// --- TABS ---
function switchConfigTab(tabId, btn) {
    document.querySelectorAll(".config-tab-content").forEach(tab => tab.style.display = "none");
    document.getElementById(tabId).style.display = "block";
    document.querySelectorAll(".config-tab").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
}

// --- GLOBAL SETTINGS ---
async function cargarSpaConfig() {
    try {
        const doc = await db.collection("spa_config").doc("settings").get();
        if (doc.exists) {
            state.spaConfig = { ...state.spaConfig, ...doc.data() };
            updateSettingsUI();
            renderClosedDates();
        }
    } catch (err) {
        console.error("Error cargando spa_config:", err);
    }
}

function updateSettingsUI() {
    const ids = {
        "cfg-spa-capacity": state.spaConfig.capacity,
        "cfg-spa-cleaning": state.spaConfig.cleaningTime,
        "cfg-whatsapp-template": state.spaConfig.whatsappTemplate,
        "cfg-wc-url": state.spaConfig.wc_url,
        "cfg-wc-key": state.spaConfig.wc_key,
        "cfg-wc-secret": state.spaConfig.wc_secret,
        "cfg-wc-push-key": state.spaConfig.wc_push_key
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

    state.spaConfig.capacity = capacity;
    state.spaConfig.cleaningTime = cleaning;
    state.spaConfig.whatsappTemplate = template;
    state.spaConfig.wc_url = wcUrl;
    state.spaConfig.wc_key = wcKey;
    state.spaConfig.wc_secret = wcSecret;
    state.spaConfig.wc_push_key = wcPushKey;

    try {
        await db.collection("spa_config").doc("settings").set(state.spaConfig);
        showToast("Configuración guardada", "success");
    } catch (err) {
        showToast("Error guardando: " + err.message, "error");
    }
}

// --- DISABLED DATES ---
function renderClosedDates() {
    const list = document.getElementById("cfg-closed-dates-list");
    if (!list) return;

    if (!state.spaConfig.closedDates || state.spaConfig.closedDates.length === 0) {
        list.innerHTML = `<div class="muted" style="padding: 10px; text-align: center; font-size: 0.75rem;">No hay días de cierre configurados</div>`;
        return;
    }

    state.spaConfig.closedDates.sort();

    list.innerHTML = state.spaConfig.closedDates.map(date => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: white; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 2px;">
            <span style="font-size: 0.8rem; font-weight: 500;"><i class="fas fa-calendar-day" style="color: var(--accent); margin-right: 8px;"></i>${formatDate(date)}</span>
            <button onclick="removeClosedDate('${date}')" style="background:none; border:none; color:#ff5252; cursor:pointer; padding: 4px;"><i class="fas fa-trash-alt"></i></button>
        </div>
    `).join('');
}

function addClosedDate() {
    const input = document.getElementById("cfg-spa-closed-date");
    const date = input.value;
    if (!date) return;

    if (!state.spaConfig.closedDates.includes(date)) {
        state.spaConfig.closedDates.push(date);
        renderClosedDates();
        input.value = "";
    } else {
        showToast("Esa fecha ya está en la lista", "warning");
    }
}

function removeClosedDate(date) {
    state.spaConfig.closedDates = state.spaConfig.closedDates.filter(d => d !== date);
    renderClosedDates();
}

// --- MASTER ITEMS ---
async function cargarMasterItems() {
    try {
        const snapshot = await db.collection("spa_item_master").orderBy("name", "asc").get();
        state.masterItems = [];
        snapshot.forEach(doc => state.masterItems.push({ id: doc.id, ...doc.data() }));
        renderMasterItems();
    } catch (err) {
        console.error("Error items maestros:", err);
    }
}

function renderMasterItems() {
    const list = document.getElementById("master-items-tbody");
    if (!list) return;

    if (state.masterItems.length === 0) {
        list.innerHTML = `<tr><td colspan="4" style="padding: 30px; text-align: center; color: #94a3b8;">No hay items configurados.</td></tr>`;
        return;
    }

    const complementoKeywords = ['benjamin', 'ramo', 'flores', 'rosella', 'vino', 'cava', 'champagne', 'agua', 'zumo', 'snack', 'aperitivo'];
    const isComplemento = (itemName) => {
        const lowerName = itemName.toLowerCase();
        return complementoKeywords.some(keyword => lowerName.includes(keyword));
    };

    list.innerHTML = state.masterItems.map(item => {
        const isComplement = isComplemento(item.name);
        return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 12px;">
                <input type="text" value="${item.name}" onchange="updateMasterItemField('${item.id}', 'name', this.value)" 
                    class="param-input" style="width:100%;">
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                ${isComplement ? '<span class="muted text-xs">N/A</span>' :
                `<input type="number" value="${item.duration || 0}" onchange="updateMasterItemField('${item.id}', 'duration', parseInt(this.value))" 
                        class="param-input" style="width: 60px; text-align: center;" min="0" max="300">`
            }
            </td>
            <td style="padding: 10px 12px;">
                ${isComplement ? '<span class="muted text-xs">N/A</span>' :
                `<select onchange="updateMasterItemField('${item.id}', 'space', this.value)" class="param-input" style="width:100%;">
                    <option value="" ${!item.space ? 'selected' : ''}>Sin asignar</option>
                    ${state.spaces.map(s => `<option value="${s.code}" ${item.space === s.code ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>`
            }
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <button onclick="deleteMasterItem('${item.id}')" class="btn-icon danger"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `}).join('');
}

async function updateMasterItemField(id, field, value) {
    try {
        await db.collection("spa_item_master").doc(id).update({
            [field]: value,
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        showToast("Error actualizando: " + err.message, "error");
    }
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
    const exists = state.masterItems.some(i => normalizeItemName(i.name) === normName);
    if (exists) {
        showToast("Este item ya existe (o uno muy similar) en el catálogo maestro", "warning");
        return;
    }

    try {
        await db.collection("spa_item_master").add({
            name: name.trim(),
            duration: 0,
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

        const existing = new Set(state.masterItems.map(i => normalizeItemName(i.name)));
        const newItems = [...allItems].filter(n => !existing.has(normalizeItemName(n)));

        if (newItems.length === 0) return showToast("Todo actualizado", "info");

        const batch = db.batch();
        newItems.forEach(name => {
            let duration = 0;
            let space = "";
            const norm = normalizeItemName(name);

            const durMatch = name.match(/(\d+)\s*['|min|m]/i);
            if (durMatch) duration = parseInt(durMatch[1]);

            if (norm === "alojamientohotel") {
                name = "Alojamiento / Hotel";
                space = "hotel";
            } else if (norm === "circuitospa") {
                space = "spa";
            } else if (name.toLowerCase().includes("masaje")) {
                space = "cabina";
            }

            const ref = db.collection("spa_item_master").doc();
            batch.set(ref, { name, duration, space, created_at: new Date().toISOString() });
        });

        await batch.commit();
        cargarMasterItems();
        showToast(`${newItems.length} items sincronizados`, "success");
    } catch (e) {
        showToast("Error sync: " + e.message, "error");
    }
}

// --- SPACES ---
async function cargarSpaces() {
    try {
        const snapshot = await db.collection("spa_spaces").orderBy("name", "asc").get();
        state.spaces = [];
        snapshot.forEach(doc => state.spaces.push({ id: doc.id, ...doc.data() }));
        renderSpaces();
        renderMasterItems(); // Refresh dropdowns
    } catch (err) {
        console.error("Error spaces:", err);
    }
}

function renderSpaces() {
    const grid = document.getElementById("spaces-grid");
    if (!grid) return;

    if (state.spaces.length === 0) {
        grid.innerHTML = `<div class="muted" style="grid-column:1/-1; text-align:center; padding:30px;">No hay salas. Crea la primera.</div>`;
        return;
    }

    const typeLabels = { 'private': 'Privada', 'circuit': 'Circuito', 'service': 'Servicios', 'other': 'Otro' };

    grid.innerHTML = state.spaces.map(s => `
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
        const s = state.spaces.find(x => x.id === id);
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
        state.complementos = [];
        snapshot.forEach(doc => state.complementos.push({ id: doc.id, ...doc.data() }));
        renderComplementos();
    } catch (err) {
        console.error("Error complementos:", err);
    }
}

function renderComplementos() {
    const list = document.getElementById("complementos-tbody");
    if (!list) return;

    if (state.complementos.length === 0) {
        list.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;" class="muted">No hay complementos.</td></tr>`;
        return;
    }

    list.innerHTML = state.complementos.map(c => `
        <tr style="opacity: ${c.active === false ? 0.5 : 1};">
            <td style="font-weight: 500;">${c.nombre}</td>
            <td><span class="badge badge-outline">${c.categoria || 'Var'}</span></td>
            <td style="text-align: center; font-weight: bold;">${parseFloat(c.precio).toFixed(2)} €</td>
            <td style="text-align: center;">${c.active !== false ? '<span style="color:var(--success)">Activo</span>' : '<span style="color:var(--text-muted)">Inactivo</span>'}</td>
            <td style="text-align: center;">
                <button onclick="openComplementoModal('${c.id}')" class="btn-icon"><i class="fas fa-edit"></i></button>
                <button onclick="deleteComplemento('${c.id}')" class="btn-icon danger"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');
}

function openComplementoModal(id = null) {
    document.getElementById("complemento-form").reset();
    document.getElementById("complemento-id").value = "";
    document.getElementById("complemento-modal-title").textContent = "Nuevo Complemento";

    if (id) {
        const c = state.complementos.find(x => x.id === id);
        if (c) {
            document.getElementById("complemento-modal-title").textContent = "Editar Complemento";
            document.getElementById("complemento-id").value = c.id;
            document.getElementById("complemento-name").value = c.nombre;
            document.getElementById("complemento-category").value = c.categoria || 'complemento';
            document.getElementById("complemento-price").value = c.precio;
            document.getElementById("complemento-enabled").value = c.active !== false ? "true" : "false";
        }
    }
    document.getElementById("complemento-modal").style.display = "flex";
}

function closeComplementoModal() {
    document.getElementById("complemento-modal").style.display = "none";
}

async function saveComplemento(e) {
    e.preventDefault();
    const id = document.getElementById("complemento-id").value;
    const data = {
        nombre: document.getElementById("complemento-name").value.trim(),
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
