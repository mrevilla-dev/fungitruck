import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

const TIPOS_AMBIENTE = [
  { value: 'incubacion',    label: '🌡️ Incubación' },
  { value: 'fructificacion',label: '🍄 Fructificación' },
  { value: 'frio',          label: '❄️ Heladera / Frío' },
  { value: 'freezer',       label: '🧊 Freezer -80' },
  { value: 'laboratorio',   label: '🔬 Laboratorio' },
  { value: 'deposito',      label: '📦 Depósito' },
  { value: 'otro',          label: '📦 Otro' },
];

const DEFAULT_FORM = {
  nombre: '',
  tipo: 'incubacion',
  capacidadMax: '',
  tempMin: '',
  tempMax: '',
  humMin: '',
  humMax: '',
  alto: '',
  ancho: '',
  profundo: '',
  extractor: false,
  intractor: false,
  lux: '',
  estanterias: []
};

export default function SalaFormModal({ sala, onClose, onSaved }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);

  // Pre-fill if editing
  useEffect(() => {
    if (sala) {
      setForm({
        nombre: sala.nombre || '',
        tipo: sala.tipo || 'incubacion',
        capacidadMax: sala.capacidadMax ?? '',
        tempMin: sala.parametrosIdeales?.tempMin ?? '',
        tempMax: sala.parametrosIdeales?.tempMax ?? '',
        humMin: sala.parametrosIdeales?.humMin ?? '',
        humMax: sala.parametrosIdeales?.humMax ?? '',
        alto: sala.dimensiones?.alto ?? '',
        ancho: sala.dimensiones?.ancho ?? '',
        profundo: sala.dimensiones?.profundo ?? '',
        extractor: sala.extractor ?? false,
        intractor: sala.intractor ?? false,
        lux: sala.lux ?? '',
        estanterias: sala.estanterias || [],
      });
    }
  }, [sala]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      capacidadMax: form.capacidadMax !== '' ? Number(form.capacidadMax) : null,
      parametrosIdeales: {
        tempMin: form.tempMin !== '' ? Number(form.tempMin) : null,
        tempMax: form.tempMax !== '' ? Number(form.tempMax) : null,
        humMin: form.humMin !== '' ? Number(form.humMin) : null,
        humMax: form.humMax !== '' ? Number(form.humMax) : null,
      },
      dimensiones: {
        alto: form.alto !== '' ? Number(form.alto) : null,
        ancho: form.ancho !== '' ? Number(form.ancho) : null,
        profundo: form.profundo !== '' ? Number(form.profundo) : null,
      },
      extractor: Boolean(form.extractor),
      intractor: Boolean(form.intractor),
      lux: form.lux !== '' ? Number(form.lux) : null,
      estanterias: form.estanterias.filter(e => e.nombre.trim() !== '').map(e => ({
        id: e.id || Date.now() + Math.random(),
        nombre: e.nombre.trim(),
        cantidad: e.cantidad || 1
      })),
      activa: true,
    };
    try {
      if (sala?.id) {
        await updateDoc(doc(db, 'salas', sala.id), { ...payload, updatedAt: serverTimestamp() });
        onSaved({ id: sala.id, ...payload });
      } else {
        const ref = await addDoc(collection(db, 'salas'), {
          ...payload,
          ultimaDesinfeccion: null,
          createdAt: serverTimestamp(),
        });
        onSaved({ id: ref.id, ...payload, ultimaDesinfeccion: null });
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar la sala. Revisá la consola.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{sala ? '✏️ Editar Sala' : '➕ Nueva Sala'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* NOMBRE */}
          <div className="form-group">
            <label className="form-label">Nombre de la Sala *</label>
            <input
              type="text"
              name="nombre"
              className="form-control"
              placeholder="Ej: Locker Incubación 1"
              required
              value={form.nombre}
              onChange={handleChange}
            />
          </div>

          {/* TIPO */}
          <div className="form-group">
            <label className="form-label">Tipo de Ambiente</label>
            <div className="tipo-grid">
              {TIPOS_AMBIENTE.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`tipo-btn ${form.tipo === t.value ? 'active' : ''}`}
                  onClick={() => setForm(prev => ({ ...prev, tipo: t.value }))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* CAPACIDAD */}
          <div className="form-group">
            <label className="form-label">Capacidad máxima (unidades)</label>
            <input
              type="number"
              name="capacidadMax"
              className="form-control"
              placeholder="Ej: 40"
              min="0"
              value={form.capacidadMax}
              onChange={handleChange}
            />
          </div>

          {/* PARÁMETROS IDEALES */}
          <div className="form-group">
            <label className="form-label">Parámetros Ideales</label>
            <div className="params-grid">
              <div>
                <label className="param-label">🌡️ Temp. Mín (°C)</label>
                <input type="number" name="tempMin" className="form-control" placeholder="20" step="0.5" value={form.tempMin} onChange={handleChange} />
              </div>
              <div>
                <label className="param-label">🌡️ Temp. Máx (°C)</label>
                <input type="number" name="tempMax" className="form-control" placeholder="28" step="0.5" value={form.tempMax} onChange={handleChange} />
              </div>
              <div>
                <label className="param-label">💧 Hum. Mín (%)</label>
                <input type="number" name="humMin" className="form-control" placeholder="60" min="0" max="100" value={form.humMin} onChange={handleChange} />
              </div>
              <div>
                <label className="param-label">💧 Hum. Máx (%)</label>
                <input type="number" name="humMax" className="form-control" placeholder="90" min="0" max="100" value={form.humMax} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* FICHA TÉCNICA AVANZADA */}
          <div className="form-group">
            <label className="form-label">Ficha Técnica & Dimensiones (cm)</label>
            <div className="params-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div>
                <label className="param-label">Alto</label>
                <input type="number" name="alto" className="form-control" placeholder="100" value={form.alto} onChange={handleChange} />
              </div>
              <div>
                <label className="param-label">Ancho</label>
                <input type="number" name="ancho" className="form-control" placeholder="80" value={form.ancho} onChange={handleChange} />
              </div>
              <div>
                <label className="param-label">Prof.</label>
                <input type="number" name="profundo" className="form-control" placeholder="60" value={form.profundo} onChange={handleChange} />
              </div>
            </div>
            
            <div className="flex-gap" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
              <label className="flex-gap" style={{ fontSize: '0.85rem' }}>
                <input type="checkbox" name="extractor" checked={form.extractor} onChange={e => setForm({...form, extractor: e.target.checked})} />
                Extractor
              </label>
              <label className="flex-gap" style={{ fontSize: '0.85rem' }}>
                <input type="checkbox" name="intractor" checked={form.intractor} onChange={e => setForm({...form, intractor: e.target.checked})} />
                Intractor
              </label>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <input type="number" name="lux" className="form-control" placeholder="Lux" value={form.lux} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* ESTANTERÍAS / CAJONERAS */}
          <div className="form-group section-divider" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <label className="form-label flex-between" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Estructuras Físicas (Estanterías, Cajones)</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(prev => ({...prev, estanterias: [...prev.estanterias, { id: Date.now(), nombre: '', cantidad: 1 }]}))}>
                ➕ Agregar
              </button>
            </label>
            {form.estanterias.map((est, idx) => (
              <div key={est.id || idx} className="flex-gap" style={{ marginBottom: '0.5rem' }}>
                <input type="text" className="form-control" placeholder="Ej: Estantería A" style={{ flex: 2 }}
                   value={est.nombre}
                   onChange={e => {
                     const newEst = [...form.estanterias];
                     newEst[idx].nombre = e.target.value;
                     setForm(prev => ({...prev, estanterias: newEst}));
                   }}
                />
                <input type="number" className="form-control" placeholder="Estantes" style={{ flex: 1 }} min="1"
                   value={est.cantidad}
                   onChange={e => {
                     const newEst = [...form.estanterias];
                     newEst[idx].cantidad = Number(e.target.value);
                     setForm(prev => ({...prev, estanterias: newEst}));
                   }}
                   title="Cantidad de estantes o divisiones"
                />
                <button type="button" className="btn btn-danger" onClick={() => {
                   setForm(prev => ({...prev, estanterias: prev.estanterias.filter((_, i) => i !== idx)}));
                }}>🗑</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
              {loading ? 'Guardando...' : sala ? '💾 Guardar Cambios' : '✅ Crear Sala'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
