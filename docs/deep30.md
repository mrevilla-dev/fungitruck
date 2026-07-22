# Prompt — Rediseño Árbol Genealógico
## FungiTrack · Para ejecutar con Antigravity · Bloque a bloque

---

> **ANTES DE EMPEZAR — REGLAS OBLIGATORIAS**
> 1. Leer cada archivo completo antes de modificarlo
> 2. Un bloque a la vez — `npm run build` y confirmar entre bloques
> 3. Cambios aditivos únicamente — no eliminar lógica existente
> 4. Defensive programming: `campo?.subcampo ?? fallback` siempre
> 5. Mostrar plan antes de tocar código y esperar confirmación
> 6. Si el writeBatch falla: toast de error, no resetear el formulario
> 7. NUNCA poner imágenes dentro de nodos de React Flow

---

## CONTEXTO — POR QUÉ SE REDISEÑA

La versión anterior del árbol genealógico quedó visualmente rota por estos bugs:
- Fotos renderizadas como imágenes gigantes dentro de los nodos de React Flow
- Nodos superpuestos en linajes con múltiples ejemplares
- Texto cortado ("Hib" en lugar de "Hibridación", ID y estado sin espacio)
- Conectores con colores sin criterio
- Panel lateral mostraba "N/A" en Medio y Sala

Este prompt reemplaza completamente la implementación anterior.
**Leer los archivos existentes antes de tocar cualquier cosa.**

---

## DISEÑO GENERAL

### Punto de entrada
```
Escanear QR de cualquier batch
    ↓
Detalle del batch (página existente)
    ↓
Botón "Ver árbol genealógico"
    ↓
Árbol centrado en ese batch
```

### Dos puntos de entrada al árbol
1. **Desde batch** (más común — uso en lab) → batch como foco central
2. **Desde ejemplar o esporoma** (uso investigación) → raíz genética como foco

### Recentrado dinámico
Cada nodo que puede ser raíz (esporoma, ejemplar, batch) muestra ícono 🎯 al expandirse. Al tocarlo, el árbol se reorganiza con ese nodo como nuevo foco — sin cambiar de página.

### Layout según dispositivo
```
Desktop → árbol horizontal, panel lateral fijo a la derecha
Mobile  → árbol vertical, panel de detalle ocupa pantalla completa
          navegación por scroll vertical
          swipe horizontal entre nodos del mismo nivel
```

### Comportamiento de hijos múltiples
Si un nodo tiene más de 3 hijos al mismo nivel:
- Mostrar los primeros 3
- Nodo especial "[+N más →]" tochable que expande el resto
- Al expandir aparece botón "[colapsar ↑]"

---

## ICONOS POR TIPO DE NODO

```javascript
// Usar emoji como fallback — reemplazar por SVG custom en iteración futura

const ICONOS_NODO = {
  // Tipo de contenedor / batch
  placa_petri:          '🧫',
  medio_liquido:        '🧪',
  spawn_grano:          '🫙',
  sustrato_definitivo:  '🌱',
  fructificando:        '🍄',
  criopreservado:       '❄️',

  // Tipo de material / ejemplar
  explanto:             '🔬',
  esporas_placa:        '⭕',
  jeringa_lc:           '💉',
  micelio_agar:         '🧫',
  micelio_grano:        '🫙',
  desconocido:          '❓',

  // Entidades
  ejemplar:             '🧬',
  esporoma:             '🍂',
  cosecha:              '📦',
  criovial:             '❄️',
};
```

### Colores de estado por nodo
```javascript
const COLORES_ESTADO = {
  'Planificado':        '#9E9E9E', // gris
  'Inoculado':          '#2196F3', // azul
  'Incubando':          '#FF9800', // naranja
  'Colonias visibles':  '#8BC34A', // verde claro
  'Fructificando':      '#4CAF50', // verde
  'Cosechado':          '#795548', // marrón
  'Contaminado':        '#F44336', // rojo
  'Descartado':         '#757575', // gris oscuro
  'Criopreservado':     '#00BCD4', // cyan
  'Activo':             '#4CAF50', // verde
  'En evaluación':      '#FF9800', // naranja
  'Inviable':           '#F44336', // rojo
  'Agotado':            '#757575', // gris
};
```

---

## BLOQUE 1 — Limpiar implementación anterior

### Objetivo
Identificar y remover los componentes rotos sin afectar la navegación ni otros módulos.

