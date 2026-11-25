# Registro Unificado de Versiones y Actualizaciones (Gest-Spa / Zenith Manager)

Este documento mantiene el **control de versión única y global** para todo el sistema **Gest-Spa / Zenith Manager**.

---

## 📌 Estado Global del Sistema

| Parámetro | Valor Actual |
| :--- | :--- |
| **Versión Global del Sistema** | **`v2.3.102`** |
| **Fecha de Última Actualización** | **25/11/2026** |
| **Estado General** | Operativo en Producción |

---

## ⚙️ Regla Operativa (Versión Única)

> **Norma de Versionado Global:**
> A partir de ahora, cada vez que se realice **cualquier modificación en cualquier módulo o archivo del sistema**:
> 1. Se **incrementará la versión global del sistema** en este registro (SemVer: `vMAJOR.MINOR.PATCH`).
>    - **PATCH** (`v2.0.x`): Corrección de errores, ajustes menores de interfaz, textos o estilos.
>    - **MINOR** (`v2.x.0`): Nuevas funcionalidades, mejoras relevantes en un módulo, nuevos asistentes o filtros.
>    - **MAJOR** (`vx.0.0`): Cambios estructurales profundos, refactorizaciones completas o rediseño integral.
> 2. Se actualizará la **Fecha de Última Actualización**.
> 3. Se añadirá una entrada en el **Historial de Versiones**, indicando el módulo afectado y el resumen del cambio.

---

## 📚 Cobertura de Módulos del Sistema

Cualquier cambio en los siguientes módulos impacta en la versión global:

- **Inicio / Dashboard** (`index.html`, `js/dashboard.js`)
- **Visión General 15d** (`vision-general.html`)
- **Reservas Spa** (`reservas-spa.html`)
- **Reservas Salas / Cabinas / Suite / Panacea / Peluquería** (`reservas-salas.html`)
- **Bonos y Vales** (`bonos.html`, `bono-pdf.js`, `js/bonos.js`)
- **Personal & Cuadrantes** (`personal.html`, `personal.js`)
- **Disponibilidad & Terapeutas** (`disponibilidad.html`, `disponibilidad-terapeutas.html`, `reservas-staff.js`)
- **Agenda & Ocupación** (`agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`)
- **Catálogo de Servicios** (`catalogo.html`)
- **Configuración & Ajustes** (`configuracion.html`)
- **Manual de Usuario** (`manual-usuario.html`, `Manual_Usuario_Gest_Spa.pdf`)
- **Auditoría & Herramientas Técnicas** (`auditoria-reservas.html`, `admin-tools.html`, `wc-diagnostico.html`)

---

## 📝 Historial Unificado de Versiones

### [v2.3.102] - 25/11/2026
- **Tipo:** PATCH
- **Archivos:** `configuracion.html`, `index.html`, `js/spa-packs-registry.js`, `js/spa-phase4-corrections.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Packs Relax Oriental (individual y pareja): baño hidromasaje y masaje en SALA PANACEA (antes suite/cabina); sin hueco de 15 min entre fases en la misma sala; 'Relax Oriental 1 Pax' ya no se confunde con el pack de pareja (2 terapeutas).

### [v2.3.101] - 25/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** Reservas: al abrir Nueva Reserva tras consultar una existente se limpian servicio/pack, terapeutas, duración, total y descuento (antes se arrastraban).

### [v2.3.100] - 24/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** El teléfono del cliente permanece visible en las reservas de cualquier origen, incluido Bono Spa (Interno).

### [v2.3.99] - 24/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/app-core.js`, `js/bono-sessions-helper.js`, `js/bonos.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-bono-sessions-and-spa-addon.js`
- **Descripción:** Reconciliación automática de sesiones sobrecontadas (incluso en bonos marcados como canjeados), aislamiento de múltiples masajes en bonos y protección al editar packs

### [v2.3.98] - 24/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/app-core.js`, `js/bonos.js`, `js/service-pricing.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-pricing-addon-and-paygold.js`, `js/bono-sessions-helper.js`, `scripts/test-bono-sessions-and-spa-addon.js`
- **Descripción:** Corrección de sesiones en bonos (Re-sync WC, guardado sin redistribución destructiva, sin doble descuento al editar) y precio 0€ en Circuito Spa adicional para bonos y orígenes incluidos

### [v2.3.97] - 23/11/2026
- **Tipo:** PATCH
- **Archivos:** `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `index.html`, `js/config.js`, `js/service-pricing.js`, `js/spa-paygold.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `vision-general.html`
- **Descripción:** Corrección de inflado de precios al editar con Circuito Spa adicional, sincronización bidireccional Catálogo-Maestro, PAX independiente en Circuito Spa adicional y colección PayGold en Cabinas

### [v2.3.96] - 23/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/app-core.js`, `js/bonos-history-helper.js`, `js/bonos.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Correccion buscador de bonos (caducados/exc.Loc) y reconciliacion automatica de sesiones usadas sin citas activas

### [v2.3.95] - 19/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `bonos.html`, `configuracion.html`, `index.html`, `js/app-core.js`, `js/bonos.js`, `js/config.js`, `js/dashboard.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Pestana WhatsApp independiente con plantillas y reglas, filtros por defecto en Bonos y colores oficiales por tratamiento en Ocupacion

### [v2.3.94] - 19/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** WhatsApp automatico al guardar reserva con condiciones del servicio y aviso de cobro

### [v2.3.93] - 19/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`
- **Descripción:** Confirmacion de reserva por cliente manteniendo No Show habilitado en el panel principal

### [v2.3.92] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.91] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.90] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `styles.css`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.89] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `version.json`, `vision-general.html`
- **Descripción:** Personalización (mensaje regalo PDF) y nota interna en formularios de Bonos Regalo y Monedero

### [v2.3.88] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `styles.css`
- **Descripción:** Ancho completo (3 columnas) para modal Emitir Bono Monedero

### [v2.3.87] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/bonos.js`
- **Descripción:** Dos formularios completamente independientes: Venta Local de Bonos Regalo y Emitir Bono Monedero

### [v2.3.86] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`
- **Descripción:** Separar Venta Local de Bonos Regalo sin selector de Bono Monedero

### [v2.3.85] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** TPV Virtual en venta local, precio tarifa en reservas con monedero, anulados sin contar como pagados y vista Bono Monedero

### [v2.3.84] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Monedero: Salas/Masajes abre Ocupacion; bloqueo de reservas y consumos en bonos anulados o caducados

### [v2.3.83] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`
- **Descripción:** Venta local exclusiva para Bono Monedero y panel de control exclusivo con impresion directa

### [v2.3.82] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`
- **Descripción:** Fix modales nativos en Monedero sin dependencia de Swal

### [v2.3.81] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** Nuevo sistema de Bono Monedero (saldo, recargas, consumos, diferencia a pagar y balance PDF/ticket)

