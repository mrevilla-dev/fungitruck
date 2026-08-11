import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import { generateZPL, sendToPrinter, generateMixedZPL, PROFILES } from '../utils/zplProfiles';
import toast from 'react-hot-toast';

export default function PrintQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroOperador, setFiltroOperador] = useState('Todos');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);

  const handleToggleSelect = (id) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'cola_impresion'), where('estado', '==', 'Pendiente'));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort by fecha_generacion asc
      items.sort((a, b) => {
        const timeA = a.fecha_generacion?.toMillis?.() || 0;
        const timeB = b.fecha_generacion?.toMillis?.() || 0;
        return timeA - timeB;
      });
      
      setQueue(items);
    } catch (error) {
      console.error('Error fetching queue:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleImprimirLote = async (colaItem) => {
    const batches = colaItem.datos_etiquetas || [];
    
    // En bloques posteriores se puede afinar según el módulo o tipo de etiqueta.
    const profileToUse = colaItem.tipo_etiqueta === 'MIXED' ? '' : (colaItem.tipo_etiqueta || (colaItem.modulo === 'inoculaciones' ? 'MAXI_BOLSA' : 'MEDIO_ESTANDAR'));
    
    const zpl = profileToUse
      ? generateZPL(profileToUse, batches, 1)
      : generateMixedZPL(batches.map(b => ({ batch: b, profileId: b.tipo_etiqueta || 'PORTAOBJETOS', copies: 1 })));
    
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lote_${colaItem.id}_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintDirectLote = async (colaItem) => {
    const batches = colaItem.datos_etiquetas || [];
    const profileToUse = colaItem.tipo_etiqueta === 'MIXED' ? '' : (colaItem.tipo_etiqueta || (colaItem.modulo === 'inoculaciones' ? 'MAXI_BOLSA' : 'MEDIO_ESTANDAR'));
    const zpl = profileToUse
      ? generateZPL(profileToUse, batches, 1)
      : generateMixedZPL(batches.map(b => ({ batch: b, profileId: b.tipo_etiqueta || 'PORTAOBJETOS', copies: 1 })));
    await sendToPrinter(zpl);
  };

  const handleMarcarImpreso = async (colaItem) => {
    try {
      const auth = getAuth();
      const usuarioActivo = auth.currentUser?.email || 'Usuario Desconocido';
      
      const colaRef = doc(db, 'cola_impresion', colaItem.id);
      await updateDoc(colaRef, {
        estado: 'Impreso',
        impreso_por: usuarioActivo,
        fecha_impresion: serverTimestamp()
      });
      fetchQueue();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al marcar como impreso');
    }
  };

  const handleCambiarFormato = async (colaItem, newProfileId) => {
    try {
      const colaRef = doc(db, 'cola_impresion', colaItem.id);
      await updateDoc(colaRef, {
        tipo_etiqueta: newProfileId
      });
      toast.success(`Formato actualizado a ${newProfileId}`);
      fetchQueue();
    } catch (error) {
      console.error('Error al cambiar formato:', error);
      toast.error('Error al actualizar el formato.');
    }
  };

  const handleImprimirTodo = async () => {
    if (queue.length === 0) return;
    
    let allBatches = [];
    queue.forEach(item => {
      allBatches = [...allBatches, ...(item.datos_etiquetas || [])];
    });

    const zpl = generateZPL('MAXI_BOLSA', allBatches, 1);
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `todo_cola_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintDirectTodo = async () => {
    if (queue.length === 0) return;
    let allBatches = [];
    queue.forEach(item => {
      allBatches = [...allBatches, ...(item.datos_etiquetas || [])];
    });
    const zpl = generateZPL('MAXI_BOLSA', allBatches, 1);
    await sendToPrinter(zpl);
  };

  const getRelatedItems = (currentItem) => {
    const dateStr1 = currentItem.fecha_generacion?.toDate ? currentItem.fecha_generacion.toDate().toLocaleDateString('es-AR') : 'Fecha desconocida';
    return queue.filter(q => {
      if (q.id === currentItem.id) return false;
      if (currentItem.batch_grupo_id && currentItem.batch_grupo_id === q.batch_grupo_id) return true;
      const dateStr2 = q.fecha_generacion?.toDate ? q.fecha_generacion.toDate().toLocaleDateString('es-AR') : 'Fecha desconocida';
      return q.modulo === currentItem.modulo && q.operario === currentItem.operario && dateStr1 === dateStr2;
    });
  };

  const handleAgrupar = (currentItem) => {
    const related = getRelatedItems(currentItem);
    const newSet = new Set(selectedItems);
    newSet.add(currentItem.id);
    related.forEach(r => newSet.add(r.id));
    setSelectedItems(newSet);
  };

  const getItemsForOptimization = () => {
    const items = queue.filter(q => selectedItems.has(q.id));
    const itemsToPrint = [];
    items.forEach(item => {
      const batches = item.datos_etiquetas || [];
      const profileToUse = item.tipo_etiqueta || (item.modulo === 'inoculaciones' ? 'MAXI_BOLSA' : 'MEDIO_ESTANDAR');
      batches.forEach(b => {
        itemsToPrint.push({ batch: b, profileId: b.tipo_etiqueta || profileToUse, copies: 1 });
      });
    });
    return itemsToPrint;
  };

  const handleOptimizeDownload = () => {
    const itemsToPrint = getItemsForOptimization();
    const zpl = generateMixedZPL(itemsToPrint);
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimizadas_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    setShowOptimizationModal(false);
  };

  const handleOptimizePrintDirect = async () => {
    const itemsToPrint = getItemsForOptimization();
    const zpl = generateMixedZPL(itemsToPrint);
    await sendToPrinter(zpl);
    
    // Marcar como impresas automáticamente (segun lo acordado en Bug 1 / Mejora 2)
    const items = queue.filter(q => selectedItems.has(q.id));
    for (const item of items) {
      await handleMarcarImpreso(item);
    }
    
    setShowOptimizationModal(false);
    setSelectedItems(new Set());
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>🖨️ COLA DE IMPRESIÓN</h2>
      
      {loading ? (
        <p>Cargando cola...</p>
      ) : queue.length === 0 ? (
        <p>No hay etiquetas pendientes.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Mejora 1: Filtro por Operador */}
          <div style={{ marginBottom: '1rem' }}>
            <select
              className="form-select"
              value={filtroOperador}
              onChange={(e) => setFiltroOperador(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--surface-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: '100%', maxWidth: '300px' }}
            >
              <option value="Todos">👤 Todos los operarios</option>
              {Array.from(new Set(queue.map(item => item.operario).filter(Boolean))).sort().map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            
            <button 
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', marginLeft: '1rem', backgroundColor: selectedItems.size >= 2 ? '#10b981' : 'var(--border-color)', cursor: selectedItems.size >= 2 ? 'pointer' : 'not-allowed', color: selectedItems.size >= 2 ? '#fff' : '#666', border: 'none' }}
              disabled={selectedItems.size < 2}
              onClick={() => setShowOptimizationModal(true)}
            >
              📐 Optimizar seleccionadas ({selectedItems.size})
            </button>
          </div>

          {queue.filter(item => filtroOperador === 'Todos' || item.operario === filtroOperador).length === 0 ? (
            <p>No hay etiquetas pendientes para este operario.</p>
          ) : (
            queue.filter(item => filtroOperador === 'Todos' || item.operario === filtroOperador).map(item => {
            const dateStr = item.fecha_generacion?.toDate ? item.fecha_generacion.toDate().toLocaleDateString('es-AR') : 'Fecha desconocida';
            const numLabels = item.datos_etiquetas?.length || 0;
            
            // Texto de ejemplo para previsualizar los IDs
            let previewText = '';
            if (numLabels > 0) {
              const firstId = item.datos_etiquetas[0].id || item.datos_etiquetas[0].alias || 'Sin ID';
              if (numLabels > 1) {
                const lastId = item.datos_etiquetas[numLabels - 1].id || item.datos_etiquetas[numLabels - 1].alias || 'Sin ID';
                previewText = `${firstId} a ${lastId}`;
              } else {
                previewText = firstId;
              }
            } else {
              previewText = 'Sin datos';
            }

            const relatedCount = getRelatedItems(item).length;

            return (
              <div key={item.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', background: 'var(--surface-color)' }}>
                <input 
                  type="checkbox" 
                  style={{ marginTop: '0.25rem', width: '20px', height: '20px', cursor: 'pointer' }}
                  checked={selectedItems.has(item.id)}
                  onChange={() => handleToggleSelect(item.id)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                      [Módulo: {item.modulo}] — {dateStr} · {item.operario}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {relatedCount > 0 && (
                        <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem' }} onClick={() => handleAgrupar(item)}>
                          📦 Agrupar lote (+{relatedCount})
                        </button>
                      )}
                      <select
                        className="form-select"
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }}
                        value={item.tipo_etiqueta || (item.modulo === 'inoculaciones' ? 'MAXI_BOLSA' : 'MEDIO_ESTANDAR')}
                        onChange={(e) => handleCambiarFormato(item, e.target.value)}
                      >
                        {PROFILES.map(p => (
                          <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)' }}>
                  {numLabels} etiquetas · {previewText}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-outline" onClick={() => toast(JSON.stringify(item.datos_etiquetas, null, 2))}>
                    Ver detalle
                  </button>
                  <button className="btn btn-primary" onClick={() => handleImprimirLote(item)}>
                    ⬇️ Descargar ZPL
                  </button>
                  <button className="btn btn-success" onClick={() => handlePrintDirectLote(item)}>
                    🖨️ Imprimir directo (Zebra)
                  </button>
                  <button className="btn btn-outline" onClick={() => handleMarcarImpreso(item)}>
                    Marcar como impreso
                  </button>
                </div>
                </div>
              </div>
            );
          })
          )}
          
          <hr style={{ margin: '1rem 0', borderColor: 'var(--border-color)' }} />
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.75rem 1.5rem', fontSize: '1.1rem' }} 
              onClick={handleImprimirTodo}
            >
              ⬇️ Descargar TODO lo pendiente
            </button>
            <button 
              className="btn btn-success" 
              style={{ padding: '0.75rem 1.5rem', fontSize: '1.1rem', backgroundColor: '#3b82f6' }} 
              onClick={handlePrintDirectTodo}
            >
              🖨️ Imprimir directo TODO (Zebra)
            </button>
          </div>
        </div>
      )}

      {showOptimizationModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-color)', padding: '2rem', borderRadius: '12px', maxWidth: '500px', width: '100%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h3>📐 Optimizar Etiquetas Seleccionadas</h3>
            <p>Se empaquetarán {getItemsForOptimization().length} etiquetas utilizando sus respectivos formatos en el menor número de hojas 100x150mm posibles.</p>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowOptimizationModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleOptimizeDownload}>
                ⬇️ Descargar ZPL
              </button>
              <button className="btn btn-success" onClick={handleOptimizePrintDirect}>
                🖨️ Confirmar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
