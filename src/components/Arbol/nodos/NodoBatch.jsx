import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ICONOS_NODO, COLORES_ESTADO, getDriveEmbedUrl } from '../../../utils/arbolConstants';

export default function NodoBatch({ data }) {
  const {
    id, status, tipoContenedor, medioPrepNombre, salaDestino, numeroTransferencia,
    fechaInoculacion, fotoUrl, esFoco, onRecentrar, onVerDetalle, genero, especie
  } = data;

  const colorEstado = COLORES_ESTADO[status] || '#9E9E9E';
  const icono = ICONOS_NODO[tipoContenedor] || '🧫';
  const expandido = esFoco;

  const styleBase = {
    background: '#1e293b',
    border: `2px solid ${esFoco ? colorEstado : '#475569'}`,
    borderRadius: '8px',
    padding: '10px',
    color: '#f8fafc',
    width: '220px',
    fontSize: '12px',
    boxShadow: esFoco ? `0 0 10px ${colorEstado}66` : 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  return (
    <div style={styleBase} onClick={() => onVerDetalle?.(data)}>
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '16px' }} title="Tipo Contenedor">{icono}</span>
        {expandido && <span style={{ cursor: 'pointer', fontSize: '14px' }} onClick={(e) => { e.stopPropagation(); onRecentrar?.(id, 'batch'); }} title="Recentrar árbol">🎯</span>}
      </div>
      
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px', wordBreak: 'break-all' }}>{id}</div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ 
          background: colorEstado, 
          color: 'white', 
          padding: '2px 6px', 
          borderRadius: '12px', 
          fontSize: '10px',
          fontWeight: 'bold'
        }}>
          {status}
        </span>
      </div>
      
      {!expandido ? (
        <div style={{ color: '#cbd5e1' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{genero} {especie}</div>
          T{numeroTransferencia} · {medioPrepNombre} <br/>
          📍 {salaDestino}
        </div>
      ) : (
        <>
          <div style={{ borderTop: '1px solid #475569', margin: '8px 0', paddingTop: '8px', color: '#cbd5e1' }}>
            <div>T{numeroTransferencia} · {medioPrepNombre} · {salaDestino}</div>
            <div>📅 {fechaInoculacion}</div>
          </div>
          
          {getDriveEmbedUrl(fotoUrl) && (
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <img src={getDriveEmbedUrl(fotoUrl)} alt="Batch" loading="lazy" style={{ maxHeight: '60px', width: '100%', borderRadius: '4px', objectFit: 'cover' }} />
            </div>
          )}
          
          <div style={{ borderTop: '1px solid #475569', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span title="Contexto Completo">👁️ Ver más</span>
          </div>
        </>
      )}
      
      <Handle type="source" position={Position.Bottom} style={{ background: '#94a3b8' }} />
    </div>
  );
}
