import React, { useState } from 'react';
import { registrarReparacion } from '../services/equipoService';
import toast from 'react-hot-toast';
import PropTypes from 'prop-types';

export default function ReparacionFormModal({ equipoId, onClose, onSave, user }) {
  const [cargando, setCargando] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    costo: '',
    notas: '',
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.fecha || !formData.descripcion) {
      return toast('Fecha y descripción son obligatorias.');
    }
    
    setCargando(true);
    try {
      await registrarReparacion(equipoId, {
        ...formData,
        costo: formData.costo ? Number(formData.costo) : 0,
        operario: user?.email || 'Usuario',
      });
      await onSave();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar la reparación.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <h2>🔧 Registrar Reparación</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Fecha *</label>
            <input type="date" name="fecha" value={formData.fecha} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Descripción del problema y solución *</label>
            <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} rows="3" required></textarea>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Costo ($)</label>
            <input type="number" name="costo" value={formData.costo} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Operario</label>
            <input type="text" value={user?.email || 'Usuario'} disabled />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notas adicionales</label>
            <textarea name="notas" value={formData.notas} onChange={handleChange} rows="2"></textarea>
          </div>

          <div className="modal-actions" style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={cargando}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={cargando}>
              {cargando ? 'Guardando...' : 'Registrar Reparación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

ReparacionFormModal.propTypes = {
  equipoId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  user: PropTypes.shape({
    email: PropTypes.string,
  }),
};
