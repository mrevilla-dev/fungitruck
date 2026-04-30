import { useState } from 'react';
import { db, storage } from '../firebase';
import { doc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { compressImage } from '../utils/imageUtils';
import { uploadFileToDrive } from '../services/driveService';

const CultivosTable = ({ cultivos, filters, setFilters, onEdit, onPrint }) => {
  const [selectedForPhoto, setSelectedForPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState(null);
  const filteredCultivos = cultivos.filter(c => {
    const matchesSearch = (c.id?.toLowerCase() || '').includes(filters.search.toLowerCase()) || 
                          (c.cepa_especie?.toLowerCase() || '').includes(filters.search.toLowerCase());
    const matchesStatus = filters.status === 'todas' || c.status === filters.status;
    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (cultivo, newStatus) => {
    try {
      await updateDoc(doc(db, "batches", cultivo.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("No se pudo actualizar el estado.");
    }
  };

  const handleDelete = async (cultivo) => {
    if (!window.confirm(`¿Estás seguro de eliminar el cultivo ${cultivo.id}?`)) return;
    try {
      await deleteDoc(doc(db, "batches", cultivo.id));
      alert("✅ Cultivo eliminado.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar.");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Incubación': return 'var(--primary-color)';
      case 'Fructificación': return '#8b5cf6'; // Violeta/Púrpura
      case 'Cosechado': return 'var(--accent-color)';
      case 'Contaminado': return 'var(--danger-color)';
      default: return '#666';
    }
  };

  return (
    <div className="inventory-list animate-fade-in">
       <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label className="form-label">Buscar por ID o Cepa</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: CL-2024..." 
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-control" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="todas">Todos los estados</option>
              <option value="Incubación">Incubación</option>
              <option value="Fructificación">Fructificación</option>
              <option value="Cosechado">Cosechado</option>
              <option value="Contaminado">Contaminado</option>
            </select>
          </div>
        </div>
      </div>

      {filteredCultivos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No se encontraron cultivos que coincidan con los filtros.</p>
        </div>
      ) : 
        filteredCultivos.map((cultivo) => {
          return (
            <div
              key={cultivo.id}
              className="card"
              style={{
                padding: "1.25rem",
                marginBottom: "0.75rem",
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 1fr 2fr",
                alignItems: "center",
                borderLeft: `4px solid ${getStatusColor(cultivo.status)}`,
                transition: "transform 0.2s",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: "1.1rem" }}>
                  {cultivo.genero} {cultivo.especie} {cultivo.cepa && `(${cultivo.cepa})`}
                </strong>
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--primary-color)",
                    fontFamily: "monospace",
                    background: "rgba(59, 130, 246, 0.1)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {cultivo.id}
                </span>
              </div>
              <div style={{ fontSize: "0.9rem" }}>
                <span
                  className="sala-tipo"
                  style={{ fontSize: "0.65rem", padding: "2px 8px", background: 'rgba(255,255,255,0.05)' }}
                >
                  {cultivo.genetica || 'Diploide'}
                </span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {cultivo.substrate || "---"}
              </div>
              <div
                style={{
                  textAlign: "right",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", gap: "4px", marginRight: "1rem" }}>
                  <button
                    className="btn-icon"
                    title="Mover a Fructificación"
                    style={{
                      background: "rgba(139, 92, 246, 0.1)",
                      color: "#8b5cf6",
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    onClick={() => handleUpdateStatus(cultivo, "Fructificación")}
                  >
                    🍄
                  </button>
                  <button
                    className="btn-icon"
                    title="Marcar como Cosechado"
                    style={{
                      background: "rgba(16, 185, 129, 0.1)",
                      color: "var(--accent-color)",
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    onClick={() => handleUpdateStatus(cultivo, "Cosechado")}
                  >
                    🧺
                  </button>
                  <button
                    className="btn-icon"
                    title="Marcar como Contaminado"
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "var(--danger-color)",
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    onClick={() => handleUpdateStatus(cultivo, "Contaminado")}
                  >
                    ☣️
                  </button>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    marginRight: "0.5rem",
                    minWidth: "80px",
                  }}
                >
                  {cultivo.status}
                </span>
                <button
                  className="btn-icon"
                  title="Fotos de Seguimiento"
                  onClick={() => setSelectedForPhoto(cultivo)}
                  style={{ position: "relative" }}
                >
                  📷
                  {cultivo.fotoUrl && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-5px",
                        right: "-5px",
                        background: "var(--accent-color)",
                        borderRadius: "50%",
                        width: "8px",
                        height: "8px",
                      }}
                    ></span>
                  )}
                </button>
                <button
                  className="btn-icon"
                  title="Imprimir QR"
                  onClick={() => onPrint(cultivo)}
                  style={{ background: 'var(--primary-color)', color: 'white', padding: '6px', borderRadius: '6px', boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)' }}
                >
                  🖨️
                </button>
                <button
                  className="btn-icon"
                  title="Eliminar"
                  style={{ color: "var(--danger-color)" }}
                  onClick={() => handleDelete(cultivo)}
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })
      }

      {/* --- MODAL DE SEGUIMIENTO FOTOGRÁFICO --- */}
      {selectedForPhoto && (
        <div className="modal-overlay">
          <div className="modal-box animate-fade-in" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>📸 Seguimiento: {selectedForPhoto.id}</h3>
              <button className="modal-close" onClick={() => { setSelectedForPhoto(null); setPhoto(null); setUploadProgress(0); }}>&times;</button>
            </div>
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              {selectedForPhoto.fotoUrl ? (
                <img 
                  src={selectedForPhoto.fotoUrl} 
                  alt="Cultivo" 
                  style={{ width: '100%', borderRadius: '12px', maxHeight: '300px', objectFit: 'cover', border: '1px solid var(--border-color)' }} 
                />
              ) : (
                <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                  No hay foto inicial cargada.
                </div>
              )}
            </div>

            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              <label className="form-label">{selectedForPhoto.fotoUrl ? 'Actualizar / Cambiar Foto' : 'Subir Foto de Seguimiento'}</label>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="form-control" 
                onChange={e => setPhoto(e.target.files[0])}
                disabled={loading}
              />
            </div>

            {loading && uploadProgress > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                  <span>Subiendo...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary-color)', transition: 'width 0.2s' }}></div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button 
                className="btn btn-primary" 
                disabled={!photo || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    let fileToUpload = photo;
                    // Solo comprimir si es masivo (> 10MB)
                    if (photo.size > 1024 * 1024 * 10) {
                      fileToUpload = await compressImage(photo, { maxWidth: 3000, quality: 0.9 });
                    }

                    const driveResult = await uploadFileToDrive(fileToUpload, (p) => {
                      setUploadProgress(p);
                    });

                    const url = driveResult.url;
                    // 1. Actualizar el documento principal en batches
                    await updateDoc(doc(db, 'batches', selectedForPhoto.id), {
                      fotoUrl: url,
                      updatedAt: new Date().toISOString()
                    });
                    
                    // 2. Registrar en tracking
                    await addDoc(collection(db, 'tracking'), {
                      batchId: selectedForPhoto.id,
                      status: 'Nueva foto de seguimiento subida a Google Drive',
                      imageUrl: url,
                      operator: 'Maxi',
                      createdAt: new Date().toISOString(),
                      serverTimestamp: serverTimestamp()
                    });

                    alert("✅ Foto guardada correctamente en Drive");
                    setPhoto(null);
                    setUploadProgress(0);
                    setLoading(false);
                    setSelectedForPhoto(null);
                  } catch (err) {
                    console.error(err);
                    alert("Error fatal en Drive: " + err.message);
                    setLoading(false);
                  }
                }}
              >
                {loading ? 'Subiendo...' : '💾 Guardar Foto'}
              </button>
              <button 
                className="btn btn-outline" 
                onClick={() => { setSelectedForPhoto(null); setPhoto(null); setUploadProgress(0); }}
                disabled={loading}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CultivosTable;
