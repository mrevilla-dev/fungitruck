import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export default function NodoColapso({ data }) {
  const { cantidad, hijosOcultos, onExpandir } = data;
  const [expandido, setExpandido] = useState(false);

  const handleToggle = (e) => {
    e.stopPropagation();
    setExpandido(!expandido);
    if (onExpandir) {
      onExpandir(!expandido, hijosOcultos);
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
      onClick={handleToggle}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      
      <div style={{ fontWeight: 'bold' }}>
        {expandido ? '[ colapsar ↑ ]' : `[ +${cantidad} más → ]`}
      </div>
    </div>
  );
}
