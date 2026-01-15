# 📋 AUDITORÍA DE CONFIGURACIÓN - ZENITH MANAGER
## Fecha: 15/01/2026
## Versión: Producción Actual

---

# 1. CONFIGURACIÓN GENERAL ACTIVA

## 1.1 Firebase / Base de Datos
| Parámetro | Valor Actual |
|-----------|--------------|
| Proyecto | `gest-spa` |
| Auth Domain | `gest-spa.firebaseapp.com` |
| Storage Bucket | `gest-spa.appspot.com` |
| Modo de Conexión | Long Polling (`experimentalForceLongPolling: true`) |

## 1.2 Módulos Activados
| Módulo | Código | Colección Firestore | Capacidad | Tipo Vista | Requiere Staff |
|--------|--------|---------------------|-----------|------------|----------------|
| Circuito Spa | `spa` | `reservas_spa` | 20 pax | Grid (slots) | ❌ No |
| Suite Spa | `suite` | `reservas_suite` | 1 | Timeline | ❌ No |
| Panacea (Salas) | `panacea` | `reservas_panacea` | 1 | Timeline | ✅ Sí |
| Sala VIP | `vip` | `reservas_vip` | 1 | Timeline | ✅ Sí |
| Peluquería | `peluqueria` | `reservas_peluqueria` | 2 | Timeline | ✅ Sí |
| Cabina 1 | `cabina1` | `reservas_cabina1` | 1 | Timeline | ✅ Sí |
| Cabina 2 | `cabina2` | `reservas_cabina2` | 1 | Timeline | ✅ Sí |
| Cabina 3 | `cabina3` | `reservas_cabina3` | 1 | Timeline | ✅ Sí |
| Cabinas (wrapper) | `cabinas` | N/A | 0 | Timeline | ❌ No |

## 1.3 Parámetros Globales del Sistema
| Parámetro | Valor por Defecto | Ubicación |
|-----------|-------------------|-----------|
| Capacidad SPA | 20 personas | `spa_config.settings.capacity` |
| Tiempo de Limpieza | 30 minutos | `spa_config.settings.cleaningTime` |
| Días Cerrados | Array configurable | `spa_config.settings.closedDates` |
| Plantilla WhatsApp | Configurable | `spa_config.settings.whatsappTemplate` |

## 1.4 Colecciones de Firestore Utilizadas
| Colección | Propósito |
|-----------|-----------|
| `reservas_spa` | Reservas del circuito Spa |
| `reservas_suite` | Reservas de la Suite |
| `reservas_panacea` | Reservas Sala Panacea |
| `reservas_vip` | Reservas Sala VIP |
| `reservas_peluqueria` | Reservas Peluquería |
| `reservas_cabina1` | Reservas Cabina 1 |
| `reservas_cabina2` | Reservas Cabina 2 |
| `reservas_cabina3` | Reservas Cabina 3 |
| `spa_services` | Catálogo de servicios |
| `spa_item_master` | Items maestros (componentes) |
| `spa_vouchers` | Bonos/Vouchers |
| `spa_config` | Configuración global |
| `config_personal` | Configuración de personal |
| `local_sales` | Ventas locales |

---

# 2. CONFIGURACIÓN DE SERVICIOS

## 2.1 Catálogo de Servicios
- **Fuente**: Colección `spa_services`
- **Filtro activo**: Solo servicios con `active === true`
- **Campos principales**:
  - `nombre`: Nombre del servicio
  - `precio`: Precio base
  - `categoria`: Categoría (circuito, complemento, gimnasio, etc.)
  - `pax`: PAX incluido en precio fijo (si > 0, bloquea cambio de PAX)
  - `duracion`: Duración en minutos
  - `items_incluidos`: Array de componentes incluidos

## 2.2 Lógica de Cálculo de Precios

### Módulo SPA - Precio Dinámico
| Origen | Entre Semana (L-J) | Fin de Semana (V-D) |
|--------|-------------------|---------------------|
| **Particular** | 25€/pax | 25€/pax |
| **Hotel - NO Incluidos** | 12€/pax | 18€/pax |
| **Hotel - Incluido** | 0€ (cortesía) | 0€ (cortesía) |
| **Bono Spa (Interno)** | 0€ (prepagado) | 0€ (prepagado) |
| **Smartbox** | 0€ (prepagado) | 0€ (prepagado) |
| **Wonderbox** | 0€ (prepagado) | 0€ (prepagado) |
| **Ego Experiencias** | 0€ (prepagado) | 0€ (prepagado) |

### Otros Módulos - Precio del Catálogo
- Se usa `serviceData.precio` directamente
- Si el servicio tiene `pax > 0` → Precio fijo (no multiplica por PAX)

