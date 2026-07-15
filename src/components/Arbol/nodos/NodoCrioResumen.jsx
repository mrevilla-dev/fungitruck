import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ICONOS_NODO } from '../../../utils/arbolConstants';

export default function NodoCrioResumen({ data }) {
  const { total, activos, onVerDetalle } = data;
  const icono = ICONOS_NODO['criovial'];

  return (
    <div 
      style={{
        background: '#1e293b',
        border: '1px solid #06b6d4', // Cyan
        borderRadius: '8px',
        padding: '10px',
        color: '#f8fafc',
        width: '180px',
        fontSize: '12px',
        cursor: 'pointer',
        textAlign: 'center',
      }}
      onClick={() => onVerDetalle?.(data)}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8' }} />
      
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px', color: '#22d3ee' }}>
        {icono} CRIOBANCO
      </div>
      
      <div style={{ color: '#cbd5e1' }}>
        {total} crioviales<br/>
        <span style={{ color: activos > 0 ? '#4ade80' : '#94a3b8' }}>{activos} activos</span>
      </div>
      
      <div style={{ marginTop: '8px', color: '#38bdf8', fontSize: '11px' }}>
        Ver en criobanco →
      </div>
    </div>
  );
}
