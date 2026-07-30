import { useState, useEffect, useMemo } from 'react';
import { db, storage, auth } from '../firebase';
import SearchableSelect from '../components/SearchableSelect';
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, setDoc, doc, deleteDoc, updateDoc, runTransaction, arrayUnion, getDocs } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { compressImage } from '../utils/imageUtils';
import { uploadFileToDrive } from '../services/driveService';
import DerivacionEsporomaModal from '../components/DerivacionEsporomaModal';
import PrintLabelsModal from '../components/PrintLabelsModal';
import PhotoLightbox from '../components/PhotoLightbox';
import toast from 'react-hot-toast';

export default function EsporomasPage() {
  const [esporomas, setEsporomas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [derivacionEsporoma, setDerivacionEsporoma] = useState(null);
  const [printEsporoma, setPrintEsporoma] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingEsporoma, setEditingEsporoma] = useState(null);
  const [formData, setFormData] = useState({
    genero: '',
    especie: '',
    codigo_cepa: '',
    nombre_comun: '',
    origen: '',
    latitud: '',
    longitud: '',
    batch_origen_id: '',
    productor_nombre: '',
    estado_biologico: 'Esporoma',
    otro_estado_biologico: '',
    descripcion: '',
    lugarRecoleccion: '',
    fechaRecoleccion: new Date().toISOString().split('T')[0],
    // Genetic fields kept for Firestore but hidden in UI
    ploidia: 'Diploide',
    tipo_micelio: 'Dicarión',
    mat: 'N/A',
    operator: 'Maxi'
  });
  const [photo, setPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filtroEspecie, setFiltroEspecie] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('');
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  const especiesUnicas = useMemo(() =>
    [...new Set(esporomas.map(e => `${e.genero} ${e.especie}`).filter(Boolean))].sort(),
    [esporomas]
  );
  const origenesUnicos = useMemo(() =>
    [...new Set(esporomas.map(e => e.origen).filter(Boolean))].sort(),
    [esporomas]
  );

  const esporomasFiltrados = esporomas.filter(esp => {
    if (filtroEspecie && `${esp.genero} ${esp.especie}` !== filtroEspecie) return false;
    if (filtroOrigen && esp.origen !== filtroOrigen) return false;
    if (busquedaTexto) {
      const s = busquedaTexto.toLowerCase();
      const match = (esp.id || '').toLowerCase().includes(s) ||
                    (esp.genero || '').toLowerCase().includes(s) ||
                    (esp.especie || '').toLowerCase().includes(s) ||
                    (esp.lugarRecoleccion || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

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
        ploidia: esp.ploidia || esp.genetica || 'Diploide',
        tipo_micelio: esp.tipo_micelio || 'Dicarión',
        mat: esp.mat || 'N/A',
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
        ploidia: 'Diploide',
        tipo_micelio: 'Dicarión',
        mat: 'N/A',
        operator: 'Maxi'
      });
    }
    setPhoto(null);
    setShowModal(true);
  };

  const copyId = (id) => {
    navigator.clipboard.writeText(id);
    toast.success('ID copiado');
  };

  const ORIGEN_COLORS = {
    'Silvestre': '#10b981',
    'Cultivo interno': '#3b82f6',
    'Compra a productor': '#f59e0b',
    'Compra': '#f59e0b',
    'Intercambio': '#a855f7',
    'Donación': '#8b5cf6',
    'Comercial': '#64748b',
    'Desconocido': '#64748b'
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
      toast.success("Ejemplar eliminado correctamente.");
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar el ejemplar.");
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
        // Generate semantic ID according to spec
        const generoCode = formData.genero.slice(0,3).toUpperCase();
        const especieCode = formData.especie.slice(0,3).toUpperCase();
        const codigoCepa = formData.codigo_cepa?.trim();
        const origenMap = {
          'Silvestre': 'SIL',
          'Cultivo interno': 'INT',
          'Compra a productor': 'PRO',
          'Comercial': 'COM',
          'Intercambio': 'EXC',
          'Donación': 'DON',
          'Desconocido': 'DES'
        };
        const origenCode = origenMap[formData.origen] || 'UNK';
        const datePart = formData.fechaRecoleccion.replace(/-/g, '').slice(2); // YYMMDD
        const seqKey = `ESP_${datePart}`;
        const counterRef = doc(db, 'metadata', 'counters');

        const newId = await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef);
          const data = counterSnap.exists() ? counterSnap.data() : {};
          const seq = (data[seqKey] || 0) + 1;
          transaction.set(counterRef, { [seqKey]: seq }, { merge: true });

          const nnn = String(seq).padStart(3, '0');
          const parts = [
            'ESP',
            `${generoCode}${especieCode}`,
            codigoCepa || null,
            origenCode,
            datePart,
            nnn
          ].filter(Boolean);
          return parts.join('-');
        });
        esporomaId = newId;

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
          // Ensure genetic fields are stored even if hidden
          ploidia: formData.ploidia,
          tipo_micelio: formData.tipo_micelio,
          mat: formData.mat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };



      if (editingEsporoma) {
        await updateDoc(doc(db, "esporomas", esporomaId), docData);
      } else {
        await setDoc(doc(db, "esporomas", esporomaId), {
          ...docData,
          createdAt: serverTimestamp()
        });

      }


      setShowModal(false);
      setEditingEsporoma(null);
      setUploadProgress(0);
      toast.success("Guardado con éxito");
        // If custom "Otro" state, update config collection
        if (formData.estado_biologico === 'Otro' && formData.otro_estado_biologico.trim()) {
          await setDoc(doc(db, 'config', 'estados_biologicos'), {
            estados: arrayUnion(formData.otro_estado_biologico.trim())
          }, { merge: true });
        }

      setLoading(false);
      setUploadProgress(0);
    } catch (err) {
      console.error(err);
      toast.error(`Error al guardar: ${err.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Esporomas</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => openModal()}>➕ Nuevo Esporoma</button>
      </div>

      <p className="no-print">Registro de ejemplares silvestres recolectados para aislamiento y estudio.</p>

      <div className="no-print" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>🔍 Buscar</label>
          <input
            type="text"
            className="form-control"
            placeholder="ID, especie, lugar..."
            value={busquedaTexto}
            onChange={e => setBusquedaTexto(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Especie</label>
          <select className="form-control" value={filtroEspecie} onChange={e => setFiltroEspecie(e.target.value)}>
            <option value="">Todas las especies</option>
            {especiesUnicas.map(esp => <option key={esp} value={esp}>{esp}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Origen</label>
          <select className="form-control" value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}>
            <option value="">Todos los orígenes</option>
            {origenesUnicos.map(ori => <option key={ori} value={ori}>{ori}</option>)}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mostrando {esporomasFiltrados.length} de {esporomas.length}</span>
        </div>
      </div>

      <div className="salas-grid">
        {esporomasFiltrados.map(esp => (
          <div key={esp.id} className="card sala-card esporoma-card">
            {esp.fotoUrl && (
              <img
                src={esp.fotoUrl}
                alt={esp.especie}
                className="no-print"
                onClick={() => setLightboxImage(esp.fotoUrl)}
                style={{
                  width: '100%',
                  height: '150px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  marginBottom: '1rem',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              />
            )}
            <div className="sala-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                <div className="label-id" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>{esp.id}</div>
                <button className="edit-icon-btn" title="Copiar ID" onClick={() => copyId(esp.id)} style={{ fontSize: '0.75rem' }}>📋</button>
              </div>
              {esp.origen && (() => {
                const c = ORIGEN_COLORS[esp.origen] || '#64748b';
                return (
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '12px', background: `${c}22`, color: c, border: `1px solid ${c}44`, display: 'inline-block', marginBottom: '0.5rem' }}>
                    {esp.origen}
                  </span>
                );
              })()}
              <div className="flex-gap no-print">
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', marginRight: '0.5rem' }} onClick={() => setDerivacionEsporoma(esp)}>+ Nueva Derivación</button>
                <button className="edit-icon-btn" title="Editar" onClick={() => openModal(esp)}>✏️</button>
                <button className="edit-icon-btn" title="Imprimir" onClick={() => setPrintEsporoma(esp)}>🖨️</button>
                <button className="edit-icon-btn" title="Eliminar" style={{ color: 'var(--danger-color)' }} onClick={() => handleDelete(esp)}>🗑️</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3>{esp.genero} {esp.especie}</h3>
                <p style={{ fontSize: '0.9rem' }}>📍 {esp.lugarRecoleccion}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📅 {esp.fechaRecoleccion} | 🧬 <strong>{esp.ploidia || esp.genetica || 'Diploide'}</strong> · {esp.tipo_micelio || 'Dicarión'}</p>
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
              <h3>{editingEsporoma ? 'Editar Esporoma' : 'Registrar Esporoma'}</h3>
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
                    <label className="form-label">Código de cepa (opcional)</label>
                    <input type="text" className="form-control" placeholder="Ej: A01" value={formData.codigo_cepa} onChange={e => setFormData({ ...formData, codigo_cepa: e.target.value })} />
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>⚠️ Evitar puntos (.) y guiones (-) en el código de cepa</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre común (opcional)</label>
                    <input type="text" className="form-control" placeholder="Ej: Girgola" value={formData.nombre_comun} onChange={e => setFormData({ ...formData, nombre_comun: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Origen del material</label>
                    <select className="form-control" required value={formData.origen} onChange={e => setFormData({ ...formData, origen: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      <option value="Silvestre">Silvestre</option>
                      <option value="Cultivo interno">Cultivo interno</option>
                      <option value="Compra a productor">Compra a productor</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Intercambio">Intercambio</option>
                      <option value="Donación">Donación</option>
                      <option value="Desconocido">Desconocido</option>
                    </select>
{/* Conditional fields based on origen */}
{formData.origen === 'Silvestre' && (
  <div className="grid-2">
    <div className="form-group">
      <label className="form-label">Latitud</label>
      <input type="number" className="form-control" placeholder="Ej: -33.45" value={formData.latitud} onChange={e => setFormData({ ...formData, latitud: e.target.value })} />
    </div>
    <div className="form-group">
      <label className="form-label">Longitud</label>
      <input type="number" className="form-control" placeholder="Ej: -70.66" value={formData.longitud} onChange={e => setFormData({ ...formData, longitud: e.target.value })} />
    </div>
  </div>
)}
                <div className="form-group">
                  <label className="form-label">Estado biológico del material</label>
                  <select className="form-control" required value={formData.estado_biologico} onChange={e => setFormData({ ...formData, estado_biologico: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    <option value="Esporoma">Esporoma</option>
                    <option value="Moho">Moho</option>
                    <option value="Levadura">Levadura</option>
                    <option value="Micelio vegetativo">Micelio vegetativo</option>
                    <option value="Esclerocio">Esclerocio</option>
                    <option value="Desconocido">Desconocido</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                {formData.estado_biologico === 'Otro' && (
                  <div className="form-group">
                    <label className="form-label">Especificar estado biológico</label>
                    <input type="text" className="form-control" placeholder="Ej: Costra, Biopelícula..." value={formData.otro_estado_biologico} onChange={e => setFormData({ ...formData, otro_estado_biologico: e.target.value })} />
                  </div>
                )}
{formData.origen === 'Cultivo interno' && (
  <div className="form-group">
    <label className="form-label">Batch de origen</label>
    <SearchableSelect
      placeholder="Seleccionar batch"
      options={[]}
      value={formData.batch_origen_id}
      onChange={val => setFormData({ ...formData, batch_origen_id: val })}
    />
  </div>
)}
{formData.origen === 'Compra a productor' && (
  <div className="form-group">
    <label className="form-label">Nombre del productor / proveedor</label>
    <input type="text" className="form-control" placeholder="Ej: Terrestrial Fungi" value={formData.productor_nombre} onChange={e => setFormData({ ...formData, productor_nombre: e.target.value })} />
  </div>
)}
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
                <label className="form-label">Responsable</label>
                <input type="text" className="form-control" value={auth.currentUser?.displayName || auth.currentUser?.email || 'Desconocido'} disabled />
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
                  {loading ? (uploadProgress > 0 ? "Subiendo..." : "Guardando...") : (editingEsporoma ? "💾 Guardar Cambios" : "💾 Registrar Esporoma")}
                </button>
            </form>
          </div>
        </div>
      )}

      {derivacionEsporoma && (
        <DerivacionEsporomaModal 
          esporoma={derivacionEsporoma} 
          onClose={() => setDerivacionEsporoma(null)} 
        />
      )}

      {printEsporoma && (
        <PrintLabelsModal
          batches={[{
            id: printEsporoma.id,
            alias: `${printEsporoma.genero} ${printEsporoma.especie}`,
            especie: printEsporoma.especie,
            fecha: printEsporoma.fechaRecoleccion,
            operario: auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema',
            nombre_receta: printEsporoma.descripcion || '',
            tipo_uso: 'Esporoma',
            tipo_etiqueta: 'PORTAOBJETOS',
            tipo_inoculacion: '',
            generacion: 0,
            numero_unidad: 1,
            total_unidades: 1,
            codigo_cepa: printEsporoma.codigo_cepa || '',
          }]}
          onClose={() => setPrintEsporoma(null)}
          usuarioActivo={auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema'}
          initialProfile="PORTAOBJETOS"
        />
      )}

      {lightboxImage && (
        <PhotoLightbox
          imageUrl={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
