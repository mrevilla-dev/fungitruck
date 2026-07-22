# FungiTrack — Especificación de Diseño
## Módulo: Árbol Genealógico Visual
> 22/06/2026 — Documento de diseño conceptual, NO es un prompt de implementación todavía.
> Objetivo: iterar con otra IA para detectar huecos antes de armar el prompt técnico para Antigravity.

---

## 1. Propósito

Visualizar la trazabilidad genética completa de un Ejemplar/Esporoma: de dónde viene (ancestros) y qué generó (descendientes), incluyendo los pasajes físicos (repiques) que tuvo en el camino.

Caso de uso real: Maxi (o cualquier investigador) escanea un QR en el laboratorio o busca un ID, y quiere ver el linaje completo de esa cepa — quién es su origen, qué cruces generó, en qué medios estuvo, sin tener que navegar entre módulos separados.

---

## 2. Decisiones de diseño ya tomadas

### 2.1 — Direccionalidad
Bidireccional. El Ejemplar/nodo consultado es el centro; se ve hacia atrás (ancestros) y hacia adelante (descendientes) simultáneamente.

### 2.2 — Estado inicial del árbol
Colapsado por defecto. Se expande rama por rama con interacción del usuario (no todo desplegado de entrada, para evitar saturación visual en linajes con muchos nodos).

### 2.3 — Punto de entrada
Doble vía, ambas siempre disponibles:
- Buscador de texto (ID semántico o nombre de cepa) — más cómodo desde escritorio.
- Lectura de QR con cámara — más cómodo desde el laboratorio con guantes puestos.

### 2.4 — Ficha de detalle del nodo
Al tocar/seleccionar un nodo, se abre un panel lateral o modal **superpuesto sobre el árbol**, sin abandonar la vista del árbol de fondo. El árbol mantiene su estado (zoom, nodos expandidos) detrás del panel.

### 2.5 — Densidad de nodos — enfoque híbrido
- **Nodos "hito" siempre visibles** (no requieren expandir): Esporoma, Evento de Aislamiento, Ejemplar, Hibridación, Cosecha, Criopreservación.
- **Pasajes de Batch del mismo Ejemplar** (T1, T2, T3...) se muestran **comprimidos** por defecto en un solo nodo tipo `🔁 N pasajes`, expandible con un clic para ver cada transferencia individual (fecha, medio, sala).

**Razón de esta decisión:** el panorama general de linaje no necesita ver cada repique operativo, pero la trazabilidad auditable sí necesita poder acceder a ese detalle sin salir del árbol.

### 2.6 — Hibridación — caso visual especial
Dos (o más, ver punto 4) líneas convergen desde los Ejemplares padres hacia un nodo de Hibridación con forma distinta al resto (ej. rombo, igual convención que "decisión/control" en el diagrama de flujo general del sistema). De ese nodo sale una línea hacia el Ejemplar resultado.

El nodo de Hibridación muestra estado con badge de color heredado de `EjemplaresPage`:
- Ámbar = "En evaluación"
- Verde = "Activo"
- Gris = "Inviable"

Esto permite identificar de un vistazo qué cruces prosperaron sin abrir ninguna ficha.

### 2.7 — Código de colores
Hereda la lógica de colores ya establecida en el diagrama de flujo general del sistema (verde = flujo biológico, violeta = cepario/genética, azul = criopreservación, amarillo = control/QC, etc.), sin estar 100% atado — si algún color necesita ajustarse para diferenciarse mejor en el contexto del árbol, el cambio se aplica **en ambos lugares a la vez** (diagrama general y árbol), para no bifurcar el lenguaje visual del sistema en dos convenciones distintas.

---

## 3. Tipos de nodo y qué información muestra cada uno

