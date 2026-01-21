# 🎯 Implementación: Sistema de Múltiples Terapeutas

## Estado Actual
✅ Campo PAX ya llama a `updateStaffSelectorsVisibility()` (reservas.html línea 709)
✅ Existe `#staff-2-container` en el DOM (reservas.html línea 738)
⏳ Falta: Campo `required_therapists` en catálogo
⏳ Falta: Función `updateStaffSelectorsVisibility()` en reservas.html
⏳ Falta: Cargar el valor al abrir modal

## PASO 1: Agregar campo al Catálogo (catalogo.html)

### Ubicación: Después de la línea 451  
**Buscar:**
```html
<input type="number" id="sm-sesiones" class="param-input form-control" placeholder="1"
    style="font-size: 0.9rem; padding: 4px 8px; height: 32px; width: 100%;">
</div>
</div>
```

**Agregar inmediatamente después de `</div>`:**
```html
<div style="flex: 0.7;">
    <label style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #a0aec0; display: block; margin-bottom: 2px;">
        <i class="fas fa-user-friends" style="color: #3b82f6;"></i> Terap.
    </label>
    <input type="number" id="sm-required-therapists" class="param-input form-control" 
           placeholder="1" min="0" max="4" value="1"
           title="Número de terapeutas necesarios para este servicio"
           style="font-size: 0.9rem; padding: 4px 8px; height: 32px; width: 100%; text-align: center;">
</div>
```

## PASO 2: Guardar el campo (catalogo.html)

### Ubicación: Buscar la función donde se guarda el servicio  
**Buscar:** `saveService` o donde se hace `db.collection("spa_item_master").doc(...).set`

**Agregar al objeto de datos:**
```javascript
required_therapists: parseInt(document.getElementById("sm-required-therapists")?.value) || 1,
```

## PASO 3: Cargar el campo al editar (catalogo.html)

### Ubicación: Función que abre el modal con datos existentes  
**Buscar:** `openServiceModal` o donde se hace `document.getElementById("sm-sesiones").value = ...`

**Agregar:**
```javascript
document.getElementById("sm-required-therapists").value = service.required_therapists || 1;
```

## PASO 4: Crear función updateStaffSelectorsVisibility (reservas.html)

### Ubicación: Después de otras funciones del modal (buscar `function updatePriceAutomation` o similar)

**Agregar esta función completa:**
```javascript
/**
 * Muestra/oculta selectores de terapeuta según lo requerido por el servicio
 */
function updateStaffSelectorsVisibility() {
    const serviceSelect = document.getElementById('res-servicio');
    const staff2Container = document.getElementById('staff-2-container');
    
    if (!serviceSelect || !staff2Container) return;
    
    // Obtener servicio seleccionado
    const selectedService = serviceSelect.value;
    if (!selectedService) {
        staff2Container.style.display = 'none';
        return;
    }
    
    // Buscar en spa_item_master cuántos terapeutas requiere
    let requiredTherapists = 1; // Por defecto 1
    
    if (window.spaItemMaster && Array.isArray(window.spaItemMaster)) {
        const item = window.spaItemMaster.find(i => i.nombre === selectedService);
        if (item && item.required_therapists) {
            requiredTherapists = parseInt(item.required_therapists);
        }
    }
    
    // Mostrar/ocultar segundo selector
    if (requiredTherapists >= 2) {
        staff2Container.style.display = 'block';
        
        // Poblar segundo selector con las mismas opciones que el primero
        const staff1 = document.getElementById('booking-staff');
        const staff2 = document.getElementById('booking-staff-2');
        
        if (staff1 && staff2) {
            // Copiar opciones del primer selector
            staff2.innerHTML = staff1.innerHTML;
        }
    } else {
        staff2Container.style.display = 'none';
        const staff2 = document.getElementById('booking-staff-2');
        if (staff2) staff2.value = '';
    }
}
```

## PASO 5: Llamar la función en momentos clave (reservas.html)

### 5.1 Al cambiar servicio
**Buscar:** `<select id="res-servicio" onchange="updatePackInfo(); updatePriceAutomation();"`  
**Cambiar a:**  
```html
<select id="res-servicio" onchange="updatePackInfo(); updatePriceAutomation(); updateStaffSelectorsVisibility();">
```

### 5.2 Al abrir modal nuevo
**Buscar:** Función `selectSlot` (donde se abre el modal para nueva reserva)  
**Agregar al final, justo antes de mostrar el modal:**  
```javascript
updateStaffSelectorsVisibility();
```

### 5.3 Al editar reserva existente
**Buscar:** Función `editBooking` (donde se abre el modal para editar)  
**Agregar despuéss de poblar todos los campos:**  
```javascript
updateStaffSelectorsVisibility();
```

## PASO 6: Cargar spa_item_master si no está cargado

**Buscar:** `DOMContentLoaded` o función de inicialización  
**Agregar:**  
```javascript
// Cargar spa_item_master para acceso global
if (!window.spaItemMaster) {
    db.collection("spa_item_master").get().then(snap => {
        window.spaItemMaster = [];
        snap.forEach(doc => {
            window.spaItemMaster.push({ id: doc.id, ...doc.data() });
        });
    });
}
```

## 📋 Valores Recomendados

Configura `required_therapists` así para cada servicio:

| Servicio | Valor |
|----------|-------|
| Masaje Individual | 1 |
| Masaje en Pareja - 60' | 2 |
| Ritual 4 Manos | 2 |
| Circuito SPA | 0 |
| Baño en bañera de hidromasaje | 0 |
| Peluquería (cualquiera) | 1 |

## ✅ Verificación

1. Abre el catálogo
2. Edita "Masaje en Pareja - 60'"
3. Verifica que el campo "Terap." esté visible
4. Establece el valor en 2
5. Guarda
6. Ve a reservas y crea una nueva reserva con ese servicio
7. Deberían aparecer 2 selectores de terapeuta

## 🐛 Troubleshooting

**Si no aparecen los 2 selectores:**
- Abre consola (F12)
- Verifica que `window.spaItemMaster` exista
- Verifica que el servicio tenga `required_therapists: 2`
- Verifica que `updateStaffSelectorsVisibility()` se esté llamando

**Si el campo no se guarda:**
- Verifica que la función de guardado incluya `required_therapists`
- Verifica en Firestore que el campo se haya guardado

## 📞 Soporte

Si tienes problemas, revisa los logs en consola. La función `updateStaffSelectorsVisibility()` debería funcionar inmediatamente sin necesidad de recargar, solo al cambiar el servicio seleccionado.
