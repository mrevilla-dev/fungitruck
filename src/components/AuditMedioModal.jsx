import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function AuditMedioModal({ medio, onClose }) {
  const [loading, setLoading] = useState(true);
  const [affectedBatches, setAffectedBatches] = useState([]);
  const [insumosInfo, setInsumosInfo] = useState([]);
  const [observaciones, setObservaciones] = useState(medio.observaciones || '');
  const [controlCalidad, setControlCalidad] = useState({
    ph_medido: medio.control_calidad?.ph_medido || '',
    densidad_medida: medio.control_calidad?.densidad_medida || '',
    osmolaridad: medio.control_calidad?.osmolaridad || '',
    peso_muestra_humeda: medio.control_calidad?.peso_muestra_humeda || '',
    peso_muestra_seca: medio.control_calidad?.peso_muestra_seca || ''
  });
  const [isSavingObs, setIsSavingObs] = useState(false);

  useEffect(() => {
    fetchImpact();
  }, [medio.id]);

  const fetchImpact = async () => {
    setLoading(true);
    try {
      // 1. Fetch Insumos Info
      const consumidos = medio.trazabilidad?.insumos_consumidos || [];
      const insumosDetails = [];
      for (const req of consumidos) {
        let nombre = 'Desconocido';
        let loteInterno = req.loteId;
        try {
          if (req.insumoId) {
            const masterSnap = await getDoc(doc(db, "insumos_base", req.insumoId));
            if (masterSnap.exists()) {
              nombre = masterSnap.data().nombre;
            }
          }
          if (req.loteId) {
            const loteSnap = await getDoc(doc(db, "insumos_lotes", req.loteId));
            if (loteSnap.exists()) {
              loteInterno = loteSnap.data().lote_interno;
            }
          }
        } catch (e) {
          console.error(e);
        }
        insumosDetails.push({ ...req, nombre, loteInterno });
      }
      setInsumosInfo(insumosDetails);

      // 2. Fetch affected Batches
      const batchesSnap = await getDocs(query(
        collection(db, "batches"),
        where("medioPrepId", "==", medio.id)
      ));
      setAffectedBatches(batchesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error en auditoría de medio:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveObservations = async () => {
    setIsSavingObs(true);
    try {
      await updateDoc(doc(db, "medios_preparados", medio.id), {
        observaciones: observaciones,
        control_calidad: {
          ph_medido: controlCalidad.ph_medido ? Number(controlCalidad.ph_medido) : null,
          densidad_medida: controlCalidad.densidad_medida ? Number(controlCalidad.densidad_medida) : null,
          osmolaridad: controlCalidad.osmolaridad ? Number(controlCalidad.osmolaridad) : null,
          peso_muestra_humeda: controlCalidad.peso_muestra_humeda ? Number(controlCalidad.peso_muestra_humeda) : null,
          peso_muestra_seca: controlCalidad.peso_muestra_seca ? Number(controlCalidad.peso_muestra_seca) : null
        },
        updatedAt: serverTimestamp()
      });
      toast.success('Observaciones guardadas correctamente.');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar observaciones.');
    } finally {
      setIsSavingObs(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>🔍 Auditoría de Medio: {medio.alias}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          
          <div className="card" style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <strong>{medio.nombre_receta} ({medio.tipo})</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ID: {medio.id} | Preparación: {medio.trazabilidad?.fecha_preparacion || 'Desconocida'}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Operador: {medio.trazabilidad?.operador || 'Sistema'}</p>
                {medio.trazabilidad?.justificacion_stock && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--danger-color)', marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
                    <strong>Excepción Stock:</strong> {medio.trazabilidad.justificacion_stock}
                  </p>
                )}
              </div>
              <div>
                <span className={`btn btn-primary`} style={{ fontSize: '0.8rem', pointerEvents: 'none' }}>
                  {medio.estado}
                </span>
              </div>
            </div>
          </div>

          <div className="impact-analysis" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>📦 Insumos Consumidos</h4>
            {loading ? (
              <p>Cargando insumos...</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {insumosInfo.length > 0 ? (
                  insumosInfo.map((req, i) => (
                    <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{req.nombre}</strong> <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>(Lote: {req.loteInterno})</span></span>
                      <span style={{color: 'var(--accent-color)', fontWeight: 'bold'}}>{req.cantidad.toFixed(2)} consumidos</span>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>No hay trazabilidad de insumos registrada.</p>
                )}
              </div>
            )}
          </div>

          <div className="impact-analysis" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>📉 Análisis de Impacto (Cultivos)</h4>
            {loading ? (
              <p>Rastreando trazabilidad...</p>
            ) : (
              <div className="stat-card" style={{ borderLeft: `4px solid ${affectedBatches.length > 0 ? 'var(--danger-color)' : 'var(--accent-color)'}` }}>
                <strong>{affectedBatches.length}</strong> Cultivos finales inoculados con este medio.
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                  {affectedBatches.length > 0 ? (
                    affectedBatches.map(b => (
                      <div key={b.id} style={{ padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        🍄 {b.id} - {b.genero} {b.especie} (Estado: {b.status})
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--accent-color)' }}>✅ No se detectaron cultivos finales asociados.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="impact-analysis" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>📊 Control de Calidad</h4>
            <div className="grid-2">
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>pH Medido</label>
                <input type="number" step="0.01" className="form-control" style={{ height: '40px' }} value={controlCalidad.ph_medido} onChange={e => setControlCalidad({...controlCalidad, ph_medido: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Densidad (g/ml)</label>
                <input type="number" step="0.01" className="form-control" style={{ height: '40px' }} value={controlCalidad.densidad_medida} onChange={e => setControlCalidad({...controlCalidad, densidad_medida: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Osmolaridad (mOsm/L)</label>
                <input type="number" step="1" className="form-control" style={{ height: '40px' }} value={controlCalidad.osmolaridad} onChange={e => setControlCalidad({...controlCalidad, osmolaridad: e.target.value})} />
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: '0.5rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Peso Muestra Húmeda (g)</label>
                <input type="number" step="0.01" className="form-control" style={{ height: '40px' }} value={controlCalidad.peso_muestra_humeda} onChange={e => setControlCalidad({...controlCalidad, peso_muestra_humeda: e.target.value})} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Peso Muestra Seca (g)</label>
                <input type="number" step="0.01" className="form-control" style={{ height: '40px', borderColor: 'var(--accent-color)' }} value={controlCalidad.peso_muestra_seca} onChange={e => setControlCalidad({...controlCalidad, peso_muestra_seca: e.target.value})} />
              </div>
            </div>
            {controlCalidad.peso_muestra_humeda && controlCalidad.peso_muestra_seca && (
              <div style={{ marginTop: '0.5rem', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                % Humedad: {(((Number(controlCalidad.peso_muestra_humeda) - Number(controlCalidad.peso_muestra_seca)) / Number(controlCalidad.peso_muestra_humeda)) * 100).toFixed(2)}% | 
                % Materia Seca: {((Number(controlCalidad.peso_muestra_seca) / Number(controlCalidad.peso_muestra_humeda)) * 100).toFixed(2)}%
              </div>
            )}
          </div>

          <div className="observations-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>📝 Notas de Auditoría</h4>
            <textarea 
              className="form-control"
              style={{ minHeight: '100px', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)' }}
              placeholder="Escribe aquí cualquier hallazgo o nota sobre este medio..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto' }}
              onClick={handleSaveObservations}
              disabled={isSavingObs}
            >
              {isSavingObs ? 'Guardando...' : '💾 Guardar Notas'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-outline" onClick={onClose}>Cerrar Auditoría</button>
          </div>
        </div>
      </div>
    </div>
  );
}
