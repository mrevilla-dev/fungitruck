import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

function Home() {
  const [recentBatches, setRecentBatches] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Recent Batches
    const bQuery = query(collection(db, "batches"), orderBy("createdAt", "desc"), limit(5));
    const unsubscribeB = onSnapshot(bQuery, (snap) => {
      setRecentBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Recent Activity (Tracking)
    const tQuery = query(collection(db, "tracking"), orderBy("createdAt", "desc"), limit(5));
    const unsubscribeT = onSnapshot(tQuery, (snap) => {
      setRecentActivity(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeB();
      unsubscribeT();
    };
  }, []);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2.5rem' }}>🍄</div>
        <div>
          <h1 style={{ margin: 0 }}>FungiTrack</h1>
          <p style={{ margin: 0 }}>Panel de Control del Laboratorio</p>
        </div>
      </div>

      <div className="grid-2">
        {/* COLUMNA 1: ACCIONES Y STATS */}
        <div>
          <h3>Acciones Rápidas</h3>
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Link to="/new" className="btn btn-primary" style={{ textDecoration: 'none', height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>➕</span>
              <span>Inocular</span>
            </Link>
            <Link to="/scan" className="btn btn-outline" style={{ textDecoration: 'none', height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>📷</span>
              <span>Escanear</span>
            </Link>
            <Link to="/maintenance" className="btn btn-outline" style={{ textDecoration: 'none', height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>🧹</span>
              <span>Mantenimiento</span>
            </Link>
            <Link to="/esporomas" className="btn btn-outline" style={{ textDecoration: 'none', height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>🧬</span>
              <span>Ejemplares</span>
            </Link>
          </div>

          <h3>Últimos Registros</h3>
          <div className="card" style={{ padding: '0.5rem' }}>
            {recentActivity.length === 0 ? (
              <p style={{ padding: '1rem' }}>No hay actividad reciente.</p>
            ) : (
              recentActivity.map(act => (
                <div key={act.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <strong>{act.batchId}</strong>
                    <span>{new Date(act.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>{act.status}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMNA 2: LOTES RECIENTES */}
        <div>
          <h3>Lotes Recientes</h3>
          {loading ? (
            <div className="card">Cargando lotes...</div>
          ) : recentBatches.length === 0 ? (
            <div className="card">No hay lotes registrados aún.</div>
          ) : (
            recentBatches.map(batch => (
              <div key={batch.id} className="card" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🧪</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '1rem' }}>{batch.id}</strong>
                    <span className="sala-tipo" style={{ fontSize: '0.6rem' }}>G{batch.generacion}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>{batch.genero} {batch.especie}</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>📍 {batch.destinoNombre}</p>
                </div>
              </div>
            ))
          )}
          <Link to="/scan" className="btn btn-outline" style={{ textDecoration: 'none' }}>Ver todos los lotes (Escáner)</Link>
        </div>
      </div>
    </div>
  );
}

export default Home;
