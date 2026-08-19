import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PROFILES, generateZPL, generateMixedZPL, sendToPrinter } from '../utils/zplProfiles';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function PrintLabelsModal({ batches, onClose, usuarioActivo, initialProfile }) {
  const [mode, setMode] = useState('thermal'); // 'thermal' or 'a4'
  const [activeProfile, setActiveProfile] = useState(initialProfile || batches[0]?.tipo_etiqueta || 'PORTAOBJETOS');
  const [copies, setCopies] = useState(1);
  const [profile, setProfile] = useState('standard'); // for PDF backup

  const hasMixedProfiles = batches.length > 0 && batches.some(b => b.tipo_etiqueta && b.tipo_etiqueta !== batches[0].tipo_etiqueta);

  const uniqueContainers = Array.from(new Set(batches.map(b => b.contenedorId).filter(Boolean)));
  const hasContainers = uniqueContainers.length > 0;
  const [imprimirContenedor, setImprimirContenedor] = useState(false);
  const [activeContainerProfile, setActiveContainerProfile] = useState('MAXI_BOLSA');
  const [agregarBolsaMulti, setAgregarBolsaMulti] = useState(false);

  // Agrupación por ejemplar para la etiqueta de bolsa contenedora (N en 1)
  const gruposBolsa = {};
  batches.forEach(b => {
    const grupoKey = b.ejemplarId || (b.origen_trazabilidad && b.origen_trazabilidad.match(/EJE:\s*(\S+)/)?.[1]);
    if (grupoKey) {
      if (!gruposBolsa[grupoKey]) gruposBolsa[grupoKey] = [];
      gruposBolsa[grupoKey].push(b);
    }
  });
  const gruposBolsaMulti = Object.values(gruposBolsa).filter(g => g.length > 1);

  const handlePrint = () => {
    // Apply class to HTML for browser-based print size
    document.documentElement.className = profile === 'micro' ? 'print-micro' : 'print-standard';
    window.print();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const activeProf = PROFILES.find(p => p.id === activeProfile) || PROFILES[0];

  const handleDownloadZPL = () => {
    let zpl = hasMixedProfiles
      ? generateMixedZPL(batches.map(b => ({ batch: b, profileId: b.tipo_etiqueta || activeProfile, copies })))
      : generateZPL(activeProfile, batches, copies);
    if (imprimirContenedor && hasContainers) {
       const containerBatches = uniqueContainers.map(cId => ({
         id: cId,
         alias: `CONTENEDOR ${cId}`,
         nombre_receta: 'Agrupación Física',
         fecha: new Date().toISOString().split('T')[0],
         operador: usuarioActivo || 'Sistema',
         tipo_uso: 'Contenedor',
       }));
       zpl += "\n\n" + generateZPL(activeContainerProfile, containerBatches, 1);
    }
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas_${activeProfile.toLowerCase()}_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintDirect = async () => {
    let zpl = hasMixedProfiles
      ? generateMixedZPL(batches.map(b => ({ batch: b, profileId: b.tipo_etiqueta || activeProfile, copies })))
      : generateZPL(activeProfile, batches, copies);
    if (imprimirContenedor && hasContainers) {
       const containerBatches = uniqueContainers.map(cId => ({
         id: cId,
         alias: `CONTENEDOR ${cId}`,
         nombre_receta: 'Agrupación Física',
         fecha: new Date().toISOString().split('T')[0],
         operador: usuarioActivo || 'Sistema',
         tipo_uso: 'Contenedor',
       }));
       zpl += "\n\n" + generateZPL(activeContainerProfile, containerBatches, 1);
    }
    await sendToPrinter(zpl);
  };

  const handleEnviarACola = async () => {
    try {
      const datosEtiquetas = batches.map(batch => ({
        id: batch.id || '',
        alias: batch.alias || batch.cepa || batch.especie || '',
        nombre_receta: batch.nombre_receta || batch.substrate || batch.nombre_insumo || '',
        fecha: batch.fecha || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '',
        ubicacion: batch.ubicacion || '',
        operador: batch.operador || batch.operario || '',
        medio_origen_alias: batch.medio_origen_alias || '',
        tipo_uso: batch.tipo_uso || '',
        fecha_vencimiento: batch.fecha_vencimiento || '',
        generacion: batch.generacion || '',
        numero_unidad: batch.numero_unidad || 1,
        total_unidades: batch.total_unidades || 1,
        sala: batch.sala || '',
        origen_trazabilidad: batch.origen_trazabilidad || '',
        tipo_etiqueta: batch.tipo_etiqueta || activeProfile,
      }));

      const batchIds = batches.map(b => b.id || '').filter(Boolean);
      if (batchIds.length > 0) {
        const yaEnCola = await getDocs(query(collection(db, 'cola_impresion'), where('batch_ids', 'array-contains-any', batchIds), where('estado', '==', 'Pendiente')));
        if (!yaEnCola.empty) {
          toast('Estas etiquetas ya están en la cola de impresión (Pendiente)', { icon: '🖨️' });
          onClose();
          return;
        }
      }

      await addDoc(collection(db, 'cola_impresion'), {
        modulo: 'medios',
        batch_ids: batchIds,
        tipo_etiqueta: hasMixedProfiles ? 'MIXED' : activeProfile,
        datos_etiquetas: datosEtiquetas,
        copias: copies,
        estado: 'Pendiente',
        fecha_generacion: serverTimestamp(),
        operario: usuarioActivo || 'Sistema',
      });

      if (imprimirContenedor && hasContainers) {
         await addDoc(collection(db, 'cola_impresion'), {
           modulo: 'contenedores',
           batch_ids: uniqueContainers,
           tipo_etiqueta: activeContainerProfile,
           datos_etiquetas: uniqueContainers.map(cId => ({
              id: cId,
              alias: `CONTENEDOR ${cId}`,
              nombre_receta: 'Agrupación Física',
              fecha: new Date().toISOString().split('T')[0],
              operador: usuarioActivo || 'Sistema',
              tipo_uso: 'Contenedor'
           })),
           copias: 1,
           estado: 'Pendiente',
           fecha_generacion: serverTimestamp(),
           operario: usuarioActivo || 'Sistema',
         });
      }

      if (agregarBolsaMulti && gruposBolsaMulti.length > 0) {
        for (const grupo of gruposBolsaMulti) {
          const bloques = grupo.map(b => ({ ...b }));
          await addDoc(collection(db, 'cola_impresion'), {
            modulo: 'bolsa_multi',
            batch_ids: grupo.map(b => b.id || '').filter(Boolean),
            tipo_etiqueta: 'BOLSA_MULTI',
            datos_etiquetas: [{
              ...grupo[0],
              id: `BOLSA-MULTI-${grupo[0].id || ''}`,
              alias: grupo[0].alias || grupo[0].cepa || grupo[0].especie || '',
              tipo_etiqueta: 'BOLSA_MULTI',
              bloques,
            }],
            copias: 1,
            estado: 'Pendiente',
            fecha_generacion: serverTimestamp(),
            operario: usuarioActivo || 'Sistema',
          });
        }
      }

      toast.success('Etiqueta(s) enviadas a la cola de impresión');
      onClose();
    } catch (err) {
      console.error('Error al enviar a cola:', err);
      toast.error('Error al enviar a la cola: ' + err.message);
    }
  };

  // Flattened array of items to render in the preview (handling copies)
  let previewItems = [];
  batches.forEach(batch => {
    for (let c = 0; c < copies; c++) {
      previewItems.push(batch);
    }
  });

  const slotsPerPage = activeProf.cols * activeProf.rows;

  return (
    <>
      <div className="modal-overlay no-print">
        <div className="modal-box" style={{ maxWidth: '850px', width: '95%', padding: '1.5rem' }}>
          <div className="modal-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🖨️ Centro de Impresión ZPL (Zebra ZD220)</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>

          {/* MODE SELECTOR */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '12px' }}>
            <button 
              className={`btn ${mode === 'thermal' ? 'btn-primary' : 'btn-outline'}`} 
              style={{ flex: 1, minHeight: '44px' }}
              onClick={() => setMode('thermal')}
            >
              📟 Impresora Zebra (ZPL)
            </button>
            <button 
              className={`btn ${mode === 'a4' ? 'btn-primary' : 'btn-outline'}`} 
              style={{ flex: 1, minHeight: '44px' }}
              onClick={() => setMode('a4')}
            >
              📄 Hoja Común A4 (PDF)
            </button>
          </div>

          <div className="print-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            
            {/* LEFT COLUMN: CONTROLS & SELECTION */}
            {mode === 'thermal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* SETTINGS CARD */}
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--primary-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rollo Físico Cargado:</span>
                      <strong style={{ display: 'block', color: 'var(--primary-color)', fontSize: '1rem' }}>📏 Grande (100mm x 150mm)</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Copias por Lote:</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="100"
                        className="form-control" 
                        value={copies} 
                        onChange={e => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: '80px', background: 'var(--bg-color)', textAlign: 'center' }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={handlePrintDirect} 
                      style={{ flex: 2, backgroundColor: '#10b981', fontWeight: 'bold', fontSize: '1.05rem', minHeight: '48px' }}
                    >
                      Imprimir directo (Zebra)
                    </button>
                    <button 
                      className="btn btn-outline" 
                      onClick={handleDownloadZPL} 
                      style={{ flex: 1, fontWeight: 'bold', fontSize: '1rem', minHeight: '48px' }}
                    >
                      Descargar ZPL
                    </button>
                    <button 
                      className="btn btn-outline" 
                      onClick={handleEnviarACola} 
                      style={{ flex: 1, fontWeight: 'bold', fontSize: '1rem', minHeight: '48px', borderColor: '#6366f1', color: '#6366f1' }}
                    >
                      Enviar a cola
                    </button>
                  </div>
                </div>

                {/* PROFILE SELECTOR (CARDS MOBILE-FIRST) */}
                <div>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)', fontSize: '0.95rem' }}>Seleccione el Layout de Envase:</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {PROFILES.map((p) => {
                      const isSelected = activeProfile === p.id;
                      return (
                        <div 
                          key={p.id} 
                          className={`profile-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setActiveProfile(p.id)}
                          style={{
                            background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-color)',
                            border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            gap: '0.75rem',
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ fontSize: '2rem' }}>{p.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{p.name}</span>
                              <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{p.cols * p.rows} x Hoja</span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', lineHeight: '1.2' }}>{p.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {hasContainers && (
                  <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                      <input type="checkbox" checked={imprimirContenedor} onChange={e => setImprimirContenedor(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                      Imprimir también etiqueta para contenedores físicos ({uniqueContainers.length})
                    </label>
                    {imprimirContenedor && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Perfil ZPL para Contenedor:</label>
                        <select className="form-control" value={activeContainerProfile} onChange={e => setActiveContainerProfile(e.target.value)} style={{ marginTop: '0.5rem', width: '100%', maxWidth: '300px' }}>
                          {PROFILES.map(p => (
                            <option key={`cont_${p.id}`} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {gruposBolsaMulti.length > 0 && (
                  <div style={{ marginTop: '1rem', background: 'rgba(139, 92, 246, 0.08)', padding: '1rem', borderRadius: '12px', border: '1px solid #8b5cf6' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                      <input type="checkbox" checked={agregarBolsaMulti} onChange={e => setAgregarBolsaMulti(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                      🏷️ Etiqueta de bolsa contenedora (N en 1)
                    </label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0', lineHeight: 1.4 }}>
                      Agrega una etiqueta por ejemplar con {gruposBolsaMulti.map(g => g.length).join(' + ')} placa(s) apiladas, sin reemplazar las individuales.
                    </p>
                  </div>
                )}

              </div>
            )}

            {mode === 'a4' && (
              <div style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Respaldo PDF A4</h4>
                <p style={{ fontSize: '0.85rem' }}>Si no tenés la Zebra configurada, podés imprimir una plancha A4 normal en cualquier impresora de oficina.</p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button 
                    className={`btn ${profile === 'standard' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => setProfile('standard')}
                  >
                    📄 PDF Standard
                  </button>
                  <button 
                    className={`btn ${profile === 'micro' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => setProfile('micro')}
                  >
                    📄 PDF Micro
                  </button>
                </div>
              </div>
            )}

            {/* PREVIEW CONTAINER */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                {mode === 'thermal' ? 'Vista Previa del Rollo 100x150mm (Corte Manual)' : 'Vista Previa Plancha A4'}
              </span>
              
              <div style={{ 
                background: '#f1f5f9', 
                padding: '1.5rem', 
                borderRadius: '16px', 
                width: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
                border: '2px solid var(--border-color)'
              }}>
                {/* THERMAL SHEET PREVIEW (2:3 Aspect Ratio Mockup) */}
                {mode === 'thermal' && (
                  <div className="sheet-preview-canvas" style={{
                    width: '320px',
                    height: '480px',
                    background: '#ffffff',
                    border: '1px dashed #94a3b8',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    position: 'relative',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                  }}>
                    {/* Grid Layout of the Sheet */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${activeProf.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${activeProf.rows}, 1fr)`,
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}>
                      {[...Array(slotsPerPage)].map((_, idx) => {
                        const batch = previewItems[idx];
                        
                        // Borders/Lines to show cut paths
                        const borderRight = (idx % activeProf.cols !== activeProf.cols - 1) ? '1px dashed #cbd5e1' : 'none';
                        const borderBottom = (Math.floor(idx / activeProf.cols) !== activeProf.rows - 1) ? '1px dashed #cbd5e1' : 'none';

                        if (!batch) {
                          // Unused slot but show grid lines and empty indicator
                          return (
                            <div 
                              key={idx} 
                              style={{ 
                                borderRight, 
                                borderBottom, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                                color: '#cbd5e1',
                                background: '#fafafa'
                              }}
                            >
                              [Vacío]
                            </div>
                          );
                        }

                        // Extract parameters securely
                        const qrData = batch.id || 'N/A';
                        const alias = batch.alias || batch.cepa || batch.especie || 'S/C';
                        const nombre = (batch.nombre_receta || batch.substrate || batch.nombre_insumo || '').substring(0, 20);
                        const fecha = formatDate(batch.fecha || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '');
                        const meta = batch.id || '';
                        const transferencia = batch.numero_transferencia ? `T${batch.numero_transferencia}` : '';
                        const ubicacion = batch.ubicacion || '';
                        const operador = batch.operador || batch.operario || '';

                        // HTML Mockups matching ZPL layouts
                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              borderRight, 
                              borderBottom, 
                              padding: '4px',
                              boxSizing: 'border-box',
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              background: '#ffffff',
                              color: '#000000',
                              position: 'relative'
                            }}
                          >
                            {activeProfile === 'PORTAOBJETOS' && (
                              <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                                  <QRCodeSVG value={qrData} size={22} level="L" />
                                </div>
                                <div style={{ fontSize: '6px', textAlign: 'left', lineHeight: '1.1', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                  <div style={{ fontWeight: 'bold' }}>{alias}</div>
                                  <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{nombre}</div>
                                  <div>{fecha} {transferencia}</div>
                                  <div>{meta}</div>
                                </div>
                              </div>
                            )}

                            {activeProfile === 'MICRO_TUBOS' && (
                              <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', gap: '6px', padding: '2px' }}>
                                <div style={{ width: '28px', height: '28px', flexShrink: 0 }}>
                                  <QRCodeSVG value={qrData} size={28} level="M" />
                                </div>
                                <div style={{ fontSize: '7px', textAlign: 'left', lineHeight: '1.2', flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 'bold' }}>{alias}</div>
                                  <div>{fecha} {transferencia}</div>
                                  <div>Ref: {meta}</div>
                                </div>
                              </div>
                            )}

                            {activeProfile === 'SLIM_PETRI' && (
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '10px', boxSizing: 'border-box', gap: '4px' }}>
                                <QRCodeSVG value={qrData} size={54} level="M" />
                                <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px' }}>{qrData}</div>
                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{alias}</div>
                                <div style={{ fontSize: '8px', color: '#475569' }}>Fecha: {fecha} {transferencia && `| ${transferencia}`}</div>
                                <div style={{ fontSize: '8px', color: '#475569' }}>Gen: {batch.generacion ?? 0} | Placa {batch.numero_unidad ?? 1}/{batch.total_unidades ?? 1}</div>
                                <div style={{ fontSize: '8px', color: '#475569' }}>Sala: {batch.sala || ''} | Op: {operador}</div>
                              </div>
                            )}

                            {activeProfile === 'BOLSA_MULTI' && (
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', boxSizing: 'border-box', gap: '4px' }}>
                                {(batch.bloques && batch.bloques.length ? batch.bloques : [batch]).map((bl, i, arr) => (
                                  <div key={i} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    borderBottom: i < arr.length - 1 ? '1px dashed #cbd5e1' : 'none',
                                    padding: '4px'
                                  }}>
                                    <QRCodeSVG value={bl.id || qrData} size={34} level="M" />
                                    <div style={{ fontSize: '7px', textAlign: 'left', lineHeight: '1.2', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                      <div style={{ fontWeight: 'bold', fontSize: '8px' }}>{bl.alias || bl.cepa || bl.especie || 'S/C'}</div>
                                      <div>{(bl.id || '').split('-').slice(-2).join('-')} | {i + 1}/{arr.length}</div>
                                      <div>{formatDate(bl.fecha || bl.fecha_inoculacion || '')} | {bl.sala || ''}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {activeProfile === 'MEDIO_ESTANDAR' && (
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '6px', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ width: '56px', height: '56px' }}>
                                    <QRCodeSVG value={qrData} size={56} level="M" />
                                  </div>
                                  <div style={{ fontSize: '13px', textAlign: 'right' }}>
                                    <strong>{alias}</strong>
                                    <div style={{ fontSize: '10px', color: '#0284c7' }}>{batch.tipo_uso || 'Medio'}</div>
                                  </div>
                                </div>
                                <div style={{ fontSize: '11px', textAlign: 'left', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                                  <strong style={{ fontSize: '12px' }}>{nombre}</strong>
                                  <div style={{ color: '#475569', fontSize: '9px', marginTop: '2px' }}>
                                    Preparado: {fecha} {transferencia && `| ${transferencia}`} <br />
                                    Ref: {meta} {batch.fecha_vencimiento && `| Vence: ${formatDate(batch.fecha_vencimiento)}`}
                                    {ubicacion && <><br />📍 {ubicacion}</>}
                                    {operador && <><br />👤 {operador}</>}
                                  </div>
                                </div>
                              </div>
                            )}

                            {activeProfile === 'MAXI_BOLSA' && (
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '1.5rem', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                  <QRCodeSVG value={qrData} size={130} level="M" />
                                  <span style={{ fontSize: '10px', color: '#64748b' }}>{qrData}</span>
                                </div>
                                <div style={{ textAlign: 'left', flex: 1, marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <div style={{ fontSize: '22px', fontWeight: 'bold', borderBottom: '2px solid #000' }}>ID: {alias}</div>
                                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{nombre}</div>
                                  <div style={{ fontSize: '13px', color: '#334155' }}>
                                    Fecha: {fecha} | Ref: {meta} <br />
                                    {transferencia && `${transferencia} | `}Generación: {batch.generacion || 'Sc1'} | Origen: {batch.medio_origen_alias || 'N/A'}
                                    {ubicacion && <><br />📍 {ubicacion}</>}
                                    {operador && <><br />👤 {operador}</>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1rem' }}>
                                  <div style={{ background: '#000', width: '90%', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', letterSpacing: '4px' }}>
                                    BARCODE MOCK
                                  </div>
                                  <span style={{ fontSize: '8px', marginTop: '2px' }}>{qrData.substring(0, 15)}</span>
                                </div>
                              </div>
                            )}

                            {activeProfile === 'MAPA_GRADILLA' && (
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '1rem', boxSizing: 'border-box' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '4px', textAlign: 'left' }}>
                                  🗺️ MAPA DE GRADILLA / CAJA FREEZER
                                  <div style={{ fontSize: '8px', fontWeight: 'normal', color: '#475569', marginTop: '2px' }}>
                                    Fecha: {fecha} | Caja: {alias}
                                  </div>
                                </div>
                                
                                {/* 9x9 visual grid */}
                                <div style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: 'repeat(10, 1fr)', 
                                  gap: '1px', 
                                  background: '#cbd5e1', 
                                  border: '1px solid #94a3b8', 
                                  marginTop: '1rem',
                                  padding: '1px'
                                }}>
                                  {/* Top header corner */}
                                  <div style={{ background: '#f8fafc', fontSize: '7px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}></div>
                                  {/* Col coordinates 1-9 */}
                                  {[...Array(9)].map((_, i) => (
                                    <div key={i} style={{ background: '#f8fafc', fontSize: '7px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}>{i+1}</div>
                                  ))}
                                  
                                  {/* Rows A-I */}
                                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((rowLetter, rIdx) => (
                                    <>
                                      <div key={rowLetter} style={{ background: '#f8fafc', fontSize: '7px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}>{rowLetter}</div>
                                      {[...Array(9)].map((_, cIdx) => (
                                        <div key={cIdx} style={{ background: '#ffffff', height: '20px' }}></div>
                                      ))}
                                    </>
                                  ))}
                                </div>

                                <div style={{ marginTop: '2rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', textAlign: 'left', fontSize: '8px' }}>
                                  <strong>Notas:</strong>
                                  <div style={{ height: '30px', borderBottom: '1px solid #cbd5e1', marginTop: '4px' }}></div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Scissors Indicator Overlay */}
                    {slotsPerPage > 1 && (
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        fontSize: '9px',
                        color: '#94a3b8',
                        background: 'rgba(255,255,255,0.8)',
                        padding: '1px 3px',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        zIndex: 10
                      }}>
                        ✂️ Recortar
                      </div>
                    )}
                  </div>
                )}

                {/* PDF BACKUP PREVIEW */}
                {mode === 'a4' && (
                  <div className="a4-sheet" style={{ 
                    width: '210px', 
                    minHeight: '297px', 
                    background: 'white', 
                    padding: '10px', 
                    boxSizing: 'border-box',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridTemplateRows: 'repeat(10, 1fr)',
                    gap: '2px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                  }}>
                    {[...Array(30)].map((_, i) => {
                      const batch = batches[i % batches.length];
                      if (!batch) return <div key={i} style={{ border: '1px dashed #ccc' }}></div>;
                      return (
                        <div key={i} className="thermal-label" style={{ border: '1px solid #ddd', width: '100%', height: '100%', padding: '2px' }}>
                          <div className="thermal-qr" style={{ width: '12px', height: '12px' }}>
                            <QRCodeSVG value={batch.id} size={12} level="M" />
                          </div>
                          <div className="etiqueta-info" style={{ fontSize: '4px', transform: 'scale(0.8)' }}>
                            <div className="etiqueta-id">{batch.alias || batch.cepa || batch.id}</div>
                            <div className="etiqueta-nombre">{batch.nombre_receta || batch.substrate || batch.nombre_insumo}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <button className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Cerrar</button>
            {mode === 'thermal' && (
              <button 
                className="btn btn-primary" 
                onClick={handlePrintDirect} 
                style={{ flex: 2, backgroundColor: '#10b981', fontWeight: 'bold', minHeight: '48px' }}
              >
                Imprimir directo (Zebra)
              </button>
            )}
            {mode === 'a4' && (
              <button className="btn btn-primary" onClick={handlePrint} style={{ flex: 1 }}>Imprimir PDF (Navegador)</button>
            )}
          </div>
        </div>
      </div>

      {/* PORTAL FOR BROWSER PRINT ONLY (HIDDEN ON SCREEN) */}
      {createPortal(
        <div className="print-only">
          {mode === 'thermal' ? (
            <div className="thermal-print-layout">
              {batches.map(batch => (
                profile === 'standard' ? (
                  <div key={batch.id} className="thermal-label">
                    <div className="thermal-qr">
                      <QRCodeSVG value={batch.id} size={65} level="L" marginSize={0} />
                    </div>
                    <div className="thermal-info">
                      <div className="thermal-id">{batch.id}</div>
                      <div className="thermal-name">{batch.nombre_insumo || batch.especie}</div>
                      <div className="thermal-meta">
                        {formatDate(batch.fecha)}
                        {batch.fecha_vencimiento && ` | Ven: ${formatDate(batch.fecha_vencimiento)}`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={batch.id} className="micro-label">
                    <QRCodeSVG value={batch.id} size={42} level="L" marginSize={0} />
                  </div>
                )
              ))}
            </div>
          ) : (
            <div className="a4-print-layout" style={{ 
              width: '210mm', 
              height: '297mm', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gridTemplateRows: 'repeat(10, 1fr)',
              gap: '2mm',
              padding: '10mm'
            }}>
              {[...Array(30)].map((_, i) => {
                const batch = batches[i % batches.length];
                if (!batch) return <div key={i}></div>;
                return (
                  <div key={i} className="thermal-label" style={{ width: '100%', height: '100%' }}>
                    <div className="thermal-qr">
                      <QRCodeSVG value={batch.id} size={50} />
                    </div>
                    <div className="thermal-info">
                      <div className="thermal-id">{batch.alias || batch.id}</div>
                      <div className="thermal-name">{batch.nombre_receta || batch.nombre_insumo || `${batch.genero} ${batch.especie}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>,
        document.getElementById('print-root')
      )}
    </>
  );
}
