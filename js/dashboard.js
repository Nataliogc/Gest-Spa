// dashboard.js - Lógica del Dashboard Principal

const state = {
    citas: [],
    spaConfig: {}, // Para notas del día y templates
    circuitos: [],
    tratamientos: [],
    searchMode: false,
    searchCitas: []
};

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    // Shared setup
    setupNavigation();
    applyTheme(); // from app-core

    // Dashboard specific
    initDashboard();
});

function initDashboard() {
    updateDateDisplay();
    cargarCitasHoy();
    cargarCatalogoSimple(); // Para el modal de nueva cita
    cargarNotasDia();

    // Listeners
    document.getElementById("dashboard-search")?.addEventListener("input", renderDashboard);
    document.getElementById("dashboard-search")?.addEventListener("keypress", (e) => {
        if (e.key === 'Enter') {
            buscarReservasGlobal(e.target.value);
        }
    });
    document.getElementById("filter-status")?.addEventListener("change", renderDashboard);
    document.getElementById("filter-staff")?.addEventListener("change", renderDashboard);

    // Modal listeners
    document.querySelector(".close-modal")?.addEventListener("click", closeModal);
    window.addEventListener("click", (e) => {
        const modal = document.getElementById("booking-modal");
        if (e.target === modal) closeModal();
    });
}

function updateDateDisplay() {
    const el = document.getElementById("current-date");
    if (el) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        el.textContent = new Date().toLocaleDateString('es-ES', options);
    }
}

// --- DATA LOADING ---

async function cargarCitasHoy() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const collections = ["reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip", "reservas_peluqueria"];

        state.citas = [];

        // Cargar de todas las colecciones en paralelo
        const promises = collections.map(col => db.collection(col).where("fecha", "==", today).get());
        const snapshots = await Promise.all(promises);

        snapshots.forEach((snap, index) => {
            snap.forEach(doc => {
                const data = doc.data();
                // Determinar el módulo base para el redireccionamiento posterior
                let moduleType = 'spa';
                const col = collections[index];
                if (col === 'reservas_suite') moduleType = 'suite';
                else if (col === 'reservas_panacea' || col === 'reservas_vip') moduleType = 'panacea';
                else if (col === 'reservas_peluqueria') moduleType = 'peluqueria';

                state.citas.push({
                    id: doc.id,
                    moduleType: moduleType,
                    ...data
                });
            });
        });

        state.citas.sort((a, b) => a.hora.localeCompare(b.hora));

        // Poblar filtro de terapeutas dinámicamente
        const staffSet = new Set();
        state.citas.forEach(c => { if (c.terapeuta) staffSet.add(c.terapeuta); });
        const staffFilter = document.getElementById("filter-staff");
        if (staffFilter) {
            const currentStaff = staffFilter.value;
            staffFilter.innerHTML = '<option value="">Todos los Terapeutas</option>';
            Array.from(staffSet).sort().forEach(s => {
                staffFilter.innerHTML += `<option value="${s}" ${s === currentStaff ? 'selected' : ''}>${s}</option>`;
            });
        }

        renderDashboard();
        actualizarStatsInicio();
    } catch (err) {
        console.error("Error cargando citas:", err);
    }
}

async function cargarNotasDia() {
    try {
        const doc = await db.collection("spa_config").doc("notas_dia").get();
        const el = document.getElementById("stat-notas-dia");
        if (el) {
            el.textContent = (doc.exists && doc.data().texto) ? doc.data().texto : "Sin notas";
        }
    } catch (err) {
        console.error("Notas error:", err);
    }
}

async function cargarCatalogoSimple() {
    try {
        // Necesario para el desplegable de Nueva Cita
        const snap = await db.collection("spa_services").where("active", "==", true).get();
        state.circuitos = [];
        state.tratamientos = [];

        snap.forEach(doc => {
            const d = doc.data();
            if (['circuito', 'bono_circuito', 'pack_pareja', 'suite_privada'].includes(d.categoria)) {
                state.circuitos.push({ nombre: d.nombre });
            } else {
                state.tratamientos.push({ nombre: d.nombre });
            }
        });
    } catch (err) {
        console.error("Error catalogo dashboard:", err);
    }
}

// --- RENDER ---

