import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, onSnapshot, runTransaction } from 'firebase/firestore';
import { uploadFileToDrive } from '../services/driveService';
import { compressImage } from '../utils/imageUtils';
import toast from 'react-hot-toast';


export default function EditLoteModal({ lote, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    lote_interno: lote.lote_interno || '',
    proveedor: lote.proveedor || '',
    fecha_ingreso: lote.fecha_ingreso || '',
    fecha_vencimiento: lote.fecha_vencimiento || '',
    estado_apertura: lote.estado_apertura || 'Activo',
    cantidad_base_actual: lote.cantidad_base_actual || 0,
    unidad_base: lote.unidad_base || '',
    salaId: typeof lote.ubicacion === 'object' ? lote.ubicacion.salaId : (lote.ubicacion || ''),
    detalleUbicacion: typeof lote.ubicacion === 'object' ? lote.ubicacion.detalle : '',
    link_compra: lote.link_compra || '',
    comentarios_lote: lote.comentarios_lote || '',
    codigo_barras_comercial: lote.codigo_barras_comercial || '',
    estado_actual: lote.estado_actual || lote.estado_reutilizable || 'disponible',
    imageUrl: lote.imageUrl || ''
  });

  const [salas, setSalas] = useState([]);
  const [insumoCategory, setInsumoCategory] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(lote.imageUrl || null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const fetchCategory = async () => {
      const snap = await getDoc(doc(db, "insumos_base", lote.insumoId));
      if (snap.exists()) setInsumoCategory(snap.data().categoria);
    };
    fetchCategory();

    const q = query(collection(db, "salas"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSalas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddSala = async () => {
    const nombreSala = window.prompt("🏷️ Ingrese el nombre de la NUEVA SALA / UBICACIÓN:");
    if (!nombreSala || nombreSala.trim() === '') return;
    
    try {
      setLoading(true);
      const { setDoc } = await import('firebase/firestore');
      const newSalaRef = doc(collection(db, 'salas'));
      const salaData = { 
        nombre: nombreSala.trim(), 
        tipo: 'Depósito / Almacén', 
        createdAt: serverTimestamp(),
        descripcion: 'Creada rápidamente desde edición de lote'
      };
      
      await setDoc(newSalaRef, salaData);
      setFormData(prev => ({ ...prev, salaId: newSalaRef.id }));
      toast.success(`Sala "${nombreSala}" creada y seleccionada.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al crear la sala.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let uploadedUrl = formData.imageUrl;
      if (photoFile) {
        setUploadProgress(10);
        const compressed = await compressImage(photoFile, { maxWidth: 1200, quality: 0.8 });
        setUploadProgress(30);
        const driveResult = await uploadFileToDrive(compressed, (prog) => setUploadProgress(30 + (prog * 0.6)));
        uploadedUrl = driveResult.imageUrl || driveResult.url || driveResult.webViewLink;
        setUploadProgress(100);
      }

      const isBaja = formData.estado_actual === 'Roto / De Baja';
      const wasBaja = lote.estado_actual === 'Roto / De Baja';

      await runTransaction(db, async (transaction) => {
        const loteRef = doc(db, 'insumos_lotes', lote.id);
        const masterRef = doc(db, 'insumos_base', lote.insumoId);
        const masterSnap = await transaction.get(masterRef);

        transaction.update(loteRef, {
          ...formData,
          imageUrl: uploadedUrl,
          cantidad_base_actual: Number(formData.cantidad_base_actual),
          ubicacion: {
            salaId: formData.salaId,
            detalle: formData.detalleUbicacion
          },
          updatedAt: serverTimestamp()
        });

        if (isBaja && !wasBaja) {
          const newStock = Math.max(0, (masterSnap.data().stock_total_base || 0) - (Number(formData.cantidad_base_actual) || 1));
          transaction.update(masterRef, { stock_total_base: newStock });
        } else if (!isBaja && wasBaja) {
          const newStock = (masterSnap.data().stock_total_base || 0) + (Number(formData.cantidad_base_actual) || 1);
          transaction.update(masterRef, { stock_total_base: newStock });
        }
      });

      toast.success("Lote actualizado correctamente.");
      onSaved();
    } catch (error) {
      console.error("Error al actualizar lote:", error);
      toast.error("Error al guardar cambios");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2500 }}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>✏️ Editar Lote: {lote.lote_interno}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">ID Lote Interno</label>
              <input type="text" className="form-control" value={formData.lote_interno} onChange={e => setFormData({...formData, lote_interno: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Proveedor (Etiqueta)</label>
              <input type="text" className="form-control" maxLength="20" value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Stock Actual (Unidad Base: {formData.unidad_base})</label>
              <input type="number" className="form-control" value={formData.cantidad_base_actual} onChange={e => setFormData({...formData, cantidad_base_actual: e.target.value})} />
              <small style={{ color: 'var(--danger-color)', fontSize: '0.7rem' }}>⚠️ ¡Cuidado! Este es el valor "Natural".</small>
            </div>
            <div className="form-group">
              <label className="form-label">Unidad Base</label>
              <input type="text" className="form-control" value={formData.unidad_base} onChange={e => setFormData({...formData, unidad_base: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Link de Compra</label>
            <input type="url" className="form-control" value={formData.link_compra} onChange={e => setFormData({...formData, link_compra: e.target.value})} />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fecha Ingreso</label>
              <input type="date" className="form-control" value={formData.fecha_ingreso} onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})} />
            </div>

            {insumoCategory === 'Reutilizables' ? (
              <div className="form-group animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '8px' }}>
                <label className="form-label" style={{ color: 'var(--primary-color)' }}>🔄 Ciclo de Vida (Reutilizable)</label>
                <select 
                  className="form-control" 
                  value={formData.estado_actual} 
                  onChange={e => setFormData({...formData, estado_actual: e.target.value})}
                >
                  <option value="Disponible">Disponible</option>
                  <option value="En Uso">En Uso</option>
                  <option value="En Lavado">En Lavado</option>
                  <option value="Roto / De Baja">Roto / De Baja</option>
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-control" value={formData.estado_apertura} onChange={e => setFormData({...formData, estado_apertura: e.target.value})}>
                  <option value="Activo">Activo</option>
                  <option value="Agotado">Agotado</option>
                  <option value="Vencido">Vencido</option>
                  <option value="Hidratado">Hidratado</option>
                  <option value="Descartado">Descartado</option>
                </select>
              </div>
            )}
          </div>

          {formData.estado_actual === 'Roto / De Baja' && (
            <div className="form-group animate-fade-in" style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--danger-color)' }}>
              <label className="form-label" style={{ color: 'var(--danger-color)' }}>⚠️ NOTAS DE AUDITORÍA (Causa de la Baja)</label>
              <textarea 
                className="form-control" 
                required
                rows="3" 
                placeholder="Explicar motivo de la rotura o descarte..."
                value={formData.comentarios_lote} 
                onChange={e => setFormData({...formData, comentarios_lote: e.target.value})} 
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">📷 Foto del Lote / Estado</label>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              className="form-control" 
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  setPhotoFile(file);
                  setPhotoPreview(URL.createObjectURL(file));
                }
              }} 
            />
            {photoPreview && (
              <div style={{ marginTop: '0.5rem', position: 'relative' }}>
                <img src={photoPreview} alt="Preview" style={{ width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '8px' }} />
                {loading && photoFile && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'var(--primary-color)', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />}
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Ubicación (Sala)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="form-control" value={formData.salaId} onChange={e => setFormData({...formData, salaId: e.target.value})}>
                  <option value="">-- Seleccionar Sala --</option>
                  {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: 'auto', padding: '0 1rem', fontSize: '1.2rem' }}
                  onClick={handleAddSala}
                  title="Añadir nueva sala"
                >+</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Detalle (Estante/Cajón)</label>
              <input type="text" className="form-control" value={formData.detalleUbicacion} onChange={e => setFormData({...formData, detalleUbicacion: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notas del Lote</label>
            <textarea className="form-control" rows="2" value={formData.comentarios_lote} onChange={e => setFormData({...formData, comentarios_lote: e.target.value})} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
