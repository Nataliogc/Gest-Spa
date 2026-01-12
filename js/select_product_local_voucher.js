// ============================================
// SELECT PRODUCT FOR LOCAL VOUCHER
// ============================================
window.selectProductForLocalVoucher = function (productData) {
    console.log('[LOCAL VOUCHER] Product selected:', productData);

    // Si productData es un string (legacy), convertirlo a objeto
    if (typeof productData === 'string') {
        productData = { nombre: productData };
    }

    // Find full product details from catalog if not already complete
    if (!productData.wc_id && !productData.id) {
        const catalogProduct = state.catalogProducts.find(p =>
            p.nombre === productData.nombre
        );

        if (catalogProduct) {
            productData = {
                ...catalogProduct,
                nombre: catalogProduct.nombre,
                wc_id: catalogProduct.wc_id,
                id: catalogProduct.id,
                product_id: catalogProduct.product_id || catalogProduct.wc_id,
                precio: catalogProduct.precio,
                sesiones: catalogProduct.sesiones || 1,
                pax: catalogProduct.pax || catalogProduct.personas || 1,
                espacio: catalogProduct.espacio
            };
        }
    }

    // Add to cart state (create array if doesn't exist)
    if (!state.localVoucherCart) {
        state.localVoucherCart = [];
    }

    // Add product with IDs to cart
    state.localVoucherCart.push({
        name: productData.nombre,
        wc_id: productData.wc_id,
        id: productData.id,
        product_id: productData.product_id || productData.wc_id,
        variation_id: productData.variation_id || null,
        price: parseFloat(productData.precio) || 0,
        sessions: parseInt(productData.sesiones) || 1,
        pax: parseInt(productData.pax) || 1,
        space: productData.espacio || '',
        used: 0
    });

    console.log('[LOCAL VOUCHER] Current cart:', state.localVoucherCart);

    // Render cart (need to implement renderLocalVoucherCart)
    if (typeof renderLocalVoucherCart === 'function') {
        renderLocalVoucherCart();
    }

    // Hide search results
    const resultsDiv = document.getElementById("lv-search-results");
    if (resultsDiv) resultsDiv.style.display = 'none';

    // Clear search
    const searchInput = document.getElementById("lv-search");
    if (searchInput) searchInput.value = '';
};
