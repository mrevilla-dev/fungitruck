import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

export default function AuditInsumoModal({ lote, onClose }) {
  const [loading, setLoading] = useState(true);
  const [affectedMedios, setAffectedMedios] = useState([]);
  const [affectedBatches, setAffectedBatches] = useState([]);
  const [loteStatus, setLoteStatus] = useState(lote.estado_apertura || 'Cerrado');

  useEffect(() => {
    fetchImpact();
  }, [lote.id]);

  const fetchImpact = async () => {
    setLoading(true);
    try {
      // 1. Buscar Medios Preparados que consumieron este loteId
      // Firestore no permite queries profundas en arrays de objetos fácilmente con where, 
      // así que buscaremos todos los medios y filtraremos en cliente para este caso específico 
      // (asumiendo que el volumen de medios no es de millones).
      const mediosSnap = await getDocs(collection(db, "medios_preparados"));
      const medios = mediosSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(m => m.trazabilidad?.insumos_consumidos?.some(i => i.loteId === lote.id));
      
      setAffectedMedios(medios);

      // 2. Buscar Cultivos (batches) que se inocularon con esos medios
      if (medios.length > 0) {
        const medioIds = medios.map(m => m.id);
        const batchesSnap = await getDocs(query(
          collection(db, "batches"), 
          where("medioPrepId", "in", medioIds.slice(0, 10)) // Limitado a 10 por restricción de 'in' en Firestore
        ));
        setAffectedBatches(batchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (err) {
      console.error("Error en auditoría:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      await updateDoc(doc(db, "insumos_lotes", lote.id), {
        estado_apertura: newStatus
      });
      setLoteStatus(newStatus);
      alert("✅ Estado del lote actualizado.");
    } catch (err) {
      alert("Error al actualizar estado.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>🔍 Auditoría de Lote: {lote.lote_interno}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          
          <div className="card" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{lote.nombre_insumo}</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Prov: {lote.proveedor} | Ingreso: {lote.fecha_ingreso}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn ${loteStatus === 'Abierto' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  onClick={() => handleUpdateStatus('Abierto')}
                >Abierto</button>
                <button 
                  className={`btn ${loteStatus === 'Contaminado' ? 'btn-danger' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  onClick={() => handleUpdateStatus('Contaminado')}
                >⚠️ Contaminado</button>
                <button 
                  className={`btn ${loteStatus === 'Cerrado' ? 'btn-outline' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  onClick={() => handleUpdateStatus('Cerrado')}
                >Cerrado</button>
              </div>
            </div>
          </div>

          <div className="impact-analysis">
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>📉 Análisis de Impacto (Efecto Mancha)</h4>
            
            {loading ? (
              <p>Rastreando trazabilidad...</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div className="stat-card">
                  <strong>{affectedMedios.length}</strong> Medios preparados con este lote.
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', maxHeight: '100px', overflowY: 'auto' }}>
                    {affectedMedios.map(m => <div key={m.id}>- {m.alias} ({m.nombre_receta})</div>)}
                  </div>
                </div>

                <div className="stat-card" style={{ borderLeft: `4px solid ${affectedBatches.length > 0 ? 'var(--danger-color)' : 'var(--accent-color)'}` }}>
                  <strong>{affectedBatches.length}</strong> Cultivos finales en riesgo.
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {affectedBatches.length > 0 ? (
                      affectedBatches.map(b => (
                        <div key={b.id} style={{ padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          🔴 {b.id} - {b.genero} {b.especie} (Estado: {b.status})
                        </div>
                      ))
                    ) : (
                      <p style={{ color: 'var(--accent-color)' }}>✅ No se detectaron cultivos finales afectados.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-outline" onClick={onClose}>Cerrar Auditoría</button>
          </div>
        </div>
      </div>
    </div>
  );
}
