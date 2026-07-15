FungiTrack — Prompt para Antigravity
Módulo: Criobanco
Basado en Claude · FungiTrack Handoff v5 · 28/06/2026
Revisado por DeepSeek · 07/07/2026

ANTES DE EMPEZAR — REGLAS OBLIGATORIAS

Leer cada archivo completo antes de modificarlo

Un bloque a la vez — npm run build y confirmar entre bloques

Cambios aditivos únicamente — no eliminar lógica existente

Defensive programming: campo?.subcampo ?? fallback siempre

Mostrar plan antes de tocar código y esperar confirmación

Si el writeBatch falla: toast de error, no resetear el formulario

IDs: leer src/utils/idGenerator.js antes de agregar cualquier generador nuevo

BLOQUE 1 — Generadores de IDs para criobanco
Objetivo
Agregar los tres generadores de IDs semánticos necesarios para el módulo. Sin UI ni servicios todavía.

1.1 — Leer primero
text
src/utils/idGenerator.js   ← leer completo antes de modificar
1.2 — Agregar en src/utils/idGenerator.js
Agregar al final del archivo, sin modificar funciones existentes:

javascript
/**
 * Genera ID para evento de criopreservación
 * Formato: CRY-GENESP-CEPA-YYMMDD-NNN
 * Ejemplo: CRY-CORMI-He3-260628-001
 */
