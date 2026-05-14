import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function CosechasPage() {
  const [activeTab, setActiveTab] = useState('historial');
  const [cosechas, setCosechas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'cosechas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCosechas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // KPIs
  const totalPesoFresco = cosechas.reduce((acc, c) => acc + (c.peso_fresco || 0), 0);
  const avgEB = cosechas.length > 0 
    ? (cosechas.reduce((acc, c) => acc + (c.eficiencia_biologica || 0), 0) / cosechas.length).toFixed(1)
    : 0;

  // Consolidación por Lote
  const consolidated = cosechas.reduce((acc, c) => {
    if (!acc[c.batchId]) {
      acc[c.batchId] = {
        batchId: c.batchId,
        especie: c.especie,
        peso_fresco_total: 0,
        peso_seco_sustrato: c.peso_seco_sustrato,
        oleadas: 0,
        isFinal: false,
        fechaInicio: c.fecha_cosecha,
        fechaFin: c.fecha_cosecha
      };
    }
    acc[c.batchId].peso_fresco_total += (c.peso_fresco || 0);
    acc[c.batchId].oleadas += 1;
    if (c.es_cosecha_final) acc[c.batchId].isFinal = true;
    
    // Track dates
    if (c.fecha_cosecha < acc[c.batchId].fechaInicio) acc[c.batchId].fechaInicio = c.fecha_cosecha;
    if (c.fecha_cosecha > acc[c.batchId].fechaFin) acc[c.batchId].fechaFin = c.fecha_cosecha;
    
    return acc;
  }, {});

  const consolidatedList = Object.values(consolidated).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));

  if (loading) return <div className="p-4">Cargando datos...</div>;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800' }}>Cosechas y Rendimientos</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Análisis de Eficiencia Biológica (EB%)</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
           <div className="card" style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>
             <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Total Cosechado</div>
             <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{(totalPesoFresco / 1000).toFixed(2)} kg</div>
           </div>
           <div className="card" style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>
             <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>EB Promedio</div>
             <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{avgEB}%</div>
           </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          className={`btn ${activeTab === 'historial' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('historial')}
          style={{ width: 'auto' }}
        >
          ⏱️ Historial de Oleadas
        </button>
        <button 
          className={`btn ${activeTab === 'consolidado' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('consolidado')}
          style={{ width: 'auto' }}
        >
          📊 Rendimiento por Lote
        </button>
      </div>

      {activeTab === 'historial' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Fecha</th>
                <th style={{ padding: '1rem' }}>Lote / Especie</th>
                <th style={{ padding: '1rem' }}>Oleada</th>
                <th style={{ padding: '1rem' }}>Peso Fresco</th>
                <th style={{ padding: '1rem' }}>EB%</th>
                <th style={{ padding: '1rem' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cosechas.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{new Date(c.fecha_cosecha).toLocaleDateString('es-AR')}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '600' }}>{c.batchId}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.especie}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>#{c.numero_oleada || 1}</td>
                  <td style={{ padding: '1rem' }}>{c.peso_fresco} g</td>
                  <td style={{ padding: '1rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>{c.eficiencia_biologica}%</td>
                  <td style={{ padding: '1rem' }}>
                    {c.es_cosecha_final ? 
                      <span style={{ fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>FINAL</span> 
                      : <span style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>PARCIAL</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Lote</th>
                <th style={{ padding: '1rem' }}>Especie</th>
                <th style={{ padding: '1rem' }}>Oleadas</th>
                <th style={{ padding: '1rem' }}>Peso Total</th>
                <th style={{ padding: '1rem' }}>EB% Acumulada</th>
                <th style={{ padding: '1rem' }}>Estado Lote</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedList.map(b => {
                const ebAcum = ((b.peso_fresco_total / b.peso_seco_sustrato) * 100).toFixed(1);
                return (
                  <tr key={b.batchId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold', fontFamily: 'monospace' }}>{b.batchId}</td>
                    <td style={{ padding: '1rem' }}>{b.especie}</td>
                    <td style={{ padding: '1rem' }}>{b.oleadas}</td>
                    <td style={{ padding: '1rem' }}>{b.peso_fresco_total} g</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '1.1rem' }}>{ebAcum}%</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Sobre {b.peso_seco_sustrato}g seco</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {b.isFinal ? 
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>✅ CERRADO</span> : 
                        <span style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>🌱 ACTIVO</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
