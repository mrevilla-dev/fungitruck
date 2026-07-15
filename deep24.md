# FungiTrack — Prompt para Antigravity
## Módulo: Árbol Genealógico Visual (React Flow)
> 22/06/2026 — Basado en documento de diseño cerrado (Diseno_Arbol_Genealogico.md)

---

## REGLAS DE ORO

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.
3. Todos los cambios son aditivos. No eliminar lógica existente.
4. No tocar la lógica de creación de Ejemplares/Batches/Eventos — este módulo es de **solo lectura**.
5. Defensive programming: `campo?.subcampo ?? fallback` siempre.
6. **Antes de escribir código de cada bloque, mostrame un plan de implementación y esperá mi confirmación.**
7. Confirmar antes de avanzar al siguiente bloque.

---

## CONTEXTO Y DECISIONES DE DISEÑO YA TOMADAS

- Árbol bidireccional (ancestros + descendientes), centrado en un Ejemplar.
- Colapsado por defecto, expansión manual rama por rama.
- Entrada por buscador de texto O lectura de QR (ambos disponibles).
- Ficha de detalle del nodo: panel lateral/modal **superpuesto** sobre el árbol (no navega a otra página).
- Nodos "hito" siempre visibles: Esporoma, Evento de Aislamiento, Ejemplar, Hibridación, Cosecha, Criopreservación.
- Pasajes de Batch (T1, T2, T3...) del mismo Ejemplar: comprimidos en un nodo `🔁 N pasajes`, expandible.
- Hibridación: nodo tipo rombo, 2 líneas de entrada (padres) convergiendo, 1 línea de salida (resultado). Badge de color según estado (ámbar=En evaluación, verde=Activo, gris=Inviable).
- **Modelo estrictamente binario: cada Hibridación tiene exactamente 2 padres.** No se diseña para 3+.
- Colores heredados del código de colores ya existente en el diagrama de flujo general del sistema.
- Ejemplares con `procedencia: "Comercial"`: nodo raíz sin rama hacia atrás, badge "Externo".
- Solo lectura en V1 — no hay edición desde el árbol.
- Sin exportación en V1.
- Si la entrada es por Batch (no Ejemplar): el árbol se centra en el Ejemplar dueño; el batch se resalta con borde distintivo Y su ficha de detalle se abre automáticamente al cargar.
- Queries: múltiples llamadas encadenadas en el cliente (sin Cloud Function de linaje pre-calculado).

---

## BLOQUE 1 — Función de construcción del árbol (lógica de datos, sin UI)

**Archivos a crear:** util/helper nuevo, ej. `construirArbolGenealogico.js`

### Objetivo
Antes de tocar cualquier componente visual, resolver la lógica de traer y armar la estructura de datos del árbol a partir de un `ejemplarId`.

### 1.1 — Función principal
Recibe un `ejemplarId` (o `batchId`, ver 1.3) y devuelve una estructura de nodos + conexiones (formato compatible con React Flow: arrays de `nodes` y `edges`).

Debe resolver, mediante múltiples queries encadenadas:
- **Hacia atrás (ancestros):** desde el Ejemplar, seguir `esporoma_origen_id` (si existe), `evento_aislamiento_id` (si existe), `ejemplar_padre_id` / `ejemplar_madre_id` (si es resultado de hibridación).
- **Hacia adelante (descendientes):** buscar Ejemplares que tengan a este como `ejemplar_padre_id` o `ejemplar_madre_id`; buscar Batches con `ejemplarId` igual al consultado; buscar si hay Cosecha o registro de Criopreservación vinculados.
- **Pasajes de Batch:** agrupar todos los batches de un mismo Ejemplar que comparten `numero_transferencia` consecutivo en un solo nodo comprimido `🔁 N pasajes`, con la data de cada pasaje individual disponible para cuando se expanda.

### 1.2 — Manejo de huérfanos
Si el Ejemplar tiene `procedencia: "Comercial"` (o similar, sin esporoma/evento de origen), no intentar seguir la rama hacia atrás — se marca como nodo raíz con flag `externo: true`.

### 1.3 — Entrada por Batch
Si la función recibe un `batchId` en lugar de un `ejemplarId`, primero resuelve el `ejemplarId` dueño de ese batch, construye el árbol centrado en ese Ejemplar, y marca el `batchId` original con flag `resaltado: true` en el nodo correspondiente (dentro del grupo de pasajes comprimido).

