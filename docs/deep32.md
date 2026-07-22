# Prompt — Módulo de Diseño Experimental
## FungiTrack · Para ejecutar con Antigravity · Bloque a bloque

---

> **ANTES DE EMPEZAR — REGLAS OBLIGATORIAS**
> 1. Leer cada archivo completo antes de modificarlo
> 2. Un bloque a la vez — `npm run build` y confirmar entre bloques
> 3. Cambios aditivos únicamente — no eliminar lógica existente
> 4. Defensive programming: `campo?.subcampo ?? fallback` siempre
> 5. Mostrar plan antes de tocar código y esperar confirmación
> 6. Si el writeBatch falla: toast de error, no resetear el formulario
> 7. IDs: leer `src/utils/idGenerator.js` antes de agregar cualquier generador nuevo

---

## BLOQUE 1 — Generador de IDs para experimentos + modificaciones a batches

### Objetivo
Agregar el generador de IDs semánticos para experimentos y extender el schema de batches con los campos necesarios para el módulo experimental. Sin tocar lógica existente.

### 1.1 — Leer primero
```
src/utils/idGenerator.js   ← leer completo antes de modificar
```

### 1.2 — Agregar en `src/utils/idGenerator.js`

Agregar al final del archivo, sin modificar las funciones existentes:

```javascript
/**
 * Genera ID semántico para experimentos
 * Formato: EXP-GENESP-YYMMDD-NNN
 * Ejemplo: EXP-CORMI-260628-001
 */
export async function generarIdExperimento(db, genero, especie) {
  const gen = genero.substring(0, 3).toUpperCase();
  const esp = especie.substring(0, 3).toUpperCase();
  const prefijo = `EXP-${gen}${esp}`;
  const fecha = new Date();
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const fechaStr = `${yy}${mm}${dd}`;
  const counterKey = `${prefijo}-${fechaStr}`;

  const counterRef = doc(db, 'metadata', 'counters');
  let nuevoNumero;

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const data = counterDoc.exists() ? counterDoc.data() : {};
    nuevoNumero = (data[counterKey] ?? 0) + 1;
    transaction.set(counterRef, { [counterKey]: nuevoNumero }, { merge: true });
  });

  const nnn = String(nuevoNumero).padStart(3, '0');
  return `${prefijo}-${fechaStr}-${nnn}`;
}
```

### 1.3 — Modificar `src/` — schema de batches

Buscar en el proyecto dónde se crean documentos de la colección `batches` (probablemente en formularios de inoculación). En cada punto de creación, agregar los siguientes campos con valor por defecto, **sin alterar ningún campo existente**:

```javascript
// Campos a agregar al crear un batch — valores por defecto
experimento_id: null,
tratamiento_id: null,
atributos_experimentales: {},
// Agregar "Planificado" como primer estado posible
// El campo status existente no cambia — solo se suma este valor al enum
```

### 1.4 — Agregar "Planificado" al enum de status de batches

Buscar en el proyecto todos los lugares donde se filtra o muestra el `status` de batches (selects, badges, filtros). Agregar `"Planificado"` como primera opción **antes de "Inoculado"**, sin eliminar ningún valor existente.

Buscar específicamente:
- Componentes de selección de estado de batch
- Badges de color por estado
- Filtros en listas de batches

Para el badge de color, usar un color neutro/gris para "Planificado" que lo diferencie visualmente de "Inoculado".

### 1.5 — Verificar filtros en selectores de origen de inoculación

Buscar todos los selectores/dropdowns donde el usuario elige un batch como origen
de una inoculación (formularios de repique, subcultivo, etc.). Verificar que cada
uno filtra batches con `status !== 'Planificado'`.

Un batch planificado no tiene micelio todavía — no puede ser origen de nada.

Si el filtro no existe, agregarlo explícitamente:

```javascript
// En cada query que carga batches para selector de origen
const batchesDisponibles = batches.filter(b => b.status !== 'Planificado');
```

Verificar en:
- Formulario Placa → Placa
- Formulario Placa → Líquido
- Formulario Líquido → Líquido
- Formulario Grano → Grano (cuando se implemente)
- Formulario Grano → Sustrato definitivo (cuando se implemente)
- Cualquier otro selector de batch origen en el sistema

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El generador de IDs de experimentos no rompe los generadores existentes
- Los batches existentes en Firestore NO se modifican (solo se agrega lógica nueva)
- Los selectores de origen NO muestran batches con status "Planificado"

