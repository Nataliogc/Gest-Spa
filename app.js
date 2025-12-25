const URL_BONOS = "https://cumbriabienestar.es/wp-json/bonos/v1/listado/";
const ENDPOINT_BONOS = `https://api.allorigins.win/get?url=${encodeURIComponent(URL_BONOS)}`;

const state = {
    currentView: 'dashboard',
    bonos: [],
    circuitos: [],
    tratamientos: [],
    citas: [
        { hora: '10:00', cliente: 'Ana García', servicio: 'Circuito 90\'', estado: 'pending' },
        { hora: '11:30', cliente: 'Marc Soler', servicio: 'Masaje Oro', estado: 'completed' }
    ]
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

    renderDashboard();
    setupEventListeners();
    cargarCatalogoFirestore();
}

function setupEventListeners() {
    // Sincronizar
    syncBtn.addEventListener("click", cargarBonos);

    // Abrir Modal
    document.getElementById("new-booking-btn").addEventListener("click", openModal);

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
    if (vForm) vForm.addEventListener("submit", saveVoucherChanges);

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
    syncBtn.style.display = (key === 'vouchers') ? "inline-flex" : "none";

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

function handleNewBooking(e) {
    e.preventDefault();
    const nueva = {
        hora: document.getElementById("m-hora").value,
        cliente: document.getElementById("m-cliente").value,
        servicio: document.getElementById("m-servicio").value,
        estado: 'pending'
    };

    state.citas.push(nueva);
    renderDashboard();
    closeModal();
    bookingForm.reset();
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

    tbody.innerHTML = state.citas.map(c => `
        <tr>
            <td>${c.hora}</td>
            <td>${c.cliente}</td>
            <td>${c.servicio}</td>
            <td><span class="st-badge st-${c.estado}">${c.estado === 'pending' ? 'Pendiente' : 'Completado'}</span></td>
        </tr>
    `).join('');
}

/** BONOS **/
async function cargarBonos() {
    const tableBody = document.getElementById("vouchers-table-body");

    // Si ya tenemos bonos en el state, evitamos el "Sincronizando..." molesto y mostramos lo que hay
    if (state.bonos.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="muted">Cargando bonos...</td></tr>`;
    }

    let persistentData = {};

    try {
        // 1. CARGA INMEDIATA DESDE FIRESTORE (Datos locales + Cache de sincronizaciones previas)
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
        // No usamos 'await' aquí para no bloquear la UI
        sincronizarConTienda(persistentData);

    } catch (err) {
        console.error("Error al cargar base de datos:", err);
        if (state.bonos.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="error">Error local: ${err.message}</td></tr>`;
        }
    }
}

async function sincronizarConTienda(persistentData) {
    console.log("Iniciando sincronización con tienda en segundo plano...");
    try {
        const res = await fetch(ENDPOINT_BONOS);
        const dataProxy = await res.json();

        if (!dataProxy.contents) return;
        const shopVouchers = JSON.parse(dataProxy.contents);

        const batch = db.batch();
        let operationsCount = 0;

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

    } catch (err) {
        console.warn("Sincronización de fondo fallida (WooCommerce offline):", err);
    }
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

        if (b.estado === 'completed') { badgeClass = 'st-completed'; statusLabel = 'CANJEADO'; }
        else if (b.estado === 'expired') { badgeClass = 'st-expired'; statusLabel = 'CADUCADO'; }
        else if (b.estado === 'partially') { badgeClass = 'st-partial'; statusLabel = 'PARCIAL'; }

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
    const clientName = voucher.cliente || voucher.email.split('@')[0];
    document.getElementById("vm-cliente").value = clientName;
    document.getElementById("vm-email").value = voucher.email;
    document.getElementById("vm-producto").value = voucher.producto;

    // Fechas
    document.getElementById("vm-fecha-compra").value = voucher.fecha; // Fecha compra original

    // Calcular validez (si no tiene una guardada ex profeso, calculamos +1 año)
    let valDate = "";
    if (voucher.fecha_validez) {
        valDate = voucher.fecha_validez;
    } else {
        const d = new Date(voucher.fecha);
        d.setFullYear(d.getFullYear() + 1);
        valDate = d.toISOString().split('T')[0];
    }
    document.getElementById("vm-fecha-validez").value = valDate;

    document.getElementById("vm-estado").value = checkVoucherExpiry(voucher.fecha) ? 'expired' : voucher.estado;
    document.getElementById("vm-notas").value = voucher.notas_internas || "";

    // Configurar botón reservar
    const btnRes = document.getElementById("vm-btn-reservar");
    btnRes.onclick = () => {
        closeVoucherModal();
        openModal(); // Abrir modal de citas

        // Pre-rellenar cita con lógica mejorada
        setTimeout(() => {
            // Nombre + Referencia al Bono
            document.getElementById("m-cliente").value = `${clientName} (Bono: ${code})`;

            // Selección inteligente de servicio
            const servSelect = document.getElementById("m-servicio");
            const voucherProd = voucher.producto.toLowerCase().trim();

            let bestMatchIndex = -1;

            for (let i = 0; i < servSelect.options.length; i++) {
                const optVal = servSelect.options[i].value.toLowerCase().trim();

                // 1. Coincidencia exacta
                if (optVal === voucherProd) {
                    bestMatchIndex = i;
                    break;
                }

                // 2. Coincidencia parcial (uno contiene al otro)
                if (voucherProd.includes(optVal) || optVal.includes(voucherProd)) {
                    bestMatchIndex = i;
                }
            }

            if (bestMatchIndex !== -1) {
                servSelect.selectedIndex = bestMatchIndex;
            }
        }, 100);
    };

    voucherModal.style.display = "flex";
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
    const btn = e.target.querySelector("button[type='submit']");

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        // Guardar en Firestore
        await db.collection("spa_vouchers").doc(code).set({
            estado: newStatus,
            notas_internas: notes,
            fecha_validez: validUntil,
            last_updated: new Date().toISOString(),
            manual_update: true // Marcar como gestionado manualmente
        }, { merge: true });

        // Actualizar localmente
        const voucher = state.bonos.find(b => b.bono === code);
        if (voucher) {
            voucher.estado = newStatus;
            voucher.notas_internas = notes;
            voucher.fecha_validez = validUntil;
            voucher.manual_update = true;
        }

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
