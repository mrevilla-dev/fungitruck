import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function NodoColapso({ data }) {
  const { cantidad, sourceId, onRecentrar } = data;

  const handleClick = (e) => {
    e.stopPropagation();
    if (onRecentrar && sourceId) {
      onRecentrar(sourceId, 'batch');
    }
  };

  return (
    <div 
      style={{
        background: '#334155',
        border: '1px dashed #94a3b8',
        borderRadius: '16px',
        padding: '6px 12px',
        color: '#e2e8f0',
        fontSize: '11px',
        cursor: 'pointer',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      
      <div style={{ fontWeight: 'bold' }}>
        [ Ver grupo ({cantidad}) → ]
      </div>
    </div>
  );
}
