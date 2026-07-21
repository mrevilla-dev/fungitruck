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

  function getBadgeColor(estado) {
    switch (estado) {
      case 'Operativo': return '#4CAF50';
      case 'En mantenimiento': return '#FFC107';
      case 'Fuera de servicio': return '#F44336';
      default: return '#9E9E9E';
    }
  }

  if (cargando) return <div className="page-container"><p>Cargando equipo...</p></div>;
  if (!equipo) return null;

  const depreciacion = (equipo.valor_compra || 0) - (equipo.valor_residual || 0);

  return (
    <div className="page-container">
      <button className="btn-secondary" onClick={() => navigate('/equipos')} style={{ marginBottom: '20px' }}>
        ← Volver a Equipos
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* PANEL IZQUIERDO - FICHA TÉCNICA */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>{equipo.nombre}</h2>
            <span style={{ 
              background: getBadgeColor(equipo.estado_operativo), color: 'white', 
              padding: '5px 12px', borderRadius: '16px', fontSize: '14px', fontWeight: 'bold'
            }}>
              {equipo.estado_operativo}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Cambiar Estado:</label>
              <select value={equipo.estado_operativo} onChange={handleCambiarEstado} style={{ width: '100%', padding: '8px' }}>
                <option value="Operativo">Operativo</option>
                <option value="En mantenimiento">En mantenimiento</option>
                <option value="Fuera de servicio">Fuera de servicio</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Ubicación actual:</label>
              <select value={equipo.sala_actual_id || ''} onChange={handleCambiarSala} style={{ width: '100%', padding: '8px' }}>
                <option value="">-- Sin asignar --</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
            <p><strong>Categoría:</strong> {equipo.categoria}</p>
            <p><strong>Marca/Modelo:</strong> {equipo.marca_modelo || 'N/A'}</p>
            <p><strong>Serie:</strong> {equipo.nro_serie || 'N/A'}</p>
            <p><strong>Propietario:</strong> {equipo.propietario}</p>
            <p><strong>Adquisición:</strong> {equipo.fecha_adquisicion || 'N/A'}</p>
            <p><strong>Vida útil (años):</strong> {equipo.vida_util_anios || 'N/A'}</p>
            <p><strong>Valor Compra:</strong> ${equipo.valor_compra}</p>
            <p><strong>Valor Residual:</strong> ${equipo.valor_residual}</p>
          </div>

          {['Incubación', 'Refrigeración', 'Freezer'].includes(equipo.categoria) && equipo.parametros_ideales && (
            <div style={{ marginTop: '20px', background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Parámetros Ideales</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '13px' }}>
                <p>Temp Mín: {equipo.parametros_ideales.temp_min ?? 'N/A'} °C</p>
                <p>Temp Máx: {equipo.parametros_ideales.temp_max ?? 'N/A'} °C</p>
                <p>Hum Mín: {equipo.parametros_ideales.hum_min ?? 'N/A'} %</p>
                <p>Hum Máx: {equipo.parametros_ideales.hum_max ?? 'N/A'} %</p>
              </div>
            </div>
          )}

          {equipo.foto_url && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <img src={equipo.foto_url} alt="Equipo" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button className="btn-secondary" onClick={() => setModalEditar(true)} style={{ width: '100%' }}>
              ✏️ Editar Ficha
            </button>
          </div>
        </div>

        {/* PANEL DERECHO - HISTORIAL DE MANTENIMIENTO */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 20px 0' }}>Historial de Intervenciones</h3>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button className="btn-primary" onClick={() => setModalReparacion(true)} style={{ flex: 1 }}>
              🔧 Registrar Reparación
            </button>
            <button className="btn-primary" onClick={() => setModalCalibracion(true)} style={{ flex: 1, backgroundColor: '#2196F3' }}>
              📐 Registrar Calibración
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
            {mantenimientos.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>No hay registros de mantenimiento.</p>
            ) : (
              mantenimientos.map((m, index) => (
                <div key={m._docId || index} style={{ 
                  borderLeft: `4px solid ${m.tipo === 'Reparacion' ? '#E91E63' : m.tipo === 'Calibracion' ? '#2196F3' : '#4CAF50'}`, 
                  padding: '10px 15px', 
                  marginBottom: '15px',
                  background: '#f9f9f9',
                  borderRadius: '0 8px 8px 0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <strong>{m.fecha}</strong>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', background: '#ddd', padding: '2px 6px', borderRadius: '4px' }}>
                      {m.tipo}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}>{m.descripcion}</p>
                  
                  {m.tipo === 'Reparacion' && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#E91E63' }}>Costo: ${m.costo || 0}</p>
                  )}
                  {m.tipo === 'Calibracion' && (
                    <>
                      <p style={{ margin: '0 0 3px 0', fontSize: '13px', color: m.resultado === 'Aprobado' ? 'green' : 'red' }}>
                        Resultado: {m.resultado}
                      </p>
                      {m.proximo_vencimiento && <p style={{ margin: 0, fontSize: '12px' }}>Vence: {m.proximo_vencimiento}</p>}
                      {m.certificado_url && (
                        <a href={m.certificado_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', display: 'inline-block', marginTop: '5px' }}>
                          📄 Ver Certificado
                        </a>
                      )}
                    </>
                  )}
                  
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#888', textAlign: 'right' }}>
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