### 1.4 — Estructura de salida esperada (ejemplo orientativo)
```javascript
{
  nodes: [
    { id, tipo: 'esporoma'|'evento'|'ejemplar'|'pasajes'|'hibridacion'|'cosecha'|'crio', data: {...} },
    ...
  ],
  edges: [
    { source, target },
    ...
  ],
  nodoCentral: ejemplarId,
  nodoResaltado: batchId | null
}
```

**No escribir componentes visuales en este bloque — solo la función de datos.**

**Build y confirmar antes de continuar.**

---

## BLOQUE 2 — Componente visual base (React Flow, colapsado)

**Archivos a crear:** `ArbolGenealogicoPage.jsx` o componente equivalente, más sub-componentes de nodo custom por tipo.

### 2.1 — Integración de React Flow
Instalar/configurar React Flow. Renderizar el árbol a partir de la estructura del Bloque 1.

### 2.2 — Nodos custom por tipo
Crear un componente de nodo visual por cada tipo: Esporoma, Evento, Ejemplar, Pasajes (comprimido), Hibridación (rombo), Cosecha, Criopreservación. Cada uno con su color heredado del código de colores del sistema y la info mínima visible (ver tabla de la Sección 3 del documento de diseño).

### 2.3 — Estado colapsado por defecto
El árbol inicial muestra solo nodos "hito". Los nodos de tipo "Pasajes" arrancan comprimidos. Agregar interacción de expand/collapse.

### 2.4 — Badge "Externo"
Para Ejemplares huérfanos (`externo: true`), mostrar el badge correspondiente.

### 2.5 — Resaltado de batch (si aplica)
Si `nodoResaltado` viene seteado, aplicar borde distintivo visual al nodo/pasaje correspondiente dentro del grupo comprimido.

**Build y confirmar antes de continuar.**

---

## BLOQUE 3 — Punto de entrada: buscador y QR

**Archivos a modificar/crear:** integración en el componente del Bloque 2, posible reuso del lector QR ya existente en el sistema (verificar si hay un componente de escaneo QR compartido en otros módulos antes de crear uno nuevo).

### 3.1 — Buscador de texto
Input que busca por ID semántico o nombre de cepa, dispara la construcción del árbol (Bloque 1) centrado en el resultado.

### 3.2 — Lectura de QR
Reusar el lector de cámara QR ya existente en el sistema (revisar otros módulos — el flujo de escaneo en seguimiento de lotes ya lo usa). Al escanear, identifica si el QR corresponde a un Ejemplar o un Batch y dispara la construcción del árbol con el `ejemplarId` o `batchId` correspondiente.

**Build y confirmar antes de continuar.**

---

## BLOQUE 4 — Ficha de detalle (panel superpuesto)

**Archivos a crear:** `FichaNodoArbol.jsx` o componente equivalente (panel lateral o modal).

### 4.1 — Apertura al seleccionar nodo
Al tocar cualquier nodo del árbol, abrir el panel superpuesto sin perder el árbol de fondo (no navegar a otra ruta/página).

### 4.2 — Contenido según tipo de nodo
Mostrar los campos correspondientes según la tabla de la Sección 3 del documento de diseño (cada tipo de nodo tiene su propio set de campos a mostrar).

### 4.3 — Apertura automática para batch resaltado
Si el árbol fue cargado a partir de un `batchId` (entrada por QR de batch), la ficha de ese batch debe abrirse automáticamente apenas el árbol termina de cargar, sin esperar interacción del usuario.

**Build y confirmar antes de continuar.**

---

## VERIFICACIÓN FINAL

1. Build sin errores.
2. Buscar un Ejemplar por texto → árbol se centra correctamente, colapsado.
3. Escanear QR de un Ejemplar → mismo resultado que búsqueda por texto.
4. Escanear QR de un Batch → árbol centrado en el Ejemplar dueño, batch resaltado, ficha abierta automáticamente.
5. Expandir un nodo "Pasajes" → ver los T1/T2/T3 individuales con su data.
6. Verificar un Ejemplar resultado de Hibridación → nodo rombo, 2 padres convergiendo, badge de estado correcto.
7. Verificar un Ejemplar con `procedencia: Comercial` → nodo raíz, badge "Externo", sin rama hacia atrás.
8. Verificar que tocar cualquier nodo abre su ficha correspondiente sin perder el árbol de fondo.
9. Verificar que ningún dato se modifica desde esta vista (solo lectura).

---

**Recordatorio: mostrame el plan de cada bloque antes de tocar código. Un bloque a la vez.**
