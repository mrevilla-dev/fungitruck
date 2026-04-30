import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import PrintLabelsModal from './PrintLabelsModal';
import { compressImage } from '../utils/imageUtils';
import { uploadFileToDrive } from '../services/driveService';

export default function NuevoCultivoModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdCultivo, setCreatedCultivo] = useState(null);
  const [medios, setMedios] = useState([]);
  
  const [formData, setFormData] = useState({
    medioId: '',
    cepa_especie: '',
    cantidad: 1,
    fecha_inoculacion: new Date().toISOString().split('T')[0],
  });
  const [photo, setPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    // Solo traer medios que tengan stock disponible
    const q = query(collection(db, "medios_preparados"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMedios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filtrar medios con stock (ya sea bulk o fraccionado, pero usaremos bulk por ahora según el requerimiento general)
      setMedios(allMedios.filter(m => m.stock_bulk.cantidad_actual > 0));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.medioId) return alert("Seleccioná un lote de medio preparado");
    if (formData.cantidad <= 0) return alert("La cantidad debe ser mayor a 0");
    
    setLoading(true);

    try {
      const selectedMedio = medios.find(m => m.id === formData.medioId);
      let cultivoData = null;

      await runTransaction(db, async (transaction) => {
        const medioRef = doc(db, 'medios_preparados', formData.medioId);
        const medioSnap = await transaction.get(medioRef);

        if (!medioSnap.exists()) {
          throw new Error("El medio seleccionado ya no existe.");
        }

        const currentStock = medioSnap.data().stock_bulk.cantidad_actual;
        if (currentStock < formData.cantidad) {
          throw new Error(`Stock insuficiente. Disponible: ${currentStock} ${medioSnap.data().stock_bulk.unidad}`);
        }

        // 1. Restar stock del medio
        transaction.update(medioRef, {
          'stock_bulk.cantidad_actual': currentStock - Number(formData.cantidad)
        });

        // 2. Crear el nuevo cultivo
        const newCultivoRef = doc(collection(db, 'cultivos'));
        const datePart = formData.fecha_inoculacion.replace(/-/g, '');
        const id = `CL-${datePart}-${newCultivoRef.id.slice(-4).toUpperCase()}`;

        cultivoData = {
          id: id,
          dbId: newCultivoRef.id, // Guardamos el ID de firestore por si las moscas
          cepa_especie: formData.cepa_especie,
          cantidad: Number(formData.cantidad),
          unidad: selectedMedio.stock_bulk.unidad,
          status: 'Incubación',
          medio_origen_id: selectedMedio.id,
          medio_origen_alias: selectedMedio.alias,
          fecha_inoculacion: formData.fecha_inoculacion,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          // Campos para compatibilidad con PrintLabelsModal
          alias: id,
          nombre_receta: formData.cepa_especie,
          trazabilidad: {
            fecha_preparacion: formData.fecha_inoculacion
          }
        };

        transaction.set(newCultivoRef, cultivoData);
      });

      // 3. Subir foto si existe
      if (photo && cultivoData) {
        setLoading(true); // Aseguramos que siga en loading
        let fileToUpload = photo;
        try {
          // Comprimir solo si es absurdamente pesado (> 10MB)
          if (photo.size > 1024 * 1024 * 10) {
            fileToUpload = await compressImage(photo, { maxWidth: 3000, quality: 0.9 });
          }
        } catch (e) { console.warn(e); }

        const fileRef = "drive_upload"; // Referencia interna
        
        try {
          const driveResult = await uploadFileToDrive(fileToUpload, (progress) => {
            setUploadProgress(progress);
          });
          
          await updateDoc(doc(db, 'cultivos', cultivoData.dbId), {
            fotoUrl: driveResult.url
          });
          cultivoData.fotoUrl = driveResult.url;
        } catch (uploadErr) {
          console.error("Drive Upload Error:", uploadErr);
          throw new Error(`Error en Google Drive: ${uploadErr.message}`);
        }
      }

      setCreatedCultivo(cultivoData);
      setSuccess(true);
    } catch (error) {
      console.error("Error al crear cultivo:", error);
      let msg = "Error al procesar la operación";
      if (error.code === 'storage/unauthorized') msg = "Error de permisos en Storage. Revisá las reglas.";
      if (error.code === 'storage/quota-exceeded') msg = "Límite de almacenamiento alcanzado en Firebase.";
      alert(`${msg}: ${error.message}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  if (success && createdCultivo) {
    return (
      <PrintLabelsModal 
        batches={[createdCultivo]} 
        onClose={() => {
          onSaved();
          onClose();
        }} 
      />
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>🌱 Nueva Inoculación / Cultivo</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          
          <div className="form-group">
            <label className="form-label">Medio Preparado (Origen)</label>
            <select 
              className="form-control" 
              required 
              value={formData.medioId} 
              onChange={e => setFormData({...formData, medioId: e.target.value})}
            >
              <option value="">-- Seleccioná un lote --</option>
              {medios.map(m => (
                <option key={m.id} value={m.id}>
                  {m.alias} - {m.nombre_receta} (Stock: {m.stock_bulk.cantidad_actual} {m.stock_bulk.unidad})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Cepa / Especie Inoculada</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: Pleurotus Ostreatus (Cepa P1)" 
              required 
              value={formData.cepa_especie} 
              onChange={e => setFormData({...formData, cepa_especie: e.target.value})}
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cantidad de Unidades</label>
              <input 
                type="number" 
                className="form-control" 
                required 
                min="1"
                value={formData.cantidad} 
                onChange={e => setFormData({...formData, cantidad: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Inoculación</label>
              <input 
                type="date" 
                className="form-control" 
                value={formData.fecha_inoculacion} 
                onChange={e => setFormData({...formData, fecha_inoculacion: e.target.value})} 
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">📷 Foto del Cultivo (Opcional)</label>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="form-control" 
              onChange={e => setPhoto(e.target.files[0])} 
            />
            {photo && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Archivo: {photo.name} ({(photo.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
          </div>

          {loading && uploadProgress > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                <span>Subiendo imagen...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.2s' }}></div>
              </div>
            </div>
          )}

          <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            💡 Se descontará la cantidad del stock del medio seleccionado y se creará un nuevo registro de cultivo en estado <strong>Incubación</strong>.
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Procesando...' : '🚀 Iniciar Cultivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
