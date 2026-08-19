import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, writeBatch, doc, serverTimestamp, runTransaction, collectionGroup, increment, getDoc, setDoc, addDoc, getDocs } from 'firebase/firestore';
import SearchableSelect from './SearchableSelect';
import PrintLabelsModal from './PrintLabelsModal';
import { generarIdBatch } from '../utils/idGenerator';
import { proximaRevisionDesdeFecha } from '../utils/fechas';
import { useMlPorPlaca } from '../hooks/useMlPorPlaca';
import toast from 'react-hot-toast';

const TIPO_ENVASE_OPTIONS = ['Bolsa', 'Caja', 'Cajón', 'Bandeja', 'Canasto'];

function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

const getZplProfileForSoporte = (soporte) => {
  const s = (soporte || '').toLowerCase();
  if (s.includes('placa') || s.includes('petri')) return 'SLIM_PETRI';
  if (s.includes('eppendorf') || s.includes('tubo')) return 'PORTAOBJETOS';
  if (s.includes('frasco') || s.includes('botella')) return 'STANDARD';
  return 'STANDARD';
};

const EMPTY_CONFIG = {
  cantidad: 1,
  genero: '',
  especie: '',
  tipo_micelio: 'Monocarión',
  ploidia: 'Haploide',
  destinos: [],
  salaId: '',
  eventoManualId: '', // Por si es batch viejo (es_aislamiento_primario sin evento)
  contenedorId: '',
  revisarEtiquetas: true,
};

