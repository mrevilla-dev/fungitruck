import { useState } from 'react';
import { analizarFraccionesVolumen, ejecutarMigracion, analizarMigracionMasiva, ejecutarMigracionMasiva } from '../utils/migrarFraccionesVolumen';

export default function MigracionFraccionesVolumenPage() {
  const [estado, setEstado] = useState('idle'); // idle | analizando | analizado | ejecutando | completado | error
  const [reporte, setReporte] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  // Migración masiva
  const [masiva, setMasiva] = useState(null); // null | analizando | analizada | ejecutando | completada | error
  const [reporteMasiva, setReporteMasiva] = useState(null);
  const [confirmarMasiva, setConfirmarMasiva] = useState(false);
  const [resultadoMasiva, setResultadoMasiva] = useState(null);
  const [errorMasiva, setErrorMasiva] = useState(null);

  async function analizar() {
    setEstado('analizando');
    setError(null);
    try {
      const rep = await analizarFraccionesVolumen();
      setReporte(rep);
      setEstado('analizado');
    } catch (err) {
      setEstado('error');
      setError(err.message);
      console.error(err);
    }
  }

  async function ejecutar() {
    setEstado('ejecutando');
    setError(null);
    try {
      const res = await ejecutarMigracion(reporte);
      setResultado(res);
      setEstado('completado');
    } catch (err) {
      setEstado('error');
      setError(err.message);
      console.error(err);
    }
  }

  async function analizarM() {
    setMasiva('analizando');
    setErrorMasiva(null);
    try {
      const rep = await analizarMigracionMasiva();
      setReporteMasiva(rep);
      setMasiva('analizada');
    } catch (err) {
      setMasiva('error');
      setErrorMasiva(err.message);
      console.error(err);
    }
  }

  async function ejecutarM() {
    setMasiva('ejecutando');
    setErrorMasiva(null);
    try {
      const res = await ejecutarMigracionMasiva(reporteMasiva);
      setResultadoMasiva(res);
      setMasiva('completada');
    } catch (err) {
      setMasiva('error');
      setErrorMasiva(err.message);
      console.error(err);
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '760px', margin: '0 auto' }}>
      <h1>Migración: frascos por volumen</h1>
      <p>
        Convierte la subfracción <code><strong>FRAC-AGAR-20260814-A</strong></code> al
        modelo <em>por volumen</em>: disponible pasa a <strong>440 ml</strong>, estado{' '}
        <strong>Disponible</strong>, sin fecha de agotamiento, <code>volumen_por_unidad_ml = 1</code>.
        <br />
        El análisis es <strong>solo lectura</strong> (dry-run) y no modifica nada.
      </p>

      {estado === 'idle' && (
        <button
          onClick={analizar}
          style={{ padding: '12px 24px', backgroundColor: '#FF9800', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
        >
          🔍 Analizar (no modifica nada)
        </button>
      )}

      {estado === 'analizando' && <p>⏳ Analizando Firestore...</p>}

      {estado === 'analizado' && reporte && (
        <div>
          <p>🧴 Subfracciones totales: <strong>{reporte.totalSubfracciones}</strong> · frascos detectados: <strong>{reporte.totalFrascos}</strong></p>
          {!reporte.meta && (
            <div>
              <p>❌ No se encontró <code>FRAC-AGAR-20260814-A</code> entre los frascos detectados. Nada que migrar.</p>
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <strong>🔍 Diagnóstico (primeras {reporte.muestra.length} subfracciones):</strong>
                {reporte.muestra.length === 0 && <p>No hay ninguna subfracción en la base.</p>}
                <ul>
                  {reporte.muestra.map(m => (
                    <li key={m.ref}>
                      <code>{m.id_bolsa}</code> · {m.tipo_unidad} · {m.estado} · disp: {m.disponible} · <code>{m.ref}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {reporte.meta && (
            <div>
              <h2>Estado actual:</h2>
              <ul>
                <li>📍 Ubicación: <code>{reporte.meta.ref}</code></li>
                <li>🧫 <code>{reporte.meta.id}</code> · {reporte.meta.tipo_unidad}</li>
                <li>📦 Disponible: <strong>{reporte.meta.disponible}</strong> / {reporte.meta.cantidad}</li>
                <li>🩺 Estado: <strong>{reporte.meta.estado}</strong>{reporte.meta.fecha_agotamiento ? ` (agotada: ${new Date(reporte.meta.fecha_agotamiento?.seconds ? reporte.meta.fecha_agotamiento.seconds * 1000 : reporte.meta.fecha_agotamiento).toLocaleDateString()})` : ''}</li>
                <li>💧 por_volumen: <strong>{String(reporte.meta.por_volumen)}</strong> · vol/u: {reporte.meta.volumen_por_unidad_ml ?? '—'}</li>
              </ul>
              <h3>Cambios a aplicar:</h3>
              <ul>
                {reporte.cambios.map(c => (
                  <li key={c.campo}>
                    <code>{c.campo}</code>: {String(c.de)} → <strong>{String(c.a)}</strong>
                  </li>
                ))}
              </ul>
              {reporte.candidatos.length > 0 && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <strong>⚠️ Otros frascos sin por_volumen (NO se tocan):</strong>
                  <ul>
                    {reporte.candidatos.map(c => (
                      <li key={c.id}>
                        <code>{c.id}</code> ({c.tipo_unidad}) · disp: {c.disponible} · <code>{c.ref}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {reporte.cambios.length === 0 ? (
                <p style={{ marginTop: '0.75rem', color: '#4ddb9c', fontWeight: 600 }}>✅ Ya migrada y consistente. No hay cambios que aplicar.</p>
              ) : !confirmar ? (
                <button
                  onClick={() => setConfirmar(true)}
                  style={{ padding: '12px 24px', backgroundColor: '#d32f2f', color: 'white',
                    border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', marginTop: '12px' }}
                >
                  Aplicar migración…
                </button>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <p><strong>⚠️ ¿Seguro?</strong> Esta acción es irreversible.</p>
                  <button
                    onClick={ejecutar}
                    style={{ padding: '12px 24px', backgroundColor: '#d32f2f', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
                  >
                    Sí, aplicar migración
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

      {estado === 'ejecutando' && <p>⏳ Ejecutando migración...</p>}

      {estado === 'completado' && resultado && (
        <div>
          <p>✅ Migración completada</p>
          <ul>
            <li>Migrada: <code>{resultado.migrada}</code></li>
            <li>Ref: <code>{resultado.ref}</code></li>
            {resultado.candidatosPendientes.length > 0 && (
              <li>Frasco(s) sin migrar (requieren confirmación): {resultado.candidatosPendientes.join(', ')}</li>
            )}
          </ul>
          <button onClick={() => { setEstado('idle'); setReporte(null); setConfirmar(false); setResultado(null); }}
            style={{ padding: '10px 20px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '12px' }}>
            Volver a analizar
          </button>
        </div>
      )}

      <div style={{ marginTop: '2.5rem', padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: '10px' }}>
        <h2>Migración masiva (resto de frascos)</h2>
        <p>
          Convierte todos los frascos listados que sigan en el modelo viejo (<code>por_volumen: false</code>):
          <code>cantidad = cantidad × vol/u</code> y <code>disponible = disponible × vol/u</code> (ml iniciales y restantes),
          <code>vol/u = 1</code>, <code>por_volumen = true</code>.
          <br />
          Los frascos con <code>disponible &lt; 0</code> o sin <code>vol/u</code> <strong>no se tocan</strong> (se listan para revisión manual).
        </p>

        {masiva === null && (
          <button onClick={analizarM}
            style={{ padding: '10px 20px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            🔍 Previsualizar migración masiva (no modifica nada)
          </button>
        )}
        {masiva === 'analizando' && <p>⏳ Analizando...</p>}

        {masiva === 'analizada' && reporteMasiva && (
          <div>
            <p>Frascos a migrar: <strong>{reporteMasiva.aMigrar.length}</strong> · a revisar manualmente: <strong>{reporteMasiva.aRevisar.length}</strong></p>
            {reporteMasiva.aMigrar.length > 0 && (
              <div style={{ maxHeight: '240px', overflow: 'auto', marginBottom: '0.75rem' }}>
                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}>id_bolsa</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}>de</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}>→ a (ml)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteMasiva.aMigrar.map(f => (
                      <tr key={f.id}>
                        <td style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}><code>{f.id}</code></td>
                        <td style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}>{f.cantidad} × {f.volumen_por_unidad_ml} ml · disp {f.disponible}</td>
                        <td style={{ borderBottom: '1px solid var(--border-color)', padding: '4px' }}>{f.disponibleNuevo}/{f.cantidadInicial} ml</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {reporteMasiva.aRevisar.length > 0 && (
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(255,200,0,0.06)', border: '1px solid #FF9800', borderRadius: '8px' }}>
                <strong>⚠️ Revisión manual (no se tocan):</strong>
                <ul>
                  {reporteMasiva.aRevisar.map(f => (
                    <li key={f.id}>
                      <code>{f.id}</code> · {f.flag === 'DISPO_NEGATIVO' ? `disponible negativo (${f.disponible})` : 'sin vol/u definido'} · <code>{f.ref}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!confirmarMasiva ? (
              <button onClick={() => setConfirmarMasiva(true)}
                style={{ padding: '10px 20px', backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                Migrar todos los frascos listados…
              </button>
            ) : (
              <div style={{ marginTop: '0.5rem' }}>
                <p><strong>⚠️ ¿Seguro?</strong> Se actualizarán {reporteMasiva.aMigrar.length} frascos. Irreversible.</p>
                <button onClick={ejecutarM}
                  style={{ padding: '10px 20px', backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Sí, migrar {reporteMasiva.aMigrar.length} frascos
                </button>{' '}
                <button onClick={() => setConfirmarMasiva(false)}
                  style={{ padding: '10px 20px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {masiva === 'ejecutando' && <p>⏳ Ejecutando migración masiva...</p>}

        {masiva === 'completada' && resultadoMasiva && (
          <div>
            <p>✅ Migración masiva completada: <strong>{resultadoMasiva.migradas}</strong> frascos convertidos.</p>
            {resultadoMasiva.aRevisar.length > 0 && (
              <p>🔍 Pendientes de revisión manual: {resultadoMasiva.aRevisar.map(r => `${r.id} (${r.flag})`).join(', ')}</p>
            )}
            <button onClick={() => { setMasiva(null); setReporteMasiva(null); setConfirmarMasiva(false); setResultadoMasiva(null); }}
              style={{ padding: '10px 20px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '12px' }}>
              Volver a previsualizar
            </button>
          </div>
        )}

        {masiva === 'error' && (
          <div>
            <p>❌ Error: {errorMasiva}</p>
            <button onClick={() => setMasiva(null)}
              style={{ padding: '10px 20px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Reintentar
            </button>
          </div>
        )}
      </div>

      {estado === 'error' && (
        <div>
          <p>❌ Error: {error}</p>
          <button onClick={() => setEstado('idle')}
            style={{ padding: '10px 20px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}