---

## BLOQUE 2 — Colección `experimentos` + servicio Firestore

### Objetivo
Crear el servicio de acceso a datos para experimentos. Sin UI todavía.

### 2.1 — Crear `src/services/experimentoService.js`

```javascript
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { generarIdExperimento } from '../utils/idGenerator';

/**
 * Crear un experimento nuevo con sus tratamientos
 * Los batches se crean en el Bloque 4
 */
export async function crearExperimento(datos) {
  const id = await generarIdExperimento(db, datos.genero, datos.especie);
  const experimento = {
    id,
    nombre: datos.nombre,
    genero: datos.genero,
    especie: datos.especie,
    hipotesis: datos.hipotesis ?? '',
    objetivo: datos.objetivo ?? '',
    estado: 'Planificado',
    fecha_creacion: serverTimestamp(),
    fecha_inicio: datos.fecha_inicio ?? null,
    fecha_fin_estimada: datos.fecha_fin_estimada ?? null,
    responsable: datos.responsable,
    factores: datos.factores ?? [],
    variables_respuesta: datos.variables_respuesta ?? [],
    tratamientos: datos.tratamientos ?? [],
    notas: datos.notas ?? '',
  };

  const ref = doc(db, 'experimentos', id);
  await ref.set ? ref.set(experimento) : addDoc(collection(db, 'experimentos'), experimento);
  // Usar setDoc con ID semántico
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'experimentos', id), experimento);
  return id;
}

/**
 * Obtener todos los experimentos ordenados por fecha
 */
export async function getExperimentos() {
  const q = query(
    collection(db, 'experimentos'),
    orderBy('fecha_creacion', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

/**
 * Obtener un experimento por ID
 */
export async function getExperimento(id) {
  const snap = await getDoc(doc(db, 'experimentos', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

/**
 * Actualizar estado del experimento
 */
export async function actualizarEstadoExperimento(id, nuevoEstado) {
  await updateDoc(doc(db, 'experimentos', id), {
    estado: nuevoEstado,
    fecha_actualizacion: serverTimestamp()
  });
}

/**
 * Actualizar tratamientos (agregar batch_ids al adoptar batches existentes)
 */
export async function actualizarTratamientos(id, tratamientos) {
  await updateDoc(doc(db, 'experimentos', id), {
    tratamientos,
    fecha_actualizacion: serverTimestamp()
  });
}

/**
 * Obtener batches de un experimento
 */
export async function getBatchesDeExperimento(experimentoId) {
  const q = query(
    collection(db, 'batches'),
    where('experimento_id', '==', experimentoId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}
```

### 2.2 — Schema de referencia — colección `experimentos`

Documento completo para referencia. No crear en código — lo crea el servicio:

