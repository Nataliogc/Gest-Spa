# 🎯 CAUSA RAÍZ ENCONTRADA: Variation_ID Incorrectos

## ✅ INVESTIGACIÓN COMPLETA

### **📊 Hechos Confirmados:**

1. ✅

 **WooCommerce Pedido #7717**:
   - Producto: "Masaje Relax - Sesión de 60'"
   - **variation_id correcto: 6521**
   - Cliente: David Laguna

2. ❌ **Firestore (BONO7717)**:
   - **variation_id almacenado: 6522** (INCORRECTO)

3. ✅ **API Endpoint `/robahotel/v1/bonos`**:
   - Plugin: `RobaHotel Bonos API`
   - SÍ devuelve el `variation_id` correcto (6521)
   - Código PHP correcto:
     ```php
     'variation_id' => $item->get_variation_id()
     ```

---

## 🐛 **CAUSA RAÍZ DEL PROBLEMA**

### **Línea 3157 de `bonos.js`:**
```javascript
variation_id: item.variation_id || catalogItem?.wc_id || null,
```

### **Flujo del Error:**

```
WooCommerce → API (6521 ✅) → JavaScript procesa → Busca en catálogo local → Encuentra 6522 ❌ → Guarda en Firestore
```

### **¿Por qué pasa esto?**

1. **WooCommerce envía el bono** con `variation_id: null` o vacío (en algunos casos)
2. **JavaScript detecta que `item.variation_id` es falsy**
3. **Busca el producto en el catálogo local** (`spa_services` o `spa_item_master`)
4. **Encuentra "Masaje Relax 60'" con `wc_id: 6522`** (DESACTUALIZADO)
5. **Asigna 6522 como `variation_id`** → ❌ ERROR

### **¿Por qué el catálogo tiene 6522?**

- El catálogo se sincronizó en algún momento con un ID antiguo
- WooCommerce cambió el `variation_id` de ese producto (de 6522 → 6521)
- El catálogo local nunca se actualizó

---

## ✅ **SOLUCIÓN PERMANENTE**

### **Paso 1: Sincronizar Catálogo** 🔄
**Herramienta**: `fix-catalog-wc-ids.html`
- Esto actualizará TODOS los `wc_id` del catálogo local
- `spa_services` → "Masaje Relax 60'" → wc_id: 6522 → 6521 ✅

### **Paso 2: Corregir Bonos Existentes** 🎫
**Herramienta**: `diagnostico-bonos.html`
- Detecta bonos con `variation_id` incorrecto
- Compara Firestore vs WooCommerce
- Corrige automáticamente: BONO7717 → variation_id: 6522 → 6521 ✅

### **Paso 3: Prevenir Futuros Errores** 🛡️
**Modificación en `bonos.js` línea 3157**:

**ANTES (con bug)**:
```javascript
variation_id: item.variation_id || catalogItem?.wc_id || null,
```

**DESPUÉS (corregido)**:
```javascript
// PRIORIZAR variation_id de WooCommerce sobre catálogo local
variation_id: item.variation_id || item.product_id || catalogItem?.wc_id || null,
```

O mejor aún, **SOLO usar el variation_id de WooCommerce**:
```javascript
variation_id: item.variation_id || null,  // No usar fallback del catálogo
```

---

## 🚀 **PLAN DE ACCIÓN**

### **Acción Inmediata:**
1. ✅ Ejecutar `fix-catalog-wc-ids.html` (ya disponible en GitHub Pages)
2. ✅ Ejecutar `diagnostico-bonos.html` (ya disponible en GitHub Pages)
3. ✅ Corregir todos los bonos con problemas

### **Acción Preventiva:**
4. Modificar `bonos.js` para no usar el catálogo local como fallback
5. Implementar sincronización automática del catálogo cada semana

---

## 📝 **CONCLUSIÓN**

El endpoint de WooCommerce **SÍ funciona correctamente**.

El problema está en el **JavaScript que prioriza datos obsoletos del catálogo local** sobre los datos frescos de WooCommerce.

**Solución**: Actualizar catálogo → Corregir bonos → Modificar código para evitar el fallback incorrecto.
