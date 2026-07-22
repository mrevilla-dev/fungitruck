# FungiTrack — Análisis previo: Descuento de ingredientes al preparar un medio
## Fase 0: Solo análisis. NO implementar código.

---

## CONTEXTO

Actualmente, cuando se crea un Medio Preparado a partir de una Receta,
el sistema guarda los ingredientes teóricos pero **NO descuenta nada**
del inventario de `insumos_base`.

El objetivo a futuro es que, al confirmar la preparación de un medio,
el sistema descuente automáticamente del stock la cantidad de cada
ingrediente utilizada según la receta.

---

## TU TAREA (SOLO ANÁLISIS)

Quiero que analices la viabilidad y me entregues un documento
con los siguientes puntos. No escribas código ni modifiques archivos.

### 1. Mapeo de datos actuales

Revisá la estructura de:
- `recetas_medios` (campo `ingredientes`: array con `insumoId`, `nombre`, `cantidad`, `unidad`)
- `insumos_base` (campo `stock_actual`)

¿Qué inconsistencias potenciales ves entre las unidades de la receta
y las unidades del insumo? (Ej: la receta pide "20 g" pero el insumo
se almacena en "kg").

### 2. Flujo de descuento propuesto

Describí el paso a paso del descuento automático:
- ¿En qué momento exacto se descuenta? (¿al crear el medio, al marcarlo como "Preparado", al confirmar sanitización?)
- ¿Qué pasa si no hay stock suficiente de algún ingrediente?
- ¿Qué pasa si el medio se elimina o se archiva después? ¿Se revierte el descuento?
- ¿Se debe poder elegir un lote específico de insumo (`insumos_lotes`) o siempre se descuenta del stock general?

### 3. Riesgos y casos de borde

- ¿Qué pasa si dos operarios preparan medios al mismo tiempo con los mismos ingredientes?
- ¿Qué pasa si la receta se edita después de haber preparado medios con ella?
- ¿Cómo aseguramos que un descuento fallido no deje el sistema en estado inconsistente?
- ¿Se registra una auditoría por cada descuento? ¿En qué colección?

### 4. Propuesta de implementación mínima

Diseñá una propuesta en 2 párrafos que:
- No modifique la estructura existente de Firestore.
- Use `writeBatch` para la atomicidad.
- Incluya validaciones de stock previas.
- Genere un registro de auditoría por cada ingrediente descontado.

### 5. Preguntas abiertas para Maxi

Formulá al menos 3 preguntas que necesites que Maxi responda
para poder implementar esto sin riesgo.

---

## REGLAS

- Solo análisis. No modificar archivos.
- No proponer cambios en la colección `medios_preparados` ni en `batches`.
- El sistema debe poder funcionar exactamente igual si se decide NO implementar este descuento.