### Fórmula de Total
```
Total = (Precio por PAX × Cantidad PAX) + Suma de Extras
```

## 2.3 Items Maestros (`spa_item_master`)
| Campo | Descripción |
|-------|-------------|
| `code` | Código único (ItXXX) |
| `name` | Nombre del item |
| `duration` | Duración en minutos |
| `allowedSpaces` | Array de espacios permitidos |
| `pax_max` | Máximo PAX permitido |
| `agenda_required` | Si requiere reserva en agenda |

### Espacios Válidos
- `spa`, `suite`, `vip`, `panacea`
- `cabina`, `cabina1`, `cabina2`, `cabina3`
- `peluqueria`
- `null` → Sin agenda (gimnasio, complementos)

### Espacios Inválidos (Bloqueados)
- `bono` → Automáticamente convertido a `null`
- `gym`, `gimnasio`, `fitness` → Convertido a `null` (agenda-less)

---

# 3. CONFIGURACIÓN DE ORÍGENES Y CANALES

## 3.1 Orígenes Configurados
| Código | Nombre UI | Requiere Pago | Campos Visibles |
|--------|-----------|---------------|-----------------|
| `particular` | Particular (Pago Directo) | ✅ Sí | Control de pago |
| `hotel_inc` | Hotel - Incluido | ❌ No | Hotel, Habitación |
| `hotel_no_inc` | Hotel - NO Incluidos | ✅ Sí | Hotel, Habitación, Control de pago |
| `bono` | Bono Spa (Interno) | ❌ No | ID Bono, Sesiones |
| `smartbox` | Smartbox | ❌ No | ID Bono |
| `wonderbox` | Wonderbox | ❌ No | ID Bono |
| `ego` | Ego Experiencias | ❌ No | ID Bono |

## 3.2 Reglas por Origen

### Orígenes con Pago
- `particular`, `hotel_no_inc`
- Muestran bloque de "Control de Pago"
- Precio por PAX se calcula dinámicamente
- Campos Total, Pagado, Pendiente visibles

### Orígenes Sin Pago (Cortesía/Prepagado)
- `hotel_inc`, `bono`, `smartbox`, `wonderbox`, `ego`
- Precio por PAX → 0.00€
- Campo precio deshabilitado (opacity 0.3)
- No muestran bloque de pago

### Orígenes Hotel
- `hotel_inc`, `hotel_no_inc`
- Muestran selector de Hotel (Cumbria, Guadiana)
- Muestran campo de Habitación/Reserva

### Orígenes Voucher
- `bono`, `smartbox`, `wonderbox`, `ego`
- Muestran campo ID Bono/Cupón
- `bono` adicional: muestra campo Sesiones

---

# 4. CONFIGURACIÓN DEL PLANNING (HORARIOS)

## 4.1 Horarios Dinámicos (`spa_config.settings.schedules`)
| Día | Slots por Defecto |
|-----|-------------------|
| Lunes | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Martes | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Miércoles | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Jueves | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Viernes | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Sábado | 10:00, 11:00, 12:15, 13:30, 15:45, 16:45, 18:00, 19:00, 20:30 |
| Domingo | 10:00, 11:00, 12:15, 13:30 |

## 4.2 Slots para Módulos con Timeline
- Generación automática cada 15 minutos
- Horario: 10:00 - 22:00 (L-S), 10:00 - 15:00 (Domingo)

## 4.3 Reglas de Disponibilidad
- Slots pasados son filtrados automáticamente (para fecha actual)
- Reservas existentes se excluyen del cálculo
- Se preserva el slot original al editar una reserva

## 4.4 Días Cerrados
- Configurados en `spa_config.settings.closedDates`
- Formato: `[{ date: "YYYY-MM-DD", reason: "Motivo" }]`
- Bloquean todas las reservas del día
- Verificación de reservas existentes antes de cerrar

---

# 5. CONFIGURACIÓN DEL CÁLCULO ECONÓMICO

## 5.1 Selección del Precio Base

### Módulo SPA
1. Si origen = `particular` o `hotel_no_inc`:
   - Calcular día de la semana de la fecha seleccionada
   - Si es fin de semana (V, S, D):
     - `particular`: `spaConfig.particularPriceWeekend` (default 25€)
     - `hotel_no_inc`: `spaConfig.hotelPriceWeekend` (default 18€)
   - Si es entre semana (L-J):
     - `particular`: `spaConfig.particularPriceWeekday` (default 25€)
     - `hotel_no_inc`: `spaConfig.hotelPriceWeekday` (default 12€)
2. Si origen = otros → Precio = 0.00€

### Otros Módulos
1. Se busca `serviceData` en `currentServices`
2. Si existe y tiene `pax > 0` → Precio fijo (no multiplica)
3. Si existe → `serviceData.precio`
4. Si no existe → 0.00€

