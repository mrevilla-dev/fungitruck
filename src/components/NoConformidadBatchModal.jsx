import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, writeBatch, serverTimestamp, runTransaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { uploadFileToDrive } from '../services/driveService';
import { generarIdNoConformidad } from '../utils/idGenerator';
import toast from 'react-hot-toast';
import PropTypes from 'prop-types';

export default function NoConformidadBatchModal({ batch, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [salas, setSalas] = useState([]);
  const [authName, setAuthName] = useState('Sistema');

  const [formData, setFormData] = useState({
    fecha_deteccion: new Date().toISOString().split('T')[0],
    tipo: 'Contaminación',
    descripcion: '',
    accion_tomada: 'Descarte',
    nueva_sala_id: '',
  });

  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fotoInputRef = useRef(null);

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      setAuthName(auth.currentUser.displayName || auth.currentUser.email || 'Sistema');
    }

    const fetchSalas = async () => {
      const q = query(collection(db, 'salas'));
      const snap = await getDocs(q);
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchSalas();
  }, []);

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.descripcion.trim()) return toast.error('Ingrese una descripción.');
    if (formData.accion_tomada === 'Cuarentena' && !formData.nueva_sala_id) {
      return toast.error('Debe seleccionar la sala destino para la cuarentena.');
    }

    setLoading(true);
    try {
      let fotoUrl = null;
      if (fotoFile) {
        setUploadProgress(5);
        const driveResult = await uploadFileToDrive(fotoFile, (prog) => setUploadProgress(Math.round(prog * 0.5)));
        fotoUrl = driveResult?.imageUrl || driveResult?.url || null;
        setUploadProgress(50);
      }

      const todayIso = new Date().toISOString().split('T')[0];
      const datePart = todayIso.replace(/-/g, '').slice(2);
      const seqKey = `NC_${datePart}`;

      let seqId = 1;
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const docSnap = await t.get(counterRef);
        const data = docSnap.exists() ? docSnap.data() : {};
        seqId = (data[seqKey] || 0) + 1;
        t.set(counterRef, { [seqKey]: seqId }, { merge: true });
      });

      const batchData = batch.data || batch;

      const ncId = generarIdNoConformidad({
        genero: batchData.genero,
        especie: batchData.especie,
        fecha_iso: todayIso,
        secuencia: seqId
      });

      const wb = writeBatch(db);

      wb.set(doc(db, 'no_conformidades_batch', ncId), {
        id: ncId,
        batchId: batch.id,
        fecha_deteccion: formData.fecha_deteccion,
        tipo: formData.tipo,
        descripcion: formData.descripcion,
        accion_tomada: formData.accion_tomada,
        nueva_sala_id: formData.accion_tomada === 'Cuarentena' ? formData.nueva_sala_id : null,
        operario: authName,
        foto_url: fotoUrl,
        createdAt: serverTimestamp()
      });

      if (formData.accion_tomada === 'Descarte') {
        wb.update(doc(db, 'batches', batch.id), { status: 'Descartado' });
      } else if (formData.accion_tomada === 'Cuarentena') {
        wb.update(doc(db, 'batches', batch.id), { destinoId: formData.nueva_sala_id });
      }

      await wb.commit();
      toast.success(`No Conformidad registrada exitosamente.\nID: ${ncId}`);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(`Error al registrar no conformidad: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>⚠️ Registrar No Conformidad</h3>
          <button className="modal-close" onClick={onClose} disabled={loading}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Lote Afectado</label>
            <input type="text" className="form-control" value={batch.id} disabled />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fecha de Detección</label>
              <input type="date" className="form-control" value={formData.fecha_deteccion} onChange={e => setFormData({ ...formData, fecha_deteccion: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Anomalía</label>
              <select className="form-control" value={formData.tipo} onChange={e => setFormData({ ...formData, tipo: e.target.value })}>
                <option value="Contaminación">Contaminación</option>
                <option value="Deformación">Deformación</option>
                <option value="Aborto de primordios">Aborto de primordios</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción Detallada *</label>
            <textarea className="form-control" rows={3} value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} required placeholder="Describa el problema observado..." />
          </div>

          <div className="form-group">
            <label className="form-label">Acción Tomada</label>
            <select className="form-control" value={formData.accion_tomada} onChange={e => setFormData({ ...formData, accion_tomada: e.target.value })}>
              <option value="Descarte">Descarte del Lote</option>
              <option value="Cuarentena">Cuarentena (Mover de sector)</option>
              <option value="Descontaminación local">Descontaminación local</option>
              <option value="Monitoreo">Monitoreo</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          {formData.accion_tomada === 'Cuarentena' && (
            <div className="form-group animate-fade-in">
              <label className="form-label">Sala de Cuarentena Destino *</label>
              <select className="form-control" value={formData.nueva_sala_id} onChange={e => setFormData({ ...formData, nueva_sala_id: e.target.value })} required>
                <option value="">-- Seleccionar Sala --</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre || s.id}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Evidencia Fotográfica (Opcional)</label>
            <input type="file" accept="image/*" style={{ display: 'none' }} ref={fotoInputRef} onChange={handleFotoChange} />
            <button type="button" className="btn btn-outline" onClick={() => fotoInputRef.current?.click()}>
              📷 {fotoFile ? fotoFile.name : 'Subir Foto'}
            </button>
            {fotoPreview && (
              <img src={fotoPreview} alt="Preview" style={{ marginTop: '0.5rem', maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', objectFit: 'cover' }} />
            )}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Subiendo... {uploadProgress}%</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: 'var(--danger-color)' }}>
              {loading ? 'Registrando...' : '⚠️ Confirmar No Conformidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

NoConformidadBatchModal.propTypes = {
  batch: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};