### [v2.3.80] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.79] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/bonos.js`, `reservas-salas.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.78] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/app-core.js`, `js/voucher-booking-context.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.77] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`, `js/voucher-booking-context.js`, `reservas-spa.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.76] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.75] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.74] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.73] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/bonos.js`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.72] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `js/dashboard.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.71] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/bonos.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `version.json`, `vision-general.html`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.70] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`, `styles.css`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.69] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.68] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`, `styles.css`
- **Descripción:** Mejora continua del sistema Gest-Spa

### [v2.3.67] - 18/11/2026
- **Tipo:** MINOR
- **Archivos:** `index.html`, `js/dashboard.js`, `bonos.html`, `js/bonos.js`, `js/bonos-history-helper.js`, `js/reservation-drawer.js`
- **Descripción:** Mejoras en **Informes Avanzados** y módulo de **Bonos**:
  1. **Informes Avanzados completos por canal y fechas (`index.html`, `js/dashboard.js`):** añadidas pestañas **Ranking Completo**, **Tienda Virtual**, **Venta Directa** y **Ventas por Servicio**, junto con filtro de fechas **Desde / Hasta** (y botón *Todo el histórico*) y buscador en tiempo real sobre la lista completa (sin límite de Top 10).
  2. **Filtros y visualización en Bonos (`bonos.html`, `js/bonos.js`):** corregido el filtro de rango (`Última semana`, `Último mes`, etc.) para limpiar la fecha diaria; añadido campo obligatorio **Motivo del descuento** visible en el bono; habilitado **Reservar Pack Completo** en packs mixtos (Spa/Suite + Restaurante); y mejorada la vinculación de nombres/desglose de WooCommerce con el catálogo.
  3. **Historial y Drawer (`js/bonos-history-helper.js`, `js/reservation-drawer.js`):** evitado el falso etiquetado de citas de Spa sin `servicio` como `RESTAURANTE`, y corregido `URIError` en `openReservationDrawer` cuando el nombre incluye `%` (ej. `(-20%)`).

### [v2.3.66] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`
- **Descripción:** Rediseño ancho y ejecutivo del modal **Informes Avanzados** (`#reports-modal`):
  1. **Ventana más amplia y limpia (`index.html`):** ampliado a `1220px` (`95vw`, `max-height: 92vh`), con cabecera estructurada, pestañas segmentadas con estado activo, botón de cierre alineado y pie de exportación.
  2. **Tarjetas KPI, barras de progreso y buscador (`js/dashboard.js`):** añadidos resúmenes KPI en la cabecera de *Ranking Top 10 Bonos* y *Ventas por Servicio*, barras visuales de peso/volumen, buscador en tiempo real por servicio/categoría y suma unificada de `b.importe || b.precio`.

### [v2.3.65] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`
- **Descripción:** Unificación de variantes duplicadas en **Informes Avanzados → Ranking Top 10 Bonos**:
  - Normaliza nombres repetidos por mayúsculas/minúsculas (`Circuito SPA` / `CIRCUITO SPA`), sufijos duplicados (`Circuito SPA - Circuito Spa`) y marcadores de variante/plazas (`(2)`, `(-50%)`, `- 2 pax`) para agruparlos en una única fila y sumar `b.importe || b.precio`.

### [v2.3.64] - 18/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`
- **Descripción:** Mejora en **Caja del Día · Arqueo y Desglose** e informe impreso:
  1. **Mayor detalle por movimiento:** muestra el producto/servicio real del bono (`data.producto` / `items_desglosados`), código de bono/localizador, origen (Online/Local), pax, sesiones, desglose de packs, abonos parciales y saldo pendiente, referencias de pedido/PayGold, usuario que cobró y teléfono del cliente, además de extraer la hora real de cobro.
  2. **Cabecera de impresión actualizada:** añadido el logotipo `logo-spa.jpg` y actualizado el nombre comercial a **Cumbria Bienestar** en cabecera y pie de firmas, conservando el fondo oscuro de `TOTAL CAJA DEL DÍA` al imprimir.

### [v2.3.63] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/bonos.js`, `agenda-salas.html`, `js/app-core.js`, `reservas-salas.html`, `reservas-spa.html`
- **Descripción:** Reserva completa de packs desde el módulo de Bonos (`Gestionar Bono`), replicando el flujo `PACK MULTISERVICIO` de venta directa:
  1. **Botón `Reservar Pack Completo` (`js/bonos.js`):** en bonos de tipo pack con al menos 2 servicios reservables pendientes, abre Ocupación (`agenda-salas.html` o `reservas-spa.html`) con `is_pack=1`, el bono, el cliente y las plazas preseleccionadas.
  2. **Banner de pack en Ocupación (`agenda-salas.html`):** muestra el distintivo `PACK COMPLETO` y propaga `is_pack=1` al formulario de reserva.
  3. **Validación y canje completo de sesiones (`js/app-core.js`, `reservas-salas.html`, `reservas-spa.html`):** valida el saldo frente a los servicios activos del pack y descuenta todas las sesiones reservadas en `sesiones_usadas` e `items_desglosados` mediante `updateVoucherSessionsForPack()`.

### [v2.3.62] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`
- **Descripción:** Estado en vivo y anulación sincronizada con Mesachef (`js/app-core.js`):
  1. **Indicador visual de reserva en Mesachef:** `refreshMesachefBookingStatus()` consulta `reservas_restaurante` por ID / `campoBono` y muestra en el modal si está `Reservado en Mesachef` (fecha, hora, turno, ref.), `Anulada` o `Pendiente de reservar` (refrescándose también al volver el foco desde Mesachef).
  2. **Anulación bidireccional:** al anular o borrar una reserva en Gest-Spa, `syncReservationToMesachef()`, `cancelReservationInMesachef()` y `deleteReservationInMesachef()` anulan/eliminan también las reservas vinculadas por `campoBono` en Mesachef (`mesa-chef-prod`).

### [v2.3.61] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`
- **Descripción:** Evitado enviar `"NUEVA"` como `voucher` al abrir Mesachef desde una reserva aún no guardada en `window.openMesachefFromPack()`.

### [v2.3.60] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/app-core.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `version.json`, `vision-general.html`
- **Descripción:** Integración de `Reservar en Mesachef` con `source=bono` y referencia de reserva (`RS-...`) como `voucher` para que Mesachef autorrellene cliente, teléfono, pax y marque `SPA/BONO` + `Servicio Incluido`; sincronizado el botón `SPA y Sabores` también al editar reservas.

### [v2.3.59] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Corrección de precio unitario para `SPA y Sabores` en módulo `spa`: evitado que la tarifa dinámica de Circuito Spa (`25€`) sobrescriba `price_pax` (`45€`) al calcular `45€ × PAX` (45€ para 1 pax, 90€ para 2 pax).

### [v2.3.58] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Corrección de recálculo de importe al cambiar PAX con `SPA y Sabores`: eliminado el bloqueo `Precio Cerrado (Total)` (`fixedTotal: 90`) y añadido `window.resolveSpaSaboresData()` para calcular `45€/pax` (45€ para 1 pax, 90€ para 2 pax).