function renderDashboard() {
    const tbody = document.getElementById("dashboard-table-body");
    const thead = document.querySelector(".table-wrapper table thead");
    const titleEl = document.getElementById("dashboard-title");
    if (!tbody || !thead || !titleEl) return;

    const term = document.getElementById("dashboard-search")?.value.toLowerCase() || "";
    const statusFilter = document.getElementById("filter-status")?.value || "";
    const staffFilter = document.getElementById("filter-staff")?.value || "";
    const showPast = document.getElementById("show-past-citas")?.checked || false;

    // --- Determinar qué datos mostrar ---
    let dataToShow = [];
    let isGlobalSearch = state.searchMode && term.length > 0;

    if (isGlobalSearch) {
        dataToShow = state.searchCitas;
        titleEl.textContent = `Resultados Globales: "${term}"`;
        // Ajustar Header para incluir FECHA
        thead.innerHTML = `
            <tr style="background: #f8fafc;">
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ID</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">FECHA</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">HORA</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">CLIENTE</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">SERVICIO</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ESTADO</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ACCIONES</th>
            </tr>`;
    } else {
        state.searchMode = false;
        titleEl.textContent = "Próximas Citas (Hoy)";
        // Restaurar Header original
        thead.innerHTML = `
            <tr style="background: #f8fafc;">
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ID</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">HORA</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">CLIENTE</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">SERVICIO</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">TERAPEUTA</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ESTADO</th>
                <th style="padding: 15px 20px; font-size: 0.8rem; color: #64748b;">ACCIONES</th>
            </tr>`;

        const now = new Date();
        dataToShow = state.citas.filter(c => {
            const matchesTerm = (c.nombre || "").toLowerCase().includes(term) ||
                (c.servicio || "").toLowerCase().includes(term);
            const matchesStatus = statusFilter === "" || c.status === statusFilter;
            const matchesStaff = staffFilter === "" || c.terapeuta === staffFilter;

            let isUpcoming = true;
            if (!showPast) {
                const appointmentHour = parseInt(c.hora.split(':')[0]);
                const appointmentMin = parseInt(c.hora.split(':')[1]);
                const totalApptMin = appointmentHour * 60 + appointmentMin;
                const totalNowMin = now.getHours() * 60 + now.getMinutes();
                if (totalNowMin > (totalApptMin + 60)) isUpcoming = false;
            }
            return matchesTerm && matchesStatus && matchesStaff && isUpcoming;
        });
    }

    // Actualizar contador
    const countEl = document.getElementById("stat-reservas-pendientes");
    if (countEl && !isGlobalSearch) countEl.textContent = dataToShow.length;

    if (dataToShow.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center; padding: 40px;">No hay resultados</td></tr>`;
        return;
    }

    tbody.innerHTML = dataToShow.map(c => `
        <tr>
            <td style="font-size:0.8rem; color:#666;">${c.res_id || c.id.substr(0, 4)}</td>
            ${isGlobalSearch ? `<td style="font-size:0.8rem;">${formatDateES(c.fecha)}</td>` : ''}
            <td style="font-weight:bold; color:var(--accent);">${c.hora}</td>
            <td>${c.nombre}</td>
            <td>${c.servicio}</td>
            ${!isGlobalSearch ? `<td>${c.terapeuta || '—'}</td>` : ''}
            <td><span class="badge ${getStatusBadgeClass(c.status)}">${c.status.toUpperCase()}</span></td>
            <td>
                <button class="btn-icon" title="Ver detalles" onclick="goToReservationDetail('${c.id}', '${c.moduleType}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function formatDateES(isoStr) {
    if (!isoStr) return "-";
    const parts = isoStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoStr;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'confirmada': return 'badge-success';
        case 'anulada': return 'badge-danger';
        case 'no_show': return 'badge-warning';
        default: return 'badge-secondary';
    }
}

async function buscarReservasGlobal(term) {
    if (!term || term.length < 3) {
        state.searchMode = false;
        state.searchCitas = [];
        renderDashboard();
        return;
    }

    const tbody = document.getElementById("dashboard-table-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Buscando en todo el historial...</td></tr>`;

    try {
        const collections = ["reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip", "reservas_peluqueria"];
        const searchPromises = [];

        // Firestore range search (Case sensitive start-match is limited)
        // Intentaremos normalizar un poco o simplemente buscar tal cual
        collections.forEach(col => {
            // Buscamos coincidencias que empiecen por el término
            const q = db.collection(col)
                .where("nombre", ">=", term)
                .where("nombre", "<=", term + "\uf8ff")
                .limit(20);
            searchPromises.push(q.get());
        });

        const snapshots = await Promise.all(searchPromises);
        let results = [];

        snapshots.forEach((snap, index) => {
            snap.forEach(doc => {
                const data = doc.data();
                let moduleType = 'spa';
                const col = collections[index];
                if (col === 'reservas_suite') moduleType = 'suite';
                else if (col === 'reservas_panacea' || col === 'reservas_vip') moduleType = 'panacea';
                else if (col === 'reservas_peluqueria') moduleType = 'peluqueria';

                results.push({ id: doc.id, moduleType, ...data });
            });
        });

        // Ordenar por fecha desc (más recientes primero)
        results.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora));

        state.searchMode = true;
        state.searchCitas = results;
        renderDashboard();

    } catch (err) {
        console.error("Error en búsqueda global:", err);
        showToast("Error en búsqueda global", "error");
    }
}

// Navigate to reservation details
function goToReservationDetail(resId, moduleType) {
    const cita = state.citas.find(c => c.id === resId);
    if (!cita) return;

    // Si el moduleType ya viene en la cita (agregado en cargarCitasHoy), lo usamos
    const type = moduleType || cita.moduleType || 'spa';

    // Redirect to reservas.html with type and date and res_id (for auto-open)
    window.location.href = `reservas.html?type=${type}&date=${cita.fecha}&res_id=${cita.id}`;
}

