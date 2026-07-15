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
  await setDoc(ref, experimento);
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
