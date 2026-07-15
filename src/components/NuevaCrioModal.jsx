import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, setDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';

const defaultForm = {
  batchOrigenId: '',
  cepaId: '',
  soporte: 'semillas',
  crioprotector: 'glicerol',
  concentracion_pct: 10,
  protocolo_descenso: 'gradual',
  temperatura_final: -80,
  ubicacion: {
    equipo_id: 'freezer_80',
    rack: '',
    caja: '',
    posicion: ''
  },
  fecha_congelacion: new Date().toISOString().split('T')[0],
  operador: 'Maxi',
  observaciones: '',
};

const ALMACENAMIENTO_TEMP = {
  freezer_80: -80,
  nitrogeno_liquido: -196,
  heladera_4: 4,
};

async function generateCrioId() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const q = query(collection(db, 'criopreservacion'));
  const snap = await getDocs(q);
  const todayDocs = snap.docs.filter(d => d.id.startsWith(`CRIO-${today}`));
  const seq = String(todayDocs.length + 1).padStart(3, '0');
  return `CRIO-${today}-${seq}`;
}

export default function NuevaCrioModal({ onClose, onSaved }) {
  const [formData, setFormData] = useState(defaultForm);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Cargar batches activos para el selector de origen
    const q = query(collection(db, 'batches'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status !== 'Planificado'));
    });
    return unsub;
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name.startsWith('ubicacion.')) {
        const field = name.split('.')[1];
        updated.ubicacion = { ...prev.ubicacion, [field]: value };
        if (field === 'equipo_id') {
          updated.temperatura_final = ALMACENAMIENTO_TEMP[value] ?? prev.temperatura_final;
        }
      }

      // Auto-fill cepaId from selected batch
      if (name === 'batchOrigenId' && value) {
        const batch = batches.find(b => b.id === value);
        if (batch?.cepa) updated.cepaId = batch.cepa;
      }
      return updated;
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.soporte || !formData.crioprotector || !formData.fecha_congelacion) {
      alert('Por favor completá todos los campos requeridos.');
      return;
    }
    setLoading(true);
    try {
      const newId = await generateCrioId();
      const docData = {
        ...formData,
        id: newId,
        concentracion_pct: Number(formData.concentracion_pct),
        temperatura_final: Number(formData.temperatura_final),
        viabilidad_post: null,
        fecha_descongelacion: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'criopreservacion', newId), docData);
      alert(`✅ Muestra ${newId} registrada con éxito.`);
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al guardar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>🧊 Nueva Criopreservación</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Se generará un ID automático: CRIO-YYYYMMDD-NNN
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem', marginTop: '1rem' }}>

          {/* Sección 1: Trazabilidad */}
          <div style={{ background: 'rgba(59,130,246,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.15)' }}>
            <h4 style={{ color: 'var(--primary-color)', margin: '0 0 1rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1. Trazabilidad
            </h4>
            <div className="form-group">
              <label className="form-label">Lote de Origen (Batch)</label>
              <select name="batchOrigenId" className="form-control" value={formData.batchOrigenId} onChange={handleChange}>
                <option value="">— Sin lote de origen registrado —</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.especie} {b.cepa ? `(${b.cepa})` : ''} · {b.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Cepa ID</label>
              <input
                type="text"
                name="cepaId"
                className="form-control"
                placeholder="Ej: CEPA-01 (se autocompleta desde el lote)"
                value={formData.cepaId}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Sección 2: Protocolo */}
          <div style={{ background: 'rgba(139,92,246,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.15)' }}>
            <h4 style={{ color: '#a78bfa', margin: '0 0 1rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              2. Protocolo de Congelación
            </h4>
            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Soporte *</label>
                <select name="soporte" className="form-control" required value={formData.soporte} onChange={handleChange}>
                  <option value="semillas">🌾 Semillas</option>
                  <option value="perlitas">⚪ Perlitas</option>
                  <option value="liquido">💧 Líquido</option>
                  <option value="otro">📦 Otro</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Crioprotector *</label>
                <select name="crioprotector" className="form-control" required value={formData.crioprotector} onChange={handleChange}>
                  <option value="glicerol">Glicerol</option>
                  <option value="DMSO">DMSO</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Concentración (%)</label>
                <input
                  type="number"
                  name="concentracion_pct"
                  className="form-control"
                  min="1" max="100"
                  value={formData.concentracion_pct}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Protocolo de Descenso</label>
                <select name="protocolo_descenso" className="form-control" value={formData.protocolo_descenso} onChange={handleChange}>
                  <option value="gradual">Gradual (ej: -1°C/min)</option>
                  <option value="directo">Directo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sección 3: Almacenamiento */}
          <div style={{ background: 'rgba(16,185,129,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.15)' }}>
            <h4 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              3. Almacenamiento Final
            </h4>
            <div className="grid-2" style={{ gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Equipo de Almacenamiento *</label>
                <select name="ubicacion.equipo_id" className="form-control" required value={formData.ubicacion.equipo_id} onChange={handleChange}>
                  <option value="freezer_80">🧊 Freezer -80°C</option>
                  <option value="nitrogeno_liquido">⚗️ Nitrógeno Líquido (-196°C)</option>
                  <option value="heladera_4">❄️ Heladera +4°C</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Temperatura Final (°C)</label>
                <input
                  type="number"
                  name="temperatura_final"
                  className="form-control"
                  value={formData.temperatura_final}
                  onChange={handleChange}
                />
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rack / Torre</label>
                <input type="text" name="ubicacion.rack" className="form-control" placeholder="Ej: R2" value={formData.ubicacion.rack} onChange={handleChange} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Caja</label>
                <input type="text" name="ubicacion.caja" className="form-control" placeholder="Ej: C4" value={formData.ubicacion.caja} onChange={handleChange} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Posición</label>
                <input type="text" name="ubicacion.posicion" className="form-control" placeholder="Ej: A3" value={formData.ubicacion.posicion} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* Sección 4: Registro */}
          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fecha de Congelación *</label>
              <input
                type="date"
                name="fecha_congelacion"
                className="form-control"
                required
                value={formData.fecha_congelacion}
                onChange={handleChange}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Operador</label>
              <input
                type="text"
                name="operador"
                className="form-control"
                value={formData.operador}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Observaciones</label>
            <textarea
              name="observaciones"
              className="form-control"
              rows="2"
              placeholder="Ej: Lote procedente de micelio en pico de crecimiento..."
              value={formData.observaciones}
              onChange={handleChange}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
              disabled={loading}
            >
              {loading ? '⏳ Guardando...' : '🧊 Registrar Muestra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