```json
{
  "id": "EXP-CORMI-260628-001",
  "nombre": "Efecto del medio en colonización He3",
  "genero": "Cordyceps",
  "especie": "militaris",
  "hipotesis": "MEA produce mayor velocidad de colonización que PDA",
  "objetivo": "Comparar 3 medios × 2 cepas × 2 sistemas de intercambio gaseoso",
  "estado": "Planificado | En curso | Finalizado | Cancelado",
  "fecha_creacion": "timestamp",
  "fecha_inicio": "2026-06-28",
  "fecha_fin_estimada": "2026-08-01",
  "responsable": "Maxi",
  "factores": [
    {
      "id": "f1",
      "nombre": "Medio de cultivo",
      "tipo": "medio_prep",
      "niveles": [
        { "label": "MEA", "valor": "medprep-id-mea" },
        { "label": "PDA", "valor": "medprep-id-pda" }
      ]
    },
    {
      "id": "f2",
      "nombre": "Cepa",
      "tipo": "ejemplar",
      "niveles": [
        { "label": "He3", "valor": "EJE-CORMI-He3-..." },
        { "label": "He5", "valor": "EJE-CORMI-He5-..." }
      ]
    },
    {
      "id": "f3",
      "nombre": "Sistema de intercambio gaseoso",
      "tipo": "libre",
      "niveles": [
        { "label": "Guata", "valor": "Guata" },
        { "label": "Cinta 3M", "valor": "Cinta 3M" }
      ]
    }
  ],
  "variables_respuesta": [
    { "id": "vr1", "nombre": "Tiempo de colonización", "unidad": "días" },
    { "id": "vr2", "nombre": "Eficiencia Biológica", "unidad": "%" }
  ],
  "tratamientos": [
    {
      "id": "TRT-001",
      "label": "MEA · He3 · Guata",
      "niveles": {
        "f1": { "label": "MEA", "valor": "medprep-id-mea" },
        "f2": { "label": "He3", "valor": "EJE-CORMI-He3-..." },
        "f3": { "label": "Guata", "valor": "Guata" }
      },
      "n_replicas_planificadas": 3,
      "batch_ids": []
    }
  ],
  "notas": ""
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El servicio importa correctamente desde `../firebase`
- No se crea ningún documento en Firestore todavía

---

## BLOQUE 3 — Wizard de creación — Pasos 1 y 2 (Metadata + Factores)

### Objetivo
Crear la página del wizard con los primeros dos pasos. Sin lógica de generación de tratamientos todavía.

### 3.1 — Crear `src/pages/ExperimentoNuevoPage.jsx`

La página es un wizard de 4 pasos con navegación por steps. Usar el mismo patrón de wizard que existe en el registro masivo de aislamientos como referencia visual.

**Paso 1 — Metadata del experimento:**
- `nombre` — texto libre (requerido)
- `genero` / `especie` — igual que en otros formularios del sistema (buscar cómo se implementa en esporomas o ejemplares para reusar el mismo selector)
- `hipotesis` — textarea (opcional)
- `objetivo` — textarea (opcional)
- `fecha_inicio` — date picker
- `fecha_fin_estimada` — date picker
- `responsable` — texto, pre-rellenado con usuario Auth actual
- `notas` — textarea (opcional)

**Paso 2 — Definir factores y niveles:**

Interfaz dinámica:
- Botón "Agregar factor"
- Por cada factor:
  - `nombre` — texto libre (ej: "Medio de cultivo")
  - `tipo` — select: `medio_prep | ejemplar | destino | libre`
  - Sección de niveles:
    - Si `tipo === 'medio_prep'`: mostrar selector que consulta la colección `mediospreparados` de Firestore
    - Si `tipo === 'ejemplar'`: mostrar selector que consulta la colección `ejemplares` de Firestore (filtrar por especie seleccionada en Paso 1)
    - Si `tipo === 'destino'`: mostrar selector que consulta la colección de destinos/salas
    - Si `tipo === 'libre'`: campo de texto para ingresar cada nivel manualmente
  - Botón "Agregar nivel" por factor
  - Cada nivel muestra su `label` y puede eliminarse
  - El factor completo puede eliminarse con botón de eliminar
- Mínimo 1 factor con mínimo 2 niveles para poder avanzar al Paso 3

**Navegación:**
- Botones "Anterior" / "Siguiente" entre pasos
- Indicador visual de paso actual (1/4, 2/4, etc.)
- El botón "Siguiente" del Paso 2 está deshabilitado si no hay al menos 1 factor con 2+ niveles

### 3.2 — Agregar ruta en el router

Buscar el archivo de rutas (probablemente `src/App.jsx` o `src/router.jsx`) y agregar:

```jsx
<Route path="/experimentos/nuevo" element={<ExperimentoNuevoPage />} />
```

Sin eliminar ninguna ruta existente.

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La ruta `/experimentos/nuevo` carga sin errores
- Los selectores de medio_prep y ejemplar consultan Firestore correctamente
- El botón "Siguiente" en Paso 2 valida correctamente

---

## BLOQUE 4 — Wizard — Paso 3 (Generación de tratamientos)

### Objetivo
Implementar la generación automática del producto cartesiano de factores y la tabla editable de tratamientos.

### 4.1 — Lógica de producto cartesiano

Agregar esta función en `ExperimentoNuevoPage.jsx` (o en un archivo de utils si el proyecto tiene ese patrón):

```javascript
/**
 * Genera el producto cartesiano de los niveles de todos los factores
 * Retorna array de tratamientos con ID correlativo
 */
