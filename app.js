const URL_BONOS = "https://cumbriabienestar.es/wp-json/bonos/v1/listado/";
const ENDPOINT_BONOS = `https://api.allorigins.win/get?url=${encodeURIComponent(URL_BONOS)}`;

const state = {
    currentView: 'dashboard',
    bonos: [],
    circuitos: [],
    tratamientos: [],
    citas: [],
    spaConfig: {
        capacity: 20,
        closedDates: [],
        blockedSlots: {} // Estructura: { 'YYYY-MM-DD': ['10:00', '13:30'] }
    }
};

// Selectores
const views = {
    dashboard: document.getElementById("dashboard-view"),
    vouchers: document.getElementById("vouchers-view"),
    config: document.getElementById("config-view")
};
const syncBtn = document.getElementById("sync-vouchers-btn");
// ... (rest of code) ...

// --- CATÁLOGO ---
async function cargarCatalogoFirestore() {
    try {
        const snapshot = await db.collection("spa_services").where("active", "==", true).get();
        const servicios = [];
        snapshot.forEach(doc => servicios.push({ id: doc.id, ...doc.data() }));

        // Separar por categorías
        state.circuitos = servicios.filter(s =>
            ['circuito', 'bono_circuito', 'pack_pareja', 'suite_privada', 'pack_hotel', 'pack_comida'].includes(s.categoria)
        );
        state.tratamientos = servicios.filter(s =>
            ['masaje', 'facial', 'corporal', 'ritual', 'envoltura', 'uva', 'complemento'].includes(s.categoria)
        );

        console.log("Catálogo cargado:", servicios.length, "servicios.");
    } catch (err) {
        console.error("Error cargando catálogo:", err);
    }
}
const title = document.getElementById("view-title");
const currDateEl = document.getElementById("current-date");
const bookingModal = document.getElementById("booking-modal");
const bookingForm = document.getElementById("booking-form");

document.addEventListener("DOMContentLoaded", () => {
    init();
});

function init() {
    setupNavigation();
    updateDate();

    // Set Default Filter Date to Today
    const dateInput = document.getElementById("voucher-date");
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    cargarCitasHoy();
    setupEventListeners();
    cargarCatalogoFirestore();
    cargarSpaConfig();
}

async function cargarSpaConfig() {
    try {
        const doc = await db.collection("spa_config").doc("settings").get();
        if (doc.exists) {
            state.spaConfig = { ...state.spaConfig, ...doc.data() };
            // Actualizar UI
            document.getElementById("cfg-spa-capacity").value = state.spaConfig.capacity;
            renderClosedDates();
        }
    } catch (err) {
        console.error("Error cargando spa_config:", err);
    }
}

function renderClosedDates() {
    const list = document.getElementById("cfg-closed-dates-list");
    if (!list) return;

    if (state.spaConfig.closedDates.length === 0) {
        list.innerHTML = `<div class="muted" style="padding: 5px; text-align: center;">No hay días de cierre configurados</div>`;
        return;
    }

    // Ordenar fechas
    state.spaConfig.closedDates.sort();

    list.innerHTML = state.spaConfig.closedDates.map(date => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>${formatDateES(date)}</span>
            <button onclick="removeClosedDate('${date}')" style="background:none; border:none; color:#ff5252; cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
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
        alert("Esa fecha ya está en la lista.");
    }
}

function removeClosedDate(date) {
    state.spaConfig.closedDates = state.spaConfig.closedDates.filter(d => d !== date);
    renderClosedDates();
}

async function saveSpaSettings() {
    const capacity = parseInt(document.getElementById("cfg-spa-capacity").value);
    if (isNaN(capacity) || capacity < 1) {
        alert("Por favor, introduce una capacidad válida.");
        return;
    }

    state.spaConfig.capacity = capacity;

    try {
        // Enviar todo el objeto spaConfig que incluye closedDates y blockedSlots
        await db.collection("spa_config").doc("settings").set(state.spaConfig);
        alert("Configuración de Spa guardada correctamente.");
    } catch (err) {
        console.error("Error guardando settings:", err);
        alert("Error al guardar configuración: " + err.message);
    }
}

async function cargarCitasHoy() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection("reservas_spa")
            .where("fecha", "==", today)
            .get();

        state.citas = [];
        snapshot.forEach(doc => state.citas.push({ id: doc.id, ...doc.data() }));

        // Ordenar por hora
        state.citas.sort((a, b) => a.hora.localeCompare(b.hora));

        renderDashboard();
        actualizarStatsInicio();
    } catch (err) {
        console.error("Error cargando citas:", err);
    }
}

