import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import PropTypes from 'prop-types';

export default function InsumoFormModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: 'Medios y reactivos',
    unidad_compra: '',
    unidad_base: '',
    factor_conversion: '',
    stock_minimo_base: 0,
    // Campos Equipamiento
    marca_modelo: '',
    nro_serie: '',
    propietario: 'facultad', // facultad / emprendimiento / personal
    fecha_adquisicion: new Date().toISOString().split('T')[0],
    valor_compra: 0,
    vida_util_anios: 5,
    valor_residual: 0,
    // Campos Reutilizables
    tipo_contenedor: '',
    capacidad_ml: 0,
    // Campos Bioseguridad
    concentracion_uso: '',
    clasificacion: 'limpieza', // limpieza / desinfectante
    // Campos Descartables
    esterilidad_origen: 'N',
    // Campos Bioquímica
    porcentaje_carbono: '',
    porcentaje_nitrogeno: '',
    porcentaje_humedad: ''
  });

  const categories = [
    'Medios y reactivos',
    'Sustratos y granos',
    'Descartables',
    'Reutilizables',
    'Bioseguridad',
    'Equipamiento'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const docData = {
        ...formData,
        factor_conversion: formData.categoria === 'Reutilizables' ? 1 : Number(formData.factor_compra) * Number(formData.factor_display),
        stock_minimo_base: Number(formData.stock_minimo_base),
        stock_total_base: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        metadata: {
          ultimo_proveedor: '',
          fecha_ultima_compra: null,
          costo_promedio_base: 0
        }
      };

      if (formData.categoria === 'Equipamiento') {
        docData.equipamiento = {
          marca_modelo: formData.marca_modelo,
          nro_serie: formData.nro_serie,
          propietario: formData.propietario,
          fecha_adquisicion: formData.fecha_adquisicion,
          valor_compra: Number(formData.valor_compra),
          vida_util_anios: Number(formData.vida_util_anios),
          valor_residual: Number(formData.valor_residual)
        };
      }

      if (formData.categoria === 'Reutilizables') {
        docData.reutilizable = {
          tipo_contenedor: formData.tipo_contenedor,
          capacidad_ml: Number(formData.capacidad_ml)
        };
      }

      if (formData.categoria === 'Bioseguridad') {
        docData.bioseguridad = {
          concentracion_uso: formData.concentracion_uso,
          clasificacion: formData.clasificacion
        };
      }

      if (formData.categoria === 'Descartables') {
        docData.descartables = {
          esterilidad_origen: formData.esterilidad_origen
        };
      }

      if (['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(formData.categoria)) {
        docData.bioquimica = {
          porcentaje_carbono: formData.porcentaje_carbono ? Number(formData.porcentaje_carbono) : 0,
          porcentaje_nitrogeno: formData.porcentaje_nitrogeno ? Number(formData.porcentaje_nitrogeno) : 0,
          porcentaje_humedad: formData.porcentaje_humedad ? Number(formData.porcentaje_humedad) : 0
        };
      }

      await addDoc(collection(db, 'insumos_base'), docData);
      onSaved();
    } catch (error) {
      console.error("Error adding insumo:", error);
      toast.error("Error al guardar el insumo");
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

          {formData.categoria !== 'Equipamiento' && (
            <div className="section-divider" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px dashed rgba(59, 130, 246, 0.3)', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontWeight: '600' }}>
                💡 CONFIGURACIÓN DE RENDIMIENTO
              </div>
              <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Unidad Compra (ej. Pack, Rollo)</label>
                  <input type="text" className="form-control" value={formData.unidad_compra} onChange={e => setFormData({...formData, unidad_compra: e.target.value})} placeholder="Pack" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Contenido por Unidad</label>
                  <div className="flex-gap">
                    <input type="number" className="form-control" value={formData.factor_compra} onChange={e => setFormData({...formData, factor_compra: e.target.value})} placeholder="10" />
                    <input type="text" className="form-control" style={{ width: '90px' }} placeholder="un" value={formData.unidad_display} onChange={e => setFormData({...formData, unidad_display: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ margin: '1rem 0 0 0' }}>
                <label className="form-label">Equivalencia Mínima</label>
                <div className="flex-gap">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>1 {formData.unidad_display || 'un'} =</span>
                  <input type="number" className="form-control" value={formData.factor_display} onChange={e => setFormData({...formData, factor_display: e.target.value})} />
                  <input type="text" className="form-control" style={{ width: '90px' }} value={formData.unidad_base} onChange={e => setFormData({...formData, unidad_base: e.target.value})} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid rgba(59, 130, 246, 0.1)', paddingTop: '1rem' }}>
                <label className="form-label" style={{ color: '#10b981' }}>🔔 Stock Mínimo Alerta ({formData.unidad_base || 'unidades'})</label>
                <input type="number" className="form-control" value={formData.stock_minimo_base} onChange={e => setFormData({...formData, stock_minimo_base: e.target.value})} placeholder="Ej: 50" />
              </div>
            </div>
          )}

          {['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(formData.categoria) && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#8b5cf6' }}>🔬 Propiedades Bioquímicas (Opcional)</h4>
              <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">% Carbono (C)</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-control" placeholder="Ej: 40.0" value={formData.porcentaje_carbono} onChange={e => setFormData({...formData, porcentaje_carbono: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">% Nitrógeno (N)</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-control" placeholder="Ej: 2.0" value={formData.porcentaje_nitrogeno} onChange={e => setFormData({...formData, porcentaje_nitrogeno: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">% Humedad Teórica</label>
                  <input type="number" step="0.1" min="0" max="100" className="form-control" placeholder="Ej: 10.0" value={formData.porcentaje_humedad} onChange={e => setFormData({...formData, porcentaje_humedad: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {/* Se eliminó el bloque repetido de factor_conversion y stock_minimo_base fuera del condicional */}

          {formData.categoria === 'Equipamiento' && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🛠️ Datos de Equipamiento</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Marca / Modelo</label>
                  <input type="text" className="form-control" value={formData.marca_modelo} onChange={e => setFormData({...formData, marca_modelo: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nro Serie</label>
                  <input type="text" className="form-control" value={formData.nro_serie} onChange={e => setFormData({...formData, nro_serie: e.target.value})} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Fecha de Adquisición</label>
                  <input type="date" className="form-control" value={formData.fecha_adquisicion} onChange={e => setFormData({...formData, fecha_adquisicion: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor de Compra ($)</label>
                  <input type="number" className="form-control" value={formData.valor_compra} onChange={e => setFormData({...formData, valor_compra: e.target.value})} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Vida Útil (Años)</label>
                  <input type="number" className="form-control" value={formData.vida_util_anios} onChange={e => setFormData({...formData, vida_util_anios: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor Residual ($)</label>
                  <input type="number" className="form-control" value={formData.valor_residual} onChange={e => setFormData({...formData, valor_residual: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Propietario</label>
                  <select className="form-control" value={formData.propietario} onChange={e => setFormData({...formData, propietario: e.target.value})}>
                    <option value="facultad">Facultad</option>
                    <option value="emprendimiento">Emprendimiento</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {formData.categoria === 'Reutilizables' && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🔄 Propiedades Reutilizables</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo de Contenedor</label>
                  <input type="text" className="form-control" placeholder="Ej: Beaker, Frasco, Caja" value={formData.tipo_contenedor} onChange={e => setFormData({...formData, tipo_contenedor: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacidad (ml)</label>
                  <input type="number" className="form-control" value={formData.capacidad_ml} onChange={e => setFormData({...formData, capacidad_ml: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {formData.categoria === 'Bioseguridad' && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#10b981' }}>🛡️ Datos de Bioseguridad</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Concentración de Uso</label>
                  <input type="text" className="form-control" placeholder="Ej: 70%, 10%, 200ppm" value={formData.concentracion_uso} onChange={e => setFormData({...formData, concentracion_uso: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Clasificación</label>
                  <select className="form-control" value={formData.clasificacion} onChange={e => setFormData({...formData, clasificacion: e.target.value})}>
                    <option value="limpieza">Limpieza</option>
                    <option value="desinfectante">Desinfectante</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {formData.categoria === 'Descartables' && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#f59e0b' }}>📦 Datos de Descartables</h4>
              <div className="form-group">
                <label className="form-label">¿Esterilidad de Origen?</label>
                <select className="form-control" value={formData.esterilidad_origen} onChange={e => setFormData({...formData, esterilidad_origen: e.target.value})}>
                  <option value="S">Sí</option>
                  <option value="N">No</option>
                </select>
              </div>
            </div>
          )}

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

InsumoFormModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
