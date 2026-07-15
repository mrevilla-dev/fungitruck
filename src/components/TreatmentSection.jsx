import React from 'react';

export default function TreatmentSection({ tratamiento, batches, onChangeEstadoBatch, onChangeEstadoMasivo, onAdoptir }) {
  const toggleAll = () => {};
  return (
    <div className="treatment-section" style={{ border: '1px solid #ddd', padding: '1rem', marginBottom: '1rem' }}>
      <h3>{tratamiento.label || 'Tratamiento'}</h3>
      <div style={{ marginBottom: '0.5rem' }}>
        <button className="btn-primary" onClick={() => onChangeEstadoMasivo(batches.map(b => b._docId), 'Inoculado')}>Marcar todos como Inoculado</button>
        <button className="btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={onAdoptir}>Adoptar batch existente</button>
      </div>
      <ul>
        {batches.map(batch => (
          <li key={batch._docId} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ fontFamily: 'monospace', marginRight: '0.5rem' }}>{batch._docId}</span>
            <span>{batch.estado}</span>
            <button style={{ marginLeft: '0.5rem' }} className="btn-sm" onClick={() => onChangeEstadoBatch(batch._docId, 'Inoculado')}>Inocular</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
