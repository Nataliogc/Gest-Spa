# Plan de Implementación - Mejoras Críticas

## 🎯 Problemas a Resolver (Por Prioridad)

### 1. **Selector de Segundo Terapeuta y Configuración** ✅
   - Implementado campo "Terap." en Catálogo
   - Implementada lógica de visibilidad dinámica en Reservas
   - **Acción requerida**: Configurar "Masaje en Pareja" con 2 terapeutas en el Catálogo.

### 2. **Módulo Peluquería - Mejoras Urgentes** ⚠️
   - Faltan servicios de peluquería en el selector
   - No se muestra qué sala se está reservando
   - Complementos innecesarios
   - PAX debe ser 0 por defecto
   - Auto-asignar terapeuta de peluquería


### 3. **Dashboard no muestra reserva de Cabinas**
- Verificar filtros de estado
- Verificar filtro de tiempo
- Agregar console.log para debug

## 📋 Implementación Paso a Paso

### PASO 1: Agregar campo `required_therapists` al catálogo

#### 1.1 Modificar `catalogo.html`
Buscar la tabla de items (alrededor línea 300-400) y agregar:
```html
<th>TERAP.</th>
```

Y en la fila de datos:
```html
<td>
  <input type="number" min="0" max="4" value="${item.required_therapists || 1}" 
         style="width: 50px; text-align: center;">
</td>
```

#### 1.2 Modificar la función de guardado para incluir `required_therapists`

### PASO 2: Implementar `updateStaffSelectorsVisibility()`

En `reservas.html`, agregar después de otras funciones de modal:

```javascript
function updateStaffSelectorsVisibility() {
    const serviceSelect = document.getElementById('res-servicio');
    const paxInput = document.getElementById('res-pax');
    const staff2Container = document.getElementById('staff-2-container');
    
    if (!serviceSelect || !staff2Container) return;
    
    // Obtener el servicio seleccionado
    const selectedService = serviceSelect.value;
    
    // Buscar en spa_item_master cuántos terapeutas requiere
    const item = window.spaItemMaster?.find(i => i.nombre === selectedService);
    const requiredTherapists = item?.required_therapists || 1;
    
    // Mostrar/ocultar segundo selector
    if (requiredTherapists >= 2) {
        staff2Container.style.display = 'block';
        // Poblar opciones del segundo selector
        populateSecondStaffSelector();
    } else {
        staff2Container.style.display = 'none';
        document.getElementById('booking-staff-2').value = '';
    }
}
```

### PASO 3: Llamar la función en los lugares correctos

1. Al cambiar servicio: agregar a `onchange` de `#res-servicio`
2. Al abrir modal: agregar en `selectSlot()` y `editBooking()`
3. Al cambiar PAX: ya agregado ✅

## 🔧 Archivos a Modificar

1. ✅ `reservas.html` - Campo PAX con nueva función
2. ⏳ `catalogo.html` - Agregar columna TERAP.
3. ⏳ `catalogo.js` - Guardar campo `required_therapists`
4. ⏳ `reservas.html` - Crear función `updateStaffSelectorsVisibility()`
5. ⏳ `reservas.html` - Llamar función en eventos apropiados

## 💡 Valores Recomendados por Servicio

- Masaje Individual: `required_therapists: 1`
- Masaje en Pareja: `required_therapists: 2`  
- Circuito SPA: `required_therapists: 0` (no requiere asignación)
- Ritual 4 Manos: `required_therapists: 2`

## ⏭️ Siguiente Acción

¿Quieres que:
1. Implemente los cambios uno por uno
2. Te genere los snippets de código exactos para cada archivo
3. Empecemos por el más crítico (selector segundo terapeuta)
