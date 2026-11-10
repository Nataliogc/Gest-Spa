/**
 * reservation-drawer.js
 * Panel Lateral / Drawer de Reserva Rápida integrado para Gest-Spa.
 * Evita la apertura de múltiples ventanas en el mismo puesto de trabajo
 * manteniendo el dinamismo y sincronización en tiempo real.
 */

(function () {
    let currentVoucherCode = null;

    window.openReservationDrawer = function (url, info = {}) {
        const backdrop = document.getElementById('reservation-drawer-backdrop');
        const drawer = document.getElementById('reservation-drawer');
        const iframe = document.getElementById('reservation-drawer-iframe');
        const titleEl = document.getElementById('drawer-title');
        const subtitleEl = document.getElementById('drawer-subtitle');
        const loader = document.getElementById('drawer-loading-indicator');

        if (!backdrop || !drawer || !iframe) {
            console.warn('[DRAWER] Elementos no encontrados en el DOM. Abriendo en ventana nombrada.');
            window.open(url, 'GestSpa_VentanaReservas');
            return;
        }

        currentVoucherCode = info.code || null;
        window._activeDrawerVoucher = currentVoucherCode;

        // Configurar Títulos
        const isOcupacion = !!(info.isOcupacion || url.includes('agenda-salas.html'));
        if (titleEl) {
            const svc = info.service ? decodeURIComponent(info.service) : 'Reserva de Servicio';
            titleEl.textContent = isOcupacion ? `Ocupación Salas: ${svc}` : `Reserva Rápida: ${svc}`;
        }
        if (subtitleEl) {
            const client = info.client ? decodeURIComponent(info.client) : '';
            const code = info.code ? decodeURIComponent(info.code) : '';
            const parts = [];
            if (code) parts.push(`Bono: ${code}`);
            if (client) parts.push(`Cliente: ${client}`);
            if (isOcupacion) {
                parts.push(`Módulo: OCUPACIÓN (SALAS)`);
            } else if (info.type) {
                parts.push(`Módulo: ${info.type.toUpperCase()}`);
            }
            subtitleEl.textContent = parts.join(' • ') || 'Selecciona turno y hora en el cuadrante';
        }

        // En Ocupación Salas, maximizar a pantalla completa para ver todas las salas y terapeutas cómodamente
        const expandIcon = document.getElementById('drawer-expand-icon');
        if (isOcupacion) {
            drawer.classList.add('drawer-fullscreen');
            if (expandIcon) {
                expandIcon.classList.remove('fa-expand');
                expandIcon.classList.add('fa-compress');
            }
        } else {
            drawer.classList.remove('drawer-fullscreen');
            if (expandIcon) {
                expandIcon.classList.remove('fa-compress');
                expandIcon.classList.add('fa-expand');
            }
        }

        // Mostrar indicador de carga
        if (loader) loader.style.display = 'flex';

        // Escuchar evento de carga del iframe
        iframe.onload = function () {
            if (loader) loader.style.display = 'none';
        };

        // Asegurar que la URL lleve el parámetro embedded=1
        const separator = url.includes('?') ? '&' : '?';
        const finalUrl = url.includes('embedded=1') ? url : `${url}${separator}embedded=1`;
        iframe.src = finalUrl;

        // Mostrar Backdrop y Drawer
        backdrop.style.display = 'block';
        drawer.style.display = 'flex';

        // Forzar reflow para animación CSS suave
        void drawer.offsetWidth;
        backdrop.classList.add('active');
        drawer.classList.add('open');
    };

    window.closeReservationDrawer = function () {
        const backdrop = document.getElementById('reservation-drawer-backdrop');
        const drawer = document.getElementById('reservation-drawer');
        const iframe = document.getElementById('reservation-drawer-iframe');

        if (!drawer) return;

        backdrop?.classList.remove('active');
        drawer.classList.remove('open');
        drawer.classList.remove('drawer-fullscreen');

        // Restaurar icono de pantalla completa
        const icon = document.getElementById('drawer-expand-icon');
        if (icon) {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }

        // Esperar a que termine la animación antes de limpiar iframe y ocultar
        setTimeout(() => {
            if (drawer) drawer.style.display = 'none';
            if (backdrop) backdrop.style.display = 'none';
            if (iframe) iframe.src = 'about:blank';
            currentVoucherCode = null;
            window._activeDrawerVoucher = null;
        }, 280);
    };

    window.toggleDrawerFullscreen = function () {
        const drawer = document.getElementById('reservation-drawer');
        const icon = document.getElementById('drawer-expand-icon');
        if (!drawer) return;

        drawer.classList.toggle('drawer-fullscreen');
        if (icon) {
            if (drawer.classList.contains('drawer-fullscreen')) {
                icon.classList.remove('fa-expand');
                icon.classList.add('fa-compress');
            } else {
                icon.classList.remove('fa-compress');
                icon.classList.add('fa-expand');
            }
        }
    };

    // Escuchar mensajes de reservas.html (guardado completado o cancelación)
    window.addEventListener('message', function (event) {
        if (!event.data || typeof event.data !== 'object') return;

        if (event.data.type === 'GEST_SPA_RESERVATION_SUCCESS') {
            console.log('[DRAWER] Reserva completada con éxito:', event.data);
            const voucherCode = event.data.voucher || currentVoucherCode;
            const servicio = event.data.servicio || 'el servicio';

            window.closeReservationDrawer();

            if (typeof showToast === 'function') {
                showToast(`✅ Reserva confirmada para ${servicio}${voucherCode ? ` (Bono #${voucherCode})` : ''}`, 'success', 4500);
            } else if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `✅ Reserva confirmada (${servicio})`,
                    showConfirmButton: false,
                    timer: 4000
                });
            }

            // Actualizar vista de bonos automáticamente si estaba abierta la ficha
            if (voucherCode) {
                const voucherModal = document.getElementById('voucher-modal');
                if (voucherModal && voucherModal.style.display === 'flex' && typeof openVoucherManagement === 'function') {
                    console.log('[DRAWER] Refrescando modal de bono activo:', voucherCode);
                    setTimeout(() => openVoucherManagement(voucherCode), 300);
                } else if (typeof loadBonos === 'function') {
                    setTimeout(() => loadBonos(), 300);
                }
            }

            // Actualizar cuadrante de agenda automáticamente si estamos en la vista de agenda
            if (typeof renderGrid === 'function') {
                console.log('[DRAWER] Refrescando cuadrante de agenda en tiempo real...');
                setTimeout(() => renderGrid(), 350);
            }
        } else if (event.data.type === 'GEST_SPA_CLOSE_DRAWER') {
            window.closeReservationDrawer();
        }
    });

    // Cerrar al pulsar tecla Escape si el drawer está abierto
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const drawer = document.getElementById('reservation-drawer');
            if (drawer && drawer.classList.contains('open')) {
                window.closeReservationDrawer();
            }
        }
    });
})();
