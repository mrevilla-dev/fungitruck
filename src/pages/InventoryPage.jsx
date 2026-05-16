import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc } from 'firebase/firestore';
import BatchEditModal from '../components/BatchEditModal';
import RegistroInsumoModal from '../components/RegistroInsumoModal';
import NuevoMedioModal from '../components/NuevoMedioModal';
import EditInsumoModal from '../components/EditInsumoModal';
import PrintLabelsModal from '../components/PrintLabelsModal';
import CultivosTable from '../components/CultivosTable';
import NuevoCultivoModal from '../components/NuevoCultivoModal';

// --- Sub-componente: Tabla de Insumos Base ---
const InsumosTable = ({ insumos, onRegistrarCompra, onEdit }) => {
  if (insumos.length === 0) {
    return (
      <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
        <h3>No hay insumos cargados</h3>
        <p>Comenzá registrando tu primera compra de materia prima.</p>
        <button className="btn btn-primary" style={{ width: 'auto', marginTop: '1rem' }} onClick={onRegistrarCompra}>
          Registrar Primer Insumo
        </button>
      </div>
    );
  }

  return (
    <div className="inventory-list animate-fade-in">
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
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
          <div key={insumo.id} className="card" style={{ 
            padding: '1.25rem', 
            marginBottom: '0.75rem', 
            display: 'grid', 
            gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', 
            alignItems: 'center',
            borderLeft: `4px solid ${isLowStock ? 'var(--danger-color)' : 'var(--accent-color)'}`,
            background: isLowStock ? 'rgba(239, 68, 68, 0.05)' : 'var(--surface-color)',
            transition: 'transform 0.2s',
            cursor: 'default'
          }}>
            <div>
              <strong style={{ display: 'block', fontSize: '1.1rem' }}>{insumo.nombre}</strong>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                <span className="sala-tipo" style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{insumo.categoria}</span>
                {insumo.ubicacion && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>📍 {typeof insumo.ubicacion === 'object' ? (insumo.ubicacion.detalle || insumo.ubicacion.salaId || 'Ubicación') : insumo.ubicacion}</span>
                )}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLowStock ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                {stockVisible} {insumo.unidad_display || insumo.unidad_base}
              </span>
            </div>
            <div>
              {isLowStock ? (
                <span style={{ color: 'var(--danger-color)', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>⚠️ CRÍTICO</span>
              ) : (
                <span style={{ color: 'var(--accent-color)', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>✔️ OK</span>
              )}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              ${insumo.metadata?.costo_promedio_base ? (insumo.metadata.costo_promedio_base * (insumo.factor_display || 1)).toFixed(2) : '0.00'} / {insumo.unidad_display}
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="btn-icon" style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }} onClick={() => onEdit(insumo)}>✏️</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- Sub-componentes eliminados (ahora externos) ---

// --- Componente Principal ---
function InventoryPage() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    status: 'todas',
    sala: 'todas'
  });
  const [salas, setSalas] = useState([]);
  const [editingBatch, setEditingBatch] = useState(null);
  
  // Tabs State
  const [activeTab, setActiveTab] = useState('insumos'); 
  const [insumos, setInsumos] = useState([]);
  const [medios, setMedios] = useState([]);
  const [cultivos, setCultivos] = useState([]);

  // Modals State
  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [showNuevoMedioModal, setShowNuevoMedioModal] = useState(false);
  const [showNuevoCultivoModal, setShowNuevoCultivoModal] = useState(false);
  const [editingInsumo, setEditingInsumo] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedMedioForPrint, setSelectedMedioForPrint] = useState(null);

  const handleDeleteMedio = async (medio) => {
    if (!window.confirm(`¿Estás seguro de eliminar el medio ${medio.alias}? Esta acción no devolverá los insumos al stock.`)) return;
    try {
      await deleteDoc(doc(db, "medios_preparados", medio.id));
      alert("✅ Medio eliminado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el medio.");
    }
  };

  const handlePrintMedio = (medio) => {
    setSelectedMedioForPrint([medio]);
    setShowPrintModal(true);
  };

  const handleDeleteBatch = async (batch) => {
    if (!window.confirm(`¿Estás seguro de eliminar el cultivo ${batch.id}?`)) return;
    try {
      await deleteDoc(doc(db, "batches", batch.id));
      alert("✅ Cultivo eliminado.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar.");
    }
  };

  const handlePrintBatch = (batch) => {
    // Adapter to match PrintLabelsModal expectations if needed, 
    // but batches usually have the right structure.
    setSelectedMedioForPrint([batch]);
    setShowPrintModal(true);
  };

  useEffect(() => {
    // Suscripción a Cultivos (Nivel 3)
    const qCultivos = query(collection(db, "cultivos"), orderBy("createdAt", "desc"));
    const unsubscribeCultivos = onSnapshot(qCultivos, (snapshot) => {
      setCultivos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Suscripción a Salas
    const qSalas = query(collection(db, "salas"));
    const unsubscribeSalas = onSnapshot(qSalas, (snapshot) => {
      setSalas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Insumos Base
    const qInsumos = query(collection(db, "insumos_base"), orderBy("nombre", "asc"));
    const unsubscribeInsumos = onSnapshot(qInsumos, (snapshot) => {
      setInsumos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Medios Preparados
    const qMedios = query(collection(db, "medios_preparados"), orderBy("createdAt", "desc"));
    const unsubscribeMedios = onSnapshot(qMedios, (snapshot) => {
      setMedios(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeCultivos();
      unsubscribeSalas();
      unsubscribeInsumos();
      unsubscribeMedios();
    };
  }, []);

  return (
    <div className="inventory-page container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px' }}>Inventario Central</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Gestión integral de recursos y trazabilidad</p>
        </div>
        {activeTab === 'insumos' && (
          <button className="btn btn-primary" style={{ width: 'auto', padding: '0.75rem 1.5rem' }} onClick={() => setShowRegistroModal(true)}>
            ➕ Registrar Compra
          </button>
        )}
        {activeTab === 'cultivos' && (
          <button className="btn btn-primary" style={{ width: 'auto', padding: '0.75rem 1.5rem' }} onClick={() => setShowNuevoCultivoModal(true)}>
            ➕ Nueva Inoculación
          </button>
        )}
      </header>

      {/* Navegación por Tabs Estilo Premium */}
      <nav className="tab-container" style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '2rem', 
        background: 'rgba(0,0,0,0.2)', 
        padding: '0.4rem', 
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.05)'
      }}>
        <button 
          className={`tab-btn ${activeTab === 'insumos' ? 'active' : ''}`} 
          style={{ 
            flex: 1, 
            padding: '0.8rem', 
            border: 'none', 
            borderRadius: '10px', 
            cursor: 'pointer', 
            fontWeight: '600',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            background: activeTab === 'insumos' ? 'var(--primary-color)' : 'transparent', 
            color: activeTab === 'insumos' ? 'white' : 'var(--text-secondary)',
            boxShadow: activeTab === 'insumos' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
          }}
          onClick={() => setActiveTab('insumos')}
        >📦 Insumos Base</button>
        
        <button 
          className={`tab-btn ${activeTab === 'medios' ? 'active' : ''}`} 
          style={{ 
            flex: 1, 
            padding: '0.8rem', 
            border: 'none', 
            borderRadius: '10px', 
            cursor: 'pointer', 
            fontWeight: '600',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            background: activeTab === 'medios' ? 'var(--primary-color)' : 'transparent', 
            color: activeTab === 'medios' ? 'white' : 'var(--text-secondary)',
            boxShadow: activeTab === 'medios' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
          }}
          onClick={() => setActiveTab('medios')}
        >🧫 Medios Prep.</button>
        
        <button 
          className={`tab-btn ${activeTab === 'cultivos' ? 'active' : ''}`} 
          style={{ 
            flex: 1, 
            padding: '0.8rem', 
            border: 'none', 
            borderRadius: '10px', 
            cursor: 'pointer', 
            fontWeight: '600',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            background: activeTab === 'cultivos' ? 'var(--primary-color)' : 'transparent', 
            color: activeTab === 'cultivos' ? 'white' : 'var(--text-secondary)',
            boxShadow: activeTab === 'cultivos' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
          }}
          onClick={() => setActiveTab('cultivos')}
        >🌱 Cultivos</button>
      </nav>

      {/* Renderizado Condicional de Vistas */}
      <main className="tab-content">
        {activeTab === 'insumos' && (
          <InsumosTable 
            insumos={insumos} 
            onRegistrarCompra={() => setShowRegistroModal(true)} 
            onEdit={setEditingInsumo}
          />
        )}
        
        {activeTab === 'medios' && (
          <div className="animate-fade-in">
             <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowNuevoMedioModal(true)}>
                ➕ Preparar Nuevo Medio
              </button>
            </div>
            
            {medios.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1.5rem', filter: 'grayscale(0.5)' }}>🧫</div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No hay medios preparados</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                  Comenzá registrando tu primera preparación de agar o grano.
                </p>
              </div>
            ) : (
              <div className="inventory-list">
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  <span>ID / Alias</span>
                  <span>Receta</span>
                  <span>Stock Bulk</span>
                  <span>Estado</span>
                </div>
                {medios.map(medio => (
                  <div key={medio.id} className="card" style={{ 
                    padding: '1.25rem', 
                    marginBottom: '0.75rem', 
                    display: 'grid', 
                    gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr', 
                    alignItems: 'center',
                    borderLeft: `4px solid var(--primary-color)`
                  }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{medio.alias}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{medio.id}</span>
                      {medio.experimentId && (
                        <span style={{ marginLeft: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem' }}>🔬 EXP</span>
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.9rem' }}>{medio.nombre_receta}</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{medio.stock_bulk.cantidad_actual} {medio.stock_bulk.unidad}</strong>
                    </div>
                    <div>
                      <span className="sala-tipo" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>{medio.estado}</span>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="btn-icon" title="Imprimir" onClick={() => handlePrintMedio(medio)}>🖨️</button>
                      <button className="btn-icon" title="Eliminar" style={{ color: 'var(--danger-color)' }} onClick={() => handleDeleteMedio(medio)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cultivos' && (
          <CultivosTable 
            cultivos={cultivos} 
            filters={filters} 
            setFilters={setFilters} 
            onEdit={setEditingBatch} 
            onPrint={handlePrintBatch}
          />
        )}
      </main>

      {/* Modales de Interacción */}
      {showRegistroModal && (
        <RegistroInsumoModal 
          onClose={() => setShowRegistroModal(false)}
          onSaved={() => setShowRegistroModal(false)}
        />
      )}

      {editingBatch && (
        <BatchEditModal 
          batch={editingBatch} 
          onClose={() => setEditingBatch(null)} 
          onSaved={() => setEditingBatch(null)} 
        />
      )}

      {showNuevoMedioModal && (
        <NuevoMedioModal 
          onClose={() => setShowNuevoMedioModal(false)}
          onSaved={() => setShowNuevoMedioModal(false)}
        />
      )}

      {showNuevoCultivoModal && (
        <NuevoCultivoModal 
          onClose={() => setShowNuevoCultivoModal(false)}
          onSaved={() => setShowNuevoCultivoModal(false)}
        />
      )}

      {editingInsumo && (
        <EditInsumoModal 
          insumo={editingInsumo} 
          onClose={() => setEditingInsumo(null)} 
          onSaved={() => setEditingInsumo(null)} 
        />
      )}

      {showPrintModal && selectedMedioForPrint && (
        <PrintLabelsModal 
          batches={selectedMedioForPrint} 
          onClose={() => setShowPrintModal(false)} 
        />
      )}
    </div>
  );
}

export default InventoryPage;
