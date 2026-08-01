import React, { useState, useEffect, useMemo } from 'react';
import { crearEquipo, actualizarEquipo } from '../services/equipoService';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import EquipoFormModal from '../components/EquipoFormModal';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function EquiposPage({ user }) {
  const [equipos, setEquipos] = useState([]);
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState(null);
  const navigate = useNavigate();

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSala, setFiltroSala] = useState('');
  const [filtroPropietario, setFiltroPropietario] = useState('');
  const [busquedaTexto, setBusquedaTexto] = useState('');

  // Listener de equipos: query simple (sin índice compuesto) + filtrado en cliente
  useEffect(() => {
    const q = query(collection(db, 'equipos'), orderBy('fecha_creacion', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEquipos(snap.docs.map(d => ({ ...d.data(), _docId: d.id })));
        setCargando(false);
        setErrorCarga('');
      },
      (err) => {
        console.error('Error escuchando equipos:', err);
        setCargando(false);
        setErrorCarga('No se pudieron cargar los equipos.');
      }
    );
    return unsub;
  }, []);

  // Salas (una sola carga, para filtros y cards)
  useEffect(() => {
    let activo = true;
    getDocs(query(collection(db, 'salas'), orderBy('nombre')))
      .then(snap => { if (activo) setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); })
      .catch(err => console.error('Error cargando salas:', err));
    return () => { activo = false; };
  }, []);

  const categoriasUnicas = useMemo(
    () => [...new Set(equipos.map(e => e.categoria).filter(Boolean))].sort(),
    [equipos]
  );

  const equiposFiltrados = useMemo(() => equipos.filter(eq => {
    if (filtroCategoria && eq.categoria !== filtroCategoria) return false;
    if (filtroEstado && eq.estado_operativo !== filtroEstado) return false;
    if (filtroSala && eq.sala_actual_id !== filtroSala) return false;
    if (filtroPropietario && eq.propietario !== filtroPropietario) return false;
    if (busquedaTexto) {
      const s = busquedaTexto.toLowerCase();
      const match = (eq.nombre || '').toLowerCase().includes(s) ||
                    (eq.marca_modelo || '').toLowerCase().includes(s) ||
                    (eq.notas || '').toLowerCase().includes(s) ||
                    (eq._docId || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  }), [equipos, filtroCategoria, filtroEstado, filtroSala, filtroPropietario, busquedaTexto]);

  async function handleGuardar(datos, id) {
    try {
      if (id) {
        await actualizarEquipo(id, datos);
      } else {
        await crearEquipo(datos);
      }
      setModalAbierto(false);
      setEquipoEditando(null);
      toast.success('Equipo guardado');
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

      {errorCarga && (
        <div className="form-error-banner" style={{ margin: '16px 0' }}>
          ⚠️ {errorCarga}
        </div>
      )}

      <div className="filters-card" style={{ display: 'flex', gap: '10px', margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>🔍 Buscar</label>
          <input
            type="text"
            placeholder="Nombre, marca, ID..."
            value={busquedaTexto}
            onChange={e => setBusquedaTexto(e.target.value)}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px' }}>Categoría</label>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
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
          <select value={filtroPropietario} onChange={e => setFiltroPropietario(e.target.value)}>
            <option value="">Todos</option>
            <option value="Facultad">Facultad</option>
            <option value="Emprendimiento">Emprendimiento</option>
            <option value="Personal">Personal</option>
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <span style={{ fontSize: '12px', color: '#333' }}>Mostrando {equiposFiltrados.length} de {equipos.length}</span>
        </div>
      </div>

      {cargando ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', height: '160px', background: '#f5f5f5' }} />
          ))}
        </div>
      ) : equipos.length === 0 ? (
        <p>No hay equipos registrados.</p>
      ) : equiposFiltrados.length === 0 ? (
        <p>No hay equipos que coincidan con los filtros.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {equiposFiltrados.map(eq => (
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
