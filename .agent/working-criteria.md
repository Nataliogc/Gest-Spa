# Criterio de Trabajo y Configuración de Zenith Manager

Este documento define el criterio técnico y operativo para la gestión de **Items de Compra / Pack** en el sistema Zenith Manager.

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

## 6. Control de Versiones: Versión Única Global
A partir de ahora, rige una **versión única para todo el sistema**:
- Cada vez que se realice **cualquier modificación en cualquier módulo o archivo del sistema**, se incrementará el número de versión global y se actualizará su fecha de modificación en [REGISTRO_VERSIONES.md](file:///c:/Users/comun/Documents/GitHub/Gest-Spa/REGISTRO_VERSIONES.md).
- En el registro se detallará la versión, la fecha, los módulos afectados y el resumen del cambio realizado.

---
*Este criterio ha sido validado y cerrado el 16/01/2026 y actualizado con el protocolo de versión global única el 27/10/2026.*
