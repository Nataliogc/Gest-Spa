/**
 * spa-payment-control.js
 * Módulo: Control de Pago — Bonos Locales
 * 
 * Gestiona estado de pago, registro de cobros, y bloqueo de servicios
 * para bonos locales. No afecta WooCommerce ni motor SPA.
 */

// ============================================================================
// CONSTANTES
// ============================================================================

const PAYMENT_STATUS = {
    PAGADO: 'pagado',
    PENDIENTE: 'pendiente',
    PARCIAL: 'parcial'
};

const SERVICE_PAYMENT_STATUS = {
    PENDING_BEFORE_SERVICE: 'pending_before_service',
    CLEARED: 'cleared'
};

const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

const PAYMENT_COLORS = {
    pagado: '#22c55e',
    parcial: '#f59e0b',
    pendiente: '#ef4444'
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa campos de pago para un bono nuevo
 * @param {Object} voucher - Datos del bono
 * @param {string} origen - 'woocommerce' | 'local'
 * @returns {Object} - Bono con campos de pago inicializados
 */
function initializePaymentFields(voucher, origen) {
    const v = { ...voucher };

    // Obtener precio total (snapshot si existe, sino precio)
    const totalPrice = parseFloat(v.snapshot_price) || parseFloat(v.precio) || parseFloat(v.importe) || 0;

    // Determinar estado según origen
    const productStr = (v.producto || v.nombre || '').toLowerCase();
    const discountP = parseFloat(v.discount_percent_max) || parseFloat(v.discount_rate) || 0;
    const isInvitation = (totalPrice === 0 && (discountP >= 100 || productStr.includes('-100%') || productStr.includes('invitacion')));

    if (isInvitation) {
        // Si el precio es 0 por INVITACIÓN EXPLÍCITA, nace Pagado
        v.estado_pago = PAYMENT_STATUS.PAGADO;
        v.importe_pagado = 0;
        v.importe_pendiente = 0;
    } else if (origen === 'woocommerce' || origen === 'woo') {
        v.estado_pago = PAYMENT_STATUS.PAGADO;
        v.importe_pagado = totalPrice;
        v.importe_pendiente = 0;
    } else {
        // Local = pendiente por defecto
        v.estado_pago = PAYMENT_STATUS.PENDIENTE;
        v.importe_pagado = 0;
        v.importe_pendiente = totalPrice;
    }

    // Inicializar historial de pagos
    if (!v.pagos) {
        v.pagos = [];
    }

    // No establecer service_payment_status hasta que se reserve
    v.service_payment_status = null;

    return v;
}

/**
 * Normaliza campos de pago para bonos existentes que no los tengan
 * @param {Object} voucher - Bono existente
 * @returns {Object} - Bono con campos normalizados
 */
function normalizePaymentFields(voucher) {
    const v = { ...voucher };

    // Obtener precio total de forma robusta
    let rawPrice = v.snapshot_price || v.precio || v.importe || v.total || v.sale_price;
    if (typeof rawPrice === 'string') rawPrice = rawPrice.replace(',', '.');
    const totalPrice = parseFloat(rawPrice) || 0;

    // Si ya tiene estado_pago definido, normalizar tipos
    if (v.estado_pago) {
        v.estado_pago = normalizeEstadoPago(v.estado_pago);
    } else {
        // Inferir de origen
        const origen = (v.origen || v.source || '').toLowerCase();
        if (origen.includes('woo') || origen.includes('web')) {
            v.estado_pago = PAYMENT_STATUS.PAGADO;
        } else {
            v.estado_pago = PAYMENT_STATUS.PENDIENTE;
        }
    }

    // FIX GLOBAL: Los bonos de WooCommerce u Online SIEMPRE están pagados
    // Prevalece sobre cualquier estado corrupto en la base de datos local
    const origenNorm = (v.origen || '').toLowerCase();
    if (origenNorm.includes('woo') || v.metodo_pago === 'online') {
        v.estado_pago = PAYMENT_STATUS.PAGADO;
    }

    // FIX GLOBAL: Los bonos con precio 0 (invitaciones) SIEMPRE están pagados si es invitación explícita
    // Evita marcar como pagado un bono que tiene precio 0 por un error de carga
    if (totalPrice === 0) {
        const productStr = (v.producto || v.nombre || '').toLowerCase();
        const discountP = parseFloat(v.discount_percent_max) || parseFloat(v.discount_rate) || 0;
        const isInvitation = discountP >= 100 || productStr.includes('-100%') || productStr.includes('invitacion');

        if (isInvitation) {
            v.estado_pago = PAYMENT_STATUS.PAGADO;
        }
    }

    // Normalizar importes
    v.importe_pagado = parseFloat(v.importe_pagado) || 0;

    if (v.estado_pago === PAYMENT_STATUS.PAGADO) {
        v.importe_pagado = totalPrice;
        v.importe_pendiente = 0;
    } else if (v.estado_pago === PAYMENT_STATUS.PENDIENTE) {
        v.importe_pagado = 0;
        v.importe_pendiente = totalPrice;
    } else {
        v.importe_pendiente = Math.max(0, totalPrice - v.importe_pagado);
    }

    // Asegurar array de pagos
    if (!Array.isArray(v.pagos)) {
        v.pagos = [];
    }

    return v;
}

/**
 * Normaliza estado_pago desde cualquier tipo de entrada
 */
function normalizeEstadoPago(value) {
    if (value === null || value === undefined) {
        return PAYMENT_STATUS.PENDIENTE;
    }

    if (typeof value === 'boolean') {
        return value ? PAYMENT_STATUS.PAGADO : PAYMENT_STATUS.PENDIENTE;
    }

    if (typeof value === 'number') {
        const map = { 0: PAYMENT_STATUS.PENDIENTE, 1: PAYMENT_STATUS.PAGADO, 2: PAYMENT_STATUS.PARCIAL };
        return map[value] || PAYMENT_STATUS.PENDIENTE;
    }

    if (typeof value === 'string') {
        const normalized = value.toLowerCase().trim();
        if (['pagado', 'paid', 'completed', 'complete'].includes(normalized)) {
            return PAYMENT_STATUS.PAGADO;
        }
        if (['parcial', 'partial'].includes(normalized)) {
            return PAYMENT_STATUS.PARCIAL;
        }
        return PAYMENT_STATUS.PENDIENTE;
    }

    return PAYMENT_STATUS.PENDIENTE;
}

// ============================================================================
// REGISTRO DE PAGOS
// ============================================================================

/**
 * Registra un pago en un bono
 * @param {string} voucherId - ID del bono
 * @param {Object} paymentData - { importe, metodo, fecha, usuario }
 * @param {Object} options - { collection: 'local_sales' | 'woo_sales' }
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function registerPayment(voucherId, paymentData, options = {}) {
    const result = { success: false, voucher: null, error: null };

    try {
        if (typeof db === 'undefined') {
            throw new Error('Firestore no disponible');
        }

        const collection = options.collection || 'local_sales';
        const docRef = db.collection(collection).doc(voucherId);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new Error(`Bono ${voucherId} no encontrado`);
        }

        const voucher = normalizePaymentFields({ id: doc.id, ...doc.data() });
        const totalPrice = parseFloat(voucher.snapshot_price) || parseFloat(voucher.precio) || parseFloat(voucher.importe) || 0;

        // Validar importe
        const importe = parseFloat(paymentData.importe);
        if (isNaN(importe) || importe <= 0) {
            throw new Error('Importe inválido');
        }

        // Crear registro de pago
        const pagoRecord = {
            fecha: paymentData.fecha || new Date().toISOString(),
            metodo: paymentData.metodo || 'efectivo',
            importe: importe,
            usuario: paymentData.usuario || 'sistema'
        };

        // Actualizar importes
        const nuevoPagado = voucher.importe_pagado + importe;
        const nuevoPendiente = Math.max(0, totalPrice - nuevoPagado);

        // Determinar nuevo estado
        let nuevoEstado;
        if (nuevoPendiente <= 0) {
            nuevoEstado = PAYMENT_STATUS.PAGADO;
        } else if (nuevoPagado > 0) {
            nuevoEstado = PAYMENT_STATUS.PARCIAL;
        } else {
            nuevoEstado = PAYMENT_STATUS.PENDIENTE;
        }

        // Actualizar Firestore
        const updateData = {
            estado_pago: nuevoEstado,
            importe_pagado: nuevoPagado,
            importe_pendiente: nuevoPendiente,
            pagos: firebase.firestore.FieldValue.arrayUnion(pagoRecord),
            updated_at: new Date().toISOString()
        };

        // Si estaba pending_before_service y ahora está pagado, limpiar
        if (nuevoEstado === PAYMENT_STATUS.PAGADO && voucher.service_payment_status === SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE) {
            updateData.service_payment_status = SERVICE_PAYMENT_STATUS.CLEARED;
        }

        await docRef.update(updateData);

        result.success = true;
        result.voucher = {
            ...voucher,
            ...updateData,
            pagos: [...voucher.pagos, pagoRecord]
        };

    } catch (err) {
        result.error = err.message;
        console.error('[PAYMENT-CONTROL] Error registrando pago:', err);
    }

    return result;
}

// ============================================================================
// CONSULTAS DE ESTADO
// ============================================================================

/**
 * Obtiene el estado de pago formateado
 * @param {Object} voucher - Bono
 * @returns {Object} - { status, color, label, icon, canReserve, needsPayment }
 */
function getPaymentStatus(voucher) {
    const v = normalizePaymentFields(voucher);
    const totalPrice = parseFloat(v.snapshot_price) || parseFloat(v.precio) || parseFloat(v.importe) || 0;

    const status = {
        estado: v.estado_pago,
        total: totalPrice,
        pagado: v.importe_pagado,
        pendiente: v.importe_pendiente,
        color: PAYMENT_COLORS[v.estado_pago] || PAYMENT_COLORS.pendiente,
        label: v.estado_pago.toUpperCase(),
        icon: getPaymentIcon(v.estado_pago),
        canReserve: v.estado_pago === PAYMENT_STATUS.PAGADO,
        needsPayment: v.estado_pago !== PAYMENT_STATUS.PAGADO,
        servicePending: v.service_payment_status === SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE,
        pagos: v.pagos || []
    };

    return status;
}

/**
 * Obtiene icono para estado de pago
 */
function getPaymentIcon(estado) {
    switch (estado) {
        case PAYMENT_STATUS.PAGADO:
            return '💳✅';
        case PAYMENT_STATUS.PARCIAL:
            return '💳⚠️';
        case PAYMENT_STATUS.PENDIENTE:
        default:
            return '💳❌';
    }
}

/**
 * Verifica si se puede iniciar servicio
 * @param {Object} voucher - Bono
 * @returns {Object} - { allowed, reason, needsPayment, pendingAmount }
 */
function canStartService(voucher) {
    const v = normalizePaymentFields(voucher);

    const result = {
        allowed: true,
        reason: null,
        needsPayment: false,
        pendingAmount: v.importe_pendiente
    };

    // Si está pagado, siempre permitido
    if (v.estado_pago === PAYMENT_STATUS.PAGADO) {
        return result;
    }

    // Si está cleared después de continuar sin pagar, permitido
    if (v.service_payment_status === SERVICE_PAYMENT_STATUS.CLEARED) {
        return result;
    }

    // Si tiene pago pendiente
    if (v.estado_pago === PAYMENT_STATUS.PENDIENTE || v.estado_pago === PAYMENT_STATUS.PARCIAL) {
        result.allowed = false;
        result.needsPayment = true;
        result.reason = `Pendiente de cobro: ${v.importe_pendiente.toFixed(2)}€`;
    }

    return result;
}

// ============================================================================
// ACCIONES DE FLUJO
// ============================================================================

/**
 * Marca un bono para continuar sin pagar (antes de reservar)
 * @param {string} voucherId - ID del bono
 * @param {Object} options - { collection, usuario }
 * @returns {Promise<Object>} - Resultado
 */
async function continueWithoutPayment(voucherId, options = {}) {
    const result = { success: false, error: null };

    try {
        if (typeof db === 'undefined') {
            throw new Error('Firestore no disponible');
        }

        const collection = options.collection || 'local_sales';
        const docRef = db.collection(collection).doc(voucherId);

        await docRef.update({
            service_payment_status: SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE,
            updated_at: new Date().toISOString(),
            pending_payment_by: options.usuario || 'sistema'
        });

        result.success = true;

    } catch (err) {
        result.error = err.message;
        console.error('[PAYMENT-CONTROL] Error en continueWithoutPayment:', err);
    }

    return result;
}

/**
 * Marca pago como resuelto después de servicio
 * @param {string} voucherId - ID del bono
 * @param {Object} options - { collection }
 * @returns {Promise<Object>} - Resultado
 */
async function markPaymentCleared(voucherId, options = {}) {
    const result = { success: false, error: null };

    try {
        if (typeof db === 'undefined') {
            throw new Error('Firestore no disponible');
        }

        const collection = options.collection || 'local_sales';
        const docRef = db.collection(collection).doc(voucherId);

        await docRef.update({
            service_payment_status: SERVICE_PAYMENT_STATUS.CLEARED,
            updated_at: new Date().toISOString()
        });

        result.success = true;

    } catch (err) {
        result.error = err.message;
        console.error('[PAYMENT-CONTROL] Error en markPaymentCleared:', err);
    }

    return result;
}

// ============================================================================
// FILTROS Y BÚSQUEDA
// ============================================================================

/**
 * Filtra bonos por estado de pago
 * @param {Array} vouchers - Lista de bonos
 * @param {string} filter - 'pagado' | 'pendiente' | 'parcial' | 'pending_service' | ''
 * @returns {Array} - Bonos filtrados
 */
function filterByPaymentStatus(vouchers, filter) {
    if (!filter || filter === 'all' || filter === '') {
        return vouchers;
    }

    return vouchers.filter(v => {
        const normalized = normalizePaymentFields(v);

        if (filter === 'pending_service') {
            return normalized.service_payment_status === SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE;
        }

        return normalized.estado_pago === filter;
    });
}

/**
 * Calcula totales de pago para un conjunto de bonos
 * @param {Array} vouchers - Lista de bonos
 * @returns {Object} - { totalVentas, totalPagado, totalPendiente, countByStatus }
 */
function calculatePaymentTotals(vouchers) {
    const totals = {
        totalVentas: 0,
        totalPagado: 0,
        totalPendiente: 0,
        countByStatus: {
            pagado: 0,
            pendiente: 0,
            parcial: 0,
            pending_service: 0
        }
    };

    vouchers.forEach(v => {
        const normalized = normalizePaymentFields(v);
        const total = parseFloat(normalized.snapshot_price) || parseFloat(normalized.precio) || 0;

        totals.totalVentas += total;
        totals.totalPagado += normalized.importe_pagado;
        totals.totalPendiente += normalized.importe_pendiente;
        totals.countByStatus[normalized.estado_pago] = (totals.countByStatus[normalized.estado_pago] || 0) + 1;

        if (normalized.service_payment_status === SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE) {
            totals.countByStatus.pending_service++;
        }
    });

    return totals;
}

// ============================================================================
// UTILIDADES UI
// ============================================================================

/**
 * Genera HTML para badge de estado de pago
 * @param {Object} voucher - Bono
 * @returns {string} - HTML del badge
 */
function renderPaymentBadge(voucher) {
    const status = getPaymentStatus(voucher);
    return `<span class="payment-badge payment-${status.estado}" style="background-color: ${status.color}20; color: ${status.color}; border: 1px solid ${status.color};">${status.icon} ${status.label}</span>`;
}

/**
 * Genera HTML para bloque de pago en modal
 * @param {Object} voucher - Bono
 * @returns {string} - HTML del bloque
 */
function renderPaymentBlock(voucher) {
    const status = getPaymentStatus(voucher);
    const voucherId = voucher.id || voucher.bono || voucher.codigo;
    const collection = (voucher.origen || '').toLowerCase().includes('woo') ? 'woo_sales' : 'spa_vouchers';

    return `
        <div class="payment-block" style="border-left: 4px solid ${status.color}; padding: 12px; margin: 12px 0; background: ${status.color}10;">
            <h4 style="margin: 0 0 8px 0;">💳 PAGO DEL BONO</h4>
            <div class="payment-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
                <div><small>Total</small><br><strong>${status.total.toFixed(2)}€</strong></div>
                <div><small>Pagado</small><br><strong style="color: #22c55e;">${status.pagado.toFixed(2)}€</strong></div>
                <div><small>Pendiente</small><br><strong style="color: ${status.pendiente > 0 ? '#ef4444' : '#22c55e'};">${status.pendiente.toFixed(2)}€</strong></div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                ${renderPaymentBadge(voucher)}
                ${status.needsPayment ? `<button class="btn btn-sm btn-outline" style="border-color: #22c55e; color: #22c55e;" onclick="SpaPaymentControl.openPaymentModal('${voucherId}', '${collection}')"><i class="fas fa-money-bill-wave"></i> Registrar Pago</button>` : ''}
            </div>
            ${status.pagos.length > 0 ? renderPaymentHistory(status.pagos) : ''}
        </div>
    `;
}

/**
 * Genera HTML para historial de pagos
 * @param {Array} pagos - Historial de pagos
 * @returns {string} - HTML
 */
function renderPaymentHistory(pagos) {
    if (!pagos || pagos.length === 0) return '';

    const rows = pagos.map(p => `
        <tr>
            <td>${new Date(p.fecha).toLocaleDateString()}</td>
            <td>${p.importe.toFixed(2)}€</td>
            <td>${p.metodo}</td>
            <td>${p.usuario}</td>
        </tr>
    `).join('');

    return `
        <details style="margin-top: 8px;">
            <summary style="cursor: pointer; font-size: 12px;">Historial de pagos (${pagos.length})</summary>
            <table style="width: 100%; font-size: 11px; margin-top: 4px;">
                <thead><tr><th>Fecha</th><th>Importe</th><th>Método</th><th>Usuario</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </details>
    `;
}

/**
 * Genera HTML para TAG de pendiente en agenda
 * @param {Object} voucher - Bono
 * @returns {string} - HTML del tag o vacío
 */
function renderPendingPaymentTag(voucher) {
    const v = normalizePaymentFields(voucher);

    if (v.service_payment_status === SERVICE_PAYMENT_STATUS.PENDING_BEFORE_SERVICE) {
        return `<span class="tag pending-payment" style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">⚠ PENDIENTE DE COBRO</span>`;
    }

    return '';
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.SpaPaymentControl = {
        // Constantes
        STATUS: PAYMENT_STATUS,
        SERVICE_STATUS: SERVICE_PAYMENT_STATUS,
        METHODS: PAYMENT_METHODS,
        COLORS: PAYMENT_COLORS,

        // Inicialización
        initializePaymentFields,
        normalizePaymentFields,

        // Pagos
        registerPayment,
        getPaymentStatus,
        canStartService,
        continueWithoutPayment,
        markPaymentCleared,

        // Filtros
        filterByPaymentStatus,
        calculatePaymentTotals,

        // UI
        renderPaymentBadge,
        renderPaymentBlock,
        renderPaymentHistory,
        renderPendingPaymentTag,
        getPaymentIcon,

        // Estado interno para modales
        _currentVoucherId: null,
        _currentCollection: null,

        // Modal helpers
        openPaymentModal: async function (voucherId, collection) {
            this._currentVoucherId = voucherId;
            this._currentCollection = collection || 'spa_vouchers';
            const modal = document.getElementById('paymentModal');
            if (modal) modal.style.display = 'flex';

            // Pre-fill amount with pending amount
            try {
                if (typeof db !== 'undefined' && voucherId) {
                    const doc = await db.collection(this._currentCollection).doc(voucherId).get();
                    if (doc.exists) {
                        const voucher = normalizePaymentFields({ id: doc.id, ...doc.data() });
                        const amountInput = document.getElementById('pay-amount');
                        if (amountInput && voucher.importe_pendiente > 0) {
                            amountInput.value = voucher.importe_pendiente.toFixed(2);
                        }
                        // Also set today's date as default
                        const dateInput = document.getElementById('pay-date');
                        if (dateInput && !dateInput.value) {
                            dateInput.value = new Date().toISOString().split('T')[0];
                        }
                    }
                }
            } catch (err) {
                console.warn('[PAYMENT] Error pre-loading pending amount:', err);
            }
        },

        closePaymentModal: function () {
            const modal = document.getElementById('paymentModal');
            if (modal) modal.style.display = 'none';
            // Clear form
            const amountInput = document.getElementById('pay-amount');
            if (amountInput) amountInput.value = '';
        },

        submitPayment: async function () {
            const importe = parseFloat(document.getElementById('pay-amount')?.value);
            const metodo = document.getElementById('pay-method')?.value || 'efectivo';
            const fecha = document.getElementById('pay-date')?.value || new Date().toISOString();
            const usuario = document.getElementById('pay-user')?.value || 'recepcion';

            if (!this._currentVoucherId) {
                alert('Error: No hay bono seleccionado');
                return;
            }

            if (isNaN(importe) || importe <= 0) {
                alert('Error: Introduce un importe válido');
                return;
            }

            // Show loading state
            const submitBtn = document.querySelector('#paymentModal button[onclick*="submitPayment"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
            }

            const result = await registerPayment(this._currentVoucherId, {
                importe, metodo, fecha, usuario
            }, { collection: this._currentCollection });

            // Restore button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
            }

            if (result.success) {
                // === AUTO-REFRESH UI ===

                // 1. Update inline payment block in modal (if visible)
                const paymentBlockEl = document.getElementById('vm-payment-block');
                if (paymentBlockEl && result.voucher) {
                    paymentBlockEl.innerHTML = renderPaymentBlock(result.voucher);
                }

                // 2. Refresh voucher list
                if (typeof cargarBonos === 'function') {
                    cargarBonos();
                } else if (typeof loadVouchers === 'function') {
                    loadVouchers();
                }

                // 3. Refresh voucher modal if open
                if (typeof openVoucherManagement === 'function') {
                    const openCode = document.getElementById('vm-code')?.value;
                    if (openCode) {
                        setTimeout(() => openVoucherManagement(openCode), 100);
                    }
                }

                if (typeof refreshAgenda === 'function') {
                    refreshAgenda();
                } else if (typeof loadReservas === 'function') {
                    loadReservas();
                    // Refrescar bloque de pago en modal si está abierto
                    if (typeof updatePaymentControlBlock === 'function') {
                        setTimeout(updatePaymentControlBlock, 100);
                    }
                }

                // 5. Show success toast or alert
                if (typeof showToast === 'function') {
                    showToast('✅ Pago registrado correctamente', 'success');
                } else {
                    alert('✅ Pago registrado correctamente');
                }

                // 6. Close payment modal
                this.closePaymentModal();

                // 7. Dispatch event for other listeners
                window.dispatchEvent(new CustomEvent('payment-registered', {
                    detail: { voucherId: this._currentVoucherId, voucher: result.voucher }
                }));

            } else {
                alert('Error: ' + result.error);
            }
        }
    };

    // === FALLBACK STUBS ===
    // Ensure refresh functions exist (fallback to reload if not implemented)
    window.refreshVoucherModal = window.refreshVoucherModal || (() => {
        const openCode = document.getElementById('vm-code')?.value;
        if (openCode && typeof openVoucherManagement === 'function') {
            openVoucherManagement(openCode);
        }
    });
    window.loadVouchers = window.loadVouchers || (() => {
        if (typeof cargarBonos === 'function') cargarBonos();
    });
    window.refreshAgenda = window.refreshAgenda || (() => {
        if (typeof loadReservas === 'function') loadReservas();
    });
    // === END FALLBACK STUBS ===

    console.log('[SPA-PAYMENT-CONTROL] ✅ Loaded');
}
