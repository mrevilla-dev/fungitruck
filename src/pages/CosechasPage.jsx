import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import NuevaCosechaModal from '../components/NuevaCosechaModal';

export default function CosechasPage() {
  const [activeTab, setActiveTab] = useState('historial');
  const [cosechas, setCosechas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNuevaCosecha, setShowNuevaCosecha] = useState(false);

  // Filters state
  const [filtros, setFiltros] = useState({
    especie: '',
    fechaDesde: '',
    fechaHasta: '',
    modoCosecha: '',
    operario: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'cosechas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCosechas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Extract unique options for filters
  const especiesUnicas = useMemo(() => {
    const set = new Set();
    cosechas.forEach(c => {
      if (c.especie) set.add(c.especie);
      if (c.batches) c.batches.forEach(b => { if (b.especie) set.add(b.especie); });
    });
    return Array.from(set).sort();
  }, [cosechas]);

  const operariosUnicos = useMemo(() => Array.from(new Set(cosechas.map(c => c.operario).filter(Boolean))).sort(), [cosechas]);
  const modosUnicos = useMemo(() => Array.from(new Set(cosechas.map(c => c.modo_cosecha).filter(Boolean))).sort(), [cosechas]);

  // Apply filters
  const filteredCosechas = useMemo(() => {
    return cosechas.filter(c => {
      // Date filter
      if (filtros.fechaDesde && c.fecha_cosecha < filtros.fechaDesde) return false;
      if (filtros.fechaHasta && c.fecha_cosecha > filtros.fechaHasta) return false;
      
      // Mode filter
      if (filtros.modoCosecha && c.modo_cosecha !== filtros.modoCosecha) return false;
      
      // Operator filter
      if (filtros.operario && c.operario !== filtros.operario) return false;

      // Species filter (handle both individual and grupal)
      if (filtros.especie) {
        if (c.modo_cosecha === 'individual' && c.especie !== filtros.especie) return false;
        if (c.batches && !c.batches.some(b => b.especie === filtros.especie)) return false;
      }

      return true;
    });
  }, [cosechas, filtros]);

  // General KPIs (Filtered)
  const totalPesoFresco = filteredCosechas.reduce((acc, c) => acc + (c.peso_fresco || 0), 0);
  
  // Metrics by species
  const metricsByEspecie = useMemo(() => {
    const stats = {};
    filteredCosechas.forEach(c => {
      const isGrupal = c.modo_cosecha === 'grupal' || c.modo_cosecha === 'sector';
      const partes = isGrupal && c.batches ? c.batches : [{
        especie: c.especie || 'Desconocida',
        eb: c.eficiencia_biologica || 0,
        tpb: c.tpb || 0, // TPB guardado en el registro
      }];

      partes.forEach(p => {
        const esp = p.especie || 'Desconocida';
        if (!stats[esp]) stats[esp] = { countEB: 0, sumEB: 0, countTPB: 0, sumTPB: 0 };
        
        // EB
        const eb = isGrupal ? (c.eficiencia_biologica || 0) : (p.eb || 0);
        if (eb > 0) {
          stats[esp].sumEB += eb;
          stats[esp].countEB++;
        }

        // TPB
        const tpb = isGrupal ? (c.tpb || 0) : (p.tpb || 0);
        if (tpb > 0) {
          stats[esp].sumTPB += tpb;
          stats[esp].countTPB++;
        }
      });
    });

    return Object.entries(stats).map(([esp, data]) => ({
      especie: esp,
      avgEB: data.countEB > 0 ? (data.sumEB / data.countEB).toFixed(1) : 0,
      avgTPB: data.countTPB > 0 ? (data.sumTPB / data.countTPB).toFixed(2) : 0
    }));
  }, [filteredCosechas]);

  // Consolidación por Lote (Filtered)
  const consolidated = useMemo(() => {
    return filteredCosechas.reduce((acc, c) => {
      const isGrupal = c.modo_cosecha === 'grupal' || c.modo_cosecha === 'sector';
      const partes = isGrupal && c.batches ? c.batches : [{
        batchId: c.batchId,
        especie: c.especie,
        peso_fresco_repartido: c.peso_fresco || 0,
        peso_seco_sustrato: c.peso_seco_sustrato,
        agotado: c.es_cosecha_final
      }];

      partes.forEach(p => {
        if (!acc[p.batchId]) {
          acc[p.batchId] = {
            batchId: p.batchId,
            especie: p.especie,
            peso_fresco_total: 0,
            peso_seco_sustrato: p.peso_seco_sustrato || c.peso_seco_sustrato,
            oleadas: 0,
            isFinal: false,
            fechaInicio: c.fecha_cosecha,
            fechaFin: c.fecha_cosecha
          };
        }
        acc[p.batchId].peso_fresco_total += (p.peso_fresco_repartido || 0);
        acc[p.batchId].oleadas += 1;
        if (p.agotado) acc[p.batchId].isFinal = true;
        
        if (c.fecha_cosecha < acc[p.batchId].fechaInicio) acc[p.batchId].fechaInicio = c.fecha_cosecha;
        if (c.fecha_cosecha > acc[p.batchId].fechaFin) acc[p.batchId].fechaFin = c.fecha_cosecha;
      });
      
      return acc;
    }, {});
  }, [filteredCosechas]);

  const consolidatedList = Object.values(consolidated).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));

  if (loading) return <div className="p-4">Cargando datos...</div>;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800' }}>Cosechas y Rendimientos</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Análisis global de producción</p>
        </div>
        <button 
          className="btn" 
          style={{ background: 'var(--accent-color)', color: 'white', fontWeight: 'bold', padding: '0.6rem 1.2rem' }}
          onClick={() => setShowNuevaCosecha(true)}
        >
          🧺 + Nueva Cosecha
        </button>
      </div>

      {/* FILTROS */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', fontSize: '1rem' }}>Filtros</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Especie</label>
            <select className="form-control" value={filtros.especie} onChange={e => setFiltros({...filtros, especie: e.target.value})}>
              <option value="">Todas</option>
              {especiesUnicas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Modo de Cosecha</label>
            <select className="form-control" value={filtros.modoCosecha} onChange={e => setFiltros({...filtros, modoCosecha: e.target.value})}>
              <option value="">Todos</option>
              {modosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Operario</label>
            <select className="form-control" value={filtros.operario} onChange={e => setFiltros({...filtros, operario: e.target.value})}>
              <option value="">Todos</option>
              {operariosUnicos.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Desde</label>
            <input type="date" className="form-control" value={filtros.fechaDesde} onChange={e => setFiltros({...filtros, fechaDesde: e.target.value})} />
          </div>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Hasta</label>
            <input type="date" className="form-control" value={filtros.fechaHasta} onChange={e => setFiltros({...filtros, fechaHasta: e.target.value})} />
          </div>

        </div>
        
        {Object.values(filtros).some(v => v !== '') && (
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button className="btn btn-outline" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setFiltros({especie:'', fechaDesde:'', fechaHasta:'', modoCosecha:'', operario:''})}>
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* METRICAS */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
         <div className="card" style={{ padding: '1rem 1.5rem', textAlign: 'center', flex: 1, minWidth: '150px' }}>
           <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Fresco Total (Filtrado)</div>
           <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{(totalPesoFresco / 1000).toFixed(2)} kg</div>
         </div>
         
         {metricsByEspecie.map(m => (
           <div key={m.especie} className="card" style={{ padding: '1rem 1.5rem', flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
             <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
               {m.especie}
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                 <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>EB Prom.</div>
                 <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{m.avgEB}%</div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>TPB Prom.</div>
                 <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981' }}>{m.avgTPB}</div>
               </div>
             </div>
           </div>
         ))}
      </div>

      {/* TABS */}
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

      {/* CONTENIDO TABS */}
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
              {filteredCosechas.map(c => {
                const isGrupal = c.modo_cosecha === 'grupal' || c.modo_cosecha === 'sector';
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>{new Date(c.fecha_cosecha).toLocaleDateString('es-AR')}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '600' }}>
                        {isGrupal ? `Múltiples Lotes (${c.batches?.length || 0})` : c.batchId}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {isGrupal ? 'Cosecha Consolidada' : c.especie}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {isGrupal ? '-' : `#${c.numero_oleada || 1}`}
                    </td>
                    <td style={{ padding: '1rem' }}>{c.peso_fresco?.toFixed?.(1) || c.peso_fresco} g</td>
                    <td style={{ padding: '1rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>{c.eficiencia_biologica?.toFixed(1) || 0}%</td>
                    <td style={{ padding: '1rem' }}>
                      {c.es_cosecha_final ? 
                        <span style={{ fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>FINAL</span> 
                        : <span style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{isGrupal ? 'MÚLTIPLE' : 'PARCIAL'}</span>}
                    </td>
                  </tr>
                );
              })}
              {filteredCosechas.length === 0 && (
                <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay resultados con los filtros actuales.</td></tr>
              )}
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
                    <td style={{ padding: '1rem' }}>{b.peso_fresco_total.toFixed(1)} g</td>
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
              {consolidatedList.length === 0 && (
                <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay resultados con los filtros actuales.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNuevaCosecha && (
        <NuevaCosechaModal
          onClose={() => setShowNuevaCosecha(false)}
          onSaved={() => setShowNuevaCosecha(false)}
        />
      )}
    </div>
  );
}
