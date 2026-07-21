import { useState } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import DestinoSelector from '../components/DestinoSelector';
import { compressImage } from '../utils/imageUtils';
import toast from 'react-hot-toast';

const TIPOS = [
  { value: "Temperatura", label: "🌡️ Control de Clima" },
  { value: "Limpieza", label: "🧹 Rutina de Higiene" },
  { value: "Plagas", label: "🐛 Control de Plagas" },
  { value: "Infraestructura", label: "🔧 Filtros / Equipos" },
];

const CHECKLISTS = {
  "Limpieza": [
    "Desinfección de superficies (Alcohol 70%)",
    "Limpieza de pisos (Lavandina)",
    "Esterilización de herramientas",
    "Control de moho visible"
  ],
  "Plagas": [
    "Revisión de trampas adhesivas",
    "Inspección de puntos de entrada",
    "Cambio de cebos / trampas"
  ],
  "Infraestructura": [
    "Limpieza de pre-filtros de aire",
    "Inspección de Filtro HEPA",
    "Calibración de sensores",
    "Prueba de nebulización / humedad"
  ]
};

function Maintenance() {
  const [formData, setFormData] = useState({
    tipo: 'Temperatura',
    destinoId: '',
    destinoNombre: '',
    temperatura: '',
    humedad: '',
    observaciones: '',
    operator: 'Maxi',
  });
  const [checkedItems, setCheckedItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState(null);

  const toggleCheck = (item) => {
    setCheckedItems(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let fotoUrl = null;
      if (photo) {
        const fileRef = ref(storage, `mantenimiento/${formData.destinoId}/${Date.now()}-${photo.name}`);
        await uploadBytes(fileRef, photo);
        fotoUrl = await getDownloadURL(fileRef);
      }

      await addDoc(collection(db, "mantenimiento"), {
        ...formData,
        checklist: Object.keys(checkedItems).filter(k => checkedItems[k]),
        fotoUrl,
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch (error) {
      console.error(error);
      toast.error(`Error al guardar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (saved) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <h2 style={{ color: 'var(--accent-color)' }}>✅ Registro Ambiental Exitoso</h2>
        <p>Los datos han sido vinculados al historial de la sala.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => { setSaved(false); setCheckedItems({}); }}>Nuevo Registro</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Rutinas y Registro Ambiental</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Auditá el estado de las salas y equipos preventivamente.</p>

      <div className="card" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.5rem' }}>
          
          <div className="form-group">
            <label className="form-label">Tipo de Actividad</label>
            <div className="tipo-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {TIPOS.map(t => (
                <button key={t.value} type="button" className={`tipo-btn ${formData.tipo === t.value ? 'active' : ''}`} onClick={() => setFormData({...formData, tipo: t.value})}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <DestinoSelector label="Sala / Sector Macro" value={formData.destinoId} onChange={e => setFormData({...formData, destinoId: e.target.value, destinoNombre: e.target.label})} />

          {formData.tipo === 'Temperatura' ? (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Temp (°C)</label>
                <input type="number" step="0.1" className="form-control" required value={formData.temperatura} onChange={e => setFormData({...formData, temperatura: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Humedad (%)</label>
                <input type="number" className="form-control" required value={formData.humedad} onChange={e => setFormData({...formData, humedad: e.target.value})} />
              </div>
            </div>
          ) : (
            <div className="checklist-container" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '1rem' }}>📋 Checklist de Tarea</p>
              {(CHECKLISTS[formData.tipo] || []).map(item => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={checkedItems[item] || false} onChange={() => toggleCheck(item)} />
                  <span style={{ color: checkedItems[item] ? 'var(--text-main)' : 'var(--text-secondary)' }}>{item}</span>
                </label>
              ))}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">📷 Evidencia Visual</label>
            <input type="file" accept="image/*" capture="environment" className="form-control" onChange={e => setPhoto(e.target.files[0])} />
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="3" value={formData.observaciones} onChange={e => setFormData({...formData, observaciones: e.target.value})} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading || !formData.destinoId}>
            {loading ? 'Sincronizando...' : '💾 Registrar Rutina'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Maintenance;
