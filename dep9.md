# FungiTrack — Ajuste de envasado inicial y subfraccionamiento de envases
## Módulo: Medios Preparados
> Mayo 2026

---

## CONTEXTO

En el Bloque 1 anterior implementamos la Fase 3 de envasado inicial, que genera
automáticamente subfracciones al crear un medio. Detectamos dos necesidades nuevas:

1. **Agrupación de unidades:** cuando el operario envasa unidades pequeñas (eppendorfs,
   crioviales, placas), debe poder elegir si van todas juntas en un contenedor o si
   cada una es una unidad independiente.

2. **Subfraccionamiento desde envases:** los envases individuales (frascos, potes)
   generados necesitan poder subfraccionarse a su vez (sacar placas, eppendorfs).

Además, Maxi detectó un **bug** en el campo "Tipo de envase" del formulario:
actualmente las opciones son "Bolsa, Caja, Bandeja, Otro". Al elegir "Otro" y escribir
un nuevo tipo, ese nuevo tipo NO se está agregando a la lista de validación para
usos futuros. Debe corregirse.

**REGLA DE ORO:** Un bloque a la vez. Leer cada archivo antes de tocarlo.
Todos los cambios son aditivos. No romper lo que ya funciona.
Confirmar con Maxi y deployar antes de pasar al siguiente bloque.

**Reglas técnicas:**
- `writeBatch` o `runTransaction` con lecturas primero, escrituras después.
- `campo?.subcampo ?? fallback` siempre.
- Imágenes solo Google Drive. Deploy solo Firebase Hosting.

---

## BLOQUE 1 — Ajuste en envasado inicial: agrupación de unidades y corrección de "Otro"

**Objetivo:** permitir que el operario decida si las unidades se agrupan en un
contenedor o se tratan como unidades independientes, y corregir el bug del campo
"Tipo de envase" para que las opciones nuevas se guarden.

### 1.1 — Modificación del campo "Tipo de envase"

Actualmente el campo "Tipo de envase" tiene estas opciones:

- Bolsa
- Caja
- Bandeja
- Otro (con campo de texto adicional "Especifique el tipo de envase")

Se debe agregar una nueva opción al inicio de la lista:

- **Unidad independiente**
- Bolsa
- Caja
- Bandeja
- Otro (con campo de texto adicional)

**Comportamiento de cada opción:**

- **"Unidad independiente":** genera una subfracción individual por cada unidad.
  Cada una con `id_bolsa` secuencial (A, B, C...), `cantidad: 1`, `disponible: 1`.
  Los contadores del medio se incrementan según la cantidad de unidades.

- **Bolsa, Caja, Bandeja, Otro:** todas las unidades se agrupan en UNA SOLA
  subfracción. Esta subfracción tendrá:
  - `cantidad`: la cantidad total de unidades.
  - `disponible`: la cantidad total.
  - `tipo_envase`: el seleccionado (ej: "Bolsa").
  - `tipo_unidad`: el tipo de unidad elegido (ej: "Eppendorf 1.5ml").
  - `volumen_por_unidad_ml`: el volumen de cada unidad.
  - `id_bolsa` con una sola letra (ej: `FRAC-APD-20260529-A`).
  - Los contadores del medio se incrementan en 1.

**Valor por defecto sugerido:**
- Si `tipo_unidad` es pequeño (Eppendorf, Criovial, Placa Petri), sugerir "Bolsa".
- Si `tipo_unidad` es grande (Frasco 500ml, Pote PP, Frasco 1L), sugerir
  "Unidad independiente".
- El operario siempre puede cambiarlo.

### 1.2 — Corrección del bug de "Otro"

Cuando el operario selecciona "Otro" y escribe un nuevo tipo de envase en el campo
"Especifique el tipo de envase", ese valor debe:

1. Guardarse correctamente en el documento de la subfracción que se está creando.
2. Agregarse a una lista de opciones personalizadas para que aparezca disponible
   en futuros usos.

**Implementación sugerida:**
- Mantener un array `tipos_envase_personalizados` en un documento de configuración
  (ej: `app_config/tipos_envase`) o en `localStorage`.
- Al guardar un nuevo tipo, agregarlo a ese array.
- Al cargar el formulario, combinar las opciones fijas (Bolsa, Caja, Bandeja,
  Unidad independiente, Otro) con las opciones personalizadas guardadas.
- Evitar duplicados.

