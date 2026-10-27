# Criterio de Trabajo y Configuración de Zenith Manager

Este documento define el criterio técnico y operativo para la gestión del sistema Zenith Manager / Gest-Spa.

## 1. Alcance Técnico de Items de Compra / Pack
La tabla de configuración en `configuracion.html` se considera completa y funcional. Contiene los siguientes campos obligatorios:
- **Código**: Identificador único (ej: `it123`).
- **Item / Nombre**: Nombre comercial del servicio.
- **Duración (min)**: Tiempo estimado. Se acepta valor `0`.
- **Espacio**: Sala o área física vinculada.
- **Hab. requerida**: Habilidad del terapeuta (Skill).
- **PAX**: Capacidad de personas (1 o 2).
- **Precio / PAX**: Importe por persona.
- **Agenda**: Si requiere bloqueo (`SÍ`/`NO`).

## 2. Visibilidad en Cabinas (Reserva Directa)
Para las Cabinas 1, 2 y 3 en el flujo de venta directa:
- **Exclusividad**: Solo se muestran servicios procedentes de `spa_item_master`.
- **Asignación**: El servicio debe estar asignado específicamente a la cabina actual (ej: `cabina2`) o al espacio genérico `cabina`.
- **Agenda**: Debe tener `Agenda = SÍ` (o `agenda_required !== false` en base de datos).
- **Inclusión**: NO se filtran por duración; los items con `duracion = 0` son plenamente visibles.
- **PAX por defecto**: Las nuevas reservas en cabinas deben inicializarse con `PAX = 1`.

## 3. Gestión de Duración Cero
Los items con `duracion = 0` son válidos y deliberados:
- Deben permanecer **visibles** y seleccionables en el flujo de reserva directa.
- No deben filtrarse ni excluirse por tener valor cero.

## 4. Aislamiento de Módulos (Principio de No Interferencia)
Cualquier modificación en el flujo de **Venta Directa / Reserva Local** debe ser estrictamente aislada:
- **NO TOCAR**: Catálogo general de servicios (`spa_services`), Lógica de Vales/Bonos, Histórico de Reservas, Sincronización WooCommerce.
- **MANTENER**: La retrocompatibilidad total. El sistema debe funcionar exactamente igual para todos los módulos que ya eran operativos.

## 5. Prioridad de Datos para Reservas Directas
Para reservas locales/directas, la fuente de verdad es la colección `spa_item_master`. Solo si un item no existe en el maestro se podrá recurrir al catálogo comercial como fallback (excepto en Cabinas), aplicando filtros de espacio y PAX.

## 6. Control de Versiones: AUTOMÁTICO ANTE CUALQUIER MEJORA
**PROTOCOLO OBLIGATORIO PARA EL ASISTENTE (IA):**
Cada vez que se realice cualquier modificación, mejora o corrección en el sistema, es **obligatorio ejecutar de forma automática**:
```bash
node scripts/bump-version.js [patch|minor|major] "Resumen del cambio realizado" "Módulo(s) afectados"
```
Este comando se encarga de forma 100% automatizada de:
1. Incrementar la versión global en `version.json`.
2. Actualizar las variables `GEST_SPA_VERSION` y `GEST_SPA_UPDATE_DATE` en `firebase-config.js`.
3. Actualizar la fecha y registrar la nueva versión en `REGISTRO_VERSIONES.md`.
4. Actualizar el distintivo visual (`.global-version-badge`) junto al logotipo en todos los archivos HTML del sistema.

---
*Este criterio ha sido validado y cerrado el 16/01/2026 y actualizado con el protocolo automatizado de versionado global el 27/10/2026.*
