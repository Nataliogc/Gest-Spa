# Registro Unificado de Versiones y Actualizaciones (Gest-Spa / Zenith Manager)

Este documento mantiene el **control de versión única y global** para todo el sistema **Gest-Spa / Zenith Manager**.

---

## 📌 Estado Global del Sistema

| Parámetro | Valor Actual |
| :--- | :--- |
| **Versión Global del Sistema** | **`v2.3.2`** |
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
