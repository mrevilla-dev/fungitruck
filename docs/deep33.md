FungiTrack — Mejora de la Cola de Impresión
Módulo: Impresión
08/07/2026

ANTES DE EMPEZAR — REGLAS OBLIGATORIAS

Leer cada archivo completo antes de modificarlo

Un cambio a la vez — npm run build y confirmar entre cambios

Cambios aditivos únicamente — no eliminar lógica existente

Defensive programming: campo?.subcampo ?? fallback siempre

Mostrar plan antes de tocar código y esperar confirmación

CONTEXTO
La cola de impresión (PrintQueue.jsx) ya funciona. Este prompt agrega 4 mejoras.

MEJORA 1 — Filtro por operador
Objetivo
Agregar un dropdown para filtrar las etiquetas pendientes por operario.

Requerimientos
Leé PrintQueue.jsx completo.

Agregar un <select> en la parte superior, antes de la lista de etiquetas.

Opciones del select:

"👤 Todos los operarios" (default, muestra todo)

Un <option> por cada operario que tenga al menos una etiqueta pendiente en cola_impresion.

Extraer los operarios dinámicamente de los documentos en cola_impresion con estado: "Pendiente".

Si no hay etiquetas pendientes, el selector se oculta.

El filtro se aplica en memoria (no hace falta nueva query a Firestore).

MEJORA 2 — Optimización de espacio (nesting)
Objetivo
Permitir seleccionar varias etiquetas pendientes y que el sistema sugiera la mejor distribución para imprimirlas en un solo sticker de 100x150mm, ordenadas cronológicamente.

Requerimientos
Leé PrintQueue.jsx y zplProfiles.js completos.

Agregar checkboxes de selección múltiple en cada etiqueta o lote de la cola.

Agregar un botón "📐 Optimizar seleccionadas" que se active al seleccionar 2 o más etiquetas.

Al hacer clic, el sistema debe:

Calcular cuántas etiquetas entran en un sticker de 100x150mm según el tamaño de cada perfil ZPL.

Sugerir la mejor distribución en grilla (ej: 2 columnas × 3 filas).

Mostrar una previsualización de cómo quedarían organizadas.

Ordenar las etiquetas por fecha de creación (más antiguas primero).

El operario confirma y el sistema imprime el sticker compuesto.

Usar los perfiles ZPL existentes. No crear nuevos.

MEJORA 3 — Cambiar formato desde la cola
Objetivo
Permitir modificar el perfil ZPL de una etiqueta ya enviada a la cola.

Requerimientos
Leé PrintQueue.jsx completo.

Agregar un botón "✏️ Cambiar formato" en cada etiqueta o lote de la cola.

Al hacer clic, mostrar un dropdown con los perfiles ZPL disponibles (los mismos que en PrintLabelsModal.jsx).

Al seleccionar un nuevo perfil, actualizar el campo tipo_etiqueta en Firestore.

Mostrar un toast de confirmación: "Formato actualizado a SLIM_PETRI."

MEJORA 4 — Agrupación por lote
Objetivo
Permitir agrupar manualmente etiquetas del mismo lote para imprimirlas juntas.

Requerimientos
Leé PrintQueue.jsx completo.

Si hay etiquetas con el mismo batch_grupo_id o modulo, mostrar un botón "📦 Agrupar lote".

Al hacer clic, seleccionar automáticamente todas las etiquetas de ese lote.

El operario puede desmarcar individualmente si quiere.

Luego puede usar la Mejora 2 (nesting) para optimizarlas.

VERIFICACIÓN FINAL
Build sin errores.

Filtro por operador: dropdown se llena correctamente, filtra en memoria, opción "Todos" funciona.

Nesting: seleccionar 4 etiquetas de distintos tamaños, verificar que el sistema sugiere una grilla, confirmar e imprimir.

Cambiar formato: modificar una etiqueta de STANDARD a SLIM_PETRI, verificar en Firestore.

Agrupación: etiquetas del mismo lote se agrupan con un clic.

Implementar en orden: Mejora 1 → Mejora 2 → Mejora 3 → Mejora 4.
Mostrar plan antes de codificar cada una.

