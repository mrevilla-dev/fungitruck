import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// 'YYYY-MM-DD' → Date local (medianoche local, sin shift de UTC)
export function parseFechaLocal(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str).trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Timestamp | Date | number → ms
export function toMillis(v) {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return null;
}

// Cuándo vence la revisión de un batch:
// proxima_revision → fechaInoculacion (+intervalo) → createdAt (+intervalo) → ahora (+intervalo)
export function dueMillis(batch, intervaloHoras) {
  const horas = (Number(intervaloHoras) || 48) * 3600 * 1000;
  const pr = toMillis(batch?.proxima_revision);
  if (pr !== null) return pr;
  const fi = parseFechaLocal(batch?.fechaInoculacion || batch?.fecha_inoculacion);
  if (fi) return fi.getTime() + horas;
  const ca = toMillis(batch?.createdAt);
  if (ca !== null) return ca + horas;
  return Date.now() + horas;
}

// "vence hace Xh" / "vence en Xh" / "vence ahora"
export function formatVencimiento(dueMs, nowMs = Date.now()) {
  if (dueMs == null) return '';
  const diffH = Math.round((dueMs - nowMs) / 3600000);
  if (diffH < 0) return `vence hace ${Math.abs(diffH)}h`;
  if (diffH === 0) return 'vence ahora';
  return `vence en ${diffH}h`;
}

// Intervalo global de inspección (config/inspecciones.intervalo_horas, default 48)
export async function getIntervaloInspeccion() {
  try {
    const snap = await getDoc(doc(db, 'config', 'inspecciones'));
    return Number(snap.data()?.intervalo_horas) || 48;
  } catch (err) {
    console.error('Error leyendo config/inspecciones:', err);
    return 48;
  }
}

// Próxima revisión para un batch recién creado (fecha string 'YYYY-MM-DD' + intervalo global)
export async function proximaRevisionDesdeFecha(fechaStr) {
  const intervalo = await getIntervaloInspeccion();
  const base = parseFechaLocal(fechaStr) || new Date();
  return new Date(base.getTime() + (Number(intervalo) || 48) * 3600 * 1000);
}