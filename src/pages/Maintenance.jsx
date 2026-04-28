import { useState } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import DestinoSelector from '../components/DestinoSelector';

const TIPOS = [
  { value: "Limpieza", label: "🧹 Limpieza y Desinfección" },
  { value: "Temperatura", label: "🌡️ Control de Temperatura / Humedad" },
  { value: "Plagas", label: "🐛 Manejo Integral de Plagas" },
  { value: "Infraestructura", label: "🔧 Mantenimiento de Infraestructura" },
];

function Maintenance() {
  const [formData, setFormData] = useState({
    tipo: 'Limpieza',
    destinoId: '',
    destinoNombre: '',
    temperatura: '',
    humedad: '',
    observaciones: '',
    operator: 'Maxi',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDestinoChange = (e) => {
    setFormData(prev => ({ 
      ...prev, 
      destinoId: e.target.value,
      destinoNombre: e.target.label
    }));
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
        tipo: formData.tipo,
        destinoId: formData.destinoId,
        destinoNombre: formData.destinoNombre,
        temperatura: formData.temperatura || null,
        humedad: formData.humedad || null,
        observaciones: formData.observaciones,
        fotoUrl,
        operator: formData.operator,
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al guardar. Revisá la consola.");
    } finally {
      setLoading(false);
    }
  };

  if (saved) {
    return (
      <div className="animate-fade-in">
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3>Registro Guardado</h3>
          <p style={{ color: 'var(--text-secondary)' }}>El registro de mantenimiento quedó guardado correctamente.</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '1.5rem' }}
            onClick={() => {
              setSaved(false);
              setFormData({ tipo: 'Limpieza', destinoId: '', destinoNombre: '', temperatura: '', humedad: '', observaciones: '', operator: 'Maxi' });
            }}
          >
            ➕ Nuevo Registro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2>Mantenimiento del Sector</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Registrá las condiciones ambientales, limpieza e infraestructura de cada sala.
      </p>

      <div className="card">
        <form onSubmit={handleSubmit}>

          {/* TIPO */}
          <div className="form-group">
            <label className="form-label">Tipo de Registro</label>
            <div className="tipo-grid">
              {TIPOS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, tipo: t.value }))}
                  className={`tipo-btn ${formData.tipo === t.value ? 'active' : ''}`}
                  style={{
                    fontWeight: formData.tipo === t.value ? 700 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* SECTOR DINÁMICO */}
          <DestinoSelector 
            label="Sector / Sala"
            value={formData.destinoId}
            onChange={handleDestinoChange}
          />

          {/* TEMPERATURA Y HUMEDAD (solo si aplica) */}
          {formData.tipo === 'Temperatura' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Temperatura (°C)</label>
                <input
                  type="number"
                  name="temperatura"
                  className="form-control"
                  placeholder="Ej: 24.5"
                  step="0.1"
                  value={formData.temperatura}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Humedad relativa (%)</label>
                <input
                  type="number"
                  name="humedad"
                  className="form-control"
                  placeholder="Ej: 85"
                  min="0"
                  max="100"
                  value={formData.humedad}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          {/* OBSERVACIONES */}
          <div className="form-group">
            <label className="form-label">Observaciones / Detalle</label>
            <textarea
              name="observaciones"
              className="form-control"
              placeholder={
                formData.tipo === 'Limpieza' ? "Ej: Limpieza con alcohol 70%, superficies y paredes. Sin contaminaciones visibles." :
                formData.tipo === 'Plagas' ? "Ej: Detección de trips en nivel bajo. Se aplicó trampa amarilla pegajosa." :
                formData.tipo === 'Infraestructura' ? "Ej: Se ajustó el sistema de ventilación. Filtro HEPA revisado." :
                "Detalles del registro..."
              }
              rows="4"
              value={formData.observaciones}
              onChange={handleChange}
            ></textarea>
          </div>

          {/* FOTO EVIDENCIA */}
          <div className="form-group">
            <label className="form-label">📷 Foto de Evidencia (opcional)</label>
            <input type="file" accept="image/*" capture="environment" className="form-control" onChange={e => setPhoto(e.target.files[0])} />
            {photo && <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Archivo seleccionado: {photo.name}</p>}
          </div>

          {/* OPERARIO */}
          <div className="form-group">
            <label className="form-label">Operario</label>
            <select
              name="operator"
              className="form-control"
              value={formData.operator}
              onChange={handleChange}
            >
              <option value="Maxi">Maxi</option>
              <option value="Operario 1">Operario 1</option>
              <option value="Operario 2">Operario 2</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? "Guardando..." : "💾 Guardar Registro"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Maintenance;