export default function RegistroMasivoAislamientosModal({ batchMadre, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mlPorPlaca, setMlPorPlaca] = useMlPorPlaca();
  const [config, setConfig] = useState(EMPTY_CONFIG);
  
  // Data for Step 2
  const [aislamientos, setAislamientos] = useState([]);
  const [batchesToPrint, setBatchesToPrint] = useState(null);

  // Selections
  const [allMedios, setAllMedios] = useState([]);
  const [allSubfracciones, setAllSubfracciones] = useState([]);
  const [salas, setSalas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [globalEnvaseTypes, setGlobalEnvaseTypes] = useState([]);
  const [contenedores, setContenedores] = useState([]);

  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      genero: batchMadre.genero || '',
      especie: batchMadre.especie || '',
    }));
  }, [batchMadre]);

  useEffect(() => {
    const unsubMedios = onSnapshot(collection(db, 'medios_preparados'), snap => {
      setAllMedios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSubfrac = onSnapshot(collectionGroup(db, 'subfracciones'), snap => {
      setAllSubfracciones(snap.docs.map(d => ({ id: d.id, medioId: d.ref.parent.parent?.id, ...d.data() })));
    });
    const unsubSalas = onSnapshot(collection(db, 'salas'), snap => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubMedios(); unsubSubfrac(); unsubSalas(); };
  }, []);

  useEffect(() => {
    getDoc(doc(db, 'config', 'tipos_envase')).then(docSnap => {
      if (docSnap.exists()) setGlobalEnvaseTypes(docSnap.data().tipos || []);
    }).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'contenedores')), snap => {
      setContenedores(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.eliminado));
    });
    return unsub;
  }, []);

  const mediosDestinoOptions = useMemo(() => {
    const options = [];
    allMedios.forEach(m => {
      if (m.estado === 'Activo' || m.estado === 'Disponible' || m.estado === 'Aprobado') {
        const bulkCant = m.stock_bulk?.cantidad_actual ?? m.cantidad_actual ?? 0;
        if (bulkCant > 0) {
          options.push({
            id: m.id,
            nombre: `${m.alias || ''} · ID: ${m.id} · ${m.nombre_receta} (Bulk) — ${bulkCant} ${m.stock_bulk?.unidad || 'ml'} disponibles`,
            type: 'bulk',
            data: { medio: m }
          });
        }
      }

      const subs = allSubfracciones.filter(s => s.medioId === m.id && s.disponible > 0);
      subs.forEach(s => {
        options.push({
          id: s.id,
          nombre: `${m.alias || m.nombre_receta || m.recetaNombre || ''} → ${s.id_bolsa || s.id} — ${s.tipo_unidad || 'Unidad'} — ${s.disponible}/${s.cantidad} disponibles`,
          type: 'sub',
          data: { medio: m, sub: s }
        });
      });
    });
    return options;
  }, [allMedios, allSubfracciones]);

  const envaseOptions = useMemo(() => {
    return Array.from(new Set([...TIPO_ENVASE_OPTIONS, ...globalEnvaseTypes, 'Otro']));
  }, [globalEnvaseTypes]);

  const contenedoresOptions = useMemo(() => {
    const arr = contenedores.map(c => ({
      id: c.id,
      nombre: `[Existente] ${c.id} · ${c.nombre} (${c.sala_actual || 'Sin sala'})`,
      data: c
    }));
    
    envaseOptions.forEach(tipo => {
      arr.push({
        id: `NEW_${tipo}`,
        nombre: `➕ [Nuevo] Crear contenedor de tipo: ${tipo}`,
        data: { isNew: true, tipo }
      });
    });
    return arr;
  }, [contenedores, envaseOptions]);

  const handleAddDestino = (valId) => {
    const selectedOption = mediosDestinoOptions.find(o => o.id === valId);
    if (!selectedOption) return;
    
    if (config.destinos.some(d => d.id === valId)) return;
    
    const newDestino = {
      id: valId,
      medio_prep: selectedOption.data.medio,
      fraccion_destino: selectedOption.type === 'bulk' ? null : selectedOption.data.sub,
      nombre: selectedOption.nombre
    };
    
    handleConfigChange('destinos', [...config.destinos, newDestino]);
  };

  const handleRemoveDestino = (valId) => {
    handleConfigChange('destinos', config.destinos.filter(d => d.id !== valId));
  };

  // Fetch eventos if batchMadre doesn't have one
  useEffect(() => {
    if (!batchMadre.evento_aislamiento_id && batchMadre.es_aislamiento_primario) {
      const unsub = onSnapshot(collection(db, 'eventos_aislamiento'), snap => {
        setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsub;
    }
  }, [batchMadre]);

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleCrearContenedor = async (tipoPredefinido = 'Otro') => {
    const nombre = window.prompt(`Nombre del nuevo contenedor (${tipoPredefinido}):`);
    if (!nombre) return;
    const f = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const r = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const id = `CONT-${f}-${r}`;
    
    try {
      await setDoc(doc(db, 'contenedores', id), {
        id,
        nombre,
        tipo: tipoPredefinido,
        sala_actual: config.salaId ? salas.find(s => s.id === config.salaId)?.nombre || '' : '',
        fecha_creacion: serverTimestamp(),
        operario: batchMadre.operario || 'Sistema',
        estado: 'Activo',
        eliminado: false
      });
      handleConfigChange('contenedorId', id);
    } catch (err) {
      console.error(err);
      toast.error("Error creando contenedor");
    }
  };

  const handleNextToStep2 = () => {
    if (!config.cantidad || config.cantidad < 1) return toast.error("Cantidad inválida");
    if (config.destinos.length === 0 || !config.salaId) return toast.error("Seleccioná al menos un medio y la sala destino");
    if (!batchMadre.evento_aislamiento_id && !config.eventoManualId) return toast.error("Seleccioná un Evento de Aislamiento de origen");

    const newAislamientos = [];
    const padreCode = `${(config.genero || 'XX').substring(0,3).toUpperCase()}${(config.especie || 'XX').substring(0,3).toUpperCase()}`;
    for (let i = 0; i < config.cantidad; i++) {
      const n = String(i + 1).padStart(3, '0');
      newAislamientos.push({
        idTemporal: i,
        numero: n,
        codigo_cepa: `${padreCode}-H${n}`,
        observaciones: '',
        foto: null, // Si quieren pueden meter File después
        descartar: false
      });
    }
    setAislamientos(newAislamientos);
    setStep(2);
  };

  const updateAislamiento = (index, field, value) => {
    const arr = [...aislamientos];
    arr[index] = { ...arr[index], [field]: value };
    setAislamientos(arr);
  };

  const handleSubmit = async () => {
    const validos = aislamientos.filter(a => !a.descartar);
    if (validos.length === 0) return toast.error("No hay aislamientos válidos para registrar");
    if (config.destinos.length === 0) return toast.error("Debe seleccionar al menos un medio destino");

    setLoading(true);
    try {
      const eventoId = batchMadre.evento_aislamiento_id || config.eventoManualId;
      if (!eventoId) throw new Error("Falta Evento de Aislamiento");

      const sala = salas.find(s => s.id === config.salaId);
      
      let currentSeqEje = 0;
      const yymmdd = new Date().toISOString().split('T')[0].replace(/-/g, '').substring(2);
      const seqKeyEje = `EJE_${yymmdd}`;

      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const counterDoc = await transaction.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        currentSeqEje = data[seqKeyEje] || 0;
        transaction.set(counterRef, { [seqKeyEje]: currentSeqEje + validos.length }, { merge: true });
      });

      const wb = writeBatch(db);
      const createdBatchesData = [];
      
      const g = (config.genero || 'XX').substring(0, 3).toUpperCase().replace(/\s/g, '');
      const e = (config.especie || 'XXX').substring(0, 3).toUpperCase().replace(/\s/g, '');
      const fDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
      let startBatchSeq = 1;
      const batchSeqKey = `batches_${yymmdd}`;
      
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const counterDoc = await t.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        
        startBatchSeq = (data[batchSeqKey] || 0) + 1;
        t.set(counterRef, { [batchSeqKey]: startBatchSeq + validos.length - 1 }, { merge: true });
      });

      let globalLetraIdx = 0;

      const fechaInoculacion = batchMadre.fecha || new Date().toISOString().split('T')[0];
      const proximaRevision = await proximaRevisionDesdeFecha(fechaInoculacion);

      for (let i = 0; i < validos.length; i++) {
        const ais = validos[i];
        currentSeqEje++;
        
        // 1. Crear Ejemplar
        const nnn = String(currentSeqEje).padStart(3, '0');
        const cepa = ais.codigo_cepa ? `-${ais.codigo_cepa}` : '';
        const tm = 'AGA';
        const idSemanticoEje = `EJE-${g}${e}${cepa}-${tm}-${yymmdd}-${nnn}`;
        
        const ejemplarRef = doc(db, 'ejemplares', idSemanticoEje);
        const ejemplarData = {
          genero: config.genero,
          especie: config.especie,
          codigo_cepa: ais.codigo_cepa,
          tipo_micelio: config.tipo_micelio,
          ploidia: config.ploidia,
          mat: 'No determinado',
          evento_aislamiento_id: eventoId,
          ejemplarPadreId: batchMadre.ejemplarId || null,
          batch_origen_id: batchMadre.id,
          estado: 'Activo',
          tecnica_aislamiento: 'aislamiento_colonias', // Genérico
          generacion: (batchMadre.generacion ?? 0) + 1,
          observaciones: ais.observaciones,
          id_semantico: idSemanticoEje,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        wb.set(ejemplarRef, ejemplarData);

        // 2. Crear Batches (1 por cada destino seleccionado)
        for (let idx = 0; idx < config.destinos.length; idx++) {
          const dest = config.destinos[idx];
          const letra = String.fromCharCode(65 + (globalLetraIdx % 26)); // A, B, etc.
          globalLetraIdx++;
          
          const m = extraerCodigoMedio(dest.medio_prep?.alias || dest.medio_prep?.nombre_receta || dest.medio_prep?.codigo);
          
          const numTrans = (batchMadre.numero_transferencia || 1) + 1; // Repique del madre

          const batchId = generarIdBatch({
            genero: config.genero,
            especie: config.especie,
            codigo_cepa: ais.codigo_cepa,
            es_hibridacion: false,
            codigo_medio: m,
            fecha_iso: new Date().toISOString(),
            secuencia_diaria: startBatchSeq + i,
            letra_unidad: letra,
            numero_transferencia: numTrans
          });
          
          const sala = salas.find(s => s.id === config.salaId);
          
          wb.set(doc(db, 'batches', batchId), {
            experimento_id: null,
            tratamiento_id: null,
            atributos_experimentales: {},
            genero: config.genero || '',
            especie: config.especie || '',
            ejemplarId: null,
            evento_aislamiento_id: batchMadre.evento_aislamiento_id || config.eventoManualId,
            medioPrepId: dest.medio_prep?.id || null,
            destinoId: config.salaId,
            destinoNombre: sala ? `${sala.nombre} (${sala.tipo})` : '',
            tipo_inoculacion: 'repique',
            status: 'Inoculado',
            destino_criopreservacion: false,
            batch_origen_id: batchMadre.id,
            fechaInoculacion,
            proxima_revision: proximaRevision,
            contenedorId: config.contenedorId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          createdBatchesData.push({
            id: batchId,
            especie: `${config.genero || ''} ${config.especie || ''} ${ais.codigo_cepa || ''}`.trim(),
            tipo_inoculacion: 'repique',
            generacion: (batchMadre.generacion ?? 0) + 1,
            mat: 'No determinado',
            fecha: batchMadre.fecha || new Date().toISOString().split('T')[0],
            operario: batchMadre.operario || 'Sistema',
            sala: sala ? `${sala.nombre} (${sala.tipo})` : '',
            contenedorId: config.contenedorId || null,
            alias: `${config.genero || ''} ${config.especie || ''}`.trim(),
            nombre_receta: dest.medio_prep?.nombre_receta || dest.medio_prep?.alias || 'Medio',
            medio_origen_alias: batchMadre.id,
            tipo_uso: 'repique',
            tipo_etiqueta: getZplProfileForSoporte?.(dest.fraccion_destino ? dest.fraccion_destino.tipo_unidad : 'Indefinido') || 'default'
          });
          
          if (dest.fraccion_destino) {
            const sfRef = doc(db, 'medios_preparados', dest.medio_prep.id, 'subfracciones', dest.fraccion_destino.id);
            const esVol = !!dest.fraccion_destino.por_volumen;
            const descuento = esVol ? (mlPorPlaca > 0 ? mlPorPlaca : 20) : 1;
            const disp = dest.fraccion_destino.disponible ?? 0;
            if (descuento > disp) {
              throw new Error(`La fracción solo tiene ${disp} ${esVol ? 'ml' : 'unidades'} disponibles y querés consumir ${descuento}`);
            }
            wb.update(sfRef, { disponible: increment(-descuento) });
            if (disp <= descuento) {
              wb.update(sfRef, { estado: 'Agotada', fecha_agotamiento: serverTimestamp() });
              const mRef = doc(db, 'medios_preparados', dest.medio_prep.id);
              wb.update(mRef, { subfracciones_disponibles: increment(-1) });
            }
          } else {
            const bulkDisp = dest.medio_prep.stock_bulk?.cantidad_actual ?? dest.medio_prep.cantidad_actual ?? 0;
            const descuento = mlPorPlaca > 0 ? mlPorPlaca : 20;
            if (descuento > bulkDisp) {
              throw new Error(`El medio solo tiene ${bulkDisp} ml en bulk y querés consumir ${descuento} ml`);
            }
            const mRef = doc(db, 'medios_preparados', dest.medio_prep.id);
            wb.update(mRef, { 'stock_bulk.cantidad_actual': increment(-descuento) });
          }
        }
      }

      wb.update(doc(db, 'batches', batchMadre.id), { status: 'Agotado', updatedAt: serverTimestamp() });

      await wb.commit();
      
      if (config.revisarEtiquetas) {
        setBatchesToPrint(createdBatchesData);
      } else {
        const batchPorPerfil = createdBatchesData.reduce((acc, curr) => {
          if (!acc[curr.tipo_etiqueta]) acc[curr.tipo_etiqueta] = [];
          acc[curr.tipo_etiqueta].push(curr);
          return acc;
        }, {});
        
        for (const [perfil, batchesPerf] of Object.entries(batchPorPerfil)) {
           await addDoc(collection(db, 'cola_impresion'), {
             modulo: 'medios',
             batch_ids: batchesPerf.map(b => b.id),
             tipo_etiqueta: perfil,
             datos_etiquetas: batchesPerf.map(batch => ({
                id: batch.id || '',
                alias: batch.alias || batch.especie || '',
                nombre_receta: batch.nombre_receta || '',
                fecha: batch.fecha || '',
                operador: batch.operario || '',
                medio_origen_alias: batch.medio_origen_alias || '',
                tipo_uso: batch.tipo_uso || '',
             })),
             copias: 1,
             estado: 'Pendiente',
             fecha_generacion: serverTimestamp(),
             operario: batchMadre.operario || 'Sistema',
           });
        }

        toast.success(`Se registraron ${validos.length} Aislamientos.`);
        if (onSaved) onSaved();
        onClose();
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      toast.error('Error: ' + err.message);
      setLoading(false);
    }
  };

  const eventoOptions = eventos.map(e => ({
    id: e.id,
    nombre: `${e.id_semantico || e.id} - ${e.fecha || ''} - ${e.tecnica || ''}`
  }));

  if (batchesToPrint) {
    return (
      <PrintLabelsModal 
        batches={batchesToPrint} 
        usuarioActivo={batchMadre.operario || 'Sistema'}
        initialProfile={batchesToPrint[0]?.tipo_etiqueta}
        onClose={() => {
          setBatchesToPrint(null);
          if (onSaved) onSaved();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>🧫 Registrar Aislamientos Obtenidos</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {step === 1 && (
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            <div className="grid-1">
              <div className="form-group">
                <label className="form-label">Cantidad de aislamientos obtenidos <span style={{ color: 'red' }}>*</span></label>
                <input type="number" min="1" className="form-control" value={config.cantidad} onChange={e => handleConfigChange('cantidad', Number(e.target.value))} />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Género</label>
                <input type="text" className="form-control" value={config.genero} onChange={e => handleConfigChange('genero', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Especie</label>
                <input type="text" className="form-control" value={config.especie} onChange={e => handleConfigChange('especie', e.target.value)} />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Tipo de micelio esperado</label>
                <select className="form-control" value={config.tipo_micelio} onChange={e => handleConfigChange('tipo_micelio', e.target.value)}>
                  <option value="Monocarión">Monocarión</option>
                  <option value="Desconocido">Desconocido</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ploidía esperada</label>
                <select className="form-control" value={config.ploidia} onChange={e => handleConfigChange('ploidia', e.target.value)}>
                  <option value="Haploide">Haploide</option>
                  <option value="Diploide">Diploide</option>
                  <option value="No determinado">No determinado</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group" style={{ zIndex: 1200 }}>
                <label className="form-label">Medios a usar (múltiple) <span style={{ color: 'red' }}>*</span></label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <SearchableSelect
                    options={mediosDestinoOptions}
                    value=""
                    onChange={handleAddDestino}
                    placeholder="-- Agregar Medio --"
                  />
                </div>
                {config.destinos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {config.destinos.map(d => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem' }}>{d.nombre}</span>
                        <button className="btn-icon" style={{ color: 'var(--danger-color)' }} onClick={() => handleRemoveDestino(d.id)}>❌</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sala destino <span style={{ color: 'red' }}>*</span></label>
                <select className="form-control" value={config.salaId} onChange={e => handleConfigChange('salaId', e.target.value)}>
                  <option value="">-- Seleccionar Sala --</option>
                  {salas.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.tipo})</option>)}
                </select>
              </div>
            </div>

            <div className="grid-1">
              <div className="form-group" style={{ zIndex: 1100 }}>
                <label className="form-label">Contenedor / Agrupación física (opcional)</label>
                <SearchableSelect
                  options={contenedoresOptions}
                  value={config.contenedorId}
                  onChange={val => {
                    const opt = contenedoresOptions.find(o => o.id === val);
                    if (opt?.data?.isNew) {
                      handleCrearContenedor(opt.data.tipo);
                    } else {
                      handleConfigChange('contenedorId', val);
                      if (opt?.data?.sala_actual) {
                         const matchSala = salas.find(s => s.nombre === opt.data.sala_actual);
                         if (matchSala) handleConfigChange('salaId', matchSala.id);
                      }
                    }
                  }}
                  placeholder="— Buscar o Crear Contenedor —"
                />
              </div>
            </div>

            <div className="form-group" style={{ zIndex: 1000 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem', padding: '0.5rem', background: 'var(--surface-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <input
                  type="checkbox"
                  checked={config.revisarEtiquetas}
                  onChange={e => handleConfigChange('revisarEtiquetas', e.target.checked)}
                  style={{ transform: 'scale(1.2)' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Revisar etiquetas antes de imprimir/guardar</span>
              </label>
            </div>

            {!batchMadre.evento_aislamiento_id && batchMadre.es_aislamiento_primario && (
              <div className="form-group" style={{ background: '#fff3cd', padding: '1rem', borderRadius: '8px', border: '1px solid #ffeeba' }}>
                <label className="form-label">⚠️ Placa antigua: vincular a Evento de Aislamiento</label>
                <SearchableSelect 
                  options={eventoOptions}
                  value={config.eventoManualId}
                  onChange={v => handleConfigChange('eventoManualId', v)}
                  placeholder="Buscar evento..."
                />
              </div>
            )}

            <button className="btn btn-primary" onClick={handleNextToStep2} style={{ marginTop: '1rem' }}>
              Siguiente: Revisar aislamientos ➡️
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: '1rem' }}>
            <p>Se registrarán <strong>{aislamientos.length}</strong> aislamientos. Revisá y ajustá los detalles individuales:</p>
            
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem', width: '50px' }}>Nº</th>
                    <th style={{ padding: '0.75rem', width: '180px' }}>Código Sugerido</th>
                    <th style={{ padding: '0.75rem' }}>Observaciones Morfológicas</th>
                    <th style={{ padding: '0.75rem', width: '100px', textAlign: 'center' }}>Descartar</th>
                  </tr>
                </thead>
                <tbody>
                  {aislamientos.map((ais, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', opacity: ais.descartar ? 0.5 : 1 }}>
                      <td style={{ padding: '0.75rem' }}>{ais.numero}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                          value={ais.codigo_cepa} 
                          onChange={e => updateAislamiento(idx, 'codigo_cepa', e.target.value)} 
                          disabled={ais.descartar}
                        />
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <input 
                          type="text" 
                          className="form-control" 
                          style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                          placeholder="Color, vigor, tipo de borde..."
                          value={ais.observaciones} 
                          onChange={e => updateAislamiento(idx, 'observaciones', e.target.value)} 
                          disabled={ais.descartar}
                        />
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={ais.descartar}
                          onChange={e => updateAislamiento(idx, 'descartar', e.target.checked)}
                          style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep(1)} disabled={loading}>
                ⬅️ Volver
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSubmit} disabled={loading}>
                {loading ? '💾 Guardando...' : '💾 Confirmar Registro Masivo'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
