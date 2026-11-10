# Registro Unificado de Versiones y Actualizaciones (Gest-Spa / Zenith Manager)

Este documento mantiene el **control de versión única y global** para todo el sistema **Gest-Spa / Zenith Manager**.

---

## 📌 Estado Global del Sistema

| Parámetro | Valor Actual |
| :--- | :--- |
| **Versión Global del Sistema** | **`v2.3.19`** |
| **Fecha de Última Actualización** | **10/11/2026** |
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