function generarTratamientos(factores) {
  if (!factores || factores.length === 0) return [];

  // Obtener arrays de niveles por factor
  const nivelesPerFactor = factores.map(f => f.niveles ?? []);

  // Producto cartesiano recursivo
  const cartesiano = (arrays) => {
    if (arrays.length === 0) return [[]];
    const [first, ...rest] = arrays;
    const restCartesiano = cartesiano(rest);
    return first.flatMap(item =>
      restCartesiano.map(combo => [item, ...combo])
    );
  };

  const combinaciones = cartesiano(nivelesPerFactor);

  return combinaciones.map((combo, idx) => {
    const niveles = {};
    const labelParts = [];

    factores.forEach((factor, i) => {
      niveles[factor.id] = combo[i];
      labelParts.push(combo[i]?.label ?? '');
    });

    return {
      id: `TRT-${String(idx + 1).padStart(3, '0')}`,
      label: labelParts.join(' · '),
      niveles,
      n_replicas_planificadas: 3, // default editable
      batch_ids: [],
      _incluir: true // flag para que el usuario pueda excluir filas
    };
  });
}
```

### 4.2 — UI del Paso 3

**Al entrar al Paso 3:**
- Ejecutar `generarTratamientos(factores)` automáticamente
- Mostrar el resultado como tabla editable con columnas:
  - Una columna por factor (mostrando el label del nivel)
  - "Réplicas" — número editable (input type number, min 1)
  - "Incluir" — checkbox (permite excluir tratamientos del diseño)
  - Botón de eliminar fila

**Controles adicionales:**
- Botón "Regenerar" — vuelve a hacer el cartesiano (útil si el usuario volvió al Paso 2 a modificar factores)
- Texto informativo: "X tratamientos × Y réplicas promedio = Z unidades experimentales totales"
- Botón "Agregar tratamiento custom" — abre un modal donde el usuario selecciona manualmente un nivel por factor y define las réplicas (para casos de factorial incompleto)

**Validación para avanzar:**
- Al menos 1 tratamiento con `_incluir: true` y `n_replicas_planificadas >= 1`

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El cartesiano se genera correctamente con 2 y 3 factores
- Editar réplicas en la tabla actualiza el estado local
- Excluir un tratamiento lo marca visualmente (tachado o grisado) pero no lo elimina del array hasta confirmar

---

## BLOQUE 5 — Wizard — Paso 4 (Confirmación y creación de batches)

### Objetivo
Implementar el paso de confirmación con las dos modalidades: crear batches planificados o adoptar batches existentes.

### 5.1 — UI del Paso 4

**Sección de resumen:**
- Mostrar nombre del experimento, especie, responsable
- Tabla resumen de tratamientos incluidos con sus réplicas
- Total de batches que se van a crear

**Selector de modalidad:**
```
¿Cómo querés asociar los batches?

( ) Crear batches planificados ahora
    → El sistema crea N batches en estado "Planificado" por cada tratamiento

( ) Adoptar batches existentes
    → Asociar batches que ya están en el sistema a este experimento

( ) Crear algunos y adoptar otros
    → Combinación de ambas modalidades por tratamiento
