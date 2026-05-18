import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, serverTimestamp, query, onSnapshot } from 'firebase/firestore';

export default function RecipeFormModal({ recipeToClone, isEdit, onClose, onSaved }) {
  const [insumosBase, setInsumosBase] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: recipeToClone ? (isEdit ? recipeToClone.nombre : `${recipeToClone.nombre} (copia)`) : '',
    categoria: recipeToClone?.categoria || 'Agar',
    procedimiento: recipeToClone?.procedimiento || '',
    parentRecipeId: isEdit ? (recipeToClone?.parentRecipeId || null) : (recipeToClone?.id || null),
    ingredientes: recipeToClone?.ingredientes || [],
    rendimiento_teorico: recipeToClone?.rendimiento_teorico || { cantidad: 1000, unidad: 'ml' },
    peso_seco_por_unidad_g: recipeToClone?.peso_seco_por_unidad_g || '',
    ph_esperado: recipeToClone?.ph_esperado || '',
    protocolo_url: recipeToClone?.protocolo_url || '',
    tiempo_autoclave_min: recipeToClone?.tiempo_autoclave_min || '',
    temperatura_autoclave_c: recipeToClone?.temperatura_autoclave_c || '121',
    descripcion: recipeToClone?.descripcion || ''
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
      ingredientes: [...form.ingredientes, { insumoId: '', cantidad: 0, unidad: 'g' }]
    });
  };

  const removeIngredient = (index) => {
    const newIng = [...form.ingredientes];
    newIng.splice(index, 1);
    setForm({ ...form, ingredientes: newIng });
  };

  const handleAddInsumo = async () => {
    const nombreInsumo = window.prompt("🏷️ Ingrese el nombre del NUEVO INSUMO MAESTRO:");
    if (!nombreInsumo || nombreInsumo.trim() === '') return;
    
    try {
      setLoading(true);
      const insumoId = nombreInsumo.trim().toLowerCase().replace(/\s+/g, '-');
      const insumoRef = doc(db, 'insumos_base', insumoId);
      
      const insumoData = { 
        nombre: nombreInsumo.trim(), 
        categoria: 'Medios y reactivos', 
        unidad_compra: 'un',
        unidad_display: 'un',
        unidad_base: 'un',
        factor_compra: 1,
        factor_display: 1,
        factor_conversion: 1,
        stock_total_base: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        descripcion: 'Creado rápidamente desde receta'
      };
      
      await setDoc(insumoRef, insumoData);
      alert(`✅ Insumo "${nombreInsumo}" creado. Ahora puedes seleccionarlo en la lista.`);
    } catch (err) {
      console.error(err);
      alert("Error al crear el insumo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const recipeId = form.nombre.toLowerCase().replace(/\s+/g, '-');
      
      // Si estamos editando y el nombre cambió, deberíamos considerar si eliminar el anterior.
      // Pero por ahora seguiremos la lógica de setDoc que sobreescribe si el ID coincide.
      
      await setDoc(doc(db, "recetas", recipeId), {
        ...form,
        peso_seco_por_unidad_g: form.peso_seco_por_unidad_g ? Number(form.peso_seco_por_unidad_g) : null,
        ph_esperado: form.ph_esperado ? Number(form.ph_esperado) : null,
        protocolo_url: form.protocolo_url || null,
        tiempo_autoclave_min: form.tiempo_autoclave_min ? Number(form.tiempo_autoclave_min) : null,
        temperatura_autoclave_c: form.temperatura_autoclave_c ? Number(form.temperatura_autoclave_c) : null,
        updatedAt: serverTimestamp(),
        createdAt: (isEdit && recipeToClone) ? recipeToClone.createdAt : serverTimestamp()
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
          <h3>
            {isEdit ? '✏️ Editar Receta' : (recipeToClone ? '🐑 Duplicar Receta' : '📜 Nueva Receta')}
          </h3>
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
                <option value="Líquido">Líquido</option>
                <option value="Suplemento">Suplemento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" title="Volumen o masa total final que produce esta receta">Total a Preparar (ml/g)</label>
              <input type="number" className="form-control" value={form.rendimiento_teorico.cantidad} onChange={e => setForm({...form, rendimiento_teorico: {...form.rendimiento_teorico, cantidad: Number(e.target.value)}})} />
            </div>
            <div className="form-group">
              <label className="form-label" title="Peso del material seco antes de hidratar (referencia para EB)">Peso Seco / Unidad (g)</label>
              <input type="number" step="0.1" className="form-control" placeholder="Ej: 500" value={form.peso_seco_por_unidad_g} onChange={e => setForm({...form, peso_seco_por_unidad_g: e.target.value})} />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">pH Esperado (Teórico)</label>
              <input type="number" step="0.01" className="form-control" placeholder="Ej: 5.6" value={form.ph_esperado} onChange={e => setForm({...form, ph_esperado: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">🔗 Link al Protocolo (Docs/Drive)</label>
              <input type="url" className="form-control" placeholder="https://..." value={form.protocolo_url} onChange={e => setForm({...form, protocolo_url: e.target.value})} />
            </div>
          </div>

          <div className="grid-2" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
            <div className="form-group">
              <label className="form-label">🔥 Tiempo Autoclave (min)</label>
              <input type="number" className="form-control" placeholder="Ej: 20" value={form.tiempo_autoclave_min} onChange={e => setForm({...form, tiempo_autoclave_min: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">🌡️ Temperatura (°C)</label>
              <input type="number" className="form-control" placeholder="Ej: 121" value={form.temperatura_autoclave_c} onChange={e => setForm({...form, temperatura_autoclave_c: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">📝 Características / Descripción corta</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: Agar base sin levadura para adaptación de cepas..." 
              value={form.descripcion} 
              onChange={e => setForm({...form, descripcion: e.target.value})}
            />
          </div>


          <div className="section-divider" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>🧪 Ingredientes</h4>
            {form.ingredientes.map((ing, idx) => (
              <div key={idx} className="grid-2" style={{ gridTemplateColumns: '2fr 0.8fr 0.5fr 0.4fr', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
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
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ width: 'auto', padding: '0 0.5rem' }} 
                    onClick={handleAddInsumo}
                    title="Añadir Insumo Maestro faltante"
                  >+</button>
                </div>
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
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="un"
                  style={{ padding: '0.5rem 0.25rem' }}
                  value={ing.unidad || 'g'} 
                  onChange={e => {
                    const newIng = [...form.ingredientes];
                    newIng[idx].unidad = e.target.value;
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
              {loading ? 'Guardando...' : (isEdit ? 'Actualizar Receta' : (recipeToClone ? 'Confirmar Copia' : 'Crear Receta'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
