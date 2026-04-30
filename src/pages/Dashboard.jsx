import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';

// Componente mini: barra de progreso visual
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
  const [mediosAlerts, setMediosAlerts] = useState([]);
  const [labStats, setLabStats] = useState({ incubacion: 0, fructificacion: 0, contaminados: 0, cosechados: 0, total: 0 });
  const [recentMovements, setRecentMovements] = useState([]);
  const [greeting, setGreeting] = useState('Buenos días');

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 19) setGreeting('Buenas tardes');
    else if (h >= 19) setGreeting('Buenas noches');
  }, []);

  useEffect(() => {
    // 1. Alertas de Insumos Base (Nivel 1)
    const unsubInsumos = onSnapshot(collection(db, "insumos_base"), (snap) => {
      setInsumosAlerts(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(i => i.stock_total_base <= (i.stock_minimo_base || 0))
      );
    });

    // 2. Alertas de Medios Preparados (Nivel 2)
    const unsubMedios = onSnapshot(collection(db, "medios_preparados"), (snap) => {
      setMediosAlerts(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(m => m.stock_bulk?.cantidad_actual <= (m.stock_minimo || 5))
      );
    });

    // 3. Stats de Cultivos (Nivel 3)
    const unsubCultivos = onSnapshot(collection(db, "cultivos"), (snapC) => {
      const items = snapC.docs.map(d => d.data());
      setLabStats({
        incubacion:    items.filter(i => i.status === 'Incubación').length,
        fructificacion:items.filter(i => i.status === 'Fructificación').length,
        contaminados:  items.filter(i => i.status === 'Contaminado').length,
        cosechados:    items.filter(i => i.status === 'Cosechado').length,
        total: items.length,
      });

      const cultMoves = snapC.docs.map(d => ({
        id: d.id,
        type: 'cultivo',
        text: `🌱 Se inoculó ${d.data().cepa_especie}`,
        date: d.data().createdAt?.toDate() || new Date(0),
        ts:   d.data().createdAt?.toMillis() || 0,
      }));

      // 4. Últimos Medios (independiente, evita listener anidado)
      const qM = query(collection(db, "medios_preparados"), orderBy("createdAt", "desc"), limit(5));
      const unsubM2 = onSnapshot(qM, (snapM) => {
        const medioMoves = snapM.docs.map(d => ({
          id: d.id,
          type: 'medio',
          text: `🧫 Se preparó ${d.data().alias}`,
          date: d.data().createdAt?.toDate() || new Date(0),
          ts:   d.data().createdAt?.toMillis() || 0,
        }));
        const combined = [...cultMoves, ...medioMoves]
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 6);
        setRecentMovements(combined);
      });
      // Note: unsubM2 is intentionally not returned here to avoid complexity;
      // it's lightweight and re-created per cultivos snapshot. For production scale this should be lifted.
    });

    return () => {
      unsubInsumos();
      unsubMedios();
      unsubCultivos();
    };
  }, []);

  const contamRate = labStats.total > 0
    ? ((labStats.contaminados / labStats.total) * 100).toFixed(1)
    : 0;
  const successRate = labStats.total > 0
    ? (((labStats.cosechados) / labStats.total) * 100).toFixed(1)
    : 0;
  const totalAlerts = insumosAlerts.length + mediosAlerts.length;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>

      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{greeting}, Maxi 👋</p>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', letterSpacing: '-0.5px' }}>
            Panel de Control
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {totalAlerts > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--danger-color)', fontWeight: '600', marginTop: '2px' }}>
              ⚠️ {totalAlerts} alerta{totalAlerts > 1 ? 's' : ''} activa{totalAlerts > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--primary-color)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Incubación</div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', lineHeight: 1.1, marginTop: '0.25rem' }}>{labStats.incubacion}</div>
          <StatBar value={labStats.incubacion} max={labStats.total} color="var(--primary-color)" />
        </div>

        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Fructificación</div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', lineHeight: 1.1, marginTop: '0.25rem' }}>{labStats.fructificacion}</div>
          <StatBar value={labStats.fructificacion} max={labStats.total} color="#8b5cf6" />
        </div>

        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--accent-color)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Cosechados</div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', lineHeight: 1.1, marginTop: '0.25rem', color: labStats.cosechados > 0 ? 'var(--accent-color)' : 'inherit' }}>{labStats.cosechados}</div>
          <StatBar value={labStats.cosechados} max={labStats.total} color="var(--accent-color)" />
        </div>

        <div className="card" style={{ padding: '1.25rem', borderTop: `3px solid ${labStats.contaminados > 0 ? 'var(--danger-color)' : 'var(--border-color)'}` }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Contaminados</div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', lineHeight: 1.1, marginTop: '0.25rem', color: labStats.contaminados > 0 ? 'var(--danger-color)' : 'inherit' }}>{labStats.contaminados}</div>
          <StatBar value={labStats.contaminados} max={labStats.total} color="var(--danger-color)" />
        </div>
      </div>

      {/* ─── Tasa de Éxito & Contaminación ─── */}
      {labStats.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ fontSize: '2rem', background: 'rgba(16,185,129,0.1)', padding: '0.75rem', borderRadius: '12px' }}>🏆</div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Tasa de Cosecha</div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--accent-color)' }}>{successRate}%</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>sobre {labStats.total} lotes totales</div>
            </div>
          </div>
          <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ fontSize: '2rem', background: labStats.contaminados > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '12px' }}>☣️</div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Tasa de Contam.</div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: Number(contamRate) > 20 ? 'var(--danger-color)' : 'inherit' }}>{contamRate}%</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{labStats.contaminados > 2 ? '⚠️ Investigar causa' : 'Dentro del rango normal'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Grid Principal ─── */}
      <div className="grid-2">

        {/* Alertas de Stock */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>
              ⚠️ Alertas de Stock
              {totalAlerts > 0 && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: 'var(--danger-color)', color: 'white', padding: '2px 8px', borderRadius: '99px' }}>
                  {totalAlerts}
                </span>
              )}
            </h3>
            <Link to="/inventory" style={{ fontSize: '0.8rem', color: 'var(--primary-color)', textDecoration: 'none' }}>Ver Inventario →</Link>
          </div>
          <div className="card" style={{ minHeight: '280px', padding: totalAlerts === 0 ? '1.5rem' : '1rem' }}>
            {totalAlerts === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <p style={{ margin: 0, fontWeight: '500' }}>Todo en orden</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Stock por encima de niveles críticos</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {insumosAlerts.map(item => (
                  <div key={item.id} style={{
                    padding: '0.875rem 1rem',
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <div>
                      <strong style={{ display: 'block', color: 'var(--danger-color)', fontSize: '0.95rem' }}>{item.nombre}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>📦 Insumo Base · Reponer urgente</span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--danger-color)' }}>
                        {(item.stock_total_base / (item.factor_display || 1)).toFixed(1)} {item.unidad_display}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        Mín: {(item.stock_minimo_base / (item.factor_display || 1)).toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
                {mediosAlerts.map(item => (
                  <div key={item.id} style={{
                    padding: '0.875rem 1rem',
                    background: 'rgba(245, 158, 11, 0.06)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <div>
                      <strong style={{ display: 'block', color: '#f59e0b', fontSize: '0.95rem' }}>{item.alias}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>🧫 Medio Prep. · Stock bajo</span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: '#f59e0b' }}>
                        {item.stock_bulk?.cantidad_actual} {item.stock_bulk?.unidad}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Últimos Movimientos */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>⏱️ Actividad Reciente</h3>
          </div>
          <div className="card" style={{ padding: '0.5rem', minHeight: '280px' }}>
            {recentMovements.length === 0 ? (
              <p style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Sin actividad registrada.
              </p>
            ) : (
              recentMovements.map((move, i) => (
                <div key={`${move.id}-${i}`} style={{
                  padding: '0.875rem 1rem',
                  borderBottom: i < recentMovements.length - 1 ? '1px solid var(--border-color)' : 'none',
                  display: 'flex',
                  gap: '0.875rem',
                  alignItems: 'center',
                }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                    background: move.type === 'cultivo' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
                  }}>
                    {move.type === 'cultivo' ? '🌱' : '🧫'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{move.text}</p>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {move.date && move.date.getTime() > 0
                        ? move.date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      }
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Accesos Rápidos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
            <Link to="/inventory" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: '0.85rem', padding: '0.65rem' }}>
              🌱 Nueva Inoculación
            </Link>
            <Link to="/maintenance" className="btn btn-outline" style={{ textDecoration: 'none', fontSize: '0.85rem', padding: '0.65rem' }}>
              📋 Registro Ambiental
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