### [v2.3.57] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `index.html`, `js/app-core.js`, `js/spa-packs-registry.js`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `vision-general.html`
- **Descripción:** Botón rápido `+ Añadir SPA y Sabores` en módulo SPA y enlace `Pedidos WC` en todo el menú GESTIÓN:
  1. **Botón `+ Añadir SPA y Sabores` (`spa`):** Sustituido el selector completo de servicios en `spa` por un botón único que detecta automáticamente si es `1` persona (`SPA y Sabores - Individual`, 45€) o `2+` personas (`SPA y Sabores`, 90€) y recalcula al cambiar `PAX`.
  2. **Menú GESTIÓN (`Pedidos WC`):** Añadido el acceso a `pedidos-wc.html` en el desplegable GESTIÓN de las 12 páginas donde faltaba.

### [v2.3.56] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Mejoras en la reserva de servicios extra, Restaurante (Mesachef) y `SPA y Sabores`:
  1. **Visibilidad de `Complementos` y `+ Añadir Circuito Spa`:** Corregida la comprobación obsoleta de `.comp-checkbox` en `reservas-salas.html` y `reservas-spa.html` que ocultaba el bloque de `Complementos` en Cabinas/Salas.
  2. **Enlace directo a Mesachef (`Reservar en Mesachef`):** Añadido `window.openMesachefFromPack()` y `window.renderPackExternalExtrasHtml()` en `js/app-core.js` y el botón en el aviso de Restaurante para packs multiservicio y packs de 1 fase con servicios externos (ej. `Tiempo para dos`).
  3. **Selector de Servicio en módulo SPA:** Habilitado `#service-group` en el módulo `spa` (manteniendo `Circuito Spa` preseleccionado por defecto) para poder seleccionar `SPA y Sabores` y `SPA y Sabores - Individual` desde la sala de Spa.

### [v2.3.55] - 17/11/2026
- **Tipo:** MINOR
- **Archivos:** `js/spa-packs-registry.js`, `reservas-salas.html`, `reservas-spa.html`, `scripts/test-all-packs.js`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`, `agenda-salas.html`, `js/dashboard.js`
- **Descripción:** Estandarización exacta de todos los Packs y Rituales y nueva pestaña `+ Añadir Circuito Spa` en tratamientos:
  1. **Secuencias y Duraciones Exactas en `SPA_PACKS_REGISTRY`:**
     - `Relax Oriental`: Baño Hidromasaje (`30'`) + `Relax Oriental (Masaje Relax 30 min)` (`30'`).
     - `Especial Parejas`: `Circuito Spa` (`60'`) + `Especial Parejas (Masaje Relax + Envoltura)` (`60'`).
     - `Encuentro Romántico`: `Suite Spa` (`60'`) + `Encuentro Romántico (Masaje Relax 30 min)` (`30'`).
     - `Cuento para dos`: `Circuito Spa` (`60'`) + `Cuento para dos (Envoltura 45 min)` (`45'`) + Menú Restaurante.
     - `SPA y Sabores` (y `- Individual`): guarda en `reservas_spa` como `SPA y Sabores (Circuito Spa 60 min)` en lugar de `Circuito Spa` + Menú Restaurante.
     - `Tiempo para dos`: `Tiempo para dos (Suite Spa 60 min)` (`60'`) + Menú Restaurante.
     - `Rituales (Indian, Chocolaterapia, Baño Cítrico Vit. C, Oro)`: `Bañera de Hidromasaje` (`30'`) + `Nombre del Ritual` (`60'`).
     - `Amazonian Discovery`: `Amazonian (Facial + Corporal)` (`75'`).
     - `Asian Journey Él` / `Asian Journey Ella`: `Bañera Hidromasaje` (`30'`) + `Journey Él (Exfoliación + Masaje)` / `Journey Ella (Envoltura + Masaje)` (`60'`).
  2. **Pestaña `+ Añadir Circuito Spa` en Reservas de Tratamientos (`reservas-salas.html`):** Nuevo botón en `Complementos` para reservar también el Circuito Spa (con selector de fecha, hora y plazas libres en vivo) desde cualquier masaje, envoltura o tratamiento individual, creando automáticamente la cita vinculada en `reservas_spa`.

### [v2.3.54] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-staff.js`, `reservas-salas.html`, `agenda-salas.html`, `js/dashboard.js`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`
- **Descripción:** Corrección integral de terapeutas en packs de Suite/Salas y agrupación de tratamientos consecutivos en la misma sala:
  1. **Detección Real de Terapeutas para Packs en Suite (`reservas-staff.js`):** Se priorizó la comprobación de `getPackFullData()` sobre `isSuiteNoMassage` en `handleStaffFieldsChange()`, evitando que packs con tratamientos en `SUITE SPA` (como `PACK - Especial Parejas`, `PACK - Relax Oriental`, `PACK - Encuentro Romántico`, etc.) muestren `"No requiere terapeuta"` cuando requieren 2 terapeutas.
  2. **Agrupación de Fases Consecutivas en la Misma Sala y Duración Real de Sala (`reservas-salas.html`):** En `updatePackInfo()`, las fases consecutivas de tratamiento con terapeuta en la misma sala (como la fase 2 `Masaje Relax 30'` + fase 3 `Envoltura corporal 60'` de `Especial Parejas`) se unifican en un único bloque **`Especial Parejas · 90' · 2 Terapeutas`**, y `syncServiceDuration()` asigna al campo `MIN` la duración real de ocupación de la sala (`90'` en lugar de `150'`), manteniendo `Circuito Spa (60')` como cita independiente en `SPA`.

### [v2.3.53] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`, `agenda-salas.html`, `js/dashboard.js`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`
- **Descripción:** Rediseño ancho y centrado de la ficha de reserva (`#booking-modal`) para ver todo a simple vista sin desplazamiento y cache-busting en iframes pre-calentados:
  1. **Ventana Más Ancha, Centrada y Distribuida (`1340px`, `96vw`, `max-height: 94vh`):** Se aplicó `body.is-modal-only` al cargar en modo modal para centrar la ficha perfectamente en pantalla y se distribuyeron en paralelo `Complementos` + `Observaciones` y `PACK MULTISERVICIO` + `CONTROL DE PAGO`, manteniendo todo el formulario y la botonera inferior visibles a simple vista.
  2. **Refresco de Caché en Iframes Pre-calentados (`_v=2.3.53`):** Se añadió parámetro de versión a los iframes pre-calentados en `agenda-salas.html` y `js/dashboard.js` y a `styles.css` / `spa-packs-registry.js` para asegurar la carga inmediata de `Masaje Oriental` en `Relax Oriental`.

### [v2.3.52] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/spa-packs-registry.js`, `js/spa-phase4-corrections.js`, `reservas-salas.html`, `reservas-spa.html`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`, `agenda-salas.html`
- **Descripción:** Corrección de la 2.ª fase de los packs `Relax Oriental` y `Relax Oriental - Individual`: se sustituyó `Masaje Relax` por **`Masaje Oriental`** en `SPA_PACKS_REGISTRY` (`wc-6475` y `wc-6944`) y `PACK_SEQUENCES`.

