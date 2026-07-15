import React, { useState, useEffect } from 'react';
import { writeBatch, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { generarIdBatch, generarIdExperimento } from '../utils/idGenerator';
import { toast, Toaster } from 'react-hot-toast';
import { getAuth } from 'firebase/auth';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

export default function ExperimentoNuevoPage() {
  const navigate = useNavigate();
  const auth = getAuth();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    nombre: '',
    genero: '',
    especie: '',
    hipotesis: '',
    objetivo: '',
    fecha_inicio: '',
    fecha_fin_estimada: '',
    responsable: auth.currentUser?.displayName || auth.currentUser?.email || '',
    notas: '',
    factores: [],
    tratamientos: []
  });

  const [ejemplares, setEjemplares] = useState([]);
  const [medios, setMedios] = useState([]);
  const [salas, setSalas] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [ejSnap, medSnap, salSnap] = await Promise.all([
          getDocs(query(collection(db, 'ejemplares'))),
          getDocs(query(collection(db, 'medios_preparados'))),
          getDocs(query(collection(db, 'salas')))
        ]);
        setEjemplares(ejSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setMedios(medSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSalas(salSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error cargando datos:", err);
      }
    }
    fetchData();
  }, []);

  const uniqueEspecies = Array.from(
    new Map(ejemplares.filter(e => e.especie && e.genero).map(e => [`${e.genero}-${e.especie}`, e])).values()
  ).sort((a, b) => a.especie.localeCompare(b.especie));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEspecieChange = (e) => {
    const val = e.target.value;
    if (!val) {
      setFormData(prev => ({ ...prev, genero: '', especie: '' }));
      return;
    }
    const [genero, especie] = val.split('|');
    setFormData(prev => ({ ...prev, genero, especie }));
  };

  const addFactor = () => {
    setFormData(prev => ({
      ...prev,
      factores: [
        ...prev.factores,
        { id: `f${Date.now()}`, nombre: '', tipo: 'libre', niveles: [] }
      ]
    }));
  };

  const removeFactor = (factorId) => {
    setFormData(prev => ({
      ...prev,
      factores: prev.factores.filter(f => f.id !== factorId)
    }));
  };

  const updateFactor = (factorId, field, value) => {
    setFormData(prev => ({
      ...prev,
      factores: prev.factores.map(f => {
        if (f.id === factorId) {
          const updated = { ...f, [field]: value };
          if (field === 'tipo') {
            updated.niveles = []; // Reset niveles on type change
          }
          return updated;
        }
        return f;
      })
    }));
  };

  const addNivel = (factorId, nivelValue, nivelLabel) => {
    if (!nivelValue || !nivelLabel) return;
    setFormData(prev => ({
      ...prev,
      factores: prev.factores.map(f => {
        if (f.id === factorId) {
          // Evitar duplicados
          if (f.niveles.some(n => n.valor === nivelValue)) return f;
          return {
            ...f,
            niveles: [...f.niveles, { label: nivelLabel, valor: nivelValue }]
          };
        }
        return f;
      })
    }));
  };

  const removeNivel = (factorId, nivelValor) => {
    setFormData(prev => ({
      ...prev,
      factores: prev.factores.map(f => {
        if (f.id === factorId) {
          return {
            ...f,
            niveles: f.niveles.filter(n => n.valor !== nivelValor)
          };
        }
        return f;
      })
    }));
  };

  const generarTratamientos = () => {
    const factores = formData.factores;
    if (!factores || factores.length === 0) return;

    const nivelesPerFactor = factores.map(f => f.niveles ?? []);

    const cartesiano = (arrays) => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCartesiano = cartesiano(rest);
      return first.flatMap(item =>
        restCartesiano.map(combo => [item, ...combo])
      );
    };

    const combinaciones = cartesiano(nivelesPerFactor);

    const nuevosTratamientos = combinaciones.map((combo, idx) => {
      const niveles = {};
      const labelParts = [];

      factores.forEach((factor, i) => {
        niveles[factor.id] = combo[i];
        labelParts.push(combo[i]?.label ?? '');
      });

      return {
        id: `TRT-${String(idx + 1).padStart(3, '0')}`,
        label: labelParts.join(' · '),
        niveles,
        n_replicas_planificadas: 3,
        batch_ids: [],
        _incluir: true
      };
    });

    setFormData(prev => ({ ...prev, tratamientos: nuevosTratamientos }));
  };

  useEffect(() => {
    if (step === 3 && formData.tratamientos.length === 0 && formData.factores.length > 0) {
      generarTratamientos();
    }
  }, [step]);

  const updateTratamiento = (tId, field, value) => {
    setFormData(prev => ({
      ...prev,
      tratamientos: prev.tratamientos.map(t => t.id === tId ? { ...t, [field]: value } : t)
    }));
  };

  const addCustomTratamiento = () => {
    const nextId = `TRT-${String(formData.tratamientos.length + 1).padStart(3, '0')}`;
    const nivelesEmpty = {};
    formData.factores.forEach(f => nivelesEmpty[f.id] = null);
    
    setFormData(prev => ({
      ...prev,
      tratamientos: [
        ...prev.tratamientos,
        {
          id: nextId,
          label: 'Custom',
          niveles: nivelesEmpty,
          n_replicas_planificadas: 3,
          batch_ids: [],
          _incluir: true,
          _isCustom: true
        }
      ]
    }));
  };

  const updateCustomTratamientoNivel = (tId, factorId, nivelObj) => {
    setFormData(prev => ({
      ...prev,
      tratamientos: prev.tratamientos.map(t => {
        if (t.id === tId) {
          const newNiveles = { ...t.niveles, [factorId]: nivelObj };
          // Actualizar label
          const labelParts = formData.factores.map(f => newNiveles[f.id]?.label || '?');
          return { ...t, niveles: newNiveles, label: labelParts.join(' · ') };
        }
        return t;
      })
    }));
  };

  const isValidStep1 = formData.nombre && formData.especie && formData.genero && formData.responsable;
  const isValidStep2 = formData.factores.length > 0 && formData.factores.some(f => f.niveles.length >= 2);
  const isValidStep3 = formData.tratamientos.some(t => t._incluir && t.n_replicas_planificadas >= 1);
  const isValidStep4 = formData.tratamientos.length > 0 && formData.tratamientos.some(t => t._incluir);
  
  // Handler for creating experiment with batches
  const crearExperimentoConBatches = async () => {
    try {
      const expId = await generarIdExperimento(db, formData.genero, formData.especie);
      const batch = writeBatch(db);
      const expRef = doc(db, 'experimentos', expId);
      const experimentData = {
        id: expId,
        nombre: formData.nombre,
        genero: formData.genero,
        especie: formData.especie,
        hipotesis: formData.hipotesis,
        objetivo: formData.objetivo,
        estado: 'Planificado',
        fecha_creacion: serverTimestamp(),
        fecha_inicio: formData.fecha_inicio,
        fecha_fin_estimada: formData.fecha_fin_estimada,
        responsable: formData.responsable,
        factores: formData.factores,
        variables_respuesta: [],
        tratamientos: [],
        notas: formData.notas,
      };
      batch.set(expRef, experimentData);
      const tratamientosConBatches = [];
      for (const tr of formData.tratamientos) {
        if (!tr._incluir) continue;
        const batchIds = [];
        for (let i = 0; i < tr.n_replicas_planificadas; i++) {
          const batchId = generarIdBatch({
            genero: formData.genero,
            especie: formData.especie,
            codigo_cepa: null,
            es_hibridacion: false,
            contador_hibridacion: 0,
            codigo_medio: null,
            fecha_iso: new Date().toISOString(),
            secuencia_diaria: i + 1,
            letra_unidad: null,
            numero_transferencia: 1,
          });
          const batchRef = doc(db, 'batches', batchId);
          const atributos = {};
          Object.entries(tr.niveles).forEach(([fid, nivel]) => {
            const factor = formData.factores.find(f => f.id === fid);
            if (factor && factor.tipo === 'libre') {
              atributos[factor.nombre] = nivel.valor;
            }
          });
          batch.set(batchRef, {
            id: batchId,
            experimento_id: expId,
            tratamiento_id: tr.id,
            atributos_experimentales: atributos,
            status: 'Planificado',
            medioPrepId: tr.niveles[formData.factores.find(f => f.tipo === 'medio_prep')?.id]?.valor || null,
            destinoId: tr.niveles[formData.factores.find(f => f.tipo === 'destino')?.id]?.valor || null,
            ejemplarId: tr.niveles[formData.factores.find(f => f.tipo === 'ejemplar')?.id]?.valor || null,
            tipoContenedor: null,
          });
          batchIds.push(batchId);
        }
        tratamientosConBatches.push({ ...tr, batch_ids: batchIds });
      }
      batch.update(expRef, { tratamientos: tratamientosConBatches });
      await batch.commit();
      toast.success('Experimento creado con éxito');
      navigate(`/experimentos/${expId}`);
    } catch (err) {
      console.error(err);
      toast.error('Error creando el experimento');
    }
  };

  const renderStep4 = () => {
    const totalTrat = formData.tratamientos.filter(t => t._incluir).length;
    const totalUnits = formData.tratamientos.filter(t => t._incluir).reduce((a, t) => a + Number(t.n_replicas_planificadas || 0), 0);
    return (
      <div className="card animate-fade-in" style={{ padding: '2rem' }}>
        <h3 style={{ color: 'var(--primary-color)' }}>4. Confirmación y creación</h3>
        <p><strong>Nombre:</strong> {formData.nombre}</p>
        <p><strong>Especie:</strong> {formData.especie}</p>
        <p><strong>Responsable:</strong> {formData.responsable}</p>
        <p><strong>Tratamientos incluidos:</strong> {totalTrat}</p>
        <p><strong>Unidades totales:</strong> {totalUnits}</p>
        <button type="button" className="btn-primary" onClick={crearExperimentoConBatches}>Crear Experimento</button>
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="card animate-fade-in" style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>1. Metadata del Experimento</h3>
      
      <div className="form-group">
        <label className="form-label">Nombre del Experimento *</label>
        <input type="text" className="form-control" name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Ej: Efecto del medio en colonización" required />
      </div>

      <div className="form-group">
        <label className="form-label">Especie a estudiar *</label>
        <select className="form-control" value={formData.especie ? `${formData.genero}|${formData.especie}` : ''} onChange={handleEspecieChange} required>
          <option value="">Seleccione especie...</option>
          {uniqueEspecies.map(ej => (
            <option key={ej.id} value={`${ej.genero}|${ej.especie}`}>
              {ej.genero} {ej.especie}
            </option>
          ))}
        </select>
        <small style={{ color: 'var(--text-secondary)' }}>Seleccione desde la base de datos de ejemplares.</small>
      </div>

      <div className="form-group">
        <label className="form-label">Hipótesis</label>
        <textarea className="form-control" name="hipotesis" value={formData.hipotesis} onChange={handleChange} rows="3" placeholder="Ej: MEA produce mayor velocidad..."></textarea>
      </div>

      <div className="form-group">
        <label className="form-label">Objetivo</label>
        <textarea className="form-control" name="objetivo" value={formData.objetivo} onChange={handleChange} rows="3" placeholder="Ej: Comparar 3 medios..."></textarea>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Fecha de Inicio</label>
          <input type="date" className="form-control" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha de Fin Estimada</label>
          <input type="date" className="form-control" name="fecha_fin_estimada" value={formData.fecha_fin_estimada} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Responsable *</label>
        <input type="text" className="form-control" name="responsable" value={formData.responsable} onChange={handleChange} required />
      </div>

      <div className="form-group">
        <label className="form-label">Notas</label>
        <textarea className="form-control" name="notas" value={formData.notas} onChange={handleChange} rows="2"></textarea>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="card animate-fade-in" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>2. Definir Factores y Niveles</h3>
        <button type="button" className="btn-primary" onClick={addFactor}>+ Agregar Factor</button>
      </div>
      
      {formData.factores.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Aún no hay factores definidos. Agrega al menos uno para continuar.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {formData.factores.map((factor, fIndex) => (
            <div key={factor.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Nombre del Factor</label>
                  <input type="text" className="form-control" value={factor.nombre} onChange={e => updateFactor(factor.id, 'nombre', e.target.value)} placeholder={`Factor ${fIndex + 1}`} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Tipo</label>
                  <select className="form-control" value={factor.tipo} onChange={e => updateFactor(factor.id, 'tipo', e.target.value)}>
                    <option value="medio_prep">Medio de Cultivo</option>
                    <option value="ejemplar">Ejemplar / Cepa</option>
                    <option value="destino">Sala / Destino</option>
                    <option value="libre">Libre (Texto)</option>
                  </select>
                </div>
                <button type="button" className="btn-icon" style={{ color: 'var(--danger-color)', marginBottom: '0.5rem' }} onClick={() => removeFactor(factor.id)} title="Eliminar factor">🗑️</button>
              </div>

              <div>
                <label className="form-label">Niveles ({factor.niveles.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {factor.niveles.map((nivel, nIdx) => (
                    <span key={nIdx} style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {nivel.label}
                      <button type="button" onClick={() => removeNivel(factor.id, nivel.valor)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}>&times;</button>
                    </span>
                  ))}
                  {factor.niveles.length === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Sin niveles. Agrega opciones abajo.</span>}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {factor.tipo === 'medio_prep' && (
                    <select className="form-control" onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      addNivel(factor.id, e.target.value, opt.text);
                      e.target.value = '';
                    }} defaultValue="">
                      <option value="" disabled>Seleccionar medio...</option>
                      {medios.map(m => (
                        <option key={m.id} value={m.id}>{m.alias || m.nombre_receta} ({m.id})</option>
                      ))}
                    </select>
                  )}
                  {factor.tipo === 'ejemplar' && (
                    <select className="form-control" onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      addNivel(factor.id, e.target.value, opt.text);
                      e.target.value = '';
                    }} defaultValue="">
                      <option value="" disabled>Seleccionar cepa...</option>
                      {ejemplares.filter(ej => ej.especie === formData.especie).map(ej => (
                        <option key={ej.id} value={ej.id}>{ej.codigo_cepa || ej.cepa || ej.id}</option>
                      ))}
                    </select>
                  )}
                  {factor.tipo === 'destino' && (
                    <select className="form-control" onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      addNivel(factor.id, e.target.value, opt.text);
                      e.target.value = '';
                    }} defaultValue="">
                      <option value="" disabled>Seleccionar sala...</option>
                      {salas.map(s => (
                        <option key={s.id} value={s.id}>{s.nombre} ({s.tipo})</option>
                      ))}
                    </select>
                  )}
                  {factor.tipo === 'libre' && (
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Escriba un nivel y presione Enter" 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim() !== '') {
                          e.preventDefault();
                          addNivel(factor.id, e.target.value.trim(), e.target.value.trim());
                          e.target.value = '';
                        }
                      }} 
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderStep3 = () => {
    const totalTratamientosInscritos = formData.tratamientos.filter(t => t._incluir).length;
    const totalUnidades = formData.tratamientos.filter(t => t._incluir).reduce((acc, t) => acc + Number(t.n_replicas_planificadas || 0), 0);
    const avgReplicas = totalTratamientosInscritos > 0 ? (totalUnidades / totalTratamientosInscritos).toFixed(1) : 0;

    return (
      <div className="card animate-fade-in" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>3. Tratamientos Generados</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={generarTratamientos}>🔄 Regenerar Todos</button>
            <button type="button" className="btn-primary" onClick={addCustomTratamiento}>+ Agregar Tratamiento Custom</button>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
          <strong>{totalTratamientosInscritos}</strong> tratamientos × <strong>{avgReplicas}</strong> réplicas promedio = <strong style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}>{totalUnidades} unidades experimentales totales</strong>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="inventory-table">
            <thead>
              <tr>
                <th>ID</th>
                {formData.factores.map(f => (
                  <th key={f.id}>{f.nombre || f.id}</th>
                ))}
                <th style={{ width: '100px', textAlign: 'center' }}>Réplicas</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Incluir</th>
              </tr>
            </thead>
            <tbody>
              {formData.tratamientos.map(t => (
                <tr key={t.id} style={{ opacity: t._incluir ? 1 : 0.5, backgroundColor: t._incluir ? 'transparent' : '#f1f5f9' }}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{t.id}</td>
                  {formData.factores.map(f => (
                    <td key={f.id}>
                      {t._isCustom ? (
                        <select 
                          className="form-control" 
                          style={{ padding: '4px', height: 'auto', fontSize: '0.85rem' }}
                          value={t.niveles[f.id]?.valor || ''}
                          onChange={e => {
                            const opt = e.target.options[e.target.selectedIndex];
                            updateCustomTratamientoNivel(t.id, f.id, { valor: e.target.value, label: opt.text });
                          }}
                        >
                          <option value="" disabled>Seleccione...</option>
                          {f.niveles.map(n => <option key={n.valor} value={n.valor}>{n.label}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.9rem' }}>{t.niveles[f.id]?.label || '-'}</span>
                      )}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="number" 
                      className="form-control" 
                      style={{ width: '60px', padding: '4px', textAlign: 'center', margin: '0 auto' }} 
                      min="1" 
                      value={t.n_replicas_planificadas} 
                      onChange={e => updateTratamiento(t.id, 'n_replicas_planificadas', Number(e.target.value))} 
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={t._incluir} 
                      onChange={e => updateTratamiento(t.id, '_incluir', e.target.checked)} 
                      style={{ transform: 'scale(1.2)' }}
                    />
                  </td>
                </tr>
              ))}
              {formData.tratamientos.length === 0 && (
                <tr>
                  <td colSpan={formData.factores.length + 3} style={{ textAlign: 'center', padding: '2rem' }}>
                    No hay tratamientos generados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={() => navigate('/experimentos')}>← Volver</button>
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--text-color)' }}>
          Nuevo Experimento
        </h1>
      </div>

      {/* Stepper Header */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2rem' }}>
        {[1, 2, 3, 4].map(num => (
          <div key={num} style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            opacity: step === num ? 1 : 0.5,
            fontWeight: step === num ? 'bold' : 'normal',
            color: step === num ? 'var(--primary-color)' : 'var(--text-secondary)'
          }}>
            <div style={{ 
              width: '32px', height: '32px', borderRadius: '50%', 
              backgroundColor: step >= num ? 'var(--primary-color)' : '#e2e8f0', 
              color: step >= num ? 'white' : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '0.5rem', transition: 'all 0.3s'
            }}>
              {num}
            </div>
            <span style={{ fontSize: '0.8rem' }}>
              {num === 1 ? 'Metadata' : num === 2 ? 'Factores' : num === 3 ? 'Tratamientos' : 'Confirmar'}
            </span>
          </div>
        ))}
      </div>

      <form>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
          >
            Anterior
          </button>
          
          <button 
            type="button" 
            className="btn-primary" 
            onClick={() => setStep(s => s + 1)}
            disabled={
              (step === 1 && !isValidStep1) || 
              (step === 2 && !isValidStep2) ||
              (step === 3 && !isValidStep3) ||
              step === 4
            }
          >
            {step === 4 ? 'Crear Experimento' : 'Siguiente'}
          </button>
        </div>
      </form>
    </div>
  );
}
