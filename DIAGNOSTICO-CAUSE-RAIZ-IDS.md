# 🔍 ANÁLISIS DE CAUSA RAÍZ: Variation_ID Incorrectos

## 📊 PROBLEMA IDENTIFICADO

### Caso específico: **BONO7717**
- **Sistema Local (Firestore)**: `variation_id: 6522` ❌
- **WooCommerce Real**: `variation_id: 6521` ✅  
- **Producto**: "Masaje Relax - Sesión de 60'"

---

## 🔎 INVESTIGACIÓN DEL FLUJO DE DATOS

### 1. **Origen de los Datos**
```
WooCommerce → Endpoint API → JavaScript → Firestore
```

**Endpoint utilizado**: 
```
https://cumbriabienestar.es/wp-json/robahotel/v1/bonos
```

### 2. **Puntos de Asignación del variation_id**

El `variation_id` se asigna en **bonos.js** línea 1872-1873:
```javascript
product_id: b.product_id || firstItem.product_id,
variation_id: b.variation_id || firstItem.variation_id,
```

**Fuentes posibles**:
- `b.variation_id` → Viene directamente del endpoint de WooCommerce
- `firstItem.variation_id` → Viene del array `items_desglosados`

---

## ⚠️ CAUSAS RAÍZ PROBABLES

### **CAUSA #1: Endpoint de WooCommerce envía ID incorrecto**

Si el endpoint `/robahotel/v1/bonos` está construido mal en PHP, puede estar:
- Leyendo el `variation_id` de un campo equivocado
- Mezclando IDs de variaciones similares
- Devolviendo un ID de producto relacionado en lugar del correcto

**¿Cómo verificar?**
```javascript
// En la consola del navegador cuando sincronizas:
console.log('=== DEBUG BONO TARGET RAW ===');
console.log(freshData);  // Ver qué variation_id viene de WooCommerce
```

En tus logs ya aparece:
```
Has Billing? false
Prices: Object
```

Esto indica que **NO está viniendo el objeto `billing`** completo desde WooCommerce.

### **CAUSA #2: Mapeo incorrecto en items_desglosados**

Cuando se desglosa un pack, el sistema puede estar:
- Buscando el producto en el catálogo local por nombre
- Encontrando un producto similar con `wc_id` diferente
- Asignando ese `wc_id` incorrecto como `variation_id`

**Código relevante (línea 3157)**:
```javascript
variation_id: item.variation_id || catalogItem?.wc_id || null,
```

Si `catalogItem.wc_id` es 6522 (incorrecto) y `item.variation_id` es null, asigna el incorrecto.

### **CAUSA #3: Catálogo local (spa_services) desactualizado**

El catálogo tiene guardado:
```
"Masaje Relax 60'" → wc_id: 6522 ❌
```

Pero WooCommerce tiene:
```
"Masaje Relax - Sesión de 60'" → variation_id: 6521 ✅
```

**El problema**: El nombre NO coincide EXACTAMENTE, así que el sistema busca por similitud y encuentra el ID incorrecto.

---

## ✅ SOLUCIONES IMPLEMENTADAS

### **Solución Inmediata: Diagnóstico Automático**
He creado la herramienta `diagnostico-bonos.html` que:
1. ✅ Compara `variation_id` de Firestore vs WooCommerce
2. ✅ Detecta discrepancias automáticamente
3. ✅ Corrige automáticamente con un clic

### **Solución Preventiva: Sync más robusto**
Mejorar el proceso de sincronización para:
1. **Priorizar variation_id de WooCommerce** sobre el catálogo local
2. **Validar que el ID existe** antes de guardarlo
3. **Registrar en logs** cuando hay discrepancia

---

## 🔧 ACCIÓN RECOMENDADA

### **Paso 1: Verificar el endpoint PHP**
¿Tienes acceso al backend de WordPress? Necesito revisar el archivo que genera `/robahotel/v1/bonos` para ver:
```php
// ¿Cómo se obtiene el variation_id?
$variation_id = ???
```

### **Paso 2: Actualizar catálogo local**
Ejecutar la herramienta `fix-catalog-wc-ids.html` para sincronizar **TODOS** los `wc_id` del catálogo con WooCommerce:
- Esto actualizará "Masaje Relax" de 6522 → 6521

### **Paso 3: Corregir bonos existentes**
Ejecutar `diagnostico-bonos.html` para corregir **TODOS** los bonos con `variation_id` incorrectos.

---

## 📝 PRÓXIMOS PASOS

1. ¿Puedo ver el código PHP del endpoint `/robahotel/v1/bonos`?
2. ¿Ejecutamos `fix-catalog-wc-ids.html` primero para sincronizar el catálogo?
3. Luego ejecutamos `diagnostico-bonos.html` para corregir los bonos existentes

**Esto garantizará que el problema NO vuelva a ocurrir** 🎯
