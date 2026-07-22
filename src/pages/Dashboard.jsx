import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, where, doc, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import RegistroMasivoAislamientosModal from '../components/RegistroMasivoAislamientosModal';
import toast from 'react-hot-toast';

// Configuración de ciclos teóricos (en días) para el motor de alertas
const CICLOS_TEORICOS = {
  'Pleurotus Ostreatus': 15,
  'Pleurotus Eryngii': 20,
  'Ganoderma Lucidum': 25,
  'Hericium Erinaceus': 18,
  'Lentinula Edodes': 30,
  'default': 20
};

const StatBar = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '99px', height: '6px', marginTop: '6px', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.8s ease' }} />
    </div>
  );
};

const summaryStyle = {
  cursor: 'pointer',
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  borderRadius: '8px',
  background: 'var(--surface-color)',
  color: 'var(--text-primary)',
  fontWeight: '600',
  fontSize: '1rem',
  listStyle: 'none',
  gap: '0.5rem',
};

export default function Dashboard() {
  const [insumosAlerts, setInsumosAlerts] = useState([]);
  const [labStats, setLabStats] = useState({ planificado: 0, inoculado: 0, incubacion: 0, fructificacion: 0, contaminados: 0, cosechados: 0, total: 0 });
  const [recentMovements, setRecentMovements] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [pendingLabelsCount, setPendingLabelsCount] = useState(0);
  const [pendientesConfirmacion, setPendientesConfirmacion] = useState([]);
  const [greeting, setGreeting] = useState('Buenos días');
  
  const [batchesList, setBatchesList] = useState([]);
  const [coloniasVisibles, setColoniasVisibles] = useState([]);
  const [sinMatAlerts, setSinMatAlerts] = useState([]);
  const [batchToRegister, setBatchToRegister] = useState(null);
  
  // Criobanco Stats
  const [criobancoStats, setCriobancoStats] = useState({ activos: 0, destinados: 0, sinUbicacion: 0, temps: {} });
  
  // Equipos Stats
  const [equiposStats, setEquiposStats] = useState({ fueraDeServicio: 0, sinSala: 0 });
  const [calibracionesProximas, setCalibracionesProximas] = useState([]);
  
  // Filtros Globales BI
  const [filterEspecie, setFilterEspecie] = useState('todas');
  const [filterSala, setFilterSala] = useState('todas');
  const [filterEjemplar, setFilterEjemplar] = useState('');
  
  const [especiesList, setEspeciesList] = useState([]);
  const [salas, setSalas] = useState([]);
  const [ejemplares, setEjemplares] = useState([]);

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 19) setGreeting('Buenas tardes');
    else if (h >= 19) setGreeting('Buenas noches');
  }, []);

  useEffect(() => {
    // Cargar listas para filtros
    onSnapshot(collection(db, "salas"), (snap) => setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // Cargar ejemplares para SearchableSelect
    const unsubEjemplares = onSnapshot(collection(db, "ejemplares"), (snap) => {
      setEjemplares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Alertas de Insumos (siempre visibles)
    onSnapshot(collection(db, "insumos_base"), (snap) => {
      setInsumosAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.stock_total_base <= (i.stock_minimo_base || 0)));
    });

    // Cola de impresión pendiente
    const qCola = query(collection(db, 'cola_impresion'), where('estado', '==', 'Pendiente'));
    onSnapshot(qCola, (snap) => {
      let totalPendientes = 0;
      snap.docs.forEach(doc => {
        const data = doc.data();
        totalPendientes += (data.datos_etiquetas?.length || 0);
      });
      setPendingLabelsCount(totalPendientes);
    });

    // Ejemplares pendientes de confirmación
    const qPendientes = query(collection(db, 'ejemplares'), where('estado', '==', 'En evaluación'));
    const unsubPendientes = onSnapshot(qPendientes, snap => {
      setPendientesConfirmacion(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Listener Principal de Cultivos (Batches) con Filtros BI
    const qBatches = collection(db, "batches");
    const unsubscribe = onSnapshot(qBatches, (snap) => {
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBatchesList(items);
      
      // Extraer lista única de especies para el filtro
      const uniqueEspecies = [...new Set(items.map(i => i.especie).filter(Boolean))];
      setEspeciesList(uniqueEspecies);

      // Aplicar Filtros BI y Ejemplar
      if (filterEspecie !== 'todas') items = items.filter(i => i.especie === filterEspecie);
      if (filterSala !== 'todas') items = items.filter(i => i.destinoId === filterSala);
      if (filterEjemplar) items = items.filter(i => i.ejemplarId === filterEjemplar);

      // Calcular Stats
      setLabStats({
        planificado:   items.filter(i => i.status === 'Planificado').length,
        inoculado:     items.filter(i => i.status === 'Inoculado' || i.status === 'Inoculación').length,
        incubacion:    items.filter(i => i.status === 'Incubación' || i.status === 'Incubando').length,
        fructificacion:items.filter(i => i.status === 'Fructificación' || i.status === 'Fructificando').length,
        contaminados:  items.filter(i => i.status === 'Contaminado').length,
        cosechados:    items.filter(i => i.status === 'Cosechado').length,
        total: items.length,
      });

      // Motor de Alertas / Tareas de Hoy
      const tasks = items.filter(item => {
        if (item.status !== 'Incubación') return false;
        const fechaInoc = item.createdAt?.toDate() || new Date(item.fecha_inoculacion);
        const diasTranscurridos = Math.floor((new Date() - fechaInoc) / (1000 * 60 * 60 * 24));
        const cicloTeorico = CICLOS_TEORICOS[item.especie] || CICLOS_TEORICOS['default'];
        return diasTranscurridos >= cicloTeorico;
      });
      setTodayTasks(tasks);

      // Actividad Reciente (filtrada)
      const moves = items
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 5)
        .map(i => ({
          id: i.id,
          text: `🌱 ${i.especie} (${i.id})`,
          status: i.status,
          date: i.createdAt?.toDate?.() || new Date(i.createdAt) || new Date(),
        }));
      setRecentMovements(moves);
    });

    // Criobanco Listener
    const unsubCrioviales = onSnapshot(collection(db, "crioviales"), snap => {
      let activos = 0;
      let sinUbicacion = 0;
      let temps = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.estado === 'Criopreservado') {
          activos++;
          if (!data.ubicacion_actual || !data.ubicacion_actual.equipo || !data.ubicacion_actual.contenedor) {
            sinUbicacion++;
          }
          const t = data.temperatura_almacenamiento || 'Desc.';
          temps[t] = (temps[t] || 0) + 1;
        }
      });
      setCriobancoStats(prev => ({ ...prev, activos, sinUbicacion, temps }));
    });

    // Equipos Listener
    const unsubEquipos = onSnapshot(collection(db, "equipos"), snap => {
      let fueraDeServicio = 0;
      let sinSala = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.estado_operativo === 'Fuera de servicio') fueraDeServicio++;
        if (!data.sala_actual_id) sinSala++;
      });
      setEquiposStats({ fueraDeServicio, sinSala });
    });

    // Calibraciones próximas a vencer (Mantenimiento)
    const unsubMantenimientos = onSnapshot(query(collection(db, "mantenimiento"), where("tipo", "==", "Calibracion")), snap => {
      const now = new Date();
      const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const proximas = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.proximo_vencimiento) {
          const v = new Date(data.proximo_vencimiento);
          if (v >= now && v <= next30Days) {
            proximas.push({ id: d.id, ...data });
          } else if (v < now) {
            proximas.push({ id: d.id, ...data, vencida: true });
          }
        }
      });
      setCalibracionesProximas(proximas);
    });

    return () => {
      unsubEjemplares();
      unsubPendientes();
      unsubscribe();
      unsubCrioviales();
      unsubEquipos();
      unsubMantenimientos();
    };
  }, [filterEspecie, filterSala, filterEjemplar]);

  useEffect(() => {
    // Computar colonias visibles sin registrar
    const col = batchesList.filter(b => 
      b.status === 'Colonias visibles' && 
      (b.evento_aislamiento_id || b.es_aislamiento_primario) && 
      !ejemplares.some(e => e.batch_origen_id === b.id)
    );
    setColoniasVisibles(col);

    // Computar Ejemplares sin MAT determinado
    const sinM = ejemplares.filter(e => 
      e.tipo_micelio === 'Monocarión' && 
      (!e.mat || e.mat === 'No determinado' || e.mat === 'N/A') &&
      e.estado === 'Activo'
    );
    setSinMatAlerts(sinM);

    // Computar ejemplares destinados a criopreservacion
    const destinados = ejemplares.filter(e => e.destino_criopreservacion === true).length;
    setCriobancoStats(prev => ({ ...prev, destinados }));
  }, [batchesList, ejemplares]);

  const handleUpdateEjemplarEstado = async (id, newEstado) => {
    try {
      await updateDoc(doc(db, 'ejemplares', id), { estado: newEstado, updatedAt: new Date().toISOString() });
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const ejemplaresOptions = ejemplares.map(e => ({
    id: e.id,
    nombre: `${e.id_semantico || 'Sin ID Semántico'} · ${e.especie} · Gen${e.generacion ?? 0}`
  }));

  return (
    <div className="dashboard-container animate-fade-in" style={{ paddingBottom: '3rem' }}>
      
      {/* ─── Header & BI Filters ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{greeting}, Maxi 👋</p>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800' }}>Panel Inteligente</h1>
        </div>
        
        <div className="bi-filters card" style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1.25rem', alignItems: 'center', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary-color)', marginBottom: '4px' }}>Especie</label>
            <select value={filterEspecie} onChange={e => setFilterEspecie(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
              <option value="todas">Todas las especies</option>
              {especiesList.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ width: '1px', height: '25px', background: 'rgba(255,255,255,0.1)' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary-color)', marginBottom: '4px' }}>Sala / Sector</label>
            <select value={filterSala} onChange={e => setFilterSala(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
              <option value="todas">Todo el Lab</option>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {todayTasks.length > 0 && (
        <details open style={{ marginBottom: '2rem' }}>
          <summary style={{ ...summaryStyle, color: 'var(--danger-color)' }}>
            🔔 Tareas de Hoy / Alertas de Revisión
            <span style={{ fontSize: '0.7rem', background: 'var(--danger-color)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>{todayTasks.length}</span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {todayTasks.map(task => (
              <div key={task.id} className="card animate-pulse" style={{ padding: '1rem', borderLeft: '4px solid var(--danger-color)', background: 'rgba(239, 68, 68, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{task.id}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{task.especie} · Ciclo cumplido</span>
                  </div>
                  <Link to="/inventario" state={{ action: 'editBatch', batchId: task.id }} className="btn btn-sm btn-primary" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>Revisar</Link>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--danger-color)', fontWeight: '600' }}>
                  ⚠️ Acción sugerida: Evaluar pase a Fructificación
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ─── Etiquetas Pendientes ─── */}
      {pendingLabelsCount > 0 && (
        <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d97706' }}>
              🖨️ Etiquetas pendientes
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Hay <strong>{pendingLabelsCount}</strong> etiquetas esperando en la cola.</p>
          </div>
          <Link to="/print-queue" className="btn" style={{ background: '#f59e0b', color: 'white', fontWeight: 'bold' }}>
            Ir a imprimir
          </Link>
        </section>
      )}

      {pendientesConfirmacion.length > 0 && (
        <details open style={{ marginBottom: '2rem' }}>
          <summary style={{ ...summaryStyle, color: '#f59e0b' }}>
            🟡 Cruces en evaluación (Pendientes de confirmación)
            <span style={{ fontSize: '0.7rem', background: '#f59e0b', color: 'black', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{pendientesConfirmacion.length}</span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {pendientesConfirmacion.map(ej => {
              const dias = Math.floor((new Date() - new Date(ej.fecha_ingreso)) / (1000 * 60 * 60 * 24)) || 0;
              return (
                <div key={ej.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{ej.id_semantico || 'Sin ID Semántico'}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Padre: {ej.ejemplar_padre_id || 'N/A'}</span>
                      <br/>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Madre: {ej.ejemplar_madre_id || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-sm" style={{ background: '#10b981', color: 'white' }} onClick={() => handleUpdateEjemplarEstado(ej.id, 'Activo')}>Activo</button>
                      <button className="btn btn-sm" style={{ background: '#ef4444', color: 'white' }} onClick={() => handleUpdateEjemplarEstado(ej.id, 'Inviable')}>Inviable</button>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                    <span>⏳ Días en evaluación: {dias}</span>
                    <Link to="/ejemplares" state={{ action: 'edit', ejemplarId: ej.id }} style={{ color: 'var(--primary-color)' }}>Revisar ficha ➡️</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {coloniasVisibles.length > 0 && (
        <details open style={{ marginBottom: '2rem' }}>
          <summary style={{ ...summaryStyle, color: '#10b981' }}>
            🧫 Placas con colonias visibles sin registrar
            <span style={{ fontSize: '0.7rem', background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{coloniasVisibles.length}</span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {coloniasVisibles.map(b => (
              <div key={b.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981', background: 'rgba(16, 185, 129, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{b.id}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.especie}</span>
                  </div>
                  <button className="btn btn-sm" style={{ background: '#10b981', color: 'white' }} onClick={() => setBatchToRegister(b)}>
                    Registrar aislamientos
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {sinMatAlerts.length > 0 && (
        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ ...summaryStyle, color: '#8b5cf6' }}>
            🔍 Ejemplares sin MAT determinado
            <span style={{ fontSize: '0.7rem', background: '#8b5cf6', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{sinMatAlerts.length}</span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {sinMatAlerts.map(e => (
              <div key={e.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid #8b5cf6', background: 'rgba(139, 92, 246, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{e.id_semantico || 'Sin ID Semántico'}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{e.especie}</span>
                  </div>
                  <Link to="/ejemplares" state={{ action: 'edit', ejemplarId: e.id }} className="btn btn-sm btn-outline">Actualizar</Link>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#8b5cf6', fontWeight: '600' }}>
                  ⚠️ Recordatorio: Hacer PCR o apareamiento de prueba.
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <details style={{ marginBottom: '2rem' }}>
        <summary style={summaryStyle}>
          🧊 Criobanco
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <Link to="/criobanco" className="btn btn-outline btn-sm">Ver Criobanco</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.2rem', borderTop: '3px solid #3b82f6' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Crioviales Activos</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', margin: '0.5rem 0' }}>{criobancoStats.activos}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>En estado "Criopreservado"</div>
            </div>
            <div className="card" style={{ padding: '1.2rem', borderTop: '3px solid #10b981' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Ejemplares Destinados</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', margin: '0.5rem 0' }}>{criobancoStats.destinados}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aprobados para guardar</div>
            </div>
            <div className="card" style={{ padding: '1.2rem', borderTop: criobancoStats.sinUbicacion > 0 ? '3px solid #ef4444' : '3px solid #94a3b8' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Sin Ubicación ⚠️</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', margin: '0.5rem 0', color: criobancoStats.sinUbicacion > 0 ? '#ef4444' : 'inherit' }}>{criobancoStats.sinUbicacion}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Requieren asignación física</div>
            </div>
            <div className="card" style={{ padding: '1.2rem', borderTop: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Por Temperatura</div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {Object.keys(criobancoStats.temps).length === 0 ? <li>Sin datos</li> : 
                  Object.entries(criobancoStats.temps).map(([t, count]) => (
                    <li key={t}><strong>{t}</strong>: {count} viales</li>
                  ))
                }
              </ul>
            </div>
          </div>
        </div>
      </details>

      <details style={{ marginBottom: '2rem' }}>
        <summary style={summaryStyle}>
          ⚙️ Estado de Equipamiento
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <Link to="/equipos" className="btn btn-outline btn-sm">Ver Equipos</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            
            <div className="card" style={{ padding: '1.2rem', borderTop: equiposStats.fueraDeServicio > 0 ? '3px solid #f44336' : '3px solid #4CAF50' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Fuera de Servicio</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', margin: '0.5rem 0', color: equiposStats.fueraDeServicio > 0 ? '#f44336' : '#4CAF50' }}>
                {equiposStats.fueraDeServicio}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Equipos inoperativos</div>
            </div>

            <div className="card" style={{ padding: '1.2rem', borderTop: equiposStats.sinSala > 0 ? '3px solid #FFC107' : '3px solid #4CAF50' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Sin Sala Asignada</div>
              <div style={{ fontSize: '2rem', fontWeight: '800', margin: '0.5rem 0', color: equiposStats.sinSala > 0 ? '#FFC107' : 'inherit' }}>
                {equiposStats.sinSala}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Equipos sin ubicación</div>
            </div>

            <div className="card" style={{ padding: '1.2rem', borderTop: calibracionesProximas.length > 0 ? '3px solid #f59e0b' : '3px solid #4CAF50', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Calibraciones críticas (30 días)
              </div>
              {calibracionesProximas.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Todo al día.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {calibracionesProximas.map(cal => (
                    <li key={cal.id} style={{ color: cal.vencida ? '#f44336' : '#f59e0b' }}>
                      <strong>{cal.vencida ? 'VENCIDA: ' : 'Próxima: '}</strong>
                      Vence {cal.proximo_vencimiento} (Eq: {cal.equipo_id})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
          </div>
        </div>
      </details>

      <details open style={{ marginBottom: '2rem' }}>
        <summary style={summaryStyle}>
          🧫 Cultivos activos
        </summary>
        <div style={{ padding: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginTop: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '300px', maxWidth: '100%', zIndex: 10 }}>
                <SearchableSelect
                  options={ejemplaresOptions}
                  value={filterEjemplar}
                  onChange={val => setFilterEjemplar(val || '')}
                  placeholder="🔍 Filtrar por Ejemplar"
                />
              </div>
              {filterEjemplar && (
                 <button className="btn btn-outline btn-sm" style={{ padding: '0 0.5rem', height: '48px' }} onClick={() => setFilterEjemplar('')}>✕</button>
              )}
              <Link to="/inventario" className="btn btn-outline btn-sm" style={{ height: '48px', display: 'flex', alignItems: 'center' }}>Ver todos</Link>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.25rem' }}>
            {[
              { label: 'Planificado', value: labStats.planificado, color: '#94a3b8' },
              { label: 'Inoculado', value: labStats.inoculado, color: '#3b82f6' },
              { label: 'Incubando', value: labStats.incubacion, color: '#10b981' },
              { label: 'Fructificando', value: labStats.fructificacion, color: '#8b5cf6' },
              { label: 'Cosechados', value: labStats.cosechados, color: '#f59e0b' },
              { label: 'Contaminados', value: labStats.contaminados, color: '#ef4444' }
            ].map(stat => (
              <div key={stat.label} className="card" style={{ padding: '1.2rem', borderTop: `3px solid ${stat.color}` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</div>
                <div style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0.5rem 0' }}>{stat.value}</div>
                <StatBar value={stat.value} max={labStats.total} color={stat.color} />
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="grid-2">
        <details>
          <summary style={{ ...summaryStyle, background: 'var(--surface-color)' }}>
            ⏱️ Actividad Filtrada
          </summary>
          <div className="card" style={{ padding: '0.5rem', marginTop: '0.5rem' }}>
            {recentMovements.map((move, i) => (
              <div key={move.id} style={{ padding: '1rem', borderBottom: i < 4 ? '1px solid var(--border-color)' : 'none', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)' }}></div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>{move.text}</p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Estado: {move.status}</span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{move.date.toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </details>

        <details>
          <summary style={{ ...summaryStyle, background: 'var(--surface-color)' }}>
            📦 Alertas de Insumos
            {insumosAlerts.length > 0 && <span style={{ fontSize: '0.7rem', background: 'var(--danger-color)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>{insumosAlerts.length}</span>}
          </summary>
          <div className="card" style={{ padding: '1rem', marginTop: '0.5rem' }}>
            {insumosAlerts.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Stock óptimo</p>
            ) : (
              insumosAlerts.map(item => {
                const f = item.factor_display || 1;
                const actual = ((item.stock_total_base || 0) / f).toFixed(1);
                const min = ((item.stock_minimo_base || 0) / f).toFixed(1);
                const unidad = item.unidad_display || item.unidad_base || 'un';
                
                return (
                  <div key={item.id} style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600' }}>{item.nombre}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Quedan: <strong style={{ color: 'var(--danger-color)' }}>{actual} {unidad}</strong> (Mín: {min})
                      </div>
                    </div>
                    <Link to="/inventario" state={{ action: 'reponer', insumoId: item.id }} className="btn btn-sm" style={{ background: 'var(--danger-color)', color: 'white', padding: '4px 8px', fontSize: '0.7rem' }}>
                      Reponer
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </details>
      </div>

      {batchToRegister && (
        <RegistroMasivoAislamientosModal
          batchMadre={batchToRegister}
          onClose={() => setBatchToRegister(null)}
        />
      )}
    </div>
  );
}