## 5.2 Multiplicadores Activos
| Multiplicador | Condición de Activación |
|---------------|-------------------------|
| PAX | Siempre activo, excepto en servicios con `pax > 0` fijo |
| Extras | Se suman al total (checkboxes de complementos) |
| Custom Extras | Se suman al total (extras manuales) |

## 5.3 Fórmula de Cálculo
```javascript
let total = pax * pricePax;

// Sumar extras de complementos
document.querySelectorAll(".comp-checkbox:checked").forEach(cb => {
    total += parseFloat(cb.dataset.price || 0);
});

// Sumar extras manuales
document.querySelectorAll(".custom-extra-item").forEach(item => {
    total += parseFloat(item.querySelector(".custom-extra-price")?.value || 0);
});
```

## 5.4 Configuraciones que Provocan Total = 0€
| Escenario | Razón |
|-----------|-------|
| Origen = `hotel_inc`, `bono`, `smartbox`, `wonderbox`, `ego` | Orígenes sin pago |
| Sin servicio seleccionado | `!svcName` → precio 0 |
| Servicio no encontrado en catálogo (y módulo ≠ SPA) | `!serviceData` |
| PAX = 0 | Cálculo `0 × precio` |

---

# 6. CONFIGURACIÓN DEL CONTROL DE PAGOS

## 6.1 Estados de Pago
| Estado | Código | Color |
|--------|--------|-------|
| Pagado | `pagado` | `#22c55e` (verde) |
| Pendiente | `pendiente` | `#ef4444` (rojo) |
| Parcial | `parcial` | `#f59e0b` (naranja) |

## 6.2 Campos Generados
| Campo | Fuente |
|-------|--------|
| **Total** | `res-precio-total` (calculado) |
| **Pagado** | `res.payment?.paid` o `res.paid_amount` o `res.pagado` |
| **Pendiente** | `Total - Pagado` |

## 6.3 Métodos de Pago
- Efectivo
- Tarjeta
- Transferencia
- Otro

## 6.4 Estado de Servicio
| Estado | Código | Descripción |
|--------|--------|-------------|
| Pendiente antes de servicio | `pending_before_service` | Cliente continuó sin pagar |
| Cleared | `cleared` | Pago resuelto o continuar aceptado |

## 6.5 Historial de Pagos
- Cada pago registra: `{ fecha, importe, metodo, usuario }`
- Se almacena como array en campo `pagos`
- Actualización atómica con `firebase.firestore.FieldValue.arrayUnion`

---

# 7. CONFIGURACIÓN DE VINCULACIONES ENTRE MÓDULOS

## 7.1 Datos que se Transfieren Automáticamente
| Origen → Destino | Datos Transferidos |
|------------------|-------------------|
| Bonos → Reservas | `cliente`, `telefono`, `bono_id`, `servicio`, `pax` |
| Dashboard → Reservas | `pendingVoucherBooking` (sessionStorage) |
| Catálogo → Reservas | `nombre`, `precio`, `duracion`, `items_incluidos` |
| Item Master → Servicios | `code`, `duration`, `allowedSpaces`, `pax_max` |

## 7.2 Datos que NO se Transfieren
- Historial de pagos individuales de bonos a reservas
- Notas internas de bonos
- Métricas de uso de servicios

## 7.3 Packs Multiservicio
- Crean reserva padre + reservas hijas (batch)
- Datos compartidos: `parent_id` en hijas, `child_ids` en padre
- Cancelación en cascada: padre cancela hijas automáticamente

---

# 8. CASUÍSTICAS CONFIGURADAS

## 8.1 Combinaciones Activas

### Módulo SPA + Orígenes con Pago
| Servicio | Origen | Día | PAX | Precio/PAX | Total |
|----------|--------|-----|-----|------------|-------|
| Circuito Spa | particular | L-J | 2 | 25€ | 50€ |
| Circuito Spa | particular | V-D | 2 | 25€ | 50€ |
| Circuito Spa | hotel_no_inc | L-J | 2 | 12€ | 24€ |
| Circuito Spa | hotel_no_inc | V-D | 2 | 18€ | 36€ |
| Circuito Spa | hotel_no_inc | V-D | 1 | 18€ | 18€ |

### Módulo SPA + Orígenes Sin Pago
| Servicio | Origen | Precio/PAX | Total |
|----------|--------|------------|-------|
| Cualquiera | hotel_inc | 0€ | 0€ |
| Cualquiera | bono | 0€ | 0€ |
| Cualquiera | smartbox | 0€ | 0€ |

### Otros Módulos (Suite, Cabinas, etc.)
| Escenario | Comportamiento |
|-----------|----------------|
| Servicio con `pax > 0` | Precio fijo, PAX bloqueado |
| Servicio normal | `precio × pax` |
| Sin servicio | Total = 0€ |