export async function generarIdEventoCriopreservacion(db, genero, especie, cepa) {
  const gen = genero.substring(0, 3).toUpperCase();
  const esp = especie.substring(0, 3).toUpperCase();
  const cepaParte = cepa ? `-${cepa}` : '';
  const prefijo = `CRY-${gen}${esp}${cepaParte}`;
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

/**
 * Genera ID para criovial individual
 * Formato: CRV-GENESP-CEPA-YYMMDD-NNN-LETRA
 * Ejemplo: CRV-CORMI-He3-260628-001-A
 * La letra se pasa como parámetro (A, B, C...) según índice del criovial en el lote
 */
export async function generarIdCriovial(db, genero, especie, cepa, letra) {
  const gen = genero.substring(0, 3).toUpperCase();
  const esp = especie.substring(0, 3).toUpperCase();
  const cepaParte = cepa ? `-${cepa}` : '';
  const prefijo = `CRV-${gen}${esp}${cepaParte}`;
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
  const letraMayus = (letra ?? 'A').toUpperCase();
  return `${prefijo}-${fechaStr}-${nnn}-${letraMayus}`;
}

/**
 * Genera ID para evento de descongelación
 * Formato: DCG-GENESP-CEPA-YYMMDD-NNN
 * Ejemplo: DCG-CORMI-He3-260628-001
 */
export async function generarIdEventoDescongelacion(db, genero, especie, cepa) {
  const gen = genero.substring(0, 3).toUpperCase();
  const esp = especie.substring(0, 3).toUpperCase();
  const cepaParte = cepa ? `-${cepa}` : '';
  const prefijo = `DCG-${gen}${esp}${cepaParte}`;
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
1.3 — Flag de criopreservación (en creación Y edición de batches)
Buscar en el proyecto todos los puntos donde se crean documentos de la colección batches. Agregar:

javascript
destino_criopreservacion: false,
Buscar también el componente de edición de batch (BatchEditModal.jsx) y agregar un toggle/checkbox:

Label: "Destinado a criopreservación"

Visible siempre (no solo en creación)

Al activarlo, setea destino_criopreservacion: true en el documento

1.4 — Agregar "Planificado" al enum de status de batches
Buscar todos los lugares donde se filtra o muestra el status de batches (selects, badges, filtros). Agregar "Planificado" como primera opción antes de "Inoculado", sin eliminar ningún valor existente.

IMPORTANTE: Los batches con status "Planificado" NO deben aparecer en los selectores de origen de los formularios de inoculación.

✅ Verificar antes de continuar
npm run build sin errores

Los tres generadores no interfieren con los existentes

Los batches existentes en Firestore NO se modifican

BLOQUE 2 — Servicios Firestore para criobanco
Objetivo
Crear el servicio completo de acceso a datos. Sin UI todavía.

2.1 — Crear src/services/criobancService.js
javascript
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  generarIdEventoCriopreservacion,
  generarIdCriovial,
  generarIdEventoDescongelacion
} from '../utils/idGenerator';

// ─── EVENTOS DE CRIOPRESERVACIÓN ───────────────────────────────────────────

export async function crearEventoCriopreservacion(datos) {
  const id = await generarIdEventoCriopreservacion(
    db, datos.genero, datos.especie, datos.cepa
  );
  const evento = {
    id, batch_origen_id: datos.batch_origen_id, ejemplar_id: datos.ejemplar_id,
    genero: datos.genero, especie: datos.especie, cepa: datos.cepa ?? '',
    fecha: datos.fecha, operario: datos.operario,
    protocolo_url: datos.protocolo_url ?? '', notas: datos.notas ?? '',
    fecha_creacion: serverTimestamp(),
  };
  await setDoc(doc(db, 'eventos_criopreservacion', id), evento);
  return id;
}

export async function getEventosCriopreservacion() {
  const q = query(collection(db, 'eventos_criopreservacion'), orderBy('fecha_creacion', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

// ─── CRIOVIALES ────────────────────────────────────────────────────────────

export async function crearCrioviales(eventoId, datosCrioviales, ejemplarData) {
  const batch = writeBatch(db);
  const ids = [];
  for (let i = 0; i < datosCrioviales.length; i++) {
    const datos = datosCrioviales[i];
    const letra = String.fromCharCode(65 + i);
    const id = await generarIdCriovial(db, ejemplarData.genero, ejemplarData.especie, ejemplarData.cepa, letra);
    const criovial = {
      id, evento_criopreservacion_id: eventoId, ejemplar_id: ejemplarData.ejemplar_id,
      genero: ejemplarData.genero, especie: ejemplarData.especie, cepa: ejemplarData.cepa ?? '',
      volumen_ml: datos.volumen_ml, soporte: datos.soporte,
      medio_criopreservacion: datos.medio_criopreservacion ?? '',
      temperatura_almacenamiento: datos.temperatura_almacenamiento,
      ubicacion_actual: {
        modo: datos.ubicacion.modo,
        equipo: datos.ubicacion.equipo,
        contenedor: datos.ubicacion.contenedor ?? '',
        sub_contenedor: datos.ubicacion.sub_contenedor ?? '',
        posicion: datos.ubicacion.posicion ?? '',
      },
      historial_ubicaciones: [], estado: 'Criopreservado',
      fecha_criopreservacion: datos.fecha, archivos: [], notas: datos.notas ?? '',
      fecha_creacion: serverTimestamp(),
    };
    batch.set(doc(db, 'crioviales', id), criovial);
    ids.push(id);
  }
  await batch.commit();
  return ids;
}

export async function getCrioviales(filtros = {}) {
  let q = collection(db, 'crioviales');
  const condiciones = [];
  if (filtros.ejemplar_id) condiciones.push(where('ejemplar_id', '==', filtros.ejemplar_id));
  if (filtros.estado) condiciones.push(where('estado', '==', filtros.estado));
  if (filtros.equipo) condiciones.push(where('ubicacion_actual.equipo', '==', filtros.equipo));
  if (condiciones.length > 0) q = query(q, ...condiciones, orderBy('fecha_creacion', 'desc'));
  else q = query(q, orderBy('fecha_creacion', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export async function getCriovial(id) {
  const snap = await getDoc(doc(db, 'crioviales', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

export async function moverCriovial(id, nuevaUbicacion, motivo, operario) {
  const criovialSnap = await getDoc(doc(db, 'crioviales', id));
  if (!criovialSnap.exists()) throw new Error('Criovial no encontrado');
  const ubicacionAnterior = criovialSnap.data().ubicacion_actual;
  const movimiento = {
    fecha: new Date().toISOString(),
    ubicacion_anterior: ubicacionAnterior,
    ubicacion_nueva: nuevaUbicacion,
    motivo: motivo ?? '', operario,
  };
  await updateDoc(doc(db, 'crioviales', id), {
    ubicacion_actual: nuevaUbicacion,
    historial_ubicaciones: arrayUnion(movimiento),
  });
}

// ─── EVENTOS DE DESCONGELACIÓN ─────────────────────────────────────────────

export async function crearEventoDescongelacion(criovialId, datos) {
  const criovialSnap = await getDoc(doc(db, 'crioviales', criovialId));
  if (!criovialSnap.exists()) throw new Error('Criovial no encontrado');
  const criovial = criovialSnap.data();
  const id = await generarIdEventoDescongelacion(db, criovial.genero, criovial.especie, criovial.cepa);
  const batch = writeBatch(db);
  batch.set(doc(db, 'eventos_descongelacion', id), {
    id, criovial_id: criovialId, ejemplar_id: criovial.ejemplar_id,
    fecha: datos.fecha, operario: datos.operario,
    metodo_viabilidad: datos.metodo_viabilidad ?? '',
    resultado_viabilidad: datos.resultado_viabilidad ?? {},
    archivos_externos: datos.archivos_externos ?? [],
    batch_recuperacion_id: datos.batch_recuperacion_id ?? null,
    uso_parcial: datos.uso_parcial ?? false, notas: datos.notas ?? '',
    fecha_creacion: serverTimestamp(),
  });
  const nuevoEstado = datos.uso_parcial ? 'Parcialmente usado' : 'Agotado';
  batch.update(doc(db, 'crioviales', criovialId), { estado: nuevoEstado });
  await batch.commit();
  return id;
}

export async function getEventosDescongelacion(criovialId) {
  const q = query(collection(db, 'eventos_descongelacion'), where('criovial_id', '==', criovialId), orderBy('fecha_creacion', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}
2.2 — Schema de referencia
json
// eventos_criopreservacion
{ "id": "CRY-CORMI-He3-260628-001", "batch_origen_id": "...", "ejemplar_id": "...", "genero": "Cordyceps", "especie": "militaris", "cepa": "He3", "fecha": "2026-06-28", "operario": "Maxi", "protocolo_url": "", "notas": "" }

// crioviales
{ "id": "CRV-CORMI-He3-260628-001-A", "evento_criopreservacion_id": "...", "ejemplar_id": "...", "genero": "Cordyceps", "especie": "militaris", "cepa": "He3", "volumen_ml": 2, "soporte": "semillas", "medio_criopreservacion": "Glicerol 15%", "temperatura_almacenamiento": "-80°C", "ubicacion_actual": { "modo": "rack | libre", "equipo": "Freezer -80°C", "contenedor": "Torre 1 - Caja 4", "sub_contenedor": "", "posicion": "C2" }, "historial_ubicaciones": [], "estado": "Criopreservado", "fecha_criopreservacion": "2026-06-28", "archivos": [], "notas": "" }

// eventos_descongelacion
{ "id": "DCG-CORMI-He3-260628-001", "criovial_id": "...", "ejemplar_id": "...", "fecha": "2026-07-15", "operario": "Maxi", "metodo_viabilidad": "UFC placa", "resultado_viabilidad": {}, "archivos_externos": [], "batch_recuperacion_id": null, "uso_parcial": false, "notas": "" }
✅ Verificar antes de continuar
npm run build sin errores

El servicio importa correctamente

No se crea ningún documento en Firestore todavía

BLOQUE 3 — Wizard de criopreservación
Objetivo
Crear el wizard que permite crear el evento y los crioviales en bulk, desde un batch O desde un ejemplar directamente.

3.1 — Crear src/pages/CriopreservacionNuevaPage.jsx
La página recibe un batchId o ejemplarId como parámetro de ruta. Al cargar, leer los datos para pre-rellenar campos.

Paso 1 — Datos del evento:

fecha — date picker, default hoy

operario — pre-rellenado con usuario Auth

protocolo_url — input de URL

notas — textarea

Paso 2 — Definir lote de crioviales:

Controles globales (se aplican a todos por defecto):

volumen_ml — select: 2ml | 5ml

soporte — select: semillas | perlita | agar | liquido

medio_criopreservacion — texto libre

temperatura_almacenamiento — select: 4°C | -20°C | -80°C | -196°C (N₂ líquido)

cantidad — número

Botón "Generar crioviales" — crea N filas en la tabla editable.

Paso 3 — Confirmación:

Resumen: N crioviales, distribución por temperatura/equipo

Botón "Confirmar y crear"

3.2 — Agregar rutas
jsx
<Route path="/criobanco/nuevo/batch/:batchId" element={<CriopreservacionNuevaPage />} />
<Route path="/criobanco/nuevo/ejemplar/:ejemplarId" element={<CriopreservacionNuevaPage />} />
Agregar botón "Criopreservar" en detalle de batch (si destino_criopreservacion === true) Y en detalle de ejemplar (siempre visible).

✅ Verificar antes de continuar
npm run build sin errores

El wizard carga desde batch y desde ejemplar

BLOQUE 4 — Lista de crioviales con filtros
Objetivo
Vista principal del criobanco con lista filtrable.

4.1 — Crear src/pages/CriobancoListPage.jsx
Filtros: estado, especie, temperatura, equipo, cepa.
Lista: cards con ID, especie, soporte, temperatura, ubicación, estado, fecha.
Badges: 🟢 Criopreservado, 🟡 Parcialmente usado, 🔴 Agotado.
Botones: "Ver detalle" | "Registrar movimiento" | "Descongelar".
Entrada en menú principal: "Criobanco".

4.2 — Agregar ruta
jsx
<Route path="/criobanco" element={<CriobancoListPage />} />
✅ Verificar antes de continuar
npm run build sin errores

BLOQUE 5 — Mapa visual del criobanco (DOS MODOS)
Objetivo
Vista agrupada por equipo → contenedor. Soporta modo rack (grilla) y modo libre (árbol anidado).

5.1 — Crear src/components/criobanco/MapaCriobanco.jsx
Selector de equipo (tabs o dropdown).

Modo Rack (cuando ubicacion_actual.modo === 'rack'):

El contenedor debe tener un campo dimensiones (filas × columnas) configurable al crearlo.

Renderizar grilla CSS con colores por estado.

Click en celda ocupada → panel lateral de detalle.

Modo Libre (cuando ubicacion_actual.modo === 'libre'):

Mostrar un árbol colapsable de la jerarquía: Equipo → Contenedor → Sub-contenedor → Crioviales.

Ejemplo visual:

text
Freezer -80°C
  └── Tupper 1
        └── Bolsa A
              └── CRV-001
              └── CRV-002
        └── Bolsa B
              └── CRV-003
  └── Tupper 2
        └── CRV-004 (suelto)
Click en criovial → panel lateral de detalle.

Panel lateral: ID, especie, soporte, temperatura, fecha, estado, botones de acción.

5.2 — Integrar en CriobancoListPage
Toggle: [ Lista ] [ Mapa ].

✅ Verificar antes de continuar
npm run build sin errores

Ambos modos funcionan correctamente

BLOQUE 6 — Detalle de criovial + movimiento de ubicación
Objetivo
Vista completa de un criovial individual con historial y formulario de movimiento.

6.1 — Crear src/pages/CriovialDetallePage.jsx
ID + QR.

Especie, cepa, ploidía.

Soporte, medio, volumen, temperatura.

Ubicación actual + botón "Registrar movimiento".

Modal de movimiento con campos de ubicación (modo, equipo, contenedor, sub-contenedor, posición, motivo, operario).

Historial de ubicaciones (timeline).

Link al batch/ejemplar de origen.

Si Agotado/Parcialmente usado: datos de descongelación. Si Criopreservado: botón "Registrar descongelación".

6.2 — Agregar ruta
jsx
<Route path="/criobanco/criovial/:id" element={<CriovialDetallePage />} />
✅ Verificar antes de continuar
npm run build sin errores

BLOQUE 7 — Registro de descongelación + viabilidad
Objetivo
Formulario para registrar la descongelación con múltiples métodos de viabilidad.

7.1 — Crear src/components/criobanco/FormDescongelacion.jsx
Fecha, operario, uso_parcial, notas.

Método de viabilidad: UFC placa, UFC líquido, MTT, Citometría, Otro, Sin evaluación.

Campos según método seleccionado.

Batch de recuperación (opcional): toggle + selector de medio y sala.

Cálculo automático de porcentaje de viabilidad.

✅ Verificar antes de continuar
npm run build sin errores

BLOQUE 8 — Dashboard de criobanco
Objetivo
Agregar indicadores del criobanco al dashboard existente.

8.1 — Agregar sección al dashboard
Total crioviales activos.

Crioviales por temperatura.

Ejemplares con criopreservación confirmada.

Crioviales sin ubicación completa (alerta de calidad de datos).

Seguir el mismo patrón visual del dashboard actual.

✅ Verificar antes de continuar
npm run build sin errores

RESUMEN DE ARCHIVOS
Archivo	Acción	Bloque
src/utils/idGenerator.js	Agregar CRY, CRV, DCG	1
Formularios de inoculación + BatchEditModal	Agregar flag destino_criopreservacion	1
Componentes de status de batch	Agregar "Planificado"	1
src/services/criobancService.js	Crear	2
src/pages/CriopreservacionNuevaPage.jsx	Crear	3
src/pages/CriobancoListPage.jsx	Crear	4
src/components/criobanco/MapaCriobanco.jsx	Crear	5
src/pages/CriovialDetallePage.jsx	Crear	6
src/components/criobanco/FormDescongelacion.jsx	Crear	7
Router	Agregar rutas	3, 4, 6
Navegación	Agregar "Criobanco"	4
Detalle de batch y ejemplar	Agregar botón "Criopreservar"	3
Dashboard	Agregar sección criobanco	8
Prompt generado por Claude · Revisado y ajustado por DeepSeek · 07/07/2026
Ejecutar con Antigravity bloque a bloque — confirmar build entre bloques

