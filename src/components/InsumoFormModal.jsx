import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function InsumoFormModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: 'Químicos/Medios',
    unidad_compra: '',
    unidad_base: '',
    factor_conversion: '',
    stock_minimo_base: 0
  });

  const categories = [
    'Químicos/Medios',
    'Granos/Sustratos',
    'Consumibles y Empaque',
    'Sanidad'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const docData = {
        ...formData,
        factor_conversion: Number(formData.factor_conversion),
        stock_minimo_base: Number(formData.stock_minimo_base),
        stock_total_base: 0,
        fecha_creacion: serverTimestamp(),
        metadata: {
          ultimo_proveedor: '',
          fecha_ultima_compra: null,
          costo_promedio_base: 0
        }
      };
      await addDoc(collection(db, 'insumos_base'), docData);
      onSaved();
    } catch (error) {
      console.error("Error adding insumo:", error);
      alert("Error al guardar el insumo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in">
        <div className="modal-header">
          <h3>Nuevo Insumo Maestro</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre del Insumo</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: Bolsa Tubular Polipropileno" 
              required
              value={formData.nombre}
              onChange={e => setFormData({...formData, nombre: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Categoría</label>
            <select 
              className="form-control"
              value={formData.categoria}
              onChange={e => setFormData({...formData, categoria: e.target.value})}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Unidad de Compra</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ej: Rollo, Saco" 
                required
                value={formData.unidad_compra}
                onChange={e => setFormData({...formData, unidad_compra: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Unidad Base (Consumo)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ej: cm, g, ml" 
                required
                value={formData.unidad_base}
                onChange={e => setFormData({...formData, unidad_base: e.target.value})}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Factor de Conversión</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="Cant. base por unidad compra" 
                required
                value={formData.factor_conversion}
                onChange={e => setFormData({...formData, factor_conversion: e.target.value})}
              />
              <small style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {formData.unidad_compra && formData.unidad_base && formData.factor_conversion && (
                  `1 ${formData.unidad_compra} = ${formData.factor_conversion} ${formData.unidad_base}`
                )}
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Stock Mínimo ({formData.unidad_base})</label>
              <input 
                type="number" 
                className="form-control" 
                required
                value={formData.stock_minimo_base}
                onChange={e => setFormData({...formData, stock_minimo_base: e.target.value})}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Crear Insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
