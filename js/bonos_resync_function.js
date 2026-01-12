// ============================================
// FORCE RE-SYNC FROM WOOCOMMERCE
// ============================================
window.resyncVoucherFromWooCommerce = async function () {
    const code = document.getElementById("vm-code").value;
    if (!code) {
        showToast("No hay código de bono para sincronizar", "error");
        return;
    }

    const btn = document.getElementById("vm-resync-btn");
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';

    try {
        // Fetch fresh data from WooCommerce using the optimized endpoint
        console.log(`[RESYNC] Fetching fresh data for ${code} from WooCommerce...`);

        let freshVouchers = [];
        if (typeof fetchBonosDirect === 'function') {
            try {
                freshVouchers = await fetchBonosDirect({ per_page: 100 }, 10000);
            } catch (e) {
                console.warn('[RESYNC] Failed with optimized endpoint, trying fallback');
                if (typeof fetchBonosWithFallback === 'function') {
                    freshVouchers = await fetchBonosWithFallback(10000);
                } else {
                    throw new Error("No hay funciones de sincronización disponibles");
                }
            }
        } else {
            if (typeof fetchBonosWithFallback === 'function') {
                freshVouchers = await fetchBonosWithFallback(10000);
            } else {
                throw new Error("No hay funciones de sincronización disponibles");
            }
        }

        if (!Array.isArray(freshVouchers)) {
            throw new Error("Formato de respuesta inválido");
        }

        // Find the matching voucher
        const freshVoucher = freshVouchers.find(v => v.bono === code);
        if (!freshVoucher) {
            throw new Error(`Bono ${code} no encontrado en WooCommerce`);
        }

        console.log(`[RESYNC] Fresh data found:`, freshVoucher);

        // Extract price from fresh data
        let freshPrice = parseFloat(freshVoucher.precio) || parseFloat(freshVoucher.importe) || 0;

        if (freshPrice === 0) {
            freshPrice = parseFloat(freshVoucher.line_total) || parseFloat(freshVoucher.subtotal) ||
                parseFloat(freshVoucher.item_total) || parseFloat(freshVoucher.total) ||
                parseFloat(freshVoucher.order_total) || 0;
        }

        // Sum from items_desglosados if available
        if (freshPrice === 0 && freshVoucher.items_desglosados && Array.isArray(freshVoucher.items_desglosados)) {
            freshPrice = freshVoucher.items_desglosados.reduce((sum, item) => {
                return sum + (parseFloat(item.precio) || parseFloat(item.price) || parseFloat(item.total) || 0);
            }, 0);
        }

        if (freshPrice === 0) {
            throw new Error("No se pudo determinar el precio del bono desde WooCommerce");
        }

        console.log(`[RESYNC] Price extracted: ${freshPrice}€`);

        // Update Firestore
        const docRef = db.collection("spa_vouchers").doc(code);
        const updateData = {
            importe: freshPrice,
            precio: freshPrice,
            fecha: freshVoucher.fecha || freshVoucher.fecha_compra || freshVoucher.date_created || null,
            items_desglosados: (typeof resolveVoucherBreakdown === 'function') ? resolveVoucherBreakdown(freshVoucher) : (freshVoucher.items_desglosados || []),
            product_id: freshVoucher.product_id || null,
            variation_id: freshVoucher.variation_id || null,
            manual_update: false, // Remove manual protection to allow future auto-syncs
            last_synced: new Date().toISOString()
        };

        // Fallback for IDs if missing in top level
        if (!updateData.product_id && updateData.items_desglosados.length === 1) {
            updateData.product_id = updateData.items_desglosados[0].product_id || updateData.items_desglosados[0].id;
            updateData.variation_id = updateData.items_desglosados[0].variation_id;
        }

        // Also update client info if available
        if (freshVoucher.cliente && freshVoucher.cliente !== "Nombre Cliente") {
            updateData.cliente = freshVoucher.cliente;
        }
        if (freshVoucher.email && freshVoucher.email.includes("@")) {
            updateData.email = freshVoucher.email;
        }
        if (freshVoucher.telefono && freshVoucher.telefono.length > 5) {
            updateData.telefono = freshVoucher.telefono;
        }

        await docRef.update(updateData);

        console.log(`[RESYNC] ✅ Voucher ${code} updated in Firestore`);

        // Update local state
        const localVoucher = state.bonos.find(b => b.bono === code);
        if (localVoucher) {
            Object.assign(localVoucher, updateData);
        }

        showToast(`✅ Bono re-sincronizado: ${freshPrice.toFixed(2)}€`, "success");

        // Reload the modal with fresh data
        setTimeout(() => {
            closeVoucherModal();
            setTimeout(() => openVoucherManagement(code), 300);
        }, 1000);

    } catch (error) {
        console.error("[RESYNC] Error:", error);
        showToast("❌ Error al re-sincronizar: " + error.message, "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};
