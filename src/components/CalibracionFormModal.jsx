import React, { useState } from 'react';
import { registrarCalibracion } from '../services/equipoService';
import { uploadFileToDrive } from '../services/driveService';
import toast from 'react-hot-toast';
import PropTypes from 'prop-types';

export default function CalibracionFormModal({ equipoId, onClose, onSave, user }) {
  const [cargando, setCargando] = useState(false);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    resultado: 'Aprobado',
    proximo_vencimiento: '',
    notas: '',
  });
  const [certificadoFile, setCertificadoFile] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.fecha) {
      return toast('La fecha es obligatoria.');
    }
    
    setCargando(true);
    try {
      let certificado_url = '';
      if (certificadoFile) {
        certificado_url = await uploadFileToDrive(certificadoFile, 'Equipos_Calibraciones');
      }

      await registrarCalibracion(equipoId, {
        ...formData,
        certificado_url,
        proximo_vencimiento: formData.proximo_vencimiento || null,
        operario: user?.email || 'Usuario',
      });
      await onSave();
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar la calibración.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <h2>📐 Registrar Calibración</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          
          <div className="form-group">
            <label>Fecha *</label>
            <input type="date" name="fecha" value={formData.fecha} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Resultado</label>
            <select name="resultado" value={formData.resultado} onChange={handleChange}>
              <option value="Aprobado">Aprobado</option>
              <option value="Desaprobado">Desaprobado</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Descripción</label>
            <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} rows="2"></textarea>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Próximo Vencimiento</label>
            <input type="date" name="proximo_vencimiento" value={formData.proximo_vencimiento} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Certificado (PDF o Imagen)</label>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setCertificadoFile(e.target.files[0])} />
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
              {cargando ? 'Guardando...' : 'Registrar Calibración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

CalibracionFormModal.propTypes = {
  equipoId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  user: PropTypes.shape({
    email: PropTypes.string,
  }),
};
