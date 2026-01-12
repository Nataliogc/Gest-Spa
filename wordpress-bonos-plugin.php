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
            'product_id'    => count($items_data) === 1 ? $items_data[0]['product_id'] : null,
            'variation_id'  => count($items_data) === 1 ? $items_data[0]['variation_id'] : null,
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

add_action('rest_api_init', function () {
    register_rest_route('robahotel/v1', '/health', [
        'methods'  => 'GET',
        'callback' => function() {
            return [
                'status' => 'ok',
                'plugin' => 'RobaHotel Bonos API',
                'version' => '1.1.0',
                'timestamp' => current_time('mysql'),
                'cache_enabled' => true
            ];
        },
        'permission_callback' => '__return_true'
    ]);
    
    // Endpoint para obtener TODOS los pedidos (cualquier estado)
    register_rest_route('robahotel/v1', '/pedidos', [
        'methods'  => 'GET',
        'callback' => 'robahotel_get_pedidos',
        'permission_callback' => '__return_true',
        'args' => [
            'per_page' => ['default' => 50, 'sanitize_callback' => 'absint'],
            'page' => ['default' => 1, 'sanitize_callback' => 'absint'],
            'status' => ['default' => 'cancelled,pending,failed,on-hold,refunded', 'sanitize_callback' => 'sanitize_text_field'],
            'desde' => ['default' => '', 'sanitize_callback' => 'sanitize_text_field']
        ]
    ]);
    
    // Endpoint para enviar email de recuperación de carrito
    register_rest_route('robahotel/v1', '/send-recovery-email', [
        'methods'  => 'POST',
        'callback' => 'robahotel_send_recovery_email',
        'permission_callback' => '__return_true',
        'args' => [
            'order_id' => ['required' => true, 'sanitize_callback' => 'absint']
        ]
    ]);
});

/**
 * Obtener pedidos de cualquier estado
 */
function robahotel_get_pedidos($request) {
    $per_page = $request->get_param('per_page');
    $page = $request->get_param('page');
    $status_str = $request->get_param('status');
    $desde = $request->get_param('desde');
    
    // Parsear estados
    $statuses = array_map('trim', explode(',', $status_str));
    
    $args = [
        'limit' => min($per_page, 100),
        'page' => $page,
        'status' => $statuses,
        'orderby' => 'date',
        'order' => 'DESC',
    ];
    
    if (!empty($desde)) {
        $args['date_created'] = '>=' . $desde;
    }
    
    $orders = wc_get_orders($args);
    $result = [];
    
    foreach ($orders as $order) {
        $items_data = [];
        $total_price = 0;
        $product_names = [];
        
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items_data[] = [
                'nombre' => $item->get_name(),
                'cantidad' => $item->get_quantity(),
                'precio' => (float) $item->get_total(),
                'product_id' => $product ? $product->get_id() : 0,
                'imagen' => $product ? wp_get_attachment_url($product->get_image_id()) : '',
            ];
            $total_price += (float) $item->get_total();
            $product_names[] = $item->get_name();
        }
        
        $result[] = [
            'order_id'      => $order->get_id(),
            'estado'        => $order->get_status(),
            'estado_label'  => wc_get_order_status_name($order->get_status()),
            'cliente'       => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
            'email'         => $order->get_billing_email(),
            'telefono'      => $order->get_billing_phone(),
            'total'         => $total_price,
            'fecha'         => $order->get_date_created()->date('Y-m-d'),
            'fecha_hora'    => $order->get_date_created()->date('Y-m-d H:i:s'),
            'productos'     => implode(', ', $product_names),
            'items'         => $items_data,
            'notas'         => $order->get_customer_note(),
            'payment_method'=> $order->get_payment_method_title(),
        ];
    }
    
    return $result;
}

/**
 * Enviar email de recuperación de carrito
 */
function robahotel_send_recovery_email($request) {
    $order_id = $request->get_param('order_id');
    $order = wc_get_order($order_id);
    
    if (!$order) {
        return new WP_Error('not_found', 'Pedido no encontrado', ['status' => 404]);
    }
    
    $customer_email = $order->get_billing_email();
    $customer_name = $order->get_billing_first_name();
    
    // Construir lista de productos
    $items_html = '<ul style="list-style: none; padding: 0;">';
    foreach ($order->get_items() as $item) {
        $items_html .= '<li style="padding: 10px 0; border-bottom: 1px solid #eee;">';
        $items_html .= '<strong>' . $item->get_name() . '</strong>';
        $items_html .= ' - ' . wc_price($item->get_total());
        $items_html .= '</li>';
    }
    $items_html .= '</ul>';
    
    // URL de checkout para recuperar el pedido
    $checkout_url = wc_get_checkout_url() . '?recover_order=' . $order_id;
    
    $subject = '¡Tu experiencia de bienestar te espera! - Cumbria Bienestar';
    
    $message = '
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #d4af37 0%, #c9a227 100%); border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Cumbria Bienestar</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Hola ' . esc_html($customer_name) . ',</h2>
            
            <p style="color: #666; font-size: 16px;">
                Notamos que dejaste algunos productos increíbles en tu carrito. 
                ¡Tu momento de relax está a solo un click!
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Tu selección:</h3>
                ' . $items_html . '
                <p style="font-size: 18px; font-weight: bold; color: #d4af37; text-align: right;">
                    Total: ' . wc_price($order->get_total()) . '
                </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="' . esc_url($checkout_url) . '" 
                   style="background: #d4af37; color: white; padding: 15px 40px; 
                          text-decoration: none; border-radius: 25px; font-weight: bold;
                          display: inline-block;">
                    Completar mi reserva
                </a>
            </div>
            
            <p style="color: #999; font-size: 12px; text-align: center;">
                Si tienes alguna pregunta, no dudes en contactarnos.<br>
                © Cumbria Bienestar - Tu espacio de relax
            </p>
        </div>
    </div>';
    
    $headers = ['Content-Type: text/html; charset=UTF-8'];
    
    $sent = wp_mail($customer_email, $subject, $message, $headers);
    
    if ($sent) {
        // Añadir nota al pedido
        $order->add_order_note('Email de recuperación enviado desde Zenith Manager');
        return [
            'success' => true,
            'message' => 'Email enviado a ' . $customer_email,
            'order_id' => $order_id
        ];
    } else {
        return new WP_Error('email_failed', 'Error enviando email', ['status' => 500]);
    }
}
