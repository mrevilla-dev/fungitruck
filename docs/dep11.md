# FungiTrack — Corrección de bugs en envasado y subfraccionamiento
## Módulo: Medios Preparados
> Mayo 2026

---

## CONTEXTO

Los Bloques 1 y 2 de `dep9.md` están implementados, pero Maxi detectó bugs
en el flujo real de laboratorio. Este prompt contiene solo las correcciones.

**REGLA DE ORO:** Un bug a la vez. Leer cada archivo antes de tocarlo.
No romper lo que ya funciona. Deployar y confirmar con Maxi antes de seguir.

**Reglas técnicas:**
- `writeBatch` o `runTransaction` con lecturas primero, escrituras después.
- `campo?.subcampo ?? fallback` siempre.

---

## CORRECCIÓN 1 — Stock bulk negativo y descuento inicial

### Problema detectado
Al preparar 1 litro y envasar 2 frascos de 500 ml, el bulk muestra:
- Fraccionado: 1000 ml
- Disponible: -1000 ml

Debería mostrar Disponible: 0 ml.

### Causa probable
En `NuevoMedioModal.jsx`, al generar las subfracciones del envasado inicial,
no se está descontando correctamente el volumen del `stock_bulk.cantidad_actual`.

### Corrección requerida
1. Revisar el `writeBatch` de creación del medio + subfracciones.
2. Asegurar que `stock_bulk.cantidad_actual` se reduzca en exactamente
   la suma del volumen de todas las subfracciones creadas.
3. Si el volumen total envasado es igual al stock bulk inicial,
   el resultado debe ser 0, no negativo.

---

## CORRECCIÓN 2 — Descuento de volumen al subfraccionar desde envase

### Problema detectado
Al sacar 10 placas de 20 ml (200 ml) de un frasco de 500 ml,
el frasco padre sigue mostrando `Stock: 1/1` y `Vol/u: 500 ml`.
El descuento no se aplicó.

### Causa probable
En `AddSubBagModal`, el campo `disponible` del padre no se actualiza
correctamente cuando el padre tiene `volumen_por_unidad_ml`.

### Corrección requerida
1. En el `writeBatch` de `AddSubBagModal`, cuando el padre tiene
   `volumen_por_unidad_ml`, descontar del campo `disponible` del padre
   el volumen total usado (`cantidad * volumen_por_unidad_ml` de las hijas).
2. Actualizar también el `volumen_por_unidad_ml` del padre para reflejar
   el volumen restante.
3. Si el padre llega a 0, marcarlo como "Agotada" y descontar de
   `subfracciones_disponibles` del medio.

---

## CORRECCIÓN 3 — Lectura del disponible del padre en modal "Sacar"

### Problema detectado
Al abrir "Sacar" en un frasco de 500 ml, el modal muestra:
"Disponible: 1 ml". Debería mostrar "Disponible: 500 ml"
(o el volumen restante real).

### Causa probable
El modal está leyendo `disponible` como cantidad de unidades (1 frasco)
en vez de como volumen (`volumen_por_unidad_ml * disponible`).

### Corrección requerida
1. En `AddSubBagModal`, al mostrar el disponible del padre:
   - Si el padre tiene `volumen_por_unidad_ml`, mostrar
     `disponible * volumen_por_unidad_ml` con la unidad "ml".
   - Si el padre no tiene volumen (bolsa de placas), mostrar
     `disponible` con la unidad "unidades".
2. La validación de "no hay suficiente" debe usar la misma lógica.

---

## CORRECCIÓN 4 — Subfracciones hijas no visibles en el acordeón

### Problema detectado
Al crear una subfracción hija desde "Sacar", no aparece en el acordeón
de subfraccionamiento del medio.

### Causa probable
El `SubfraccionamientoAccordion` solo está cargando las subfracciones
de primer nivel (sin `parent_id`) o está filtrando mal.

### Corrección requerida
1. Revisar la consulta que carga las subfracciones en el acordeón.
2. Debe traer TODAS las subfracciones del medio, incluyendo las que
   tienen `parent_id`.
3. Mostrar las hijas anidadas visualmente debajo del padre (con indentado
   o un sub-acordeón), o al menos en la misma lista con una etiqueta
   que indique de qué padre provienen.

---

## CORRECCIÓN 5 — Validaciones en selectores de envase

### Problema detectado
- En la Fase 3 del formulario de preparación, el selector de "envase principal"
  no filtra por `es_envase: true`.
- En el modal de subfraccionamiento, el campo "tipo de envase" muestra
  "Envase principal" (que no debería existir) y no tiene la validación actualizada.

### Corrección requerida
1. En ambos selectores, filtrar los insumos por `es_envase: true`
   (o por categoría Reutilizables/Descartables como fallback).
2. Eliminar la opción espuria "Envase principal" del selector.
   Revisar si se guardó como valor en `config/tipos_envase` y quitarlo.
3. Mantener "Tupper grande" y cualquier otro valor personalizado que
   haya ingresado Maxi.

---

## ORDEN DE EJECUCIÓN

1. CORRECCIÓN 1 → Stock bulk + Deploy + Confirmar.
2. CORRECCIÓN 2 → Descuento de volumen + Deploy + Confirmar.
3. CORRECCIÓN 3 → Lectura del disponible + Deploy + Confirmar.
4. CORRECCIÓN 4 → Visualización de hijas + Deploy + Confirmar.
5. CORRECCIÓN 5 → Validaciones de selectores + Deploy + Confirmar.

---

## REPORTE POR CORRECCIÓN

Al terminar cada una, mini-reporte con:
- Archivo modificado.
- Qué cambió.
- Prueba que Maxi debe hacer para validar.