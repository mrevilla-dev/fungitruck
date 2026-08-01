import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getEquipo, 
  getMantenimientosDeEquipo, 
  actualizarEstadoOperativo, 
  moverEquipoASala,
  actualizarEquipo
} from '../services/equipoService';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import EquipoFormModal from '../components/EquipoFormModal';
import ReparacionFormModal from '../components/ReparacionFormModal';
import CalibracionFormModal from '../components/CalibracionFormModal';

const ESTADO_CONFIG = {
  'Operativo': { badge: '🟢', color: '#10b981' },
  'En mantenimiento': { badge: '🟡', color: '#f59e0b' },
  'Fuera de servicio': { badge: '🔴', color: '#ef4444' },
};

export default function EquipoDetallePage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [equipo, setEquipo] = useState(null);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [modalEditar, setModalEditar] = useState(false);
  const [modalReparacion, setModalReparacion] = useState(false);
  const [modalCalibracion, setModalCalibracion] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [id]);

  async function cargarDatos() {
    setCargando(true);
    try {
      const eq = await getEquipo(id);
      if (!eq) {
        toast.error('Equipo no encontrado');
        navigate('/equipos');
        return;
      }
      setEquipo(eq);

      const mants = await getMantenimientosDeEquipo(id);
      setMantenimientos(mants);

      const snapSalas = await getDocs(query(collection(db, 'salas'), orderBy('nombre')));
      setSalas(snapSalas.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  async function handleCambiarEstado(e) {
    const nuevoEstado = e.target.value;
    try {
      await actualizarEstadoOperativo(id, nuevoEstado);
      setEquipo(prev => ({ ...prev, estado_operativo: nuevoEstado }));
    } catch (err) {
      toast.error('Error al cambiar el estado');
    }
  }

  async function handleCambiarSala(e) {
    const nuevaSala = e.target.value;
    try {
      await moverEquipoASala(id, nuevaSala);
      setEquipo(prev => ({ ...prev, sala_actual_id: nuevaSala }));
    } catch (err) {
      toast.error('Error al mover de sala');
    }
  }

  async function handleGuardarEquipo(datos) {
    try {
      await actualizarEquipo(id, datos);
      setModalEditar(false);
      cargarDatos();
    } catch (err) {
      toast.error('Error al editar');
    }
  }

  function getEstadoConfig(estado) {
    return ESTADO_CONFIG[estado] || { badge: '⚪', color: '#94a3b8' };
  }

  if (cargando) return (
    <div className="page-container">
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>🔄 Cargando equipo...</div>
    </div>
  );
  if (!equipo) return null;

  const depreciacion = (equipo.valor_compra || 0) - (equipo.valor_residual || 0);
  const ec = getEstadoConfig(equipo.estado_operativo);

  return (
    <div className="page-container animate-fade-in">
      <button className="btn btn-outline" onClick={() => navigate('/equipos')} style={{ marginBottom: '1.25rem', width: 'auto' }}>
        ← Volver a Equipos
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* PANEL IZQUIERDO - FICHA TÉCNICA */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{equipo.nombre}</h2>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px', background: `${ec.color}22`, color: ec.color, border: `1px solid ${ec.color}44`, fontWeight: 'bold' }}>
              {ec.badge} {equipo.estado_operativo}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Cambiar Estado:</label>
              <select className="form-control" value={equipo.estado_operativo} onChange={handleCambiarEstado}>
                <option value="Operativo">Operativo</option>
                <option value="En mantenimiento">En mantenimiento</option>
                <option value="Fuera de servicio">Fuera de servicio</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Ubicación actual:</label>
              <select className="form-control" value={equipo.sala_actual_id || ''} onChange={handleCambiarSala}>
                <option value="">-- Sin asignar --</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginBottom: '1rem' }}>
            <span className="label-id">{equipo.id || id}</span>
          </div>

          <div className="grid-2" style={{ fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Categoría:</strong> {equipo.categoria}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Marca/Modelo:</strong> {equipo.marca_modelo || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Serie:</strong> {equipo.nro_serie || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Propietario:</strong> {equipo.propietario}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Adquisición:</strong> {equipo.fecha_adquisicion || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Vida útil (años):</strong> {equipo.vida_util_anios || 'N/A'}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Valor Compra:</strong> ${equipo.valor_compra}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Valor Residual:</strong> ${equipo.valor_residual}</p>
            <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Depreciación:</strong> ${depreciacion}</p>
          </div>

          {['Incubación', 'Refrigeración', 'Freezer'].includes(equipo.categoria) && equipo.parametros_ideales && (
            <div style={{ marginTop: '1.25rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.75rem' }}>Parámetros Ideales</h4>
              <div className="grid-2" style={{ fontSize: '0.85rem' }}>
                <p style={{ margin: 0 }}>Temp Mín: <strong>{equipo.parametros_ideales.temp_min ?? 'N/A'} °C</strong></p>
                <p style={{ margin: 0 }}>Temp Máx: <strong>{equipo.parametros_ideales.temp_max ?? 'N/A'} °C</strong></p>
                <p style={{ margin: 0 }}>Hum Mín: <strong>{equipo.parametros_ideales.hum_min ?? 'N/A'} %</strong></p>
                <p style={{ margin: 0 }}>Hum Máx: <strong>{equipo.parametros_ideales.hum_max ?? 'N/A'} %</strong></p>
              </div>
            </div>
          )}

          {equipo.foto_url && (
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <img src={equipo.foto_url} alt="Equipo" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '12px' }} />
            </div>
          )}

          {equipo.notas && (
            <div style={{ marginTop: '1.25rem', fontSize: '0.9rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Notas:</strong> {equipo.notas}
            </div>
          )}

          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn btn-outline" onClick={() => setModalEditar(true)} style={{ width: '100%' }}>
              ✏️ Editar Ficha
            </button>
          </div>
        </div>

        {/* PANEL DERECHO - HISTORIAL DE MANTENIMIENTO */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 1.25rem' }}>Historial de Intervenciones</h3>
          
          <div className="flex-gap" style={{ marginBottom: '1.25rem' }}>
            <button className="btn btn-primary" onClick={() => setModalReparacion(true)} style={{ flex: 1 }}>
              🔧 Registrar Reparación
            </button>
            <button className="btn btn-outline" onClick={() => setModalCalibracion(true)} style={{ flex: 1, color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}>
              📐 Registrar Calibración
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', maxHeight: '600px' }}>
            {mantenimientos.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2.5rem' }}>No hay registros de mantenimiento.</p>
            ) : (
              mantenimientos.map((m, index) => (
                <div key={m._docId || index} style={{ 
                  borderLeft: `4px solid ${m.tipo === 'Reparacion' ? '#ec4899' : m.tipo === 'Calibracion' ? '#3b82f6' : '#10b981'}`, 
                  padding: '0.75rem 1rem', 
                  marginBottom: '0.75rem',
                  background: 'var(--bg-color)',
                  borderRadius: '0 8px 8px 0'
                }}>
                  <div className="sala-header" style={{ marginBottom: '0.25rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{m.fecha}</strong>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-primary)', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>
                      {m.tipo}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.3rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{m.descripcion}</p>
                  
                  {m.tipo === 'Reparacion' && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#ec4899' }}>Costo: ${m.costo || 0}</p>
                  )}
                  {m.tipo === 'Calibracion' && (
                    <>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.85rem', color: m.resultado === 'Aprobado' ? '#10b981' : '#ef4444' }}>
                        Resultado: {m.resultado}
                      </p>
                      {m.proximo_vencimiento && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vence: {m.proximo_vencimiento}</p>}
                      {m.certificado_url && (
                        <a href={m.certificado_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', display: 'inline-block', marginTop: '0.3rem', color: 'var(--primary-color)' }}>
                          📄 Ver Certificado
                        </a>
                      )}
                    </>
                  )}
                  
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    Operario: {m.operario}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {modalEditar && (
        <EquipoFormModal 
          onClose={() => setModalEditar(false)}
          onSave={handleGuardarEquipo}
          equipoBase={equipo}
          user={user}
        />
      )}

      {modalReparacion && (
        <ReparacionFormModal
          equipoId={id}
          onClose={() => setModalReparacion(false)}
          onSave={() => { setModalReparacion(false); cargarDatos(); }}
          user={user}
        />
      )}

      {modalCalibracion && (
        <CalibracionFormModal
          equipoId={id}
          onClose={() => setModalCalibracion(false)}
          onSave={() => { setModalCalibracion(false); cargarDatos(); }}
          user={user}
        />
      )}
    </div>
  );
}