### 1.1 — Leer primero
```
src/pages/ArbolGenealogico.jsx (o el nombre real del archivo)
src/components/arbol/ (si existe esta carpeta)
src/utils/construirArbolGenealogico.js
```
Leer cada archivo completo antes de tocar cualquier cosa.

### 1.2 — Identificar qué se reemplaza
Mapear exactamente:
- Nombre real de la página del árbol
- Ruta en el router
- Imports en otros componentes que referencian el árbol
- El archivo `construirArbolGenealogico.js` — leer completo, se va a reescribir

### 1.3 — Remover solo los componentes de renderizado
Vaciar (no eliminar) los archivos de componentes del árbol.
Mantener:
- La ruta en el router
- Los imports en otros componentes
- El archivo de utils (se reescribe en Bloque 2)

### 1.4 — Verificar que la app compila sin el árbol
Poner un placeholder temporal en la página del árbol:
```jsx
export default function ArbolGenealogico() {
  return <div>Árbol en reconstrucción</div>;
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La app navega correctamente a todas las páginas excepto el árbol
- El placeholder se muestra sin errores de runtime

---

## BLOQUE 2 — Servicio de datos del árbol

### Objetivo
Reescribir `construirArbolGenealogico.js` con la lógica correcta. Sin UI todavía.

### 2.1 — Reescribir `src/utils/construirArbolGenealogico.js`

```javascript
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Construye el árbol completo centrado en un batch
 * Retorna estructura compatible con React Flow
 */
export async function construirArbolDesdeBatch(batchId) {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error('Batch no encontrado');

  const nodos = [];
  const aristas = [];

  // Nodo central — el batch escaneado
  nodos.push(crearNodoBatch(batch, { esFoco: true }));

  // Árbol hacia arriba — ancestros
  await construirHaciaArriba(batch, nodos, aristas);

  // Árbol hacia abajo — descendientes
  await construirHaciaAbajo(batch, nodos, aristas);

  return { nodos, aristas, foco: batchId };
}

/**
 * Construye el árbol completo centrado en un ejemplar
 */
export async function construirArbolDesdeEjemplar(ejemplarId) {
  const ejemplar = await getEjemplar(ejemplarId);
  if (!ejemplar) throw new Error('Ejemplar no encontrado');

  const nodos = [];
  const aristas = [];

  // Nodo central — el ejemplar
  nodos.push(crearNodoEjemplar(ejemplar, { esFoco: true }));

  // Hacia arriba — esporoma origen si existe
  if (ejemplar.esporoma_origen_id) {
    const esporoma = await getEsporoma(ejemplar.esporoma_origen_id);
    if (esporoma) {
      nodos.push(crearNodoEsporoma(esporoma));
      aristas.push(crearArista(esporoma.id, ejemplar.id, 'origen'));
    }
  }

  // Hacia abajo — todos los batches de este ejemplar
  const batches = await getBatchesDeEjemplar(ejemplarId);
  for (const b of batches) {
    nodos.push(crearNodoBatch(b));
    aristas.push(crearArista(ejemplarId, b.id, 'batch'));
    await construirHaciaAbajo(b, nodos, aristas);
  }

  return { nodos, aristas, foco: ejemplarId };
}

// ─── CONSTRUCCIÓN HACIA ARRIBA ──────────────────────────────────────────────

async function construirHaciaArriba(batch, nodos, aristas) {
  // 1. Ejemplar del batch
  const ejemplar = await getEjemplar(batch.ejemplarId);
  if (ejemplar) {
    nodos.push(crearNodoEjemplar(ejemplar));
    aristas.push(crearArista(ejemplar.id, batch.id, 'ejemplar'));

    // 2. Esporoma origen
    if (ejemplar.esporoma_origen_id) {
      const esporoma = await getEsporoma(ejemplar.esporoma_origen_id);
      if (esporoma) {
        nodos.push(crearNodoEsporoma(esporoma));
        aristas.push(crearArista(esporoma.id, ejemplar.id, 'origen'));
      }
    }

    // 3. Si vino de hibridación — dos padres
    if (ejemplar.ejemplar_padre_id) {
      const padre = await getEjemplar(ejemplar.ejemplar_padre_id);
      if (padre) {
        nodos.push(crearNodoEjemplar(padre, { esHibridacion: true }));
        aristas.push(crearArista(padre.id, ejemplar.id, 'hibridacion'));
      }
    }
    if (ejemplar.ejemplar_madre_id) {
      const madre = await getEjemplar(ejemplar.ejemplar_madre_id);
      if (madre) {
        nodos.push(crearNodoEjemplar(madre, { esHibridacion: true }));
        aristas.push(crearArista(madre.id, ejemplar.id, 'hibridacion'));
      }
    }
  }

  // 4. Batch padre (pasaje anterior)
  if (batch.batch_padre_id) {
    const batchPadre = await getBatch(batch.batch_padre_id);
    if (batchPadre) {
      nodos.push(crearNodoBatch(batchPadre));
      aristas.push(crearArista(batchPadre.id, batch.id, 'repique'));
      // Recursivo — un nivel más arriba
      await construirHaciaArribaBatch(batchPadre, nodos, aristas);
    }
  }
}