```

**Si modalidad = "Crear batches planificados":**
- Para cada tratamiento, mostrar campos adicionales necesarios para crear el batch:
  - `tipoContenedor` — select (placa_petri, frasco, bolsa, pote, etc. — buscar enum existente en el sistema)
  - `destinoId` — selector de sala (si no está ya como factor)
  - `medioPrepId` — selector de medio preparado (si no está ya como factor)
- Estos campos se pre-rellenan automáticamente si el factor correspondiente ya está definido

**Si modalidad = "Adoptar batches existentes":**
- Por cada tratamiento, mostrar un buscador/selector de batches existentes
- Filtrar batches por especie del experimento
- Al seleccionar un batch, asignarlo a ese tratamiento
- Un batch no puede estar en dos tratamientos simultáneamente

### 5.2 — Lógica de creación (writeBatch atómico)

Al confirmar con modalidad "Crear batches planificados":

```javascript
async function crearExperimentoConBatches(experimentoData, tratamientos, datosBatches) {
  const batch = writeBatch(db);
  const errores = [];

  try {
    // 1. Crear documento del experimento
    const expId = await generarIdExperimento(db, experimentoData.genero, experimentoData.especie);
    const expRef = doc(db, 'experimentos', expId);

    // 2. Por cada tratamiento, crear N batches planificados
    const tratamientosConBatchIds = await Promise.all(
      tratamientos
        .filter(t => t._incluir)
        .map(async (tratamiento) => {
          const batchIds = [];

          for (let i = 0; i < tratamiento.n_replicas_planificadas; i++) {
            // Usar generarIdBatch existente — leer idGenerator.js para la función correcta
            const batchId = await generarIdBatch(/* params según idGenerator.js */);
            const batchRef = doc(db, 'batches', batchId);

            // Extraer valores de factores tipados
            const medioId = tratamiento.niveles[factorMedioId]?.valor ?? datosBatches.medioPrepId;
            const ejemplarId = tratamiento.niveles[factorEjemplarId]?.valor ?? datosBatches.ejemplarId;
            const salaId = tratamiento.niveles[factorDestinoId]?.valor ?? datosBatches.destinoId;

            // Construir atributos_experimentales con factores libres
            const atributosExperimentales = {};
            tratamiento.niveles && Object.entries(tratamiento.niveles).forEach(([factorId, nivel]) => {
              const factor = experimentoData.factores.find(f => f.id === factorId);
              if (factor?.tipo === 'libre') {
                atributosExperimentales[factor.nombre] = nivel.valor;
              }
            });

            batch.set(batchRef, {
              id: batchId,
              ejemplarId: ejemplarId,
              medioPrepId: medioId,
              destinoId: salaId,
              tipoContenedor: datosBatches.tipoContenedor,
              status: 'Planificado',
              experimento_id: expId,
              tratamiento_id: tratamiento.id,
              atributos_experimentales: atributosExperimentales,
              operador: experimentoData.responsable,
              fechaInoculacion: null,
              numero_transferencia: 1,
              es_aislamiento_primario: false,
            });

            batchIds.push(batchId);
          }

          return { ...tratamiento, batch_ids: batchIds };
        })
    );

    // 3. Actualizar experimento con batch_ids resueltos
    batch.set(expRef, {
      ...experimentoData,
      id: expId,
      tratamientos: tratamientosConBatchIds,
      estado: 'Planificado',
    });

    await batch.commit();
    return { ok: true, expId };

  } catch (error) {
    console.error('Error creando experimento:', error);
    // NO resetear el formulario — mostrar toast de error
    return { ok: false, error: error.message };
  }
}
```

**IMPORTANTE:** Antes de implementar `generarIdBatch`, leer `src/utils/idGenerator.js` para identificar la función correcta según el tipo de batch. No crear una nueva función si ya existe.

### 5.2b — Regla explícita: factor tipo `destino` asigna sala al batch

Si el experimento tiene un factor de tipo `destino`, el `destinoId` de cada batch
NO viene de un campo separado del formulario — viene del nivel del tratamiento.

```javascript
// Al construir cada batch, resolver destinoId así:
const factorDestino = experimentoData.factores.find(f => f.tipo === 'destino');
const destinoId = factorDestino
  ? tratamiento.niveles[factorDestino.id]?.valor  // viene del tratamiento
  : datosBatches.destinoId;                        // viene del formulario general
```

Lo mismo aplica para `medioPrepId` si hay factor tipo `medio_prep` y para
`ejemplarId` si hay factor tipo `ejemplar`. El tratamiento siempre tiene
precedencia sobre el campo general del formulario.

### 5.2c — Validación obligatoria antes del `batch.commit()`

Antes de llamar a `batch.commit()`, validar que todos los batches a crear
tienen los campos mínimos requeridos. Si alguna validación falla: mostrar
toast de error y NO ejecutar el commit.

```javascript
function validarBatchesACrear(batchesData, factores) {
  const errores = [];
  const factorEjemplar = factores.find(f => f.tipo === 'ejemplar');
  const factorMedio = factores.find(f => f.tipo === 'medio_prep');

  batchesData.forEach((b, idx) => {
    // Si hay factor ejemplar, ejemplarId es obligatorio
    if (factorEjemplar && !b.ejemplarId) {
      errores.push(`Batch ${idx + 1}: falta ejemplarId (factor "${factorEjemplar.nombre}")`);
    }
    // medioPrepId siempre obligatorio
    if (!b.medioPrepId) {
      errores.push(`Batch ${idx + 1}: falta medioPrepId`);
    }
    // destinoId siempre obligatorio
    if (!b.destinoId) {
      errores.push(`Batch ${idx + 1}: falta destinoId`);
    }
  });

  return errores;
}

