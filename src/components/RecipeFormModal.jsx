import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, serverTimestamp, query, onSnapshot, writeBatch, arrayUnion } from 'firebase/firestore';
import { getFallbackCN } from '../utils/cnDatabase';
import SearchableSelect from './SearchableSelect';
import toast from 'react-hot-toast';

const cleanFirestoreId = (str) => {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents/diacritics
    .replace(/[^a-z0-9]/g, '-')     // Replace any non-alphanumeric character with hyphen
    .replace(/-+/g, '-')             // Remove double/multiple hyphens
    .replace(/^-|-$/g, '');          // Remove leading and trailing hyphens
};

export default function RecipeFormModal({ recipeToClone, isEdit, onClose, onSaved }) {
  const [insumosBase, setInsumosBase] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState(['Agar', 'Grano', 'Sustrato', 'Líquido', 'Semilla', 'Suplemento']);
  const [showOtroInput, setShowOtroInput] = useState(false);
  const [otraCategoria, setOtraCategoria] = useState('');

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
    tiempo_max_heladera_dias: recipeToClone?.tiempo_max_heladera_dias || '',
    tiempo_estimado_confeccion: recipeToClone?.tiempo_estimado_confeccion || '',
    descripcion: recipeToClone?.descripcion || '',
    materiales_requeridos: recipeToClone?.materiales_requeridos || [],
    equipamiento_requerido: recipeToClone?.equipamiento_requerido || recipeToClone?.equipamientoRequerido || []
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "insumos_base"), (snapshot) => {
      setInsumosBase(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'categorias_recetas'), (docSnap) => {
      if (docSnap.exists()) {
        const list = docSnap.data().categorias || [];
        const initialCat = recipeToClone?.categoria;
        if (initialCat && !list.includes(initialCat)) {
          setCategorias([...list, initialCat]);
        } else {
          setCategorias(list);
        }
      }
    }, err => console.error("Error loading categories in modal:", err));
    return () => unsubscribe();
  }, [recipeToClone]);

  const cnData = useMemo(() => {
    let sumC = 0;
    let sumN = 0;
    let sumDryWeight = 0;
    let usaEstimacion = false;
    form.ingredientes.forEach(ing => {
      if (ing.insumoId && ing.cantidad) {
        const found = insumosBase.find(i => i.id === ing.insumoId);
        
        let c = 0;
        let n = 0;
        let h = 0;
        let tieneBioq = false;

        // Intentar leer valor configurado en el Insumo Maestro
        if (found?.bioquimica) {
          if (found.bioquimica.porcentaje_carbono > 0 || found.bioquimica.porcentaje_nitrogeno > 0 || found.bioquimica.porcentaje_humedad > 0) {
            c = Number(found.bioquimica.porcentaje_carbono) || 0;
            n = Number(found.bioquimica.porcentaje_nitrogeno) || 0;
            h = Number(found.bioquimica.porcentaje_humedad) || 0;
            tieneBioq = true;
          }
        }

        // Si no tiene bioquímica asignada, usar Base de Datos Fallback
        if (!tieneBioq) {
          const fallback = getFallbackCN(ing.nombre || found?.nombre);
          if (fallback) {
            c = fallback.c;
            n = fallback.n;
            h = fallback.h || 0;
            usaEstimacion = true;
          }
        }

        // Si el nombre contiene "agua" o "h2o", forzar 100% de humedad (0% de peso seco aportado)
        const lowerName = (ing.nombre || found?.nombre || '').toLowerCase();
        if (lowerName.includes('agua') || lowerName.includes('h2o')) {
          h = 100.0;
        }

        sumC += (ing.cantidad * c) / 100;
        sumN += (ing.cantidad * n) / 100;
        sumDryWeight += ing.cantidad * (1 - h / 100);
      }
    });
    let ratio = "N/A";
    if (sumN > 0) {
      ratio = (sumC / sumN).toFixed(2);
    } else if (sumC > 0) {
      ratio = "Solo Carbono";
    }
    return { sumC, sumN, ratio, sumDryWeight, usaEstimacion };
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

  const addEquipment = () => {
    setForm({
      ...form,
      equipamiento_requerido: [...form.equipamiento_requerido, { insumoId: '', cantidad: 1 }]
    });
  };

  const removeEquipment = (index) => {
    const newEquip = [...form.equipamiento_requerido];
    newEquip.splice(index, 1);
    setForm({ ...form, equipamiento_requerido: newEquip });
  };

  const handleCreateMaterialOnTheFly = async (index) => {
    const nombre = window.prompt("🔬 Ingrese el nombre del NUEVO MATERIAL (ej. Probeta 500ml, Matraz Erlenmeyer 1L):");
    if (!nombre || nombre.trim() === '') return;
    
    try {
      setLoading(true);
      const id = cleanFirestoreId(nombre);
      const docRef = doc(db, 'insumos_base', id);
      
      const newInsumo = {
        nombre: nombre.trim(),
        categoria: 'Reutilizables',
        tipo_uso: 'reutilizable',
        unidad_compra: 'un',
        unidad_display: 'un',
        unidad_base: 'un',
        factor_compra: 1,
        factor_display: 1,
        factor_conversion: 1,
        stock_total_base: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        descripcion: 'Creado al vuelo desde receta'
      };
      
      await setDoc(docRef, newInsumo);
      
      const newMat = [...form.materiales_requeridos];
      newMat[index] = { ...newMat[index], insumoId: id, nombre: nombre.trim() };
      setForm(prev => ({ ...prev, materiales_requeridos: newMat }));
      
      toast.success(`Material "${nombre}" creado y seleccionado automáticamente.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al crear el material.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEquipmentOnTheFly = async (index) => {
    const nombre = window.prompt("⚙️ Ingrese el nombre del NUEVO EQUIPAMIENTO (ej. Autoclave 20L, pH-metro Digital):");
    if (!nombre || nombre.trim() === '') return;
    
    try {
      setLoading(true);
      const id = cleanFirestoreId(nombre);
      const docRef = doc(db, 'insumos_base', id);
      
      const newInsumo = {
        nombre: nombre.trim(),
        categoria: 'Equipamiento',
        unidad_compra: 'un',
        unidad_display: 'un',
        unidad_base: 'un',
        factor_compra: 1,
        factor_display: 1,
        factor_conversion: 1,
        stock_total_base: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        descripcion: 'Creado al vuelo desde receta',
        equipamiento: {
          marca_modelo: 'Genérico',
          nro_serie: 'S/N',
          propietario: 'facultad',
          fecha_adquisicion: new Date().toISOString().split('T')[0],
          valor_compra: 0,
          vida_util_anios: 5,
          valor_residual: 0
        }
      };
      
      await setDoc(docRef, newInsumo);
      
      const newEquip = [...form.equipamiento_requerido];
      newEquip[index] = { ...newEquip[index], insumoId: id, nombre: nombre.trim() };
      setForm(prev => ({ ...prev, equipamiento_requerido: newEquip }));
      
      toast.success(`Equipamiento "${nombre}" creado y seleccionado automáticamente.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al crear el equipamiento.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddInsumo = async () => {
    const nombreInsumo = window.prompt("🏷️ Ingrese el nombre del NUEVO INSUMO MAESTRO:");
    if (!nombreInsumo || nombreInsumo.trim() === '') return;
    
    try {
      setLoading(true);
      const insumoId = cleanFirestoreId(nombreInsumo);
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
      toast.success(`Insumo "${nombreInsumo}" creado. Ahora puedes seleccionarlo en la lista.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al crear el insumo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const finalCategory = showOtroInput ? otraCategoria.trim() : form.categoria;
      if (showOtroInput && !finalCategory) {
        toast("Por favor, ingrese el nombre de la nueva categoría.");
        setLoading(false);
        return;
      }

      const recipeId = cleanFirestoreId(form.nombre);
      const batch = writeBatch(db);

      const recipeRef = doc(db, "recetas", recipeId);
      const recipeData = {
        ...form,
        categoria: finalCategory,
        peso_seco_por_unidad_g: form.peso_seco_por_unidad_g ? Number(form.peso_seco_por_unidad_g) : null,
        densidad_g_ml: form.densidad_g_ml ? Number(form.densidad_g_ml) : null,
        osmolaridad_esperada_mOsm: form.osmolaridad_esperada_mOsm ? Number(form.osmolaridad_esperada_mOsm) : null,
        ph_esperado: form.ph_esperado ? Number(form.ph_esperado) : null,
        protocolo_url: form.protocolo_url || null,
        tiempo_autoclave_min: form.tiempo_autoclave_min ? Number(form.tiempo_autoclave_min) : null,
        temperatura_autoclave_c: form.temperatura_autoclave_c ? Number(form.temperatura_autoclave_c) : null,
        tiempo_max_heladera_dias: form.tiempo_max_heladera_dias ? Number(form.tiempo_max_heladera_dias) : null,
        tiempo_estimado_confeccion: form.tiempo_estimado_confeccion || null,
        updatedAt: serverTimestamp(),
        createdAt: (isEdit && recipeToClone) ? recipeToClone.createdAt : serverTimestamp()
      };

      batch.set(recipeRef, recipeData);

      if (showOtroInput) {
        const configRef = doc(db, 'config', 'categorias_recetas');
        batch.set(configRef, { categorias: arrayUnion(finalCategory) }, { merge: true });
      }

      await batch.commit();
      toast.success("Receta guardada correctamente.");
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar la receta.");
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
              <select className="form-control" value={showOtroInput ? 'Otro' : form.categoria} onChange={e => {
                if (e.target.value === 'Otro') {
                  setShowOtroInput(true);
                } else {
                  setShowOtroInput(false);
                  setForm({...form, categoria: e.target.value});
                  setOtraCategoria('');
                }
              }}>
                {categorias.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="Otro">Otro</option>
              </select>
              {showOtroInput && (
                <input
                  type="text"
                  className="form-control"
                  style={{ marginTop: '0.5rem' }}
                  placeholder="Escriba la nueva categoría"
                  value={otraCategoria}
                  onChange={e => setOtraCategoria(e.target.value)}
                  required
                />
              )}
            </div>
            <div className="form-group">
              <label className="form-label" title="Volumen o masa total final que produce esta receta">Total a Preparar (ml/g)</label>
              <input type="number" step="any" min="0" className="form-control" value={form.rendimiento_teorico.cantidad} onChange={e => setForm({...form, rendimiento_teorico: {...form.rendimiento_teorico, cantidad: Number(e.target.value)}})} />
            </div>
            <div className="form-group">
              <label className="form-label" title="Peso del material seco antes de hidratar (referencia para EB)">Peso Seco / Unidad (g)</label>
              <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 500" value={form.peso_seco_por_unidad_g} onChange={e => setForm({...form, peso_seco_por_unidad_g: e.target.value})} />
              {cnData.sumDryWeight > 0 && (
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  <span>Teórico: <strong>{cnData.sumDryWeight.toFixed(1)} g</strong></span>
                  <button 
                    type="button" 
                    className="btn-link" 
                    style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0, fontSize: '0.72rem', fontWeight: 'bold' }}
                    onClick={() => setForm(prev => ({ ...prev, peso_seco_por_unidad_g: cnData.sumDryWeight.toFixed(1) }))}
                  >
                    ⚡ Aplicar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="section-divider" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
            <h4 style={{ marginBottom: '1rem', color: '#10b981', fontSize: '0.9rem' }}>🧪 Parámetros Científicos</h4>
            <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label className="form-label">Densidad Esperada (g/ml)</label>
                <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 1.05" value={form.densidad_g_ml} onChange={e => setForm({...form, densidad_g_ml: e.target.value})} />
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
                <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 300" value={form.osmolaridad_esperada_mOsm} onChange={e => setForm({...form, osmolaridad_esperada_mOsm: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">pH Esperado</label>
                <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 5.6" value={form.ph_esperado} onChange={e => setForm({...form, ph_esperado: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '2px solid #8b5cf6', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Relación C/N Teórica</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#8b5cf6' }}>{cnData.ratio}</span>
              {cnData.usaEstimacion && (
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: '600' }}>⚠️ (Contiene Valores Estimados)</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">🔗 Link al Protocolo (Docs/Drive)</label>
            <input type="url" className="form-control" placeholder="https://..." value={form.protocolo_url} onChange={e => setForm({...form, protocolo_url: e.target.value})} />
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
            <div className="form-group">
              <label className="form-label">🔥 Autoclave (min)</label>
              <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 20" value={form.tiempo_autoclave_min} onChange={e => setForm({...form, tiempo_autoclave_min: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">🌡️ Temp. (°C)</label>
              <input type="number" step="any" className="form-control" placeholder="Ej: 121" value={form.temperatura_autoclave_c} onChange={e => setForm({...form, temperatura_autoclave_c: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label" title="Tiempo máximo de stock en heladera antes de vencer (en días)">❄️ Heladera (días)</label>
              <input type="number" step="any" min="0" className="form-control" placeholder="Ej: 45" value={form.tiempo_max_heladera_dias} onChange={e => setForm({...form, tiempo_max_heladera_dias: e.target.value})} />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">⏱️ Tiempo Estimado de Confección</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ej: 60 a 75 minutos" 
                value={form.tiempo_estimado_confeccion} 
                onChange={e => setForm({...form, tiempo_estimado_confeccion: e.target.value})}
              />
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
          </div>


          <div className="section-divider" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>🧪 Ingredientes</h4>
            {form.ingredientes.map((ing, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button type="button" onClick={() => removeIngredient(idx)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>✕</button>
                <div style={{ paddingRight: '2rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Insumo Maestro</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <SearchableSelect 
                      options={insumosBase.filter(i => ['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(i.categoria))}
                      value={ing.insumoId}
                      onChange={id => {
                        const newIng = [...form.ingredientes];
                        const selected = insumosBase.find(i => i.id === id);
                        newIng[idx] = { ...newIng[idx], insumoId: id, nombre: selected?.nombre };
                        setForm({ ...form, ingredientes: newIng });
                      }}
                      placeholder="-- Buscar insumo --"
                      onCreateNew={handleAddInsumo}
                      createNewText="➕ Crear nuevo insumo"
                    />
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      style={{ height: '48px', width: '48px', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                      onClick={handleAddInsumo} 
                      title="Añadir Insumo"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid-2">
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Cantidad</label>
                      <input 
                        type="number" 
                        step="any"
                        min="0"
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

          {/* RECUADRO 2: VIDRIERÍA E INSTRUMENTAL */}
          <div className="section-divider" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🧪 Vidriería e Instrumental</h4>
            <p style={{ fontSize: '0.78rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>Seleccioná qué envases, beakers o instrumental de vidrio se requiere tener limpio y listo.</p>
            
            {form.materiales_requeridos.map((mat, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.75rem', 
                background: 'rgba(255,255,255,0.05)', 
                padding: '1rem', 
                borderRadius: '10px', 
                marginBottom: '0.75rem', 
                border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Material / Envase</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <SearchableSelect 
                        options={insumosBase.filter(i => ['Descartables', 'Reutilizables', 'Envases'].includes(i.categoria))}
                        value={mat.insumoId}
                        onChange={id => {
                          const newMat = [...form.materiales_requeridos];
                          const selected = insumosBase.find(i => i.id === id);
                          newMat[idx] = { ...newMat[idx], insumoId: id, nombre: selected?.nombre };
                          setForm({ ...form, materiales_requeridos: newMat });
                        }}
                        placeholder="-- Buscar material --"
                        onCreateNew={() => handleCreateMaterialOnTheFly(idx)}
                        createNewText="➕ Crear nuevo material"
                      />
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={() => handleCreateMaterialOnTheFly(idx)}
                        style={{ height: '48px', width: '48px', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Crear nuevo material en caliente"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={() => removeMaterial(idx)} 
                    style={{ 
                      background: '#ef4444', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      width: '48px', 
                      height: '48px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      cursor: 'pointer',
                      alignSelf: 'flex-end',
                      fontSize: '1.2rem',
                      boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                    }}
                    title="Eliminar material"
                  >
                    🗑️
                  </button>
                </div>
                
                <div style={{ width: '100%' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cantidad Requerida</label>
                  <input 
                    type="number" 
                    step="any"
                    min="0" 
                    className="form-control" 
                    value={mat.cantidad} 
                    onChange={e => {
                      const newMat = [...form.materiales_requeridos];
                      newMat[idx].cantidad = Number(e.target.value);
                      setForm({ ...form, materiales_requeridos: newMat });
                    }}
                    style={{ height: '48px', fontSize: '1.1rem' }}
                  />
                </div>
              </div>
            ))}
            
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold', height: '48px' }} onClick={addMaterial}>
              ➕ Añadir Material
            </button>
          </div>

          {/* RECUADRO 3: EQUIPAMIENTO REQUERIDO */}
          <div className="section-divider" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚙️ Equipamiento Requerido</h4>
            <p style={{ fontSize: '0.78rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>Seleccioná los equipos de laboratorio (ej. pH-metro, agitador, autoclave) que se deben utilizar.</p>
            
            {form.equipamiento_requerido.map((equip, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.75rem', 
                background: 'rgba(255,255,255,0.05)', 
                padding: '1rem', 
                borderRadius: '10px', 
                marginBottom: '0.75rem', 
                border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Equipo</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <SearchableSelect 
                        options={insumosBase.filter(i => i.categoria === 'Equipamiento')}
                        value={equip.insumoId}
                        onChange={id => {
                          const newEquip = [...form.equipamiento_requerido];
                          const selected = insumosBase.find(i => i.id === id);
                          newEquip[idx] = { ...newEquip[idx], insumoId: id, nombre: selected?.nombre };
                          setForm({ ...form, equipamiento_requerido: newEquip });
                        }}
                        placeholder="-- Buscar equipo --"
                        onCreateNew={() => handleCreateEquipmentOnTheFly(idx)}
                        createNewText="➕ Crear nuevo equipamiento"
                      />
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={() => handleCreateEquipmentOnTheFly(idx)}
                        style={{ height: '48px', width: '48px', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Crear nuevo equipamiento en caliente"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={() => removeEquipment(idx)} 
                    style={{ 
                      background: '#ef4444', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      width: '48px', 
                      height: '48px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      cursor: 'pointer',
                      alignSelf: 'flex-end',
                      fontSize: '1.2rem',
                      boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                    }}
                    title="Eliminar equipo"
                  >
                    🗑️
                  </button>
                </div>
                
                <div style={{ width: '100%' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cantidad Requerida</label>
                  <input 
                    type="number" 
                    step="any"
                    min="0" 
                    className="form-control" 
                    value={equip.cantidad} 
                    onChange={e => {
                      const newEquip = [...form.equipamiento_requerido];
                      newEquip[idx].cantidad = Number(e.target.value);
                      setForm({ ...form, equipamiento_requerido: newEquip });
                    }}
                    style={{ height: '48px', fontSize: '1.1rem' }}
                  />
                </div>
              </div>
            ))}
            
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold', height: '48px' }} onClick={addEquipment}>
              ➕ Añadir Equipo
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
