import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, runTransaction, serverTimestamp, query, onSnapshot } from 'firebase/firestore';

export default function RegistroInsumoModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [salas, setSalas] = useState([]);
  const [formData, setFormData] = useState({
    // Maestro
    nombre: '',
    categoria: 'Químicos/Medios',
    unidad_compra: 'Rollo',
    unidad_display: 'metros',
    unidad_base: 'cm',
    factor_compra: 50, // 50 metros por rollo
    factor_display: 100, // 100 cm por metro
    stock_minimo_base: 1000,
    ubicacion: '',
    
    // Entrada
    proveedor: '',
    cantidad_compra: 1,
    costo_total: '',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    fecha_vencimiento: ''
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
      const insumoId = formData.nombre.toLowerCase().replace(/\s+/g, '-');
      const insumoRef = doc(db, 'insumos_base', insumoId);
      const entradasRef = collection(insumoRef, 'entradas');
      
      const factorTotal = Number(formData.factor_compra) * Number(formData.factor_display);
      const cantidadBaseNueva = Number(formData.cantidad_compra) * factorTotal;
      const costoUnidadBase = Number(formData.costo_total) / cantidadBaseNueva;

      await runTransaction(db, async (transaction) => {
        const insumoDoc = await transaction.get(insumoRef);
        
        // 1. Crear o actualizar el Maestro
        const masterData = {
          nombre: formData.nombre,
          categoria: formData.categoria,
          unidad_compra: formData.unidad_compra,
          unidad_display: formData.unidad_display,
          unidad_base: formData.unidad_base,
          factor_compra: Number(formData.factor_compra),
          factor_display: Number(formData.factor_display),
          factor_conversion: factorTotal,
          stock_minimo_base: Number(formData.stock_minimo_base),
          ubicacion: formData.ubicacion,
          stock_total_base: (insumoDoc.exists() ? insumoDoc.data().stock_total_base : 0) + cantidadBaseNueva,
          metadata: {
            ultimo_proveedor: formData.proveedor,
            fecha_ultima_compra: formData.fecha_ingreso,
            costo_promedio_base: costoUnidadBase // En una versión real, esto sería un promedio ponderado
          }
        };

        if (!insumoDoc.exists()) {
          transaction.set(insumoRef, { ...masterData, createdAt: serverTimestamp() });
        } else {
          transaction.update(insumoRef, masterData);
        }

        // 2. Registrar la Entrada
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
      });

      onSaved();
    } catch (error) {
      console.error("Error en el registro:", error);
      alert("Error al guardar los datos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>📦 Registrar Compra / Nuevo Insumo</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>1. Datos del Insumo (Maestro)</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input type="text" className="form-control" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej: Bolsa Tubular 40cm" />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-control" value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2">
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
              <div className="form-group">
                <label className="form-label">U. Compra (ej. Rollo)</label>
                <input type="text" className="form-control" value={formData.unidad_compra} onChange={e => setFormData({...formData, unidad_compra: e.target.value})} />
              </div>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: '1.5fr 1.5fr' }}>
              <div className="form-group">
                <label className="form-label">Contenido</label>
                <input type="number" className="form-control" value={formData.factor_compra} onChange={e => setFormData({...formData, factor_compra: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">U. Vista (ej. m)</label>
                <input type="text" className="form-control" value={formData.unidad_display} onChange={e => setFormData({...formData, unidad_display: e.target.value})} />
              </div>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.5fr 1.5fr' }}>
              <div className="form-group">
                <label className="form-label">Eq. Base</label>
                <input type="number" className="form-control" value={formData.factor_display} onChange={e => setFormData({...formData, factor_display: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">U. Base (ej. cm)</label>
                <input type="text" className="form-control" value={formData.unidad_base} onChange={e => setFormData({...formData, unidad_base: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Mín. ({formData.unidad_base})</label>
                <input type="number" className="form-control" value={formData.stock_minimo_base} onChange={e => setFormData({...formData, stock_minimo_base: e.target.value})} />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>
              💡 Lógica: 1 {formData.unidad_compra} = {formData.factor_compra} {formData.unidad_display} = {Number(formData.factor_compra) * Number(formData.factor_display)} {formData.unidad_base}
            </p>
          </div>

          <div className="section-divider" style={{ border: 'none', padding: 0, margin: 0 }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>2. Detalle de la Compra Actual</h4>
            <div className="form-group">
              <label className="form-label">Proveedor</label>
              <input type="text" className="form-control" required value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Cant. Comprada ({formData.unidad_compra})</label>
                <input type="number" className="form-control" required value={formData.cantidad_compra} onChange={e => setFormData({...formData, cantidad_compra: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Costo Total ($)</label>
                <input type="number" step="0.01" className="form-control" required value={formData.costo_total} onChange={e => setFormData({...formData, costo_total: e.target.value})} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Fecha Ingreso</label>
                <input type="date" className="form-control" value={formData.fecha_ingreso} onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Vencimiento (Opc)</label>
                <input type="date" className="form-control" value={formData.fecha_vencimiento} onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Procesando...' : 'Confirmar y Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
