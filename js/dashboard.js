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

    // Initialize date picker to today (Local Time)
    const datePicker = document.getElementById("dashboard-date-picker");
    let initialDate = "";

    if (datePicker) {
        const today = new Date();
        const localDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        datePicker.value = localDate;
        initialDate = localDate;
    }

    cargarCitasHoy(initialDate);
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
    document.getElementById("filter-room")?.addEventListener("change", renderDashboard); // New listener
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

async function cargarCitasHoy(date) {
    try {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const collections = ["reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip", "reservas_peluqueria", "reservas_gimnasio", "reservas_complementos"];

        state.citas = [];

        // Update title based on selected date
        const titleEl = document.getElementById("dashboard-title");
        if (titleEl) {
            const isToday = targetDate === new Date().toISOString().split('T')[0];
            if (isToday) {
                titleEl.textContent = "Próximas Citas";
            } else {
                const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
                titleEl.textContent = `Citas del ${formattedDate}`;
            }
        }

        // Cargar de todas las colecciones en paralelo
        console.log(`Charging appointments for date: ${targetDate}`);
        const promises = collections.map(col => db.collection(col).where("fecha", "==", targetDate).get());
        const snapshots = await Promise.all(promises);

        // Debug results
        let totalFound = 0;
        snapshots.forEach((snap, idx) => {
            console.log(`Collection ${collections[idx]}: ${snap.size} docs found`);
            totalFound += snap.size;
        });

        snapshots.forEach((snap, index) => {
            snap.forEach(doc => {
                const data = doc.data();
                // Determinar el módulo base para el redireccionamiento y filtering
                let moduleType = 'spa';
                const col = collections[index];

                if (col === 'reservas_suite') moduleType = 'suite';
                else if (col === 'reservas_panacea') moduleType = 'panacea';
                else if (col === 'reservas_vip') moduleType = 'vip';
                else if (col === 'reservas_peluqueria') moduleType = 'peluqueria';
                else if (col === 'reservas_gimnasio') moduleType = 'gym';
                else if (col === 'reservas_complementos') moduleType = 'complementos';

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

async function cargarNotasDia(date) {
    // Use provided date or default to today
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Update the date picker if it exists
    const datePicker = document.getElementById("dashboard-notes-date");
    if (datePicker && !date) {
        datePicker.value = targetDate;
    }

    try {
        const doc = await db.collection("spa_notes").doc(targetDate).get();
        const el = document.getElementById("stat-notas-dia");
        if (!el) return;

        if (doc.exists && doc.data().texto) {
            el.textContent = doc.data().texto;
        } else {
            el.textContent = "Sin notas para este día.";
        }
    } catch (err) {
        console.error("Error cargando notas del día:", err);
        const el = document.getElementById("stat-notas-dia");
        if (el) el.textContent = "Error cargando notas";
    }
}

function changeDashboardNotesDate(days) {
    const datePicker = document.getElementById("dashboard-notes-date");
    if (!datePicker) return;

    const currentDate = new Date(datePicker.value || new Date());
    currentDate.setDate(currentDate.getDate() + days);
    const newDate = currentDate.toISOString().split('T')[0];

    datePicker.value = newDate;
    cargarNotasDia(newDate);
}

async function editNotasDia() {
    const datePicker = document.getElementById("dashboard-notes-date");
    const targetDate = datePicker ? datePicker.value : new Date().toISOString().split('T')[0];

    const el = document.getElementById("stat-notas-dia");
    const current = el.textContent === "Sin notas para este día." ? "" : el.textContent;
    const nuevo = prompt(`Notas para el día ${targetDate}:`, current);

    if (nuevo !== null) {
        try {
            await db.collection("spa_notes").doc(targetDate).set({
                texto: nuevo.trim(),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            el.textContent = nuevo.trim() || "Sin notas para este día.";
            showToast("Notas actualizadas", "success");
        } catch (err) {
            showToast("Error guardando notas", "error");
        }
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

// --- DASHBOARD DATE PICKER NAVIGATION ---

window.loadDashboardDate = function (dateOrToday) {
    const datePicker = document.getElementById("dashboard-date-picker");
    if (!datePicker) return;

    if (dateOrToday === 'today') {
        const today = new Date();
        const localDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        datePicker.value = localDate;
    }

    cargarCitasHoy(datePicker.value);
};

window.changeDashboardDate = function (days) {
    const datePicker = document.getElementById("dashboard-date-picker");
    if (!datePicker) return;

    // Fix: Parse manually to avoid UTC conversion
    let currentVal = datePicker.value;
    if (!currentVal) {
        const today = new Date();
        currentVal = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }

    const parts = currentVal.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed
    const day = parseInt(parts[2], 10);

    const currentDate = new Date(year, month, day);
    currentDate.setDate(currentDate.getDate() + days);

    const newDate = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');

    datePicker.value = newDate;
    cargarCitasHoy(newDate);
};

// --- RENDER ---

function renderDashboard() {
    const tbody = document.getElementById("dashboard-table-body");
    const thead = document.querySelector(".table-wrapper table thead");
    const titleEl = document.getElementById("dashboard-title");
    if (!tbody || !thead || !titleEl) return;

    const term = document.getElementById("dashboard-search")?.value.toLowerCase() || "";
    const statusFilter = document.getElementById("filter-status")?.value || "";
    const roomFilter = document.getElementById("filter-room")?.value || "";
    const staffFilter = document.getElementById("filter-staff")?.value || "";
    const showPast = document.getElementById("show-past-citas")?.checked || false;

    // --- Determinar qué datos mostrar ---
    let dataToShow = [];
    let isGlobalSearch = state.searchMode && term.length > 0;

    if (isGlobalSearch) {
        // ... (keep global search logic)
        dataToShow = state.searchCitas;
        // ...
    } else {
        // ...
        // ...
        const now = new Date();
        dataToShow = state.citas.filter(c => {
            const matchesTerm = (c.nombre || "").toLowerCase().includes(term) ||
                (c.servicio || "").toLowerCase().includes(term);
            const matchesStatus = statusFilter === "" || c.status === statusFilter || (statusFilter === "confirmada" && c.status === "finalizada");
            const matchesStaff = staffFilter === "" || c.terapeuta === staffFilter;

            // New Room Filter
            let matchesRoom = true;
            if (roomFilter) {
                // Map filter value to internal moduleType or source
                // In cargarCitasHoy we need to ensure we have the distinction
                matchesRoom = c.moduleType === roomFilter;
            }

            let isUpcoming = true;
            if (!showPast) {
                const datePicker = document.getElementById("dashboard-date-picker");
                const selectedDate = datePicker ? datePicker.value : new Date().toISOString().split('T')[0];

                // Construct local "today" string yyyy-mm-dd
                const now = new Date();
                const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

                if (selectedDate > todayStr) {
                    // Future date: Always upcoming
                    isUpcoming = true;
                } else if (selectedDate < todayStr) {
                    // Past date: Always past
                    isUpcoming = false;
                } else {
                    // Today: Check time
                    const appointmentHour = parseInt(c.hora.split(':')[0]);
                    const appointmentMin = parseInt(c.hora.split(':')[1]);
                    const totalApptMin = appointmentHour * 60 + appointmentMin;
                    const totalNowMin = now.getHours() * 60 + now.getMinutes();
                    // Margin of 60 mins? Or strictly passed? User likely wants to see recent ones.
                    // Existing logic had +60. Let's keep it or refine.
                    if (totalNowMin > (totalApptMin + 60)) isUpcoming = false;
                }
            }
            return matchesTerm && matchesStatus && matchesStaff && matchesRoom && isUpcoming;
        });
    }

    // Actualizar contador
    const countEl = document.getElementById("stat-reservas-pendientes");
    if (countEl && !isGlobalSearch) countEl.textContent = dataToShow.length;

    if (dataToShow.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center; padding: 40px;">No hay resultados</td></tr>`;
        return;
    }

    tbody.innerHTML = dataToShow.map(c => {
        // Determine service name to display
        let serviceName = c.servicio || c.service || '—';
        if (serviceName === '—' && c.moduleType === 'spa') {
            serviceName = 'Circuito Spa';
        }

        // Determine if No-Show handling should be shown
        const isConfirmed = c.status === 'confirmada';
        const isNoShow = c.no_show === true || c.status === 'no_show';
        const statusIcon = getStatusIcon(isNoShow ? 'no_show' : c.status);

        // Robust check for paid amount / balance
        let paid = 0;
        if (c.pagado === true || c.estado_pago === 'pagado') {
            paid = parseFloat(c.precio_total || 0);
        } else {
            paid = parseFloat(c.payment?.paid || c.paid_amount || c.pagado || 0) || 0;
        }

        const balanceAmount = Math.max(0, (parseFloat(c.precio_total) || 0) - paid);
        const hasBalance = balanceAmount > 0.05 && !['hotel_inc', 'bono', 'smartbox', 'wonderbox', 'ego'].includes(c.origen);

        return `
            <tr style="${isNoShow ? 'opacity: 0.5;' : ''}">
                <td style="font-size:0.8rem; color:#666;">${c.res_id || c.id.substr(0, 4)}</td>
                ${isGlobalSearch ? `<td style="font-size:0.8rem;">${formatDateES(c.fecha)}</td>` : ''}
                <td style="font-weight:bold; color:var(--accent);">${c.hora}</td>
                <td ${isNoShow ? 'style="text-decoration: line-through;"' : ''}>${c.nombre}</td>
                <td>${serviceName}</td>
                ${!isGlobalSearch ? `<td>${c.terapeuta || '—'}</td>` : ''}
                <td style="text-align: center;">
                    ${statusIcon}
                    ${hasBalance ? `
                        <span title="Pendiente de Pago: ${balanceAmount}€" style="white-space:nowrap;">
                            <i class="fas fa-coins" style="color: #eab308; margin-left: 6px; font-size: 0.9rem;"></i>
                            <span style="font-size: 0.7rem; color: #b45309; font-weight: 700; vertical-align: middle;">${balanceAmount}€</span>
                        </span>
                    ` : ''}
                </td>
                <td style="text-align:center;">
                    ${isConfirmed && !isNoShow && !c.attended ? `
                        <button class="btn-icon" title="Confirmar Asistencia (Presentado)" onclick="markAttendance('${c.id}', '${c.moduleType}')" style="color:#f59e0b;">
                            <i class="fas fa-user-check"></i>
                        </button>
                    ` : (c.attended ? `
                        <button class="btn-icon" title="Asistencia confirmada - Desmarcar" onclick="unmarkAttendance('${c.id}', '${c.moduleType}')" style="color:#10b981;">
                            <i class="fas fa-check-double"></i>
                        </button>
                    ` : (isNoShow ? `
                        <button class="btn-icon" title="Desmarcar No Show" onclick="unmarkNoShow('${c.id}', '${c.moduleType}')" style="color:#6b7280;">
                            <i class="fas fa-undo"></i>
                        </button>
                    ` : `
                        <button class="btn-icon" title="Enviar confirmación WhatsApp" onclick="sendWhatsAppConfirmation('${c.id}', '${c.telefono || ''}', '${c.nombre.replace(/'/g, "\\'")}', '${c.fecha}', '${c.hora}', '${c.moduleType}')" style="color:#25D366;">
                            <i class="fab fa-whatsapp" style="font-size:1.2rem;"></i>
                            ${c.whatsappSent ? '<i class="fas fa-check-circle" style="font-size:0.6rem; color:green; vertical-align:top;"></i>' : ''}
                        </button>
                    `))}
                    ${isConfirmed && !isNoShow && !c.attended ? `
                        <button class="btn-icon" title="Marcar No Show" onclick="markAsNoShow('${c.id}', '${c.moduleType}')" style="color:#94a3b8; margin-left:5px; font-size:0.8rem;">
                            <i class="fas fa-user-times"></i>
                        </button>
                    ` : ''}
                </td>
                <td>
                    <button class="btn-icon" title="Ver detalles" onclick="goToReservationDetail('${c.id}', '${c.moduleType}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

function formatDateES(isoStr) {
    if (!isoStr) return "-";
    const parts = isoStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoStr;
}

function getStatusIcon(status) {
    switch (status) {
        case 'confirmada':
            return '<i class="fas fa-check-circle" title="Confirmada" style="color: #10b981; font-size: 1.1rem;"></i>';
        case 'finalizada':
            return '<i class="fas fa-flag-checkered" title="Finalizada" style="color: #6366f1; font-size: 1.1rem;"></i>';
        case 'anulada':
            return '<i class="fas fa-times-circle" title="Anulada" style="color: #ef4444; font-size: 1.1rem;"></i>';
        case 'no_show':
            return '<i class="fas fa-user-slash" title="No Show" style="color: #f59e0b; font-size: 1.1rem;"></i>';
        case 'pendiente':
            return '<i class="fas fa-clock" title="Pendiente" style="color: #f97316; font-size: 1.1rem;"></i>';
        default:
            return '<i class="fas fa-question-circle" title="' + status + '" style="color: #94a3b8; font-size: 1.1rem;"></i>';
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

window.sendWhatsAppConfirmation = async function (id, telefono, cliente, fecha, hora, moduleType) {
    if (!telefono || telefono.length < 9) {
        // Intentar buscar el cliente para conseguir el teléfono si no viene en la cita
        alert("No se detecta teléfono válido para este cliente.");
        return;
    }

    // Formato fecha amigable
    const dateObj = new Date(fecha);
    const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

    // Mensaje
    const texto = `Hola ${cliente}, le recordamos su cita en Cumbria Bienestar el ${dateStr} a las ${hora}. Por favor confirme su asistencia. Gracias.`;
    const encodedText = encodeURIComponent(texto);

    // Abrir WhatsApp
    const url = `https://wa.me/${telefono.replace(/\s+/g, '')}?text=${encodedText}`;
    window.open(url, '_blank');

    // Marcar como enviado en la base de datos visualmente
    try {
        const collectionMap = {
            'spa': 'reservas_spa',
            'suite': 'reservas_suite',
            'panacea': 'reservas_panacea',
            'peluqueria': 'reservas_peluqueria'
        };
        const col = collectionMap[moduleType] || 'reservas_spa';
        await db.collection(col).doc(id).update({ whatsappSent: true });

        // Actualizar estado local
        const cita = state.citas.find(c => c.id === id);
        if (cita) cita.whatsappSent = true;
        renderDashboard();

    } catch (e) {
        console.error("Error marcando whatsapp enviado", e);
    }
};

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
        const collections = ["reservas_spa", "reservas_suite", "reservas_panacea", "reservas_vip", "reservas_peluqueria", "reservas_gimnasio", "reservas_complementos"];
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

// --- REPORTING FUNCTIONS ---

window.openReportsModal = function () {
    document.getElementById("reports-modal").style.display = "flex";
}

window.closeReportsModal = function () {
    document.getElementById("reports-modal").style.display = "none";
}

window.generarRankingBonos = async function () {
    const content = document.getElementById("reports-content");
    content.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Procesando datos...</div>';

    try {
        const snap = await db.collection("spa_vouchers").get();
        const stats = {};

        snap.forEach(doc => {
            const b = doc.data();
            const prod = b.producto || 'Desconocido';
            if (!stats[prod]) stats[prod] = { count: 0, revenue: 0 };
            stats[prod].count++;
            stats[prod].revenue += parseFloat(b.importe || 0);
        });

        const ranking = Object.entries(stats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0;">Ranking Top 10 Bonos (Más Vendidos)</h3>
                <span style="font-size:0.8rem; color:#94a3b8;">Total acumulado</span>
            </div>
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                        <th style="padding:12px; text-align:left; font-size:0.75rem; color:#64748b;">POS.</th>
                        <th style="padding:12px; text-align:left; font-size:0.75rem; color:#64748b;">PRODUCTO</th>
                        <th style="padding:12px; text-align:right; font-size:0.75rem; color:#64748b;">UNIDADES</th>
                        <th style="padding:12px; text-align:right; font-size:0.75rem; color:#64748b;">VALOR ESTIMADO</th>
                    </tr>
                </thead>
                <tbody>
        `;

        ranking.forEach(([name, data], i) => {
            html += `
                <tr style="border-bottom:1px solid #f1f5f9; transition: background 0.2s;">
                    <td style="padding:12px; font-weight:700; color:var(--accent); font-size:1.1rem;">#${i + 1}</td>
                    <td style="padding:12px; font-weight:600; color:#334155;">${name}</td>
                    <td style="padding:12px; text-align:right; font-weight:700; color:#1e293b;">${data.count}</td>
                    <td style="padding:12px; text-align:right; color:#64748b; font-family:monospace;">${data.revenue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;
        window.currentReportData = { title: "Ranking Top 10 Bonos", data: ranking };

    } catch (err) {
        content.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
    }
}

window.generarInformeServicios = async function () {
    const content = document.getElementById("reports-content");
    content.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Cargando datos de catálogo y ventas...</div>';

    try {
        const [vouchSnap, catSnap] = await Promise.all([
            db.collection("spa_vouchers").get(),
            db.collection("spa_services").get()
        ]);

        const catalog = {};
        const normalizedCatalog = {}; // key: "normalized-name", value: realName

        // Helper function to normalize service names (strip person count)
        function normalizeServiceName(name) {
            let normalized = name.toLowerCase().trim();
            // Remove person count variations: (2), - 2 personas, - 2 pax, etc.
            normalized = normalized.replace(/\s*[-–—]\s*\d+\s*(personas?|pax|pers\.?)?/gi, '');
            normalized = normalized.replace(/\(\d+\)/g, '');
            normalized = normalized.replace(/\s+/g, ' ').trim();
            return normalized;
        }

        catSnap.forEach(doc => {
            const s = doc.data();
            const realName = s.nombre;
            const norm = normalizeServiceName(realName);
            catalog[realName] = { category: s.categoria || 'Sin Cat.', sold: 0, revenue: 0 };
            normalizedCatalog[norm] = realName;
        });

        vouchSnap.forEach(doc => {
            const b = doc.data();
            let name = (b.producto || '').trim();
            if (!name) return;

            // Try exact case-sensitive match
            if (catalog[name]) {
                catalog[name].sold++;
                catalog[name].revenue += parseFloat(b.importe || 0);
            } else {
                // Normalize and try to match
                const normalizedName = normalizeServiceName(name);
                let match = normalizedCatalog[normalizedName];

                // If no exact match, try partial matching
                if (!match) {
                    const keys = Object.keys(normalizedCatalog);
                    match = normalizedCatalog[keys.find(k => normalizedName.includes(k) || k.includes(normalizedName))];
                }

                if (match) {
                    catalog[match].sold++;
                    catalog[match].revenue += parseFloat(b.importe || 0);
                } else {
                    // Create new entry for unrecognized service
                    if (!catalog[name]) catalog[name] = { category: 'Descatalogado / Externo', sold: 0, revenue: 0 };
                    catalog[name].sold++;
                    catalog[name].revenue += parseFloat(b.importe || 0);
                }
            }
        });

        const sorted = Object.entries(catalog)
            .filter(x => x[1].sold > 0)
            .sort((a, b) => b[1].sold - a[1].sold);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0;">Resumen de Ventas por Servicio</h3>
                <span style="font-size:0.8rem; color:#94a3b8;">Histórico total (Optimizado)</span>
            </div>
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                        <th style="padding:12px; text-align:left; font-size:0.75rem; color:#64748b;">SERVICIO</th>
                        <th style="padding:12px; text-align:left; font-size:0.75rem; color:#64748b;">CATEGORÍA</th>
                        <th style="padding:12px; text-align:right; font-size:0.75rem; color:#64748b;">VENDIDOS</th>
                        <th style="padding:12px; text-align:right; font-size:0.75rem; color:#64748b;">TOTAL VENTAS</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sorted.forEach(([name, data]) => {
            html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:12px; font-weight:600; color:#334155;">${name}</td>
                    <td style="padding:12px; font-size:0.8rem;"><span style="background:#f1f5f9; padding:2px 8px; border-radius:12px; color:#64748b;">${data.category}</span></td>
                    <td style="padding:12px; text-align:right; font-weight:700; color:#1e293b;">${data.sold}</td>
                    <td style="padding:12px; text-align:right; color:var(--accent); font-weight:600; font-family:monospace;">${data.revenue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;
        window.currentReportData = { title: "Ventas por Servicio", data: sorted };

    } catch (err) {
        content.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
    }
}

window.downloadReportExcel = function () {
    if (!window.currentReportData) {
        showToast("Primero genera un informe", "warning");
        return;
    }

    const { title, data } = window.currentReportData;
    let csv = "sep=,\n";

    if (title.includes("Ranking")) {
        csv += "Posicion,Producto,Cantidad,Ingresos\n";
        data.forEach(([name, info], i) => {
            csv += `${i + 1},"${name}",${info.count},${info.revenue.toFixed(2).replace('.', ',')}\n`;
        });
    } else {
        csv += "Servicio,Categoria,Vendidos,Ingresos\n";
        data.forEach(([name, info]) => {
            csv += `"${name}","${info.category}",${info.sold},${info.revenue.toFixed(2).replace('.', ',')}\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${title.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- ATTENDANCE MANAGEMENT (Unified) ---

window.markAttendance = async function (resId, moduleType) {
    try {
        await window.dbCoreUpdateAttendance(resId, moduleType, true);
        const cita = state.citas.find(c => c.id === resId);
        if (cita) {
            cita.attended = true;
            cita.status = 'confirmada';
        }
        showToast('✅ Asistencia marcada', 'success');
        renderDashboard();
    } catch (err) {
        console.error('Error marking attendance:', err);
        showToast('❌ Error', 'error');
    }
};

window.unmarkAttendance = async function (resId, moduleType) {
    try {
        await window.dbCoreUpdateAttendance(resId, moduleType, false);
        const cita = state.citas.find(c => c.id === resId);
        if (cita) cita.attended = false;
        showToast('✅ Asistencia desmarcada', 'info');
        renderDashboard();
    } catch (err) {
        console.error('Error unmarking attendance:', err);
    }
};

window.markAsNoShow = async function (resId, moduleType) {
    if (!confirm('¿Este cliente NO se presentó (No Show)?')) return;

    try {
        await window.dbCoreUpdateNoShow(resId, moduleType, true);
        const cita = state.citas.find(c => c.id === resId);
        if (cita) {
            cita.no_show = true;
            cita.status = 'no_show';
            cita.attended = false;
        }
        showToast('✅ Marcado como No Show', 'success');
        renderDashboard();
    } catch (err) {
        console.error('Error marking no show:', err);
        showToast('❌ Error', 'error');
    }
};

window.unmarkNoShow = async function (resId, moduleType) {
    try {
        await window.dbCoreUpdateNoShow(resId, moduleType, false);
        const cita = state.citas.find(c => c.id === resId);
        if (cita) {
            cita.no_show = false;
            cita.status = 'confirmada';
        }
        showToast('✅ No Show desmarcado', 'success');
        renderDashboard();
    } catch (err) {
        console.error('Error unmarking no show:', err);
    }
};
