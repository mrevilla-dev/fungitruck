import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp, runTransaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import SearchableSelect from './SearchableSelect';
import { uploadFileToDrive } from '../services/driveService';
import { generarIdCosecha, generarIdCosechaGrupal } from '../utils/idGenerator';
import { resolverPesoSeco, obtenerCondicionesAmbientales } from '../utils/cosechaUtils';

export default function NuevaCosechaModal({ initialBatch = null, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [authName, setAuthName] = useState('Sistema');
  
  // Modos de Cosecha (Bloque 2 y 3)
  const [modo, setModo] = useState('individual'); // 'individual', 'grupal', 'sector'
  
  // Listados globales
  const [activeBatches, setActiveBatches] = useState([]);
  const [salas, setSalas] = useState([]);
  
  // Datos del Lote Seleccionado (Modo Individual)
  const [selectedBatch, setSelectedBatch] = useState(initialBatch);
  const [cosechasPrevias, setCosechasPrevias] = useState([]);
  
  // Datos Multi-Lote (Modo Grupal / Sector)
  const [selectedSalas, setSelectedSalas] = useState(''); // ID de sala
  const [selectedMultiBatches, setSelectedMultiBatches] = useState([]); // Array de objetos lote enriquecidos
  
  // Estado del Formulario Base
  const [formData, setFormData] = useState({
    fecha_cosecha: new Date().toISOString().split('T')[0],
    numero_oleada: 1,
    peso_fresco: '',
    peso_humedo_sustrato: '',
    peso_perdido: '',
    primordios: 'No',
    observaciones: '',
    es_agotado: false // Solo para individual
  });

  // Peso Seco (resuelto, Individual)
  const [pesoSecoResuelto, setPesoSecoResuelto] = useState({ valor: null, fuente: 'manual' });
  const [pesoSecoManual, setPesoSecoManual] = useState('');

  // Destinos Dinámicos
  const [destinos, setDestinos] = useState([]);

  // Condiciones Ambientales
  const [condiciones, setCondiciones] = useState({
    temperatura: '',
    humedad: '',
    fuente: 'manual'
  });

  // Foto
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fotoInputRef = useRef(null);

  // Morfología por especie (Individual)
  const [morfCordyceps, setMorfCordyceps] = useState({
    numero_estromas: '',
    diametro_medio_mm: '',
    esporulacion_general: 'Ninguna',
    alturas: {
      '0-2cm': { cantidad: '', esporulados: false },
      '2-4cm': { cantidad: '', esporulados: false },
      '4-6cm': { cantidad: '', esporulados: false },
      '6-8cm': { cantidad: '', esporulados: false },
      '8-10cm': { cantidad: '', esporulados: false }
    }
  });

  const [morfHericium, setMorfHericium] = useState({
    numero_cuerpos: '',
    diametro_cm: '',
    firmeza: '3',
    color_pardeamiento: '1',
    esporulacion: 'Ausente'
  });

  const [morfGenerica, setMorfGenerica] = useState({
    morfologia_general: '',
    tamanio_promedio: 'Medio'
  });

  // Inicialización y carga de lotes/salas
  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      setAuthName(auth.currentUser.displayName || auth.currentUser.email || 'Sistema');
    }

    const fetchData = async () => {
      // Fetch lotes activos
      const q = query(collection(db, 'batches'), where('status', 'in', ['Activo', 'Fructificación', 'Fructificacion']));
      const snap = await getDocs(q);
      const bList = snap.docs.map(d => ({ id: d.id, nombre: `${d.id} · ${d.data().especie || ''}`, data: d.data() }));
      setActiveBatches(bList);
      
      // Fetch salas
      const qSalas = query(collection(db, 'salas'));
      const snapSalas = await getDocs(qSalas);
      setSalas(snapSalas.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    
    fetchData();
  }, []);

  // -- EFECTOS MODO INDIVIDUAL --
  useEffect(() => {
    if (modo !== 'individual') return;
    
    const loadBatchData = async () => {
      if (!selectedBatch) {
        setCosechasPrevias([]);
        setCondiciones({ temperatura: '', humedad: '', fuente: 'manual' });
        setPesoSecoResuelto({ valor: null, fuente: 'manual' });
        return;
      }

      const qCosechas = query(collection(db, 'cosechas'), where('batchId', '==', selectedBatch.id));
      const snapCosechas = await getDocs(qCosechas);
      const previas = snapCosechas.docs.map(d => d.data());
      setCosechasPrevias(previas);
      
      setFormData(prev => ({ ...prev, numero_oleada: previas.length + 1 }));

      const cond = await obtenerCondicionesAmbientales(db, selectedBatch.destinoId || selectedBatch.data?.destinoId);
      setCondiciones(cond);

      const data = selectedBatch.data || selectedBatch;
      const ps = resolverPesoSeco(data, formData.peso_fresco ? Number(formData.peso_fresco) : null);
      setPesoSecoResuelto(ps);
      if (ps.fuente === 'manual') setPesoSecoManual('');
    };

    loadBatchData();
  }, [selectedBatch, modo]); // eslint-disable-line

  useEffect(() => {
    if (modo === 'individual' && selectedBatch) {
      const data = selectedBatch.data || selectedBatch;
      if (data.peso_seco_pct && data.peso_seco_pct > 0) {
        const ps = resolverPesoSeco(data, formData.peso_fresco ? Number(formData.peso_fresco) : null);
        setPesoSecoResuelto(ps);
      }
    }
  }, [formData.peso_fresco, selectedBatch, modo]);

  // -- EFECTOS MODO GRUPAL / SECTOR --
  useEffect(() => {
    if (modo === 'sector' && selectedSalas) {
      // Auto-seleccionar lotes de esa sala
      const lotesEnSala = activeBatches.filter(b => (b.data?.destinoId || b.destinoId) === selectedSalas);
      // Initialize with agotado = false
      setSelectedMultiBatches(lotesEnSala.map(b => ({ ...b, agotado: false, manualSeco: '' })));
      
      obtenerCondicionesAmbientales(db, selectedSalas).then(c => setCondiciones(c));
    }
  }, [selectedSalas, modo, activeBatches]);

  // Handle MultiBatch toggling (for grupal)
  const toggleMultiBatch = (batchId) => {
    const existing = selectedMultiBatches.find(b => b.id === batchId);
    if (existing) {
      setSelectedMultiBatches(selectedMultiBatches.filter(b => b.id !== batchId));
    } else {
      const b = activeBatches.find(x => x.id === batchId);
      setSelectedMultiBatches([...selectedMultiBatches, { ...b, agotado: false, manualSeco: '' }]);
    }
  };

  const updateMultiBatch = (batchId, field, val) => {
    setSelectedMultiBatches(prev => prev.map(b => b.id === batchId ? { ...b, [field]: val } : b));
  };

  // Cálculos Individual
  const metricsIndividual = useMemo(() => {
    if (modo !== 'individual') return null;
    const pFresco = Number(formData.peso_fresco) || 0;
    const pSeco = pesoSecoResuelto.valor !== null ? pesoSecoResuelto.valor : (Number(pesoSecoManual) || 0);
    const frescoAcumuladoPrevia = cosechasPrevias.reduce((sum, c) => sum + (Number(c.peso_fresco) || 0), 0);
    const frescoAcumulado = frescoAcumuladoPrevia + pFresco;
    
    const ebOleada = pSeco > 0 ? ((pFresco / pSeco) * 100) : 0;
    const ebAcumulada = pSeco > 0 ? ((frescoAcumulado / pSeco) * 100) : 0;
    
    const data = selectedBatch?.data || selectedBatch;
    let diasInoculacion = 1; 
    if (data?.fechaInoculacion && formData.fecha_cosecha) {
      diasInoculacion = Math.max(1, Math.floor((new Date(formData.fecha_cosecha) - new Date(data.fechaInoculacion)) / 86400000));
    }
    const tpb = ebAcumulada / diasInoculacion;

    return { ebOleada, ebAcumulada, diasInoculacion, tpb, frescoAcumuladoPrevia, pSeco };
  }, [formData, pesoSecoResuelto, pesoSecoManual, cosechasPrevias, selectedBatch, modo]);

  // Cálculos Multi
  const metricsMulti = useMemo(() => {
    if (modo === 'individual' || selectedMultiBatches.length === 0) return null;
    
    let totalSeco = 0;
    const batchesData = selectedMultiBatches.map(b => {
      // Necesitamos el peso húmedo estimado para sacar el seco si usa porcentaje.
      // Como es grupal, podemos promediar el peso fresco total (temporal) para sacar los secos
      // O si el user no puso peso fresco aún, asumimos 0.
      const pseudoHumedoIndividual = (Number(formData.peso_fresco) || 0) / selectedMultiBatches.length;
      
      const pSecoRes = resolverPesoSeco(b.data, pseudoHumedoIndividual);
      let val = pSecoRes.valor !== null ? pSecoRes.valor : (Number(b.manualSeco) || 0);
      totalSeco += val;
      return { ...b, pesoSecoResuelto: pSecoRes, pesoSecoFinal: val };
    });

    const pFresco = Number(formData.peso_fresco) || 0;
    const ebOleada = totalSeco > 0 ? ((pFresco / totalSeco) * 100) : 0;

    return { totalSeco, ebOleada, batchesData };
  }, [selectedMultiBatches, formData.peso_fresco, modo]);


  const especieBase = (selectedBatch?.data?.especie || selectedBatch?.especie || '').toLowerCase();
  const esCordyceps = especieBase.includes('cordyceps');
  const esHericium = especieBase.includes('hericium') || especieBase.includes('melena');

  // Helpers
  const addDestino = () => setDestinos([...destinos, { id: crypto.randomUUID(), destino: '', gramos: '' }]);
  const removeDestino = (id) => setDestinos(destinos.filter(d => d.id !== id));
  const updateDestino = (id, field, val) => setDestinos(destinos.map(d => d.id === id ? { ...d, [field]: val } : d));

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const updateAltura = (key, field, val) => {
    setMorfCordyceps(prev => ({
      ...prev,
      alturas: {
        ...prev.alturas,
        [key]: { ...prev.alturas[key], [field]: val }
      }
    }));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modo === 'individual' && !selectedBatch) return alert("Seleccione un lote");
    if (modo !== 'individual' && selectedMultiBatches.length === 0) return alert("Seleccione al menos un lote");
    if (!formData.peso_fresco) return alert("Ingrese el peso fresco");

    const totalDestinos = destinos.reduce((sum, d) => sum + (Number(d.gramos) || 0), 0);
    if (totalDestinos > Number(formData.peso_fresco)) {
      return alert("El peso total en los destinos excede el Peso Fresco de la cosecha");
    }

    if (modo === 'individual' && pesoSecoResuelto.fuente === 'manual' && (!pesoSecoManual || Number(pesoSecoManual) <= 0)) {
      return alert("Debe ingresar un valor para el Peso Seco del Sustrato.");
    }
    
    if (modo !== 'individual') {
      const f = metricsMulti.batchesData.find(b => b.pesoSecoResuelto.fuente === 'manual' && (!b.manualSeco || Number(b.manualSeco) <= 0));
      if (f) return alert(`Debe ingresar un Peso Seco manual para el lote ${f.id}`);
    }

    setLoading(true);
    try {
      let fotoUrl = null;
      if (fotoFile) {
        setUploadProgress(5);
        const driveResult = await uploadFileToDrive(fotoFile, (prog) => setUploadProgress(Math.round(prog * 0.5)));
        fotoUrl = driveResult?.imageUrl || driveResult?.url || null;
        setUploadProgress(50);
      }

      const todayIso = new Date().toISOString().split('T')[0];
      const datePart = todayIso.replace(/-/g, '').slice(2);
      
      const wb = writeBatch(db);

      if (modo === 'individual') {
        const seqKey = `COS_${datePart}`;
        let seqId = 1;
        await runTransaction(db, async (t) => {
          const counterRef = doc(db, 'metadata', 'counters');
          const docSnap = await t.get(counterRef);
          const data = docSnap.exists() ? docSnap.data() : {};
          seqId = (data[seqKey] || 0) + 1;
          t.set(counterRef, { [seqKey]: seqId }, { merge: true });
        });

        const data = selectedBatch.data || selectedBatch;
        const cosechaId = generarIdCosecha({ genero: data.genero, especie: data.especie, fecha_iso: todayIso, secuencia: seqId });

        let morfologia = {};
        if (esCordyceps) {
          morfologia = { tipo: 'cordyceps', ...morfCordyceps };
          morfologia.numero_estromas = Number(morfologia.numero_estromas) || 0;
          morfologia.diametro_medio_mm = Number(morfologia.diametro_medio_mm) || 0;
        } else if (esHericium) {
          morfologia = { tipo: 'hericium', ...morfHericium };
          morfologia.numero_cuerpos = Number(morfologia.numero_cuerpos) || 0;
          morfologia.diametro_cm = Number(morfologia.diametro_cm) || 0;
          morfologia.peso_medio_g = morfologia.numero_cuerpos > 0 ? (Number(formData.peso_fresco) / morfologia.numero_cuerpos) : 0;
        } else {
          morfologia = { tipo: 'generica', ...morfGenerica };
        }

        wb.set(doc(db, 'cosechas', cosechaId), {
          id: cosechaId,
          batchId: selectedBatch.id,
          modo_cosecha: 'individual',
          fecha_cosecha: formData.fecha_cosecha,
          numero_oleada: Number(formData.numero_oleada) || 1,
          peso_fresco: Number(formData.peso_fresco) || 0,
          peso_seco_sustrato: metricsIndividual.pSeco,
          peso_seco_sustrato_fuente: pesoSecoResuelto.fuente,
          peso_humedo_sustrato_post: formData.peso_humedo_sustrato ? Number(formData.peso_humedo_sustrato) : null,
          peso_perdido: formData.peso_perdido ? Number(formData.peso_perdido) : null,
          primordios: formData.primordios,
          destinos: destinos.map(d => ({ destino: d.destino, gramos: Number(d.gramos) })),
          condiciones_ambientales: condiciones,
          condiciones_ambientales_fuente: condiciones.fuente,
          morfologia,
          eficiencia_biologica: metricsIndividual.ebOleada,
          eficiencia_biologica_acumulada: metricsIndividual.ebAcumulada,
          tpb: metricsIndividual.tpb,
          foto_url: fotoUrl,
          operario: authName,
          observaciones: formData.observaciones,
          es_cosecha_final: formData.es_agotado,
          experimento_id: data.experimento_id || null,
          tratamiento_id: data.tratamiento_id || null,
          especie: data.especie,
          genero: data.genero,
          createdAt: serverTimestamp()
        });

        if (formData.es_agotado) {
          wb.update(doc(db, 'batches', selectedBatch.id), { status: 'Cosechado' });
        }
        await wb.commit();
        alert(`✅ Cosecha registrada exitosamente.\nID: ${cosechaId}`);
        
      } else {
        // MULTI LOTE
        const seqKey = `CGR_${datePart}`;
        let seqId = 1;
        await runTransaction(db, async (t) => {
          const counterRef = doc(db, 'metadata', 'counters');
          const docSnap = await t.get(counterRef);
          const data = docSnap.exists() ? docSnap.data() : {};
          seqId = (data[seqKey] || 0) + 1;
          t.set(counterRef, { [seqKey]: seqId }, { merge: true });
        });

        const cosechaId = generarIdCosechaGrupal({ fecha_iso: todayIso, secuencia: seqId });
        const pFresco = Number(formData.peso_fresco);
        
        // Repartir proporcionalmente
        const subBatches = metricsMulti.batchesData.map(b => {
          const prop = metricsMulti.totalSeco > 0 ? (b.pesoSecoFinal / metricsMulti.totalSeco) : (1 / metricsMulti.batchesData.length);
          const pesoFrescoRepartido = pFresco * prop;
          
          if (b.agotado) wb.update(doc(db, 'batches', b.id), { status: 'Cosechado' });
          
          return {
            batchId: b.id,
            especie: b.data.especie,
            genero: b.data.genero,
            peso_seco_sustrato: b.pesoSecoFinal,
            peso_fresco_repartido: pesoFrescoRepartido,
            agotado: b.agotado
          };
        });

        wb.set(doc(db, 'cosechas', cosechaId), {
          id: cosechaId,
          modo_cosecha: modo,
          fecha_cosecha: formData.fecha_cosecha,
          peso_fresco: pFresco,
          peso_seco_sustrato_total: metricsMulti.totalSeco,
          batches: subBatches,
          destinos: destinos.map(d => ({ destino: d.destino, gramos: Number(d.gramos) })),
          condiciones_ambientales: condiciones,
          condiciones_ambientales_fuente: condiciones.fuente,
          eficiencia_biologica: metricsMulti.ebOleada,
          foto_url: fotoUrl,
          operario: authName,
          observaciones: formData.observaciones,
          createdAt: serverTimestamp()
        });

        await wb.commit();
        alert(`✅ Cosecha Grupal registrada exitosamente.\nID: ${cosechaId}`);
      }
      
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert(`❌ Error al registrar cosecha: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ overflowY: 'auto', padding: '2rem 1rem' }}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: '900px', margin: 'auto' }}>
        <div className="modal-header">
          <h3>🧺 Nueva Cosecha</h3>
          <button className="modal-close" onClick={onClose} disabled={loading}>×</button>
        </div>

        {/* Tabs Bloque 2/3 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button type="button" className={`btn ${modo === 'individual' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModo('individual')} style={{ flex: 1 }}>
            🍄 Individual
          </button>
          <button type="button" className={`btn ${modo === 'grupal' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModo('grupal')} style={{ flex: 1 }}>
            📦 Grupal
          </button>
          <button type="button" className={`btn ${modo === 'sector' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModo('sector')} style={{ flex: 1 }}>
            🏠 Sector
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          
          {/* SELECTOR SEGUN MODO */}
          {modo === 'individual' && (
            <div className="form-group" style={{ zIndex: 100, position: 'relative' }}>
              <label className="form-label">Lote Origen *</label>
              <SearchableSelect
                options={activeBatches}
                value={selectedBatch?.id || ''}
                onChange={val => setSelectedBatch(activeBatches.find(b => b.id === val))}
                placeholder="-- Buscar Lote Activo --"
              />
            </div>
          )}

          {modo === 'grupal' && (
            <div className="form-group">
              <label className="form-label">Seleccionar Lotes *</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <select className="form-control" onChange={e => toggleMultiBatch(e.target.value)} value="">
                  <option value="">+ Añadir Lote</option>
                  {activeBatches.filter(b => !selectedMultiBatches.find(sb => sb.id === b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {modo === 'sector' && (
             <div className="form-group">
               <label className="form-label">Sector / Sala *</label>
               <select className="form-control" value={selectedSalas} onChange={e => setSelectedSalas(e.target.value)}>
                 <option value="">-- Seleccionar Sala --</option>
                 {salas.map(s => <option key={s.id} value={s.id}>{s.nombre || s.id}</option>)}
               </select>
             </div>
          )}

          {/* LISTA DE LOTES SELECCIONADOS (GRUPAL/SECTOR) */}
          {(modo === 'grupal' || modo === 'sector') && selectedMultiBatches.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
              <h4 style={{ margin: '0 0 1rem 0' }}>Lotes Incluidos ({selectedMultiBatches.length})</h4>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem' }}>Lote</th>
                    <th style={{ padding: '0.5rem' }}>Especie</th>
                    <th style={{ padding: '0.5rem' }}>Peso Seco (g)</th>
                    <th style={{ padding: '0.5rem' }}>Agotado</th>
                  </tr>
                </thead>
                <tbody>
                  {metricsMulti?.batchesData.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{b.id}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{b.data.especie}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {b.pesoSecoResuelto.fuente === 'manual' ? (
                          <input type="number" className="form-control" style={{ width: '80px', padding: '0.2rem' }} placeholder="g secos" value={b.manualSeco} onChange={e => updateMultiBatch(b.id, 'manualSeco', e.target.value)} required />
                        ) : (
                          <span style={{ fontSize: '0.9rem' }}>{b.pesoSecoFinal.toFixed(1)} <small>({b.pesoSecoResuelto.fuente})</small></span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <input type="checkbox" checked={b.agotado} onChange={e => updateMultiBatch(b.id, 'agotado', e.target.checked)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', fontWeight: 'bold' }}>
                Total Peso Seco Sustrato: {metricsMulti?.totalSeco.toFixed(1)} g
              </div>
            </div>
          )}


          {((modo === 'individual' && selectedBatch) || ((modo === 'grupal' || modo === 'sector') && selectedMultiBatches.length > 0)) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '1.5rem', alignItems: 'start' }}>
              
              {/* Columna Izquierda: Formulario Base */}
              <div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Fecha de Cosecha</label>
                    <input type="date" className="form-control" value={formData.fecha_cosecha} onChange={e => setFormData({ ...formData, fecha_cosecha: e.target.value })} required />
                  </div>
                  {modo === 'individual' && (
                    <div className="form-group">
                      <label className="form-label">Número de Oleada</label>
                      <input type="number" className="form-control" value={formData.numero_oleada} onChange={e => setFormData({ ...formData, numero_oleada: e.target.value })} required min="1" />
                    </div>
                  )}
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Peso Fresco Total (g) *</label>
                    <input type="number" step="0.1" className="form-control" value={formData.peso_fresco} onChange={e => setFormData({ ...formData, peso_fresco: e.target.value })} required placeholder="Ej: 250" />
                  </div>
                  {modo === 'individual' && (
                    <div className="form-group">
                      <label className="form-label">Primordios</label>
                      <select className="form-control" value={formData.primordios} onChange={e => setFormData({ ...formData, primordios: e.target.value })}>
                        <option value="No">No (Ausentes)</option>
                        <option value="Formación">Sí (En formación)</option>
                        <option value="Desarrollo">Sí (En desarrollo)</option>
                      </select>
                    </div>
                  )}
                </div>

                {modo === 'individual' && (
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Peso Húmedo Sustrato (g)</label>
                      <input type="number" step="0.1" className="form-control" value={formData.peso_humedo_sustrato} onChange={e => setFormData({ ...formData, peso_humedo_sustrato: e.target.value })} placeholder="Opcional" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Peso Perdido (g)</label>
                      <input type="number" step="0.1" className="form-control" value={formData.peso_perdido} onChange={e => setFormData({ ...formData, peso_perdido: e.target.value })} placeholder="Opcional" />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Condiciones Ambientales (Sala)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" step="0.1" className="form-control" value={condiciones.temperatura} onChange={e => setCondiciones({ ...condiciones, temperatura: e.target.value, fuente: 'manual' })} placeholder="Temp °C" />
                    <input type="number" step="0.1" className="form-control" value={condiciones.humedad} onChange={e => setCondiciones({ ...condiciones, humedad: e.target.value, fuente: 'manual' })} placeholder="Humedad %" />
                    {condiciones.fuente === 'mantenimiento' && (
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--primary-color)' }}>✅ Auto</span>
                    )}
                  </div>
                </div>

                {/* Destinos */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>Destinos</label>
                    <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={addDestino}>+ Agregar</button>
                  </div>
                  {destinos.map(d => (
                    <div key={d.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input type="text" className="form-control" placeholder="Destino" value={d.destino} onChange={e => updateDestino(d.id, 'destino', e.target.value)} required />
                      <input type="number" step="0.1" className="form-control" placeholder="Gramos" value={d.gramos} onChange={e => updateDestino(d.id, 'gramos', e.target.value)} style={{ width: '100px' }} required />
                      <button type="button" className="btn btn-secondary" onClick={() => removeDestino(d.id)}>x</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna Derecha: Métricas y Peso Seco */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Métricas Proyectadas</h4>
                  
                  {modo === 'individual' ? (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EB Oleada actual</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{metricsIndividual.ebOleada.toFixed(1)}%</div>
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EB Acumulada</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{metricsIndividual.ebAcumulada.toFixed(1)}%</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Total cosechado: {metricsIndividual.frescoAcumuladoPrevia + (Number(formData.peso_fresco) || 0)}g
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>TPB (Tasa Producción)</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{metricsIndividual.tpb.toFixed(2)}% / día</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>En {metricsIndividual.diasInoculacion} días</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>EB Consolidada</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{metricsMulti?.ebOleada.toFixed(1)}%</div>
                      </div>
                    </>
                  )}
                </div>

                {modo === 'individual' && (
                  <div className="card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                     <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Peso Seco Sustrato</h4>
                     {pesoSecoResuelto.fuente === 'manual' ? (
                       <>
                         <input type="number" step="0.1" className="form-control" value={pesoSecoManual} onChange={e => setPesoSecoManual(e.target.value)} required placeholder="g secos" />
                         <div style={{ fontSize: '0.75rem', color: 'var(--warning-color)', marginTop: '0.5rem' }}>* Requerido para EB</div>
                       </>
                     ) : (
                       <>
                         <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{metricsIndividual.pSeco.toFixed(1)} g</div>
                         <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                           Fuente: {pesoSecoResuelto.fuente === 'auditoria' ? 'Cálculo por % Materia Seca' : 'Receta del Medio'}
                         </div>
                       </>
                     )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Morfología SOLO PARA INDIVIDUAL */}
          {modo === 'individual' && selectedBatch && (
            <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Morfología de Cosecha</h3>
              
              {esCordyceps ? (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Número total de Estromas</label>
                    <input type="number" className="form-control" value={morfCordyceps.numero_estromas} onChange={e => setMorfCordyceps({...morfCordyceps, numero_estromas: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Diámetro medio (mm)</label>
                    <input type="number" step="0.1" className="form-control" value={morfCordyceps.diametro_medio_mm} onChange={e => setMorfCordyceps({...morfCordyceps, diametro_medio_mm: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado de Esporulación</label>
                    <select className="form-control" value={morfCordyceps.esporulacion_general} onChange={e => setMorfCordyceps({...morfCordyceps, esporulacion_general: e.target.value})}>
                      <option value="Ninguna">Ninguna</option>
                      <option value="Leve">Leve</option>
                      <option value="Moderada">Moderada</option>
                      <option value="Abundante">Abundante</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Distribución de Alturas</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                      {Object.entries(morfCordyceps.alturas).map(([key, data]) => (
                        <div key={key} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>{key}</div>
                          <input type="number" className="form-control" placeholder="Cant" style={{ marginBottom: '0.5rem' }} value={data.cantidad} onChange={e => updateAltura(key, 'cantidad', e.target.value)} />
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={data.esporulados} onChange={e => updateAltura(key, 'esporulados', e.target.checked)} />
                            Esporulados
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : esHericium ? (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Número Cuerpos Fructíferos</label>
                    <input type="number" className="form-control" value={morfHericium.numero_cuerpos} onChange={e => setMorfHericium({...morfHericium, numero_cuerpos: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Peso medio por cuerpo (g)</label>
                    <div className="form-control" style={{ background: 'transparent', border: 'none' }}>
                      {morfHericium.numero_cuerpos > 0 && formData.peso_fresco 
                        ? (Number(formData.peso_fresco) / Number(morfHericium.numero_cuerpos)).toFixed(1) 
                        : '0.0'} g
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Diámetro (cm)</label>
                    <input type="number" step="0.1" className="form-control" value={morfHericium.diametro_cm} onChange={e => setMorfHericium({...morfHericium, diametro_cm: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Firmeza (1-5)</label>
                    <input type="range" min="1" max="5" className="form-control" value={morfHericium.firmeza} onChange={e => setMorfHericium({...morfHericium, firmeza: e.target.value})} />
                    <div style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '0.2rem' }}>{morfHericium.firmeza}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color/Pardeamiento (1-5)</label>
                    <input type="range" min="1" max="5" className="form-control" value={morfHericium.color_pardeamiento} onChange={e => setMorfHericium({...morfHericium, color_pardeamiento: e.target.value})} />
                    <div style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '0.2rem' }}>{morfHericium.color_pardeamiento}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Esporulación</label>
                    <select className="form-control" value={morfHericium.esporulacion} onChange={e => setMorfHericium({...morfHericium, esporulacion: e.target.value})}>
                      <option value="Ausente">Ausente</option>
                      <option value="Leve">Leve</option>
                      <option value="Visible">Visible</option>
                      <option value="Abundante">Abundante</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid-2">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Morfología General</label>
                    <textarea className="form-control" rows={2} value={morfGenerica.morfologia_general} onChange={e => setMorfGenerica({...morfGenerica, morfologia_general: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tamaño Promedio</label>
                    <select className="form-control" value={morfGenerica.tamanio_promedio} onChange={e => setMorfGenerica({...morfGenerica, tamanio_promedio: e.target.value})}>
                      <option value="Pequeño">Pequeño</option>
                      <option value="Medio">Medio</option>
                      <option value="Grande">Grande</option>
                      <option value="Gigante">Gigante</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extras (Foto, Obs) COMUNES */}
          {((modo === 'individual' && selectedBatch) || ((modo === 'grupal' || modo === 'sector') && selectedMultiBatches.length > 0)) && (
            <div className="grid-2" style={{ marginTop: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows={3} value={formData.observaciones} onChange={e => setFormData({...formData, observaciones: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Foto de Cosecha</label>
                <input type="file" accept="image/*" style={{ display: 'none' }} ref={fotoInputRef} onChange={handleFotoChange} />
                <button type="button" className="btn btn-secondary" onClick={() => fotoInputRef.current?.click()}>
                  📷 {fotoFile ? fotoFile.name : 'Seleccionar foto'}
                </button>
                {fotoPreview && (
                  <img src={fotoPreview} alt="Preview" style={{ marginTop: '0.5rem', maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', objectFit: 'cover' }} />
                )}
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Subiendo... {uploadProgress}%</div>
                )}
              </div>
            </div>
          )}

          {/* Botonera */}
          {((modo === 'individual' && selectedBatch) || ((modo === 'grupal' || modo === 'sector') && selectedMultiBatches.length > 0)) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              
              {modo === 'individual' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--danger-color)', fontWeight: 'bold' }}>
                  <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={formData.es_agotado} onChange={e => setFormData({...formData, es_agotado: e.target.checked})} />
                  🚩 Marcar Lote como Agotado (Cosecha Final)
                </label>
              ) : <div />}
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : '💾 Registrar Cosecha'}
                </button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
