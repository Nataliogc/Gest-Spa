# Me

jorasdel Módulo de Peluquería

## Objetivos
1. **Cargar servicios de peluquería** desde `spa_item_master` con `space: 'peluqueria'` y `agenda: true`
2. **Mostrar sala en título** del modal (ej: "Nueva Reserva · Peluquería")
3. **Ocultar complementos** para peluquería
4. **PAX por defecto 0** para peluquería
5. **Auto-asignar terapeuta** que tenga asignada la sala de peluquería

## Ubicaciones de cambios

### 1. Título del modal (línea ~650)
- Elemento: `<h2 id="modal-title">`
- Agregar ` · {SALA}` al título

### 2. PAX por defecto (línea 708)
- Elemento: `<input type="number" id="res-pax" value="2">`
- Cambiar a `value="0"` cuando `currentModule === 'peluqueria'`

### 3. Ocultar complementos (línea 819)
- Elemento: `<div id="complementos-container">`
- Ocultar para peluquería

### 4. Cargar servicios
- Buscar función que puebla `#res-servicio`
- Cargar desde `spa_item_master` where `space === 'peluqueria'` && `agenda === true`

### 5. Auto-asignar terapeuta
- Al abrir modal nuevo en peluquería, buscar staff con `assigned_rooms` incluyendo 'peluqueria'
- Auto-seleccionar en `#booking-staff`

## Implementación

Ver cambios en reservas.html
