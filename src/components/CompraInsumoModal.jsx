import { useState } from 'react';
import { db } from '../firebase';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export default function CompraInsumoModal({ insumo, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    proveedor: '',
    cantidad_compra: 1,
    costo_total: '',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    fecha_vencimiento: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const insumoRef = doc(db, 'insumos_base', insumo.id);
      const entradasRef = collection(insumoRef, 'entradas');
      
      const cantidadBaseNueva = Number(formData.cantidad_compra) * insumo.factor_conversion;
      const costoUnidadBase = Number(formData.costo_total) / cantidadBaseNueva;

      await runTransaction(db, async (transaction) => {
        const insumoDoc = await transaction.get(insumoRef);
        if (!insumoDoc.exists()) throw "Documento no existe";

        const currentStock = insumoDoc.data().stock_total_base || 0;
        
        // 1. Crear la entrada (ID generado automáticamente por Firestore)
        const newEntryRef = doc(entradasRef);
        transaction.set(newEntryRef, {
          proveedor: formData.proveedor,
          fecha_ingreso: formData.fecha_ingreso,
          fecha_vencimiento: formData.fecha_vencimiento || null,
          cantidad_compra: Number(formData.cantidad_compra),
          cantidad_base_inicial: cantidadBaseNueva,
          cantidad_base_actual: cantidadBaseNueva,
          costo_total_compra: Number(formData.costo_total),
          costo_unidad_base: costoUnidadBase,
          createdAt: serverTimestamp()
        });

        // 2. Actualizar el Maestro
        transaction.update(insumoRef, {
          stock_total_base: currentStock + cantidadBaseNueva,
          'metadata.ultimo_proveedor': formData.proveedor,
          'metadata.fecha_ultima_compra': formData.fecha_ingreso,
          // El costo promedio es un cálculo más complejo si queremos ser precisos, 
          // pero por ahora podemos actualizarlo con el último si se desea o dejarlo para un reporte.
        });
      });

      onSaved();
    } catch (error) {
      console.error("Error al registrar compra:", error);
      alert("Error al guardar la compra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in">
        <div className="modal-header">
          <div>
            <h3>Registrar Compra</h3>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>{insumo.nombre}</p>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Proveedor</label>
            <input 
              type="text" 
              className="form-control" 
              required
              value={formData.proveedor}
              onChange={e => setFormData({...formData, proveedor: e.target.value})}
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cantidad ({insumo.unidad_compra})</label>
              <input 
                type="number" 
                step="0.01"
                className="form-control" 
                required
                value={formData.cantidad_compra}
                onChange={e => setFormData({...formData, cantidad_compra: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Costo Total ($)</label>
              <input 
                type="number" 
                step="0.01"
                className="form-control" 
                required
                value={formData.costo_total}
                onChange={e => setFormData({...formData, costo_total: e.target.value})}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fecha de Ingreso</label>
              <input 
                type="date" 
                className="form-control" 
                required
                value={formData.fecha_ingreso}
                onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Vencimiento</label>
              <input 
                type="date" 
                className="form-control" 
                value={formData.fecha_vencimiento}
                onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})}
              />
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.3)', marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              Equivale a: <strong>{(Number(formData.cantidad_compra) * insumo.factor_conversion).toLocaleString()} {insumo.unidad_base}</strong>
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Costo unitario: <strong>${(Number(formData.costo_total) / (Number(formData.cantidad_compra) * insumo.factor_conversion) || 0).toFixed(4)}</strong> por {insumo.unidad_base}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registrando...' : 'Confirmar Ingreso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
