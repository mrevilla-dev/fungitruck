import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';

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

export default function Dashboard() {
  const [insumosAlerts, setInsumosAlerts] = useState([]);
  const [labStats, setLabStats] = useState({ incubacion: 0, fructificacion: 0, contaminados: 0, cosechados: 0, total: 0 });
  const [recentMovements, setRecentMovements] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [greeting, setGreeting] = useState('Buenos días');
  
  // Filtros Globales BI
  const [filterEspecie, setFilterEspecie] = useState('todas');
  const [filterSala, setFilterSala] = useState('todas');
  const [especiesList, setEspeciesList] = useState([]);
  const [salas, setSalas] = useState([]);

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 19) setGreeting('Buenas tardes');
    else if (h >= 19) setGreeting('Buenas noches');
  }, []);

  useEffect(() => {
    // Cargar listas para filtros
    onSnapshot(collection(db, "salas"), (snap) => setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // Alertas de Insumos (siempre visibles)
    onSnapshot(collection(db, "insumos_base"), (snap) => {
      setInsumosAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.stock_total_base <= (i.stock_minimo_base || 0)));
    });

    // Listener Principal de Cultivos (Batches) con Filtros BI
    const qBatches = collection(db, "batches");
    const unsubscribe = onSnapshot(qBatches, (snap) => {
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Extraer lista única de especies para el filtro
      const uniqueEspecies = [...new Set(items.map(i => i.especie).filter(Boolean))];
      setEspeciesList(uniqueEspecies);

      // Aplicar Filtros BI
      if (filterEspecie !== 'todas') items = items.filter(i => i.especie === filterEspecie);
      if (filterSala !== 'todas') items = items.filter(i => i.destinoId === filterSala);

      // Calcular Stats
      setLabStats({
        incubacion:    items.filter(i => i.status === 'Incubación').length,
        fructificacion:items.filter(i => i.status === 'Fructificación').length,
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
          date: i.createdAt?.toDate() || new Date()
        }));
      setRecentMovements(moves);
    });

    return () => unsubscribe();
  }, [filterEspecie, filterSala]);

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

      {/* ─── Tareas de Hoy (Alertas Predictivas) ─── */}
      {todayTasks.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            🔔 Tareas de Hoy / Alertas de Revisión
            <span style={{ fontSize: '0.7rem', background: 'var(--danger-color)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>{todayTasks.length}</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {todayTasks.map(task => (
              <div key={task.id} className="card animate-pulse" style={{ padding: '1rem', borderLeft: '4px solid var(--danger-color)', background: 'rgba(239, 68, 68, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{task.id}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{task.especie} · Ciclo cumplido</span>
                  </div>
                  <Link to="/inventory" className="btn btn-sm btn-primary" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>Revisar</Link>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--danger-color)', fontWeight: '600' }}>
                  ⚠️ Acción sugerida: Evaluar pase a Fructificación
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── KPIs Reactivos ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { label: 'Incubación', value: labStats.incubacion, color: 'var(--primary-color)' },
          { label: 'Fructificación', value: labStats.fructificacion, color: '#8b5cf6' },
          { label: 'Cosechados', value: labStats.cosechados, color: 'var(--accent-color)' },
          { label: 'Contaminados', value: labStats.contaminados, color: 'var(--danger-color)' }
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '1.5rem', borderTop: `3px solid ${stat.color}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</div>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0.5rem 0' }}>{stat.value}</div>
            <StatBar value={stat.value} max={labStats.total} color={stat.color} />
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Actividad Reciente */}
        <section>
          <h3 style={{ marginBottom: '1rem' }}>⏱️ Actividad Filtrada</h3>
          <div className="card" style={{ padding: '0.5rem' }}>
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
        </section>

        {/* Alertas de Insumos */}
        <section>
          <h3 style={{ marginBottom: '1rem' }}>📦 Alertas de Insumos</h3>
          <div className="card" style={{ padding: '1rem' }}>
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
                    <Link to="/inventory" state={{ action: 'reponer', insumoId: item.id }} className="btn btn-sm" style={{ background: 'var(--danger-color)', color: 'white', padding: '4px 8px', fontSize: '0.7rem' }}>
                      Reponer
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