// Uso antes del commit:
const erroresValidacion = validarBatchesACrear(batchesACrear, experimentoData.factores);
if (erroresValidacion.length > 0) {
  toast.error(`No se puede crear el experimento:\n${erroresValidacion.join('\n')}`);
  return { ok: false, error: 'Validación fallida' };
}
// Recién aquí ejecutar el writeBatch
await batch.commit();
```

### 5.3 — Post-creación

Al éxito del `batch.commit()`:
- Toast de éxito con el ID del experimento creado
- Redirigir a la página de detalle del experimento: `/experimentos/:id`

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El writeBatch crea el experimento y los batches atómicamente
- Los batches creados aparecen en la lista de batches existente con estado "Planificado"
- Los campos `experimento_id` y `tratamiento_id` están presentes en cada batch creado
- Los `atributos_experimentales` se guardan correctamente para factores libres

---

## BLOQUE 6 — Página de detalle y seguimiento del experimento

### Objetivo
Crear la vista de seguimiento donde se visualizan los batches agrupados por tratamiento y se puede cambiar su estado.

### 6.1 — Crear `src/pages/ExperimentoDetallePage.jsx`

**Sección superior — Header del experimento:**
- Nombre, especie, estado (badge de color)
- Hipótesis y objetivo
- Fechas y responsable
- Botón "Editar" (solo metadata — no factores ni tratamientos)
- Selector de estado del experimento: `Planificado → En curso → Finalizado | Cancelado`

**Sección principal — Tratamientos y batches:**

Para cada tratamiento mostrar:
- Header del tratamiento con su label (ej: "MEA · He3 · Guata")
- Detalle de niveles por factor
- Lista de batches asignados con:
  - ID del batch
  - Estado actual (badge de color)
  - Fecha de inoculación (si existe)
  - Botón de cambio de estado individual

**Cambio de estado masivo:**
- Checkbox de selección por batch
- Botón "Marcar seleccionados como..." con dropdown de estados
- Botón por tratamiento "Marcar todos como Inoculado" (acción más común)

**Lógica de cambio de estado masivo:**

```javascript
async function cambiarEstadoBatches(batchIds, nuevoEstado) {
  const batch = writeBatch(db);
  batchIds.forEach(id => {
    batch.update(doc(db, 'batches', id), {
      status: nuevoEstado,
      // Si pasa a Inoculado, registrar fecha
      ...(nuevoEstado === 'Inoculado' && { fechaInoculacion: new Date().toISOString().split('T')[0] })
    });
  });
  await batch.commit();
}
```

**Sección inferior — Variables respuesta:**
- Lista de variables respuesta definidas en el experimento
- Para cada variable: tabla de valores registrados por batch (se puebla desde cosechas u observaciones)
- Esta sección puede quedar vacía en esta versión — se puebla cuando se implementen cosechas

### 6.2 — Adoptar batches existentes desde el detalle

Botón "Adoptar batch existente" por tratamiento:
- Abre modal con buscador de batches (filtrado por especie)
- Al seleccionar: actualiza el batch con `experimento_id` y `tratamiento_id`, y agrega el ID al array `batch_ids` del tratamiento en el experimento
- Usar `updateDoc` + `arrayUnion` de Firestore

```javascript
import { arrayUnion } from 'firebase/firestore';

async function adoptarBatch(experimentoId, tratamientoId, batchId) {
  // 1. Actualizar el batch
  await updateDoc(doc(db, 'batches', batchId), {
    experimento_id: experimentoId,
    tratamiento_id: tratamientoId,
  });

  // 2. Actualizar el array batch_ids del tratamiento en el experimento
  // Nota: como tratamientos es un array de objetos, hay que hacer get + update
  const expSnap = await getDoc(doc(db, 'experimentos', experimentoId));
  const expData = expSnap.data();
  const tratamientosActualizados = expData.tratamientos.map(t =>
    t.id === tratamientoId
      ? { ...t, batch_ids: [...(t.batch_ids ?? []), batchId] }
      : t
  );
  await updateDoc(doc(db, 'experimentos', experimentoId), {
    tratamientos: tratamientosActualizados
  });
}
```

### 6.3 — Agregar ruta

```jsx
<Route path="/experimentos/:id" element={<ExperimentoDetallePage />} />
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La página carga los batches agrupados por tratamiento correctamente
- El cambio de estado masivo actualiza Firestore y refleja el cambio en la UI sin recargar
- Adoptar un batch existente actualiza ambos documentos (batch y experimento)