function actualizarStatsInicio() {
    // 1. VENTAS HOY
    const confirmedCitas = state.citas.filter(c => c.status === 'confirmada');
    const totalSales = confirmedCitas.reduce((sum, c) => sum + (parseFloat(c.precio_total) || 0), 0);
    const salesEl = document.getElementById("stat-sales");
    if (salesEl) salesEl.textContent = `${totalSales.toFixed(2)} €`;

    // 2. OCUPACION (Solo Circuito Spa Base)
    // Filtramos para que Suite, Peluquería, etc. no inflen el aforo del circuito general
    const circuitReservations = confirmedCitas.filter(c => {
        const s = (c.servicio || "").toLowerCase();
        // Incluir: "circuito spa", "bono circuito", "pack pareja" (generalmente usan circuito)
        // Excluir: "suite", "panacea", "vip", "peluquería", "masaje" (si va suelto)
        if (s.includes("suite") || s.includes("panacea") || s.includes("vip") || s.includes("peluquería")) return false;
        return true; // Por defecto asumimos que es circuito si no es uno de los módulos especiales
    });

    const totalPax = circuitReservations.reduce((sum, c) => sum + (parseInt(c.pax) || 0), 0);
    const capacity = state.spaConfig.capacity || 20;

    // Calcular turnos según día (L-S: 9, D: 4)
    const day = new Date().getDay();
    const turnosHoy = (day === 0) ? 4 : 9;

    const totalPlazas = capacity * turnosHoy;
    const occPercentage = totalPlazas > 0 ? Math.round((totalPax / totalPlazas) * 100) : 0;

    const occEl = document.getElementById("stat-occ");
    if (occEl) occEl.textContent = `${occPercentage}%`;

    // 3. BONOS PENDIENTES
    actualizarContadorPendientes();
}

function setupEventListeners() {
    // Sincronizar
    syncBtn.addEventListener("click", cargarBonos);

    // Ir a Configuración
    const cfgBtn = document.getElementById("config-btn");
    if (cfgBtn) {
        cfgBtn.addEventListener("click", () => switchView('config'));
    }

    // Cerrar Modal
    document.querySelector(".close-modal").addEventListener("click", closeModal);

    // Guardar Cita
    bookingForm.addEventListener("submit", handleNewBooking);

    // Búsqueda en tiempo real
    const searchInput = document.getElementById("params-search");
    if (searchInput) {
        searchInput.addEventListener("input", renderBonosFromState);
    }

    // Guardar gestión de bono
    const vForm = document.getElementById("voucher-form");
    if (vForm) {
        vForm.addEventListener("submit", saveVoucherChanges);

        // Listeners para actualizar balance visual
        const usedInput = document.getElementById("vm-sesiones-usadas");
        const totalInput = document.getElementById("vm-sesiones-totales");
        if (usedInput) usedInput.addEventListener("input", updateVoucherBalanceUI);
        if (totalInput) totalInput.addEventListener("input", updateVoucherBalanceUI);
    }

    // Guardar gestión de servicio
    const sForm = document.getElementById("service-form");
    if (sForm) sForm.addEventListener("submit", saveServiceChanges);

    // Guardar Venta Local
    const lvmForm = document.getElementById("local-voucher-form");
    if (lvmForm) lvmForm.addEventListener("submit", handleLocalVoucherSubmit);

    // Auto-precio en Venta Local
    const lvmProdInput = document.getElementById("lvm-producto");
    if (lvmProdInput) {
        lvmProdInput.addEventListener("input", (e) => {
            const val = e.target.value;
            const allServices = [...state.circuitos, ...state.tratamientos];
            const match = allServices.find(s => s.nombre === val);
            if (match) {
                // Limpiar precio: quitar símbolo € y otros caracteres, normalizar coma a punto
                const cleanPrice = String(match.precio).replace(/[^\d.,]/g, '').replace(',', '.');
                document.getElementById("lvm-precio").value = parseFloat(cleanPrice) || "";
            }
        });
    }
}

function setupNavigation() {
    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", e => {
            const viewKey = link.dataset.view;
            if (viewKey) {
                e.preventDefault();
                switchView(viewKey);

                document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
                link.classList.add("active");
            }
            // Si no hay viewKey, es un enlace real (ej: reservas.html) y se permite la navegación nativa
        });
    });
}

