import { useState } from 'react';
import { db } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

const CultivosTable = ({ cultivos, medios, filters, setFilters, onEdit, onPrint, onCriopreservar, onInspect }) => {
  const filteredCultivos = cultivos.filter(c => {
    const matchesSearch = (c.id?.toLowerCase() || '').includes((filters.search ?? '').toLowerCase()) || 
                          (c.especie?.toLowerCase() || '').includes((filters.search ?? '').toLowerCase()) ||
                          (c.cepa?.toLowerCase() || '').includes((filters.search ?? '').toLowerCase());
    const matchesStatus = filters.status === 'todas' || c.status === filters.status;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (cultivo) => {
    if (!window.confirm(`⚠️ ¿Estás seguro de eliminar el cultivo ${cultivo.id}? Esta acción es irreversible.`)) return;
    try {
      await deleteDoc(doc(db, "batches", cultivo.id));
      toast.success('Cultivo eliminado.');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Planificado': return '#94a3b8';
      case 'Inoculado': return '#3b82f6';
      case 'Incubación': return 'var(--primary-color)';
      case 'Fructificación': return '#8b5cf6';
      case 'Cosechado': return 'var(--accent-color)';
      case 'Contaminado': return 'var(--danger-color)';
      default: return '#666';
    }
  };

  return (
    <div className="inventory-list animate-fade-in">
       {/* Filtros */}
       <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label className="form-label">Buscar Unidad (ID, Cepa o Especie)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej: CL-2024..." 
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
            />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-control" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="todas">Todos los estados</option>
              <option value="Planificado">Planificado</option>
              <option value="Inoculado">Inoculado</option>
              <option value="Incubación">Incubación</option>
              <option value="Fructificación">Fructificación</option>
              <option value="Cosechado">Cosechado</option>
              <option value="Contaminado">Contaminado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cabecera de Tabla */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
        <span>ID / Especie</span>
        <span>Medio / Soporte</span>
        <span>Estado</span>
        <span>Fecha</span>
        <span></span>
      </div>

      {filteredCultivos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No se encontraron cultivos.</p>
        </div>
      ) : 
        filteredCultivos.map((cultivo) => (
          <div
            key={cultivo.id}
            className="card"
            style={{
              padding: "1.25rem",
              marginBottom: "0.5rem",
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.5fr",
              alignItems: "center",
              borderLeft: `4px solid ${getStatusColor(cultivo.status)}`,
              background: 'var(--surface-color)'
            }}
          >
            <div>
              <strong style={{ display: "block", fontSize: "1rem" }}>
                {cultivo.genero} {cultivo.especie} {cultivo.cepa && `(${cultivo.cepa})`}
              </strong>
              <span style={{ fontSize: "0.8rem", color: "var(--primary-color)", fontFamily: "monospace", display: "block" }}>
                ID: {cultivo.id} {cultivo.experimento_id && <span title={`Exp: ${cultivo.experimento_id}`}>🧪</span>}
              </span>
              {cultivo.batch_origen_id && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace", display: "block" }}>
                  🔙 Origen: {cultivo.batch_origen_id}
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.85rem", display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-color)' }}>
                {cultivo.soporte || cultivo.recipiente || 'Sin soporte'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {cultivo.medioPrepId ? (medios?.find(m => m.id === cultivo.medioPrepId)?.alias || medios?.find(m => m.id === cultivo.medioPrepId)?.nombre_receta || cultivo.medioPrepId) : 'Sin medio registrado'}
              </span>
            </div>
            <div>
              <span style={{ 
                fontSize: "0.7rem", 
                fontWeight: "bold", 
                padding: "2px 8px", 
                borderRadius: "12px", 
                background: `${getStatusColor(cultivo.status)}20`,
                color: getStatusColor(cultivo.status)
              }}>
                {(cultivo.status || 'Sin estado').toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {cultivo.fecha_inoculacion}
              {cultivo.numero_transferencia != null && (
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#8b5cf6', fontWeight: '700', marginTop: '2px' }}>
                  🔁 T{cultivo.numero_transferencia}
                </span>
              )}
            </div>
            <div style={{ textAlign: "right", display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {onPrint && <button className="btn-icon" title="Imprimir" onClick={() => onPrint(cultivo)}>🖨️</button>}
              {onInspect && <button className="btn-icon" title="Inspeccionar / Ver seguimiento" style={{ color: '#f59e0b' }} onClick={() => onInspect(cultivo)}>🔍</button>}
              {onCriopreservar && cultivo.destino_criopreservacion === true && (
                <button
                  className="btn-icon"
                  title="Criopreservar"
                  style={{ color: '#3b82f6' }}
                  onClick={() => onCriopreservar(cultivo)}
                >
                  🧊
                </button>
              )}
              <button className="btn-icon" title="Editar / Detalle" onClick={() => onEdit(cultivo)}>✏️</button>
              <button className="btn-icon" title="Eliminar" style={{ color: "var(--danger-color)" }} onClick={() => handleDelete(cultivo)}>🗑️</button>
            </div>
          </div>
        ))
      }
    </div>
  );
};

export default CultivosTable;