async function construirHaciaArribaBatch(batch, nodos, aristas, profundidad = 0) {
  if (profundidad > 5) return; // límite de seguridad
  if (batch.batch_padre_id) {
    const batchPadre = await getBatch(batch.batch_padre_id);
    if (batchPadre) {
      if (!nodos.find(n => n.id === batchPadre.id)) {
        nodos.push(crearNodoBatch(batchPadre));
        aristas.push(crearArista(batchPadre.id, batch.id, 'repique'));
        await construirHaciaArribaBatch(batchPadre, nodos, aristas, profundidad + 1);
      }
    }
  }
}

// ─── CONSTRUCCIÓN HACIA ABAJO ───────────────────────────────────────────────

async function construirHaciaAbajo(batch, nodos, aristas) {
  // Batches hijos (repiques desde este batch)
  const hijos = await getBatchesHijos(batch.id);
  for (const hijo of hijos) {
    if (!nodos.find(n => n.id === hijo.id)) {
      nodos.push(crearNodoBatch(hijo));
      aristas.push(crearArista(batch.id, hijo.id, 'repique'));
      // Un nivel más abajo (no recursivo infinito — máximo 3 niveles)
      const nietos = await getBatchesHijos(hijo.id);
      for (const nieto of nietos) {
        if (!nodos.find(n => n.id === nieto.id)) {
          nodos.push(crearNodoBatch(nieto));
          aristas.push(crearArista(hijo.id, nieto.id, 'repique'));
        }
      }
    }
  }

  // Cosechas del batch
  const cosechas = await getCosechasDelBatch(batch.id);
  for (const cosecha of cosechas) {
    nodos.push(crearNodoCosecha(cosecha));
    aristas.push(crearArista(batch.id, cosecha.id, 'cosecha'));
  }

  // Crioviales del batch
  const crioviales = await getCriovialesDelBatch(batch.id);
  if (crioviales.length > 0) {
    // Agrupar en un nodo resumen de criopreservación
    nodos.push(crearNodoCrioResumen(batch.id, crioviales));
    aristas.push(crearArista(batch.id, `crio-${batch.id}`, 'criopreservacion'));
  }
}

// ─── CREADORES DE NODOS ─────────────────────────────────────────────────────

function crearNodoBatch(batch, opciones = {}) {
  return {
    id: batch.id,
    type: 'batchNode',
    data: {
      tipo: 'batch',
      esFoco: opciones.esFoco ?? false,
      id: batch.id,
      status: batch.status ?? 'Inoculado',
      tipoContenedor: batch.tipoContenedor ?? '',
      medioPrepNombre: batch.medio_prep?.nombre ?? batch.medioPrepId ?? 'Sin medio',
      salaDestino: batch.sala_destino?.nombre ?? batch.destinoId ?? 'Sin sala',
      numeroTransferencia: batch.numero_transferencia ?? 1,
      fechaInoculacion: batch.fechaInoculacion ?? '',
      fotoUrl: batch.fotoUrl ?? null,
      operador: batch.operador ?? '',
      atributosExperimentales: batch.atributos_experimentales ?? {},
      experimento_id: batch.experimento_id ?? null,
    },
    position: { x: 0, y: 0 }, // React Flow calcula layout automático
  };
}

