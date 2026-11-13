# Registro Unificado de Versiones y Actualizaciones (Gest-Spa / Zenith Manager)

Este documento mantiene el **control de versión única y global** para todo el sistema **Gest-Spa / Zenith Manager**.

---

## 📌 Estado Global del Sistema

| Parámetro | Valor Actual |
| :--- | :--- |
| **Versión Global del Sistema** | **`v2.3.41`** |
| **Fecha de Última Actualización** | **13/11/2026** |
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
