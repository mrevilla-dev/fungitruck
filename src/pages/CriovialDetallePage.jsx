import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCriovialById, registrarMovimientoCriovial } from '../services/criobancService';
import toast from 'react-hot-toast';

const ESTADO_CONFIG = {
  'Criopreservado':     { color: '#10b981', badge: '🟢', bg: '#10b98120' },
  'Parcialmente usado': { color: '#f59e0b', badge: '🟡', bg: '#f59e0b20' },
  'Agotado':            { color: '#ef4444', badge: '🔴', bg: '#ef444420' },
};

export default function CriovialDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [criovial, setCriovial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de movimiento state
  const [modalAbierto, setModalAbierto] = useState(false);
  const [movData, setMovData] = useState({
    modo: 'rack', // o 'libre'
    equipo: '',
    contenedor: '',
    sub_contenedor: '',
    posicion: '',
    motivo: '',
    operario: '' // Opcionalmente podríamos sacarlo de un auth context
  });
  const [moviendo, setMoviendo] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [id]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const data = await getCriovialById(id);
      setCriovial(data);
      if (data.ubicacion_actual) {
        setMovData(prev => ({
          ...prev,
          modo: data.ubicacion_actual.modo || 'rack',
          equipo: data.ubicacion_actual.equipo || '',
          contenedor: data.ubicacion_actual.contenedor || '',
          sub_contenedor: data.ubicacion_actual.sub_contenedor || '',
          posicion: data.ubicacion_actual.posicion || ''
        }));
      }
    } catch (err) {
      setError(err.message || 'Error al cargar el criovial');
    } finally {
      setLoading(false);
    }
  };

  const handleMover = async (e) => {
    e.preventDefault();
    if (!movData.equipo || !movData.contenedor) {
      toast('Equipo y contenedor son obligatorios');
      return;
    }
    
    setMoviendo(true);
    try {
      const nuevaUbicacion = {
        modo: movData.modo,
        equipo: movData.equipo,
        contenedor: movData.contenedor,
        sub_contenedor: movData.sub_contenedor || null,
        posicion: movData.posicion || null,
        dimensiones: criovial.ubicacion_actual?.dimensiones || { filas: 6, columnas: 6 } // preservamos si existen
      };

      await registrarMovimientoCriovial(id, nuevaUbicacion, movData.motivo, movData.operario);
      
      setModalAbierto(false);
      setMovData(prev => ({...prev, motivo: '', operario: ''})); // reset form fields
      await cargarDatos(); // recargar
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar movimiento: ' + err.message);
    } finally {
      setMoviendo(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>🔄 Cargando datos del criovial...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>⚠️ {error}</div>;
  if (!criovial) return null;

  const cfg = ESTADO_CONFIG[criovial.estado] || { color: '#666', badge: '⚪', bg: '#f3f4f6' };
  const ubi = criovial.ubicacion_actual || {};
  const historial = criovial.historial_ubicaciones || [];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem', position: 'relative' }}>
      
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button className="btn btn-outline" onClick={() => navigate('/criobanco')} style={{ marginBottom: '1rem', width: 'auto' }}>
            ← Volver al Criobanco
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ margin: 0, fontFamily: 'monospace', fontSize: '2.5rem' }}>{id}</h1>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold',
              background: cfg.bg, color: cfg.color
            }}>
              {cfg.badge} {criovial.estado}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={() => window.print()} title="Imprime la pantalla completa o usa el modal global si estuviera conectado">
            🖨️ Imprimir Etiqueta
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* ── INFO BIOLÓGICA & ORIGEN ── */}
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>🍄 Información Biológica</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Género:</strong><br/>
              {criovial.genero || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Especie:</strong><br/>
              {criovial.especie || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Cepa:</strong><br/>
              {criovial.cepa || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Ploidía:</strong><br/>
              {criovial.ploidia || '—'}
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Origen:</strong><br/>
            {criovial.batch_origen ? (
              <button 
                className="btn-icon" 
                style={{ color: 'var(--primary-color)', width: 'auto', padding: '0.2rem 0', fontWeight: 'bold', textDecoration: 'underline' }}
                onClick={() => navigate(`/arbol/batch/${criovial.batch_origen}`)}
              >
                Batch: {criovial.batch_origen}
              </button>
            ) : criovial.ejemplar_origen ? (
              <button 
                className="btn-icon" 
                style={{ color: 'var(--primary-color)', width: 'auto', padding: '0.2rem 0', fontWeight: 'bold', textDecoration: 'underline' }}
                onClick={() => navigate(`/arbol/ejemplar/${criovial.ejemplar_origen}`)}
              >
                Ejemplar: {criovial.ejemplar_origen}
              </button>
            ) : 'Desconocido'}
          </div>
        </div>

        {/* ── SOPORTE & PROTOCOLO ── */}
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>🧪 Soporte y Protocolo</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Soporte:</strong><br/>
              {criovial.soporte || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Volumen (ml):</strong><br/>
              {criovial.volumen_ml || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Medio:</strong><br/>
              {criovial.medio || '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Temp. de Almacén:</strong><br/>
              {criovial.temperatura_almacenamiento || '—'}
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
             <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Fecha Criopreservación:</strong><br/>
              {criovial.fecha_criopreservacion || '—'}
            </div>
             <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Operario:</strong><br/>
              {criovial.operario || '—'}
            </div>
          </div>
        </div>

        {/* ── UBICACIÓN ACTUAL ── */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>📍 Ubicación Física</h3>
            <button className="btn btn-outline" style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setModalAbierto(true)}>
              🔄 Mover
            </button>
          </div>
          {ubi.equipo ? (
            <div style={{ display: 'grid', gap: '0.8rem', fontSize: '0.9rem' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Equipo:</strong> {ubi.equipo}</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Contenedor:</strong> {ubi.contenedor}</div>
              {ubi.sub_contenedor && <div><strong style={{ color: 'var(--text-secondary)' }}>Sub-contenedor:</strong> {ubi.sub_contenedor}</div>}
              {ubi.posicion && <div><strong style={{ color: 'var(--text-secondary)' }}>Posición:</strong> {ubi.posicion}</div>}
              <div><strong style={{ color: 'var(--text-secondary)' }}>Modo:</strong> {ubi.modo?.toUpperCase()}</div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '1rem 0' }}>Sin ubicación física registrada</div>
          )}
        </div>
      </div>

      {/* ── DESCONGELACIÓN CARD ── */}
      {(criovial.estado === 'Agotado' || criovial.estado === 'Parcialmente usado') && criovial.descongelacion && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ marginTop: 0 }}>🌡️ Última Descongelación</h3>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Fecha:</strong> {criovial.descongelacion.fecha}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Motivo:</strong> {criovial.descongelacion.motivo}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Operario:</strong> {criovial.descongelacion.operario}</div>
            {criovial.descongelacion.nuevo_lote && (
               <div><strong style={{ color: 'var(--text-secondary)' }}>Lote Generado:</strong> {criovial.descongelacion.nuevo_lote}</div>
            )}
          </div>
        </div>
      )}

      {criovial.estado === 'Criopreservado' && (
        <div className="card" style={{ marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px dashed #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#d97706' }}>Acción de Descongelación</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>El criovial está activo. Puedes registrar un evento de uso parcial o total.</p>
          </div>
          <button className="btn" style={{ background: '#f59e0b', color: '#fff', border: 'none', width: 'auto' }} onClick={() => navigate(`/criobanco/criovial/${id}/descongelar`)}>
            🌡️ Registrar Descongelación
          </button>
        </div>
      )}

      {/* ── HISTORIAL DE UBICACIONES ── */}
      <div className="card">
        <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>📜 Historial de Ubicaciones</h3>
        {historial.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No hay movimientos registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {/* Sort descending by timestamp or date string if timestamp missing */}
            {[...historial].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).map((mov, idx) => (
              <div key={idx} style={{ 
                padding: '1rem', 
                background: 'var(--background-color)', 
                borderRadius: '8px', 
                borderLeft: '3px solid var(--primary-color)',
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1fr',
                gap: '1rem',
                fontSize: '0.85rem'
              }}>
                <div>
                  <strong style={{ color: 'var(--text-color)' }}>{mov.fecha}</strong><br/>
                  <span style={{ color: 'var(--text-secondary)' }}>Por: {mov.operario}</span>
                </div>
                
                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Desde:</strong><br/>
                  {mov.ubicacion_anterior ? (
                    `${mov.ubicacion_anterior.equipo} > ${mov.ubicacion_anterior.contenedor}${mov.ubicacion_anterior.sub_contenedor ? ` > ${mov.ubicacion_anterior.sub_contenedor}` : ''}${mov.ubicacion_anterior.posicion ? ` [Pos: ${mov.ubicacion_anterior.posicion}]` : ''}`
                  ) : 'Creación Inicial'}
                </div>

                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Hacia:</strong><br/>
                  {`${mov.ubicacion_nueva?.equipo} > ${mov.ubicacion_nueva?.contenedor}${mov.ubicacion_nueva?.sub_contenedor ? ` > ${mov.ubicacion_nueva?.sub_contenedor}` : ''}${mov.ubicacion_nueva?.posicion ? ` [Pos: ${mov.ubicacion_nueva?.posicion}]` : ''}`}<br/>
                  <i style={{ color: 'var(--text-secondary)' }}>Motivo: {mov.motivo}</i>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL DE MOVIMIENTO ── */}
      {modalAbierto && (
        <div className="modal-overlay" onClick={() => !moviendo && setModalAbierto(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0 }}>Mover Criovial</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Registra el cambio de ubicación física del criovial <strong>{id}</strong>.
            </p>

            <form onSubmit={handleMover}>
              <div className="form-group">
                <label className="form-label">Modo</label>
                <select className="form-control" value={movData.modo} onChange={e => setMovData({...movData, modo: e.target.value})}>
                  <option value="rack">Rack (Cuadrícula)</option>
                  <option value="libre">Libre (Bolsas/Tupper sin posición exacta)</option>
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Equipo (*)</label>
                  <input required className="form-control" type="text" value={movData.equipo} onChange={e => setMovData({...movData, equipo: e.target.value})} placeholder="Ej: Freezer -80°C" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contenedor (*)</label>
                  <input required className="form-control" type="text" value={movData.contenedor} onChange={e => setMovData({...movData, contenedor: e.target.value})} placeholder="Ej: Rack A" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Sub-contenedor</label>
                  <input className="form-control" type="text" value={movData.sub_contenedor} onChange={e => setMovData({...movData, sub_contenedor: e.target.value})} placeholder="Opcional" />
                </div>
                {movData.modo === 'rack' && (
                  <div className="form-group">
                    <label className="form-label">Posición</label>
                    <input className="form-control" type="text" value={movData.posicion} onChange={e => setMovData({...movData, posicion: e.target.value})} placeholder="Ej: 12, A1" />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Motivo de Movimiento (*)</label>
                <input required className="form-control" type="text" value={movData.motivo} onChange={e => setMovData({...movData, motivo: e.target.value})} placeholder="Ej: Reorganización de rack" />
              </div>

              <div className="form-group">
                <label className="form-label">Operario (*)</label>
                <input required className="form-control" type="text" value={movData.operario} onChange={e => setMovData({...movData, operario: e.target.value})} placeholder="Nombre" />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setModalAbierto(false)} disabled={moviendo}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={moviendo}>
                  {moviendo ? 'Registrando...' : 'Confirmar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
