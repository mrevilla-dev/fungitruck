import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

import BatchEditModal from '../components/BatchEditModal';
import RegistroInsumoModal from '../components/RegistroInsumoModal';
import NuevoMedioModal from '../components/NuevoMedioModal';
import EditInsumoModal from '../components/EditInsumoModal';
import PrintLabelsModal from '../components/PrintLabelsModal';
import CultivosTable from '../components/CultivosTable';
import NuevoCultivoModal from '../components/NuevoCultivoModal';
import AuditInsumoModal from '../components/AuditInsumoModal';
import AuditMedioModal from '../components/AuditMedioModal';
import RecipeFormModal from '../components/RecipeFormModal';
import EditLoteModal from '../components/EditLoteModal';


// --- Mini modal de confirmación (evita window.confirm bloqueado) ---
const ConfirmModal = ({ message, onConfirm, onCancel }) => (
  <div className="modal-overlay" style={{ zIndex: 4000 }}>
    <div className="modal-box animate-fade-in" style={{ maxWidth: '400px', textAlign: 'center' }}>
      <p style={{ margin: '1rem 0 1.5rem', fontSize: '0.95rem' }}>{message}</p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button className="btn btn-outline" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-danger" onClick={onConfirm}>Sí, eliminar</button>
      </div>
    </div>
  </div>
);