### [v2.3.51] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `js/app-core.js`, `js/bonos.js`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`, `agenda-salas.html`
- **Descripción:** Corrección de error `Assignment to constant variable` al abrir nueva reserva en iframe pre-calentado y tolerancia a fallos de proxies CORS en Bonos:
  1. **Corrección `let moduleType` en `reservas-salas.html`:** Se cambió `const moduleType` a `let moduleType` para permitir el cambio dinámico de módulo dentro de `openQuickNewDirectly()` y `openQuickEditDirectly()` sin lanzar `TypeError: Assignment to constant variable`.
  2. **Fetch Directo + Tolerancia a Fallos CORS en Bonos (`js/app-core.js`, `js/bonos.js`):** `fetchBonosWithFallback()` intenta primero la conexión directa antes de recurrir a proxies CORS externos, y `cargarBonos()` captura los errores de `sincronizarConTienda()` para mantener visibles los bonos de Firestore aunque los proxies de WooCommerce devuelvan `403`.

### [v2.3.50] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `reservas-salas.html`, `reservas-spa.html`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `bonos.html`
- **Descripción:** Apertura instantánea (`0 ms` de espera, sin pantalla `"Abriendo reserva..."`) al iniciar una **Nueva Reserva** desde el cuadrante de Ocupación (`agenda-salas.html`):
  1. **Vía Directa en Iframe Pre-calentado (`openQuickNewDirectly`):** Al pulsar cualquier casilla libre (`+`) de Sala o Terapeuta en `agenda-salas.html`, `newBooking()` reutiliza directamente el iframe pre-calentado de `reservas-salas.html` llamando a `openQuickNewDirectly(newBookingParams)` sin recargar el iframe ni mostrar `"Abriendo reserva..."`.
  2. **Apertura Síncrona de `showBookingForm()` y `openNewReservationFromUrl()`:** Se eliminó el bloqueo secuencial de `await updateAvailableTimeSlots()` y las 3 llamadas consecutivas a `await handleStaffFieldsChange()` antes de mostrar `#booking-modal`, pintando de forma síncrona la hora, sala, terapeuta, cliente y servicio, mostrando el modal en el acto y calculando la disponibilidad de tramos y personal en paralelo en segundo plano.

### [v2.3.49] - 17/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos-history-helper.js`, `js/bonos.js`, `js/spa-payment-control.js`, `js/app-core.js`, `firebase-config.js`, `version.json`, `package.json`, `index.html`, `agenda-salas.html`
- **Descripción:** Reparación del Historial de Reservas en Bonos y rediseño ancho ejecutivo del modal `Gestionar Bono`:
  1. **Reparación Crítica del Historial de Reservas (`js/bonos-history-helper.js`):** Se corrigió el error `ReferenceError: code is not defined` en la línea 344 de `renderVoucherHistory(bonoCode)` que abortaba el renderizado y dejaba `#vm-history-content` en blanco cuando un bono tenía reservas de Spa o Salas.
  2. **Cobertura Completa de Colecciones y Expansión de Packs en Historial:** Se añadieron las colecciones `reservas_cabina1`, `reservas_cabina2`, `reservas_cabina3` y `reservas_cabinas`, búsqueda por `localizador` y variaciones de mayúsculas/minúsculas, y expansión automática de todas las fases hermanas de un pack multiservicio (`parent_id`) para que aparezcan todas sus citas en el historial del bono.
  3. **Rediseño Ancho y Ejecutivo de `Gestionar Bono` (`bonos.html`, `js/bonos.js`, `js/spa-payment-control.js`):** Se amplió el modal de `750px` a `1140px` (`95vw`) y su altura útil hasta `760px`, reorganizando la columna izquierda en tarjetas limpias, compactando horizontalmente el bloque `Pago del Bono` y las filas de `Items de Compra` (con indicador de uso `usadas/total`), y ubicando el `Historial de Reservas` justo debajo con contador de citas y tarjetas detalladas con enlace directo a la reserva.

### [v2.3.48] - 16/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `js/app-core.js`, `js/voucher-booking-context.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `agenda-salas.html`, `firebase-config.js`, `version.json`, `package.json`
- **Descripción:** Sincronización integral de Packs Multiservicio, retorno directo al Panel al cerrar reservas, resolución exacta de orígenes (Smartbox/Wonderbox/Groupon/Ego vs Bono), recuperación automática de número de bono y apertura instantánea de reservas:
  1. **Desglose y Sincronización Real de Packs Multiservicio (Creación, Edición y Auto-reparación):** Se corrigió la condición `&& !id` en `handleFormSubmit` que impedía crear o actualizar el segundo servicio (ej. `Circuito Spa` a las 17:00) al editar un pack existente, y se añadió `ensurePackChildrenSyncedForDate` para generar automáticamente en `reservas_spa` las fases de Circuito Spa pendientes de packs ya agendados en sala (como `RS-BFKM` y `RS-8Q3I`), mostrándolas tanto en el Panel como en `Rva Circuito Spa`.
  2. **Consulta desde el Panel con Retorno al Cerrar:** Al pulsar el icono de consulta (ojo) en el Panel (`index.html`), la ficha de reserva se abre en capa modal directa sobre el propio Panel y, al pulsar `CERRAR`, `SALIR`, `Escape` o `GUARDAR RESERVA`, vuelve inmediatamente al Panel manteniendo la fecha y filtros activos y refrescando los datos.
  3. **Prioridad de Orígenes Externos (Smartbox, Wonderbox, Groupon, Ego) en el Panel:** Se corrigió en `js/dashboard.js` el orden de evaluación del origen para que la presencia de código de cupón en `bono` (ej. `267952730/529` en `RS-S01S`) no sobreescriba el origen `Smartbox` como `BONO`.
  4. **Recuperación y Persistencia del Número de Bono (`BONO/CUPÓN`):** Se corrigió la limpieza prematura de `pendingVoucherBooking` al abrir reservas desde URL y se implementó `recoverMissingBonoCode` para recuperar automáticamente desde `spa_vouchers` (o campos alternativos `localizador`, `num_bono`, `voucher`) el código de bono en reservas de `Bono Spa (Interno)`.
  5. **Exclusión de Servicios Únicos del Bloque Pack Multiservicio:** Sincronizada la validación `displayItems.length <= 1` en `reservas.html` y `reservas-spa.html` para que servicios de 1 sola fase (como `Masaje en Pareja - 60'`) no muestren el bloque `PACK MULTISERVICIO (1 servicio)`.
  6. **Apertura Instantánea de Reservas y Optimización de Carga (0ms Espera):** Se añadieron iframes pre-calentados (`prewarm=1`, `openQuickEditDirectly`) en el Panel (`index.html`) y en Ocupación (`agenda-salas.html`), apertura síncrona inmediata de `#booking-modal` en `editBooking` ejecutando en paralelo (`Promise.all`) las comprobaciones de cupos, terapeutas, saldo de bono y fases de pack, y verificación en memoria (`preloadedDocs`) en `ensurePackChildrenSyncedForDate` para evitar consultas duplicadas a Firestore.

