import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function RecetaFormModal({ receta, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [insumosBase, setInsumosBase] = useState([]);
  
  const [formData, setFormData] = useState({
    nombre: receta?.nombre || '',
    categoria: receta?.categoria || 'Agar',
    descripcion: receta?.descripcion || '',
    rendimiento_teorico: receta?.rendimiento_teorico || { cantidad: 1000, unidad: 'ml' },
    ingredientes: receta?.ingredientes || [],
    
    // QC Teórico
    densidad_esperada_brix: receta?.densidad_esperada_brix || '',
    osmolaridad_esperada_mOsm: receta?.osmolaridad_esperada_mOsm || ''
  });

  useEffect(() => {
    const q = query(collection(db, "insumos_base"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInsumosBase(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const addIngrediente = () => {
    setFormData({
      ...formData,
      ingredientes: [...formData.ingredientes, { insumoId: '', cantidad: 0 }]
    });
  };

  const removeIngrediente = (index) => {
    const newIngredientes = [...formData.ingredientes];
    newIngredientes.splice(index, 1);
    setFormData({ ...formData, ingredientes: newIngredientes });
  };

  const updateIngrediente = (index, field, value) => {
    const newIngredientes = [...formData.ingredientes];
    newIngredientes[index][field] = value;
    setFormData({ ...formData, ingredientes: newIngredientes });
  };

  // Cálculo de C/N en tiempo real
  const calculateCN = () => {
    let totalC = 0;
    let totalN = 0;

    formData.ingredientes.forEach(ing => {
      const insumo = insumosBase.find(i => i.id === ing.insumoId);
      if (insumo && ing.cantidad > 0) {
        const cPerc = insumo.porcentaje_carbono || 0;
        const nPerc = insumo.porcentaje_nitrogeno || 0;
        totalC += (ing.cantidad * (cPerc / 100));
        totalN += (ing.cantidad * (nPerc / 100));
      }
    });

    if (totalN === 0) return totalC > 0 ? 'Infinito' : '0';
    return (totalC / totalN).toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.ingredientes.length === 0) return alert("Agregá al menos un ingrediente");
    setLoading(true);

    try {
      const recetaId = receta?.id || formData.nombre.toLowerCase().replace(/\s+/g, '-');
      const recetaRef = doc(db, 'recetas', recetaId);
      
      const data = {
        ...formData,
        id: recetaId,
        densidad_esperada_brix: formData.densidad_real_brix ? Number(formData.densidad_real_brix) : null, // Fix: user said brix
        osmolaridad_esperada_mOsm: formData.osmolaridad_esperada_mOsm ? Number(formData.osmolaridad_esperada_mOsm) : null,
        relacion_cn_teorica: calculateCN(),
        updatedAt: serverTimestamp()
      };

      if (!receta) data.createdAt = serverTimestamp();

      await setDoc(recetaRef, data, { merge: true });
      onSaved();
    } catch (error) {
      console.error("Error al guardar receta:", error);
      alert("Error al guardar los datos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>{receta ? '✏️ Editar Receta' : '🧪 Nueva Receta / Formulación'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>1. Información General</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre de la Receta</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  value={formData.nombre} 
                  onChange={e => setFormData({...formData, nombre: e.target.value})} 
                  placeholder="Ej: PDA (Potato Dextrose Agar)" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select 
                  className="form-control" 
                  value={formData.categoria} 
                  onChange={e => setFormData({...formData, categoria: e.target.value})}
                >
                  <option value="Agar">Agar</option>
                  <option value="Grano">Líquido / Grano</option>
                  <option value="Sustrato">Sustrato / Suplemento</option>
                </select>
              </div>
            </div>
            
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Rendimiento Teórico</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={formData.rendimiento_teorico.cantidad} 
                    onChange={e => setFormData({...formData, rendimiento_teorico: {...formData.rendimiento_teorico, cantidad: Number(e.target.value)}})} 
                  />
                  <select 
                    className="form-control" 
                    style={{ width: '80px' }}
                    value={formData.rendimiento_teorico.unidad}
                    onChange={e => setFormData({...formData, rendimiento_teorico: {...formData.rendimiento_teorico, unidad: e.target.value}})}
                  >
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">QC Teórico (Opcional)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                   <input 
                    type="number" step="0.1" 
                    className="form-control" 
                    placeholder="Brix"
                    value={formData.densidad_esperada_brix} 
                    onChange={e => setFormData({...formData, densidad_esperada_brix: e.target.value})} 
                  />
                   <input 
                    type="number" 
                    className="form-control" 
                    placeholder="mOsm"
                    value={formData.osmolaridad_esperada_mOsm} 
                    onChange={e => setFormData({...formData, osmolaridad_esperada_mOsm: e.target.value})} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="section-divider">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: 'var(--accent-color)' }}>2. Composición de Ingredientes</h4>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-color)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Relación C/N: {calculateCN()}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {formData.ingredientes.map((ing, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 40px', gap: '0.5rem', alignItems: 'end' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Insumo Base</label>
                    <select 
                      className="form-control" 
                      value={ing.insumoId} 
                      onChange={e => updateIngrediente(index, 'insumoId', e.target.value)}
                    >
                      <option value="">-- Seleccionar --</option>
                      {insumosBase.map(i => (
                        <option key={i.id} value={i.id}>{i.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Cant. ({insumosBase.find(i => i.id === ing.insumoId)?.unidad_base || '-'})</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={ing.cantidad} 
                      onChange={e => updateIngrediente(index, 'cantidad', Number(e.target.value))} 
                    />
                  </div>
                  <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)', marginBottom: '5px' }} onClick={() => removeIngrediente(index)}>🗑️</button>
                </div>
              ))}
            </div>
            
            <button type="button" className="btn btn-outline" style={{ marginTop: '1rem', width: '100%', borderStyle: 'dashed' }} onClick={addIngrediente}>
              ➕ Agregar Ingrediente
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Receta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
