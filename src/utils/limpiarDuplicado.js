import { collection, doc, getDoc, getDocs, increment, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Limpieza del duplicado generado por el bug de impresión en Ingreso Único
 * (crash "etiquetas is not defined" tras el commit → segundo registro duplicado).
 *
 * Incidente: se guardaron DOS sets:
 *   - Set -001 (correcto): ESP-CUEMAT-CUELLITO-DON-260812-001 + EJE-...-001 + 2 batches
 *   - Set -002 (duplicado): ESP-CUEMAT-CUELLITO-DON-260812-002 + EJE-CUEMAT-CUELLITO-EXP-260812-002 + 2 batches
 *
 * La limpieza elimina el set -002 y restaura el stock de medio que consumió.
 * NO borra el set -001. Safe: primero se analiza (verificarDuplicado), recién
 * luego se borra (ejecutarLimpieza) con un batch atómico.
 */

const ESP_DUPLICADO = 'ESP-CUEMAT-CUELLITO-DON-260812-002';
const EJE_DUPLICADO = 'EJE-CUEMAT-CUELLITO-EXP-260812-002';

async function buscarEjeDuplicado() {
  let ejeSnap = await getDoc(doc(db, 'ejemplares', EJE_DUPLICADO));
  if (!ejeSnap.exists()) {
    const q = query(collection(db, 'ejemplares'), where('id_semantico', '==', EJE_DUPLICADO));
    const snap = await getDocs(q);
    if (!snap.empty) ejeSnap = snap.docs[0];
  }
  return ejeSnap.exists() ? { id: ejeSnap.id, ...ejeSnap.data() } : null;
}

/**
 * Analiza el duplicado y reporta TODO lo que se va a tocar, sin modificar nada.
 */
export async function verificarDuplicado() {
  const reporte = { esporoma: null, ejemplar: null, batches: [], eventos: [], restauracionStock: [] };

  const espSnap = await getDoc(doc(db, 'esporomas', ESP_DUPLICADO));
  if (espSnap.exists()) {
    reporte.esporoma = { id: espSnap.id, ...espSnap.data() };
  }

  const eje = await buscarEjeDuplicado();
  if (eje) reporte.ejemplar = eje;

  if (eje) {
    const batchesSnap = await getDocs(query(collection(db, 'batches'), where('ejemplarId', '==', eje.id)));
    reporte.batches = batchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const eventosSnap = await getDocs(query(collection(db, 'eventos_aislamiento'), where('ejemplar_resultante_id', '==', eje.id)));
    reporte.eventos = eventosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Plan de restauración de stock: 1 unidad devuelta por batch borrado
  for (const b of reporte.batches) {
    const rest = { batchId: b.id, tipo: 'medio', path: '', campo: '', cantidad: 1 };
    if (b.fraccionId && b.medioPrepId) {
      rest.tipo = 'subfraccion';
      rest.path = `medios_preparados/${b.medioPrepId}/subfracciones/${b.fraccionId}`;
      rest.campo = 'disponible';
    } else if (b.medioPrepId) {
      rest.path = `medios_preparados/${b.medioPrepId}`;
      rest.campo = 'stock_bulk.cantidad_actual';
    } else {
      rest.campo = null; // sin referencia de medio → no se restaura stock
    }
    reporte.restauracionStock.push(rest);
  }

  return reporte;
}

/**
 * Ejecuta la limpieza real: borra el set duplicado y restaura stock, atómicamente.
 * Debe haberse llamado verificarDuplicado() antes (la UI muestra el reporte).
 */
export async function ejecutarLimpieza() {
  const resultado = { eliminados: [], stockRestaurado: 0, errores: [] };

  try {
    const reporte = await verificarDuplicado();
    if (!reporte.esporoma && !reporte.ejemplar) {
      return { ...resultado, mensaje: 'No se encontró ningún duplicado que limpiar.' };
    }

    const wb = writeBatch(db);

    if (reporte.esporoma) {
      wb.delete(doc(db, 'esporomas', reporte.esporoma.id));
      resultado.eliminados.push(`esporomas/${reporte.esporoma.id}`);
    }
    if (reporte.ejemplar) {
      wb.delete(doc(db, 'ejemplares', reporte.ejemplar.id));
      resultado.eliminados.push(`ejemplares/${reporte.ejemplar.id}`);
    }
    for (const ev of reporte.eventos) {
      wb.delete(doc(db, 'eventos_aislamiento', ev.id));
      resultado.eliminados.push(`eventos_aislamiento/${ev.id}`);
    }
    for (const b of reporte.batches) {
      wb.delete(doc(db, 'batches', b.id));
      resultado.eliminados.push(`batches/${b.id}`);
    }

    // Restaurar stock: 1 unidad por batch (se descuenta 1 por placa creada)
    for (const rest of reporte.restauracionStock) {
      if (!rest.campo || !rest.path) {
        resultado.errores.push(`batch ${rest.batchId}: sin referencia de medio para restaurar`);
        continue;
      }
      const refs = rest.path.split('/');
      let ref = doc(db, refs[0], refs[1]);
      if (refs.length === 4) ref = doc(db, refs[0], refs[1], refs[2], refs[3]);
      wb.update(ref, { [rest.campo]: increment(1) });
      resultado.stockRestaurado++;
    }

    await wb.commit();
    return resultado;
  } catch (err) {
    resultado.errores.push(err.message);
    return resultado;
  }
}