// --- Sub-componente: Tabla de Insumos Base ---
const InsumosTable = ({ insumos, lotes, salas, onRegistrarCompra, onEdit, onEditLote, onAudit, onPrintBatch, onDeleteLote, onDeleteInsumo }) => {
  const [expandedInsumos, setExpandedInsumos] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null); // { message, onConfirm }

  const toggleExpand = (id) => {
    setExpandedInsumos(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getSortedLotes = (insumoId) => {
    return lotes
      .filter(l => l.insumoId === insumoId)
      .sort((a, b) => {
        const order = { 'Activo': 0, 'Vencido': 1, 'Agotado': 2, 'Descartado': 3 };
        const stateA = a.estado_apertura || 'Activo';
        const stateB = b.estado_apertura || 'Activo';
        if (order[stateA] !== order[stateB]) return order[stateA] - order[stateB];
        return b.createdAt?.seconds - a.createdAt?.seconds; // Más nuevos primero dentro del mismo estado
      });
  };

  if (insumos.length === 0) {
    return (
      <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
        <h3>No hay insumos cargados</h3>
        <button className="btn btn-primary" style={{ width: 'auto', marginTop: '1rem' }} onClick={onRegistrarCompra}>
          Registrar Primer Insumo
        </button>
      </div>
    );
  }

  return (
    <React.Fragment>
    <div className="inventory-list animate-fade-in">
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
        <span>Insumo / Ubicación</span>
        <span>Stock Actual</span>
        <span>Estado</span>
        <span>Costo Prom.</span>
        <span></span>
      </div>
      {insumos.map(insumo => {
        const isLowStock = insumo.stock_total_base <= insumo.stock_minimo_base;
        const stockVisible = (insumo.stock_total_base / (insumo.factor_display || 1)).toFixed(1);
        
        return (
          <React.Fragment key={insumo.id}>
            <div className="card" style={{ 
              padding: '1.25rem', 
              marginBottom: '0.75rem', 
              display: 'grid', 
              gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', 
              alignItems: 'center',
              borderLeft: `4px solid ${isLowStock ? 'var(--danger-color)' : 'var(--accent-color)'}`
            }}>
              <div>
                <strong style={{ display: 'block' }}>{insumo.nombre || <span style={{color: 'var(--danger-color)'}}>[SIN NOMBRE]</span>}</strong>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="sala-tipo" style={{ fontSize: '0.65rem' }}>{insumo.categoria}</span>
                  {insumo.tipo_uso && (
                    <span style={{ 
                      fontSize: '0.65rem', 
                      padding: '1px 5px', 
                      borderRadius: '4px',
                      background: insumo.tipo_uso === 'descartable' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: insumo.tipo_uso === 'descartable' ? '#ef4444' : '#3b82f6',
                      fontWeight: 600
                    }}>
                      {insumo.tipo_uso === 'descartable' ? '♻️ Descartable' : '🔄 Reutilizable'}
                    </span>
                  )}
                </div>
                
                {insumo.categoria === 'Equipamiento' && insumo.equipamiento && (() => {
                  const amort = (Number(insumo.equipamiento.valor_compra) - Number(insumo.equipamiento.valor_residual)) / (Number(insumo.equipamiento.vida_util_anios) * 12);
                  return (
                    <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 'bold' }}>
                      💰 Amort: ${amort > 0 ? amort.toFixed(2) : '0'} /mes
                    </div>
                  );
                })()}

                {insumo.categoria === 'Reutilizables' && insumo.reutilizable && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--primary-color)' }}>
                    🔄 {insumo.reutilizable.tipo_contenedor} ({insumo.reutilizable.capacidad_ml}ml)
                  </div>
                )}

                {insumo.categoria === 'Bioseguridad' && insumo.bioseguridad && (
                  <div style={{ fontSize: '0.65rem', color: '#10b981' }}>
                    🛡️ {insumo.bioseguridad.clasificacion} ({insumo.bioseguridad.concentracion_uso})
                  </div>
                )}

                {insumo.ubicacion && (
                  <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.7 }}>
                    📍 {typeof insumo.ubicacion === 'object' 
                      ? (salas.find(s => s.id === insumo.ubicacion.salaId)?.nombre || insumo.ubicacion.salaId) + (insumo.ubicacion.detalle ? ` - ${insumo.ubicacion.detalle}` : '')
                      : insumo.ubicacion}
                  </span>
                )}
                <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>ID: {insumo.id}</span>
              </div>
              <div><strong>{stockVisible} {insumo.unidad_display || insumo.unidad_base}</strong></div>
              <div>{isLowStock ? '⚠️ BAJO' : '✔️ OK'}</div>
              <div>${insumo.metadata?.costo_promedio_base?.toFixed(2) || '0.00'}</div>
              <div style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-icon" onClick={() => onPrintBatch({
                  id: insumo.id,
                  lote_interno: insumo.id.slice(-4),
                  nombre_insumo: insumo.nombre,
                  fecha_ingreso: new Date().toISOString().split('T')[0]
                })} title="Imprimir Etiqueta General">🖨️</button>
                <button className="btn-icon" onClick={() => onEdit(insumo)} title="Editar Maestro">✏️</button>
                <button className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => setConfirmAction({ message: `¿Eliminar "${insumo.nombre}" y todos sus lotes? Esta acción es irreversible.`, onConfirm: () => { onDeleteInsumo(insumo); setConfirmAction(null); } })} title="Eliminar Insumo Completo">🗑️</button>
                <button className="btn-icon" onClick={() => toggleExpand(insumo.id)}>
                  {expandedInsumos.includes(insumo.id) ? '▲' : '▼'}
                </button>
              </div>

            </div>
            
            {/* Lotes individuales (Acordeón) */}
            {expandedInsumos.includes(insumo.id) && (
              <div className="animate-fade-in" style={{ marginLeft: '2rem', marginBottom: '1.5rem', display: 'grid', gap: '0.5rem' }}>
                {getSortedLotes(insumo.id).map(lote => {
                  const stockVisibleLote = (lote.cantidad_base_actual / (insumo.factor_display || 1)).toFixed(1);
                  const isDescartado = lote.estado_apertura === 'Descartado';
                  
                  return (
                    <div key={lote.id} className="card" style={{ 
                      padding: '0.75rem 1rem', 
                      fontSize: '0.85rem', 
                      display: 'grid', 
                      gridTemplateColumns: '1.5fr 1fr 1fr 1fr', 
                      alignItems: 'center',
                      opacity: isDescartado ? 0.5 : 1,
                      background: lote.estado_apertura === 'Contaminado' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.02)',
                      border: lote.estado_apertura === 'Abierto' ? '1px solid var(--primary-color)' : '1px solid transparent'
                    }}>
                      <div>
                        <strong>{lote.lote_interno}</strong> 
                        <span style={{ fontSize: '0.7rem' }}> ({lote.proveedor})</span>
                        {lote.ubicacion && (
                          <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.7 }}>
                            📍 {typeof lote.ubicacion === 'object' 
                              ? (salas.find(s => s.id === lote.ubicacion.salaId)?.nombre || lote.ubicacion.salaId) + (lote.ubicacion.detalle ? ` - ${lote.ubicacion.detalle}` : '')
                              : lote.ubicacion}
                          </span>
                        )}
                        {isDescartado && <span style={{ color: 'var(--danger-color)', marginLeft: '0.5rem', fontSize: '0.6rem' }}>[DESCARTADO]</span>}
                      </div>
                      <div>
                        <strong>{stockVisibleLote} {insumo.unidad_display}</strong> 
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                          ({lote.cantidad_base_actual.toFixed(0)} {insumo.unidad_base} naturales)
                        </span>

                      </div>
                      <div>{lote.estado_apertura || 'Activo'}</div>
                      <div style={{ textAlign: 'right', display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" style={{ fontSize: '0.8rem' }} title="Reimprimir Etiqueta" onClick={() => onPrintBatch(lote)}>🖨️</button>
                        <button className="btn-icon" style={{ fontSize: '0.8rem' }} title="Editar Lote" onClick={() => onEditLote(lote)}>✏️</button>
                        <button className="btn-icon" style={{ fontSize: '0.8rem' }} title="Auditar" onClick={() => onAudit(lote)}>🔍</button>
                        <button className="btn-icon" style={{ fontSize: '0.8rem', color: 'var(--danger-color)' }} title="Eliminar/Descartar" onClick={() => setConfirmAction({ message: `¿Eliminar el lote "${lote.lote_interno}"? Esta acción no se puede deshacer.`, onConfirm: () => { onDeleteLote(lote); setConfirmAction(null); } })}>🗑️</button>
                      </div>

                    </div>
                  );
                })}
                {getSortedLotes(insumo.id).length === 0 && <p style={{ fontSize: '0.8rem', textAlign: 'center', opacity: 0.5 }}>No hay lotes registrados.</p>}
              </div>
            )}


          </React.Fragment>
        );
      })}
    </div>
    {confirmAction && (
      <ConfirmModal
        message={confirmAction.message}
        onConfirm={confirmAction.onConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    )}
    </React.Fragment>
  );
};

