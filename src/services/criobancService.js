/**
 * criobancService.js
 * Bloque 2 — Servicios Firestore para el módulo Criobanco
 * FungiTrack · 2026
 */
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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  generarIdEventoCriopreservacion,
  generarIdCriovial,
  generarIdEventoDescongelacion,
} from '../utils/idGenerator';

// ─── EVENTOS DE CRIOPRESERVACIÓN ───────────────────────────────────────────

/**
 * Crea un evento de criopreservación en Firestore.
 * @param {Object} datos
 * @param {string} datos.batch_origen_id
 * @param {string} datos.ejemplar_id
 * @param {string} datos.genero
 * @param {string} datos.especie
 * @param {string} [datos.cepa]
 * @param {string} datos.fecha  — ISO date string "YYYY-MM-DD"
 * @param {string} datos.operario
 * @param {string} [datos.protocolo_url]
 * @param {string} [datos.notas]
 * @returns {Promise<string>} ID del evento creado
 */
export async function crearEventoCriopreservacion(datos) {
  const id = await generarIdEventoCriopreservacion(
    db,
    datos.genero,
    datos.especie,
    datos.cepa
  );
  const evento = {
    id,
    batch_origen_id: datos.batch_origen_id ?? null,
    ejemplar_id: datos.ejemplar_id ?? null,
    genero: datos.genero ?? '',
    especie: datos.especie ?? '',
    cepa: datos.cepa ?? '',
    fecha: datos.fecha ?? '',
    operario: datos.operario ?? '',
    protocolo_url: datos.protocolo_url ?? '',
    notas: datos.notas ?? '',
    fecha_creacion: serverTimestamp(),
  };
  await setDoc(doc(db, 'eventos_criopreservacion', id), evento);
  return id;
}

/**
 * Obtiene todos los eventos de criopreservación, ordenados por fecha de creación desc.
 * @returns {Promise<Array>}
 */