function switchView(key) {
    state.currentView = key;

    // Ocultar todas
    Object.values(views).forEach(v => { if (v) v.style.display = "none"; });

    const titleMap = {
        dashboard: "Zenith Dashboard",
        vouchers: "Bonos Zenith",
        config: "Configuración"
    };

    title.textContent = titleMap[key] || "Zenith Manager";

    // Mostrar específica
    if (views[key]) views[key].style.display = "block";

    // Acciones específicas
    const cfgBtn = document.getElementById("config-btn");

    // Botón Sincronizar solo en Bonos
    syncBtn.style.display = (key === 'vouchers') ? "inline-flex" : "none";

    // Botón Configuración solo en Dashboard
    if (cfgBtn) {
        cfgBtn.style.display = (key === 'dashboard') ? "inline-flex" : "none";
    }

    if (key === 'vouchers') cargarBonos();
}

/** MODALS **/
function openModal() {
    const select = document.getElementById("m-servicio");
    const options = [
        ...state.circuitos.map(c => `<option value="${c.nombre}">${c.nombre}</option>`),
        ...state.tratamientos.map(t => `<option value="${t.nombre}">${t.nombre}</option>`)
    ];
    select.innerHTML = options.join('');
    bookingModal.style.display = "flex";
}

function closeModal() {
    bookingModal.style.display = "none";
}

