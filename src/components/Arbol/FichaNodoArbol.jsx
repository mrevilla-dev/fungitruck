import React from 'react';

export default function FichaNodoArbol({ data }) {
  if (!data) return null;
  const { tipo, fotoUrl, id, status, genero, especie, cepa } = data;
  const containerStyle = {
    background: '#1e293b',
    border: '2px solid #475569',
    borderRadius: '8px',
    padding: '10px',
    color: '#f8fafc',
    width: '200px',
    fontSize: '12px',
    textAlign: 'center',
  };
  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{id || 'Nodo'}</div>
      {fotoUrl && (
        <img src={fotoUrl} alt="Foto" loading="lazy" style={{ maxHeight: '80px', borderRadius: '4px', objectFit: 'cover', marginBottom: '4px' }} />
      )}
      {tipo && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{tipo}</div>}
      {genero && especie && (
        <div>{genero} {especie} · {cepa}</div>
      )}
      {status && (
        <div style={{ background: '#64748b', color: 'white', display: 'inline-block', padding: '2px 6px', borderRadius: '12px', marginTop: '4px', fontSize: '10px' }}>{status}</div>
      )}
    </div>
  );
}

