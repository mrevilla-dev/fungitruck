import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc } from 'firebase/firestore';
import BatchEditModal from '../components/BatchEditModal';
import RegistroInsumoModal from '../components/RegistroInsumoModal';
import NuevoMedioModal from '../components/NuevoMedioModal';
import EditInsumoModal from '../components/EditInsumoModal';
import PrintLabelsModal from '../components/PrintLabelsModal';
import CultivosTable from '../components/CultivosTable';
import NuevoCultivoModal from '../components/NuevoCultivoModal';
import AuditInsumoModal from '../components/AuditInsumoModal';
import RecipeFormModal from '../components/RecipeFormModal';

// --- Sub-componente: Tabla de Insumos Base ---
const InsumosTable = ({ insumos, lotes, onRegistrarCompra, onEdit, onAudit }) => {
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
                <strong style={{ display: 'block' }}>{insumo.nombre}</strong>
                <span className="sala-tipo" style={{ fontSize: '0.65rem' }}>{insumo.categoria}</span>
              </div>
              <div><strong>{stockVisible} {insumo.unidad_display || insumo.unidad_base}</strong></div>
              <div>{isLowStock ? '⚠️ BAJO' : '✔️ OK'}</div>
              <div>${insumo.metadata?.costo_promedio_base?.toFixed(2) || '0.00'}</div>
              <div style={{ textAlign: 'right' }}>
                <button className="btn-icon" onClick={() => onEdit(insumo)}>✏️</button>
              </div>
            </div>
            
            {/* Lotes individuales (Pilar 1) */}
            <div style={{ marginLeft: '2rem', marginBottom: '1.5rem', display: 'grid', gap: '0.5rem' }}>
              {lotes.filter(l => l.insumoId === insumo.id).map(lote => (
                <div key={lote.id} className="card" style={{ 
                  padding: '0.75rem 1rem', 
                  fontSize: '0.85rem', 
                  display: 'grid', 
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr', 
                  alignItems: 'center',
                  background: lote.estado_apertura === 'Contaminado' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: lote.estado_apertura === 'Abierto' ? '1px solid var(--primary-color)' : '1px solid transparent'
                }}>
                  <div><strong>{lote.lote_interno}</strong> <span style={{ fontSize: '0.7rem' }}>({lote.proveedor})</span></div>
                  <div>{lote.cantidad_base_actual.toFixed(1)} {lote.unidad_base}</div>
                  <div>{lote.estado_apertura}</div>
                  <div style={{ textAlign: 'right' }}>
                    <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '2px 8px' }} onClick={() => onAudit(lote)}>🔍 Audit</button>
                  </div>
                </div>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// --- Sub-componente: Tabla de Recetas (Pilar 4) ---
const RecetasTable = ({ recetas, onClone, onAdd }) => {
  if (recetas.length === 0) return <div className="card">No hay recetas. <button onClick={onAdd}>Crear</button></div>;
  return (
    <div className="inventory-list animate-fade-in">
      {recetas.map(r => (
        <div key={r.id} className="card" style={{ padding: '1rem', marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr 0.5fr', alignItems: 'center' }}>
          <div><strong>{r.nombre}</strong></div>
          <div>{r.rendimiento_teorico?.cantidad} {r.rendimiento_teorico?.unidad}</div>
          <div style={{ fontSize: '0.8rem' }}>{r.ingredientes?.map(i => i.nombre || i.insumoId).join(', ')}</div>
          <div style={{ textAlign: 'right' }}>
            <button className="btn-icon" onClick={() => onClone(r)}>🐑</button>
          </div>
        </div>
      ))}
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

  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [showNuevoMedioModal, setShowNuevoMedioModal] = useState(false);
  const [showNuevoCultivoModal, setShowNuevoCultivoModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  
  const [editingInsumo, setEditingInsumo] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [auditingLote, setAuditingLote] = useState(null);
  const [recipeToClone, setRecipeToClone] = useState(null);
  const [selectedMedioForPrint, setSelectedMedioForPrint] = useState(null);

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

  return (
    <div className="inventory-page container animate-fade-in">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Inventario Central</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {activeTab === 'insumos' && <button className="btn btn-primary" onClick={() => setShowRegistroModal(true)}>➕ Registrar Compra</button>}
          {activeTab === 'cultivos' && <button className="btn btn-primary" onClick={() => setShowNuevoCultivoModal(true)}>➕ Nueva Inoculación</button>}
          {activeTab === 'recetas' && <button className="btn btn-primary" onClick={() => setShowRecipeModal(true)}>➕ Nueva Receta</button>}
        </div>
      </header>

      <nav className="tab-container" style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '14px' }}>
        {['insumos', 'medios', 'cultivos', 'recetas'].map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', border: 'none', borderRadius: '10px', background: activeTab === tab ? 'var(--primary-color)' : 'transparent', color: activeTab === tab ? 'white' : 'var(--text-secondary)' }} onClick={() => setActiveTab(tab)}>
            {tab.toUpperCase()}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'insumos' && <InsumosTable insumos={insumos} lotes={insumosLotes} onRegistrarCompra={() => setShowRegistroModal(true)} onEdit={setEditingInsumo} onAudit={setAuditingLote} />}
        {activeTab === 'medios' && (
          <div>
            <button className="btn btn-primary" onClick={() => setShowNuevoMedioModal(true)}>➕ Preparar Medio</button>
            {medios.map(m => (
              <div key={m.id} className="card" style={{ padding: '1rem', marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', alignItems: 'center' }}>
                <div><strong>{m.alias}</strong></div>
                <div>{m.nombre_receta}</div>
                <div>{m.stock_bulk.cantidad_actual} {m.stock_bulk.unidad}</div>
                <div>{m.estado}</div>
                <button className="btn-icon" onClick={() => { setSelectedMedioForPrint([m]); setShowPrintModal(true); }}>🖨️</button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'cultivos' && <CultivosTable cultivos={cultivos} filters={filters} setFilters={setFilters} onEdit={setEditingBatch} onPrint={handlePrintBatch} />}
        {activeTab === 'recetas' && <RecetasTable recetas={recetas} onClone={r => { setRecipeToClone(r); setShowRecipeModal(true); }} onAdd={() => setShowRecipeModal(true)} />}
      </main>

      {showRegistroModal && <RegistroInsumoModal onClose={() => setShowRegistroModal(false)} onSaved={() => setShowRegistroModal(false)} />}
      {showNuevoMedioModal && <NuevoMedioModal onClose={() => setShowNuevoMedioModal(false)} onSaved={() => setShowNuevoMedioModal(false)} />}
      {showNuevoCultivoModal && <NuevoCultivoModal onClose={() => setShowNuevoCultivoModal(false)} onSaved={() => setShowNuevoCultivoModal(false)} />}
      {showRecipeModal && <RecipeFormModal recipeToClone={recipeToClone} onClose={() => { setShowRecipeModal(false); setRecipeToClone(null); }} onSaved={() => { setShowRecipeModal(false); setRecipeToClone(null); }} />}
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
      {auditingLote && <AuditInsumoModal lote={auditingLote} onClose={() => setAuditingLote(null)} />}
      {showPrintModal && selectedMedioForPrint && <PrintLabelsModal batches={selectedMedioForPrint} onClose={() => setShowPrintModal(false)} />}
    </div>
  );
}

export default InventoryPage;
