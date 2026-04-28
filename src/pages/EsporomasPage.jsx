import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';

export default function EsporomasPage() {
  const [esporomas, setEsporomas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    genero: '',
    especie: '',
    descripcion: '',
    lugarRecoleccion: '',
    fechaRecoleccion: new Date().toISOString().split('T')[0],
    operator: 'Maxi'
  });
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "esporomas"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEsporomas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Generate ID like ESP-20260424-01
      const datePart = formData.fechaRecoleccion.replace(/-/g, '');
      const count = esporomas.filter(esp => esp.fechaRecoleccion === formData.fechaRecoleccion).length + 1;
      const esporomaId = `ESP-${datePart}-${String(count).padStart(2, '0')}`;

      let fotoUrl = null;
      if (photo) {
        const fileRef = ref(storage, `esporomas/${esporomaId}/${Date.now()}-${photo.name}`);
        await uploadBytes(fileRef, photo);
        fotoUrl = await getDownloadURL(fileRef);
      }

      await setDoc(doc(db, "esporomas", esporomaId), {
        ...formData,
        id: esporomaId,
        fotoUrl,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });

      setShowModal(false);
      setFormData({ genero: '', especie: '', descripcion: '', lugarRecoleccion: '', fechaRecoleccion: new Date().toISOString().split('T')[0], operator: 'Maxi' });
      setPhoto(null);
    } catch (err) {
      console.error(err);
      alert("Error al guardar esporoma");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Ejemplares (Esporomas)</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>➕ Nuevo Ejemplar</button>
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
              <button className="edit-icon-btn no-print" onClick={() => window.print()}>🖨️</button>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3>{esp.genero} {esp.especie}</h3>
                <p style={{ fontSize: '0.9rem' }}>📍 {esp.lugarRecoleccion}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📅 {esp.fechaRecoleccion}</p>
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
              <h3>Registrar Ejemplar Silvestre</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Género</label>
                  <input type="text" className="form-control" placeholder="Ej: Ganoderma" required value={formData.genero} onChange={e => setFormData({...formData, genero: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Especie</label>
                  <input type="text" className="form-control" placeholder="Ej: lucidum" required value={formData.especie} onChange={e => setFormData({...formData, especie: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lugar de Recolección</label>
                <input type="text" className="form-control" placeholder="Ej: Bosque de pinos, Miramar" required value={formData.lugarRecoleccion} onChange={e => setFormData({...formData, lugarRecoleccion: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-control" required value={formData.fechaRecoleccion} onChange={e => setFormData({...formData, fechaRecoleccion: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Descripción / Notas</label>
                <textarea className="form-control" rows="3" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Foto del ejemplar</label>
                <input type="file" accept="image/*" capture="environment" className="form-control" onChange={e => setPhoto(e.target.files[0])} />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Guardando..." : "💾 Registrar Ejemplar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