### [v2.3.47] - 16/11/2026
- **Tipo:** PATCH
- **Archivos:** `bonos.html`, `js/bonos.js`
- **Descripción:** Control de canje por reservas individuales y limpieza visual en ficha de bono:
  1. **Bloqueo de Canje Manual:** El campo `Sesiones Usadas` pasa a ser de solo lectura y se bloquea el marcado manual como `CANJEADO` si no se han realizado las reservas individuales de cada servicio, mostrando un aviso informativo en pantalla y en el propio modal.
  2. **Limpieza de Cabecera del Modal:** Se elimina el sello visual repetitivo `Datos Verificados & Protegidos` en la cabecera de *Gestionar Bono*, manteniendo la protección interna (`manual_update` y `sync_locked`) sin saturar la interfaz.

### [v2.3.46] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Corrección de coherencia de pagos en Dashboard vs Modal y asignación incondicional de badge `SOCIO`:
  1. **Coherencia Total Dashboard vs Modal:** Se eliminó la incoherencia donde el Dashboard mostraba `PAGADO` mientras el modal de pago registraba `PAGADO: 0.00€, PENDIENTE: 49.90€`. Si el bloque de control de pagos registra explícitamente 0€ abonados, el Dashboard nunca asumirá que está pagado.
  2. **Píldora `SOCIO` Incondicional:** Cualquier reserva de socio o socia (ej. 'pilar moreno socia', 'ISIDRO CRUZ(SOCIO)') muestra siempre en el Dashboard su distintivo oficial verde `SOCIO`, sin depender de si la reserva tiene tarifa 0€ o tarifa previa en base de datos.
  3. **Gestión de Tarifas de Socios en Modales:** Las reservas de socios pueden guardarse a 0.00 € (cuota de club) sin bloquearse solicitando autorización, y el bloque de control de pago muestra el badge `SOCIO`.

### [v2.3.45] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/config.js`, `js/dashboard.js`, `js/service-catalog.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Preservación estricta de tarifas en reservas guardadas, eliminación de falsas alarmas de precio en componentes de packs y diferenciación de socios:
  1. **Preservación Estricta de Precios Guardados:** Se eliminó la sobreescritura automática que forzaba precios de catálogo en reservas históricas o guardadas a 0.00 € (como socios o cortesías). Al abrir o consultar el modal de edición, el precio guardado se mantiene 100% inalterado y no se inventan importes pendientes indebidos.
  2. **Diferenciación de Clientes Socios (`SOCIO`):** En el Dashboard, los clientes socios del club (ej. 'pilar moreno socia', 'ISIDRO CRUZ(SOCIO)') con tratamientos a 0.00 € se identifican con la píldora verde `SOCIO`, sin generar estados erróneos de deuda ni 'Pagado' falso.
  3. **Corrección de Paquetes vs Bonos vs Zonas:** Se restringió `findParentPacks` para que únicamente reconozca paquetes y rituales multiservicio auténticos (`SPA_PACKS_REGISTRY` y packs reales). Se excluyen de forma definitiva los bonos multisesión (ej. 'Bono 10 sesiones') y las variaciones de catálogo por zonas individuales (ej. 'Fotodepilación facial, piernas'), evitando que un servicio independiente como 'Fotodepilación' o 'Circuito spa' se etiquete falsamente como incluido en decenas de paquetes.
  4. **Componentes de Packs a 0€ sin Alarma:** Tratamientos como 'Alojamiento y Desayuno' en 'Sueño para dos' o 'Envoltura de té matcha' en 'Ritual Asian Journey' tienen precio individual 0.00 € porque su cobro se realiza a través del paquete. Se suprimieron las alertas rojas `¡SIN PRECIO!` y `Alarma 0€` para elementos incluidos en packs, mostrándolos con distintivo informativo azul `En Pack (0€)` y modo `Solo Pack`.
  5. **Corrección de Cabecera en Modales:** El encabezado del modal ahora muestra el ID real de la reserva cuando `res_id` no está definido, y el formateo de fecha auditada maneja objetos Timestamp de Firestore sin mostrar 'Invalid Date'.

### [v2.3.44] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `manual-usuario.html`, `scripts/sync-manual.js`
- **Descripción:** Transformación del Manual de Usuario en Guía Integral de Capacitación & Operaciones para Nuevas Incorporaciones:
  1. **Reestructuración en 14 Módulos Operativos:** Organización didáctica que abarca desde la navegación, código visual de estados, agendamiento de citas, los 8 orígenes oficiales, gestión de bonos, desgloses de packs, cobros con pasarela PayGold, gestión de descuentos comerciales, cuadrantes de personal y checklists de apertura y cierre.
  2. **Reubicación del Historial de Versiones:** El historial técnico de versiones se trasladó al Anexo final (Módulo 14) con scroll independiente, permitiendo que las nuevas incorporaciones accedan inmediatamente al material formativo.

### [v2.3.43] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `scripts/test-origin-and-table-layout.js`
- **Descripción:** Corrección integral de orígenes de reservas, resolución de estados por canal y optimización proporcional de la distribución de la tabla:
  1. **Disponibilidad Total de Orígenes en Todas las Salas:** Se eliminó la restricción que limitaba a Panacea y VIP a mostrar únicamente 'Particular' y 'Bono'. Ahora todas las salas (Panacea, VIP, Suite, Cabinas, Spa) disponen en sus desplegables de los 8 orígenes oficiales: Particular, Hotel - Incluido, Hotel - NO Incluidos, Bono Spa (Interno), Smartbox, Wonderbox, Ego Experiencias y Groupon.
  2. **Resolución Inteligente de Estados y Píldoras en Dashboard:** Se corrigió el error donde reservas de Bono, Hotel o Cupones con importe 0.00€ se clasificaban erróneamente como `SIN CARGO`. Ahora el sistema detecta de forma robusta el origen (por valor de canal o presencia de localizador/código de bono), asignando a cada grupo su etiqueta y color correspondiente (`BONO`, `HOTEL INC.`, `HOT. NO INC.`, `GROUPON`, `SMARTBOX`, `WONDERBOX`, `EGO EXP.`), reservando `SIN CARGO` exclusivamente para cortesías explícitas o autorizadas.
  3. **Distribución Visual Proporcional de la Tabla:** Se eliminó el layout rígido forzado que provocaba saltos de línea antiestéticos en el ID (`RS- 1UNK`) y truncado del texto en la cabecera `TERAPEUTA` (`TERAPEU`). Se ajustaron anchos mínimos con `white-space: nowrap` en columnas fijas y distribución compartida natural entre `CLIENTE` y `SERVICIO`, eliminando huecos vacíos y logrando un aspecto equilibrado y profesional.

