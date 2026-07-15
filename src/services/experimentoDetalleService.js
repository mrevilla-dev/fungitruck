// src/services/experimentoDetalleService.js
import { db } from '../firebase';
import { collection, doc, getDocs, query, where, updateDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { getBatchesDeExperimento } from './experimentoService';

export async function obtenerBatchesPorExperimento(experimentoId) {
  return await getBatchesDeExperimento(experimentoId);
}

export async function cambiarEstadoBatches(batchIds, nuevoEstado) {
  if (!batchIds?.length) return;
  const batch = writeBatch(db);
  batchIds.forEach((id) => {
    const ref = doc(db, 'batches', id);
    batch.update(ref, { status: nuevoEstado, fecha_actualizacion: serverTimestamp() });
  });
  await batch.commit();
}

export async function adoptarBatch(experimentoId, tratamientoId, batchId) {
  const expRef = doc(db, 'experimentos', experimentoId);
  const snap = await getDoc(expRef);
  if (!snap.exists()) throw new Error('Experimento no encontrado');
  const data = snap.data();
  const tratamientos = data.tratamientos || [];
  const updatedTratamientos = tratamientos.map((t) => {
    if (t.id === tratamientoId) {
      const batches = t.batches ? [...t.batches, batchId] : [batchId];
      return { ...t, batches };
    }
    return t;
  });
  await updateDoc(expRef, { tratamientos: updatedTratamientos, fecha_actualizacion: serverTimestamp() });
}

export async function obtenerVariablesRespuesta(experimentoId) {
  const expRef = doc(db, 'experimentos', experimentoId);
  const snap = await getDoc(expRef);
  if (!snap.exists()) return [];
  const data = snap.data();
  return data.variables_respuesta || [];
}

export async function searchBatchesByEspecie(especie) {
  if (!especie) return [];
  const q = query(collection(db, 'batches'), where('especie', '==', especie));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
