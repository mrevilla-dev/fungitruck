import React, { useState, useEffect, useMemo } from 'react';
import { crearEquipo, actualizarEquipo } from '../services/equipoService';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import EquipoFormModal from '../components/EquipoFormModal';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const ESTADO_CONFIG = {
  'Operativo': { badge: '🟢', color: '#10b981' },
  'En mantenimiento': { badge: '🟡', color: '#f59e0b' },
  'Fuera de servicio': { badge: '🔴', color: '#ef4444' },
};

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

  function getEstadoConfig(estado) {
    return ESTADO_CONFIG[estado] || { badge: '⚪', color: '#94a3b8' };
  }

  function getSalaNombre(salaId) {
    if (!salaId) return 'Sin asignar';
    const s = salas.find(x => x.id === salaId);
    return s ? s.nombre : 'Desconocida';
  }

  const copyId = (id) => {
    navigator.clipboard.writeText(id);
    toast.success('ID copiado');
  };

  return (
    <div className="animate-fade-in">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>⚙️ Gestión de Equipos</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setEquipoEditando(null); setModalAbierto(true); }}>
          ➕ Nuevo equipo
        </button>
      </div>

      <p className="no-print" style={{ color: 'var(--text-secondary)' }}>
        Inventario de equipos, parámetros ideales e historial de mantenimiento.
      </p>

      {errorCarga && (
        <div className="form-error-banner" style={{ margin: '0 0 1rem' }}>
          ⚠️ {errorCarga}
        </div>
      )}

      <div className="no-print" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>🔍 Buscar</label>
          <input
            type="text"
            className="form-control"
            placeholder="Nombre, marca, ID..."
            value={busquedaTexto}
            onChange={e => setBusquedaTexto(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Categoría</label>
          <select className="form-control" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Estado</label>
          <select className="form-control" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="Operativo">Operativo</option>
            <option value="En mantenimiento">En mantenimiento</option>
            <option value="Fuera de servicio">Fuera de servicio</option>
          </select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Sala</label>
          <select className="form-control" value={filtroSala} onChange={e => setFiltroSala(e.target.value)}>
            <option value="">Todas</option>
            {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Propietario</label>
          <select className="form-control" value={filtroPropietario} onChange={e => setFiltroPropietario(e.target.value)}>
            <option value="">Todos</option>
            <option value="Facultad">Facultad</option>
            <option value="Emprendimiento">Emprendimiento</option>
            <option value="Personal">Personal</option>
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mostrando {equiposFiltrados.length} de {equipos.length}</span>
        </div>
      </div>

      {cargando ? (
        <div className="salas-grid">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="card" style={{ height: '180px', background: 'var(--surface-color)', opacity: '0.6' }} />
          ))}
        </div>
      ) : equipos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
          <h3 style={{ margin: '0 0 0.5rem' }}>No hay equipos registrados</h3>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)' }}>Registrá tu primer equipo para empezar a controlarlo.</p>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setEquipoEditando(null); setModalAbierto(true); }}>
            ➕ Nuevo equipo
          </button>
        </div>
      ) : equiposFiltrados.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No hay equipos que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="salas-grid">
          {equiposFiltrados.map(eq => {
            const ec = getEstadoConfig(eq.estado_operativo);
            return (
              <div key={eq._docId} className="card sala-card" style={{ display: 'flex', flexDirection: 'column' }}>
                {eq.foto_url && (
                  <img
                    src={eq.foto_url}
                    alt={eq.nombre}
                    className="no-print"
                    style={{
                      width: '100%',
                      height: '150px',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      marginBottom: '1rem',
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  />
                )}
                <div className="sala-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                    <span className="label-id" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>{eq._docId}</span>
                    <button className="edit-icon-btn" title="Copiar ID" onClick={() => copyId(eq._docId)} style={{ fontSize: '0.75rem' }}>📋</button>
                  </div>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '12px', background: `${ec.color}22`, color: ec.color, border: `1px solid ${ec.color}44`, display: 'inline-block', marginBottom: '0.5rem' }}>
                    {ec.badge} {eq.estado_operativo}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>{eq.nombre}</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  🔧 {eq.categoria}{eq.marca_modelo ? ` · ${eq.marca_modelo}` : ''}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  📍 {getSalaNombre(eq.sala_actual_id)}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  👤 {eq.propietario}
                </div>
                {eq.notas && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
                    {eq.notas}
                  </p>
                )}
                <div className="flex-gap no-print" style={{ marginTop: 'auto' }}>
                  <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', flex: '1 1 auto' }} onClick={() => navigate(`/equipos/${eq._docId}`)}>
                    🔧 Mantenimiento
                  </button>
                  <button className="edit-icon-btn" title="Editar" onClick={() => { setEquipoEditando(eq); setModalAbierto(true); }}>✏️</button>
                </div>
              </div>
            );
          })}
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
