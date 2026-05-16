import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import PrintLabelsModal from './PrintLabelsModal';

export default function NuevoMedioModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [isExperimental, setIsExperimental] = useState(false);
  
  const [formData, setFormData] = useState({
    recetaId: '',
    cantidad_preparada: 1000, 
    fecha_preparacion: new Date().toISOString().split('T')[0],
    
    // Campos Serie Experimental
    repeticiones: 1,
    variable_nombre: 'Respiración',
    variable_valores: 'Filtro 3M, Micropore, Sin Filtro',
    prefix_alias: 'EXP1',
    
    // Control de Calidad
    ph_real: '',
    densidad_real_brix: '',
    osmolaridad_real_mOsm: ''
  });

  useEffect(() => {
    const q = query(collection(db, "recetas"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecetas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.recetaId) return alert("Seleccioná una receta");
    setLoading(true);

    try {
      const receta = recetas.find(r => r.id === formData.recetaId);
      const itemsToCreate = isExperimental ? Number(formData.repeticiones) : 1;
      const variableValoresArr = formData.variable_valores.split(',').map(v => v.trim());
      const batchesData = [];

      await runTransaction(db, async (transaction) => {
        // 1. Verificar Stock de Insumos Base
        const totalConsumo = {};
        receta.ingredientes.forEach(ing => {
          const factor = (formData.cantidad_preparada * itemsToCreate) / receta.rendimiento_teorico.cantidad;
          totalConsumo[ing.insumoId] = (totalConsumo[ing.insumoId] || 0) + (ing.cantidad * factor);
        });

        const insumosRefs = {};
        const insumosDocs = {};

        for (const insumoId in totalConsumo) {
          insumosRefs[insumoId] = doc(db, 'insumos_base', insumoId);
          const insumoSnap = await transaction.get(insumosRefs[insumoId]);
          
          if (!insumoSnap.exists()) {
            throw new Error(`Insumo base no encontrado: ${insumoId}`);
          }
          
          const currentStock = insumoSnap.data().stock_total_base;
          if (currentStock < totalConsumo[insumoId]) {
            throw new Error(`Stock insuficiente de ${insumoSnap.data().nombre}. Requerido: ${totalConsumo[insumoId].toFixed(1)}${insumoSnap.data().unidad_base}, Disponible: ${currentStock.toFixed(1)}${insumoSnap.data().unidad_base}`);
          }
          
          insumosDocs[insumoId] = insumoSnap.data();
        }

        // 2. Descontar Stock
        for (const insumoId in totalConsumo) {
          transaction.update(insumosRefs[insumoId], {
            stock_total_base: insumosDocs[insumoId].stock_total_base - totalConsumo[insumoId]
          });
        }

        // 3. Crear Lotes en Medios Preparados
        const experimentId = isExperimental ? `EXP-${Date.now()}` : null;
        
        for (let i = 0; i < itemsToCreate; i++) {
          const newMedioRef = doc(collection(db, 'medios_preparados'));
          const variableValue = isExperimental ? variableValoresArr[i % variableValoresArr.length] : null;
          const alias = isExperimental 
            ? `${formData.prefix_alias}-P${i + 1}` 
            : `MP-${formData.recetaId.toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-4)}`;

          const data = {
            id: newMedioRef.id,
            alias: alias,
            recetaId: receta.id,
            nombre_receta: receta.nombre,
            tipo: receta.categoria,
            estado: 'Bulk',
            stock_bulk: {
              cantidad_inicial: Number(formData.cantidad_preparada),
              cantidad_actual: Number(formData.cantidad_preparada),
              unidad: receta.rendimiento_teorico.unidad
            },
            stock_fraccionado: {
              cantidad_actual: 0,
              unidad_final: receta.categoria === 'Agar' ? 'Placas Petri' : 'Bolsas/Frascos'
            },
            trazabilidad: {
              insumos_consumidos: receta.ingredientes.map(ing => ({
                insumoId: ing.insumoId,
                cantidad: (formData.cantidad_preparada / receta.rendimiento_teorico.cantidad) * ing.cantidad
              })),
              fecha_preparacion: formData.fecha_preparacion,
              operador: 'Sistema',
              qc: {
                ph_real: formData.ph_real ? Number(formData.ph_real) : null,
                densidad_real_brix: formData.densidad_real_brix ? Number(formData.densidad_real_brix) : null,
                osmolaridad_real_mOsm: formData.osmolaridad_real_mOsm ? Number(formData.osmolaridad_real_mOsm) : null
              }
            },
            createdAt: serverTimestamp()
          };

          if (isExperimental) {
            data.experimentId = experimentId;
            data.variables_experimentales = {
              [formData.variable_nombre]: variableValue
            };
          }

          transaction.set(newMedioRef, data);
          batchesData.push(data);
        }

        if (isExperimental) {
          const expRef = doc(db, 'experimentos', experimentId);
          transaction.set(expRef, {
            id: experimentId,
            titulo: `${receta.nombre} - ${formData.prefix_alias}`,
            factores: [formData.variable_nombre],
            fecha_inicio: formData.fecha_preparacion,
            createdAt: serverTimestamp()
          });
        }
      });

      setCreatedBatches(batchesData);
      setSuccess(true);
    } catch (error) {
      console.error("Error al crear medio:", error);
      alert(error.message || "Error al procesar la operación");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <PrintLabelsModal 
        batches={createdBatches} 
        onClose={() => {
          onSaved();
          onClose();
        }} 
      />
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>🧫 Preparar Nuevo Medio / Lote</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Configuración Base</h4>
            
            <div className="form-group">
              <label className="form-label">Seleccionar Receta</label>
              <select 
                className="form-control" 
                required 
                value={formData.recetaId} 
                onChange={e => setFormData({...formData, recetaId: e.target.value})}
              >
                <option value="">-- Seleccioná una receta --</option>
                {recetas.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre} ({r.categoria})</option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Cantidad a Preparar</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="number" 
                    className="form-control" 
                    required 
                    value={formData.cantidad_preparada} 
                    onChange={e => setFormData({...formData, cantidad_preparada: e.target.value})} 
                  />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {recetas.find(r => r.id === formData.recetaId)?.rendimiento_teorico.unidad || 'ml/g'}
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.fecha_preparacion} 
                  onChange={e => setFormData({...formData, fecha_preparacion: e.target.value})} 
                />
              </div>
            </div>
          </div>

          {/* Control de Calidad QC */}
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>Control de Calidad (QC)</h4>
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label className="form-label">pH Real</label>
                <input 
                  type="number" step="0.1" 
                  className="form-control" 
                  value={formData.ph_real} 
                  onChange={e => setFormData({...formData, ph_real: e.target.value})} 
                  placeholder="6.5"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Densidad (°Brix)</label>
                <input 
                  type="number" step="0.1" 
                  className="form-control" 
                  value={formData.densidad_real_brix} 
                  onChange={e => setFormData({...formData, densidad_real_brix: e.target.value})} 
                  placeholder="12.5"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Osmolaridad (mOsm)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={formData.osmolaridad_real_mOsm} 
                  onChange={e => setFormData({...formData, osmolaridad_real_mOsm: e.target.value})} 
                  placeholder="300"
                />
              </div>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              💡 Medir preferentemente antes de agregar el agar.
            </p>
          </div>

          {/* Toggle Serie Experimental */}
          <div style={{ 
            background: 'rgba(59, 130, 246, 0.05)', 
            padding: '1rem', 
            borderRadius: '12px',
            border: `1px solid ${isExperimental ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isExperimental ? '1rem' : 0 }}>
              <div>
                <strong style={{ display: 'block' }}>Serie Experimental</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Crear múltiples unidades con variables controladas</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={isExperimental} onChange={() => setIsExperimental(!isExperimental)} />
                <span className="slider round"></span>
              </label>
            </div>

            {isExperimental && (
              <div className="animate-fade-in" style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Repeticiones (Lotes)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={formData.repeticiones} 
                      onChange={e => setFormData({...formData, repeticiones: e.target.value})} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alias Prefijo</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Ej: EXP1"
                      value={formData.prefix_alias} 
                      onChange={e => setFormData({...formData, prefix_alias: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre de Variable (Factor)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Ej: Tipo de Filtro"
                    value={formData.variable_nombre} 
                    onChange={e => setFormData({...formData, variable_nombre: e.target.value})} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valores (separados por coma)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Filtro A, Filtro B, Control"
                    value={formData.variable_valores} 
                    onChange={e => setFormData({...formData, variable_valores: e.target.value})} 
                  />
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    💡 Se asignarán cíclicamente a los {formData.repeticiones} lotes.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Preparando...' : 'Registrar Medio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
