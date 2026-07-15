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
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { generarIdEquipo } from '../utils/idGenerator';

const CATEGORIAS_DESTINO = ['Incubación', 'Refrigeración', 'Freezer'];

export async function crearEquipo(datos) {
  const id = await generarIdEquipo(db);

  const equipo = {
    id,
    nombre: datos.nombre,
    categoria: datos.categoria,
    marca_modelo: datos.marca_modelo ?? '',
    nro_serie: datos.nro_serie ?? '',
    propietario: datos.propietario ?? 'Facultad',
    fecha_adquisicion: datos.fecha_adquisicion ?? null,
    vida_util_anios: datos.vida_util_anios ?? null,
    valor_compra: datos.valor_compra ?? 0,
    valor_residual: datos.valor_residual ?? 0,
    sala_actual_id: datos.sala_actual_id ?? null,
    es_destino_de_batches: CATEGORIAS_DESTINO.includes(datos.categoria),
    estado_operativo: 'Operativo',
    parametros_ideales: {
      temp_min: datos.temp_min ?? null,
      temp_max: datos.temp_max ?? null,
      hum_min: datos.hum_min ?? null,
      hum_max: datos.hum_max ?? null,
    },
    foto_url: datos.foto_url ?? '',
    notas: datos.notas ?? '',
    migrado_desde_insumo_id: null,
    fecha_creacion: serverTimestamp(),
    operario: datos.operario,
  };

  await setDoc(doc(db, 'equipos', id), equipo);
  return id;
}

export async function getEquipos(filtros = {}) {
  let q = collection(db, 'equipos');
  const condiciones = [];

  if (filtros.categoria) {
    condiciones.push(where('categoria', '==', filtros.categoria));
  }
  if (filtros.estado_operativo) {
    condiciones.push(where('estado_operativo', '==', filtros.estado_operativo));
  }
  if (filtros.sala_actual_id) {
    condiciones.push(where('sala_actual_id', '==', filtros.sala_actual_id));
  }
  if (filtros.es_destino_de_batches !== undefined) {
    condiciones.push(where('es_destino_de_batches', '==', filtros.es_destino_de_batches));
  }

  q = condiciones.length > 0
    ? query(q, ...condiciones, orderBy('fecha_creacion', 'desc'))
    : query(q, orderBy('fecha_creacion', 'desc'));

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export async function getEquipo(id) {
  const snap = await getDoc(doc(db, 'equipos', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

export async function actualizarEquipo(id, datos) {
  await updateDoc(doc(db, 'equipos', id), {
    ...datos,
    es_destino_de_batches: CATEGORIAS_DESTINO.includes(datos.categoria),
    fecha_actualizacion: serverTimestamp(),
  });
}

export async function actualizarEstadoOperativo(id, nuevoEstado) {
  await updateDoc(doc(db, 'equipos', id), {
    estado_operativo: nuevoEstado,
    fecha_actualizacion: serverTimestamp(),
  });
}

export async function moverEquipoASala(id, nuevaSalaId) {
  await updateDoc(doc(db, 'equipos', id), {
    sala_actual_id: nuevaSalaId ?? null,
    fecha_actualizacion: serverTimestamp(),
  });
}

// ─── MANTENIMIENTO DE EQUIPOS ───────────────────────────────────────────────

export async function registrarReparacion(equipoId, datos) {
  await addDoc(collection(db, 'mantenimiento'), {
    tipo: 'Reparacion',
    equipo_id: equipoId,
    destinoId: null,
    fecha: datos.fecha,
    descripcion: datos.descripcion ?? '',
    costo: datos.costo ?? 0,
    operario: datos.operario,
    notas: datos.notas ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function registrarCalibracion(equipoId, datos) {
  await addDoc(collection(db, 'mantenimiento'), {
    tipo: 'Calibracion',
    equipo_id: equipoId,
    destinoId: null,
    fecha: datos.fecha,
    resultado: datos.resultado ?? 'Aprobado',
    descripcion: datos.descripcion ?? '',
    certificado_url: datos.certificado_url ?? '',
    proximo_vencimiento: datos.proximo_vencimiento ?? null,
    operario: datos.operario,
    notas: datos.notas ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function getMantenimientosDeEquipo(equipoId) {
  const q = query(
    collection(db, 'mantenimiento'),
    where('equipo_id', '==', equipoId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export async function getEquiposDeSala(salaId) {
  const q = query(
    collection(db, 'equipos'),
    where('sala_actual_id', '==', salaId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}