### [v2.3.42] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `styles.css`, `firebase-config.js`
- **Descripción:** Corrección de desalineación de columnas en la tabla del Dashboard y sincronización de versión global única:
  1. **Cuadrado y Alineación de Tabla Dashboard:** Se corrigió el desajuste donde la cabecera `ESTADO` quedaba vacía y la píldora de pago caía bajo `ACCIONES`. Se unificó el número exacto de columnas (8 cabeceras `<th>` y 8 celdas `<td>`), integrando el botón de ver detalles (ojo) dentro de la celda de acciones con layout flex. Se definieron anchos fijos y alineaciones idénticas (`col-id`, `col-hora`, `col-cliente`, `col-servicio`, `col-sala`, `col-terapeuta`, `col-estado`, `col-acciones`).
  2. **Encabezados Dinámicos en Búsqueda Global:** Sincronización automática de `<thead>` para mostrar la columna `FECHA` en búsquedas globales sin romper la alineación con las filas de datos.
  3. **Aislamiento de Reglas CSS Globales:** Las reglas de optimización de columnas `nth-child` que procedían de la tabla de bonos se encapsularon exclusivamente para `#vouchers-table-body`, evitando que afecten o descalabren la tabla principal del dashboard.
  4. **Sincronización de Versión Global en `firebase-config.js`:** Se actualizó `window.GEST_SPA_VERSION` para que el distintivo de versión del encabezado muestre correctamente la versión actualizada `v2.3.42` en el navegador.

### [v2.3.41] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `reservas-salas.html`, `reservas.html`, `reservas-spa.html`, `configuracion.html`, `js/config.js`, `manual-usuario.html`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Implementación del sistema de descuentos en reservas, alarmas de venta directa sin precio, centrado de tabla y sincronización del manual:
  1. **Descuentos en Reservas (% y €):** Nuevo bloque de descuento en modal de reserva que permite aplicar reducciones en porcentaje o importe fijo en euros, calculando en tiempo real el subtotal y total. Requiere obligatoriamente indicar el motivo (ej. Socio, Promoción, Cortesía, Convenio) para auditoría y persistencia.
  2. **Alarma de Venta Directa sin Precio:** En `configuracion.html`, los tratamientos marcados como Venta Directa con tarifa 0.00 € muestran una alarma visual roja destacada `🚨 ¡SIN PRECIO!`, advertencia `Alarma 0€`, selector de canal de venta más compacto y nuevo filtro rápido por alarma en la cabecera.
  3. **Auto-recuperación de Tarifa Oficial:** Al abrir o listar reservas particulares que no tenían importe guardado (0.00 €) y no eran cortesías ni packs, el sistema recupera automáticamente el precio de catálogo del servicio para evitar que queden incorrectamente a cero euros.
  4. **Centrado Vertical de Celdas:** Alineación vertical perfecta (`vertical-align: middle`) en todas las celdas y filas de la tabla de reservas del dashboard (ID, hora, cliente, servicio, sala, terapeuta, estado e iconos).
  5. **Actualización del Manual:** Sincronización completa de las guías de uso con los nuevos procesos de descuento, alarmas de catálogo y gestión de precios.

### [v2.3.40] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `configuracion.html`, `js/config.js`, `js/service-catalog.js`, `js/app-core.js`, `js/dashboard.js`, `reservas-salas.html`, `reservas.html`, `reservas-spa.html`, `scripts/test-pack-origin.js`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Identificación visual y vinculación automática del paquete de origen cuando un tratamiento tiene precio 0€ o pertenece a un pack:
  1. **Configuración (`spa_item_master`):** Para cada item incluido en paquetes/rituales (ej. "Envoltura corporal de flores de loto" en "Ritual Indian ritual"), se muestra el distintivo `📦 Paquete: [Nombre]` bajo el nombre del servicio, aviso `📦 En Paquete` en la columna Precio/Pax si su precio es 0, y sugerencia `⚠️ De Paquete` en la columna Venta. El botón de usos (`PROD`) y el modal detallan todos los paquetes que lo incluyen.
  2. **Modales de Reserva:** Al abrir o crear una reserva de un servicio incluido en paquete (o con total 0.00 € proveniente de pack), se muestra el bloque informativo de paquete de origen y distintivo `📦 PACK: [Nombre del Pack]`, suprimiendo la petición innecesaria de "Autorizado por" (ya que está facturado en el paquete de origen).
  3. **Agenda y Dashboard:** Los elementos derivados de paquetes se rotulan con su distintivo `📦 PACK · [Nombre]` en lugar de clasificarse como "Sin Cargo".
  4. **Persistencia:** Al desglosar y crear reservas automáticas de packs, cada reserva hija registra explícitamente `pack_origen`, `pack_name` y `parent_service`.

### [v2.3.39] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/service-catalog.js`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Resolución inteligente y difusa de nombres de servicios en el catálogo (ej. "ENVOLTURA VIT.C" emparejada con "Envoltura corporal vit.c" de 40€). Ignora omisiones de descriptores comunes como "corporal" o abreviaciones ("vit.c" vs "vitamina c"), permitiendo que las reservas antiguas o con nombres abreviados reconozcan su tarifa oficial de catálogo y activen el botón de 1-clic "Aplicar Tarifa Catálogo: 40.00€".

### [v2.3.38] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`, `reservas-salas.html`, `reservas.html`, `reservas-spa.html`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Código de colores y distintivos visuales diferenciados por origen y estado de reserva: Hotel Incluido (Azul/Índigo), Hotel No Incluido (Violeta/Púrpura con importe pendiente), Bono Spa (Verde Teal), Groupon (Verde Menta), Smartbox (Naranja Cálido), Wonderbox (Dorado/Ámbar), Ego Experiencias (Fucsia/Rosa), Pagado (Verde Éxito), Pendiente (Rojo Alerta), Parcial (Naranja Intenso), PayGold (Ámbar Pasarela) y Sin Cargo (Miel/Regalo). Homogeneizado en Dashboard de Inicio y en las tablas de detalle de reservas.

### [v2.3.37] - 13/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-sin-cargo-and-price-preservation.js`
- **Descripción:** Corrección de preservación de precio/total guardado al consultar reservas en modal de edición (evita recálculo no deseado que reducía totales como PayGold 100€ a 50€). Implementación de soporte para reservas "Sin Cargo / Gratuita (0.00 €)" con campo obligatorio "Autorizado por", distintivo SIN CARGO en agenda y tabla, y asistente de 1-clic "Aplicar Tarifa Catálogo" cuando un servicio tiene precio oficial configurado en el catálogo maestro.

### [v2.3.36] - 12/11/2026
- **Tipo:** PATCH
- **Archivos:** `catalogo.html`, `configuracion.html`, `js/config.js`, `js/service-catalog.js`, `scripts/test-service-catalog.js`
- **Descripción:** Opcion en catalogo maestro (Items de Compra/Pack) para definir canal de venta: Venta Directa o Solo Paquetes Online

### [v2.3.35] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`
- **Descripción:** Ajuste de visualización en planning: sala bajo nombre de terapeuta en sección salas, eliminación de horario en terapeutas y capacidad en salas

