import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import toast from 'react-hot-toast';


export default function AuditInsumoModal({ lote, onClose }) {
  const [loading, setLoading] = useState(true);
  const [affectedMedios, setAffectedMedios] = useState([]);
  const [affectedBatches, setAffectedBatches] = useState([]);
  const [insumoMaster, setInsumoMaster] = useState(null);
  const [loteStatus, setLoteStatus] = useState(lote.estado_apertura || 'Cerrado');
  const [estadoActual, setEstadoActual] = useState(lote.estado_actual || lote.estado_reutilizable || 'Disponible');
  const [fechaMantenimiento, setFechaMantenimiento] = useState(lote.fecha_mantenimiento || '');
  const [proximoMantenimiento, setProximoMantenimiento] = useState(lote.proximo_mantenimiento || '');
  const [observaciones, setObservaciones] = useState(lote.observaciones || '');
  const [isSavingObs, setIsSavingObs] = useState(false);

  useEffect(() => {
    fetchImpact();
    fetchMaster();
  }, [lote.id]);

  const fetchMaster = async () => {
    try {
      const docSnap = await getDoc(doc(db, "insumos_base", lote.insumoId));
      if (docSnap.exists()) {
        const masterData = docSnap.data();
        setInsumoMaster(masterData);
        if (!lote.estado_actual && !lote.estado_reutilizable && masterData.categoria === 'Equipamiento') {
          setEstadoActual('En Servicio');
        }
      }
    } catch (e) { console.error(e); }
  };

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
        estado_apertura: newStatus,
        updatedAt: serverTimestamp()
      });

      setLoteStatus(newStatus);
      toast.success("Estado del lote actualizado.");
    } catch (err) {
      toast.error("Error al actualizar estado.");
    }
  };

  const handleUpdateReutilizableStatus = async (newStatus) => {
    try {
      const isBaja = newStatus === 'Roto / De Baja';
      const wasBaja = estadoActual === 'Roto / De Baja';
      
      await runTransaction(db, async (transaction) => {
        const loteRef = doc(db, "insumos_lotes", lote.id);
        const masterRef = doc(db, "insumos_base", lote.insumoId);
        const masterSnap = await transaction.get(masterRef);
        
        transaction.update(loteRef, {
          estado_actual: newStatus,
          updatedAt: serverTimestamp()
        });

        if (isBaja && !wasBaja) {
          // Descontar del stock total operativo
          const newStock = Math.max(0, (masterSnap.data().stock_total_base || 0) - (lote.cantidad_base_actual || 1));
          transaction.update(masterRef, { stock_total_base: newStock });
        } else if (!isBaja && wasBaja) {
          // Si por error se vuelve a poner disponible, recuperar stock
          const newStock = (masterSnap.data().stock_total_base || 0) + (lote.cantidad_base_actual || 1);
          transaction.update(masterRef, { stock_total_base: newStock });
        }
      });

      setEstadoActual(newStatus);
      toast.success("Estado reutilizable actualizado.");
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar estado.");
    }
  };

  const handleSaveObservations = async () => {
    setIsSavingObs(true);
    try {
      await updateDoc(doc(db, "insumos_lotes", lote.id), {
        observaciones: observaciones,
        fecha_mantenimiento: fechaMantenimiento,
        proximo_mantenimiento: proximoMantenimiento,
        updatedAt: serverTimestamp()
      });
      toast.success("Datos guardados correctamente.");
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar observaciones.");
    } finally {
      setIsSavingObs(false);
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {insumoMaster?.imageUrl && (
                  <img 
                    src={insumoMaster.imageUrl} 
                    alt="Producto" 
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer' }}
                    onClick={() => window.open(insumoMaster.imageUrl, '_blank')}
                  />
                )}
                <div>
                  <strong>{lote.nombre_insumo}</strong>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Prov: {lote.proveedor} | Ingreso: {lote.fecha_ingreso}</p>
                </div>
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
                  className={`btn ${loteStatus === 'Cerrado' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  onClick={() => handleUpdateStatus('Cerrado')}
                >Cerrado</button>
                <button 
                  className={`btn ${loteStatus === 'Hidratado' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '4px 8px', borderColor: '#3b82f6', color: loteStatus === 'Hidratado' ? 'white' : '#3b82f6' }}
                  onClick={() => handleUpdateStatus('Hidratado')}
                >💧 Hidratado</button>
              </div>
            </div>
          </div>

          {insumoMaster?.categoria === 'Reutilizables' && (
            <div className="card animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem' }}>
              <h4 style={{ color: 'var(--primary-color)', fontSize: '0.8rem', marginBottom: '1rem' }}>🔄 Ciclo de Vida Reutilizable</h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Disponible', 'En Uso', 'En Lavado', 'Roto / De Baja'].map(st => (
                  <button 
                    key={st}
                    className={`btn ${estadoActual === st ? 'btn-primary' : 'btn-outline'}`}
                    style={{ 
                      flex: 1, 
                      fontSize: '0.75rem', 
                      minWidth: '100px',
                      background: estadoActual === st ? (st === 'Roto / De Baja' ? 'var(--danger-color)' : (st === 'En Uso' ? '#f59e0b' : 'var(--primary-color)')) : 'transparent',
                      borderColor: st === 'Roto / De Baja' ? 'var(--danger-color)' : (st === 'En Uso' ? '#f59e0b' : 'var(--primary-color)'),
                      color: estadoActual === st ? 'white' : (st === 'Roto / De Baja' ? 'var(--danger-color)' : (st === 'En Uso' ? '#f59e0b' : 'var(--primary-color)'))
                    }}
                    onClick={() => handleUpdateReutilizableStatus(st)}
                  >{st}</button>
                ))}
              </div>
              
              {estadoActual === 'Roto / De Baja' && (
                <div style={{ marginTop: '1rem', color: 'var(--danger-color)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  ⚠️ Este ítem ha sido descontado del stock operativo. Por favor registre la causa en las notas abajo.
                </div>
              )}
            </div>
          )}

          {insumoMaster?.categoria === 'Equipamiento' && (
            <div className="card animate-fade-in" style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1.25rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--primary-color)', fontSize: '0.9rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚙️ Gestión de Estado y Mantenimiento
              </h4>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {['En Servicio', 'En Reparación', 'Baja'].map(st => (
                  <button 
                    key={st}
                    className={`btn ${estadoActual === st ? 'btn-primary' : 'btn-outline'}`}
                    style={{ 
                      flex: 1, 
                      fontSize: '0.8rem',
                      background: estadoActual === st ? (st === 'Baja' ? 'var(--danger-color)' : (st === 'En Reparación' ? '#f59e0b' : 'var(--primary-color)')) : 'transparent',
                      borderColor: st === 'Baja' ? 'var(--danger-color)' : (st === 'En Reparación' ? '#f59e0b' : 'var(--primary-color)'),
                    }}
                    onClick={() => handleUpdateReutilizableStatus(st)}
                  >
                    {st === 'En Servicio' ? '✅ ' : (st === 'En Reparación' ? '🛠️ ' : '🚫 ')}
                    {st}
                  </button>
                ))}
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Último Mantenimiento</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={fechaMantenimiento} 
                    onChange={e => setFechaMantenimiento(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Próximo Mantenimiento</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={proximoMantenimiento} 
                    onChange={e => setProximoMantenimiento(e.target.value)} 
                  />
                </div>
              </div>
            </div>
          )}

          <div className="observations-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>📝 Notas de Auditoría</h4>
            <textarea 
              className="form-control"
              style={{ minHeight: '100px', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)' }}
              placeholder="Escribe aquí cualquier hallazgo o nota sobre este lote..."
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

          <div className="impact-analysis" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
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
