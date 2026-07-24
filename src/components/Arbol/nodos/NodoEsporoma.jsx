import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ICONOS_NODO, getDriveEmbedUrl } from '../../../utils/arbolConstants';

export default function NodoEsporoma({ data }) {
  const { id, genero, especie, cepa, origen, fecha, fotoUrl, onRecentrar, onVerDetalle } = data;
  const icono = ICONOS_NODO['esporoma'];

  return (
    <div 
      style={{
        background: '#1e293b',
        border: '2px solid #8b5cf6', // Violeta
        borderRadius: '8px',
        padding: '10px',
        color: '#f8fafc',
        width: '220px',
        fontSize: '12px',
        boxShadow: '0 0 10px rgba(139, 92, 246, 0.4)',
        cursor: 'pointer',
      }}
      onClick={() => onVerDetalle?.(data)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{icono} ESPOROMA</span>
        <span style={{ cursor: 'default', fontSize: '14px', opacity: 0.3 }} title="Recentrado desde esporoma (próximamente)">🎯</span>
      </div>
      
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
        {genero} {especie} · {cepa}
      </div>
      
      <div style={{ color: '#cbd5e1', marginBottom: '8px' }}>
        {origen} · {fecha}
      </div>

      {getDriveEmbedUrl(fotoUrl) && (
        <div style={{ textAlign: 'center' }}>
          <img src={getDriveEmbedUrl(fotoUrl)} alt="Esporoma" loading="lazy" style={{ maxHeight: '60px', width: '100%', borderRadius: '4px', objectFit: 'cover' }} />
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: '#94a3b8' }} />
    </div>
  );
}