async function actualizarStatsInicio() {
    const today = new Date().toISOString().split('T')[0];

    // --- Ventas de Bonos (Directamente de spa_vouchers) ---
    try {
        // Buscamos bonos cuya fecha empiece por YYYY-MM-DD (ISO format)
        // O bien que coincidan con el formato DD/MM/YYYY si se guardó así (fallback)
        const formatES = today.split('-').reverse().join('/');

        const [snapISO, snapES] = await Promise.all([
            db.collection("spa_vouchers").where("fecha", ">=", today).where("fecha", "<=", today + "\uf8ff").get(),
            db.collection("spa_vouchers").where("fecha", "==", formatES).get()
        ]);

        let localBonoTotal = 0;
        let onlineBonoTotal = 0;
        const processedIds = new Set();

        const processBono = (doc) => {
            if (processedIds.has(doc.id)) return;
            processedIds.add(doc.id);

            const data = doc.data();
            const precio = parseFloat(data.precio || data.importe) || 0;
            const id = (data.bono || data.id || "").toUpperCase();
            const origen = (data.origen || "").toLowerCase();

            // Prioridad al campo 'origen' si existe, fallback a prefijo LOC o falta de email
            if (origen === 'local' || id.startsWith("LOC") || (!data.email || data.email === "-")) {
                localBonoTotal += precio;
            } else {
                onlineBonoTotal += precio;
            }
        };

        snapISO.forEach(processBono);
        snapES.forEach(processBono);

        document.getElementById("stat-ventas-local").textContent = formatCurrency(localBonoTotal);
        document.getElementById("stat-ventas-online").textContent = formatCurrency(onlineBonoTotal);

    } catch (err) {
        console.error("Error cargando ventas de bonos:", err);
    }

    // --- Ocupación Suite / Panacea ---
    let suitePanaceaCount = 0;
    state.citas.filter(c => c.status === 'confirmada' && (c.moduleType === 'suite' || c.moduleType === 'panacea')).forEach(c => {
        suitePanaceaCount++;
    });
    // Base 24 slots (12 cada sala aprox)
    document.getElementById("stat-ocup-suite-panacea").textContent = Math.round((suitePanaceaCount / 24) * 100) + "%";

    // --- Ocupación Circuito Spa ---
    // Según reservas.html: Capacidad 20 pax por turno.
    // Turnos: 9 entre semana, 4 los domingos.
    const isSunday = new Date(today).getDay() === 0;
    const totalCapacity = 20 * (isSunday ? 4 : 9);

    let spaPax = 0;
    state.citas.filter(c => c.status === 'confirmada' && c.moduleType === 'spa').forEach(c => {
        spaPax += (parseInt(c.pax) || 1);
    });

    const spaPercent = totalCapacity > 0 ? Math.round((spaPax / totalCapacity) * 100) : 0;
    document.getElementById("stat-ocup-spa").textContent = spaPercent + "%";
}

// --- ACTIONS ---

async function editNotasDia() {
    const el = document.getElementById("stat-notas-dia");
    const current = el.textContent === "Sin notas" ? "" : el.textContent;
    const nuevo = prompt("Notas del día:", current);

    if (nuevo !== null) {
        try {
            await db.collection("spa_config").doc("notas_dia").set({
                texto: nuevo.trim(),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            el.textContent = nuevo.trim() || "Sin notas";
            showToast("Notas actualizadas", "success");
        } catch (err) {
            showToast("Error guardando notas", "error");
        }
    }
}

// Print Modal
function openPrintModal() {
    document.getElementById("print-modal").style.display = "flex";
    document.getElementById("print-fecha").value = new Date().toISOString().split('T')[0];
}

function closePrintModal() {
    document.getElementById("print-modal").style.display = "none";
}

// Ejecutar impresión
async function ejecutarImpresion() {
    const fecha = document.getElementById("print-fecha").value;
    try {
        const collections = ["reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip", "reservas_peluqueria"];
        const promises = collections.map(col => db.collection(col).where("fecha", "==", fecha).get());
        const snapshots = await Promise.all(promises);

        const reservas = [];
        snapshots.forEach(snap => {
            snap.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'anulada') {
                    reservas.push(data);
                }
            });
        });

        reservas.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

        generarInformeHTML(reservas, fecha);
    } catch (err) {
        showToast("Error imprimiendo", "error");
    }
}

function generarInformeHTML(reservas, fecha) {
    const w = window.open('', '_blank');
    w.document.write(`
        <html><head><title>Informe ${fecha}</title>
        <style>
            body{font-family:sans-serif} table{width:100%;border-collapse:collapse} 
            th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#eee}
        </style>
        </head><body>
        <h2>Reservas ${fecha}</h2>
        <table><thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Sala</th></tr></thead><tbody>
        ${reservas.map(r => `<tr><td>${r.hora}</td><td>${r.nombre}</td><td>${r.servicio}</td><td>${r.espacio || r.roomCode}</td></tr>`).join('')}
        </tbody></table>
        <script>window.print()</script>
        </body></html>
    `);
    w.document.close();
    closePrintModal();
}