| Tipo de nodo | Visible siempre | Info en el nodo (vista colapsada) | Info en ficha de detalle (al abrir) |
|---|---|---|---|
| Esporoma | Sí | Especie, fecha, origen | Todos los campos del documento `esporomas` + foto |
| Evento de Aislamiento | Sí | Técnica, fecha, cantidad derivados | Todos los campos de `eventos_aislamiento` |
| Ejemplar | Sí | ID semántico, MAT, estado | Todos los campos de `ejemplares` + lista de pasajes (batches) |
| Pasaje de Batch (T1, T2...) | No (comprimido en grupo) | — | Medio, sala, fecha, operador, observaciones, fotos de seguimiento |
| Hibridación | Sí | Fecha, estado (badge color) | Padres, fecha, observaciones, ejemplar resultado |
| Cosecha | Sí (si existe) | Fecha, peso fresco | Datos completos de cosecha + EB |
| Criopreservación | Sí (si existe) | Fecha, protocolo | Datos completos de crioviales |

**Nota:** Cosecha y Criopreservación están marcados "si existe" porque no todo Ejemplar/Batch necesariamente llega a esas etapas — son hojas terminales opcionales del árbol, no obligatorias.

---

## 4. Limitación conocida y aceptada (por ahora)

El modelo actual de Hibridación asume **exactamente 2 padres** (`ejemplar_padre_id` / `ejemplar_madre_id`, MAT 1-1 × MAT 1-2). Biológicamente esto es una simplificación — en micología podrían existir cruces con más de 2 progenitores o esquemas más complejos.

**Decisión:** no se resuelve ahora. El árbol y el modelo de datos siguen con el esquema binario ya construido en el Módulo 5 (Ejemplares). Esta limitación queda documentada para una eventual revisión futura, sin bloquear el diseño actual.

---

## 5. Puntos resueltos (decisiones finales)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Origen de datos / queries | **Opción A** — múltiples queries encadenadas en el cliente (siguiendo `ejemplar_padre_id`, `batch_origen_id`, etc.). No se usa documento de linaje pre-calculado (Opción B) porque requeriría que toda ruta de creación/edición presente y futura (NuevoCultivoModal, NuevoEventoAislamientoModal, RegistroMasivoAislamientosModal, futuro Cosechas, futuro Criobanco) dispare una Cloud Function sin excepción; si una ruta nueva se agrega y no se conecta, el documento de linaje queda desactualizado sin generar error visible. La Opción A siempre lee el estado real de la base. Se reevalúa Opción B solo si el rendimiento de la V1 lo justifica. |
| 2 | Rendimiento con linajes grandes | Resuelto por diseño: colapso por defecto + compresión de pasajes de Batch en nodo `🔁 N pasajes`. Un Evento con 20 Ejemplares se reduce a ~21 nodos visibles. |
| 3 | Descendientes de Hibridación (cruces sucesivos) | Se modela como DAG (grafo acíclico dirigido) vía React Flow. **El modelo sigue siendo estrictamente binario: cada Hibridación tiene exactamente 2 padres** (`ejemplar_padre_id`, `ejemplar_madre_id`). Un Ejemplar resultado de una Hibridación puede a su vez ser padre de una Hibridación siguiente, pero siempre de a 2 por nodo de cruce. |
| 4 | Ejemplares huérfanos (`procedencia: Comercial`) | Se muestran como nodo raíz sin rama hacia atrás, con badge visual "Externo". |
| 5 | Exportación del árbol | Fuera de alcance para V1. React Flow soporta exportar a imagen — se evalúa para V2. |
| 6 | Edición desde el árbol | Solo lectura en V1. Las acciones de marcar Hibridación como Activo/Inviable se mantienen únicamente en el Dashboard, para no duplicar lógica de edición en dos lugares. |
| 7 | Entrada por Batch (no por Ejemplar) | El árbol se centra siempre en el **Ejemplar dueño** del Batch (un solo criterio de nodo central). El Batch escaneado/buscado se resalta visualmente (borde distintivo) **y además su ficha de detalle se abre automáticamente** al cargar el árbol — sin necesidad de un clic adicional — ya que es el dato operativo puntual que el usuario fue a buscar. El árbol completo queda de contexto alrededor. |

---

## 6. Stack sugerido (a confirmar)

Mencionado en el Handoff como sugerencia: **React Flow**. Sirve para nodos custom, conexiones, zoom/pan y expand/collapse — encaja con los requisitos de este documento. No se ha evaluado una alternativa todavía.

---

*Documento de diseño cerrado — todas las decisiones tomadas. Listo para derivar en el prompt técnico por bloques.*
