<?php
/**
 * Plugin Name: RobaHotel Bonos API
 * Description: Endpoint REST optimizado para sincronización de bonos con cache inteligente
 * Version: 1.0.0
 * Author: Zenith Manager
 */

if (!defined('ABSPATH')) exit;

/**
 * Registrar endpoint REST personalizado
 */
add_action('rest_api_init', function () {
    register_rest_route('robahotel/v1', '/bonos', [
        'methods'  => 'GET',
        'callback' => 'robahotel_get_bonos',
        'permission_callback' => '__return_true', // Cambiar a autenticación si es necesario
        'args' => [
            'per_page' => [
                'default' => 30,
                'sanitize_callback' => 'absint',
            ],
            'page' => [
                'default' => 1,
                'sanitize_callback' => 'absint',
            ],
            'desde' => [
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ]
        ]
    ]);
});

/**
 * Obtener bonos optimizado con cache
 */
function robahotel_get_bonos($request) {
    $per_page = $request->get_param('per_page');
    $page = $request->get_param('page');
    $desde = $request->get_param('desde');
    
    // Clave de cache única por parámetros
    $cache_key = 'robahotel_bonos_' . md5(serialize([$per_page, $page, $desde]));
    
    // Intentar obtener del cache
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        header('X-Cache: HIT');
        return $cached;
    }
    
    header('X-Cache: MISS');
    
    // Preparar argumentos de consulta
    $args = [
        'limit' => min($per_page, 100), // Máximo 100 por seguridad
        'page' => $page,
        'status' => ['completed'], // Solo pedidos completados
        'orderby' => 'date',
        'order' => 'DESC',
    ];
    
    // Filtro por fecha si se especifica
    if (!empty($desde)) {
        $args['date_created'] = '>=' . $desde;
    }
    
    $orders = wc_get_orders($args);
    $result = [];
    
    foreach ($orders as $order) {
        // Agrupar todos los items del pedido en un solo bono
        $items_data = [];
        $total_price = 0;
        $product_names = [];
        
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            if (!$product) continue;
            
            $items_data[] = [
                'nombre' => $item->get_name(),
                'cantidad' => $item->get_quantity(),
                'precio' => (float) $item->get_total(),
                'product_id' => $product->get_id(),
                'variation_id' => $item->get_variation_id(),
            ];
            
            $total_price += (float) $item->get_total();
            $product_names[] = $item->get_name();
        }
        
        // Si el pedido no tiene items, saltar
        if (empty($items_data)) continue;
        
        // Generar código de bono único por pedido
        $codigo_bono = 'BONO' . $order->get_id();
        
        // Nombre del producto: si es un solo item, usar su nombre; si son varios, combinarlos
        $producto_nombre = count($product_names) === 1 
            ? $product_names[0] 
            : implode(' + ', array_slice($product_names, 0, 3)) . (count($product_names) > 3 ? '...' : '');
        
        // Construir respuesta con solo campos esenciales
        $result[] = [
            'bono'          => $codigo_bono,
            'producto'      => $producto_nombre,
            'cliente'       => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'email'         => $order->get_billing_email(),
            'telefono'      => $order->get_billing_phone(),
            'precio'        => $total_price,
            'importe'       => $total_price,
            'fecha'         => $order->get_date_created()->date('Y-m-d'),
            'fecha_compra'  => $order->get_date_created()->date('Y-m-d H:i:s'),
            'order_id'      => $order->get_id(),
            'items_desglosados' => $items_data, // Desglose de items para la app
        ];
    }
    
    // Guardar en cache por 5 minutos
    set_transient($cache_key, $result, 300);
    
    return $result;
}

/**
 * Invalidar cache cuando se completa un pedido
 */
add_action('woocommerce_order_status_completed', 'robahotel_invalidate_bonos_cache');
add_action('woocommerce_order_status_changed', 'robahotel_invalidate_bonos_cache');

function robahotel_invalidate_bonos_cache() {
    global $wpdb;
    
    // Eliminar todos los transients de bonos
    $wpdb->query(
        "DELETE FROM {$wpdb->options} 
         WHERE option_name LIKE '_transient_robahotel_bonos_%' 
         OR option_name LIKE '_transient_timeout_robahotel_bonos_%'"
    );
    
    error_log('RobaHotel: Cache de bonos invalidado');
}

/**
 * Endpoint de salud para verificar que el plugin funciona
 */
add_action('rest_api_init', function () {
    register_rest_route('robahotel/v1', '/health', [
        'methods'  => 'GET',
        'callback' => function() {
            return [
                'status' => 'ok',
                'plugin' => 'RobaHotel Bonos API',
                'version' => '1.0.0',
                'timestamp' => current_time('mysql'),
                'cache_enabled' => true
            ];
        },
        'permission_callback' => '__return_true'
    ]);
});
