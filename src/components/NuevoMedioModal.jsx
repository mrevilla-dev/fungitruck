import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import PrintLabelsModal from './PrintLabelsModal';

export default function NuevoMedioModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [lotesDisponibles, setLotesDisponibles] = useState([]);
  const [recipientes, setRecipientes] = useState([]);
  const [isExperimental, setIsExperimental] = useState(false);
  
  const [selectedLotes, setSelectedLotes] = useState({}); // { insumoId: loteId }
  
  const [formData, setFormData] = useState({
    recetaId: '',
    cantidad_preparada: 1000, 
    fecha_preparacion: new Date().toISOString().split('T')[0],
    tipo_envasado: 'Bulk', // 'Bulk' o 'Fraccionado'
    recipienteId: '',
    cantidad_unidades: 1, // Ej: 10 placas
    
    // Campos Serie Experimental
    repeticiones: 1,
    variable_nombre: 'Respiración',
    variable_valores: 'Filtro 3M, Micropore, Sin Filtro',
    prefix_alias: 'EXP1'
  });

  useEffect(() => {
    // Suscripción a Recetas
    const q = query(collection(db, "recetas"));
    const unsubscribeRecetas = onSnapshot(q, (snapshot) => {
      setRecetas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Lotes Abiertos
    const qLotes = query(
      collection(db, "insumos_lotes"), 
      where("estado_apertura", "==", "Abierto"),
      where("cantidad_base_actual", ">", 0)
    );
    const unsubscribeLotes = onSnapshot(qLotes, (snapshot) => {
      setLotesDisponibles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Recipientes (Consumibles)
    const qRecip = query(collection(db, "insumos_base"), where("categoria", "==", "Consumibles y Empaque"));
    const unsubscribeRecip = onSnapshot(qRecip, (snapshot) => {
      setRecipientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeRecetas();
      unsubscribeLotes();
      unsubscribeRecip();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.recetaId) return alert("Seleccioná una receta");
    if (formData.tipo_envasado === 'Fraccionado' && (!formData.recipienteId || !formData.cantidad_unidades)) {
      return alert("Si es fraccionado, debés elegir el recipiente y la cantidad.");
    }
    
    setLoading(true);

    try {
      const receta = recetas.find(r => r.id === formData.recetaId);
      const itemsToCreate = isExperimental ? Number(formData.repeticiones) : 1;
      const variableValoresArr = formData.variable_valores.split(',').map(v => v.trim());
      const batchesData = [];

      await runTransaction(db, async (transaction) => {
        // 1. Verificar Stock de Insumos Base e Ingredientes
        const totalConsumo = {};
        receta.ingredientes.forEach(ing => {
          const factor = (formData.cantidad_preparada * itemsToCreate) / receta.rendimiento_teorico.cantidad;
          totalConsumo[ing.insumoId] = (totalConsumo[ing.insumoId] || 0) + (ing.cantidad * factor);
        });

        const insumosRefs = {};
        const insumosDocs = {};

        for (const insumoId in totalConsumo) {
          const selectedLoteId = selectedLotes[insumoId];
          if (!selectedLoteId) throw new Error(`Debés seleccionar un lote para el insumo: ${insumoId}`);

          insumosRefs[insumoId] = doc(db, 'insumos_lotes', selectedLoteId);
          const loteSnap = await transaction.get(insumosRefs[insumoId]);
          if (!loteSnap.exists()) throw new Error(`El lote seleccionado ya no existe.`);
          
          if (loteSnap.data().cantidad_base_actual < totalConsumo[insumoId]) {
            throw new Error(`Stock insuficiente en LOTE ${loteSnap.data().lote_interno}.`);
          }
          insumosDocs[insumoId] = loteSnap.data();
        }

        // 2. Verificar Stock de Recipientes (si es fraccionado)
        let recipRef = null;
        let recipSnap = null;
        if (formData.tipo_envasado === 'Fraccionado') {
          recipRef = doc(db, 'insumos_base', formData.recipienteId);
          recipSnap = await transaction.get(recipRef);
          const totalRecipientes = Number(formData.cantidad_unidades) * itemsToCreate;
          if (recipSnap.data().stock_total_base < totalRecipientes) {
            throw new Error(`Stock insuficiente de recipientes (${recipSnap.data().nombre}). Necesitás ${totalRecipientes}.`);
          }
        }

        // 3. Aplicar Descuentos
        for (const insumoId in totalConsumo) {
          transaction.update(insumosRefs[insumoId], {
            cantidad_base_actual: insumosDocs[insumoId].cantidad_base_actual - totalConsumo[insumoId]
          });
          const masterRef = doc(db, 'insumos_base', insumoId);
          const masterSnap = await transaction.get(masterRef);
          transaction.update(masterRef, {
            stock_total_base: masterSnap.data().stock_total_base - totalConsumo[insumoId]
          });
        }

        if (formData.tipo_envasado === 'Fraccionado') {
          transaction.update(recipRef, {
            stock_total_base: recipSnap.data().stock_total_base - (Number(formData.cantidad_unidades) * itemsToCreate)
          });
        }

        // 4. Crear Lotes de Medios
        const experimentId = isExperimental ? `EXP-${Date.now()}` : null;
        
        for (let i = 0; i < itemsToCreate; i++) {
          const newMedioRef = doc(collection(db, 'medios_preparados'));
          const variableValue = isExperimental ? variableValoresArr[i % variableValoresArr.length] : null;
          const alias = isExperimental 
            ? `${formData.prefix_alias}-P${i + 1}` 
            : `MP-${receta.nombre.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`;

          const data = {
            id: newMedioRef.id,
            alias: alias,
            recetaId: receta.id,
            nombre_receta: receta.nombre,
            tipo: receta.categoria,
            peso_seco_por_unidad_g: receta.peso_seco_por_unidad_g || 0,
            ph_esperado: receta.ph_esperado || null,
            estado: formData.tipo_envasado, // 'Bulk' o 'Fraccionado'

            stock_bulk: {
              cantidad_inicial: Number(formData.cantidad_preparada),
              cantidad_actual: Number(formData.cantidad_preparada),
              unidad: receta.rendimiento_teorico.unidad
            },
            stock_fraccionado: {
              cantidad_inicial: formData.tipo_envasado === 'Fraccionado' ? Number(formData.cantidad_unidades) : 0,
              cantidad_actual: formData.tipo_envasado === 'Fraccionado' ? Number(formData.cantidad_unidades) : 0,
              recipienteId: formData.recipienteId,
              recipienteNombre: formData.tipo_envasado === 'Fraccionado' ? recipientes.find(r => r.id === formData.recipienteId).nombre : null,
              unidad_final: 'Unidades'
            },
            trazabilidad: {
              insumos_consumidos: receta.ingredientes.map(ing => ({
                insumoId: ing.insumoId,
                loteId: selectedLotes[ing.insumoId],
                cantidad: (formData.cantidad_preparada / receta.rendimiento_teorico.cantidad) * ing.cantidad
              })),
              fecha_preparacion: formData.fecha_preparacion,
              operador: 'Sistema' 
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };


          if (isExperimental) {
            data.experimentId = experimentId;
            data.variables_experimentales = { [formData.variable_nombre]: variableValue };
          }

          transaction.set(newMedioRef, data);
          batchesData.push(data);
        }
      });

      setCreatedBatches(batchesData);
      setSuccess(true);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return <PrintLabelsModal batches={createdBatches} onClose={() => { onSaved(); onClose(); }} />;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '650px' }}>
        <div className="modal-header">
          <h3>🧫 Preparar y Envasar Medio</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>1. Receta y Cantidad</h4>
            <select className="form-control" required value={formData.recetaId} onChange={e => setFormData({...formData, recetaId: e.target.value})}>
              <option value="">-- Seleccioná Receta --</option>
              {recetas.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.categoria})</option>)}
            </select>

            <div className="grid-2" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Volumen Total (ml/g)</label>
                <input type="number" className="form-control" required value={formData.cantidad_preparada} onChange={e => setFormData({...formData, cantidad_preparada: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-control" value={formData.fecha_preparacion} onChange={e => setFormData({...formData, fecha_preparacion: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="section-divider" style={{ background: 'rgba(59, 130, 246, 0.03)', padding: '1rem', borderRadius: '12px' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>2. Tipo de Envasado</h4>
            <div className="grid-2">
              <button type="button" className={`tipo-btn ${formData.tipo_envasado === 'Bulk' ? 'active' : ''}`} onClick={() => setFormData({...formData, tipo_envasado: 'Bulk'})}>📦 A Granel (Bulk)</button>
              <button type="button" className={`tipo-btn ${formData.tipo_envasado === 'Fraccionado' ? 'active' : ''}`} onClick={() => setFormData({...formData, tipo_envasado: 'Fraccionado'})}>🧪 Fraccionado</button>
            </div>

            {formData.tipo_envasado === 'Fraccionado' && (
              <div className="animate-fade-in" style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Recipiente a usar</label>
                  <select className="form-control" required value={formData.recipienteId} onChange={e => setFormData({...formData, recipienteId: e.target.value})}>
                    <option value="">-- Seleccionar Envase --</option>
                    {recipientes.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.stock_total_base}u disp.)</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Cantidad de Unidades (Placas/Frascos)</label>
                  <input type="number" className="form-control" placeholder="Ej: 20" value={formData.cantidad_unidades} onChange={e => setFormData({...formData, cantidad_unidades: e.target.value})} />
                </div>
              </div>
            )}
          </div>

          {/* Lotes de Insumos */}
          {formData.recetaId && (
            <div className="section-divider">
              <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>🔍 Lotes de Insumos Activos</h4>
              {recetas.find(r => r.id === formData.recetaId)?.ingredientes.map(ing => (
                <div key={ing.insumoId} style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{ing.nombre || ing.insumoId}</label>
                  <select className="form-control form-control-sm" required value={selectedLotes[ing.insumoId] || ''} onChange={e => setSelectedLotes({...selectedLotes, [ing.insumoId]: e.target.value})}>
                    <option value="">-- Elegir Lote Abierto --</option>
                    {lotesDisponibles.filter(l => l.insumoId === ing.insumoId).map(l => (
                      <option key={l.id} value={l.id}>{l.lote_interno} ({l.cantidad_base_actual.toFixed(1)} {l.unidad_base})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cerrar</button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Procesando...' : '💾 Registrar y Descontar Envases'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
