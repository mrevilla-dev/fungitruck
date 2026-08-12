import { useState } from 'react';
import { verificarDuplicado, ejecutarLimpieza } from '../utils/limpiarDuplicado';

export default function LimpiezaDuplicadoPage() {
  const [estado, setEstado] = useState('idle'); // idle | analizando | analizado | ejecutando | completado | error
  const [reporte, setReporte] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function analizar() {
    setEstado('analizando');
    try {
      const rep = await verificarDuplicado();
      setReporte(rep);
      setEstado('analizado');
    } catch (err) {
      setEstado('error');
      console.error(err);
    }
  }

  async function ejecutar() {
    setEstado('ejecutando');
    try {
      const res = await ejecutarLimpieza();
      setResultado(res);
      setEstado('completado');
    } catch (err) {
      setEstado('error');
      console.error(err);
    }
  }

  const hayDuplicado = reporte && (reporte.esporoma || reporte.ejemplar);

  return (
    <div style={{ padding: '32px', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Limpieza de duplicado</h1>
      <p>
        Elimina el registro duplicado del ingreso del 26/08 (set <strong>-002</strong>:
        esporoma + ejemplar + batches + evento de aislamiento) generado por el bug de
        impresión, y restaura las unidades de medio que consumió.
        <br />
        <strong>No toca el set -001 (el correcto).</strong>
      </p>

      {estado === 'idle' && (
        <button
          onClick={analizar}
          style={{ padding: '12px 24px', backgroundColor: '#FF9800', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
        >
          🔍 Analizar duplicado (no modifica nada)
        </button>
      )}

      {estado === 'analizando' && <p>⏳ Analizando Firestore...</p>}

      {estado === 'analizado' && reporte && (
        <div>
          {!hayDuplicado && (
            <p>✅ No se encontró ningún duplicado. No hay nada que limpiar.</p>
          )}
          {hayDuplicado && (
            <div>
              <h2>Se encontró el duplicado:</h2>
              <ul>
                {reporte.esporoma && <li>🍄 Esporoma: <code>{reporte.esporoma.id}</code></li>}
                {reporte.ejemplar && <li>🧬 Ejemplar: <code>{reporte.ejemplar.id}</code></li>}
                {reporte.batches.map(b => <li key={b.id}>🧫 Batch: <code>{b.id}</code></li>)}
                {reporte.eventos.map(ev => <li key={ev.id}>🧪 Evento: <code>{ev.id}</code></li>)}
              </ul>
              <h3>Restauración de stock (1 unidad por batch):</h3>
              <ul>
                {reporte.restauracionStock.map(r => (
                  <li key={r.batchId}>
                    <code>{r.batchId}</code> → {r.campo ? `${r.path} (${r.campo} +1)` : 'sin medio referenciado — omitir'}
                  </li>
                ))}
              </ul>
              {!confirmar ? (
                <button
                  onClick={() => setConfirmar(true)}
                  style={{ padding: '12px 24px', backgroundColor: '#d32f2f', color: 'white',
                    border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', marginTop: '12px' }}
                >
                  Eliminar duplicado…
                </button>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <p><strong>⚠️ ¿Seguro?</strong> Esta acción es irreversible.</p>
                  <button
                    onClick={ejecutar}
                    style={{ padding: '12px 24px', backgroundColor: '#d32f2f', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
                  >
                    Sí, eliminar y restaurar stock
                  </button>{' '}
                  <button
                    onClick={() => setConfirmar(false)}
                    style={{ padding: '12px 24px', backgroundColor: '#555', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {estado === 'ejecutando' && <p>⏳ Ejecutando limpieza...</p>}

      {estado === 'completado' && resultado && (
        <div>
          <p>✅ Limpieza completada</p>
          <p>Eliminados:</p>
          <ul>{resultado.eliminados.map(e => <li key={e}><code>{e}</code></li>)}</ul>
          <p>Unidades de stock restauradas: <strong>{resultado.stockRestaurado}</strong></p>
          {resultado.mensaje && <p>{resultado.mensaje}</p>}
          {resultado.errores.length > 0 && (
            <div>
              <p>❌ Errores ({resultado.errores.length}):</p>
              <pre>{JSON.stringify(resultado.errores, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {estado === 'error' && <p>❌ Error inesperado. Revisá la consola (F12).</p>}
    </div>
  );
}
