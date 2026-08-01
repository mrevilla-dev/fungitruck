/**
 * CriopreservacionNuevaPage.jsx
 * Bloque 3 — Wizard de 3 pasos para registrar evento + crioviales
 * FungiTrack · 2026
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { crearEventoCriopreservacion, crearCrioviales } from '../services/criobancService';
import PrintLabelsModal from '../components/PrintLabelsModal';

const TODAY = new Date().toISOString().split('T')[0];

const VOLUMENES = ['2', '5'];
const SOPORTES = ['semillas', 'perlita', 'agar', 'liquido'];
const TEMPERATURAS = ['4°C', '-20°C', '-80°C', '-196°C (N₂ líquido)'];
const MODOS_UBICACION = ['rack', 'libre'];

const defaultCriovial = (idx, globals) => ({
  letra: String.fromCharCode(65 + idx),
  volumen_ml: globals.volumen_ml,
  soporte: globals.soporte,
  medio_criopreservacion: globals.medio_criopreservacion,
  temperatura_almacenamiento: globals.temperatura_almacenamiento,
  fecha: globals.fecha,
  ubicacion: {
    modo: 'libre',
    equipo: '',
    contenedor: '',
    sub_contenedor: '',
    posicion: '',
  },
  notas: '',
});

export default function CriopreservacionNuevaPage() {
  const { batchId, ejemplarId } = useParams();
  const navigate = useNavigate();
  const auth = getAuth();

  // ── Estado del wizard ─────────────────────────────────────────────────────
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [batchesToPrint, setBatchesToPrint] = useState(null);

  // Datos del origen (batch o ejemplar)
  const [origen, setOrigen] = useState(null); // { genero, especie, cepa, ejemplar_id, batch_origen_id }

  // Paso 1 — Datos del evento
  const [evento, setEvento] = useState({
    fecha: TODAY,
    operario: auth.currentUser?.email ?? '',
    protocolo_url: '',
    notas: '',
  });

  // Paso 2 — Controles globales + filas
  const [globals, setGlobals] = useState({
    volumen_ml: '2',
    soporte: 'semillas',
    medio_criopreservacion: '',
    temperatura_almacenamiento: '-80°C',
    fecha: TODAY,
    cantidad: 1,
  });
  const [filas, setFilas] = useState([]);

  // ── Carga de datos del origen ─────────────────────────────────────────────
  useEffect(() => {
    async function cargar() {
      setLoading(true);
      setError('');
      try {
        if (batchId) {
          const snap = await getDoc(doc(db, 'batches', batchId));
          if (snap.exists()) {
            const d = snap.data();
            setOrigen({
              genero: d.genero ?? '',
              especie: d.especie ?? '',
              cepa: d.cepa ?? d.codigo_cepa ?? '',
              ejemplar_id: d.ejemplar_id ?? null,
              batch_origen_id: snap.id,
            });
          } else {
            setOrigen({ genero: '', especie: '', cepa: '', ejemplar_id: null, batch_origen_id: batchId });
          }
        } else if (ejemplarId) {
          const snap = await getDoc(doc(db, 'ejemplares', ejemplarId));
          if (snap.exists()) {
            const d = snap.data();
            setOrigen({
              genero: d.genero ?? '',
              especie: d.especie ?? '',
              cepa: d.codigo_cepa ?? d.cepa ?? '',
              ejemplar_id: snap.id,
              batch_origen_id: null,
            });
          } else {
            setOrigen({ genero: '', especie: '', cepa: '', ejemplar_id: ejemplarId, batch_origen_id: null });
          }
        }
      } catch (e) {
        setError('No se pudo cargar el origen: ' + (e?.message ?? 'Error desconocido'));
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, [batchId, ejemplarId]);

  // ── Paso 2: generar filas ─────────────────────────────────────────────────
  const generarFilas = () => {
    const n = Math.max(1, Math.min(26, parseInt(globals.cantidad) || 1));
    const nuevas = Array.from({ length: n }, (_, i) => defaultCriovial(i, globals));
    setFilas(nuevas);
  };

  const actualizarFila = (idx, campo, valor) => {
    setFilas(prev => {
      const copia = [...prev];
      if (campo.startsWith('ubicacion.')) {
        const subCampo = campo.replace('ubicacion.', '');
        copia[idx] = { ...copia[idx], ubicacion: { ...copia[idx].ubicacion, [subCampo]: valor } };
      } else {
        copia[idx] = { ...copia[idx], [campo]: valor };
      }
      return copia;
    });
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleConfirmar = async () => {
    if (!origen) { setError('No hay origen cargado'); return; }
    if (filas.length === 0) { setError('Generá al menos un criovial'); return; }

    setSaving(true);
    setError('');
    try {
      const eventoId = await crearEventoCriopreservacion({
        batch_origen_id: origen.batch_origen_id ?? null,
        ejemplar_id: origen.ejemplar_id ?? null,
        genero: origen.genero,
        especie: origen.especie,
        cepa: origen.cepa,
        fecha: evento.fecha,
        operario: evento.operario,
        protocolo_url: evento.protocolo_url,
        notas: evento.notas,
      });

      const criovialIds = await crearCrioviales(eventoId, filas, {
        ejemplar_id: origen.ejemplar_id ?? null,
        genero: origen.genero,
        especie: origen.especie,
        cepa: origen.cepa,
      });

      const printBatches = criovialIds.map((id, i) => {
        const fila = filas[i];
        return {
          id,
          alias: `${origen.genero} ${origen.especie}`.trim(),
          especie: `${origen.genero} ${origen.especie}`.trim(),
          fecha: evento.fecha || new Date().toISOString().split('T')[0],
          operario: evento.operario || 'Sistema',
          nombre_receta: fila?.medio_criopreservacion || globals.medio_criopreservacion || 'Medio de Criopreservación',
          tipo_uso: 'Criovial',
          tipo_etiqueta: 'MICRO_TUBOS',
          tipo_inoculacion: 'criopreservacion'
        };
      });

      setBatchesToPrint(printBatches);
    } catch (e) {
      // Si el batch falla: toast de error, NO resetear el formulario
      setError('Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // ── Resumen para paso 3 ───────────────────────────────────────────────────
  const resumenPorTemperatura = filas.reduce((acc, f) => {
    const t = f.temperatura_almacenamiento || 'Sin especificar';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        🔄 Cargando datos del origen...
      </div>
    );
  }

  if (batchesToPrint) {
    return (
      <PrintLabelsModal
        batches={batchesToPrint}
        usuarioActivo={evento.operario || 'Sistema'}
        onClose={() => {
          setBatchesToPrint(null);
          navigate('/criobanco');
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '4rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Criobanco
        </p>
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.75rem', fontWeight: '800' }}>
          🧊 Nueva Criopreservación
        </h1>
        {origen && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {origen.genero} {origen.especie} {origen.cepa ? `· Cepa: ${origen.cepa}` : ''}
            {batchId ? ` · Batch: ${batchId}` : ''}
            {ejemplarId ? ` · Ejemplar: ${ejemplarId}` : ''}
          </p>
        )}
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', alignItems: 'center' }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '700', fontSize: '0.85rem',
              background: paso >= n ? 'var(--primary-color)' : 'var(--border-color)',
              color: paso >= n ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}>
              {n}
            </div>
            <span style={{ fontSize: '0.8rem', color: paso === n ? 'var(--text-color)' : 'var(--text-secondary)', fontWeight: paso === n ? '700' : '400' }}>
              {n === 1 ? 'Datos del evento' : n === 2 ? 'Crioviales' : 'Confirmar'}
            </span>
            {n < 3 && <span style={{ color: 'var(--border-color)', margin: '0 0.25rem' }}>›</span>}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger-color)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: 'var(--danger-color)', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ═══ PASO 1 ═══════════════════════════════════════════════════════ */}
      {paso === 1 && (
        <div className="card" style={{ padding: '2rem' }}>
          <h3 style={{ marginTop: 0 }}>Paso 1 — Datos del evento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div>
              <label className="form-label">Fecha *</label>
              <input
                id="crionueva-fecha-evento"
                type="date"
                className="form-control"
                value={evento.fecha}
                onChange={e => setEvento(prev => ({ ...prev, fecha: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Operario *</label>
              <input
                id="crionueva-operario"
                type="text"
                className="form-control"
                value={evento.operario}
                onChange={e => setEvento(prev => ({ ...prev, operario: e.target.value }))}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">URL de Protocolo (opcional)</label>
              <input
                id="crionueva-protocolo-url"
                type="url"
                className="form-control"
                placeholder="https://..."
                value={evento.protocolo_url}
                onChange={e => setEvento(prev => ({ ...prev, protocolo_url: e.target.value }))}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notas (opcional)</label>
              <textarea
                id="crionueva-notas-evento"
                className="form-control"
                rows={3}
                value={evento.notas}
                onChange={e => setEvento(prev => ({ ...prev, notas: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button
              id="crionueva-btn-siguiente-1"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0.75rem 2rem' }}
              onClick={() => {
                if (!evento.fecha || !evento.operario) { setError('Fecha y operario son obligatorios'); return; }
                setError('');
                setPaso(2);
              }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ═══ PASO 2 ═══════════════════════════════════════════════════════ */}
      {paso === 2 && (
        <div>
          {/* Controles globales */}
          <div className="card" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Paso 2 — Definir lote de crioviales</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Configurá los valores globales y presioná "Generar filas". Luego podés editar cada criovial individualmente.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label className="form-label">Volumen (ml)</label>
                <select id="crionueva-volumen" className="form-control" value={globals.volumen_ml} onChange={e => setGlobals(p => ({ ...p, volumen_ml: e.target.value }))}>
                  {VOLUMENES.map(v => <option key={v} value={v}>{v} ml</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Soporte</label>
                <select id="crionueva-soporte" className="form-control" value={globals.soporte} onChange={e => setGlobals(p => ({ ...p, soporte: e.target.value }))}>
                  {SOPORTES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Temperatura</label>
                <select id="crionueva-temperatura" className="form-control" value={globals.temperatura_almacenamiento} onChange={e => setGlobals(p => ({ ...p, temperatura_almacenamiento: e.target.value }))}>
                  {TEMPERATURAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Cantidad</label>
                <input
                  id="crionueva-cantidad"
                  type="number"
                  className="form-control"
                  min={1} max={26}
                  value={globals.cantidad}
                  onChange={e => setGlobals(p => ({ ...p, cantidad: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label className="form-label">&nbsp;</label>
                <button
                  id="crionueva-btn-generar"
                  className="btn btn-outline"
                  style={{ width: 'auto' }}
                  onClick={generarFilas}
                >
                  ⚡ Generar filas
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">Medio de criopreservación (opcional)</label>
              <input
                id="crionueva-medio"
                type="text"
                className="form-control"
                placeholder="Ej: Glicerol 15%, DMSO 10%..."
                value={globals.medio_criopreservacion}
                onChange={e => setGlobals(p => ({ ...p, medio_criopreservacion: e.target.value }))}
              />
            </div>
          </div>

          {/* Tabla de filas editables */}
          {filas.length > 0 && (
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
              <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Crioviales generados ({filas.length})</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '3rem' }}>ID</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Vol.</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Soporte</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Temperatura</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Modo</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Equipo</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Contenedor</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Posición</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila, idx) => (
                    <tr key={fila.letra} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: '700', color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                        ...{fila.letra}
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <select
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '60px' }}
                          value={fila.volumen_ml}
                          onChange={e => actualizarFila(idx, 'volumen_ml', e.target.value)}
                        >
                          {VOLUMENES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <select
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '80px' }}
                          value={fila.soporte}
                          onChange={e => actualizarFila(idx, 'soporte', e.target.value)}
                        >
                          {SOPORTES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <select
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '110px' }}
                          value={fila.temperatura_almacenamiento}
                          onChange={e => actualizarFila(idx, 'temperatura_almacenamiento', e.target.value)}
                        >
                          {TEMPERATURAS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <select
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '70px' }}
                          value={fila.ubicacion.modo}
                          onChange={e => actualizarFila(idx, 'ubicacion.modo', e.target.value)}
                        >
                          {MODOS_UBICACION.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '100px' }}
                          placeholder="Ej: Freezer -80°C"
                          value={fila.ubicacion.equipo}
                          onChange={e => actualizarFila(idx, 'ubicacion.equipo', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '100px' }}
                          placeholder="Ej: Caja 4"
                          value={fila.ubicacion.contenedor}
                          onChange={e => actualizarFila(idx, 'ubicacion.contenedor', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '70px' }}
                          placeholder="Ej: C2"
                          value={fila.ubicacion.posicion}
                          onChange={e => actualizarFila(idx, 'ubicacion.posicion', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ padding: '0.25rem', fontSize: '0.8rem', minWidth: '100px' }}
                          value={fila.notas}
                          onChange={e => actualizarFila(idx, 'notas', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <button
              id="crionueva-btn-anterior-2"
              className="btn btn-outline"
              style={{ width: 'auto', padding: '0.75rem 2rem' }}
              onClick={() => { setError(''); setPaso(1); }}
            >
              ← Anterior
            </button>
            <button
              id="crionueva-btn-siguiente-2"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0.75rem 2rem' }}
              onClick={() => {
                if (filas.length === 0) { setError('Generá al menos un criovial con el botón "Generar filas"'); return; }
                setError('');
                setPaso(3);
              }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ═══ PASO 3 ═══════════════════════════════════════════════════════ */}
      {paso === 3 && (
        <div>
          <div className="card" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Paso 3 — Confirmación</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Datos del evento */}
              <div>
                <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                  Evento de criopreservación
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                  <span>📅 Fecha: <strong>{evento.fecha}</strong></span>
                  <span>👤 Operario: <strong>{evento.operario}</strong></span>
                  {evento.protocolo_url && <span>🔗 Protocolo: <a href={evento.protocolo_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)' }}>Ver</a></span>}
                  {evento.notas && <span>📝 Notas: {evento.notas}</span>}
                </div>
              </div>

              {/* Origen */}
              <div>
                <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                  Organismo origen
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem' }}>
                  <span>🍄 {origen?.genero} {origen?.especie} {origen?.cepa && `(${origen.cepa})`}</span>
                  {batchId && <span>📦 Batch: <strong style={{ fontFamily: 'monospace' }}>{batchId}</strong></span>}
                  {ejemplarId && <span>🧬 Ejemplar: <strong style={{ fontFamily: 'monospace' }}>{ejemplarId}</strong></span>}
                </div>
              </div>
            </div>

            {/* Resumen crioviales */}
            <div style={{ background: 'var(--surface-color)', borderRadius: '8px', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Crioviales a crear: <span style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}>{filas.length}</span>
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Object.entries(resumenPorTemperatura).map(([temp, count]) => (
                  <span key={temp} style={{
                    fontSize: '0.8rem', padding: '4px 12px', borderRadius: '20px',
                    background: 'var(--primary-color)20', color: 'var(--primary-color)', fontWeight: '700'
                  }}>
                    {temp}: {count} vial{count > 1 ? 'es' : ''}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {filas.map(f => (
                  <span key={f.letra} style={{
                    fontSize: '0.75rem', padding: '3px 10px', borderRadius: '12px',
                    background: 'var(--border-color)', color: 'var(--text-secondary)', fontFamily: 'monospace'
                  }}>
                    ...{f.letra} · {f.soporte} · {f.volumen_ml}ml
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <button
              id="crionueva-btn-anterior-3"
              className="btn btn-outline"
              style={{ width: 'auto', padding: '0.75rem 2rem' }}
              onClick={() => { setError(''); setPaso(2); }}
              disabled={saving}
            >
              ← Anterior
            </button>
            <button
              id="crionueva-btn-confirmar"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0.75rem 2.5rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
              onClick={handleConfirmar}
              disabled={saving}
            >
              {saving ? '⏳ Guardando...' : '✅ Confirmar y crear'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