Si esto es muy complejo para este bloque, al menos asegurar que el valor escrito
en "Especifique el tipo de envase" se guarde correctamente en el campo `tipo_envase`
del documento de subfracción. La persistencia en la lista puede ser una mejora
posterior, pero dejarla anotada como pendiente.

### 1.3 — Campo "Tipo de unidad"

El campo "Tipo de unidad" sigue funcionando exactamente igual:
- Se alimenta de `insumos_base` filtrando por `es_envase: true` (reutilizables y
  descartables marcados como envase/contenedor).
- Incluye la opción "Otro" con campo de texto libre.

### 1.4 — No modificar
- La lógica de descuento del stock bulk.
- La impresión de etiquetas.
- La estructura de Firestore.
- Cualquier otro componente.

---

## BLOQUE 2 — Subfraccionamiento desde envases individuales

**Objetivo:** habilitar el botón "🧪 Sacar Placas/Tubos" en cada subfracción
para generar nuevas subfracciones hijas a partir de un envase padre.

### 2.1 — Habilitar el botón

En `SubfraccionamientoAccordion.jsx`, para cada subfracción listada,
el botón "🧪 Sacar Placas/Tubos" debe estar habilitado si:
- `disponible > 0` (si es una bolsa con unidades) O
- `disponible > 0` en volumen (si es un envase con `volumen_por_unidad_ml`).

Actualmente está deshabilitado. Cambiarlo.

### 2.2 — Modal de subfraccionamiento desde envase

Al hacer clic en "🧪 Sacar Placas/Tubos" en una subfracción, abrir un modal
con estos campos:

- **Tipo de unidad:** select desde `insumos_base` con `es_envase: true`.
- **Volumen por unidad (ml):** input numérico.
- **Cantidad de unidades:** input numérico, mínimo 1.
- **Tipo de envase:** select con las mismas opciones del Bloque 1:
  - Unidad independiente
  - Bolsa
  - Caja
  - Bandeja
  - Otro (con campo de texto "Especifique el tipo de envase")
- **Ubicación:** select dinámico (ubicaciones fijas + salas).
- **Ubicación detalle:** texto libre opcional.
- **Operario:** precargado con usuario autenticado, editable con advertencia.

### 2.3 — Generación de subfracciones hijas

Al confirmar, en el mismo `writeBatch`:

1. **Crear nueva(s) subfracción(es)** en `medios_preparados/{id}/subfracciones/`:
   - `id_bolsa` secuencial.
   - `parent_id`: el `id_bolsa` de la subfracción padre.
   - `tipo_unidad`, `volumen_por_unidad_ml`.
   - `tipo_envase`: el seleccionado.
   - `ubicacion`, `ubicacion_detalle`, `operario`.
   - `estado`: "Disponible", `novedades`: [].
   - Si eligió "Unidad independiente": `cantidad: 1`, `disponible: 1` (una por unidad).
   - Si eligió otro contenedor: `cantidad: N`, `disponible: N` (una sola subfracción).

2. **Descontar del padre:**
   - Si el padre tiene `volumen_por_unidad_ml`, descontar del `disponible`
     (que representa ml restantes) el volumen total usado.
   - Si el padre tiene `cantidad` de unidades, descontar la cantidad usada
     (si se usó 1 placa para generar 10 eppendorfs, descontar 1).

3. **Actualizar contadores del medio:**
   - `total_subfracciones` +1 (o +N si son unidades independientes).
   - `subfracciones_disponibles` +1 (o +N).

### 2.4 — Impresión

Al finalizar, preguntar si desea imprimir etiqueta(s) para la(s) nueva(s)
subfracción(es). Usar el mismo flujo de impresión existente.

### 2.5 — No modificar
- La estructura de Firestore.
- La lógica de novedades, reimpresión y eliminación (las nuevas subfracciones
  la heredan automáticamente).
- El descuento de insumos.
- El filtro de ubicación.

---

## ORDEN DE EJECUCIÓN

1. **BLOQUE 1** → Ajuste de agrupación y corrección de "Otro" + Deploy + Confirmar.
2. **BLOQUE 2** → Subfraccionamiento desde envases + Deploy + Confirmar.

---

## REPORTE POR BLOQUE

Al finalizar cada bloque, generar un mini-reporte con:
- Archivos modificados.
- Nuevos campos en Firestore (si los hay).
- Descripción del nuevo flujo implementado.
- Preguntas para Maxi que permitan validar lo hecho.