// --- Sub-componente: Tabla de Recetas (Pilar 4) ---
const RecetasTable = ({ recetas, insumos, onEdit, onDuplicate, onDelete, onArchive, onAdd, searchQuery, categoryFilter, statusFilter, setConfirmAction }) => {
  const filteredRecetas = recetas.filter(r => {
    const matchesSearch = r.nombre?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'todas' || r.categoria === categoryFilter;
    const matchesStatus = statusFilter === 'todas' || (r.estado || 'activa') === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const calculateRecipeCost = (ingredients) => {
    if (!ingredients || ingredients.length === 0) return 0;
    return ingredients.reduce((acc, ing) => {
      const insumo = insumos.find(i => i.id === ing.insumoId);
      const costoUnidad = insumo?.metadata?.costo_promedio_base || 0;
      return acc + (costoUnidad * (ing.cantidad || 0));
    }, 0);
  };

  if (recetas.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
      <p>No hay recetas cargadas.</p>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: '1rem' }} onClick={onAdd}>Crear Primera Receta</button>
    </div>
  );

  return (
    <div className="inventory-list animate-fade-in">
      {filteredRecetas.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>No se encontraron recetas con estos filtros.</p>
      ) : (
        filteredRecetas.map(r => {
          const totalCost = calculateRecipeCost(r.ingredientes);
          const isArchived = r.estado === 'archivada';
          
          return (
            <div key={r.id} className="card recipe-grid" style={{ 
              padding: '1rem', 
              marginBottom: '0.5rem', 
              opacity: isArchived ? 0.6 : 1,
              borderLeft: isArchived ? '4px solid #64748b' : '4px solid var(--primary-color)'
            }}>
              <div>
                <strong>{r.nombre}</strong>
                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--primary-color)' }}>{r.categoria}</span>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  {r.tiempo_max_heladera_dias && (
                    <span style={{ display: 'inline-block', fontSize: '0.68rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ❄️ Heladera: {r.tiempo_max_heladera_dias} días
                    </span>
                  )}
                  {r.tiempo_estimado_confeccion && (
                    <span style={{ display: 'inline-block', fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ⏱️ {r.tiempo_estimado_confeccion}
                    </span>
                  )}
                </div>
                {r.descripcion && <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8, marginTop: '0.3rem', fontStyle: 'italic' }}>{r.descripcion}</span>}
              </div>
              <div style={{ fontSize: '0.9rem' }}>{r.rendimiento_teorico?.cantidad} {r.rendimiento_teorico?.unidad}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                ${totalCost > 0 ? totalCost.toFixed(2) : '0.00'}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {r.ingredientes?.length || 0} ing.
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-icon" onClick={() => onEdit(r)} title="Editar Receta">✏️</button>
                <button className="btn-icon" onClick={() => onDuplicate(r)} title="Duplicar">🐑</button>
                {!isArchived ? (
                  <button className="btn-icon" onClick={() => onArchive(r, 'archivada')} title="Archivar">📦</button>
                ) : (
                  <button className="btn-icon" onClick={() => onArchive(r, 'activa')} title="Reactivar">🔓</button>
                )}
                <button className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => setConfirmAction({ 
                  message: `¿ELIMINAR DEFINITIVAMENTE "${r.nombre}"? Esta acción no se puede deshacer.`, 
                  onConfirm: () => onDelete(r) 
                })} title="Eliminar Definitivamente">🗑️</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

function InventoryPage() {
  const [activeTab, setActiveTab] = useState('insumos');
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState([]);
  const [insumosLotes, setInsumosLotes] = useState([]);
  const [medios, setMedios] = useState([]);
  const [cultivos, setCultivos] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [salas, setSalas] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: 'todas', sala: 'todas' });
  const [insumoFilters, setInsumoFilters] = useState({ search: '', categoria: 'todas', salaId: 'todas', tipoUso: 'todos' });
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeCategory, setRecipeCategory] = useState('todas');
  const [recipeStatus, setRecipeStatus] = useState('activa');
  const [mediosSearch, setMediosSearch] = useState('');

  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [showNuevoMedioModal, setShowNuevoMedioModal] = useState(false);
  const [showNuevoCultivoModal, setShowNuevoCultivoModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  
  const [editingInsumo, setEditingInsumo] = useState(null);
  const [editingLote, setEditingLote] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [auditingLote, setAuditingLote] = useState(null);
  const [auditingMedio, setAuditingMedio] = useState(null);
  const [recipeToClone, setRecipeToClone] = useState(null);
  const [selectedMedioForPrint, setSelectedMedioForPrint] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);


  useEffect(() => {
    const unsubBatches = onSnapshot(query(collection(db, "batches"), orderBy("createdAt", "desc")), snap => {
      setCultivos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    const unsubInsumos = onSnapshot(query(collection(db, "insumos_base"), orderBy("nombre", "asc")), snap => setInsumos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubLotes = onSnapshot(query(collection(db, "insumos_lotes"), orderBy("createdAt", "desc")), snap => setInsumosLotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubMedios = onSnapshot(query(collection(db, "medios_preparados"), orderBy("createdAt", "desc")), snap => setMedios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubRecetas = onSnapshot(query(collection(db, "recetas"), orderBy("nombre", "asc")), snap => setRecetas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubSalas = onSnapshot(collection(db, "salas"), snap => setSalas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

    return () => {
      unsubBatches(); unsubInsumos(); unsubLotes(); unsubMedios(); unsubRecetas(); unsubSalas();
    };
  }, []);

  const handlePrintBatch = (batch) => { setSelectedMedioForPrint([batch]); setShowPrintModal(true); };

  const handleDeleteLote = async (lote) => {
    try {
      // 1. Buscamos el maestro para restarle el stock
      const insumoRef = doc(db, "insumos_base", lote.insumoId);
      const insumoDoc = await getDoc(insumoRef);
      
      if (insumoDoc.exists()) {
        const currentStock = insumoDoc.data().stock_total_base || 0;
        await updateDoc(insumoRef, {
          stock_total_base: Math.max(0, currentStock - lote.cantidad_base_actual)
        });
      }

      await deleteDoc(doc(db, "insumos_lotes", lote.id));
      alert("✅ Lote eliminado y stock maestro actualizado.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar lote");
    }
  };

  const handleDeleteInsumo = async (insumo) => {
    try {
      setLoading(true);
      // Eliminar maestro
      await deleteDoc(doc(db, "insumos_base", insumo.id));
      
      // Eliminar lotes asociados
      const asociados = insumosLotes.filter(l => l.insumoId === insumo.id);
      for (const lote of asociados) {
        await deleteDoc(doc(db, "insumos_lotes", lote.id));
      }
      
      alert("✅ Insumo y lotes asociados eliminados correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar insumo completo");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipe = async (recipe) => {
    try {
      await deleteDoc(doc(db, "recetas", recipe.id));
      alert("✅ Receta eliminada correctamente.");
      setConfirmAction(null);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar receta");
    }
  };


  const handleArchiveRecipe = async (recipe, newStatus) => {
    try {
      await updateDoc(doc(db, "recetas", recipe.id), { estado: newStatus });
    } catch (err) {
      console.error(err);
      alert("Error al cambiar estado de la receta");
    }
  };


  return (
    <div className="inventory-page container animate-fade-in">

      <div className="sticky-header">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Inventario Central</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {activeTab === 'insumos' && <button className="btn btn-primary" onClick={() => setShowRegistroModal(true)}>➕ Registrar Compra</button>}
            {activeTab === 'cultivos' && <button className="btn btn-primary" onClick={() => setShowNuevoCultivoModal(true)}>➕ Nueva Inoculación</button>}
            {activeTab === 'recetas' && <button className="btn btn-primary" onClick={() => setShowRecipeModal(true)}>➕ Nueva Receta</button>}
          </div>
        </header>

        <nav className="tab-container" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '14px' }}>
          {['insumos', 'medios', 'cultivos', 'recetas'].map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', border: 'none', borderRadius: '10px', background: activeTab === tab ? 'var(--primary-color)' : 'transparent', color: activeTab === tab ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem' }} onClick={() => setActiveTab(tab)}>
              {tab.toUpperCase()}
            </button>
          ))}
        </nav>

        {/* Filtros para Insumos */}
        {activeTab === 'insumos' && (
          <div className="filters-bar animate-fade-in" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="🔍 Buscar por nombre o ID (ej: 1967)..." 
                value={insumoFilters.search} 
                onChange={e => setInsumoFilters({...insumoFilters, search: e.target.value})} 
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <select 
                className="form-control" 
                value={insumoFilters.categoria} 
                onChange={e => setInsumoFilters({...insumoFilters, categoria: e.target.value})}
              >
                <option value="todas">Todas las Categorías</option>
                <option value="Medios y reactivos">Medios y reactivos</option>
                <option value="Sustratos y granos">Sustratos y granos</option>
                <option value="Descartables">Descartables</option>
                <option value="Reutilizables">Reutilizables</option>
                <option value="Bioseguridad">Bioseguridad</option>
                <option value="Equipamiento">Equipamiento</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <select 
                className="form-control" 
                value={insumoFilters.tipoUso} 
                onChange={e => setInsumoFilters({...insumoFilters, tipoUso: e.target.value})}
              >
                <option value="todos">Todos los Usos</option>
                <option value="descartable">♻️ Descartable</option>
                <option value="reutilizable">🔄 Reutilizable</option>
                <option value="sin_clasificar">Sin clasificar</option>
              </select>
            </div>
          </div>
        )}

        {/* Filtros para Recetas */}
        {activeTab === 'recetas' && (
          <div className="filters-bar animate-fade-in" style={{ display: 'flex', gap: '1rem' }}>
            <input 
              type="text" 
              className="form-control" 
              style={{ flex: 2 }}
              placeholder="🔍 Buscar receta..." 
              value={recipeSearch} 
              onChange={e => setRecipeSearch(e.target.value)} 
            />
            <select className="form-control" style={{ flex: 1 }} value={recipeCategory} onChange={e => setRecipeCategory(e.target.value)}>
              <option value="todas">Categorías</option>
              <option value="Agar">Agar</option>
              <option value="Grano">Grano</option>
              <option value="Sustrato">Sustrato</option>
            </select>
            <select className="form-control" style={{ flex: 1 }} value={recipeStatus} onChange={e => setRecipeStatus(e.target.value)}>
              <option value="activa">Activas</option>
              <option value="archivada">Archivadas</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        )}
      </div>

      <main>
        {activeTab === 'insumos' && (
          <InsumosTable 
            insumos={insumos.filter(i => {
              const matchesSearch = i.nombre?.toLowerCase().includes(insumoFilters.search.toLowerCase()) || 
                                   i.id?.toLowerCase().includes(insumoFilters.search.toLowerCase());
              const matchesCat = insumoFilters.categoria === 'todas' || i.categoria === insumoFilters.categoria;
              
              // El filtro de sala ahora busca si el maestro O cualquiera de sus lotes está en esa sala
              const matchesSala = insumoFilters.salaId === 'todas' || 
                                   i.ubicacion?.salaId === insumoFilters.salaId || 
                                   insumosLotes.some(l => l.insumoId === i.id && l.ubicacion?.salaId === insumoFilters.salaId);
              const matchesTipo = insumoFilters.tipoUso === 'todos' || 
                                   (insumoFilters.tipoUso === 'sin_clasificar' && !i.tipo_uso) || 
                                   i.tipo_uso === insumoFilters.tipoUso;
              
              return matchesSearch && matchesCat && matchesSala && matchesTipo;
            })} 
            lotes={insumosLotes} 
            salas={salas}
            onRegistrarCompra={() => setShowRegistroModal(true)} 
            onEdit={setEditingInsumo} 
            onEditLote={setEditingLote}
            onAudit={setAuditingLote} 
            onPrintBatch={(lote) => {
              // Mapeo robusto para que PrintLabelsModal siempre tenga los datos necesarios
              setSelectedMedioForPrint([{
                id: lote.lote_interno || lote.id,
                alias: lote.lote_interno,
                nombre_receta: lote.nombre_insumo || lote.nombre,
                nombre_insumo: lote.nombre_insumo,
                proveedor: lote.proveedor,
                fecha: lote.fecha_ingreso || lote.createdAt?.toDate()?.toISOString()?.split('T')[0],
                trazabilidad: { fecha_preparacion: lote.fecha_ingreso || '' },
                tipo: 'LOTE_INSUMO'
              }]);
              setShowPrintModal(true);
            }}
            onDeleteLote={handleDeleteLote}
            onDeleteInsumo={handleDeleteInsumo}
          />

        )}

        {activeTab === 'medios' && (
          <div className="animate-fade-in">
            <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input 
                type="text" 
                className="form-control" 
                style={{ flex: 1 }}
                placeholder="🔍 Buscar medio (nombre, alias, lote)..." 
                value={mediosSearch} 
                onChange={e => setMediosSearch(e.target.value)} 
              />
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowNuevoMedioModal(true)}>➕ Preparar Medio</button>
            </div>
            
            {medios.filter(m => {
              if (!mediosSearch) return true;
              const term = mediosSearch.toLowerCase();
              return (m.alias?.toLowerCase().includes(term) || m.nombre_receta?.toLowerCase().includes(term) || m.id?.toLowerCase().includes(term) || (m.fecha_preparacion && m.fecha_preparacion.toLowerCase().includes(term)));
            }).map(m => (
              <div key={m.id} className="card" style={{ padding: '1rem', marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', alignItems: 'center' }}>
                <div><strong>{m.alias}</strong></div>
                <div>{m.nombre_receta}</div>
                <div>{m.stock_bulk.cantidad_actual} {m.stock_bulk.unidad}</div>
                <div>{m.estado}</div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn-icon" onClick={() => { setSelectedMedioForPrint([m]); setShowPrintModal(true); }}>🖨️</button>
                  <button className="btn-icon" title="Auditoría de Lote" onClick={() => setAuditingMedio(m)}>🔍</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'cultivos' && <CultivosTable cultivos={cultivos} filters={filters} setFilters={setFilters} onEdit={setEditingBatch} onPrint={handlePrintBatch} />}
        {activeTab === 'recetas' && (
          <RecetasTable 
            recetas={recetas} 
            insumos={insumos}
            searchQuery={recipeSearch}
            categoryFilter={recipeCategory}
            statusFilter={recipeStatus}
            onEdit={r => { setRecipeToClone(null); setEditingRecipe(r); setShowRecipeModal(true); }}
            onDuplicate={r => { setEditingRecipe(null); setRecipeToClone(r); setShowRecipeModal(true); }} 
            onDelete={handleDeleteRecipe}
            onArchive={handleArchiveRecipe}
            onAdd={() => { setEditingRecipe(null); setRecipeToClone(null); setShowRecipeModal(true); }} 
            setConfirmAction={setConfirmAction}
          />
        )}
      </main>

      {showRegistroModal && <RegistroInsumoModal onClose={() => setShowRegistroModal(false)} onSaved={() => setShowRegistroModal(false)} />}
      {showNuevoMedioModal && <NuevoMedioModal onClose={() => setShowNuevoMedioModal(false)} onSaved={() => setShowNuevoMedioModal(false)} />}
      {showNuevoCultivoModal && <NuevoCultivoModal onClose={() => setShowNuevoCultivoModal(false)} onSaved={() => setShowNuevoCultivoModal(false)} />}
      {showRecipeModal && (
        <RecipeFormModal 
          recipeToClone={recipeToClone || editingRecipe} 
          isEdit={!!editingRecipe}
          onClose={() => { setShowRecipeModal(false); setRecipeToClone(null); setEditingRecipe(null); }} 
          onSaved={() => { setShowRecipeModal(false); setRecipeToClone(null); setEditingRecipe(null); }} 
        />
      )}
      {editingBatch && (
        <BatchEditModal 
          batch={editingBatch} 
          onClose={() => setEditingBatch(null)} 
          onSaved={() => setEditingBatch(null)} 
          onFilterBatch={(groupId) => {
            setFilters({ ...filters, search: groupId });
            setActiveTab('cultivos');
            setEditingBatch(null);
          }}
        />
      )}
      {editingInsumo && <EditInsumoModal insumo={editingInsumo} onClose={() => setEditingInsumo(null)} onSaved={() => setEditingInsumo(null)} />}
      {editingLote && <EditLoteModal lote={editingLote} onClose={() => setEditingLote(null)} onSaved={() => setEditingLote(null)} />}
      {auditingLote && <AuditInsumoModal lote={auditingLote} onClose={() => setAuditingLote(null)} />}
      {auditingMedio && <AuditMedioModal medio={auditingMedio} onClose={() => setAuditingMedio(null)} />}
      {showPrintModal && selectedMedioForPrint && <PrintLabelsModal batches={selectedMedioForPrint} onClose={() => setShowPrintModal(false)} />}
      
      {confirmAction && (
        <ConfirmModal 
          message={confirmAction.message} 
          onConfirm={confirmAction.onConfirm} 
          onCancel={() => setConfirmAction(null)} 
        />
      )}

    </div>
  );
}

export default InventoryPage;