## 8.2 Validaciones de PAX
| Módulo | PAX Máximo |
|--------|------------|
| spa | 16 (configurable por item) |
| panacea, vip, suite | 2 |
| cabina1, cabina2, cabina3 | 1 |
| gym | 1 |

---

# 9. VISIBILIDAD Y COMPORTAMIENTO CONFIGURADO

## 9.1 Campos Visibles/Ocultos por Defecto

### Formulario de Reserva
| Campo | Visible por Defecto | Condición de Visibilidad |
|-------|--------------------|-----------------------|
| Nombre, Teléfono, PAX | ✅ Siempre | - |
| Fecha, Hora | ✅ Siempre | Depende del módulo |
| Servicio | ❌ Oculto (SPA) | Visible en otros módulos |
| Staff | ❌ Oculto | `currentModule.requiresStaff === true` |
| Hotel, Habitación | ❌ Oculto | `origen === 'hotel_*'` |
| ID Bono | ❌ Oculto | `origen in ['bono', 'smartbox', ...]` |
| Sesiones | ❌ Oculto | `origen === 'bono'` |
| Control de Pago | ❌ Oculto | `origen in ['particular', 'hotel_no_inc']` |
| Precio por PAX | ✅ Siempre | Deshabilitado si origen sin pago |

## 9.2 Comportamiento por Módulo
| Módulo | View Type | Auto-selección Servicio | Staff Requerido |
|--------|-----------|------------------------|-----------------|
| spa | grid | "Circuito Spa" | ❌ |
| suite | timeline | "Suite Spa" | ❌ |
| panacea, vip | timeline | Ninguno | ✅ |
| cabina1-3 | timeline | Ninguno | ✅ |
| peluqueria | timeline | Ninguno | ✅ |

## 9.3 Comportamiento de Precio
| Evento | Acción |
|--------|--------|
| Cambio de PAX | Recalcula `updatePriceAutomation()` + `updateTotal()` |
| Cambio de Origen | Recalcula precio + toggle campos |
| Cambio de Servicio | Recalcula precio + pack info |
| Cambio de Fecha | Recalcula precio (día semana vs fin de semana) |
| Cambio de Precio manual | Solo recalcula total |

---

# 10. CONEXIONES EXTERNAS

## 10.1 WooCommerce
| Parámetro | Ubicación |
|-----------|-----------|
| URL Tienda | `spa_config.settings.wc_url` |
| Consumer Key | `spa_config.settings.wc_key` |
| Consumer Secret | `spa_config.settings.wc_secret` |
| Push Key | `spa_config.settings.wc_push_key` |

## 10.2 Endpoints de Bonos
| Endpoint | URL |
|----------|-----|
| Listado Legacy | `https://cumbriabienestar.es/wp-json/bonos/v1/listado/` |
| Listado Optimizado | `https://cumbriabienestar.es/wp-json/robahotel/v1/bonos` |

## 10.3 CORS Proxies (Fallback)
1. `https://corsproxy.io/?`
2. `https://api.allorigins.win/raw?url=`
3. `https://api.codetabs.com/v1/proxy?quest=`
4. `https://thingproxy.freeboard.io/fetch/`

---

# APÉNDICE: COLECCIONES FIRESTORE

## Estructura de Reserva Típica
```javascript
{
  id: "RS-XXXX",
  nombre: "Cliente Nombre",
  telefono: "XXX XXX XXX",
  pax: 2,
  hora: "10:00",
  fecha: "2026-01-15",
  origen: "particular",
  servicio: "Circuito Spa",
  precio_pax: 25,
  precio_total: 50,
  status: "confirmada",
  hotel: "Cumbria",
  habitacion: "101",
  observaciones: "...",
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
  // Campos de pago (si aplica)
  payment: { paid: 25 },
  pagado: false,
  estado_pago: "parcial"
}
```

## Estructura de Bono/Voucher Típica
```javascript
{
  id: "BONO1234",
  cliente: "Cliente Nombre",
  email: "correo@email.com",
  telefono: "XXX XXX XXX",
  producto: "Pack Ritual Duo",
  precio: 150,
  origen: "woocommerce",
  estado: "activo",
  sesiones_totales: 2,
  sesiones_usadas: 0,
  items_desglosados: ["Circuito Spa", "Masaje 30'"],
  fecha_compra: "2026-01-01",
  fecha_caducidad: "2027-01-01",
  estado_pago: "pagado",
  importe_pagado: 150,
  importe_pendiente: 0
}
```

---

*Documento generado automáticamente - No editar manualmente*
*Para actualizar, ejecutar nueva auditoría de configuración*
