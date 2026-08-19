import { db } from '../firebase';
import { collectionGroup, query, getDocs, doc, updateDoc, deleteField, writeBatch } from 'firebase/firestore';

const ID_META = 'FRAC-AGAR-20260814-A';

const FRASCO_KEYWORDS = ['frasco', 'botella', 'erlenmeyer', 'beaker'];

const esFrasco = (tipoUnidad) => {
  const t = String(tipoUnidad || '').toLowerCase();
  return FRASCO_KEYWORDS.some(k => t.includes(k));
};

// Infiere los ml iniciales del frasco desde su tipo_unidad (ej: "Frasco de 500ml…" → 500, "Frasco de Vidrio 1 Litro" → 1000)
const inferirMlIniciales = (tipoUnidad) => {
  const t = String(tipoUnidad || '');
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|l\b|litro)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  return Math.round(n * (u === 'ml' ? 1 : 1000));
};

const leerFrascos = async () => {
  const snap = await getDocs(query(collectionGroup(db, 'subfracciones')));
  const frascos = [];
  const muestra = [];
  for (const d of snap.docs) {
    const s = d.data();
    const identidad = s.id_bolsa || s.id || d.id;
    muestra.push({
      id_bolsa: identidad,
      tipo_unidad: s.tipo_unidad ?? '—',
      estado: s.estado ?? '—',
      disponible: s.disponible ?? 0,
      ref: d.ref.path,
    });
    if (!esFrasco(s.tipo_unidad)) continue;
    frascos.push({
      id: identidad,
      docId: d.id,
      medioId: d.ref.parent.parent.id,
      alias: s.alias || identidad,
      tipo_unidad: s.tipo_unidad,
      por_volumen: !!s.por_volumen,
      volumen_por_unidad_ml: s.volumen_por_unidad_ml ?? null,
      disponible: s.disponible ?? 0,
      cantidad: s.cantidad ?? 0,
      estado: s.estado ?? null,
      fecha_agotamiento: s.fecha_agotamiento ?? null,
      ref: d.ref.path,
    });
  }
  return { frascos, muestra };
};

function calcularConversion(f) {
  if (f.por_volumen) return null;
  const volU = Number(f.volumen_por_unidad_ml) || 0;
  if (volU <= 0) {
    return { ...f, flag: 'SIN_VOL_U', cantidadInicial: null, disponibleNuevo: null };
  }
  const cantidadInicial = Math.round((f.cantidad ?? 1) * volU);
  const disponibleNuevo = Math.round((f.disponible ?? 0) * volU);
  if ((f.disponible ?? 0) < 0) {
    return { ...f, flag: 'DISPO_NEGATIVO', cantidadInicial, disponibleNuevo };
  }
  return { ...f, flag: null, cantidadInicial, disponibleNuevo };
}

export async function analizarFraccionesVolumen() {
  const { frascos, muestra } = await leerFrascos();

  const meta = frascos.find(f => f.id === ID_META) || null;
  const candidatos = frascos.filter(f => f.id !== ID_META && !f.por_volumen);

  let cambios = [];
  if (meta) {
    if (!meta.por_volumen) {
      const cantidadNueva = Math.round((meta.cantidad ?? 1) * (Number(meta.volumen_por_unidad_ml) || 1)) || 500;
      cambios = [
        { campo: 'por_volumen', de: !!meta.por_volumen, a: true },
        { campo: 'volumen_por_unidad_ml', de: meta.volumen_por_unidad_ml, a: 1 },
        { campo: 'cantidad', de: meta.cantidad, a: cantidadNueva },
        { campo: 'disponible', de: meta.disponible, a: 440 },
        { campo: 'estado', de: meta.estado, a: 'Disponible' },
        { campo: 'fecha_agotamiento', de: meta.fecha_agotamiento ? 'presente' : 'ausente', a: 'eliminado' },
      ];
    } else {
      // Ya migrada: solo el fix de cantidad si quedó inconsistente (por_volumen true pero cantidad != ml iniciales)
      const mlIniciales = inferirMlIniciales(meta.tipo_unidad);
      if (mlIniciales && meta.cantidad !== mlIniciales) {
        cambios = [
          { campo: 'cantidad', de: meta.cantidad, a: mlIniciales, motivo: 'por_volumen con cantidad inconsistente' },
        ];
      }
    }
  }

  return {
    meta,
    cambios,
    candidatos,
    totalSubfracciones: muestra.length,
    totalFrascos: frascos.length,
    muestra: muestra.slice(0, 50),
  };
}

export async function ejecutarMigracion(reporte) {
  if (!reporte?.meta) throw new Error('No se encontró FRAC-AGAR-20260814-A. Nada que migrar.');

  const ref = doc(db, 'medios_preparados', reporte.meta.medioId, 'subfracciones', reporte.meta.docId);

  if (reporte.meta.por_volumen) {
    // Ya migrada: aplicar solo el fix de cantidad si quedó inconsistente
    const mlIniciales = inferirMlIniciales(reporte.meta.tipo_unidad);
    if (!mlIniciales || reporte.meta.cantidad === mlIniciales) {
      throw new Error('Ya migrada y consistente. Nada que hacer.');
    }
    await updateDoc(ref, { cantidad: mlIniciales });
    return {
      migrada: ID_META,
      medioId: reporte.meta.medioId,
      ref: ref.path,
      cambios: reporte.cambios,
      candidatosPendientes: [],
    };
  }

  const cantidadNueva = Math.round((reporte.meta.cantidad ?? 1) * (Number(reporte.meta.volumen_por_unidad_ml) || 1)) || 500;

  await updateDoc(ref, {
    por_volumen: true,
    volumen_por_unidad_ml: 1,
    cantidad: cantidadNueva,
    disponible: 440,
    estado: 'Disponible',
    fecha_agotamiento: deleteField(),
  });

  return {
    migrada: ID_META,
    medioId: reporte.meta.medioId,
    ref: ref.path,
    cambios: reporte.cambios,
    candidatosPendientes: reporte.candidatos.map(c => c.id),
  };
}

export async function analizarMigracionMasiva() {
  const { frascos } = await leerFrascos();
  const aMigrar = [];
  const aRevisar = [];
  for (const f of frascos) {
    if (f.por_volumen) continue;
    if (f.id === ID_META) continue;
    const c = calcularConversion(f);
    if (!c) continue;
    if (c.flag) {
      aRevisar.push(c);
    } else {
      aMigrar.push(c);
    }
  }
  return { aMigrar, aRevisar };
}

export async function ejecutarMigracionMasiva(reporte) {
  if (!reporte?.aMigrar?.length) throw new Error('No hay frascos pendientes de migración.');
  const wb = writeBatch(db);
  for (const f of reporte.aMigrar) {
    const ref = doc(db, 'medios_preparados', f.medioId, 'subfracciones', f.docId);
    const upd = {
      por_volumen: true,
      volumen_por_unidad_ml: 1,
      cantidad: f.cantidadInicial,
      disponible: f.disponibleNuevo,
    };
    if (f.disponibleNuevo > 0) {
      upd.estado = 'Disponible';
      upd.fecha_agotamiento = deleteField();
    }
    wb.update(ref, upd);
  }
  await wb.commit();

  return {
    migradas: reporte.aMigrar.length,
    refs: reporte.aMigrar.map(f => f.ref),
    aRevisar: reporte.aRevisar.map(f => ({ id: f.id, flag: f.flag, disponible: f.disponible, volU: f.volumen_por_unidad_ml })),
  };
}