async function handleNewBooking(e) {
    e.preventDefault();
    const btn = e.target.querySelector("button[type='submit']");
    const originalText = btn.innerHTML;

    // Extraer datos
    const clienteStr = document.getElementById("m-cliente").value;
    const servicio = document.getElementById("m-servicio").value;
    const hora = document.getElementById("m-hora").value;
    const today = new Date().toISOString().split('T')[0];

    const nueva = {
        res_id: 'RS-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        fecha: today,
        hora: hora,
        nombre: clienteStr,
        servicio: servicio,
        status: 'confirmada',
        pax: 1, // Default por simplicidad en dashboard
        origen: 'particular',
        created_at: new Date().toISOString()
    };

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        // Guardar Reserva
        await db.collection("reservas_spa").add(nueva);

        alert("Cita confirmada correctamente.");
        await cargarCitasHoy();
        closeModal();
        bookingForm.reset();

    } catch (err) {
        console.error("Error al guardar reserva:", err);
        alert("Error al guardar: " + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- CATÁLOGO ---
async function cargarCatalogoFirestore() {
    try {
        const snapshot = await db.collection("spa_services").where("active", "==", true).get();
        const servicios = [];
        snapshot.forEach(doc => servicios.push({ id: doc.id, ...doc.data() }));

        // Separar por categorías
        state.circuitos = servicios.filter(s => s.categoria === 'circuito' || s.categoria === 'bono_circuito' || s.categoria === 'pack_pareja' || s.categoria === 'suite_privada');
        state.tratamientos = servicios.filter(s =>
            ['masaje', 'facial', 'corporal', 'ritual', 'envoltura', 'uva', 'complemento',
                'bono_masaje', 'bono_facial', 'bono_corporal',
                'depilacion', 'depilacion_pack', 'depilacion_cera',
                'maquillaje', 'manicura', 'peluqueria'].includes(s.categoria)
        );

        console.log("Catálogo cargado:", servicios.length, "servicios.");
    } catch (err) {
        console.error("Error cargando catálogo:", err);
    }
}

/** DASHBOARD **/
function renderDashboard() {
    const tbody = document.getElementById("dashboard-table-body");
    if (!tbody) return;

    const searchTerm = document.getElementById("dashboard-search")?.value.toLowerCase() || "";

    // Obtener hora actual en formato HH:mm
    const now = new Date();
    const currentHourStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const filteredCitas = state.citas.filter(c => {
        const nombre = (c.nombre || c.cliente || "").toLowerCase();
        // Filtro 1: Nombre
        const matchesName = nombre.includes(searchTerm);

        // Filtro 2: Hora (Solo futuras o actuales)
        // Comparación de cadenas "HH:mm" funciona bien para orden cronológico (24h)
        const isFuture = c.hora >= currentHourStr;

        return matchesName && isFuture;
    });

    if (filteredCitas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="muted">${searchTerm ? 'No se encontraron clientes' : 'No hay más citas próximas hoy'}</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredCitas.map(c => `
        <tr>
            <td>${c.hora}</td>
            <td><div style="font-weight:600;">${c.nombre || c.cliente}</div></td>
            <td>${c.servicio || '<span class="muted">Circuito Spa</span>'}</td>
            <td><span class="st-badge st-${c.status === 'confirmada' ? 'completed' : (c.status === 'anulada' ? 'expired' : 'pending')}">${c.status === 'confirmada' ? 'Confirmada' : (c.status === 'anulada' ? 'Anulada' : 'Pendiente')}</span></td>
            <td>
                <button class="btn btn-outline" onclick="verDetalleCita('${c.id}')" style="padding: 5px 10px; border-radius: 50%; color: var(--accent); border-color: var(--accent);" title="Ver Detalles">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function verDetalleCita(id) {
    const cita = state.citas.find(c => c.id === id);
    if (!cita) return;

    // Reutilizamos el modal de reservas pero en modo lectura (o simple alert si preferimos rápido)
    // Para una mejor UX, vamos a mostrar un SweetAlert si disponible o un alert formateado, 
    // o mejor aun, rellenamos el modal existente en modo solo lectura.
    // Dado que el usuario pidió "un icono para visualizar", un simple alert formateado puede ser suficiente por ahora
    // para no complicar con otro modal, o podemos usar el modal de "Nueva Cita" adaptado.

    // Vamos a usar una alerta informativa simple y bonita
    const info = `
        Cliente: ${cita.nombre || cita.cliente}
        Hora: ${cita.hora}
        Servicio: ${cita.servicio || "Circuito Spa"}
        Pax: ${cita.pax || 2}
        Teléfono: ${cita.telefono || cita.tel || "No registrado"}
        Importe: ${cita.total || cita.imp || "0"} €
        Obs: ${cita.observaciones || cita.obs || "-"}
    `;
    alert("DETALLES DE LA RESERVA:\n" + info);
}

/** BONOS **/
async function cargarBonos() {
    const tableBody = document.getElementById("vouchers-table-body");

    // Feedback visual inmediato en el botón
    const btn = document.getElementById("sync-vouchers-btn");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sincronizando...';
    btn.disabled = true;
    btn.style.opacity = "0.7";

    // Si ya tenemos bonos en el state, mostramos lo que hay mientras carga
    if (state.bonos.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="muted">Cargando bonos...</td></tr>`;
    }

    let persistentData = {};

    try {
        // 1. CARGA INMEDIATA DESDE FIRESTORE (Datos locales + Cache previas)
        const snapshot = await db.collection("spa_vouchers").get();
        snapshot.forEach(doc => persistentData[doc.id] = doc.data());

        // Mostrar lo que tenemos en Firestore de inmediato
        state.bonos = Object.values(persistentData).map(p => ({
            ...p,
            importe: p.importe || p.precio
        }));
        state.bonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        renderBonosFromState();
        actualizarContadorPendientes();

        // 2. SINCRONIZACIÓN EN SEGUNDO PLANO (WooCommerce)
        // Pasamos el botón para restaurarlo al finalizar
        sincronizarConTienda(persistentData, btn, originalText);

    } catch (err) {
        console.error("Error al cargar base de datos:", err);
        if (state.bonos.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="error">Error local: ${err.message}</td></tr>`;
        }
        // Restaurar botón si falla la carga local
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.opacity = "1";
        showToast("Error al cargar la base de datos local", "error");
    }
}

async function sincronizarConTienda(persistentData, btn, originalText) {
    console.log("Iniciando sincronización con tienda en segundo plano...");
    try {
        const res = await fetch(ENDPOINT_BONOS);

        if (!res.ok) throw new Error("No se pudo conectar con la tienda");

        const dataProxy = await res.json();

        if (!dataProxy.contents) {
            console.warn("Respuesta vacía del proxy");
            throw new Error("Respuesta vacía del servidor");
        }

        const shopVouchers = JSON.parse(dataProxy.contents);

        // Log de depuración
        console.log(`Recibidos ${shopVouchers.length} bonos de la tienda.`);

        const batch = db.batch();
        let operationsCount = 0;
        let newVouchersCount = 0;

        const webVouchers = shopVouchers.map(b => {
            const persisted = persistentData[b.bono];
            let finalState = 'pending';

            if (persisted) {
                const isManuallyManaged = persisted.notas_internas || persisted.fecha_validez || persisted.manual_update;
                finalState = isManuallyManaged ? persisted.estado : 'pending';
            } else {
                const docRef = db.collection("spa_vouchers").doc(b.bono);
                batch.set(docRef, { ...b, estado: 'pending', synced_at: new Date().toISOString() });
                operationsCount++;
                newVouchersCount++;
            }
            return { ...b, ...persisted, estado: finalState, precio: b.precio || b.importe };
        });

        // Combinar de nuevo
        const webCodes = shopVouchers.map(x => x.bono);
        const localVouchers = Object.values(persistentData)
            .filter(p => !webCodes.includes(p.bono))
            .map(p => ({ ...p, importe: p.importe || p.precio }));

        state.bonos = [...webVouchers, ...localVouchers];
        state.bonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        if (operationsCount > 0) await batch.commit();

        console.log("Sincronización de fondo completada.");
        renderBonosFromState();
        actualizarContadorPendientes();

        showToast(newVouchersCount > 0
            ? `Sincronización Completada: ${newVouchersCount} bonos nuevos.`
            : "Sincronización Completada: Todo actualizado.", "success");

    } catch (err) {
        console.warn("Sincronización de fondo fallida:", err);
        showToast("No se pudo sincronizar con la tienda. Verificando caché local...", "error");
    } finally {
        // Siempre restaurar el botón
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    }
}

// Utilidad para Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

function actualizarContadorPendientes() {
    const pendingCount = state.bonos.filter(x => !checkVoucherExpiry(x.fecha) && x.estado !== 'completed').length;
    const pendingEl = document.getElementById("stat-pending");
    if (pendingEl) pendingEl.textContent = pendingCount;
}

function renderBonosFromState() {
    const tableBody = document.getElementById("vouchers-table-body");
    const searchInput = document.getElementById("params-search");
    const totalCounter = document.getElementById("total-bonos-count");

    if (!tableBody) return;

    const tbody = document.getElementById("vouchers-table-body");
    if (!tbody) return;

    const searchTerm = document.getElementById("voucher-search") ? document.getElementById("voucher-search").value.toLowerCase() : "";
    const filterStatus = document.getElementById("voucher-filter") ? document.getElementById("voucher-filter").value : 'all';

    // Filtro Fecha
    const dateInput = document.getElementById("voucher-date");
    const filterDate = dateInput ? dateInput.value : ""; // YYYY-MM-DD

    const filtered = state.bonos.filter(b => {
        // Filtro Texto
        const matchesSearch = b.bono.toLowerCase().includes(searchTerm) ||
            b.email.toLowerCase().includes(searchTerm) ||
            b.producto.toLowerCase().includes(searchTerm);

        // Filtro Fecha (si hay fecha seleccionada)
        let matchesDate = true;
        if (filterDate) {
            // b.fecha suele ser "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DD"
            const bonoDate = b.fecha.split(' ')[0];
            matchesDate = (bonoDate === filterDate);
        }

        // Filtro Estado
        let matchesStatus = true;
        if (filterStatus !== 'all') {
            if (filterStatus === 'expired') {
                matchesStatus = (b.estado === 'expired') || (b.estado === 'pending' && checkVoucherExpiry(b.fecha));
            } else if (filterStatus === 'pending') {
                matchesStatus = (b.estado === 'pending') && !checkVoucherExpiry(b.fecha);
            } else {
                matchesStatus = (b.estado === filterStatus);
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    const countSpan = document.getElementById("voucher-count");
    if (countSpan) countSpan.textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron bonos.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        let badgeClass = 'st-pending';
        let statusLabel = 'ACTIVO';

        if (b.estado === 'completed') {
            badgeClass = 'st-completed';
            statusLabel = 'CANJEADO';
        }
        else if (b.estado === 'expired') {
            badgeClass = 'st-expired';
            statusLabel = 'CADUCADO';
        }
        else if (b.estado === 'partially') {
            badgeClass = 'st-partial';
            statusLabel = `PARCIAL ${b.sesiones_usadas || 0}/${b.sesiones_totales || 1}`;
        }

        if (b.estado === 'pending' && checkVoucherExpiry(b.fecha)) {
            badgeClass = 'st-expired';
            statusLabel = 'CADUCADO (Auto)';
        }

        return `
        <tr>
            <td style="font-weight:600">${b.bono}</td>
            <td>${b.producto}</td>
            <td>${b.email}</td>
            <td>${formatDateES(b.fecha)}</td>
            <td style="font-weight:bold">${b.importe}€</td>
            <td><span class="st-badge ${badgeClass}">${statusLabel}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="openVoucherManagement('${b.bono}')">
                    <i class="fas fa-cog"></i> Gestionar
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function resetFilters() {
    const searchInput = document.getElementById("voucher-search");
    const dateInput = document.getElementById("voucher-date");
    const filterSelect = document.getElementById("voucher-filter");

    if (searchInput) searchInput.value = "";
    if (dateInput) dateInput.value = ""; // Limpiar fecha
    if (filterSelect) filterSelect.value = "all";

    renderBonosFromState();
}

/** GESTIÓN DE BONOS (FIREBASE) **/
const voucherModal = document.getElementById("voucher-modal");

function openVoucherManagement(code) {
    const voucher = state.bonos.find(b => b.bono === code);
    if (!voucher) return;

    // Rellenar formulario
    document.getElementById("vm-title-code").textContent = code;
    document.getElementById("vm-code").value = code;
    const clientName = voucher.cliente || (voucher.email && voucher.email.split('@')[0]) || "Cliente";
    document.getElementById("vm-cliente").value = clientName;
    document.getElementById("vm-email").value = voucher.email || "";
    document.getElementById("vm-producto").value = voucher.producto;

    // Fechas
    document.getElementById("vm-fecha-compra").value = voucher.fecha;

    // Calcular validez
    let valDate = "";
    if (voucher.fecha_validez) {
        valDate = voucher.fecha_validez;
    } else {
        const d = new Date(voucher.fecha);
        d.setFullYear(d.getFullYear() + 1);
        valDate = d.toISOString().split('T')[0];
    }
    document.getElementById("vm-fecha-validez").value = valDate;

    // Sesiones y Pax
    const used = voucher.sesiones_usadas || 0;
    let total = voucher.sesiones_totales;
    let paxPerSession = voucher.pax_por_sesion || 1;

    // Auto-detección si no tiene totales guardados
    if (!total) {
        const detected = detectSessions(voucher.producto);
        total = detected.total;
        paxPerSession = detected.paxPerSession;
    }

    // Guardar en ocultos para salvar luego
    document.getElementById("vm-sesiones-usadas").value = used;
    document.getElementById("vm-sesiones-totales").value = total;
    document.getElementById("vm-pax-por-sesion").value = paxPerSession;

    // Actualizar labels informativos
    const packLabel = document.getElementById("vm-info-pack");
    if (packLabel) {
        packLabel.textContent = `${total} Sesiones ${paxPerSession === 2 ? 'Dobles (Pareja)' : 'Individuales'}`;
    }

    updateVoucherBalanceUI();

    document.getElementById("vm-estado").value = checkVoucherExpiry(voucher.fecha) ? 'expired' : voucher.estado;
    document.getElementById("vm-notas").value = voucher.notas_internas || "";

    // Cargar historial de reservas
    loadVoucherHistory(code);

    // Configurar botón reservar
    const btnRes = document.getElementById("vm-btn-reservar");
    btnRes.onclick = () => {
        const bookingData = {
            bono: code,
            cliente: clientName,
            producto: voucher.producto,
            pax_por_sesion: paxPerSession,
            sesiones_restantes: (total - used)
        };
        sessionStorage.setItem('pendingVoucherBooking', JSON.stringify(bookingData));
        window.location.href = 'reservas.html';
    };

    voucherModal.style.display = "flex";
}

async function loadVoucherHistory(code) {
    const historySection = document.getElementById("vm-booking-history");
    if (!historySection) return;

    try {
        const snapshot = await db.collection("reservas_spa")
            .where("bono", "==", code)
            .get();

        if (snapshot.empty) {
            historySection.innerHTML = '<div style="text-align:center; padding:10px; color:#999; font-style:italic;">No hay reservas registradas para este bono.</div>';
            return;
        }

        let bookings = [];
        snapshot.forEach(doc => bookings.push({ id: doc.id, ...doc.data() }));

        // Ordenar por fecha desc en memoria para evitar error de índice
        bookings.sort((a, b) => b.fecha.localeCompare(a.fecha));

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        bookings.forEach(res => {
            const dateStr = new Date(res.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
            const statusClass = res.status === 'confirmada' ? 'st-completed' : 'st-pending';
            const statusLabel = res.status === 'confirmada' ? 'OK' : 'ANULADA';

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #fff; border: 1px solid #f0f0f0; border-radius: 6px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="font-weight: 700; color: #333;">${dateStr}</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;">${res.hora}h</span>
                        <span style="font-weight: 600; color: var(--accent);">${res.pax} pax</span>
                        <span style="color: #999; font-size: 0.7rem;">(${res.sesiones_consumidas || 1} ses.)</span>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="st-badge ${statusClass}" style="font-size: 0.6rem; padding: 2px 6px;">${statusLabel}</span>
                        <a href="reservas.html?date=${res.fecha}&res_id=${res.id}" class="btn-icon-sm" title="Ver en Reservas" style="color: var(--accent); font-size: 0.8rem;">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        historySection.innerHTML = html;

    } catch (err) {
        console.error("Error cargando historial de bono:", err);
        historySection.innerHTML = '<div style="color: #f44336; padding:10px;">Error al cargar historial.</div>';
    }
}

function detectSessions(productName) {
    const name = productName.toLowerCase();
    let total = 1;
    let paxPerSession = 1;

    // Detectar número de sesiones
    const sessionMatch = name.match(/(\d+)\s*(sesiones|circuitos|masajes|tratamientos)/i);
    if (sessionMatch) {
        total = parseInt(sessionMatch[1]);
    } else if (name.includes("diez") || name.includes("10")) {
        total = 10;
    } else if (name.includes("cinco") || name.includes("5")) {
        total = 5;
    }

    // Detectar si es para pareja
    if (name.includes("pareja") || name.includes("duo") || name.includes(" 2 ") || name.includes("dos")) {
        paxPerSession = 2;
    }

    return { total, paxPerSession };
}

function updateVoucherBalanceUI() {
    const used = parseInt(document.getElementById("vm-sesiones-usadas").value) || 0;
    const total = parseInt(document.getElementById("vm-sesiones-totales").value) || 1;
    const saldo = total - used;

    const saldoEl = document.getElementById("vm-saldo-text");
    if (saldoEl) {
        saldoEl.textContent = Math.max(0, saldo);
        saldoEl.style.color = saldo <= 0 ? "#ff5252" : "var(--accent)";
    }

    const consumoLabel = document.getElementById("vm-info-consumo");
    if (consumoLabel) {
        consumoLabel.textContent = `${used} de ${total}`;
    }

    const progressText = document.getElementById("vm-progress-text");
    const progressBadge = document.getElementById("vm-progress-badge");
    const statusSelect = document.getElementById("vm-estado");
    const btnRes = document.getElementById("vm-btn-reservar");

    // Siempre bloquear el estado en bonos multi-sesión (la gestión es automática)
    if (statusSelect) {
        statusSelect.disabled = true;
        statusSelect.style.background = "#f5f5f5";
    }

    if (progressText) {
        const percent = Math.min(Math.round((used / total) * 100), 100);
        progressText.textContent = percent + "%";

        if (progressBadge) {
            if (percent >= 100) {
                progressBadge.style.background = "#ff5252";
                progressBadge.style.color = "white";
                progressBadge.style.borderColor = "#ff5252";
                if (statusSelect) statusSelect.value = 'completed';

                // Desactivar botón de reserva si no queda saldo
                if (btnRes) {
                    btnRes.style.opacity = "0.5";
                    btnRes.style.pointerEvents = "none";
                    btnRes.innerHTML = '<i class="fas fa-ban"></i> Sin saldo';
                }
            } else {
                progressBadge.style.background = "rgba(212, 175, 55, 0.1)";
                progressBadge.style.color = "var(--accent)";
                progressBadge.style.borderColor = "var(--accent)";

                // Lógica de estado determinista
                if (statusSelect) {
                    if (used > 0) statusSelect.value = 'partially';
                    else statusSelect.value = 'pending';
                }

                // Activar botón de reserva si queda saldo
                if (btnRes) {
                    btnRes.style.opacity = "1";
                    btnRes.style.pointerEvents = "auto";
                    btnRes.innerHTML = '<i class="fas fa-calendar-plus"></i> Reservar Cita';
                }
            }
        }
    }
}

function closeVoucherModal() {
    voucherModal.style.display = "none";
}

async function saveVoucherChanges(e) {
    e.preventDefault();
    const code = document.getElementById("vm-code").value;
    const newStatus = document.getElementById("vm-estado").value;
    const notes = document.getElementById("vm-notas").value;
    const validUntil = document.getElementById("vm-fecha-validez").value;

    const used = parseInt(document.getElementById("vm-sesiones-usadas").value);
    const total = parseInt(document.getElementById("vm-sesiones-totales").value);
    const paxPerSession = parseInt(document.getElementById("vm-pax-por-sesion").value);

    const btn = e.target.querySelector("button[type='submit']");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const payload = {
            estado: newStatus,
            notas_internas: notes,
            fecha_validez: validUntil,
            sesiones_usadas: used,
            sesiones_totales: total,
            pax_por_sesion: paxPerSession,
            last_updated: new Date().toISOString(),
            manual_update: true
        };

        // Forzar estado correcto según consumo (Lógica Determinista)
        if (used >= total) {
            payload.estado = 'completed';
        } else if (used > 0) {
            payload.estado = 'partially';
        } else {
            // Solo resetemos a pending si no es expired
            if (newStatus !== 'expired') payload.estado = 'pending';
        }

        await db.collection("spa_vouchers").doc(code).set(payload, { merge: true });

        // Actualizar localmente
        const voucher = state.bonos.find(b => b.bono === code);
        if (voucher) {
            Object.assign(voucher, payload);
        }

        updateVoucherBalanceUI(); // Sincronizar UI del modal antes de cerrar o renderizar lista
        renderBonosFromState();
        closeVoucherModal();
        alert("Bono actualizado correctamente.");
    } catch (err) {
        console.error("Error guardando bono:", err);
        alert("Error al guardar: " + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/** NUVEA VENTA LOCAL **/
const localVoucherModal = document.getElementById("local-voucher-modal");

function openLocalVoucherModal() {
    // Reset form
    document.getElementById("local-voucher-form").reset();

    // Set default date to today
    document.getElementById("lvm-fecha").value = new Date().toISOString().split('T')[0];

    // Populate services datalist
    const dataList = document.getElementById("services-list");
    if (dataList) {
        const allServices = [...state.circuitos, ...state.tratamientos];
        dataList.innerHTML = allServices.map(s => `<option value="${s.nombre}">`).join('');
    }

    localVoucherModal.style.display = 'flex';
}

function closeLocalVoucherModal() {
    localVoucherModal.style.display = 'none';
}

async function handleLocalVoucherSubmit(e) {
    e.preventDefault();

    const num = document.getElementById("lvm-num").value;
    const cliente = document.getElementById("lvm-cliente").value;
    const email = document.getElementById("lvm-email").value;
    const producto = document.getElementById("lvm-producto").value;
    const precio = parseFloat(document.getElementById("lvm-precio").value);
    const fecha = document.getElementById("lvm-fecha").value; // YYYY-MM-DD
    const notas = document.getElementById("lvm-notas").value;

    if (!num) return alert("Debes indicar un número de bono.");

    const fullCode = `BM-${num}`;

    // 1. Validar unicidad (Local check first for speed)
    const exists = state.bonos.some(b => b.bono === fullCode);
    if (exists) {
        return alert(`El bono ${fullCode} YA EXISTE. Por favor revisa el número.`);
    }

    const btn = e.target.querySelector("button[type='submit']");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    btn.disabled = true;

    try {
        // Double check in Firestore to be sure
        const docRef = db.collection("spa_vouchers").doc(fullCode);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            throw new Error(`El bono ${fullCode} ya existe en la base de datos.`);
        }

        const sessionData = detectSessions(producto);

        const newVoucher = {
            bono: fullCode,
            cliente: cliente,
            email: email || "vendedor_local@cumbriabienestar.es",
            producto: producto,
            importe: precio,
            precio: precio,
            fecha: fecha, // Guardamos solo YYYY-MM-DD para compatibilidad absoluta con filtros
            estado: 'pending',
            origen: 'local_manual',
            notas_internas: notas,
            sesiones_usadas: 0,
            sesiones_totales: sessionData.total,
            pax_por_sesion: sessionData.paxPerSession,
            created_at: new Date().toISOString(),
            manual_update: true
        };

        console.log("Intentando guardar bono local:", newVoucher);
        await docRef.set(newVoucher);
        console.log("Bono guardado en Firestore con éxito");

        // Update local state and UI
        state.bonos.unshift(newVoucher); // Add to beginning
        renderBonosFromState();

        closeLocalVoucherModal();
        alert(`Bono LOCAL ${fullCode} creado correctamente.`);

    } catch (err) {
        console.error("Error creando bono local:", err);
        alert(err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function checkVoucherExpiry(dateStr) {
    if (!dateStr) return false;
    const voucherDate = new Date(dateStr);
    const oneYearLater = new Date(voucherDate);
    oneYearLater.setFullYear(voucherDate.getFullYear() + 1);
    return new Date() > oneYearLater;
}




/** UTILS **/
function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const now = new Date();
    // Capitalizar primera letra
    const dateStr = now.toLocaleDateString('es-ES', options);
    currDateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

function formatDateES(dateString) {
    if (!dateString) return "";
    const dateParts = dateString.split(' ')[0].split('-'); // Asume YYYY-MM-DD
    if (dateParts.length === 3) {
        return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    }
    return dateString;
}
