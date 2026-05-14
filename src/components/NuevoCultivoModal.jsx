import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp, orderBy, where } from 'firebase/firestore';
import PrintLabelsModal from './PrintLabelsModal';
import { generateBatchId } from '../utils/idGenerator';

export default function NuevoCultivoModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);
  
  const [medios, setMedios] = useState([]);
  const [recipientes, setRecipientes] = useState([]);
  
  const [formData, setFormData] = useState({
    medioId: '',
    recipienteId: '',
    cantidad_por_unidad: 20, 
    repeticiones: 1,
    especie: '',
    cepa: '',
    ploidia: 'Diploide',
    tipo_micelio: 'Dicarión',
    mat: 'N/A',
    cepa_madre_id: '',
    paternal_id: '',
    maternal_id: '',
    peso_inoculo: 0,
    peso_sustrato: 0,
    observaciones: '',
    fecha_inoculacion: new Date().toISOString().split('T')[0],
  });

  const [ratio, setRatio] = useState(0);
  const [isFraccionado, setIsFraccionado] = useState(false);

  useEffect(() => {
    if (formData.peso_inoculo > 0 && formData.peso_sustrato > 0) {
      setRatio(((formData.peso_inoculo / formData.peso_sustrato) * 100).toFixed(2));
    } else setRatio(0);
  }, [formData.peso_inoculo, formData.peso_sustrato]);

  useEffect(() => {
    const unsubMedios = onSnapshot(collection(db, "medios_preparados"), (snap) => {
      setMedios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(m => 
        (m.estado === 'Bulk' && m.stock_bulk.cantidad_actual > 0) || 
        (m.estado === 'Fraccionado' && m.stock_fraccionado.cantidad_actual > 0)
      ));
    });

    const unsubRecipientes = onSnapshot(query(collection(db, "insumos_base"), where("categoria", "==", "Consumibles y Empaque")), (snap) => {
      setRecipientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubMedios(); unsubRecipientes(); };
  }, []);

  useEffect(() => {
    if (formData.medioId) {
      const selectedMedio = medios.find(m => m.id === formData.medioId);
      if (selectedMedio && selectedMedio.estado === 'Fraccionado') {
        setIsFraccionado(true);
        setFormData(prev => ({
          ...prev,
          recipienteId: selectedMedio.stock_fraccionado.recipienteId,
          repeticiones: selectedMedio.stock_fraccionado.cantidad_actual,
          cantidad_por_unidad: selectedMedio.stock_bulk.cantidad_actual / selectedMedio.stock_fraccionado.cantidad_inicial
        }));
      } else {
        setIsFraccionado(false);
      }
    }
  }, [formData.medioId, medios]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const batchesToCreate = [];

    try {
      const selectedMedio = medios.find(m => m.id === formData.medioId);
      const selectedRecipiente = recipientes.find(r => r.id === formData.recipienteId);

      await runTransaction(db, async (transaction) => {
        const medioRef = doc(db, 'medios_preparados', formData.medioId);
        
        if (isFraccionado) {
          transaction.update(medioRef, {
            'stock_fraccionado.cantidad_actual': 0,
            'stock_bulk.cantidad_actual': 0
          });
        } else {
          const totalMedio = Number(formData.cantidad_por_unidad) * Number(formData.repeticiones);
          const recipRef = doc(db, 'insumos_base', formData.recipienteId);
          const medioSnap = await transaction.get(medioRef);
          const recipSnap = await transaction.get(recipRef);

          if (medioSnap.data().stock_bulk.cantidad_actual < totalMedio) throw new Error("Stock de medio insuficiente.");
          if (recipSnap.data().stock_total_base < formData.repeticiones) throw new Error("Recipientes insuficientes.");

          transaction.update(medioRef, { 'stock_bulk.cantidad_actual': medioSnap.data().stock_bulk.cantidad_actual - totalMedio });
          transaction.update(recipRef, { stock_total_base: recipSnap.data().stock_total_base - Number(formData.repeticiones) });
        }

        const batchBaseId = generateBatchId('CL');
        const timestamp = serverTimestamp();

        for (let i = 1; i <= formData.repeticiones; i++) {
          const unitId = `${batchBaseId}-${i.toString().padStart(2, '0')}`;
          const unitData = {
            id: unitId,
            batchGroupId: batchBaseId,
            especie: formData.especie,
            cepa: formData.cepa,
            substrate: selectedMedio.nombre_receta,
            peso_seco_por_unidad_g: selectedMedio.peso_seco_por_unidad_g || 0,
            ph_esperado: selectedMedio.ph_esperado || null,
            recipiente: selectedRecipiente ? selectedRecipiente.nombre : 'Recipiente Lote',
            status: 'Incubación',
            fecha_inoculacion: formData.fecha_inoculacion,
            observaciones: formData.observaciones,
            variables_predictivas: { 
              peso_inoculo: Number(formData.peso_inoculo),
              peso_sustrato: Number(formData.peso_sustrato),
              ratio_inoculacion: Number(ratio) 
            },
            trazabilidad_genetica: {
              cepa_madre: formData.cepa_madre_id,
              paternal: formData.paternal_id,
              maternal: formData.maternal_id,
              ploidia: formData.ploidia,
              tipo_micelio: formData.tipo_micelio,
              mat: formData.mat
            },
            medio_origen_id: selectedMedio.id,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          transaction.set(doc(db, 'batches', unitId), unitData);
          batchesToCreate.push(unitData);
        }
      });
      setCreatedBatches(batchesToCreate);
      setSuccess(true);
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  if (success) return <PrintLabelsModal batches={createdBatches} onClose={() => { onSaved(); onClose(); }} />;

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <h3>🌱 Nueva Inoculación Trazable</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          
          <div className="section-divider">
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>1. Sustrato y Envase</h4>
            <div className="form-group">
              <label className="form-label">Elegir Lote de Medio Preparado</label>
              <select className="form-control" required value={formData.medioId} onChange={e => setFormData({...formData, medioId: e.target.value})}>
                <option value="">-- Seleccionar Lote --</option>
                {medios.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.estado === 'Fraccionado' ? '🧪' : '📦'} {m.alias} - {m.nombre_receta} 
                    ({m.estado === 'Fraccionado' ? `${m.stock_fraccionado.cantidad_actual} unidades` : `${m.stock_bulk.cantidad_actual}ml`})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Recipiente {isFraccionado && '(Auto)'}</label>
                <select className="form-control" required disabled={isFraccionado} value={formData.recipienteId} onChange={e => setFormData({...formData, recipienteId: e.target.value})}>
                  <option value="">-- Seleccionar --</option>
                  {recipientes.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.stock_total_base}u)</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Unidades {isFraccionado && '(Lote)'}</label>
                <input type="number" className="form-control" required disabled={isFraccionado} value={formData.repeticiones} onChange={e => setFormData({...formData, repeticiones: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="section-divider">
            <h4 style={{ color: 'var(--accent-color)', marginBottom: '1rem' }}>2. Genética y Origen</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Especie</label>
                <input type="text" className="form-control" required placeholder="Ej: P. Ostreatus" value={formData.especie} onChange={e => setFormData({...formData, especie: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Cepa ID</label>
                <input type="text" className="form-control" placeholder="Ej: PO-2024" value={formData.cepa} onChange={e => setFormData({...formData, cepa: e.target.value})} />
              </div>
            </div>

            <div className="form-group" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
              <label className="form-label">🧬 Trazabilidad Genética (Parentales)</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input type="text" className="form-control" placeholder="ID Placa Madre / QR" value={formData.cepa_madre_id} onChange={e => setFormData({...formData, cepa_madre_id: e.target.value})} />
                <button type="button" className="btn btn-outline" style={{ padding: '0.5rem', width: 'auto' }}>📷 Scan</button>
              </div>
              <div className="grid-2">
                <input type="text" className="form-control" placeholder="ID Paternal" value={formData.paternal_id} onChange={e => setFormData({...formData, paternal_id: e.target.value})} />
                <input type="text" className="form-control" placeholder="ID Maternal" value={formData.maternal_id} onChange={e => setFormData({...formData, maternal_id: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="section-divider" style={{ background: 'rgba(59, 130, 246, 0.03)', padding: '1rem', borderRadius: '12px' }}>
            <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>📈 Datos de Inoculación (Ratio)</h4>
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Peso Inóculo (g)</label>
                <input type="number" className="form-control" value={formData.peso_inoculo} onChange={e => setFormData({...formData, peso_inoculo: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Peso Sustrato (g)</label>
                <input type="number" className="form-control" value={formData.peso_sustrato} onChange={e => setFormData({...formData, peso_sustrato: e.target.value})} />
              </div>
              <div style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--primary-color)', alignSelf: 'center' }}>
                Ratio: {ratio}%
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones Iniciales</label>
            <textarea className="form-control" rows="2" placeholder="Vigor del micelio, condiciones de inoculación..." value={formData.observaciones} onChange={e => setFormData({...formData, observaciones: e.target.value})} />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button>

            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{loading ? 'Procesando...' : '🚀 Registrar Lote Trazable'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
