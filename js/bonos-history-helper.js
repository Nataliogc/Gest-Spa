
async function renderVoucherHistory(bonoCode) {
    const listContainer = document.getElementById("vm-history-list");
    if (!listContainer) {
        // Create container if not exists (append to modal body, before footer)
        const modalBody = document.querySelector("#voucher-modal .modal-body");
        const historyDiv = document.createElement("div");
        historyDiv.id = "vm-history-list";
        historyDiv.style.marginTop = "20px";
        historyDiv.style.borderTop = "1px solid #e2e8f0";
        historyDiv.style.paddingTop = "15px";
        historyDiv.innerHTML = `
            <h4 style="font-size: 0.9rem; color: #475569; margin-bottom: 10px; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-history"></i> Historial de Reservas
                <span id="vm-history-loader" style="font-size:0.75rem; color:#94a3b8; font-weight:400;"><i class="fas fa-spinner fa-spin"></i> Buscando...</span>
            </h4>
            <div id="vm-history-content" style="max-height: 200px; overflow-y: auto;"></div>
        `;
        // Insert before control de sesiones is probably better layout-wise, but appending is safer
        // Let's insert after control-sesiones logic? No, just append for now
        modalBody.appendChild(historyDiv);
    } else {
        document.getElementById("vm-history-content").innerHTML = '';
        document.getElementById("vm-history-loader").style.display = "inline";
    }

    try {
        // Query multiple collections or a unified index? Assuming 'spa_reservas' is main
        // Also check 'suite_reservas', 'panacea_reservas', etc?
        // Let's query broadly or just spa_reservas for now? The user might have suite bookings.
        // Assuming 'spa_reservas' is the main timeline one.

        let allReservations = [];
        const collections = ['spa_reservas', 'suite_reservas', 'panacea_reservas', 'peluqueria_reservas']; // Add others if needed

        for (const col of collections) {
            // REMOVED .where("status", "!=", "anulada") to avoid Index Requirement
            const snap = await db.collection(col).where("bono", "==", bonoCode).get();
            snap.forEach(doc => {
                const d = doc.data();
                if (d.status !== 'anulada') {
                    allReservations.push({ ...d, _col: col, id: doc.id });
                }
            });
        }

        allReservations.sort((a, b) => new Date(b.fecha + 'T' + a.hora) - new Date(a.fecha + 'T' + b.hora)); // Newest first

        const contentDiv = document.getElementById("vm-history-content");
        document.getElementById("vm-history-loader").style.display = "none";

        if (allReservations.length === 0) {
            contentDiv.innerHTML = '<div style="font-size:0.85rem; color:#94a3b8; font-style:italic;">No hay reservas registradas con este bono.</div>';
            return;
        }

        contentDiv.innerHTML = allReservations.map(res => {
            const date = new Date(res.fecha).toLocaleDateString();
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                    <div>
                        <div style="font-weight:600; font-size:0.85rem; color:#1e293b;">
                            <i class="fas fa-calendar-alt" style="color:#cbd5e1; margin-right:5px;"></i> ${date} - ${res.hora}h
                        </div>
                        <div style="font-size:0.75rem; color:#64748b;">
                            ${res.servicio} (${res.pax} pax)
                        </div>
                    </div>
                    <div>
                        ${res.fecha < new Date().toISOString().split('T')[0]
                    ? '<span class="badge badge-gray">Pasada</span>'
                    : '<span class="badge badge-green">Activa</span>'}
                    </div>
                </div>
            `;
        }).join('');

        // Update sesiones usadas just in case? Or rely on DB sync?
        // Let's rely on DB for now, but UI shows real list.

    } catch (err) {
        console.error("Error loading history:", err);
        document.getElementById("vm-history-loader").innerText = "(Error al cargar)";
    }
}
