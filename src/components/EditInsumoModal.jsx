import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, onSnapshot } from 'firebase/firestore';

export default function EditInsumoModal({ insumo, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [salas, setSalas] = useState([]);
  const [formData, setFormData] = useState({
    nombre: insumo.nombre || '',
    categoria: insumo.categoria || 'Químicos/Medios',
    stock_minimo_base: insumo.stock_minimo_base || 0,
    ubicacion: insumo.ubicacion || '',
    unidad_display: insumo.unidad_display || '',
    factor_display: insumo.factor_display || 1
  });

  useEffect(() => {
    const q = query(collection(db, "salas"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSalas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const categories = ['Químicos/Medios', 'Granos/Sustratos', 'Consumibles y Empaque', 'Sanidad'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const insumoRef = doc(db, 'insumos_base', insumo.id);
      await updateDoc(insumoRef, {
        nombre: formData.nombre,
        categoria: formData.categoria,
        stock_minimo_base: Number(formData.stock_minimo_base),
        ubicacion: formData.ubicacion,
        unidad_display: formData.unidad_display,
        factor_display: Number(formData.factor_display)
      });
      onSaved();
    } catch (error) {
      console.error("Error al actualizar insumo:", error);
      alert("Error al actualizar los datos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>✏️ Editar Insumo: {insumo.nombre}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Nombre del Insumo</label>
            <input 
              type="text" 
              className="form-control" 
              required 
              value={formData.nombre} 
              onChange={e => setFormData({...formData, nombre: e.target.value})} 
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select 
                className="form-control" 
                value={formData.categoria} 
                onChange={e => setFormData({...formData, categoria: e.target.value})}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ubicación (Sala)</label>
              <select 
                className="form-control" 
                value={formData.ubicacion} 
                onChange={e => setFormData({...formData, ubicacion: e.target.value})}
              >
                <option value="">-- Seleccioná Ubicación --</option>
                {salas.map(s => (
                  <option key={s.id} value={s.nombre}>{s.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Stock Mínimo ({insumo.unidad_base})</label>
              <input 
                type="number" 
                className="form-control" 
                required 
                value={formData.stock_minimo_base} 
                onChange={e => setFormData({...formData, stock_minimo_base: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Unidad Vista</label>
              <input 
                type="text" 
                className="form-control" 
                value={formData.unidad_display} 
                onChange={e => setFormData({...formData, unidad_display: e.target.value})} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Actualizar Insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