export async function getEventosCriopreservacion() {
  const q = query(
    collection(db, 'eventos_criopreservacion'),
    orderBy('fecha_creacion', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
}

/**
 * Obtiene un evento de criopreservación por ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getEventoCriopreservacion(id) {
  const snap = await getDoc(doc(db, 'eventos_criopreservacion', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

// ─── CRIOVIALES ────────────────────────────────────────────────────────────

/**
 * Crea N crioviales en bulk dentro de un writeBatch.
 * @param {string} eventoId  — ID del evento de criopreservación padre
 * @param {Array}  datosCrioviales  — Array de objetos con datos por criovial
 * @param {Object} ejemplarData  — { ejemplar_id, genero, especie, cepa }
 * @returns {Promise<string[]>} IDs de los crioviales creados
 */
export async function crearCrioviales(eventoId, datosCrioviales, ejemplarData) {
  const batch = writeBatch(db);
  const ids = [];

  for (let i = 0; i < datosCrioviales.length; i++) {
    const datos = datosCrioviales[i];
    const letra = String.fromCharCode(65 + i); // A, B, C...
    const id = await generarIdCriovial(
      db,
      ejemplarData.genero,
      ejemplarData.especie,
      ejemplarData.cepa,
      letra
    );

    const criovial = {
      id,
      evento_criopreservacion_id: eventoId,
      ejemplar_id: ejemplarData.ejemplar_id ?? null,
      genero: ejemplarData.genero ?? '',
      especie: ejemplarData.especie ?? '',
      cepa: ejemplarData.cepa ?? '',
      volumen_ml: datos.volumen_ml ?? 2,
      soporte: datos.soporte ?? '',
      medio_criopreservacion: datos.medio_criopreservacion ?? '',
      temperatura_almacenamiento: datos.temperatura_almacenamiento ?? '',
      ubicacion_actual: {
        modo: datos.ubicacion?.modo ?? 'libre',
        equipo: datos.ubicacion?.equipo ?? '',
        contenedor: datos.ubicacion?.contenedor ?? '',
        sub_contenedor: datos.ubicacion?.sub_contenedor ?? '',
        posicion: datos.ubicacion?.posicion ?? '',
      },
      historial_ubicaciones: [],
      estado: 'Criopreservado',
      fecha_criopreservacion: datos.fecha ?? '',
      archivos: [],
      notas: datos.notas ?? '',
      fecha_creacion: serverTimestamp(),
    };

    batch.set(doc(db, 'crioviales', id), criovial);
    ids.push(id);
  }

  await batch.commit();
  return ids;
}

/**
 * Obtiene crioviales con filtros opcionales.
 * @param {Object} [filtros]
 * @param {string} [filtros.ejemplar_id]
 * @param {string} [filtros.estado]
 * @param {string} [filtros.equipo]
 * @returns {Promise<Array>}
 */
export async function getCrioviales(filtros = {}) {
  let baseQuery = collection(db, 'crioviales');
  const condiciones = [];

  if (filtros.ejemplar_id) {
    condiciones.push(where('ejemplar_id', '==', filtros.ejemplar_id));
  }
  if (filtros.estado) {
    condiciones.push(where('estado', '==', filtros.estado));
  }
  if (filtros.equipo) {
    condiciones.push(where('ubicacion_actual.equipo', '==', filtros.equipo));
  }

  const q =
    condiciones.length > 0
      ? query(baseQuery, ...condiciones, orderBy('fecha_creacion', 'desc'))
      : query(baseQuery, orderBy('fecha_creacion', 'desc'));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
}

/**
 * Obtiene un criovial por ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getCriovial(id) {
  const snap = await getDoc(doc(db, 'crioviales', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

/**
 * Obtiene los datos de un criovial específico por ID
 */
export const getCriovialById = async (criovialId) => {
  try {
    const docRef = doc(db, 'crioviales', criovialId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { _docId: docSnap.id, ...docSnap.data() };
    } else {
      throw new Error('Criovial no encontrado');
    }
  } catch (error) {
    console.error("Error obteniendo criovial por ID: ", error);
    throw error;
  }
};

/**
 * Registra una descongelación (Bloque 7)
 */
export const registrarDescongelacion = async (criovialId, datosDescongelacion, crearBatchData) => {
  try {
    const batch = writeBatch(db);
    
    // 1. Obtener criovial
    const criovialRef = doc(db, 'crioviales', criovialId);
    const criovialSnap = await getDoc(criovialRef);
    if (!criovialSnap.exists()) {
      throw new Error('Criovial no encontrado');
    }
    const criovialData = criovialSnap.data();

    // 2. Crear el nuevo Lote (Batch) si se solicitó
    let nuevoLoteId = null;
    if (crearBatchData) {
      // Generar ID REC-XXXX
      const batchesSnapshot = await getDocs(collection(db, 'batches'));
      let maxNum = 0;
      batchesSnapshot.forEach(docSnap => {
        const id = docSnap.id;
        if (id.startsWith('REC-')) {
          const num = parseInt(id.split('-')[1]);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const nextNum = maxNum + 1;
      nuevoLoteId = `REC-${nextNum.toString().padStart(4, '0')}`;

      const nuevoLoteRef = doc(db, 'batches', nuevoLoteId);
      batch.set(nuevoLoteRef, {
        experimento_id: null,
        tratamiento_id: null,
        atributos_experimentales: {},
        especie: criovialData.especie || '',
        cepa: criovialData.cepa || '',
        genero: criovialData.genero || '',
        fecha_inoculacion: crearBatchData.fecha_inoculacion,
        medio_cultivo: crearBatchData.medio_cultivo,
        sala: crearBatchData.sala,
        origen: `Criovial ${criovialId}`,
        estado: 'Planificado', // o el estado inicial que corresponda
        created_at: serverTimestamp()
      });
    }

    // 3. Crear el evento de criopreservación (tipo: descongelacion)
    const eventoRef = doc(collection(db, 'eventos_criopreservacion'));
    batch.set(eventoRef, {
      tipo_evento: 'descongelacion',
      criovial_id: criovialId,
      fecha: datosDescongelacion.fecha,
      operario: datosDescongelacion.operario,
      uso_parcial: datosDescongelacion.uso_parcial,
      metodo_viabilidad: datosDescongelacion.metodo_viabilidad,
      datos_viabilidad: datosDescongelacion.datos_viabilidad || {},
      motivo_notas: datosDescongelacion.motivo || '',
      nuevo_lote_id: nuevoLoteId,
      created_at: serverTimestamp()
    });

    // 4. Actualizar el criovial
    const nuevoEstado = datosDescongelacion.uso_parcial ? 'Parcialmente usado' : 'Agotado';
    batch.update(criovialRef, {
      estado: nuevoEstado,
      descongelacion: {
        fecha: datosDescongelacion.fecha,
        operario: datosDescongelacion.operario,
        motivo: datosDescongelacion.motivo || '',
        nuevo_lote: nuevoLoteId
      },
      updated_at: serverTimestamp()
    });

    await batch.commit();
    return { 
      success: true, 
      nuevoLoteId,
      batchData: {
        id: nuevoLoteId,
        alias: `${criovial.genero} ${criovial.especie}`.trim(),
        especie: `${criovial.genero} ${criovial.especie}`.trim(),
        fecha: new Date().toISOString().split('T')[0],
        operario: datosDescongelacion.operario || 'Sistema',
        nombre_receta: criovial.medio || 'Medio de Criopreservación',
        tipo_uso: 'Descongelación',
        tipo_etiqueta: 'MICRO_TUBOS',
        tipo_inoculacion: 'descongelacion'
      }
    };
  } catch (error) {
    console.error("Error registrando descongelación: ", error);
    throw error;
  }
};

/**
 * Registra un movimiento de un criovial a una nueva ubicación
 */
export const registrarMovimientoCriovial = async (criovialId, nuevaUbicacion, motivo, operario) => {
  try {
    const docRef = doc(db, 'crioviales', criovialId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error('Criovial no encontrado');
    }

    const dataAnterior = docSnap.data();
    
    // Crear el registro para el historial
    const registroHistorial = {
      fecha: new Date().toISOString().split('T')[0],
      timestamp: new Date().getTime(),
      motivo: motivo || 'Cambio de ubicación',
      operario: operario || 'Desconocido',
      ubicacion_anterior: dataAnterior.ubicacion_actual || null,
      ubicacion_nueva: nuevaUbicacion
    };

    // Usar la función updateDoc pura
    await updateDoc(docRef, {
      ubicacion_actual: nuevaUbicacion,
      historial_ubicaciones: arrayUnion(registroHistorial),
      updated_at: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error("Error registrando movimiento: ", error);
    throw error;
  }
};

// ─── EVENTOS DE DESCONGELACIÓN ─────────────────────────────────────────────

/**
 * Crea un evento de descongelación y actualiza el estado del criovial.
 * @param {string} criovialId
 * @param {Object} datos
 * @param {string} datos.fecha
 * @param {string} datos.operario
 * @param {string} [datos.metodo_viabilidad]
 * @param {Object} [datos.resultado_viabilidad]
 * @param {Array}  [datos.archivos_externos]
 * @param {string|null} [datos.batch_recuperacion_id]
 * @param {boolean} [datos.uso_parcial]
 * @param {string} [datos.notas]
 * @returns {Promise<string>} ID del evento de descongelación creado
 */
export async function crearEventoDescongelacion(criovialId, datos) {
  const criovialSnap = await getDoc(doc(db, 'crioviales', criovialId));
  if (!criovialSnap.exists()) throw new Error('Criovial no encontrado');

  const criovial = criovialSnap.data();
  const id = await generarIdEventoDescongelacion(
    db,
    criovial.genero ?? 'UNK',
    criovial.especie ?? 'UNK',
    criovial.cepa ?? ''
  );

  const batch = writeBatch(db);

  batch.set(doc(db, 'eventos_descongelacion', id), {
    id,
    criovial_id: criovialId,
    ejemplar_id: criovial.ejemplar_id ?? null,
    fecha: datos.fecha ?? '',
    operario: datos.operario ?? '',
    metodo_viabilidad: datos.metodo_viabilidad ?? '',
    resultado_viabilidad: datos.resultado_viabilidad ?? {},
    archivos_externos: datos.archivos_externos ?? [],
    batch_recuperacion_id: datos.batch_recuperacion_id ?? null,
    uso_parcial: datos.uso_parcial ?? false,
    notas: datos.notas ?? '',
    fecha_creacion: serverTimestamp(),
  });

  const nuevoEstado = datos.uso_parcial ? 'Parcialmente usado' : 'Agotado';
  batch.update(doc(db, 'crioviales', criovialId), { estado: nuevoEstado });

  await batch.commit();
  return id;
}

/**
 * Obtiene todos los eventos de descongelación de un criovial.
 * @param {string} criovialId
 * @returns {Promise<Array>}
 */
export async function getEventosDescongelacion(criovialId) {
  const q = query(
    collection(db, 'eventos_descongelacion'),
    where('criovial_id', '==', criovialId),
    orderBy('fecha_creacion', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
}
