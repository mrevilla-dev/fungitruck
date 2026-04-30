import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { compressImage } from '../utils/imageUtils';
import { uploadFileToDrive } from '../services/driveService';

export default function EsporomasPage() {
  const [esporomas, setEsporomas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEsporoma, setEditingEsporoma] = useState(null);
  const [formData, setFormData] = useState({
    genero: '',
    especie: '',
    descripcion: '',
    lugarRecoleccion: '',
    fechaRecoleccion: new Date().toISOString().split('T')[0],
    genetica: 'Diploide', // Diploide por defecto para esporomas
    operator: 'Maxi'
  });
  const [photo, setPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const q = query(collection(db, "esporomas"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEsporomas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  const openModal = (esp = null) => {
    if (esp) {
      setEditingEsporoma(esp);
      setFormData({
        genero: esp.genero,
        especie: esp.especie,
        descripcion: esp.descripcion,
        lugarRecoleccion: esp.lugarRecoleccion,
        fechaRecoleccion: esp.fechaRecoleccion,
        genetica: esp.genetica || 'Diploide',
        operator: esp.operator || 'Maxi'
      });
    } else {
      setEditingEsporoma(null);
      setFormData({
        genero: '',
        especie: '',
        descripcion: '',
        lugarRecoleccion: '',
        fechaRecoleccion: new Date().toISOString().split('T')[0],
        genetica: 'Diploide',
        operator: 'Maxi'
      });
    }
    setPhoto(null);
    setShowModal(true);
  };

  const handleDelete = async (esp) => {
    if (!window.confirm(`¿Estás seguro de eliminar el ejemplar ${esp.id}? Esta acción no se puede deshacer.`)) return;

    setLoading(true);
    try {
      // 1. Nota: Borrado de fotos en Drive requiere permisos de API más complejos.
      // Por ahora, solo eliminamos el registro en Firestore para ahorrar tiempo.
      if (esp.fotoUrl) {
        console.warn("La eliminación física en Google Drive debe hacerse manualmente o ampliar el script.");
      }
      // 2. Delete doc from Firestore
      await deleteDoc(doc(db, "esporomas", esp.id));
      alert("✅ Ejemplar eliminado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el ejemplar.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let esporomaId = editingEsporoma ? editingEsporoma.id : null;
      let fotoUrl = editingEsporoma ? editingEsporoma.fotoUrl : null;

      if (!editingEsporoma) {
        // Generate NEW ID like ESP-20260424-01
        const datePart = formData.fechaRecoleccion.replace(/-/g, '');
        const count = esporomas.filter(esp => esp.fechaRecoleccion === formData.fechaRecoleccion).length + 1;
        esporomaId = `ESP-${datePart}-${String(count).padStart(2, '0')}`;
      }

      if (photo) {
        let fileToUpload = photo;
        try {
          if (photo.size > 1024 * 1024 * 8) {
            fileToUpload = await compressImage(photo, { maxWidth: 4000, quality: 0.9 });
          }
        } catch (compErr) {
          console.warn("Error en compresión:", compErr);
        }

        // --- UPLOAD TO GOOGLE DRIVE ---
        try {
          const driveResult = await uploadFileToDrive(fileToUpload, (progress) => {
            setUploadProgress(progress);
          });
          fotoUrl = driveResult.url;
        } catch (uploadErr) {
          console.error("Drive Upload Error:", uploadErr);
          throw new Error(`Error en Google Drive: ${uploadErr.message}`);
        }
      }

      const docData = {
        ...formData,
        id: esporomaId,
        fotoUrl,
        updatedAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      };

      if (editingEsporoma) {
        await updateDoc(doc(db, "esporomas", esporomaId), docData);
      } else {
        await setDoc(doc(db, "esporomas", esporomaId), {
          ...docData,
          createdAt: new Date().toISOString()
        });
      }

      setShowModal(false);
      setEditingEsporoma(null);
      setUploadProgress(0);
      alert("✅ Guardado con éxito");
    } catch (err) {
      console.error(err);
      alert(`⚠️ Error al guardar: ${err.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Ejemplares DRIVETEST</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => openModal()}>➕ Nuevo Ejemplar</button>
      </div>

      <p className="no-print">Registro de ejemplares silvestres recolectados para aislamiento y estudio.</p>

      <div className="salas-grid">
        {esporomas.map(esp => (
          <div key={esp.id} className="card sala-card esporoma-card">
            {esp.fotoUrl && (
              <img src={esp.fotoUrl} alt={esp.especie} className="no-print" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1rem' }} />
            )}
            <div className="sala-header">
              <div className="label-id" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', marginBottom: '0.5rem' }}>{esp.id}</div>
              <div className="flex-gap no-print">
                <button className="edit-icon-btn" title="Editar" onClick={() => openModal(esp)}>✏️</button>
                <button className="edit-icon-btn" title="Imprimir" onClick={() => window.print()}>🖨️</button>
                <button className="edit-icon-btn" title="Eliminar" style={{ color: 'var(--danger-color)' }} onClick={() => handleDelete(esp)}>🗑️</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3>{esp.genero} {esp.especie}</h3>
                <p style={{ fontSize: '0.9rem' }}>📍 {esp.lugarRecoleccion}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📅 {esp.fechaRecoleccion} | 🧬 <strong>{esp.genetica || 'Diploide'}</strong></p>
              </div>
              <div className="print-only" style={{ background: 'white', padding: '5px' }}>
                <QRCodeSVG value={esp.id} size={80} />
              </div>
            </div>

            <div className="no-print" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', fontSize: '0.85rem' }}>
              {esp.descripcion}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>{editingEsporoma ? 'Editar Ejemplar' : 'Registrar Ejemplar Silvestre'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Género</label>
                  <input type="text" className="form-control" placeholder="Ej: Ganoderma" required value={formData.genero} onChange={e => setFormData({ ...formData, genero: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Especie</label>
                  <input type="text" className="form-control" placeholder="Ej: lucidum" required value={formData.especie} onChange={e => setFormData({ ...formData, especie: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lugar de Recolección</label>
                <input type="text" className="form-control" placeholder="Ej: Bosque de pinos, Miramar" required value={formData.lugarRecoleccion} onChange={e => setFormData({ ...formData, lugarRecoleccion: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-control" required value={formData.fechaRecoleccion} onChange={e => setFormData({ ...formData, fechaRecoleccion: e.target.value })} disabled={!!editingEsporoma} />
                {editingEsporoma && <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>La fecha no se puede editar porque es parte del ID.</p>}
              </div>

              <div className="form-group">
                <label className="form-label">Genética / Estado Plustal</label>
                <select 
                  className="form-control" 
                  value={formData.genetica} 
                  onChange={e => setFormData({ ...formData, genetica: e.target.value })}
                >
                  <option value="Diploide">Diploide (Silvestre / Basidioma)</option>
                  <option value="Haploide">Haploide (Aislamiento de Esporas)</option>
                  <option value="Dicarión">Dicarión (Cultivado)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Descripción / Notas</label>
                <textarea className="form-control" rows="3" value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">{editingEsporoma ? 'Cambiar foto (opcional)' : 'Foto del ejemplar'}</label>
                <input type="file" accept="image/*" capture="environment" className="form-control" onChange={e => setPhoto(e.target.files[0])} />
                {photo && photo.size > 1024 * 1024 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    📸 Archivo grande detected ({(photo.size / (1024 * 1024)).toFixed(1)} MB). Se mostrará progreso al subir.
                  </p>
                )}
              </div>

              {loading && uploadProgress > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                    <span>Subiendo imagen...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (uploadProgress > 0 ? "Subiendo..." : "Guardando...") : (editingEsporoma ? "💾 Guardar Cambios" : "💾 Registrar Ejemplar")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
