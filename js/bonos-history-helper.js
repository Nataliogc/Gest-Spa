async function renderVoucherHistory(bonoCode, internalValidations = []) {
    console.log('[HISTORY] Render requested for:', bonoCode);

    const historyContainer = document.getElementById("vm-history-container");
    if (!historyContainer) {
        console.warn('[HISTORY] #vm-history-container not found.');
        return [];
    }

    const cleanBonoCode = String(bonoCode || '').trim();

    // Set structure
    historyContainer.innerHTML = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0;">
                <h4 style="font-size: 0.78rem; text-transform: uppercase; color: #1e293b; margin: 0; font-weight: 800; display: flex; align-items: center; gap: 8px; letter-spacing: 0.3px;">
                    <i class="fas fa-history" style="color: #0ea5e9;"></i> Historial de Reservas
                    <span id="vm-history-count-badge" style="display: none; background: #e0f2fe; color: #0369a1; font-size: 0.68rem; padding: 2px 8px; border-radius: 999px; font-weight: 700;">0</span>
                </h4>
                <span id="vm-history-loader" style="font-size: 0.72rem; color: #64748b; font-weight: 500;">
                    <i class="fas fa-spinner fa-spin" style="color: #0ea5e9;"></i> Buscando reservas...
                </span>
            </div>
            <div id="vm-history-content" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>
    `;

    const db = window.db || firebase.firestore();

    try {
        let allReservations = [];
        // Todas las colecciones de reservas del sistema (incluyendo Cabinas 1, 2, 3 y Cabinas general)
        const collections = [
            'reservas_spa',
            'reservas_suite',
            'reservas_panacea',
            'reservas_vip',
            'reservas_cabina1',
            'reservas_cabina2',
            'reservas_cabina3',
            'reservas_cabinas',
            'reservas_peluqueria',
            'reservas_restaurante',
            'reservas_gimnasio',
            'reservas_complementos',
            'reservas_rest',
            'reservas_menu',
            'reservas',
            'reservas_evento'
        ];

        const spaAndRoomCols = [
            'reservas_spa', 'reservas_suite', 'reservas_panacea', 'reservas_vip',
            'reservas_cabina1', 'reservas_cabina2', 'reservas_cabina3', 'reservas_cabinas', 'reservas_peluqueria'
        ];

        const voucherObj = (typeof state !== 'undefined' && Array.isArray(state.bonos))
            ? (state.bonos.find(b => b.bono === cleanBonoCode || b.codigo === cleanBonoCode) || null)
            : null;
        const clientEmail = voucherObj ? voucherObj.email : null;

        // Generar lista de códigos a buscar para cubrir variaciones (trim, mayúsculas/minúsculas, sin espacios, sin WC)
        const codesToSearch = new Set();
        if (cleanBonoCode) {
            codesToSearch.add(cleanBonoCode);
            codesToSearch.add(cleanBonoCode.toUpperCase());
            codesToSearch.add(cleanBonoCode.toLowerCase());
            if (cleanBonoCode.includes(' ')) codesToSearch.add(cleanBonoCode.replace(/\s+/g, ''));
            if (cleanBonoCode.toUpperCase().startsWith('WC')) codesToSearch.add(cleanBonoCode.substring(2));
        }

        const codesLowerSet = new Set(Array.from(codesToSearch).map(c => String(c).toLowerCase().trim()));
        const matchesAnyCode = (val) => {
            if (!val) return false;
            return codesLowerSet.has(String(val).toLowerCase().trim());
        };

        // Lanzar TODAS las consultas en paralelo para máxima velocidad
        const queryPromises = [];

        collections.forEach(col => {
            const colRef = db.collection(col);

            codesToSearch.forEach(codeVariant => {
                queryPromises.push(
                    colRef.where("bono", "==", codeVariant).get()
                        .then(snap => ({ snap, col }))
                        .catch(() => ({ snap: [], col }))
                );
                if (spaAndRoomCols.includes(col)) {
                    queryPromises.push(
                        colRef.where("localizador", "==", codeVariant).get()
                            .then(snap => ({ snap, col }))
                            .catch(() => ({ snap: [], col }))
                    );
                }
            });

            if (col === 'reservas_restaurante') {
                codesToSearch.forEach(codeVariant => {
                    queryPromises.push(
                        colRef.where("campoBono", "==", codeVariant).get()
                            .then(snap => ({ snap, col }))
                            .catch(() => ({ snap: [], col }))
                    );
                    queryPromises.push(
                        colRef.where("referencia", "==", codeVariant).get()
                            .then(snap => ({ snap, col }))
                            .catch(() => ({ snap: [], col }))
                    );
                });
            }

            if (clientEmail && clientEmail.includes('@')) {
                queryPromises.push(
                    colRef.where("email", "==", clientEmail).get()
                        .then(snap => ({ snap, col }))
                        .catch(() => ({ snap: [], col }))
                );
            }
        });

        // Consultar también base de datos de producción de Mesachef si está disponible
        const mesachefDb = typeof window.getMesachefFirestore === 'function' ? window.getMesachefFirestore() : null;
        if (mesachefDb) {
            const mCol = mesachefDb.collection('reservas_restaurante');
            codesToSearch.forEach(codeVariant => {
                queryPromises.push(mCol.where("campoBono", "==", codeVariant).get().then(snap => ({ snap, col: 'reservas_restaurante' })).catch(() => ({ snap: [], col: 'reservas_restaurante' })));
                queryPromises.push(mCol.where("bono", "==", codeVariant).get().then(snap => ({ snap, col: 'reservas_restaurante' })).catch(() => ({ snap: [], col: 'reservas_restaurante' })));
                queryPromises.push(mCol.where("referencia", "==", codeVariant).get().then(snap => ({ snap, col: 'reservas_restaurante' })).catch(() => ({ snap: [], col: 'reservas_restaurante' })));
            });
        }

        const results = await Promise.all(queryPromises);
        const addedIds = new Set();

        const addReservationIfValid = (d, docId, col, forceMatch = false) => {
            const reservationKey = `${col}:${d.external_id || docId}`;
            if (addedIds.has(reservationKey) || addedIds.has(docId)) return;

            const isCancelled = d.status === 'anulada' || d.estado === 'anulada' || d.estado === 'cancelada';
            if (isCancelled) return;

            const matchesCode = forceMatch ||
                matchesAnyCode(d.bono) ||
                matchesAnyCode(d.localizador) ||
                matchesAnyCode(d.num_bono) ||
                matchesAnyCode(d.voucher) ||
                matchesAnyCode(d.bono_id) ||
                matchesAnyCode(d.codigo_bono) ||
                matchesAnyCode(d.campoBono) ||
                matchesAnyCode(d.referencia);

            if (matchesCode) {
                let fechaNorm = d.fecha;
                if (d.fecha && typeof d.fecha.toDate === 'function') {
                    fechaNorm = d.fecha.toDate().toISOString().split('T')[0];
                }
                allReservations.push({
                    ...d,
                    fecha: fechaNorm,
                    servicio: d.servicio || 'Menú en Restaurante',
                    _col: col,
                    id: docId
                });
                addedIds.add(reservationKey);
                addedIds.add(docId);
            }
        };

        results.forEach(({ snap, col }) => {
            if (!snap || typeof snap.forEach !== 'function') return;
            snap.forEach(doc => addReservationIfValid(doc.data(), doc.id, col, false));
        });

        // EXPANSIÓN AUTOMÁTICA DE FASES HERMANAS DE PACKS:
        // Si una fase del pack tiene el código de bono (ej. RS-BFKM_spa), traer también las demás fases del mismo pack (ej. RS-BFKM en Sala VIP)
        const packDatesAndRoots = new Map();
        allReservations.forEach(r => {
            const rootId = r.parent_id || String(r.id || '').replace(/_(spa|suite|vip|panacea|cabina\d*|peluqueria)(_\d+)?$/i, '');
            if (rootId && r.fecha) {
                packDatesAndRoots.set(`${r.fecha}::${rootId}`, { date: r.fecha, rootId, client: (r.nombre || r.cliente || '').toLowerCase().trim() });
            }
        });

        if (packDatesAndRoots.size > 0) {
            const siblingPromises = [];
            packDatesAndRoots.forEach(({ date, rootId, client }) => {
                spaAndRoomCols.forEach(col => {
                    siblingPromises.push(
                        db.collection(col).where("fecha", "==", date).get()
                            .then(snap => ({ snap, col, rootId, client }))
                            .catch(() => ({ snap: [], col, rootId, client }))
                    );
                });
            });
            const sibResults = await Promise.all(siblingPromises);
            sibResults.forEach(({ snap, col, rootId, client }) => {
                if (!snap || typeof snap.forEach !== 'function') return;
                snap.forEach(doc => {
                    const d = doc.data();
                    const docRoot = d.parent_id || String(doc.id || '').replace(/_(spa|suite|vip|panacea|cabina\d*|peluqueria)(_\d+)?$/i, '');
                    const dClient = (d.nombre || d.cliente || '').toLowerCase().trim();
                    if (docRoot === rootId || (client && dClient === client && (d.is_pack_child || d.is_pack_parent || d.parent_id))) {
                        addReservationIfValid(d, doc.id, col, true);
                        // Auto-reparar el código de bono en la fase hermana si estaba vacío
                        if (!d.bono && cleanBonoCode) {
                            db.collection(col).doc(doc.id).update({ bono: cleanBonoCode, localizador: cleanBonoCode }).catch(() => {});
                        }
                    }
                });
            });
        }

        // MERGE LOCAL PENDING RESERVATIONS (Sync Delay mitigation)
        if (window.apiLocal && typeof apiLocal.getPendingSync === 'function') {
            try {
                const localPending = await apiLocal.getPendingSync('reservas');
                localPending.forEach(loc => {
                    if (matchesAnyCode(loc.bono) && !addedIds.has(loc.id)) {
                        let col = loc.collection || 'reservas_spa';
                        if (loc.servicio && loc.servicio.toLowerCase().includes('suite')) col = 'reservas_suite';
                        allReservations.push({ ...loc, _col: col, _isLocal: true });
                        addedIds.add(loc.id);
                    }
                });
            } catch (e) {
                console.warn("[HISTORY] Error checking local pending:", e);
            }
        }

        // MERGE INTERNAL VALIDATIONS
        if (internalValidations && internalValidations.length > 0) {
            internalValidations.forEach(item => {
                if (item.validations && Array.isArray(item.validations)) {
                    item.validations.forEach(val => {
                        if (val.source === 'mesachef' || val.external_id) return;
                        const d = new Date(val.fecha_validacion || val.fecha);
                        if (isNaN(d.getTime())) return;
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

        // Ordenar por fecha y hora (más recientes o próximas primero)
        allReservations.sort((a, b) => {
            const dateA = new Date((a.fecha || '2000-01-01') + 'T' + (a.hora || '00:00'));
            const dateB = new Date((b.fecha || '2000-01-01') + 'T' + (b.hora || '00:00'));
            return dateB - dateA;
        });

        const contentDiv = document.getElementById("vm-history-content");
        const loaderEl = document.getElementById("vm-history-loader");
        const countBadge = document.getElementById("vm-history-count-badge");
        if (loaderEl) loaderEl.style.display = "none";
        if (countBadge) {
            countBadge.textContent = `${allReservations.length} ${allReservations.length === 1 ? 'cita' : 'citas'}`;
            countBadge.style.display = "inline-block";
        }

        if (allReservations.length === 0) {
            const usedCount = voucherObj ? (parseInt(voucherObj.sesiones_usadas) || 0) : 0;
            const isCompleted = voucherObj && (voucherObj.estado === 'completed' || usedCount > 0);
            if (isCompleted) {
                contentDiv.innerHTML = `
                    <div style="font-size: 0.8rem; color: #475569; background: #fff; padding: 12px 14px; border: 1px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-info-circle" style="color: #0ea5e9; font-size: 1.1rem;"></i>
                        <div>
                            <div style="font-weight: 700; color: #334155;">Sin citas vinculadas con el código ${cleanBonoCode}</div>
                            <div style="font-size: 0.73rem; color: #64748b; margin-top: 2px;">
                                Este bono figura con <strong>${usedCount} ${usedCount === 1 ? 'sesión usada' : 'sesiones usadas'}</strong> (canjeado previamente o sin código asignado en la cita).
                            </div>
                        </div>
                    </div>`;
            } else {
                contentDiv.innerHTML = `
                    <div style="font-size: 0.82rem; color: #94a3b8; background: #fff; font-style: italic; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center;">
                        <i class="fas fa-calendar-times" style="margin-right: 6px; opacity: 0.7;"></i> No hay reservas registradas todavía para este bono.
                    </div>`;
            }
            return [];
        }

        const todayISO = new Date().toISOString().split('T')[0];

        contentDiv.innerHTML = allReservations.map(res => {
            const dateParts = String(res.fecha || '').split('-');
            const dateFormatted = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : (res.fecha || '-');

            let typeLabel = "RESERVA";
            let typeColor = "#64748b";
            let typeBg = "#f1f5f9";

            if (res._col === 'reservas_spa') { typeLabel = "SPA"; typeColor = "#0284c7"; typeBg = "#e0f2fe"; }
            else if (res._col === 'reservas_suite') { typeLabel = "SUITE"; typeColor = "#7c3aed"; typeBg = "#ede9fe"; }
            else if (res._col === 'reservas_vip') { typeLabel = "SALA VIP"; typeColor = "#d97706"; typeBg = "#fef3c7"; }
            else if (res._col === 'reservas_panacea') { typeLabel = "PANACEA"; typeColor = "#db2777"; typeBg = "#fce7f3"; }
            else if (res._col === 'reservas_cabina1') { typeLabel = "CABINA 1"; typeColor = "#be185d"; typeBg = "#fce7f3"; }
            else if (res._col === 'reservas_cabina2') { typeLabel = "CABINA 2"; typeColor = "#6d28d9"; typeBg = "#ede9fe"; }
            else if (res._col === 'reservas_cabina3') { typeLabel = "CABINA 3"; typeColor = "#1d4ed8"; typeBg = "#dbeafe"; }
            else if (res._col === 'reservas_cabinas') { typeLabel = (res.sala || "CABINA").toUpperCase(); typeColor = "#4f46e5"; typeBg = "#e0e7ff"; }
            else if (res._col === 'reservas_peluqueria') { typeLabel = "PELUQUERÍA"; typeColor = "#0d9488"; typeBg = "#ccfbf1"; }
            else if (res._col === 'reservas_gimnasio') { typeLabel = "GIMNASIO"; typeColor = "#4f46e5"; typeBg = "#e0e7ff"; }
            else if (res._col === 'reservas_complementos') { typeLabel = "COMPLEMENTO"; typeColor = "#d97706"; typeBg = "#fef3c7"; }
            else if (res._col === 'internal') {
                const srv = (res.servicio || '').toLowerCase();
                if (srv.includes('alojamiento') || srv.includes('hotel') || srv.includes('desayuno')) {
                    typeLabel = "HOTEL"; typeColor = "#4f46e5"; typeBg = "#e0e7ff";
                } else {
                    typeLabel = "CANJEADO"; typeColor = "#059669"; typeBg = "#d1fae5";
                }
            }

            const srvLower = (res.servicio || '').toLowerCase();
            let isRestaurant = false;
            if (['reservas_restaurante', 'reservas_rest', 'reservas_menu'].includes(res._col) ||
                srvLower.includes('restaurante') || srvLower.includes('menu') || srvLower.includes('menú')) {
                typeLabel = "RESTAURANTE";
                typeColor = "#ea580c";
                typeBg = "#ffedd5";
                isRestaurant = true;
            }

            const safeId = res.id ? String(res.id) : '';
            const displayId = res.res_id || res.id_reserva || res.numero_reserva || res.id_ticket || res.ticket_id || res.id_friendly || (safeId.length > 10 ? safeId.substring(0, 8) : safeId);
            const therapistTxt = res.terapeuta || res.staff_name ? ` · <i class="fas fa-user-nurse" style="color:#64748b;"></i> ${res.terapeuta || res.staff_name}` : '';
            const durTxt = res.duracion ? ` · ${res.duracion}'` : '';
            const isPast = (res.fecha || '') < todayISO;
            const statusPill = isPast
                ? `<span style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:999px;">Realizada</span>`
                : `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:999px;">Confirmada</span>`;

            if (res._col === 'internal') {
                const detailText = `DETALLES DE RESERVA HOTEL\n--------------------------------\nHuésped: ${res.huesped || '-'}\nPax: ${res.pax}\nServicio: ${res.servicio}\nFecha Entrada: ${res.fecha_alojamiento ? new Date(res.fecha_alojamiento).toLocaleDateString() : dateFormatted}\nNº Reserva: ${res.reserva_hotel || '-'}\nConfirmada por: ${res.validado_por || 'Sistema'}`;
                return `
                    <div onclick="alert(${JSON.stringify(detailText).replace(/"/g, '&quot;')})"
                         style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer;">
                        <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="background:${typeBg}; color:${typeColor}; border:1px solid ${typeColor}40; font-size:0.68rem; padding:2px 8px; border-radius:6px; font-weight:800;">${typeLabel}</span>
                                <span style="font-weight:700; font-size:0.85rem; color:#0f172a;"><i class="fas fa-calendar-alt" style="color:#64748b; margin-right:4px;"></i>${dateFormatted}</span>
                            </div>
                            <div style="font-size:0.8rem; color:#334155; font-weight:600;">
                                ${res.servicio} <span style="color:#64748b; font-weight:500;">(${res.pax || 1} pax)</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:#d1fae5; color:#065f46; font-size:0.68rem; font-weight:700; padding:3px 8px; border-radius:999px;">Validado</span>
                        </div>
                    </div>`;
            }

            if (isRestaurant) {
                const detailText = `RESERVA DE RESTAURANTE\n--------------------------------\nID: ${displayId}\nFecha: ${dateFormatted} - ${res.hora || ''}h\nServicio: ${res.servicio}\nPax: ${res.pax}\nCliente: ${res.cliente || res.nombre || '-'}`;
                return `
                    <div onclick="alert(${JSON.stringify(detailText).replace(/"/g, '&quot;')})"
                         style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer;">
                        <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="background:${typeBg}; color:${typeColor}; border:1px solid ${typeColor}40; font-size:0.68rem; padding:2px 8px; border-radius:6px; font-weight:800;">${typeLabel}</span>
                                <span style="font-weight:700; font-size:0.85rem; color:#0f172a;"><i class="fas fa-calendar-day" style="color:#64748b; margin-right:4px;"></i>${dateFormatted} · ${res.hora || ''}h</span>
                                <span style="font-family:monospace; font-size:0.7rem; background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:4px;">${displayId}</span>
                            </div>
                            <div style="font-size:0.8rem; color:#334155; font-weight:600;">
                                ${res.servicio} <span style="color:#64748b; font-weight:500;">· 👥 ${res.pax || 1} pax</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${statusPill}
                        </div>
                    </div>`;
            }

            if (res._col === 'reservas_gimnasio' || res._col === 'reservas_complementos') {
                const isGym = res._col === 'reservas_gimnasio';
                return `
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="background:${typeBg}; color:${typeColor}; border:1px solid ${typeColor}40; font-size:0.68rem; padding:2px 8px; border-radius:6px; font-weight:800;">${typeLabel}</span>
                                <span style="font-weight:700; font-size:0.85rem; color:#0f172a;">${dateFormatted} · ${res.hora || ''}h</span>
                            </div>
                            <div style="font-size:0.8rem; color:#334155; font-weight:600;">
                                ${res.servicio} <span style="color:#64748b; font-weight:500;">· 👥 ${res.pax || 1} pax</span>
                            </div>
                        </div>
                        <span style="background:#dbeafe; color:#1e40af; font-size:0.68rem; font-weight:700; padding:3px 8px; border-radius:999px;">${isGym ? 'Consumido' : 'Validado'}</span>
                    </div>`;
            }

            // Reserva estándar de Spa o Salas
            let targetUrl = `reservas-spa.html?action=edit&id=${encodeURIComponent(res.id)}&date=${encodeURIComponent(res.fecha)}&embedded=1&modal=1`;
            if (res._col !== 'reservas_spa') {
                let moduleTypeForLink = 'cabinas';
                if (res._col === 'reservas_suite') moduleTypeForLink = 'suite';
                else if (res._col === 'reservas_panacea') moduleTypeForLink = 'panacea';
                else if (res._col === 'reservas_vip') moduleTypeForLink = 'vip';
                else if (res._col === 'reservas_peluqueria') moduleTypeForLink = 'peluqueria';
                targetUrl = `reservas-salas.html?type=${moduleTypeForLink}&action=edit&id=${encodeURIComponent(res.id)}&date=${encodeURIComponent(res.fecha)}&embedded=1&modal=1`;
            }

            const escapedSvc = String(res.servicio || '').replace(/'/g, "\\'");
            const escapedBono = String(cleanBonoCode || '').replace(/'/g, "\\'");

            return `
                <a href="${targetUrl}"
                   onclick="if (typeof openReservationDrawer === 'function') { openReservationDrawer('${targetUrl}', { service: '${escapedSvc}', code: '${escapedBono}' }); return false; }"
                   target="GestSpa_VentanaReservas"
                   style="text-decoration:none; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; cursor:pointer; transition:all 0.15s;"
                   onmouseover="this.style.borderColor='#93c5fd'; this.style.boxShadow='0 2px 8px rgba(14,165,233,0.1)'"
                   onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'"
                   title="Hacer clic para abrir la ficha de esta reserva">
                    <div style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="background:${typeBg}; color:${typeColor}; border:1px solid ${typeColor}40; font-size:0.68rem; padding:2px 8px; border-radius:6px; font-weight:800;">${typeLabel}</span>
                            <span style="font-weight:700; font-size:0.85rem; color:#0f172a;">
                                <i class="fas fa-calendar-day" style="color:#0ea5e9; margin-right:4px;"></i>${dateFormatted} · <i class="fas fa-clock" style="color:#0ea5e9; margin-right:3px;"></i>${res.hora || '--:--'}h
                            </span>
                            <span style="font-family:monospace; font-size:0.7rem; font-weight:700; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0;">${displayId}</span>
                        </div>
                        <div style="font-size:0.82rem; color:#334155; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${res.servicio} <span style="color:#64748b; font-weight:500;">· 👥 ${res.pax || 1} pax${durTxt}${therapistTxt}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        ${statusPill}
                        <span style="background:#f8fafc; color:#0284c7; border:1px solid #bae6fd; font-size:0.72rem; font-weight:700; padding:4px 10px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
                            Ver <i class="fas fa-external-link-alt" style="font-size:0.65rem;"></i>
                        </span>
                    </div>
                </a>`;
        }).join('');

        return allReservations;

    } catch (err) {
        console.error("Error loading history:", err);
        const loaderEl = document.getElementById("vm-history-loader");
        if (loaderEl) {
            loaderEl.style.display = "inline";
            loaderEl.innerText = "(Error al cargar historial)";
        }
        return [];
    }
}
