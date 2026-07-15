import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function AgotarMedioModal({ medio, onClose, onSaved }) {
  const [fechaAgotamiento, setFechaAgotamiento] = useState(new Date().toISOString().split('T')[0]);
  const [motivo, setMotivo] = useState('Se usó todo');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!motivo) return alert('Seleccione un motivo');
    setSaving(true);
    try {
      const medioRef = doc(db, 'medios_preparados', medio.id);
      await updateDoc(medioRef, {
        estado: 'Agotado',
        fecha_agotamiento: fechaAgotamiento,
        motivo_agotamiento: motivo,
        observaciones_agotamiento: observaciones || null, // Optional
      });
      alert('✅ Medio marcado como Agotado');
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Error al marcar como agotado: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '500px' }}>
        <h3>Marcar como Agotado</h3>
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
          Está a punto de marcar el medio <strong>{medio.alias}</strong> como agotado.
        </p>

        <div className="form-group">
          <label>Fecha de Agotamiento</label>
          <input
            type="date"
            className="form-control"
            value={fechaAgotamiento}
            onChange={(e) => setFechaAgotamiento(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Motivo *</label>
          <select className="form-control" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option>Se usó todo</option>
            <option>Se descartó el resto</option>
            <option>Venció</option>
          </select>
        </div>

        <div className="form-group">
          <label>Observaciones <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>– opcional</span></label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Motivo detallado, si aplica..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
