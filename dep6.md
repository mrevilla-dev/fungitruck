# FungiTrack — Implementación del descuento de insumos al preparar un medio
## Basado en el análisis de viabilidad previo

---

## CONTEXTO

Ya existe un análisis de viabilidad (`Analisis_Descuento_Mermas_Bloque_5.md`)
donde se investigó la estructura real de la base de datos.
Usar ese análisis como referencia para los nombres de campos y colecciones.

Este prompt implementa la funcionalidad de descuento.

**REGLA DE ORO:** Un solo cambio a la vez. No romper nada de lo que ya funciona.
Leer cada archivo antes de tocarlo. Cambios aditivos.
`writeBatch` para toda operación multi-documento.

---

## COMPORTAMIENTO ESPERADO

Al confirmar la preparación de un medio (en `NuevoMedioModal.jsx`), 
el sistema debe descontar automáticamente del inventario los ingredientes 
utilizados, de acuerdo a las siguientes reglas definidas por Maxi:

1. **Stock insuficiente:** mostrar una **advertencia**, no bloquear. 
   El operario decide si continúa (el stock puede quedar negativo).
2. **Eliminación de un medio:** si se elimina un medio (soft delete), 
   los ingredientes deben **devolverse automáticamente** al inventario.
3. **Lotes:** si el ingrediente tiene lotes cargados (`insumos_lotes`), 
   descontar preferentemente de ahí. Si no, descontar del stock general 
   (`insumos_base`). No obligar a seleccionar lote.

---

## IMPLEMENTACIÓN TÉCNICA

### 1. Momento del descuento
Dentro de la transacción `writeBatch` que crea el documento en `medios_preparados`.

### 2. Identificación de los ingredientes
La receta seleccionada (documento en colección `recetas`) tiene un array 
`ingredientes` con objetos `{ insumoId, nombre, cantidad, unidad }`.

### 3. Descuento del stock

#### Si existe un lote para ese insumo
- Buscar el lote más antiguo con stock disponible (`cantidad_base_actual > 0`), 
  ordenado por fecha de ingreso.
- Descontar del campo `cantidad_base_actual` de ese lote.
- Si un lote no alcanza, descontar lo que se pueda y continuar con el siguiente 
  lote (FIFO). Si ningún lote alcanza, descontar lo que falte del stock general 
  (`insumos_base.stock_total_base`) y registrar la advertencia.

#### Si no hay lotes para ese insumo
- Descontar directamente del campo `stock_total_base` en `insumos_base`.

### 4. Advertencia por stock insuficiente
- Antes de ejecutar el `writeBatch`, calcular si algún ingrediente 
  tendrá saldo negativo.
- Mostrar un diálogo de confirmación (`window.confirm`) con el texto:
  `"⚠️ Stock insuficiente: [nombre insumo] — disponible: X — requerido: Y. ¿Continuar?"`
- Si el operario cancela, se aborta la creación del medio.
- Si el operario confirma, se ejecuta el `writeBatch` normalmente 
  (el stock quedará negativo).
- Guardar en el documento del medio un array `advertencias_stock` 
  con los IDs de los insumos que quedaron en falta.

### 5. Reversión al eliminar un medio
- En la función que marca `eliminado: true` (soft delete), agregar 
  dentro de la misma transacción la reversión del descuento:
  - Recorrer los ingredientes consumidos (guardados en el documento del medio 
    o recalculados desde la receta).
  - Devolver las cantidades a los mismos lotes o al stock general 
    de donde se descontaron.

### 6. Auditoría
- Por cada ingrediente descontado, crear un documento en 
  `insumos_base/{insumoId}/auditorias` con:
  - `tipo: "Consumo Automático"` (o `"Devolución Automática"` en caso de reversión)
  - `cantidad`: la cantidad descontada/devuelta
  - `medioId`: el ID del medio preparado
  - `fecha`: `serverTimestamp()`
  - `operario`: usuario autenticado

---

## RESTRICCIONES

- **No modificar** la estructura de las colecciones existentes.
- **No modificar** el componente de impresión ni ningún otro módulo.
- **No crear** la colección `tareas` ni implementar el Bloque 6.
- Solo modificar los archivos estrictamente necesarios para el descuento 
  y la reversión.
- Usar los nombres de campo reales descubiertos en el análisis previo:
  `insumos_base.stock_total_base`, `insumos_lotes.cantidad_base_actual`.

---

## ENTREGABLES

Al terminar, generar un reporte con:
- Archivos modificados.
- Nuevos campos en Firestore (si los hay).
- Captura del mensaje de advertencia por stock insuficiente.
- Confirmación de que la eliminación revierte el descuento.