### [v2.3.34] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`, `js/service-catalog.js`, `reservas-salas.html`, `scripts/test-rituals-and-salas.js`
- **Descripción:** Prioridad de spa_item_master sobre spa_services en compatibilidad de salas (CHON, MAR, MARI)

### [v2.3.33] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas.html`, `scripts/test-rituals-and-salas.js`
- **Descripción:** Packs mixtos: Circuito Spa secundario y asignacion de hora pinchada al tratamiento de sala (masaje)

### [v2.3.32] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-terapeutas.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas-staff.js`, `reservas.html`, `scripts/test-rituals-and-salas.js`
- **Descripción:** Correccion Suite Spa: 0 terapeutas requeridos en alquiler de Suite Spa sin masaje y exclusion estricta de personal

### [v2.3.31] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `scripts/test-rituals-and-salas.js`
- **Descripción:** Corrección de autorrelleno de hora al pinchar en planning, servicio obligatorio, bloqueo de Circuito Spa en salas y unificación de tiempo completo y sala para rituales

### [v2.3.30] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/service-pricing.js`, `js/spa-packs-registry.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-individual-pax.js`
- **Descripción:** Corregido PAX en tratamientos individuales: no se clasifican como packs, prevalece la capacidad de Items y el campo personas queda editable dentro del maximo configurado. Relax individual restablece 1 persona; packs y parejas conservan su modalidad.

### [v2.3.29] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `configuracion.html`, `js/app-core.js`, `js/config.js`, `js/service-pricing.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-reservation-selectors.js`, `js/service-catalog.js`, `scripts/test-service-catalog.js`
- **Descripción:** Buscador en Ajustes Items/Pack y selector de tratamientos basado en items maestros: nombres compatibles, salas configuradas e identificador estable en nuevas reservas. Sin borrado de datos; Relax en Suite conservado pendiente de revisar su producto asociado.

### [v2.3.28] - 11/11/2026
- **Tipo:** PATCH / BUGFIX
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`
- **Descripción:** Corrección de la validación de turnos pasados en handleFormSubmit (se eliminó la condición dependiente de un elemento DOM inexistente que puenteaba el bloqueo). Validación extendida a todas las fases de los packs para impedir guardar servicios a horas pasadas. Ajuste de hora inicial en packs al siguiente cuarto de hora futuro en lugar de 10:00h si esa hora ya transcurrió.

### [v2.3.27] - 11/11/2026
- **Tipo:** MINOR / PATCH
- **Archivos:** `reservas-salas.html`, `reservas-staff.js`, `js/app-core.js`
- **Descripción:** Módulo de ocupación interactiva del Spa en packs: botones con plazas libres/ocupadas por turno para elegir hora del circuito spa con un solo clic. Validación de disponibilidad de terapeutas ajustada a la hora real de la fase de tratamiento (no a la hora general). Corrección de asignación de sala en packs con Suite Spa.

### [v2.3.26] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`
- **Descripción:** Packs con Circuito Spa (Fantasía para dos, Especial Parejas...) ya se pueden reservar desde Sala VIP, Panacea o Suite. La fase de Spa se envía automáticamente a la agenda del Spa sin condicionar la sala del tratamiento.

### [v2.3.25] - 11/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/app-core.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas-staff.js`, `reservas.html`
- **Descripción:** Fix pack cancellation across all collections and enable independent per-service pack scheduling

### [v2.3.24] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-staff.js`
- **Descripción:** Fix uniqueStaff scope in reservas-staff.js

### [v2.3.23] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`, `reservas-staff.js`, `reservas.html`
- **Descripción:** Auto-assign available therapists to eliminate false conflict popups on saving reservations

### [v2.3.22] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `js/spa-packs-registry.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Fix reservas-spa syntax, unify daily cash stats, enable 2 therapists in couples packs, zero-therapist packs validation, and room-service compatibility check

### [v2.3.21] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `disponibilidad-terapeutas.html`, `index.html`, `js/dashboard.js`, `js/service-pricing.js`, `js/spa-paygold.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `vision-general.html`
- **Descripción:** PayGold: correccion residual error modal, consistencia estado pagado particular, cache-busters v2.3.21 y activacion packs en salas

### [v2.3.20] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/spa-packs-registry.js`, `scripts/test-all-packs.js`
- **Descripción:** Ajuste de tarifas y desgloses de packs segun catalogo oficial

### [v2.3.19] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/service-pricing.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-room-opening.js`, `js/spa-packs-registry.js`, `scripts/test-all-packs.js`
- **Descripción:** Desglose automatico de servicios, secuencias y tarifas para todos los packs del sistema

### [v2.3.18] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`
- **Descripción:** Panel lateral del dashboard minimizado por defecto

### [v2.3.17] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** PayGold: correccion funcion checkReservation y ventana modal mas ancha y ergonomica

### [v2.3.16] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Correccion indicador de pago en dashboard y reservas para citas con precio sin precio_total explicito

### [v2.3.15] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `vision-general.html`
- **Descripción:** Vision 15 dias: boton Guardar y abrir PayGold con reserva persistida, coleccion correcta y saldo pendiente

### [v2.3.14] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/dashboard.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `scripts/test-reservation-selectors.js`, `version.json`, `vision-general.html`
- **Descripción:** Panel lateral de notas y metricas con opcion de ocultar y expandir tabla del dashboard

### [v2.3.13] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `reservas-salas.html`, `scripts/test-reservation-selectors.js`
- **Descripción:** Apertura de reservas: cargar configuracion y catalogos en paralelo y compartir lecturas iniciales de servicios y maestro sin cachear reservas

### [v2.3.12] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** Módulos del sistema
- **Descripción:** Arqueo y Cierre de Caja del Dia con desglose efectivo, tarjeta, pasarela y tienda virtual

### [v2.3.11] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `js/dashboard.js`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `version.json`, `vision-general.html`, `js/service-pricing.js`, `js/voucher-booking-context.js`, `scripts/test-voucher-booking-context.js`
- **Descripción:** Anadida tarjeta KPI Pagos Pasarela en el panel de inicio (dashboard) para contabilizar cobros por Redsys PayGold en reservas y bonos

### [v2.3.10] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `manual-usuario.html`, `package.json`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `version.json`, `vision-general.html`, `js/service-pricing.js`, `js/voucher-booking-context.js`, `scripts/test-voucher-booking-context.js`
- **Descripción:** Reserva desde bono: conservar codigo, cliente, servicio y personas al pasar del planning al formulario; aplicar vinculacion despues de cargar salas y servicios sin depender de memoria temporal

### [v2.3.9] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `js/service-pricing.js`
- **Descripción:** Precios de servicios: recuperar PVP del catalogo cuando el maestro no tiene tarifa positiva, normalizar nombres sin confundir duraciones y limpiar precio fijo anterior

