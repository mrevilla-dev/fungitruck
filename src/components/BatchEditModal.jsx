import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, collection, onSnapshot, query, where, getDocs, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { uploadFileToDrive } from '../services/driveService';
import NuevaCosechaModal from './NuevaCosechaModal';
import RegistroMasivoAislamientosModal from './RegistroMasivoAislamientosModal';
import NoConformidadBatchModal from './NoConformidadBatchModal';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { label: 'Planificado', emoji: '📅', color: '#94a3b8' },
  { label: 'Incubación', emoji: '🌡️', color: 'var(--primary-color)' },
  { label: 'Inoculado', emoji: '🧬', color: '#06b6d4' },
  { label: 'Fructificación', emoji: '🍄', color: '#8b5cf6' },
  { label: 'Colonias visibles', emoji: '🧫', color: '#10b981' },
  { label: 'Cosechado', emoji: '🧺', color: 'var(--accent-color)' },
  { label: 'Contaminado', emoji: '☣️', color: 'var(--danger-color)' },
];

export default function BatchEditModal({ batch, onClose, onFilterBatch }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCosechaModal, setShowCosechaModal] = useState(false);
  const [showNCModal, setShowNCModal] = useState(false);
  const [salas, setSalas] = useState([]);
  const [showMoveSuggestion, setShowMoveSuggestion] = useState(false);
  const [showRegistroAislamientos, setShowRegistroAislamientos] = useState(false);
  const [noConformidades, setNoConformidades] = useState([]);
  const [cosechasBatch, setCosechasBatch] = useState([]);
  const [savingCierre, setSavingCierre] = useState(false);

  const [editData, setEditData] = useState({
    status: batch.status || 'Incubación',
    destinoId: batch.destinoId || '',
    observaciones: batch.observaciones || '',
    destino_criopreservacion: batch.destino_criopreservacion ?? false,
  });

  const [cierreData, setCierreData] = useState({
    destino_sustrato: batch.destino_sustrato || '',
    fecha_cierre: batch.fecha_cierre || new Date().toISOString().split('T')[0],
    observaciones_cierre: batch.observaciones_cierre || '',
    contenedor_devuelto: batch.contenedor_devuelto ?? false,
  });

  const [fotoAuditoria, setFotoAuditoria] = useState([]);
  const [auditoriaObs, setAuditoriaObs] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'salas'), (snap) => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const fetchNCs = async () => {
    try {
      const q = query(collection(db, 'no_conformidades_batch'), where('batchId', '==', batch.id));
      const snap = await getDocs(q);
      setNoConformidades(
        snap.docs.map(d => d.data()).sort((a, b) => b.fecha_deteccion.localeCompare(a.fecha_deteccion))
      );
    } catch (err) {
      console.warn('Error cargando NCs:', err);
    }
  };

  const fetchCosechas = async () => {
    try {
      const qIndiv = query(collection(db, 'cosechas'), where('batchId', '==', batch.id));
      const snapIndiv = await getDocs(qIndiv);
      
      const qGrupal = query(collection(db, 'cosechas'), where('modo_cosecha', 'in', ['grupal', 'sector']));
      const snapGrupal = await getDocs(qGrupal);
      
      const indivs = snapIndiv.docs.map(d => d.data());
      const grupals = snapGrupal.docs.map(d => d.data()).filter(c => c.batches && c.batches.some(b => b.batchId === batch.id));
      
      const all = [...indivs, ...grupals].sort((a,b) => new Date(b.fecha_cosecha) - new Date(a.fecha_cosecha));
      
      setCosechasBatch(all);
    } catch (err) {
      console.warn("Error cargando cosechas:", err);
    }
  };

  useEffect(() => {
    fetchNCs();
    fetchCosechas();
  }, [batch.id]);

  const metrics = React.useMemo(() => {
    let EB = 0;
    let TPB = 0;
    let diasInoc = 1;
    let totalFresco = 0;

    const data = batch.data || batch;
    
    if (data.fechaInoculacion) {
      const end = (data.status === 'Cosechado' && data.fecha_cierre) ? new Date(data.fecha_cierre) : new Date();
      diasInoc = Math.max(1, Math.floor((end - new Date(data.fechaInoculacion)) / 86400000));
    }

    let pesoSecoBase = 0;
    
    cosechasBatch.forEach(c => {
      if (c.modo_cosecha === 'individual') {
        totalFresco += Number(c.peso_fresco || 0);
        if (!pesoSecoBase && c.peso_seco_sustrato) pesoSecoBase = c.peso_seco_sustrato;
      } else {
        const miParte = c.batches?.find(b => b.batchId === batch.id);
        if (miParte) {
          totalFresco += Number(miParte.peso_fresco_repartido || 0);
          if (!pesoSecoBase && miParte.peso_seco_sustrato) pesoSecoBase = miParte.peso_seco_sustrato;
        }
      }
    });

    if (pesoSecoBase > 0) {
      EB = (totalFresco / pesoSecoBase) * 100;
    }
    
    TPB = EB / diasInoc;

    return { totalFresco, EB, TPB, diasInoc, pesoSecoBase };
  }, [cosechasBatch, batch]);

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
        photos: [...photos, { url: result?.url ?? result?.imageUrl, date: new Date().toISOString() }],
        updatedAt: serverTimestamp(),
      });
      toast.success('Foto subida a Drive y vinculada.');
    } catch (err) {
      toast.error('Error al subir foto: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAuditoriaFotos = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const totalSize = [...fotoAuditoria, ...files].reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 50 * 1024 * 1024) return toast.error('El total de imágenes no puede superar 50MB');
    setFotoAuditoria(prev => [...prev, ...files]);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Subir fotos de auditoría (si hay) a Drive
      let fotosUrls = [];
      if (fotoAuditoria.length > 0) {
        try {
          for (const file of fotoAuditoria) {
            const result = await uploadFileToDrive(file);
            const url = result?.url ?? result?.imageUrl;
            if (url) fotosUrls.push(url);
          }
        } catch (err) {
          console.error('Error subiendo fotos de auditoría:', err);
          toast.error('No se pudieron subir algunas fotos de evidencia. Guardando sin ellas.');
        }
      }

      // Entrada de auditoría solo si cambió el status o hay fotos nuevas
      const statusCambio = editData.status !== batch.status;
      const auditoriaEntry = (statusCambio || fotosUrls.length > 0) ? {
        status_previo: batch.status,
        status_nuevo: editData.status,
        fecha: serverTimestamp(),
        operator: getAuth().currentUser?.displayName || getAuth().currentUser?.email || 'Sistema',
        observaciones: auditoriaObs || '',
        fotos_urls: fotosUrls,
      } : null;

      await updateDoc(doc(db, 'batches', batch.id), {
        ...editData,
        ...(fotosUrls.length > 0 && { foto_evidencia: fotosUrls[0] }),
        ...(auditoriaEntry && { fotos_auditoria: arrayUnion(auditoriaEntry) }),
        updatedAt: serverTimestamp(),
      });
      setFotoAuditoria([]);
      setAuditoriaObs('');
      onClose();
    } catch (err) {
      toast.error('Error al actualizar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarCierre = async () => {
    if (!cierreData.destino_sustrato) return toast.error('Seleccioná el destino del sustrato.');
    setSavingCierre(true);
    try {
      await updateDoc(doc(db, 'batches', batch.id), {
        destino_sustrato: cierreData.destino_sustrato,
        fecha_cierre: cierreData.fecha_cierre,
        observaciones_cierre: cierreData.observaciones_cierre,
        contenedor_devuelto: cierreData.contenedor_devuelto,
        updatedAt: serverTimestamp(),
      });
      toast.success('Cierre de batch registrado correctamente.');
    } catch (err) {
      toast.error('Error al guardar cierre: ' + err.message);
    } finally {
      setSavingCierre(false);
    }
  };

  return (
    <>
      {(!showRegistroAislamientos && !showCosechaModal && !showNCModal) && (
        <div className="modal-overlay" style={{ overflowY: 'auto', padding: '2rem 1rem' }}>
          <div className="modal-box animate-fade-in" style={{ maxWidth: '600px', margin: 'auto' }}>
            {/* Header */}
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>🆔 {batch.id}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {batch.especie} · {batch.substrate}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-outline"
                  style={{ color: 'var(--primary-color)', borderColor: 'var(--primary-color)', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => navigate(`/arbol/batch/${batch.id}`)}
                >
                  🌳 Ver Árbol
                </button>
                <button
                  className="btn btn-outline"
                  style={{ color: '#3b82f6', borderColor: '#3b82f6', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => navigate(`/criobanco/nuevo/batch/${batch.id}`)}
                >
                  🧊 Criopreservar
                </button>
                <button
                  className="btn btn-outline"
                  style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => setShowNCModal(true)}
                >
                  ⚠️ No Conformidad
                </button>
                <button className="modal-close" onClick={onClose}>&times;</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1.5rem', marginTop: '1rem' }}>

              {/* Cambiar Estado */}
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
                        background: editData.status === opt.label ? opt.color : 'transparent',
                      }}
                      onClick={() => handleStatusChange(opt.label)}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Auditoría con evidencia ─── */}
              <div className="form-group" style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '8px' }}>
                <label className="form-label">
                  📷 Fotos de evidencia de auditoría (opcional)
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    — Recomendadas al cambiar el estado
                  </span>
                </label>
                <input
                  type="file" accept="image/*" multiple className="form-control"
                  onChange={handleAuditoriaFotos}
                />
                {fotoAuditoria.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {fotoAuditoria.map((f, i) => (
                      <img key={i} src={URL.createObjectURL(f)} alt={`Preview ${i + 1}`}
                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    ))}
                  </div>
                )}
                {batch.foto_evidencia && fotoAuditoria.length === 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Foto de evidencia actual:
                    </p>
                    <img src={batch.foto_evidencia} alt="Evidencia actual"
                      style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                  </div>
                )}
                {editData.status !== batch.status && (
                  <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    <label className="form-label">Observaciones de la auditoría</label>
                    <textarea
                      className="form-control" rows="2"
                      placeholder="Ej: Contaminación bacteriana en sector NE. Descartado por protocolo."
                      value={auditoriaObs}
                      onChange={e => setAuditoriaObs(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* ─── BLOQUE 6: Historial de Cosechas y Métricas ─── */}
              <div className="card animate-fade-in" style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', background: 'var(--surface-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🧺 Cosechas y Rendimiento
                  </h4>
                  {(editData.status === 'Fructificación' || editData.status === 'Cosechado') && (
                    <button
                      className="btn"
                      style={{ background: 'var(--accent-color)', color: 'white', fontWeight: 'bold', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                      onClick={() => setShowCosechaModal(true)}
                    >
                      + Nueva Cosecha
                    </button>
                  )}
                </div>

                {/* Métricas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{metrics.EB.toFixed(1)}%</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EB Acumulada</div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{metrics.TPB.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TPB (Tasa de Prod.)</div>
                  </div>
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{metrics.totalFresco.toFixed(0)}g</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fresco Total</div>
                  </div>
                  <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{metrics.diasInoc}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Días Cultivo</div>
                  </div>
                </div>

                {/* Tabla de Cosechas */}
                {cosechasBatch.length > 0 ? (
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead style={{ background: 'var(--bg-color)', textAlign: 'left' }}>
                        <tr>
                          <th style={{ padding: '0.75rem' }}>Fecha</th>
                          <th style={{ padding: '0.75rem' }}>Modo</th>
                          <th style={{ padding: '0.75rem' }}>Fresco</th>
                          <th style={{ padding: '0.75rem' }}>EB %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cosechasBatch.map(c => {
                          const isGrupal = c.modo_cosecha === 'grupal' || c.modo_cosecha === 'sector';
                          let pesoRow = c.peso_fresco;
                          let ebRow = c.eficiencia_biologica || 0;
                          
                          if (isGrupal) {
                            const parte = c.batches?.find(b => b.batchId === batch.id);
                            pesoRow = parte?.peso_fresco_repartido || 0;
                            // En grupal, la EB de la oleada es compartida o si se calculó total. Mostramos la del modal.
                          }
                          
                          return (
                            <tr key={c.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem' }}>{new Date(c.fecha_cosecha).toLocaleDateString('es-AR')}</td>
                              <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>
                                {isGrupal ? `Grupal (#${c.id.split('-')[2]})` : `O. #${c.numero_oleada || 1}`}
                                {c.es_cosecha_final && <span style={{ marginLeft: '4px', color: 'var(--danger-color)', fontWeight: 'bold', fontSize: '0.7rem' }}>FINAL</span>}
                              </td>
                              <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{Number(pesoRow).toFixed(1)}g</td>
                              <td style={{ padding: '0.75rem', color: 'var(--accent-color)' }}>{Number(ebRow).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                    No hay cosechas registradas para este lote.
                  </div>
                )}
              </div>

              {/* Aislamientos */}
              {(editData.status === 'Colonias visibles' && (batch.evento_aislamiento_id || batch.es_aislamiento_primario)) && (
                <button
                  className="btn animate-fade-in"
                  style={{ background: '#10b981', color: 'white', fontWeight: 'bold', width: '100%' }}
                  onClick={() => setShowRegistroAislamientos(true)}
                >
                  🧫 Registrar aislamientos obtenidos
                </button>
              )}

              {/* Sugerencia sala fructificación */}
              {(showMoveSuggestion || editData.status === 'Fructificación') && (
                <div className="animate-fade-in" style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: '#a78bfa' }}>
                    🚚 Sugerencia: Mover a Sala de Fructificación
                  </p>
                  <select
                    className="form-control"
                    value={editData.destinoId}
                    onChange={e => setEditData({ ...editData, destinoId: e.target.value })}
                  >
                    <option value="">-- Seleccionar Nueva Sala --</option>
                    {salas.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.tipo})</option>)}
                  </select>
                </div>
              )}

              {/* Foto */}
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

              {/* Observaciones */}
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={editData.observaciones}
                  onChange={e => setEditData({ ...editData, observaciones: e.target.value })}
                  placeholder="Notas sobre el vigor, micelio, etc."
                />
              </div>

              {/* Destinado a Criopreservación */}
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                <input
                  type="checkbox"
                  id="destino_criopreservacion"
                  checked={editData.destino_criopreservacion}
                  onChange={e => setEditData({ ...editData, destino_criopreservacion: e.target.checked })}
                  style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                />
                <label htmlFor="destino_criopreservacion" style={{ fontWeight: '500', color: '#f8fafc', cursor: 'pointer', margin: 0 }}>
                  ❄️ Destinado a criopreservación
                </label>
              </div>

              {/* ─── BLOQUE 5: Cierre de Batch ─── */}
              {editData.status === 'Cosechado' && (
                <div className="card animate-fade-in" style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📦 Cierre de Batch
                  </h4>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Destino del Sustrato *</label>
                      <select
                        className="form-control"
                        value={cierreData.destino_sustrato}
                        onChange={e => setCierreData({ ...cierreData, destino_sustrato: e.target.value })}
                      >
                        <option value="">-- Seleccionar Destino --</option>
                        <option value="Descarte (bolsa roja)">🗑️ Descarte (bolsa roja)</option>
                        <option value="Descontaminación antes de descarte">☣️ Descontaminación antes de descarte</option>
                        <option value="Secado para análisis">🧪 Secado para análisis</option>
                        <option value="Reutilización">♻️ Reutilización</option>
                        <option value="Reservado para investigación">🔬 Reservado para investigación</option>
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Fecha de Cierre</label>
                        <input
                          type="date"
                          className="form-control"
                          value={cierreData.fecha_cierre}
                          onChange={e => setCierreData({ ...cierreData, fecha_cierre: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.4rem' }}>
                        <input
                          type="checkbox"
                          id="contenedor-devuelto"
                          checked={cierreData.contenedor_devuelto}
                          onChange={e => setCierreData({ ...cierreData, contenedor_devuelto: e.target.checked })}
                        />
                        <label htmlFor="contenedor-devuelto" style={{ fontSize: '0.85rem', cursor: 'pointer', lineHeight: 1.3 }}>
                          🔄 Devolver contenedor al ciclo de lavado
                        </label>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Observaciones de Cierre</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={cierreData.observaciones_cierre}
                        onChange={e => setCierreData({ ...cierreData, observaciones_cierre: e.target.value })}
                        placeholder="Notas finales sobre el sustrato, contenedor, etc."
                      />
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#1a1a2e', fontWeight: 'bold' }}
                      onClick={handleGuardarCierre}
                      disabled={savingCierre}
                    >
                      {savingCierre ? 'Guardando...' : '📦 Guardar Cierre de Batch'}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Historial de No Conformidades ─── */}
              {noConformidades.length > 0 && (
                <div className="card" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚠️ No Conformidades
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {noConformidades.map(nc => (
                      <div key={nc.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <strong style={{ color: 'var(--danger-color)' }}>{nc.tipo}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{nc.fecha_deteccion}</span>
                        </div>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>{nc.descripcion}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            Acción: {nc.accion_tomada}
                          </span>
                          {nc.foto_url && (
                            <a href={nc.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>
                              📷 Ver Foto
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Historial de Auditorías ─── */}
              {batch.fotos_auditoria && batch.fotos_auditoria.length > 0 && (
                <div className="card" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#f59e0b' }}>📋 Historial de auditorías</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {batch.fotos_auditoria.slice(-3).reverse().map((entry, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          {entry.fotos_urls && entry.fotos_urls.length > 0 && (
                            <>
                              <img src={entry.fotos_urls[0]} alt="" style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
                              {entry.fotos_urls.length > 1 && (
                                <span style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px' }}>
                                  +{entry.fotos_urls.length - 1}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div>
                          <div>
                            <strong>{entry.status_previo || '—'}</strong> → <strong>{entry.status_nuevo}</strong> · {entry.operator}
                          </div>
                          {entry.observaciones && <div style={{ color: 'var(--text-secondary)' }}>{entry.observaciones}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botones de guardar */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => onFilterBatch(batch.batchGroupId)}>
                  👁️ Ver Lote
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={loading}>
                  {loading ? 'Guardando...' : '💾 Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCosechaModal && (
        <NuevaCosechaModal
          initialBatch={batch}
          onClose={() => setShowCosechaModal(false)}
          onSaved={onClose}
        />
      )}

      {showRegistroAislamientos && (
        <RegistroMasivoAislamientosModal
          batchMadre={batch}
          onClose={() => setShowRegistroAislamientos(false)}
          onSaved={onClose}
        />
      )}

      {showNCModal && (
        <NoConformidadBatchModal
          batch={batch}
          onClose={() => setShowNCModal(false)}
          onSaved={() => {
            fetchNCs();
            onClose();
          }}
        />
      )}
    </>
  );
}
