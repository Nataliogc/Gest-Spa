# Registro Unificado de Versiones y Actualizaciones (Gest-Spa / Zenith Manager)

Este documento mantiene el **control de versión única y global** para todo el sistema **Gest-Spa / Zenith Manager**.

---

## 📌 Estado Global del Sistema

| Parámetro | Valor Actual |
| :--- | :--- |
| **Versión Global del Sistema** | **`v2.0.0`** |
| **Fecha de Última Actualización** | **27/10/2026** |
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

### [v2.0.0] - 27/10/2026
- **Módulos Afectados**: Sistema Completo / Gobernanza
- **Tipo**: Establecimiento de Versión Global Única
- **Detalle de Cambios**:
  - Unificación del versionado de todo el ecosistema Gest-Spa bajo una única versión global.
  - Implementación del protocolo de incremento automático de versión y fecha ante cualquier cambio en cualquier módulo.
  - Integración de la directriz en las normas de trabajo del agente (`.agent/working-criteria.md`).
