# Resumen de Tareas Pendientes - Módulo Peluquería

## 🎯 Prioridades del Usuario

### 1. **Dashboard de Inicio no muestra reserva de Cabina "natalio fedez"** 
   - **Status**: ✅ PARCIALMENTE RESUELTO
   - Agregada colección `reservas_cabinas` a dashboard.js
   - Agregada columna SALA
   - **Pendiente**: Verificar filtros de estado y tiempo

### 2. **Módulo Peluquería - Mejoras Urgentes** ⚠️
   - Faltan servicios de peluquería en el selector
   - No se muestra qué sala se está reservando
   - Complementos innecesarios
   - PAX debe ser 0 por defecto
   - Auto-asignar terapeuta de peluquería

### 3. **Calendario de Ocupación de Terapeutas**
   - **Status**: ✅ COMPLETADO
   - Muestra todos los terapeutas activos
   - Carga todas las reservas de todas las salas
   - Respeta horarios individuales

## 📋 Siguiente Acción Inmediata

Implementar las 5 mejoras del módulo de Peluquería en `reservas.html`:

1. Cargar servicios desde `spa_item_master` con filtro `space: 'peluqueria', agenda: true`
2. Mostrar "Peluquería" en el título del modal
3. Ocultar sección de complementos cuando `currentModule === 'peluqueria'`
4. Establecer PAX = 0 por defecto para peluquería
5. Auto-seleccionar terapeuta asignado a sala 'peluqueria'

## 🔧 Archivos Modificados Hoy

-reservas.html (ID nav-link, mostrar todos los terapeutas)
- index.html, bonos.html, personal.html, catalogo.html, configuracion.html, pedidos-wc.html (navbar updates)
- dashboard.js (agregar reservas_cabinas, columna SALA)

## ⏭️ Próximos Pasos

1. Implementar mejoras de Peluquería
2. Verificar por qué no aparece reserva de Cabinas en dashboard
3. Continuar con ocupación de terapeutas si es necesario