---

## BLOQUE 7 — Lista de experimentos + navegación

### Objetivo
Crear la vista de lista de experimentos y agregar la entrada al menú de navegación.

### 7.1 — Crear `src/pages/ExperimentosListPage.jsx`

**Filtros:**
- Por estado: `Todos | Planificado | En curso | Finalizado | Cancelado`
- Por especie (texto libre o selector según cómo esté implementado en el resto del sistema)
- Por responsable

**Lista:**
- Card o fila por experimento con:
  - Nombre + especie
  - Badge de estado
  - Fecha de inicio
  - Cantidad de tratamientos / batches totales
  - Responsable
  - Botón "Ver detalle" → `/experimentos/:id`

**Botón principal:**
- "Nuevo experimento" → `/experimentos/nuevo`

### 7.2 — Agregar ruta

```jsx
<Route path="/experimentos" element={<ExperimentosListPage />} />
```

### 7.3 — Agregar al menú de navegación

Buscar el componente de navegación lateral o superior (probablemente `src/components/Navbar.jsx` o similar). Agregar entrada "Experimentos" con ícono apropiado, sin modificar las entradas existentes.

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La navegación desde el menú llega a `/experimentos`
- La lista carga los experimentos existentes
- Los filtros funcionan correctamente
- El botón "Nuevo experimento" navega al wizard

---

## BLOQUE 8 — Integración con cosechas

> **NOTA:** El módulo de cosechas YA está implementado (deep27.md y deep28.md).
> Este bloque se puede ejecutar inmediatamente después del Bloque 7.

### Objetivo
Cuando se registre una cosecha de un batch que tiene `experimento_id`, heredar automáticamente esa referencia y mostrar los datos de cosecha en la sección de variables respuesta del experimento.

### 8.1 — En el formulario de cosechas

Al crear una cosecha, verificar si el batch tiene `experimento_id`. Si existe:
- Copiar `experimento_id` y `tratamiento_id` al documento de cosecha
- El campo ya está en el schema de cosechas: `"experimento_id": null`

### 8.2 — En `ExperimentoDetallePage`

En la sección de variables respuesta, agregar query:

```javascript
const cosechasDeExperimento = query(
  collection(db, 'cosechas'),
  where('experimento_id', '==', experimentoId)
);
```

Cruzar los datos de cosechas con los batch_ids de cada tratamiento para mostrar:
- EB por oleada por tratamiento
- Tiempo hasta primera cosecha por tratamiento
- Comparativa entre tratamientos (tabla simple)

### ✅ Verificar después de implementar
- Las cosechas de batches del experimento aparecen correctamente en el detalle
- Los datos de EB se agrupan por tratamiento

---

## BLOQUE 9 — Análisis estadístico descriptivo por tratamiento

### Objetivo
Agregar una sección de análisis básico en `ExperimentoDetallePage` que muestre
estadísticas descriptivas de las variables respuesta por tratamiento.
Sin ANOVA ni inferencia — solo descriptiva simple.

### 9.1 — Lógica de cálculo

Agregar función en `src/utils/estadisticasExperimento.js`:

```javascript
/**
 * Calcula estadísticas descriptivas de una variable por tratamiento
 * valores: array de números (ej: valores de EB de todas las cosechas del tratamiento)
 */
export function calcularDescriptiva(valores) {
  const n = valores.filter(v => v !== null && v !== undefined).length;
  if (n === 0) return { n: 0, media: null, desvio: null, min: null, max: null };

  const valoresValidos = valores.filter(v => v !== null && v !== undefined);
  const media = valoresValidos.reduce((a, b) => a + b, 0) / n;
  const varianza = valoresValidos.reduce((a, b) => a + Math.pow(b - media, 2), 0) / (n > 1 ? n - 1 : 1);
  const desvio = Math.sqrt(varianza);
  const min = Math.min(...valoresValidos);
  const max = Math.max(...valoresValidos);

  return {
    n,
    media: parseFloat(media.toFixed(2)),
    desvio: parseFloat(desvio.toFixed(2)),
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
  };
}

/**
 * Genera tabla de estadísticas por tratamiento para una variable respuesta
 * tratamientos: array del experimento
 * cosechas: array de cosechas del experimento
 * campoVariable: string — el campo de cosecha a analizar (ej: 'eb_oleada', 'eb_acumulada')
 */
export function tablaEstadisticasPorTratamiento(tratamientos, cosechas, campoVariable) {
  return tratamientos.map(tratamiento => {
    const cosechasTratamiento = cosechas.filter(c =>
      tratamiento.batch_ids?.includes(c.batch_id)
    );
    const valores = cosechasTratamiento
      .map(c => c[campoVariable])
      .filter(v => v !== null && v !== undefined && !isNaN(v));

    return {
      tratamiento_id: tratamiento.id,
      tratamiento_label: tratamiento.label,
      ...calcularDescriptiva(valores),
    };
  });
}
```

### 9.2 — UI en `ExperimentoDetallePage`

Agregar sección "Análisis por tratamiento" debajo de la sección de variables respuesta.
Solo visible cuando el experimento tiene cosechas registradas.

**Para cada variable respuesta del experimento** que tenga datos en cosechas,
mostrar una tabla:

```
Variable: Eficiencia Biológica (%)

| Tratamiento          | N | Media  | Desvío | Mín   | Máx   |
|----------------------|---|--------|--------|-------|-------|
| MEA · He3 · Guata    | 3 | 85.4%  | 4.2    | 80.1% | 89.2% |
| MEA · He3 · Cinta 3M | 3 | 78.2%  | 6.1    | 71.0% | 83.5% |
| PDA · He3 · Guata    | 2 | 91.0%  | 2.8    | 89.0% | 93.0% |
| PDA · He3 · Cinta 3M | 0 | —      | —      | —     | —     |
```

- N = 0 muestra "—" en todas las columnas — no rompe la tabla
- La tabla se actualiza automáticamente cuando se agregan nuevas cosechas
- Botón "Exportar CSV" que descarga la tabla como archivo .csv

### 9.3 — Exportar CSV

```javascript
function exportarCSV(tabla, nombreVariable, nombreExperimento) {
  const headers = ['Tratamiento', 'N', 'Media', 'Desvío estándar', 'Mínimo', 'Máximo'];
  const filas = tabla.map(fila => [
    fila.tratamiento_label,
    fila.n,
    fila.media ?? '',
    fila.desvio ?? '',
    fila.min ?? '',
    fila.max ?? '',
  ]);

  const csvContent = [headers, ...filas]
    .map(fila => fila.join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nombreExperimento}_${nombreVariable}_estadisticas.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La tabla aparece correctamente cuando hay cosechas registradas
- Los tratamientos sin cosechas muestran "—" sin errores
- El CSV se descarga correctamente con los datos de la tabla

---

## RESUMEN DE ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Acción | Bloque |
|---|---|---|
| `src/utils/idGenerator.js` | Modificar — agregar `generarIdExperimento` | 1 |
| Formularios de inoculación existentes | Modificar — agregar campos + filtro `status !== 'Planificado'` | 1 |
| Componentes de badge/select de status de batch | Modificar — agregar "Planificado" | 1 |
| `src/services/experimentoService.js` | Crear nuevo | 2 |
| `src/pages/ExperimentoNuevoPage.jsx` | Crear nuevo | 3, 4, 5 |
| `src/pages/ExperimentoDetallePage.jsx` | Crear nuevo | 6, 8, 9 |
| `src/pages/ExperimentosListPage.jsx` | Crear nuevo | 7 |
| `src/utils/estadisticasExperimento.js` | Crear nuevo | 9 |
| Router (App.jsx o router.jsx) | Modificar — agregar 3 rutas | 3, 6, 7 |
| Componente de navegación | Modificar — agregar entrada "Experimentos" | 7 |

---

*Prompt generado por Claude · FungiTrack Handoff v5 · 28/06/2026*
*Actualizado con 5 mejoras de Deepseek · deep32.md*
*Ejecutar con Antigravity bloque a bloque — confirmar build entre bloques*
