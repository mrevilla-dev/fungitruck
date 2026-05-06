import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import NuevaCrioModal from '../components/NuevaCrioModal';

const ALMACENAMIENTO_LABELS = {
  freezer_80: { label: '-80°C Freezer', color: '#3b82f6', emoji: '🧊' },
  nitrogeno_liquido: { label: 'N₂ Líquido (-196°C)', color: '#8b5cf6', emoji: '⚗️' },
  heladera_4: { label: 'Heladera +4°C', color: '#10b981', emoji: '❄️' },
};

const SOPORTE_LABELS = {
  semillas: '🌾 Semillas',
  perlitas: '⚪ Perlitas',
  liquido: '💧 Líquido',
  otro: '📦 Otro',
};

export default function CrioPage() {
  const [muestras, setMuestras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAlmacenamiento, setFilterAlmacenamiento] = useState('todos');
  const [filterSoporte, setFilterSoporte] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('todos');

  useEffect(() => {
    const q = query(collection(db, 'criopreservacion'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMuestras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = muestras.filter(m => {
    const matchSearch =
      m.id?.toLowerCase().includes(search.toLowerCase()) ||
      m.cepaId?.toLowerCase().includes(search.toLowerCase()) ||
      m.batchOrigenId?.toLowerCase().includes(search.toLowerCase()) ||
      m.operador?.toLowerCase().includes(search.toLowerCase());
    const matchAlm = filterAlmacenamiento === 'todos' || m.almacenamiento === filterAlmacenamiento;
    const matchSop = filterSoporte === 'todos' || m.soporte === filterSoporte;
    const matchEst =
      filterEstado === 'todos' ||
      (filterEstado === 'congelada' && !m.fecha_descongelacion) ||
      (filterEstado === 'descongelada' && !!m.fecha_descongelacion);
    return matchSearch && matchAlm && matchSop && matchEst;
  });

  // Stats
  const total = muestras.length;
  const activas = muestras.filter(m => !m.fecha_descongelacion).length;
  const enN2 = muestras.filter(m => m.almacenamiento === 'nitrogeno_liquido').length;
  const conViabilidad = muestras.filter(m => m.viabilidad_post !== null && m.viabilidad_post !== undefined).length;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Banco de Cepas
          </p>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800' }}>🧊 Criopreservación</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Almacenamiento criogénico para conservación a largo plazo de cepas de trabajo
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          onClick={() => setShowModal(true)}
        >
          ➕ Nueva Criopreservación
        </button>
      </div>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total Muestras', value: total, color: 'var(--primary-color)', emoji: '🧬' },
          { label: 'Activas', value: activas, color: 'var(--accent-color)', emoji: '✅' },
          { label: 'En N₂ Líquido', value: enN2, color: '#8b5cf6', emoji: '⚗️' },
          { label: 'Con Viabilidad', value: conViabilidad, color: '#f59e0b', emoji: '📊' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '1.25rem', borderTop: `3px solid ${stat.color}`, marginBottom: 0 }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{stat.emoji}</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.25rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <label className="form-label">Buscar (ID, Cepa, Lote, Operador)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ej: CRIO-..., CEPA-01..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Almacenamiento</label>
            <select className="form-control" value={filterAlmacenamiento} onChange={e => setFilterAlmacenamiento(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="freezer_80">-80°C Freezer</option>
              <option value="nitrogeno_liquido">N₂ Líquido</option>
              <option value="heladera_4">Heladera +4°C</option>
            </select>
          </div>
          <div>
            <label className="form-label">Soporte</label>
            <select className="form-control" value={filterSoporte} onChange={e => setFilterSoporte(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="semillas">Semillas</option>
              <option value="perlitas">Perlitas</option>
              <option value="liquido">Líquido</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-control" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="congelada">Congelada (Activa)</option>
              <option value="descongelada">Descongelada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧊</div>
          <h3>No hay muestras registradas</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Registrá tu primera muestra de criopreservación para comenzar el banco de cepas.</p>
          <button className="btn btn-primary" style={{ width: 'auto', marginTop: '1rem' }} onClick={() => setShowModal(true)}>
            ➕ Nueva Criopreservación
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {/* Cabecera */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr 0.8fr', padding: '0.4rem 1.25rem', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>ID / Cepa / Origen</span>
            <span>Soporte / Protocolo</span>
            <span>Almacenamiento</span>
            <span>Fecha / Operador</span>
            <span>Estado</span>
          </div>

          {filtered.map(m => {
            const alm = ALMACENAMIENTO_LABELS[m.almacenamiento] || { label: m.almacenamiento, color: '#666', emoji: '❓' };
            const isDescongelada = !!m.fecha_descongelacion;
            return (
              <div
                key={m.id}
                className="card"
                style={{
                  padding: '1.25rem',
                  marginBottom: 0,
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 1fr 1fr 1fr 0.8fr',
                  alignItems: 'center',
                  borderLeft: `4px solid ${isDescongelada ? '#666' : alm.color}`,
                  opacity: isDescongelada ? 0.75 : 1,
                }}
              >
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem', fontFamily: 'monospace', color: alm.color }}>{m.id}</strong>
                  {m.cepaId && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>🧬 Cepa: {m.cepaId}</span>
                  )}
                  {m.batchOrigenId && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>📦 Origen: {m.batchOrigenId}</span>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: '0.85rem', display: 'block' }}>{SOPORTE_LABELS[m.soporte] || m.soporte}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {m.crioprotector} {m.concentracion_pct}% · {m.protocolo_descenso}
                  </span>
                </div>

                <div>
                  <span style={{
                    display: 'inline-block',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: `${alm.color}20`,
                    color: alm.color,
                    marginBottom: '0.25rem'
                  }}>
                    {alm.emoji} {alm.label}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {m.temperatura_final}°C
                  </span>
                </div>

                <div>
                  <span style={{ display: 'block', fontSize: '0.85rem' }}>{m.fecha_congelacion}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>👤 {m.operador}</span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  {isDescongelada ? (
                    <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px', background: 'rgba(100,100,100,0.2)', color: '#aaa' }}>
                      DESCONGELADA<br/>
                      <span style={{ fontSize: '0.65rem' }}>
                        {m.viabilidad_post !== null ? `Via: ${m.viabilidad_post}%` : 'Sin dato'}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px', background: `${alm.color}20`, color: alm.color, fontWeight: '700' }}>
                      ACTIVA
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <NuevaCrioModal
          onClose={() => setShowModal(false)}
          onSaved={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
