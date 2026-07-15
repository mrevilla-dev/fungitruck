import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ICONOS_NODO } from '../../../utils/arbolConstants';

export default function NodoCosecha({ data }) {
  const { id, fecha, pesoFrescoG, ebOleada, ebAcumulada, numeroOleada, onVerDetalle } = data;
  const icono = ICONOS_NODO['cosecha'];

  return (
    <div 
      style={{
        background: '#1e293b',
        border: '1px solid #22c55e', // Verde
        borderRadius: '8px',
        padding: '10px',
        color: '#f8fafc',
        width: '180px',
        fontSize: '12px',
        cursor: 'pointer',
      }}
      onClick={() => onVerDetalle?.(data)}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8' }} />
      
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px', color: '#4ade80' }}>
        {icono} COSECHA #{numeroOleada}
      </div>
      
      <div style={{ color: '#cbd5e1' }}>
        <div>📅 {fecha}</div>
        <div style={{ marginTop: '4px' }}>Peso: {pesoFrescoG}g</div>
        {ebOleada !== null && <div>EB: {ebOleada}%</div>}
      </div>
    </div>
  );
}
