import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc, deleteDoc } from 'firebase/firestore';

export default function BatchEditModal({ batch, onClose, onSaved }) {
  const [form, setForm] = useState({
    genero: '',
    especie: '',
    cepa: '',
    substrate: '',
    status: '',
    medicionDiametro: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (batch) {
      setForm({
        genero: batch.genero || '',
        especie: batch.especie || '',
        cepa: batch.cepa || '',
        substrate: batch.substrate || '',
        status: batch.status || 'Inoculado',
        medicionDiametro: batch.medicionDiametro || ''
      });
    }
  }, [batch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const batchRef = doc(db, 'batches', batch.id);
      await updateDoc(batchRef, {
        ...form,
        updatedAt: serverTimestamp()
      });
      
      // Registrar la evolución en el historial si cambió el estado o hay medición
      if (form.status !== batch.status || form.medicionDiametro !== batch.medicionDiametro) {
        await addDoc(collection(db, "mantenimiento"), {
          batchId: batch.id,
          status: form.status,
          medicion: form.medicionDiametro ? `${form.medicionDiametro}mm` : null,
          type: 'evolucion',
          operator: 'Maxi',
          createdAt: new Date().toISOString(),
          serverTimestamp: serverTimestamp()
        });
      }

      onSaved({ ...batch, ...form });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el lote");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`⚠️ ¿Estás seguro de eliminar el lote ${batch.id}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'batches', batch.id));
      onSaved(null); // Signal deletion
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el lote");
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✏️ Editar Lote {batch.id}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Género</label>
              <input type="text" className="form-control" value={form.genero} onChange={e => setForm({...form, genero: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Especie</label>
              <input type="text" className="form-control" value={form.especie} onChange={e => setForm({...form, especie: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cepa</label>
            <input type="text" className="form-control" value={form.cepa} onChange={e => setForm({...form, cepa: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Sustrato / Medio</label>
            <input type="text" className="form-control" value={form.substrate} onChange={e => setForm({...form, substrate: e.target.value})} required />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Estado del Cultivo</label>
              <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="Inoculado">Inoculado</option>
                <option value="Colonizando">Colonizando</option>
                <option value="Cosechado">🍄 Cosechado</option>
                <option value="Contaminado">⚠️ Contaminado</option>
                <option value="Descartado">🗑️ Descartado</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Medida Colonia (mm Ø)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="Ej: 15" 
                value={form.medicionDiametro} 
                onChange={e => setForm({...form, medicionDiametro: e.target.value})} 
              />
            </div>
          </div>
          
          <div className="flex-gap" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
              {loading ? "Guardando..." : "💾 Guardar Cambios"}
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={loading} style={{ flex: 1 }}>
              Eliminar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