function crearNodoEjemplar(ejemplar, opciones = {}) {
  return {
    id: ejemplar.id,
    type: 'ejemplarNode',
    data: {
      tipo: 'ejemplar',
      esFoco: opciones.esFoco ?? false,
      esHibridacion: opciones.esHibridacion ?? false,
      id: ejemplar.id,
      genero: ejemplar.genero ?? '',
      especie: ejemplar.especie ?? '',
      cepa: ejemplar.codigo_cepa ?? '',
      tipoMaterial: ejemplar.tipo_material ?? 'Desconocido',
      ploidia: ejemplar.ploidia ?? '',
      tipoMicelio: ejemplar.tipo_micelio ?? '',
      mat: ejemplar.mat ?? '',
      estado: ejemplar.estado ?? 'Activo',
      fotoUrl: ejemplar.fotoUrl ?? null,
      // Resumen de batches asociados — se carga lazy al expandir
      _ejemplarId: ejemplar.id,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoEsporoma(esporoma) {
  return {
    id: esporoma.id,
    type: 'esporomaNode',
    data: {
      tipo: 'esporoma',
      id: esporoma.id,
      genero: esporoma.genero ?? '',
      especie: esporoma.especie ?? '',
      cepa: esporoma.codigo_cepa ?? '',
      origen: esporoma.origen_material ?? '',
      fecha: esporoma.fecha ?? '',
      fotoUrl: esporoma.fotoUrl ?? null,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoCosecha(cosecha) {
  return {
    id: cosecha.id,
    type: 'cosechaNode',
    data: {
      tipo: 'cosecha',
      id: cosecha.id,
      fecha: cosecha.fecha_cosecha ?? '',
      pesoFrescoG: cosecha.peso_fresco_g ?? 0,
      ebOleada: cosecha.eb_oleada ?? null,
      ebAcumulada: cosecha.eb_acumulada ?? null,
      numeroOleada: cosecha.numero_oleada ?? 1,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoCrioResumen(batchId, crioviales) {
  const activos = crioviales.filter(c => c.estado === 'Criopreservado').length;
  return {
    id: `crio-${batchId}`,
    type: 'crioResumenNode',
    data: {
      tipo: 'crioResumen',
      total: crioviales.length,
      activos,
      crioviales,
    },
    position: { x: 0, y: 0 },
  };
}

// ─── CREADOR DE ARISTAS ─────────────────────────────────────────────────────

function crearArista(desde, hasta, tipo) {
  const colores = {
    origen:          '#9C27B0', // violeta — vínculo genético
    repique:         '#2196F3', // azul — transferencia
    hibridacion:     '#FF5722', // naranja — hibridación
    cosecha:         '#4CAF50', // verde — producción
    criopreservacion:'#00BCD4', // cyan — criobanco
    batch:           '#607D8B', // gris azulado — ejemplar → batch
    ejemplar:        '#9C27B0', // violeta
  };

  return {
    id: `${desde}-${hasta}`,
    source: desde,
    target: hasta,
    type: 'smoothstep',
    style: { stroke: colores[tipo] ?? '#9E9E9E', strokeWidth: 2 },
    animated: tipo === 'hibridacion',
  };
}

// ─── QUERIES FIRESTORE ──────────────────────────────────────────────────────

async function getBatch(id) {
  if (!id) return null;
  try {
    // Incluir datos de medio_prep y sala para evitar N/A
    const snap = await getDoc(doc(db, 'batches', id));
    if (!snap.exists()) return null;
    const data = snap.data();

    // Resolver medio_prep
    if (data.medioPrepId) {
      const medioSnap = await getDoc(doc(db, 'mediospreparados', data.medioPrepId));
      if (medioSnap.exists()) {
        data.medio_prep = medioSnap.data();
      }
    }

    // Resolver sala destino
    if (data.destinoId) {
      // Buscar en la colección correcta según el sistema existente
      const salaSnap = await getDoc(doc(db, 'destinos', data.destinoId));
      if (salaSnap.exists()) {
        data.sala_destino = salaSnap.data();
      }
    }

    return { ...data, id: snap.id };
  } catch (e) {
    console.error('Error getBatch:', e);
    return null;
  }
}

async function getEjemplar(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'ejemplares', id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch (e) {
    console.error('Error getEjemplar:', e);
    return null;
  }
}

async function getEsporoma(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'esporomas', id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch (e) {
    console.error('Error getEsporoma:', e);
    return null;
  }
}

async function getBatchesDeEjemplar(ejemplarId) {
  try {
    const q = query(
      collection(db, 'batches'),
      where('ejemplarId', '==', ejemplarId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.error('Error getBatchesDeEjemplar:', e);
    return [];
  }
}

async function getBatchesHijos(batchPadreId) {
  try {
    const q = query(
      collection(db, 'batches'),
      where('batch_padre_id', '==', batchPadreId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.error('Error getBatchesHijos:', e);
    return [];
  }
}

async function getCosechasDelBatch(batchId) {
  try {
    const q = query(
      collection(db, 'cosechas'),
      where('batch_id', '==', batchId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    return [];
  }
}

async function getCriovialesDelBatch(batchId) {
  try {
    // Buscar crioviales vinculados via evento_criopreservacion → batch_origen_id
    const eventosQ = query(
      collection(db, 'eventos_criopreservacion'),
      where('batch_origen_id', '==', batchId)
    );
    const eventosSnap = await getDocs(eventosQ);
    if (eventosSnap.empty) return [];

    const eventoId = eventosSnap.docs[0].id;
    const criovialesQ = query(
      collection(db, 'crioviales'),
      where('evento_criopreservacion_id', '==', eventoId)
    );
    const criovialesSnap = await getDocs(criovialesQ);
    return criovialesSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    return [];
  }
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El servicio no hace queries a colecciones que no existen aún (cosechas y crioviales pueden retornar arrays vacíos)
- Los campos `medio_prep.nombre` y `sala_destino.nombre` se resuelven correctamente — no más N/A

---

## BLOQUE 3 — Componentes de nodos React Flow

### Objetivo
Crear los componentes visuales de cada tipo de nodo. Sin layout ni página todavía.

### 3.1 — Crear `src/components/arbol/nodos/NodoBatch.jsx`

**Estado colapsado (default para nodos secundarios):**
```
┌─────────────────────────────┐
│ 🧫 [ícono tipoContenedor]   │
│ ID del batch                │
│ [badge estado] · T2 · MEA   │
│ Estufa 1                    │
└─────────────────────────────┘
```

**Estado expandido (al tocar — o default si esFoco):**
```
┌─────────────────────────────┐
│ 🧫 [ícono tipoContenedor]   │
│ ID del batch          [🎯]  │
│ [badge estado]              │
│ ─────────────────────────── │
│ T2 · MEA · Estufa 1         │
│ 📅 18/06/2026               │
│ 🌡️ 25°C · 75% HR (si existe)│
│ [miniatura foto más reciente]│  ← lazy load, solo si existe fotoUrl
│ ─────────────────────────── │
│ [📋 Obs] [🖨️ QR] [⛔ Estado]│
│ [👁️ Contexto completo]      │
└─────────────────────────────┘
```

**Reglas importantes:**
- La foto es una miniatura pequeña (max 60px alto) — NUNCA imagen a tamaño completo
- La foto se carga lazy — solo cuando el nodo está expandido
- El ícono 🎯 solo aparece en nodos expandidos
- El badge de estado usa los colores definidos en COLORES_ESTADO
- El nodo del foco (esFoco: true) arranca expandido y tiene borde más prominente

**Botones de acción rápida:**
- 📋 Auditoría → abre el formulario de auditoría existente para ese batch
- 🖨️ QR → agrega a cola de impresión ZPL existente
- ⛔ Estado → dropdown inline para cambiar estado del batch
- 👁️ Contexto completo → navega a `/arbol/batch/:id` (panel lateral en desktop, página en mobile)

### 3.2 — Crear `src/components/arbol/nodos/NodoEjemplar.jsx`

**Estado colapsado:**
```
┌─────────────────────────────┐
│ [ícono tipoMaterial]        │
│ Especie · Cepa              │
│ [badge estado] · Ploidía    │
└─────────────────────────────┘
```

**Estado expandido:**
```
┌─────────────────────────────┐
│ [ícono tipoMaterial]        │
│ Especie · Cepa        [🎯]  │
│ [badge estado]              │
│ ─────────────────────────── │
│ Ploidía · MAT               │
│ Tipo micelio                │
│ ─────────────────────────── │
│ 🧫 12 en placa              │
│ ❄️ 4 criopreservados        │
│ 🍄 3 fructificando          │
│ ─────────────────────────── │
│ [👁️ Ver ejemplar completo]  │
└─────────────────────────────┘
```

El resumen de batches (🧫, ❄️, 🍄) se carga lazy al expandir el nodo.

### 3.3 — Crear `src/components/arbol/nodos/NodoEsporoma.jsx`

```
┌─────────────────────────────┐
│ 🍂 ESPOROMA          [🎯]  │
│ Género especie · Cepa       │
│ Origen · Fecha              │
│ [miniatura foto]            │
└─────────────────────────────┘
```

El esporoma siempre muestra su foto miniatura si existe — es la raíz del linaje.

### 3.4 — Crear `src/components/arbol/nodos/NodoCosecha.jsx`

```
┌─────────────────────────────┐
│ 📦 COSECHA #N               │
│ Fecha                       │
│ EB: 85% · Peso: 245g        │
└─────────────────────────────┘
```

Nodo siempre colapsado — no tiene estado expandido, solo linkea al detalle.

### 3.5 — Crear `src/components/arbol/nodos/NodoCrioResumen.jsx`

```
┌─────────────────────────────┐
│ ❄️ CRIOBANCO                │
│ 8 crioviales · 6 activos    │
│ [Ver en criobanco →]        │
└─────────────────────────────┘
```

### 3.6 — Crear `src/components/arbol/nodos/NodoColapso.jsx`

Nodo especial para hijos colapsados:
```
┌─────────────────────────────┐
│ [+N más →]                  │
└─────────────────────────────┘
```
Al tocar expande los hijos ocultos. Al expandir muestra "[colapsar ↑]".

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- Cada componente renderiza sin errores con datos de prueba hardcodeados
- NINGÚN componente renderiza una imagen a tamaño completo
- El carrusel de fotos usa lazy load

---

## BLOQUE 4 — Layout y página principal del árbol

### Objetivo
Ensamblar los nodos en React Flow con layout automático y crear la página principal.

### 4.1 — Instalar dependencia de layout (si no existe)

```bash
npm install @dagrejs/dagre
```

Dagre calcula automáticamente las posiciones de los nodos en un árbol dirigido.

### 4.2 — Crear `src/utils/layoutArbol.js`

```javascript
import dagre from '@dagrejs/dagre';

const NODE_WIDTH = 220;
const NODE_HEIGHT_COLLAPSED = 80;
const NODE_HEIGHT_EXPANDED = 200;

/**
 * Calcula posiciones de nodos usando Dagre
 * direction: 'TB' (top-bottom, mobile) | 'LR' (left-right, desktop)
 */
export function calcularLayout(nodos, aristas, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  nodos.forEach(nodo => {
    dagreGraph.setNode(nodo.id, {
      width: NODE_WIDTH,
      height: nodo.data?.esFoco ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED,
    });
  });

  aristas.forEach(arista => {
    dagreGraph.setEdge(arista.source, arista.target);
  });

  dagre.layout(dagreGraph);

  return nodos.map(nodo => {
    const nodeWithPosition = dagreGraph.node(nodo.id);
    return {
      ...nodo,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT_COLLAPSED / 2,
      },
    };
  });
}
```

### 4.3 — Crear `src/pages/ArbolGenealogico.jsx`

```jsx
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Importar nodos custom
import NodoBatch from '../components/arbol/nodos/NodoBatch';
import NodoEjemplar from '../components/arbol/nodos/NodoEjemplar';
import NodoEsporoma from '../components/arbol/nodos/NodoEsporoma';
import NodoCosecha from '../components/arbol/nodos/NodoCosecha';
import NodoCrioResumen from '../components/arbol/nodos/NodoCrioResumen';
import NodoColapso from '../components/arbol/nodos/NodoColapso';

import { construirArbolDesdeBatch, construirArbolDesdeEjemplar } from '../utils/construirArbolGenealogico';
import { calcularLayout } from '../utils/layoutArbol';

const nodeTypes = {
  batchNode: NodoBatch,
  ejemplarNode: NodoEjemplar,
  esporomaNode: NodoEsporoma,
  cosechaNode: NodoCosecha,
  crioResumenNode: NodoCrioResumen,
  colapsoNode: NodoColapso,
};

export default function ArbolGenealogico() {
  const { id, tipo } = useParams(); // tipo: 'batch' | 'ejemplar'
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [panelDetalle, setPanelDetalle] = useState(null);

  // Detectar mobile
  const esMobile = window.innerWidth < 768;
  const direction = esMobile ? 'TB' : 'LR';

  useEffect(() => {
    cargarArbol();
  }, [id, tipo]);

  async function cargarArbol() {
    try {
      setCargando(true);
      const { nodos, aristas } = tipo === 'ejemplar'
        ? await construirArbolDesdeEjemplar(id)
        : await construirArbolDesdeBatch(id);

      const nodosConLayout = calcularLayout(nodos, aristas, direction);
      setNodes(nodosConLayout);
      setEdges(aristas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  // Recentrado dinámico — al tocar ícono 🎯 en un nodo
  async function recentrarEn(nuevoId, nuevoTipo) {
    const { nodos, aristas } = nuevoTipo === 'ejemplar'
      ? await construirArbolDesdeEjemplar(nuevoId)
      : await construirArbolDesdeBatch(nuevoId);

    const nodosConLayout = calcularLayout(nodos, aristas, direction);
    setNodes(nodosConLayout);
    setEdges(aristas);
  }

  if (cargando) return <div>Cargando árbol...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
      {/* Árbol React Flow */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes.map(n => ({
            ...n,
            data: {
              ...n.data,
              onRecentrar: recentrarEn,
              onVerDetalle: (nodoData) => setPanelDetalle(nodoData),
            }
          }))}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
        >
          <Background />
          <Controls />
          {!esMobile && <MiniMap />}
        </ReactFlow>
      </div>

      {/* Panel lateral de detalle — solo desktop */}
      {!esMobile && panelDetalle && (
        <PanelDetalleArbol
          datos={panelDetalle}
          onCerrar={() => setPanelDetalle(null)}
        />
      )}

      {/* Panel de detalle mobile — ocupa pantalla completa */}
      {esMobile && panelDetalle && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'white', overflowY: 'auto'
        }}>
          <PanelDetalleArbol
            datos={panelDetalle}
            onCerrar={() => setPanelDetalle(null)}
          />
        </div>
      )}
    </div>
  );
}
```

### 4.4 — Agregar rutas

```jsx
<Route path="/arbol/batch/:id" element={<ArbolGenealogico tipo="batch" />} />
<Route path="/arbol/ejemplar/:id" element={<ArbolGenealogico tipo="ejemplar" />} />
```

### 4.5 — Agregar botón en detalle de batch

En la página de detalle de batch existente, agregar botón:
```jsx
<button onClick={() => navigate(`/arbol/batch/${batchId}`)}>
  🌳 Ver árbol genealógico
</button>
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El árbol carga con datos reales desde Firestore
- Los nodos no se superponen — Dagre calcula el layout correctamente
- En mobile el árbol es vertical, en desktop horizontal
- El recentrado dinámico funciona al tocar 🎯

---

## BLOQUE 5 — Panel de detalle lateral

### Objetivo
Crear el panel que se abre al tocar "Ver contexto completo" en un nodo.

### 5.1 — Crear `src/components/arbol/PanelDetalleArbol.jsx`

El panel muestra información completa según el tipo de nodo.

**Para nodo batch:**
```
Header:
  ID + badge estado
  Botón cerrar [×]

Sección — Este batch:
  Tipo contenedor · Medio · Sala
  Pasaje número N
  Fecha inoculación
  Operador
  Temperatura / Humedad (si existe en mantenimiento)
  Atributos experimentales (si existen)
  Experimento asociado (si existe)

Sección — Fotos:
  Carrusel horizontal de todas las fotos
  Fecha de cada foto como caption
  → permite ver el desarrollo del cultivo

Sección — Acciones:
  [Agregar observación / Auditoría]
  [Reimprimir etiqueta ZPL]
  [Cambiar estado]
  [Ver detalle completo →] (link a la página de detalle)
```

**Para nodo ejemplar:**
```
Header:
  ID + tipo material + badge estado

Sección — Identidad genética:
  Género, especie, cepa
  Ploidía, tipo micelio, MAT
  Procedencia

Sección — Resumen de batches:
  N en placa · N fructificando · N cosechados
  N criopreservados → link al criobanco

Sección — Origen:
  Link al esporoma (si existe)
  Link a hibridación (si aplica)

[Ver ejemplar completo →]
```

**Para nodo esporoma:**
```
Header: ID + origen

Fotos del esporoma (carrusel)
Fecha recolección · Lugar
Responsable

[Ver esporoma completo →]
```

**Para nodo cosecha:**
```
Fecha · Oleada número N
Peso fresco: X g
EB oleada: X%
EB acumulada: X%

[Ver cosecha completa →]
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El panel se abre y cierra correctamente
- El carrusel de fotos carga lazy
- Los links de navegación funcionan
- En mobile el panel ocupa pantalla completa y tiene botón de volver

---

## BLOQUE 6 — Colapso de hijos múltiples

### Objetivo
Implementar la lógica de colapso automático cuando un nodo tiene más de 3 hijos.

### 6.1 — Modificar `construirArbolGenealogico.js`

Agregar función de colapso después de construir el árbol:

```javascript
/**
 * Aplica colapso automático a ramas con más de 3 hijos
 * Reemplaza los hijos excedentes por un nodo "[+N más]"
 */
export function aplicarColapsoAutomatico(nodos, aristas, maxHijosVisibles = 3) {
  // Contar hijos por nodo
  const hijosPorNodo = {};
  aristas.forEach(arista => {
    if (!hijosPorNodo[arista.source]) hijosPorNodo[arista.source] = [];
    hijosPorNodo[arista.source].push(arista.target);
  });

  const nodosOcultos = new Set();
  const aristasExtra = [];
  const nodosColapso = [];

  Object.entries(hijosPorNodo).forEach(([padreId, hijosIds]) => {
    if (hijosIds.length > maxHijosVisibles) {
      const hijosExcedentes = hijosIds.slice(maxHijosVisibles);
      const nodoColapsoId = `colapso-${padreId}`;

      // Ocultar hijos excedentes
      hijosExcedentes.forEach(id => nodosOcultos.add(id));

      // Crear nodo de colapso
      nodosColapso.push({
        id: nodoColapsoId,
        type: 'colapsoNode',
        data: {
          tipo: 'colapso',
          cantidad: hijosExcedentes.length,
          hijosOcultos: hijosExcedentes,
          padreId,
        },
        position: { x: 0, y: 0 },
      });

      aristasExtra.push({
        id: `${padreId}-${nodoColapsoId}`,
        source: padreId,
        target: nodoColapsoId,
        type: 'smoothstep',
        style: { stroke: '#9E9E9E', strokeDasharray: '5,5' },
      });
    }
  });

  const nodosFiltrados = nodos.filter(n => !nodosOcultos.has(n.id));
  const aristasFiltradas = aristas.filter(
    a => !nodosOcultos.has(a.target) && !nodosOcultos.has(a.source)
  );

  return {
    nodos: [...nodosFiltrados, ...nodosColapso],
    aristas: [...aristasFiltradas, ...aristasExtra],
    nodosOcultos,
  };
}
```

### 6.2 — Expandir nodo de colapso al tocar

En `NodoColapso.jsx`, al tocar el nodo:
- Emitir evento al componente padre con los `hijosOcultos`
- El padre agrega esos nodos al árbol y recalcula el layout
- El nodo de colapso se reemplaza por botón "[colapsar ↑]"

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- Con un ejemplar que tiene más de 3 batches, los excedentes se colapsan
- Al tocar el nodo de colapso se expanden correctamente
- Al colapsar vuelven a ocultarse

---

## RESUMEN DE ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Acción | Bloque |
|---|---|---|
| Página árbol existente | Vaciar — reemplazar con placeholder | 1 |
| `src/utils/construirArbolGenealogico.js` | Reescribir completo | 2 |
| `src/components/arbol/nodos/NodoBatch.jsx` | Crear nuevo | 3 |
| `src/components/arbol/nodos/NodoEjemplar.jsx` | Crear nuevo | 3 |
| `src/components/arbol/nodos/NodoEsporoma.jsx` | Crear nuevo | 3 |
| `src/components/arbol/nodos/NodoCosecha.jsx` | Crear nuevo | 3 |
| `src/components/arbol/nodos/NodoCrioResumen.jsx` | Crear nuevo | 3 |
| `src/components/arbol/nodos/NodoColapso.jsx` | Crear nuevo | 3 |
| `src/utils/layoutArbol.js` | Crear nuevo | 4 |
| `src/pages/ArbolGenealogico.jsx` | Reescribir completo | 4 |
| `src/components/arbol/PanelDetalleArbol.jsx` | Crear nuevo | 5 |
| Router | Modificar — agregar rutas /arbol/batch y /arbol/ejemplar | 4 |
| Página detalle de batch | Modificar — agregar botón "Ver árbol" | 4 |

---

## BUGS ESPECÍFICOS QUE ESTE PROMPT RESUELVE

| Bug anterior | Solución implementada |
|---|---|
| Fotos gigantes dentro de nodos | Fotos solo en panel lateral y carrusel — NUNCA en el nodo React Flow |
| Nodos superpuestos | Layout automático con Dagre |
| Texto cortado | Nodos con ancho fijo y texto truncado con ellipsis |
| Conectores sin criterio | Colores semánticos por tipo de relación |
| N/A en Medio y Sala | getBatch() resuelve medio_prep.nombre y sala_destino.nombre |

---

*Prompt generado por Claude · FungiTrack Handoff v5 · 28/06/2026*
*Ejecutar con Antigravity bloque a bloque — confirmar build entre bloques*
