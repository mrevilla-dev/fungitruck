import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, serverTimestamp, query, onSnapshot } from 'firebase/firestore';

export default function RecipeFormModal({ recipeToClone, onClose, onSaved }) {
  const [insumosBase, setInsumosBase] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: recipeToClone ? `${recipeToClone.nombre} (Clon)` : '',
    categoria: recipeToClone?.categoria || 'Agar',
    procedimiento: recipeToClone?.procedimiento || '',
    parentRecipeId: recipeToClone?.id || null,
    ingredientes: recipeToClone?.ingredientes || [],
    rendimiento_teorico: recipeToClone?.rendimiento_teorico || { cantidad: 1000, unidad: 'ml' },
    peso_seco_por_unidad_g: recipeToClone?.peso_seco_por_unidad_g || 0,
    ph_esperado: recipeToClone?.ph_esperado || ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "insumos_base"), (snapshot) => {
      setInsumosBase(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const addIngredient = () => {
    setForm({
      ...form,
      ingredientes: [...form.ingredientes, { insumoId: '', cantidad: 0 }]
    });
  };

  const removeIngredient = (index) => {
    const newIng = [...form.ingredientes];
    newIng.splice(index, 1);
    setForm({ ...form, ingredientes: newIng });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const recipeId = form.nombre.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, "recetas", recipeId), {
        ...form,
        peso_seco_por_unidad_g: Number(form.peso_seco_por_unidad_g) || 0,
        ph_esperado: form.ph_esperado ? Number(form.ph_esperado) : null,
        updatedAt: serverTimestamp(),
        createdAt: recipeToClone ? recipeToClone.createdAt : serverTimestamp()
      });
      alert("✅ Receta guardada correctamente.");
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al guardar la receta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>{recipeToClone ? '🐑 Clonar Receta' : '📜 Nueva Receta'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Nombre de la Receta</label>
            <input type="text" className="form-control" required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>

            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select className="form-control" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                <option value="Agar">Agar</option>
                <option value="Grano">Grano</option>
                <option value="Sustrato">Sustrato</option>
                <option value="Suplemento">Suplemento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rendimiento (ml/g)</label>
              <input type="number" className="form-control" value={form.rendimiento_teorico.cantidad} onChange={e => setForm({...form, rendimiento_teorico: {...form.rendimiento_teorico, cantidad: Number(e.target.value)}})} />
            </div>
            <div className="form-group">
              <label className="form-label">Peso Seco / Unidad (g)</label>
              <input type="number" step="0.1" className="form-control" placeholder="Ref. cosecha" value={form.peso_seco_por_unidad_g} onChange={e => setForm({...form, peso_seco_por_unidad_g: e.target.value})} />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">pH Esperado (Teórico)</label>
              <input type="number" step="0.01" className="form-control" placeholder="Ej: 5.6" value={form.ph_esperado} onChange={e => setForm({...form, ph_esperado: e.target.value})} />
            </div>
          </div>


          <div className="section-divider" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>🧪 Ingredientes</h4>
            {form.ingredientes.map((ing, idx) => (
              <div key={idx} className="grid-2" style={{ gridTemplateColumns: '2fr 1fr 0.5fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <select 
                  className="form-control" 
                  value={ing.insumoId} 
                  onChange={e => {
                    const newIng = [...form.ingredientes];
                    const selected = insumosBase.find(i => i.id === e.target.value);
                    newIng[idx] = { ...newIng[idx], insumoId: e.target.value, nombre: selected?.nombre };
                    setForm({ ...form, ingredientes: newIng });
                  }}
                >
                  <option value="">-- Insumo --</option>
                  {insumosBase.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="Cant."
                  value={ing.cantidad} 
                  onChange={e => {
                    const newIng = [...form.ingredientes];
                    newIng[idx].cantidad = Number(e.target.value);
                    setForm({ ...form, ingredientes: newIng });
                  }}
                />
                <button type="button" className="btn btn-danger" style={{ padding: '4px' }} onClick={() => removeIngredient(idx)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8rem' }} onClick={addIngredient}>
              ➕ Añadir Ingrediente
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Procedimiento (Paso a paso)</label>
            <textarea 
              className="form-control" 
              rows="4" 
              placeholder="Ej: Mezclar en frío, esterilizar a 15 psi por 20 min..."
              value={form.procedimiento} 
              onChange={e => setForm({...form, procedimiento: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : (recipeToClone ? 'Confirmar Clonación' : 'Crear Receta')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