### [v2.3.8] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`
- **Descripción:** Apertura del modulo de Ocupacion al reservar servicios de salas desde Bonos (con visualizacion de salas, disponibilidad y banner de reserva de bono), manteniendo Spa, Restaurante y Hotel en sus flujos especificos

### [v2.3.7] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/bonos.js`, `js/reservation-drawer.js`, `manual-usuario.html`, `reservas-salas.html`, `scripts/sync-manual.js`, `scripts/test-reservation-selectors.js`, `templates/manual-paygold.html`
- **Descripción:** Reservas: evitar apertura antes de cargar servicios, eliminar salas duplicadas del selector y ajustar PAX inicial de cabinas; manual con guia detallada de PayGold

### [v2.3.6] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `manual-usuario.html`, `scripts/sync-manual.js`, `js/manual-status.js`
- **Descripción:** Manual con todo el historial registrado, barra de carga por etapas reales y comprobacion de version publicada con aviso de error y reintento

### [v2.3.5] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `manual-usuario.html`, `reservas-salas.html`, `styles.css`, `js/room-opening.js`, `scripts/test-room-opening.js`
- **Descripción:** Planning de salas: respetar horarios de apertura, domingos y fechas de cierre; excluir cierres de horas libres e impedir reservas desde franjas cerradas

### [v2.3.4] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `firebase.json`, `manual-usuario.html`, `package.json`, `scripts/bump-version.js`, `scripts/sync-manual.js`
- **Descripción:** Manual sincronizado automaticamente con las novedades y la version real; PDF desde el contenido actualizado y recarga sin cache

### [v2.3.3] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas.html`
- **Descripción:** Correccion en selector de servicios: integracion completa de spa_services y spa_item_master para que Suite, Panacea, VIP, Cabinas y Peluqueria muestren siempre sus servicios

### [v2.3.2] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`
- **Descripción:** Rediseño visual de cuadraditos del planning: cabecera horaria con subdivisiones de 15 min, celdas táctiles con bordes y tarjetas de reserva con badges de hora y duración

### [v2.3.1] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `agenda-salas.html`, `reservas-salas.html`, `styles.css`
- **Descripción:** Planning de Ocupacion: la ficha de reserva se abre directamente (sin panel lateral) y correccion del aviso de pax maximo segun la sala elegida

### [v2.3.0] - 10/11/2026
- **Tipo:** MINOR
- **Archivos:** `agenda-salas.html`, `agenda-terapeutas.html`, `reservas-salas.html`
- **Descripción:** Nuevo Planning de Ocupacion: desplegables Salas (Cabinas, Suite, Panacea, VIP, Peluqueria) y Terapeutas, reserva en 1 clic, turnos y fechas pasadas oscurecidos y bloqueados

### [v2.2.2] - 10/11/2026
- **Tipo:** MINOR
- **Archivos:** `agenda-salas.html`, `agenda-terapeutas.html`, `reservas-salas.html`
- **Descripción:** Apertura directa del formulario de reserva al pinchar casilla libre de agenda con sala en blanco (-- Seleccionar Sala --), selector completo de salas (Cabinas 1, 2, 3, Suite, Panacea, Sala VIP y Peluquería) y terapeuta, fecha y hora preseleccionados automáticamente sin bloqueos de turno pasado.

### [v2.2.1] - 10/11/2026
- **Tipo:** PATCH
- **Archivos:** `reservas-salas.html`, `reservas-spa.html`, `reservas.html`
- **Descripción:** Limpieza estricta de bonos residuales en sessionStorage y corrección de precio y terapeuta en salas

### [v2.2.0] - 10/11/2026
- **Tipo:** MINOR
- **Archivos:** `agenda-salas.html`, `agenda-terapeutas.html`, `js/reservation-drawer.js`, `reservas-salas.html`
- **Descripción:** Apertura directa de pantalla de reserva al hacer clic en casilla libre de la agenda de ocupación de terapeutas

### [v2.1.0] - 10/11/2026
- **Tipo:** MINOR
- **Archivos:** `bonos.html`, `js/bonos-history-helper.js`, `js/bonos.js`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `styles.css`, `js/reservation-drawer.js`
- **Descripción:** Panel lateral integrado de reserva rápida (Drawer) para evitar ventanas duplicadas en puestos de trabajo

### [v2.0.6] - 09/11/2026
- **Tipo:** PATCH
- **Archivos:** `js/dashboard.js`, `js/spa-paygold.js`
- **Descripción:** Registro automatico en tiempo real de pagos Redsys PayGold sin intervencion manual

### [v2.0.5] - 09/11/2026
- **Tipo:** PATCH
- **Archivos:** `favicon-32x32.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-zenith-192.png`, `icon-zenith-512.png`, `js/services/paygoldService.js`, `js/spa-paygold.js`, `manifest-manager.json`, `manifest.json`, `zenith-icon.png`
- **Descripción:** Logo transparente Zenith (navegador y PWA), formato de pedido SPA-XXXX en Redsys y modal PayGold adaptado

### [v2.0.4] - 09/11/2026
- **Tipo:** PATCH
- **Archivos:** `index.html`, `js/dashboard.js`, `js/spa-paygold.js`, `scripts/bump-version.js`
- **Descripción:** Mejora comercial en mensaje PayGold (garantía 24h), badges de estado de pago en panel e indicadores visuales de cobro

### [v2.0.3] - 09/11/2026
- **Tipo:** PATCH
- **Archivos:** `disponibilidad.html`, `manifest.json`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `vision-general.html`, `favicon-32x32.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-lotus-192.png`, `icon-lotus-512.png`, `icon-zenith-192.png`, `icon-zenith-512.png`, `js/services/`, `js/spa-paygold.js`
- **Descripción:** Integración oficial de pasarela Redsys PayGold Cumbria Spa & Hotel

### [v2.0.2] - 27/10/2026
- **Tipo:** PATCH
- **Archivos:** `.agent/working-criteria.md`, `agenda-salas.html`, `agenda-spa.html`, `agenda-terapeutas.html`, `bonos.html`, `catalogo.html`, `configuracion.html`, `disponibilidad-terapeutas.html`, `firebase-config.js`, `index.html`, `pedidos-wc.html`, `personal.html`, `reservas-salas.html`, `reservas-spa.html`, `reservas.html`, `vision-general.html`, `package.json`, `scripts/bump-version.js`, `version.json`
- **Descripción:** Prueba de bump automático

### [v2.0.1] - 27/10/2026
- **Módulos Afectados**: Sistema / Scripts
- **Tipo**: PATCH
- **Detalle de Cambios**:
  - Automatización del sistema de incremento de versiones


### [v2.0.0] - 27/10/2026
- **Módulos Afectados**: Sistema Completo / Gobernanza
- **Tipo**: Establecimiento de Versión Global Única
- **Detalle de Cambios**:
  - Unificación del versionado de todo el ecosistema Gest-Spa bajo una única versión global.
  - Implementación del protocolo de incremento automático de versión y fecha ante cualquier cambio en cualquier módulo.
  - Integración de la directriz en las normas de trabajo del agente (`.agent/working-criteria.md`).
