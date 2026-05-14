import { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, setDoc } from 'firebase/firestore';

export default function RegistroCosechaModal({ batch, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha_cosecha: new Date().toISOString().split('T')[0],
    peso_fresco: '',
    peso_seco_sustrato: batch.peso_seco_sustrato_g || batch.peso_seco_sustrato || 0, 

    n_esporomas: '',
    tamanio_promedio: 'Medio',
    notas: '',
    numero_oleada: 1,
    es_cosecha_final: false,
    generar_aislamiento: false

  });

  const calcularEB = () => {
    if (!formData.peso_fresco || !formData.peso_seco_sustrato) return 0;
    return (Number(formData.peso_fresco) / Number(formData.peso_seco_sustrato) * 100).toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const eb = calcularEB();
      
      // 1. Registrar el evento de cosecha
      await addDoc(collection(db, 'cosechas'), {
        batchId: batch.id,
        batchGroupId: batch.batchGroupId || null,
        especie: batch.especie,
        ...formData,
        peso_fresco: Number(formData.peso_fresco),
        peso_seco_sustrato: Number(formData.peso_seco_sustrato),
        eficiencia_biologica: Number(eb),
        numero_oleada: Number(formData.numero_oleada),
        es_cosecha_final: formData.es_cosecha_final,
        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp()
      });


      // 2. Si se marcó generar aislamiento, crear entrada en esporomas (Cepario)
      if (formData.generar_aislamiento) {
        const esporomaId = `ESP-RET-${batch.id}-${Date.now().toString().slice(-4)}`;
        await setDoc(doc(db, "esporomas", esporomaId), {
          id: esporomaId,
          genero: batch.especie?.split(' ')[0] || 'Desconocido',
          especie: batch.especie?.split(' ')[1] || 'sp.',
          lugarRecoleccion: `Retorno de Lote: ${batch.id}`,
          fechaRecoleccion: formData.fecha_cosecha,
          ploidia: 'Diploide', 
          tipo_micelio: 'Dicarión',
          mat: 'N/A',
          descripcion: `Aislamiento obtenido de la cosecha del lote ${batch.id}. EB: ${eb}%`,
          operator: 'Maxi',
          batchId_origen: batch.id,
          cepaOrigen: batch.cepa || 'Desconocida',
          generacion: (batch.generacion || 1) + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });


      }

      // 3. Actualizar el estado del lote
      const batchUpdate = {
        cosecha: {
          fecha: formData.fecha_cosecha,
          peso_fresco: Number(formData.peso_fresco),
          eb: Number(eb)
        },
        updatedAt: serverTimestamp()
      };
      
      if (formData.es_cosecha_final) {
        batchUpdate.status = 'Cosechado';
      }
      
      await updateDoc(doc(db, 'batches', batch.id), batchUpdate);


      alert(`✅ Cosecha registrada. ${formData.generar_aislamiento ? 'Cepario actualizado.' : ''} EB: ${eb}%`);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error al registrar cosecha: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3>🧺 Registrar Cosecha</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Lote: <strong>{batch.id}</strong> ({batch.especie})
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Fecha de Cosecha</label>
            <input type="date" className="form-control" required value={formData.fecha_cosecha} onChange={e => setFormData({...formData, fecha_cosecha: e.target.value})} />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Peso Fresco (g)</label>
              <input type="number" step="0.1" className="form-control" required value={formData.peso_fresco} onChange={e => setFormData({...formData, peso_fresco: e.target.value})} placeholder="0.0" />
            </div>
            <div className="form-group">
              <label className="form-label">Peso Seco Sustrato (g)</label>
              <div className="form-control" style={{ background: 'var(--border-color)', opacity: 0.8, cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                {formData.peso_seco_sustrato} g
                {batch.peso_seco_es_medido && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', background: 'var(--accent-color)', color: 'white', padding: '1px 5px', borderRadius: '4px' }}>MEDIDO</span>}
              </div>
            </div>

          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--accent-color)' }}>
             <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Eficiencia Biológica (EB)</span>
             <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{calcularEB()}%</div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">N° Esporomas</label>
              <input type="number" className="form-control" value={formData.n_esporomas} onChange={e => setFormData({...formData, n_esporomas: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Tamaño</label>
              <select className="form-control" value={formData.tamanio_promedio} onChange={e => setFormData({...formData, tamanio_promedio: e.target.value})}>
                <option value="Pequeño">Pequeño</option>
                <option value="Medio">Medio</option>
                <option value="Grande">Grande</option>
                <option value="Gigante">Gigante</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notas de Cosecha</label>
            <textarea className="form-control" rows="2" value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} placeholder="Calidad, color, etc." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Número de Oleada (Flush)</label>
              <input type="number" className="form-control" min="1" required value={formData.numero_oleada} onChange={e => setFormData({...formData, numero_oleada: e.target.value})} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <input 
                type="checkbox" 
                id="cosecha_final" 
                style={{ width: '18px', height: '18px' }} 
                checked={formData.es_cosecha_final} 
                onChange={e => setFormData({...formData, es_cosecha_final: e.target.checked})} 
              />
              <label htmlFor="cosecha_final" style={{ fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', color: 'var(--danger-color)' }}>
                🚩 Cosecha Final (Cerrar Lote)
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <input 
 
              type="checkbox" 
              id="aislamiento" 
              style={{ width: '20px', height: '20px' }} 
              checked={formData.generar_aislamiento} 
              onChange={e => setFormData({...formData, generar_aislamiento: e.target.checked})} 
            />
            <label htmlFor="aislamiento" style={{ fontSize: '0.85rem', fontWeight: '500', cursor: 'pointer' }}>
              🧬 Generar Aislamiento (Volver al Cepario)
            </label>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>

            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cerrar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : '🧺 Confirmar Cosecha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
