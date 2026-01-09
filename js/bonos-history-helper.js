
async function renderVoucherHistory(bonoCode, internalValidations = []) {
    console.log('[HISTORY] Render requested for:', bonoCode);

    const historyContainer = document.getElementById("vm-history-container");
    if (!historyContainer) {
        console.warn('[HISTORY] #vm-history-container not found.');
        return;
    }

    // Set structure if empty
    historyContainer.innerHTML = `
        <h4 style="font-size: 0.75rem; text-transform:uppercase; color: #475569; margin-bottom: 8px; font-weight: 700; display:flex; align-items:center; gap:8px;">
            <i class="fas fa-history"></i> Historial de Reservas
            <span id="vm-history-loader" style="font-size:0.7rem; color:#94a3b8; font-weight:400; text-transform:none;"><i class="fas fa-spinner fa-spin"></i> Buscando...</span>
        </h4>
        <div id="vm-history-content"></div>
    `;

    // Asegurar acceso a db
    const db = window.db || firebase.firestore();

    try {
        let allReservations = [];
        // Colecciones donde buscar reservas
        const collections = ['reservas_spa', 'reservas_suite', 'reservas_panacea', 'reservas_peluqueria', 'reservas_vip', 'reservas_restaurante', 'reservas_gimnasio', 'reservas_rest', 'reservas_menu'];

        console.log(`[HISTORY] Buscando historial para bono: '${bonoCode}' en colecciones:`, collections);

        for (const col of collections) {
            try {
                // 1. Intentar búsqueda exacta por código de bono
                const snap = await db.collection(col).where("bono", "==", bonoCode).get();
                snap.forEach(doc => {
                    const d = doc.data();
                    if (d.status !== 'anulada') {
                        allReservations.push({ ...d, _col: col, id: doc.id });
                    }
                });

                // 2. Fallback: Búsqueda por email si existe (MUY fiable)
                const clientEmail = (state.bonos.find(b => b.bono === bonoCode) || {}).email;
                if (clientEmail) {
                    const snapEmail = await db.collection(col).where("email", "==", clientEmail).get();
                    snapEmail.forEach(doc => {
                        const d = doc.data();
                        // Solo añadir si NO lo habíamos añadido ya por código y si coincide el bono o no tiene bono asignado
                        const alreadyAdded = allReservations.some(r => r.id === doc.id);
                        if (!alreadyAdded && d.status !== 'anulada') {
                            // Si tiene otro bono asignado diferente, quizás no deberíamos mostrarlo?
                            // Pero a veces el código cambia ligeramente (espacios, etc).
                            // Por seguridad, si el origen es 'bono', lo mostramos.
                            if (d.origen === 'bono') {
                                allReservations.push({ ...d, _col: col, id: doc.id });
                            }
                        }
                    });
                }

                // 3. Fallback: Búsqueda por código sin espacios
                if (bonoCode.includes(' ')) {
                    const cleanCode = bonoCode.replace(/\s+/g, '');
                    const snap2 = await db.collection(col).where("bono", "==", cleanCode).get();
                    snap2.forEach(doc => {
                        const d = doc.data();
                        const alreadyAdded = allReservations.some(r => r.id === doc.id);
                        if (!alreadyAdded && d.status !== 'anulada') {
                            allReservations.push({ ...d, _col: col, id: doc.id });
                        }
                    });
                }

                // 4. Fallback: Búsqueda sin prefijo "WC" (para bonos de tienda que se registraron solo con el número)
                if (bonoCode.startsWith('WC')) {
                    const shortCode = bonoCode.substring(2);
                    const snap3 = await db.collection(col).where("bono", "==", shortCode).get();
                    snap3.forEach(doc => {
                        const d = doc.data();
                        const alreadyAdded = allReservations.some(r => r.id === doc.id);
                        if (!alreadyAdded && d.status !== 'anulada') {
                            allReservations.push({ ...d, _col: col, id: doc.id });
                        }
                    });
                }

            } catch (errCol) {
                console.warn(`[HISTORY] Error buscando en ${col}:`, errCol);
            }
        }

        // 5. MERGE LOCAL PENDING RESERVATIONS (Sync Delay mitigation)
        if (window.apiLocal && typeof apiLocal.getPendingSync === 'function') {
            try {
                const localPending = await apiLocal.getPendingSync('reservas');
                const cleanBono = bonoCode.replace(/\s+/g, '');

                localPending.forEach(loc => {
                    const locBono = (loc.bono || '').replace(/\s+/g, '');
                    // Match by bono code (exact or stripped) or Email if available
                    // We only check bono here for simplicity as pending items usually have it
                    if (locBono === cleanBono || (loc.bono === bonoCode)) {
                        // Avoid duplicates if already found in Firestore (rare race conn)
                        if (!allReservations.some(r => r.id === loc.id)) {
                            // Infer collection/color
                            let col = loc.collection || 'reservas_spa';
                            if (loc.servicio && loc.servicio.toLowerCase().includes('suite')) col = 'reservas_suite';

                            allReservations.push({
                                ...loc,
                                _col: col,
                                _isLocal: true // Marker for UI
                            });
                        }
                    }
                });
            } catch (e) {
                console.warn("[HISTORY] Error checking local pending:", e);
            }
        }

        // --- MERGE INTERNAL VALIDATIONS ---
        // ... (keep as is) ...
        if (internalValidations && internalValidations.length > 0) {
            internalValidations.forEach(item => {
                if (item.validations && Array.isArray(item.validations)) {
                    item.validations.forEach(val => {
                        const d = new Date(val.fecha_validacion);
                        const dateStr = d.toISOString().split('T')[0];
                        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        allReservations.push({
                            fecha: dateStr,
                            hora: timeStr,
                            servicio: item.name || 'Servicio del Bono',
                            pax: item.pax || 1,
                            status: 'completed',
                            _col: 'internal',
                            validado_por: val.validado_por,
                            huesped: val.nombre_huesped,
                            reserva_hotel: val.numero_reserva,
                            telefono: val.telefono_huesped,
                            fecha_alojamiento: val.fecha_alojamiento
                        });
                    });
                }
            });
        }

        // Fix sorting logic (avoid mixing a and b)
        allReservations.sort((a, b) => {
            const dateA = new Date((a.fecha || '2000-01-01') + 'T' + (a.hora || '00:00'));
            const dateB = new Date((b.fecha || '2000-01-01') + 'T' + (b.hora || '00:00'));
            return dateB - dateA;
        });

        const contentDiv = document.getElementById("vm-history-content");
        document.getElementById("vm-history-loader").style.display = "none";

        if (allReservations.length === 0) {
            contentDiv.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; font-style:italic; padding: 10px; border: 1px dashed #e2e8f0; border-radius: 8px; text-align: center;">No hay reservas registradas.</div>';
            return [];
        }

        contentDiv.innerHTML = allReservations.map(res => {
            const date = new Date(res.fecha).toLocaleDateString();

            // Determinar Tipo
            let typeLabel = "OTRO";
            let typeColor = "#64748b"; // gray

            if (res._col === 'reservas_spa') { typeLabel = "SPA"; typeColor = "#0ea5e9"; } // Sky blue
            else if (res._col === 'reservas_suite') { typeLabel = "SUITE"; typeColor = "#8b5cf6"; } // Violet
            else if (res._col === 'reservas_panacea' || res._col === 'reservas_vip') { typeLabel = "TRATAMIENTO"; typeColor = "#ec4899"; } // Pink
            else if (res._col === 'reservas_peluqueria') { typeLabel = "PELUQUERÍA"; typeColor = "#f59e0b"; } // Amber
            else if (res._col === 'reservas_gimnasio') { typeLabel = "GIMNASIO"; typeColor = "#6366f1"; } // Indigo
            else if (res._col === 'internal') {
                const srv = (res.servicio || '').toLowerCase();
                if (srv.includes('alojamiento') || srv.includes('hotel') || srv.includes('desayuno')) {
                    typeLabel = "HOTEL";
                    typeColor = "#6366f1"; // Indigo
                } else {
                    typeLabel = "CANJEADO";
                    typeColor = "#10b981"; // Emerald
                }
            }

            // Override for Restaurant services stored in SPA/Other collections
            const srvLower = (res.servicio || '').toLowerCase();
            let isRestaurant = false;
            if (['reservas_restaurante', 'reservas_rest', 'reservas_menu'].includes(res._col) ||
                srvLower.includes('restaurante') || srvLower.includes('menu') || srvLower.includes('menú')) {
                typeLabel = "RESTAURANTE";
                typeColor = "#f97316"; // Orange
                isRestaurant = true;
            }

            // Precio handling
            let precioDisplay = res.precio_total ? parseFloat(res.precio_total).toFixed(2) + '€' : '-';
            // Force "Incluido" for vouchers or Restaurant items in voucher view
            if (res.origen === 'bono' || isRestaurant) {
                precioDisplay = '<span style="color:#10b981; font-weight:600; font-size:0.75rem;">Incluido</span>';
            }

            // Friendly ID handling
            const safeId = res.id ? String(res.id) : '';
            const displayId = res.id_reserva || res.localizador || res.numero_reserva || res.id_ticket || res.ticket_id || res.id_friendly || (safeId.length > 6 ? '#' + safeId.substring(0, 6) : '#' + safeId);

            if (res._col === 'internal') {
                // Manual Validation Item - Show Alert with Details
                const detailText = `
DETALLES DE RESERVA HOTEL
--------------------------------
Huésped: ${res.huesped || '-'}
Pax: ${res.pax}
Servicio: ${res.servicio}
Fecha Entrada: ${res.fecha_alojamiento ? new Date(res.fecha_alojamiento).toLocaleDateString() : (res.fecha || '-')}
Noches: 1
Nº Reserva: ${res.reserva_hotel || '-'}
Confirmada por: ${res.validado_por || 'Sistema'}
                    `.trim();

                return `
                    <div onclick="alert(\`${detailText}\`)" style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; cursor:pointer;" title="Ver Detalles">
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <span style="background:${typeColor}; color:white; font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:700;">${typeLabel}</span>
                                <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">
                                    ${res.fecha_alojamiento ? new Date(res.fecha_alojamiento).toLocaleDateString() : date} <i class="fas fa-info-circle" style="font-size:0.7em; color:#94a3b8; margin-left:4px;"></i>
                                </div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                                ${res.servicio} (${res.pax} pax)
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; font-size:0.9rem; color:#334155;">${precioDisplay}</div>
                            <span class="badge badge-green" style="font-size:0.65rem;">Validado</span>
                        </div>
                    </div>
                    `;
            } else if (isRestaurant) {
                // RESTAURANT DISPLAY (No external link, show alert)
                const detailText = `
RESERVA DE RESTAURANTE
--------------------------------
ID: ${displayId}
Fecha: ${date} - ${res.hora}h
Servicio: ${res.servicio}
Pax: ${res.pax}
Cliente: ${res.cliente || res.nombre || '-'}
Teléfono: ${res.telefono || '-'}
Observaciones: ${res.observaciones || '-'}
                    `.trim();

                return `
                    <div onclick="alert(\`${detailText}\`)" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #f1f5f9;" title="Ver Detalles Restaurante">
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <span style="background:${typeColor}; color:white; font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:700;">${typeLabel}</span>
                                <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">
                                    ${date} - ${res.hora}h <i class="fas fa-utensils" style="font-size:0.7em; color:#f97316; margin-left:4px;"></i>
                                </div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                                ${res.servicio} (${res.pax} pax) <span style="color:#cbd5e1; margin-left:4px;">${displayId}</span>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; font-size:0.9rem; color:#334155;">${precioDisplay}</div>
                            ${res.fecha < new Date().toISOString().split('T')[0]
                        ? '<span class="badge badge-gray" style="font-size:0.65rem;">Pasada</span>'
                        : '<span class="badge badge-green" style="font-size:0.65rem;">Activa</span>'}
                        </div>
                    </div>
                `;
            } else {
                // Standard Reservation - Link to Calendar
                // Determinar módulo para el link
                let moduleTypeForLink = 'spa';
                if (res._col === 'reservas_suite') moduleTypeForLink = 'suite';
                else if (res._col === 'reservas_panacea') moduleTypeForLink = 'panacea';
                else if (res._col === 'reservas_vip') moduleTypeForLink = 'vip';
                else if (res._col === 'reservas_peluqueria') moduleTypeForLink = 'peluqueria';

                if (res._col === 'reservas_gimnasio') {
                    // Visualización específica para Gimnasio (sin link, solo confirmación)
                    // Usar datos del snapshot si existen, si no, fallback
                    const sessionInfo = res.sesion_actual ? `Sesión ${res.sesion_actual} de ${res.sesiones_totales}` : '';
                    const remainingInfo = (res.sesiones_restantes !== undefined) ? `Quedan ${res.sesiones_restantes}` : '';
                    const paxInfo = res.pax || 1;

                    return `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; padding: 12px 4px; border-bottom: 1px solid #f1f5f9;" title="Consumo Confirmado">
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:center; gap: 8px; margin-bottom:4px;">
                                <span style="background:${typeColor}; color:white; font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:700;">${typeLabel}</span>
                                <div style="font-weight:600; font-size:0.9rem; color:#1e293b;">
                                    ${date} - ${res.hora}h <i class="fas fa-check-double" style="font-size:0.7em; color:#10b981; margin-left:4px;"></i>
                                </div>
                            </div>
                            <div style="font-size:0.8rem; color:#475569; margin-bottom:4px;">
                                ${res.servicio} <span style="color:#94a3b8; font-size:0.75rem;">(${paxInfo} pax)</span>
                            </div>
                            ${sessionInfo ? `
                                <div style="display:flex; gap:10px; align-items:center; margin-top:4px;">
                                    <span style="font-size:0.75rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:12px; border:1px solid #dbeafe;">
                                        ${sessionInfo}
                                    </span>
                                    <span style="font-size:0.75rem; font-weight:600; color:#64748b;">
                                        ${remainingInfo}
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; font-size:0.9rem; color:#334155;">${precioDisplay}</div>
                            <span class="badge badge-blue" style="font-size:0.65rem; margin-top:4px; display:inline-block;">CONSUMIDO</span>
                        </div>
                    </div>
                    `;
                }

                return `
                    <a href="reservas.html?date=${res.fecha}&id=${res.id}&type=${moduleTypeForLink}" target="_blank" style="text-decoration:none; display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; cursor:pointer;" title="Ver en Calendario">
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <span style="background:${typeColor}; color:white; font-size:0.65rem; padding: 2px 6px; border-radius:4px; font-weight:700;">${typeLabel}</span>
                                <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">
                                    ${date} - ${res.hora}h <i class="fas fa-external-link-alt" style="font-size:0.7em; color:#94a3b8; margin-left:4px;"></i>
                                </div>
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                                ${res.servicio} (${res.pax} pax) <span style="color:#cbd5e1; margin-left:4px;">${displayId}</span>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; font-size:0.9rem; color:#334155;">${precioDisplay}</div>
                            ${res.fecha < new Date().toISOString().split('T')[0]
                        ? '<span class="badge badge-gray" style="font-size:0.65rem;">Pasada</span>'
                        : '<span class="badge badge-green" style="font-size:0.65rem;">Activa</span>'}
                        </div>
                    </a>
                    `;
            }
        }).join('');

        return allReservations;

    } catch (err) {
        console.error("Error loading history:", err);
        document.getElementById("vm-history-loader").innerText = "(Error al cargar)";
        return [];
    }
}
