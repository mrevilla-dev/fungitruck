/**
 * Generador de IDs Semánticos para FungiTrack
 */
import { doc, runTransaction } from 'firebase/firestore';

export function generateBatchId(prefix, sequence = 1, suffix = null) {
  const parts = new Date().toISOString().split('T')[0].split('-');
  const dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
  const baseId = `${prefix}-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  return suffix ? `${baseId}-${suffix.toString().padStart(2, '0')}` : baseId;
}

export function generateLoteInsumoId(insumoNombre) {
  const prefix = (insumoNombre || 'INS').toUpperCase().slice(0, 3);
  const timestamp = Date.now().toString().slice(-4);
  return `LOT-${prefix}-${timestamp}`;
}

// Alias para compatibilidad con archivos antiguos (NewBatch.jsx)
export function generateSemanticId(genero, especie, substrateCode) {
  const prefix = `${(genero || 'UNK').slice(0, 3)}-${(especie || 'UNK').slice(0, 3)}-${substrateCode || 'UNK'}`.toUpperCase();
  return generateBatchId(prefix);
}

export function getSubstrateCode(substrate) {
  if (!substrate) return 'UNK';
  return substrate.slice(0, 3).toUpperCase();
}

// --- BLOQUE 1: NUEVO FORMATO BATCH ---

/**
 * Genera el ID de Batch unificado.
 */
export function generarIdBatch({
  genero,
  especie,
  codigo_cepa,
  es_hibridacion,
  contador_hibridacion,
  codigo_medio,
  fecha_iso,
  secuencia_diaria,
  letra_unidad,
  numero_transferencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  
  let segmentoCepa = '';
  if (es_hibridacion) {
    segmentoCepa = `H${contador_hibridacion || 1}`;
  } else if (codigo_cepa) {
    // Se antepone 'M' al código de cepa para cumplir con el formato esperado
    segmentoCepa = 'M' + String(codigo_cepa).trim().toUpperCase();
  }

  const med = (codigo_medio || 'MED').toUpperCase();

  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) {
      dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    } else {
      dateStr = fecha_iso.replace(/-/g, '').slice(-6);
    }
  }

  const nnn = String(secuencia_diaria || 1).padStart(3, '0');

  const partes = [g, e];
  if (segmentoCepa) partes.push(segmentoCepa);
  partes.push(med, dateStr, nnn);
  
  if (letra_unidad) {
    partes.push(letra_unidad);
  }

  const tn = Number(numero_transferencia) || 1;
  if (tn > 1) {
    partes.push(`T${tn}`);
  }

  return partes.join('-');
}

/**
 * Obtiene e incrementa atómicamente el contador por especie para hibridaciones.
 */
export async function incrementarSecuenciaHibridacion(t, db, genero, especie) {
  const g = (genero || 'UNK').toLowerCase().replace(/\s+/g, '_');
  const e = (especie || 'UNK').toLowerCase().replace(/\s+/g, '_');
  const fieldName = `hibridacion_${g}_${e}`;
  
  const docRef = doc(db, 'metadata', 'counters');
  const d = await t.get(docRef);
  let data = d.data() || {};
  let seq = data[fieldName] || 0;
  seq++;
  t.update(docRef, { [fieldName]: seq });
  return seq;
}

// --- BLOQUE 1: VENTANILLA UNICA (NUEVOS IDS) ---

/**
 * Genera el ID para un Esporoma (ESP)
 */
export function generarIdEsporoma({
  genero,
  especie,
  codigo_cepa,
  origen_codigo,
  fecha_iso,
  secuencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepa = codigo_cepa ? String(codigo_cepa).trim().toUpperCase() : '';
  const origen = (origen_codigo || 'UNK').toUpperCase();
  
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  
  const partes = ['ESP', `${g}${e}`];
  if (cepa) partes.push(cepa);
  partes.push(origen, dateStr, seqStr);
  
  return partes.join('-');
}

/**
 * Genera el ID para un Ejemplar (EJE)
 */
export function generarIdEjemplar({
  genero,
  especie,
  codigo_cepa,
  tipo_micelio_codigo,
  fecha_iso,
  secuencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepa = codigo_cepa ? String(codigo_cepa).trim().toUpperCase() : '';
  const tipo = (tipo_micelio_codigo || 'UNK').toUpperCase();
  
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  
  const partes = ['EJE', `${g}${e}`];
  if (cepa) partes.push(cepa);
  partes.push(tipo, dateStr, seqStr);
  
  return partes.join('-');
}

/**
 * Genera el ID para un Evento de Aislamiento (EVT)
 */
export function generarIdEvento({
  genero,
  especie,
  codigo_cepa,
  tecnica_codigo,
  fecha_iso,
  secuencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepa = codigo_cepa ? String(codigo_cepa).trim().toUpperCase() : '';
  const tecnica = (tecnica_codigo || 'UNK').toUpperCase();
  
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  
  const partes = ['EVT', `${g}${e}`];
  if (cepa) partes.push(cepa);
  partes.push(tecnica, dateStr, seqStr);
  
  return partes.join('-');
}

/**
 * Genera el ID Semántico para una Cosecha (COS)
 */
export function generarIdCosecha({
  genero,
  especie,
  fecha_iso,
  secuencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  
  const partes = ['COS', `${g}${e}`, dateStr, seqStr];
  return partes.join('-');
}

/**
 * Genera el ID Semántico para una Cosecha Grupal (CGR)
 */
export function generarIdCosechaGrupal({
  fecha_iso,
  secuencia
}) {
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  return `CGR-${dateStr}-${seqStr}`;
}

/**
 * Genera el ID Semántico para una No Conformidad (NC)
 */
export function generarIdNoConformidad({
  genero,
  especie,
  fecha_iso,
  secuencia
}) {
  const g = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const e = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  
  let dateStr = '000000';
  if (fecha_iso) {
    const parts = fecha_iso.split('T')[0].split('-');
    if (parts.length === 3) dateStr = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
    else dateStr = fecha_iso.replace(/-/g, '').slice(-6);
  }
  
  const seqStr = String(secuencia || 1).padStart(3, '0');
  return ['NC', `${g}${e}`, dateStr, seqStr].join('-');
}

/**
 * Genera ID para evento de criopreservación
 * Formato: CRY-GENESP-CEPA-YYMMDD-NNN
 * Ejemplo: CRY-CORMI-He3-260628-001
 */
export async function generarIdEventoCriopreservacion(db, genero, especie, cepa) {
  const gen = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const esp = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepaParte = cepa ? `-${String(cepa).trim().toUpperCase()}` : '';
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
  const gen = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const esp = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepaParte = cepa ? `-${String(cepa).trim().toUpperCase()}` : '';
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
  const gen = (genero || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const esp = (especie || 'UNK').substring(0, 3).toUpperCase().replace(/\s/g, '');
  const cepaParte = cepa ? `-${String(cepa).trim().toUpperCase()}` : '';
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

/**
 * Genera ID semántico para equipos
 * Formato: EQP-YYMMDD-NNN
 * Ejemplo: EQP-260708-001
 */
export async function generarIdEquipo(db) {
  const fecha = new Date();
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const fechaStr = `${yy}${mm}${dd}`;
  const counterKey = `EQP-${fechaStr}`;

  const counterRef = doc(db, 'metadata', 'counters');
  let nuevoNumero;

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const data = counterDoc.exists() ? counterDoc.data() : {};
    nuevoNumero = (data[counterKey] ?? 0) + 1;
    transaction.set(counterRef, { [counterKey]: nuevoNumero }, { merge: true });
  });

  const nnn = String(nuevoNumero).padStart(3, '0');
  return `EQP-${fechaStr}-${nnn}`;
}
