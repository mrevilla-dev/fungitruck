import React, { useState, useEffect } from 'react';
import { getEquipos, crearEquipo, actualizarEquipo } from '../services/equipoService';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import EquipoFormModal from '../components/EquipoFormModal';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function EquiposPage({ user }) {
  const [equipos, setEquipos] = useState([]);
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState(null);
  const navigate = useNavigate();

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSala, setFiltroSala] = useState('');
  const [filtroPropietario, setFiltroPropietario] = useState('');

  useEffect(() => {
    cargarDatos();
  }, [filtroCategoria, filtroEstado, filtroSala]);

  async function cargarDatos() {
    setCargando(true);
    try {
      // Cargar salas para los filtros
      if (salas.length === 0) {
        const snapSalas = await getDocs(query(collection(db, 'salas'), orderBy('nombre')));
        setSalas(snapSalas.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const filtros = {};
      if (filtroCategoria) filtros.categoria = filtroCategoria;
      if (filtroEstado) filtros.estado_operativo = filtroEstado;
      if (filtroSala) filtros.sala_actual_id = filtroSala;

      let res = await getEquipos(filtros);

      // Filtro cliente para propietario
      if (filtroPropietario) {
        res = res.filter(e => e.propietario === filtroPropietario);
      }

      setEquipos(res);
    } catch (err) {
      console.error(err);
      toast.error('Error cargando equipos');
    } finally {
      setCargando(false);
    }
  }

  async function handleGuardar(datos, id) {
    try {
      if (id) {
        await actualizarEquipo(id, datos);
      } else {
        await crearEquipo(datos);
      }
      setModalAbierto(false);
      setEquipoEditando(null);
      cargarDatos();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
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

  function getSalaNombre(salaId) {
    if (!salaId) return 'Sin asignar';
    const s = salas.find(x => x.id === salaId);
    return s ? s.nombre : 'Desconocida';
  }

  return (
    <div className="page-container">
      <div className="header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>⚙️ Gestión de Equipos</h1>
        <button className="btn-primary" onClick={() => { setEquipoEditando(null); setModalAbierto(true); }}>
          ➕ Nuevo equipo
        </button>
      </div>

      <div className="filters-card" style={{ display: 'flex', gap: '10px', margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>Categoría</label>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            <option value="Incubación">Incubación</option>
            <option value="Refrigeración">Refrigeración</option>
            <option value="Freezer">Freezer</option>
            <option value="Laboratorio">Laboratorio</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="Operativo">Operativo</option>
            <option value="En mantenimiento">En mantenimiento</option>
            <option value="Fuera de servicio">Fuera de servicio</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>Sala</label>
          <select value={filtroSala} onChange={e => setFiltroSala(e.target.value)}>
            <option value="">Todas</option>
            {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>Propietario</label>
          <select value={filtroPropietario} onChange={e => { setFiltroPropietario(e.target.value); cargarDatos(); }}>
            <option value="">Todos</option>
            <option value="Facultad">Facultad</option>
            <option value="Emprendimiento">Emprendimiento</option>
            <option value="Personal">Personal</option>
          </select>
        </div>
      </div>

      {cargando ? (
        <p>Cargando equipos...</p>
      ) : equipos.length === 0 ? (
        <p>No se encontraron equipos.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {equipos.map(eq => (
            <div key={eq._docId} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', position: 'relative', background: 'white' }}>
              <span style={{ 
                position: 'absolute', top: '10px', right: '10px', 
                background: getBadgeColor(eq.estado_operativo), color: 'white', 
                padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold'
              }}>
                {eq.estado_operativo}
              </span>
              <h3 style={{ margin: '0 0 5px 0', paddingRight: '100px' }}>{eq.nombre}</h3>
              <p style={{ margin: '0 0 5px 0', color: '#555', fontSize: '14px' }}>
                <strong>{eq.categoria}</strong> {eq.marca_modelo && `· ${eq.marca_modelo}`}
              </p>
              <p style={{ margin: '0 0 15px 0', fontSize: '13px' }}>
                📍 Sala: {getSalaNombre(eq.sala_actual_id)}
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1, padding: '6px' }}
                  onClick={() => navigate(`/equipos/${eq._docId}`)}
                >
                  🔧 Mantenimiento
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ padding: '6px' }}
                  onClick={() => { setEquipoEditando(eq); setModalAbierto(true); }}
                >
                  ✏️ Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAbierto && (
        <EquipoFormModal 
          onClose={() => { setModalAbierto(false); setEquipoEditando(null); }}
          onSave={handleGuardar}
          equipoBase={equipoEditando}
          user={user}
        />
      )}
    </div>
  );
}
