import { useState, useEffect, useMemo } from 'react';
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
    densidad_g_ml: recipeToClone?.densidad_g_ml || '',
    tonicidad: recipeToClone?.tonicidad || '',
    osmolaridad_esperada_mOsm: recipeToClone?.osmolaridad_esperada_mOsm || '',
    ph_esperado: recipeToClone?.ph_esperado || '',
    protocolo_url: recipeToClone?.protocolo_url || '',
    tiempo_autoclave_min: recipeToClone?.tiempo_autoclave_min || '',
    temperatura_autoclave_c: recipeToClone?.temperatura_autoclave_c || '121',
    descripcion: recipeToClone?.descripcion || '',
    materiales_requeridos: recipeToClone?.materiales_requeridos || []
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "insumos_base"), (snapshot) => {
      setInsumosBase(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const cnData = useMemo(() => {
    let sumC = 0;
    let sumN = 0;
    form.ingredientes.forEach(ing => {
      if (ing.insumoId && ing.cantidad) {
        const found = insumosBase.find(i => i.id === ing.insumoId);
        if (found?.bioquimica) {
          sumC += (ing.cantidad * (Number(found.bioquimica.porcentaje_carbono) || 0) / 100);
          sumN += (ing.cantidad * (Number(found.bioquimica.porcentaje_nitrogeno) || 0) / 100);
        }
      }
    });
    let ratio = "N/A";
    if (sumN > 0) {
      ratio = (sumC / sumN).toFixed(2);
    } else if (sumC > 0) {
      ratio = "Solo Carbono";
    }
    return { sumC, sumN, ratio };
  }, [form.ingredientes, insumosBase]);

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

  const addMaterial = () => {
    setForm({
      ...form,
      materiales_requeridos: [...form.materiales_requeridos, { insumoId: '', cantidad: 1 }]
    });
  };

  const removeMaterial = (index) => {
    const newMat = [...form.materiales_requeridos];
    newMat.splice(index, 1);
    setForm({ ...form, materiales_requeridos: newMat });
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
        densidad_g_ml: form.densidad_g_ml ? Number(form.densidad_g_ml) : null,
        osmolaridad_esperada_mOsm: form.osmolaridad_esperada_mOsm ? Number(form.osmolaridad_esperada_mOsm) : null,
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

          <div className="section-divider" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
            <h4 style={{ marginBottom: '1rem', color: '#10b981', fontSize: '0.9rem' }}>🧪 Parámetros Científicos</h4>
            <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label className="form-label">Densidad Esperada (g/ml)</label>
                <input type="number" step="0.01" className="form-control" placeholder="Ej: 1.05" value={form.densidad_g_ml} onChange={e => setForm({...form, densidad_g_ml: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Tonicidad</label>
                <select className="form-control" value={form.tonicidad} onChange={e => setForm({...form, tonicidad: e.target.value})}>
                  <option value="">-- Opcional --</option>
                  <option value="Isotónico">Isotónico</option>
                  <option value="Hipotónico">Hipotónico</option>
                  <option value="Hipertónico">Hipertónico</option>
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Osmolaridad Esp. (mOsm)</label>
                <input type="number" className="form-control" placeholder="Ej: 300" value={form.osmolaridad_esperada_mOsm} onChange={e => setForm({...form, osmolaridad_esperada_mOsm: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">pH Esperado</label>
                <input type="number" step="0.01" className="form-control" placeholder="Ej: 5.6" value={form.ph_esperado} onChange={e => setForm({...form, ph_esperado: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '2px solid #8b5cf6', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Relación C/N Teórica</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#8b5cf6' }}>{cnData.ratio}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">🔗 Link al Protocolo (Docs/Drive)</label>
            <input type="url" className="form-control" placeholder="https://..." value={form.protocolo_url} onChange={e => setForm({...form, protocolo_url: e.target.value})} />
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
              <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button type="button" onClick={() => removeIngredient(idx)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>✕</button>
                <div style={{ paddingRight: '2rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Insumo Maestro</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
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
                      <option value="">-- Seleccionar --</option>
                      {insumosBase.filter(i => ['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(i.categoria)).map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                    <button type="button" className="btn btn-primary" style={{ padding: '0 0.75rem' }} onClick={handleAddInsumo} title="Añadir Insumo">+</button>
                  </div>
                  <div className="grid-2">
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Cantidad</label>
                      <input 
                        type="number" 
                        step="0.01"
                        className="form-control" 
                        value={ing.cantidad} 
                        onChange={e => {
                          const newIng = [...form.ingredientes];
                          newIng[idx].cantidad = Number(e.target.value);
                          setForm({ ...form, ingredientes: newIng });
                        }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Unidad</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={ing.unidad || 'g'} 
                        onChange={e => {
                          const newIng = [...form.ingredientes];
                          newIng[idx].unidad = e.target.value;
                          setForm({ ...form, ingredientes: newIng });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }} onClick={addIngredient}>
              ➕ Añadir Ingrediente
            </button>
          </div>

          <div className="section-divider" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#f59e0b' }}>🛠️ Materiales e Instrumental Requerido</h4>
            <p style={{ fontSize: '0.75rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Seleccioná qué envases o equipamiento se debe tener limpio y listo antes de empezar.</p>
            {form.materiales_requeridos.map((mat, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button type="button" onClick={() => removeMaterial(idx)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>✕</button>
                <div style={{ paddingRight: '2.5rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Material / Envase</label>
                  <select 
                    className="form-control" 
                    style={{ marginBottom: '0.5rem' }}
                    value={mat.insumoId} 
                    onChange={e => {
                      const newMat = [...form.materiales_requeridos];
                      const selected = insumosBase.find(i => i.id === e.target.value);
                      newMat[idx] = { ...newMat[idx], insumoId: e.target.value, nombre: selected?.nombre };
                      setForm({ ...form, materiales_requeridos: newMat });
                    }}
                  >
                    <option value="">-- Seleccionar --</option>
                    {insumosBase.filter(i => ['Descartables', 'Reutilizables', 'Equipamiento'].includes(i.categoria)).map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Cantidad de Unidades</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={mat.cantidad} 
                    onChange={e => {
                      const newMat = [...form.materiales_requeridos];
                      newMat[idx].cantidad = Number(e.target.value);
                      setForm({ ...form, materiales_requeridos: newMat });
                    }}
                  />
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }} onClick={addMaterial}>
              ➕ Añadir Material
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
