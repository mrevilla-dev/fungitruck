import React, { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadFileToDrive } from '../services/driveService';
import toast from 'react-hot-toast';

export default function EquipoFormModal({ onClose, onSave, equipoBase = null, user }) {
  const [cargando, setCargando] = useState(false);
  const [salas, setSalas] = useState([]);
  
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: 'Laboratorio',
    marca_modelo: '',
    nro_serie: '',
    propietario: 'Facultad',
    fecha_adquisicion: '',
    vida_util_anios: '',
    valor_compra: '',
    valor_residual: '',
    sala_actual_id: '',
    temp_min: '',
    temp_max: '',
    hum_min: '',
    hum_max: '',
    foto_url: '',
    notas: '',
  });

  const [fotoFile, setFotoFile] = useState(null);

  useEffect(() => {
    cargarSalas();
    if (equipoBase) {
      setFormData({
        nombre: equipoBase.nombre || '',
        categoria: equipoBase.categoria || 'Laboratorio',
        marca_modelo: equipoBase.marca_modelo || '',
        nro_serie: equipoBase.nro_serie || '',
        propietario: equipoBase.propietario || 'Facultad',
        fecha_adquisicion: equipoBase.fecha_adquisicion || '',
        vida_util_anios: equipoBase.vida_util_anios || '',
        valor_compra: equipoBase.valor_compra || '',
        valor_residual: equipoBase.valor_residual || '',
        sala_actual_id: equipoBase.sala_actual_id || '',
        temp_min: equipoBase.parametros_ideales?.temp_min || '',
        temp_max: equipoBase.parametros_ideales?.temp_max || '',
        hum_min: equipoBase.parametros_ideales?.hum_min || '',
        hum_max: equipoBase.parametros_ideales?.hum_max || '',
        foto_url: equipoBase.foto_url || '',
        notas: equipoBase.notas || '',
      });
    }
  }, [equipoBase]);

  async function cargarSalas() {
    try {
      const q = query(collection(db, 'salas'), orderBy('nombre'));
      const snap = await getDocs(q);
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error al cargar salas:', err);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.nombre) return toast('El nombre es obligatorio');
    
    setCargando(true);
    try {
      let urlFoto = formData.foto_url;
      if (fotoFile) {
        urlFoto = await uploadFileToDrive(fotoFile, 'Equipos');
      }

      const datosAEnviar = {
        nombre: formData.nombre,
        categoria: formData.categoria,
        marca_modelo: formData.marca_modelo,
        nro_serie: formData.nro_serie,
        propietario: formData.propietario,
        fecha_adquisicion: formData.fecha_adquisicion || null,
        vida_util_anios: formData.vida_util_anios ? Number(formData.vida_util_anios) : null,
        valor_compra: formData.valor_compra ? Number(formData.valor_compra) : 0,
        valor_residual: formData.valor_residual ? Number(formData.valor_residual) : 0,
        sala_actual_id: formData.sala_actual_id || null,
        temp_min: formData.temp_min ? Number(formData.temp_min) : null,
        temp_max: formData.temp_max ? Number(formData.temp_max) : null,
        hum_min: formData.hum_min ? Number(formData.hum_min) : null,
        hum_max: formData.hum_max ? Number(formData.hum_max) : null,
        foto_url: urlFoto,
        notas: formData.notas,
        operario: user?.email || 'Usuario',
      };

      await onSave(datosAEnviar, equipoBase?._docId);
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error al guardar');
    } finally {
      setCargando(false);
    }
  }

  const mostrarParametros = ['Incubación', 'Refrigeración', 'Freezer'].includes(formData.categoria);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{equipoBase ? '✏️ Editar Equipo' : '➕ Nuevo Equipo'}</h2>
        
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Nombre *</label>
            <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Categoría</label>
            <select name="categoria" value={formData.categoria} onChange={handleChange}>
              <option value="Incubación">Incubación</option>
              <option value="Refrigeración">Refrigeración</option>
              <option value="Freezer">Freezer</option>
              <option value="Laboratorio">Laboratorio</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          {mostrarParametros && (
            <div className="form-group" style={{ gridColumn: '1 / -1', background: '#e3f2fd', padding: '10px', borderRadius: '4px' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#0d47a1' }}>
                ℹ️ Este equipo aparecerá como destino disponible para batches de cultivo.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label>Temp. Mínima (°C)</label>
                  <input type="number" step="0.1" name="temp_min" value={formData.temp_min} onChange={handleChange} />
                </div>
                <div>
                  <label>Temp. Máxima (°C)</label>
                  <input type="number" step="0.1" name="temp_max" value={formData.temp_max} onChange={handleChange} />
                </div>
                <div>
                  <label>Hum. Mínima (%)</label>
                  <input type="number" step="0.1" name="hum_min" value={formData.hum_min} onChange={handleChange} />
                </div>
                <div>
                  <label>Hum. Máxima (%)</label>
                  <input type="number" step="0.1" name="hum_max" value={formData.hum_max} onChange={handleChange} />
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Marca/Modelo</label>
            <input type="text" name="marca_modelo" value={formData.marca_modelo} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Nro Serie</label>
            <input type="text" name="nro_serie" value={formData.nro_serie} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Propietario</label>
            <select name="propietario" value={formData.propietario} onChange={handleChange}>
              <option value="Facultad">Facultad</option>
              <option value="Emprendimiento">Emprendimiento</option>
              <option value="Personal">Personal</option>
            </select>
          </div>

          <div className="form-group">
            <label>Sala Actual</label>
            <select name="sala_actual_id" value={formData.sala_actual_id} onChange={handleChange}>
              <option value="">-- Ninguna --</option>
              {salas.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Fecha Adquisición</label>
            <input type="date" name="fecha_adquisicion" value={formData.fecha_adquisicion} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Vida Útil (años)</label>
            <input type="number" name="vida_util_anios" value={formData.vida_util_anios} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Valor Compra ($)</label>
            <input type="number" name="valor_compra" value={formData.valor_compra} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Valor Residual ($)</label>
            <input type="number" name="valor_residual" value={formData.valor_residual} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Foto (opcional)</label>
            {formData.foto_url && (
              <div style={{ marginBottom: '8px' }}>
                <a href={formData.foto_url} target="_blank" rel="noreferrer">Ver foto actual</a>
              </div>
            )}
            <input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files[0])} />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notas</label>
            <textarea name="notas" value={formData.notas} onChange={handleChange} rows="3"></textarea>
          </div>

          <div className="modal-actions" style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={cargando}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={cargando}>
              {cargando ? 'Guardando...' : 'Guardar Equipo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
