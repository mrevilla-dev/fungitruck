# FungiTrack — Fase 3: Envasado Inicial y Trazabilidad de Subfracciones
## Módulo: Medios Preparados
> Mayo 2026

## CONTEXTO

El módulo de Medios Preparados ya tiene funcionando:
- Creación de medios con recetas, sanitización y auditoría.
- Subfraccionamiento manual desde el acordeón en la vista detalle.
- Filtro de ubicación que busca en bulk y subfracciones.
- Impresión de etiquetas ZPL con ubicación y operador.

**Problema a resolver:** al preparar un medio y envasarlo en varios frascos,
el sistema no los individualiza. El operario debe crear cada subfracción
a mano después, lo que genera problemas de trazabilidad y errores de stock.

**Solución:** agregar en el formulario de preparación una Fase 3 que permita
registrar los envases físicos inmediatamente. Al guardar, el sistema generará
automáticamente las subfracciones correspondientes, cada una con su ID,
ubicación y QR.

**Reglas generales:**
- Un bloque a la vez. Leer cada archivo antes de tocarlo.
- Cambios aditivos. No romper lo que ya funciona.
- Deployar y confirmar con Maxi antes de pasar al siguiente bloque.
- `writeBatch` o `runTransaction` con lecturas primero, escrituras después.
- `campo?.subcampo ?? fallback` siempre.
- Imágenes solo Google Drive. Deploy solo Firebase Hosting.

---

## BLOQUE 1 — Fase 3: Envasado inicial en formulario de preparación

**Objetivo:** que al crear un medio, el operario pueda registrar los envases
físicos en los que se fraccionó.

### 1.1 Nueva sección en NuevoMedioModal.jsx

Agregar después de sanitización y antes de confirmar:

**📦 3. Envasado y Sub-Fraccionamiento**

1.  **Selector de Envase Principal:**
    - Cargar opciones desde `insumos_base` filtrando por `es_envase: true`.
    - Mostrar stock disponible entre paréntesis.
    - Incluir opción "Otro" con campo de texto libre.

2.  **Volumen por unidad (ml):**
    - Input numérico con valor por defecto según el envase seleccionado.
    - Permitir ajuste manual.

3.  **Cantidad de unidades:**
    - Input numérico, valor mínimo 1.

4.  **Botón: ➕ Agregar Envases al Lote**
    - Agrega entradas individuales a la lista visual.

### 1.2 Lista de Distribución en Mesa

Cada envase agregado se muestra como una tarjeta compacta:
- Nombre del envase y número (N°1, N°2...).
- Capacidad inicial y restante.
- Selector de ubicación individual.
- Campo de detalle opcional.
- Botones: 🧪 Sub-fraccionar (deshabilitado) y 🗑️ Eliminar.

### 1.3 Generación automática al guardar

En el mismo `runTransaction` que crea el medio (usando el patrón corregido):

1.  Crear el documento en `medios_preparados`.
2.  Por cada envase en la lista, crear documento en `subfracciones/` con:
    - `id_bolsa`: `FRAC-{codigoMedio}-{fecha}-{N}`.
    - `tipo_envase`, `tipo_unidad`, `cantidad`: 1, `disponible`: 1.
    - `volumen_por_unidad_ml`, `ubicacion`, `ubicacion_detalle`.
    - `fecha`, `operario`, `estado`: "Disponible", `novedades`: [].
3.  Actualizar `stock_bulk.cantidad_actual` restando el volumen total envasado.
4.  Descontar del stock el insumo envase (si aplica).

### 1.4 Impresión de etiquetas

Al finalizar, si hay envases, mostrar automáticamente el modal de impresión
con una etiqueta por cada envase, usando los perfiles ZPL existentes.

---

## BLOQUE 2 — Resumen de subfracciones en la tarjeta del maestro

**Objetivo:** mostrar información resumida de las subfracciones en la card
del medio, sin necesidad de abrir acordeones.

### 2.1 Lectura eficiente

Agregar campos `total_subfracciones` y `subfracciones_disponibles` en el
documento del medio. Actualizarlos en cada operación de subfraccionamiento.

### 2.2 Visualización en la card

Mostrar debajo de los chips de ubicación:
- `🧫 2 envases (1 disponible)` o `🧫 2 envases (todos disponibles)`.
- Si no hay subfracciones, no mostrar nada.

### 2.3 Chip de ubicaciones múltiples

El chip de ubicación debe reflejar todas las ubicaciones distintas de las
subfracciones. Ejemplo: `📍 Heladera Lab · Freezer -80°C`.

---

## BLOQUE 3 — Integración con filtro de ubicación y etiquetas

### 3.1 Verificar filtro de ubicación

Confirmar que el filtro existente (que busca en `subfracciones/`) funcione
con las nuevas subfracciones creadas desde el envasado inicial.

### 3.2 Impresión multipaquete

Verificar que el endpoint de impresión reciba correctamente el `id_bolsa`
de cada subfracción y que el ZPL muestre los datos de cada envase individual.

---

## ORDEN DE EJECUCIÓN

1.  **BLOQUE 1** → Fase 3 en NuevoMedioModal.jsx + Deploy + Confirmar.
2.  **BLOQUE 2** → Resumen en tarjeta del maestro + Deploy + Confirmar.
3.  **BLOQUE 3** → Verificación de filtro y etiquetas + Deploy + Confirmar.

---

## REPORTE POR BLOQUE

Al finalizar cada bloque, generar un mini-reporte con:
- Archivos modificados.
- Nuevos campos en Firestore (si los hay).
- Descripción del nuevo flujo implementado.
- Preguntas para Maxi que permitan validar lo hecho.