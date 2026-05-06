import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { uploadFileToDrive } from '../services/driveService';

const STATUS_OPTIONS = [
  { label: 'Incubación', emoji: '🌡️', color: 'var(--primary-color)' },
  { label: 'Fructificación', emoji: '🍄', color: '#8b5cf6' },
  { label: 'Cosechado', emoji: '🧺', color: 'var(--accent-color)' },
  { label: 'Contaminado', emoji: '☣️', color: 'var(--danger-color)' },
];

export default function BatchEditModal({ batch, onClose, onFilterBatch }) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [salas, setSalas] = useState([]);
  const [showMoveSuggestion, setShowMoveSuggestion] = useState(false);
  
  const [editData, setEditData] = useState({
    status: batch.status || 'Incubación',
    destinoId: batch.destinoId || '',
    observaciones: batch.observaciones || '',
  });

  useEffect(() => {
    return onSnapshot(collection(db, "salas"), (snap) => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleStatusChange = (newStatus) => {
    setEditData(prev => ({ ...prev, status: newStatus }));
    if (batch.status === 'Incubación' && newStatus === 'Fructificación') {
      setShowMoveSuggestion(true);
    } else {
      setShowMoveSuggestion(false);
    }
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFileToDrive(file);
      const photos = batch.photos || [];
      await updateDoc(doc(db, 'batches', batch.id), {
        photos: [...photos, { url: result.url, date: new Date().toISOString() }],
        updatedAt: serverTimestamp()
      });
      alert('✅ Foto subida a Drive y vinculada.');
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'batches', batch.id), {
        ...editData,
        updatedAt: serverTimestamp()
      });
      onClose();
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>🆔 {batch.id}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{batch.especie} · {batch.substrate}</span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Cambiar Estado</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {STATUS_OPTIONS.map(opt => (
                <button 
                  key={opt.label}
                  type="button"
                  className={`btn ${editData.status === opt.label ? 'btn-primary' : 'btn-outline'}`}
                  style={{ 
                    padding: '0.75rem', 
                    fontSize: '0.85rem',
                    borderColor: editData.status === opt.label ? opt.color : 'var(--border-color)',
                    background: editData.status === opt.label ? opt.color : 'transparent'
                  }}
                  onClick={() => handleStatusChange(opt.label)}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {(showMoveSuggestion || editData.status === 'Fructificación') && (
            <div className="animate-fade-in" style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: '#a78bfa' }}>
                🚚 Sugerencia: Mover a Sala de Fructificación
              </p>
              <select 
                className="form-control" 
                value={editData.destinoId} 
                onChange={e => setEditData({...editData, destinoId: e.target.value})}
              >
                <option value="">-- Seleccionar Nueva Sala --</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.tipo})</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">📸 Registro Fotográfico (Drive)</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} id="photo-upload" onChange={handleUploadPhoto} />
              <label htmlFor="photo-upload" className="btn btn-outline" style={{ cursor: 'pointer', flex: 1, textAlign: 'center' }}>
                {uploading ? 'Subiendo...' : '📷 Tomar Foto'}
              </label>
              <div style={{ fontSize: '1.2rem' }}>{batch.photos?.length || 0} 🖼️</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="3" value={editData.observaciones} onChange={e => setEditData({...editData, observaciones: e.target.value})} placeholder="Notas sobre el vigor, micelio, etc." />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => onFilterBatch(batch.batchGroupId)}>👁️ Ver Lote</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={loading}>
              {loading ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
