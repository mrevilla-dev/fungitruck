import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection, doc, onSnapshot, query, getDoc, setDoc,
  serverTimestamp, runTransaction, writeBatch, increment, where, collectionGroup, addDoc, getDocs
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import SearchableSelect from './SearchableSelect';
import ScanInput from './ScanInput';
import { labelDe } from '../utils/vocabulario';
import PrintLabelsModal from './PrintLabelsModal';
import { AddBagModal, AddSubBagModal } from './SubfraccionamientoAccordion';
import { proximaRevisionDesdeFecha } from '../utils/fechas';
import { generarIdBatch } from '../utils/idGenerator';
import { useMediosDisponibles } from '../hooks/useMediosDisponibles';
import { useMlPorPlaca } from '../hooks/useMlPorPlaca';
import toast from 'react-hot-toast';

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

const TIPO_ENVASE_OPTIONS = ['Bolsa', 'Caja', 'Cajón', 'Bandeja', 'Canasto'];

const TECNICAS = [
  'agotamiento_superficie',
  'aislamiento_monosporico',
  'subcultivo',
  'explanto_directo',
  'esporulacion_directa',
  'na',
];

const EMPTY_EVT = {
  ejemplar_origen_id: '',
  batch_origen_id: '',
  tecnica: 'subcultivo',
  temperatura_C: '',
  dias_incubacion: '',
  cantidad_derivados: 1,
  fecha: new Date().toISOString().split('T')[0],
  operario: '',
  observaciones: '',
  contenedor_id: '',
  imprimir_etiqueta: false,
  medio_prep_id: '',
  sala_destino_id: '',
  ubicacion_detalle: '',
  cantidad_unidades: null,
  modo_id: 'individual',
  medio_prep: null,
  fraccion_destino: null,
};

export default function NuevoEventoAislamientoModal({ onClose }) {
  const [formData, setFormData] = useState(EMPTY_EVT);
  const [loading, setLoading] = useState(false);
  const [mlPorPlaca, setMlPorPlaca] = useMlPorPlaca();
  const [ejemplares, setEjemplares] = useState([]);
  const [batches, setBatches] = useState([]);
  const [salas, setSalas] = useState([]);
  const [contenedores, setContenedores] = useState([]);

  const [globalEnvaseTypes, setGlobalEnvaseTypes] = useState([]);
  const [showPrint, setShowPrint] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);
  const [showSubfraccionModal, setShowSubfraccionModal] = useState(false);
  const [showSubSubModal, setShowSubSubModal] = useState(false);
  const [subfraccionesAll, setSubfraccionesAll] = useState([]);
  const [insumos, setInsumos] = useState([]);

  // Precargar usuario
  useEffect(() => {
    const auth = getAuth();
    const u = auth.currentUser;
    if (u) setFormData(prev => ({ ...prev, operario: u.displayName || u.email || 'Sistema' }));
  }, []);

  // Cargar salas
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salas'), snap => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Cargar tipos config
  useEffect(() => {
    getDoc(doc(db, 'config', 'tipos_envase')).then(docSnap => {
      if (docSnap.exists()) setGlobalEnvaseTypes(docSnap.data().tipos || []);
    }).catch(err => console.error(err));
  }, []);

  // Escuchar contenedores activos
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'contenedores')), snap => {
      setContenedores(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.eliminado));
    });
    return unsub;
  }, []);

  // Escuchar ejemplares para el SearchableSelect
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ejemplares'), snap => {
      setEjemplares(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => !e.eliminado)
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      );
    }, err => console.error('Error cargando ejemplares:', err));
    return unsub;
  }, []);

  // Escuchar batches activos (para resolver placa → ejemplar y selector de placa origen)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'batches'), where('status', 'not-in', ['Descartado', 'Contaminado'])),
      snap => {
        setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      err => console.error('Error cargando batches:', err)
    );
    return unsub;
  }, []);

  // Escuchar subfracciones (para reusar AddBagModal y conocer las bolsas existentes del medio)
  useEffect(() => {
    const unsub = onSnapshot(collectionGroup(db, 'subfracciones'), snap => {
      setSubfraccionesAll(
        snap.docs.map(d => ({ id: d.id, medioId: d.ref.parent.parent?.id, ...d.data() }))
      );
    }, err => console.error('Error cargando subfracciones:', err));
    return unsub;
  }, []);

  // Escuchar insumos_base (para opciones dinámicas de unidad en AddBagModal)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'insumos_base'), snap => {
      setInsumos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('Error cargando insumos_base:', err));
    return unsub;
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        sala_actual: formData.sala_destino_id ? salas.find(s => s.id === formData.sala_destino_id)?.nombre || '' : '',
        fecha_creacion: serverTimestamp(),
        operario: formData.operario || 'Sistema',
        estado: 'Activo',
        eliminado: false
      });
      handleChange('contenedor_id', id);
    } catch (err) {
      console.error(err);
      toast.error("Error creando contenedor");
    }
  };

  const mediosDestinoOptions = useMediosDisponibles();

  const handleSelectMedioDestino = (valId) => {
    const selectedOption = mediosDestinoOptions.find(o => o.id === valId);
    if (!selectedOption) {
      handleChange('medio_prep_id', '');
      handleChange('medio_prep', null);
      handleChange('fraccion_destino', null);
      return;
    }
    
    if (selectedOption.type === 'bulk') {
      handleChange('medio_prep_id', selectedOption.data.medio.id);
      handleChange('medio_prep', selectedOption.data.medio);
      handleChange('fraccion_destino', null);
    } else {
      handleChange('medio_prep_id', selectedOption.data.medio.id);
      handleChange('medio_prep', selectedOption.data.medio);
      handleChange('fraccion_destino', selectedOption.data.sub);
    }
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!formData.ejemplar_origen_id) {
      toast.error('Seleccioná un Ejemplar de origen.');
      return;
    }
    setLoading(true);
    try {
      const fechaStr = formData.fecha;
      const yymmdd = fechaStr.replace(/-/g, '').substring(2);
      const seqKey = `EVT_${yymmdd}`;
      const counterRef = doc(db, 'metadata', 'counters');

      // Obtener el ejemplar origen para construir el ID
      const ejemplarOrigen = ejemplares.find(e => e.id === formData.ejemplar_origen_id);
      const g = (ejemplarOrigen?.genero || '').substring(0, 3).toUpperCase().replace(/\s/g, '');
      const e = (ejemplarOrigen?.especie || '').substring(0, 3).toUpperCase().replace(/\s/g, '');

      let newId = '';
      let currentBatchSeq = 1;
      
      // 1. Obtener ID semántico mediante transacción
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        const currentSeq = (data[seqKey] || 0) + 1;
        
        const batchSeqKey = `batches_${yymmdd}`;
        currentBatchSeq = (data[batchSeqKey] || 0) + 1;

        transaction.set(counterRef, { 
          [seqKey]: currentSeq,
          [batchSeqKey]: currentBatchSeq 
        }, { merge: true });

        const nnn = String(currentSeq).padStart(3, '0');
        newId = `EVT-${g}${e}-${yymmdd}-${nnn}`;
      });

      // 2. Escribir el evento y los batches en un WriteBatch atómico
      const wb = writeBatch(db);
      const proximaRevision = await proximaRevisionDesdeFecha(formData.fecha);

      const newDocRef = doc(collection(db, 'eventos_aislamiento'));
      wb.set(newDocRef, {
        id_semantico: newId,
        ejemplar_origen_id: formData.ejemplar_origen_id,
        batch_origen_id: formData.batch_origen_id || null,
        tecnica: formData.tecnica,
        temperatura_C: formData.temperatura_C !== '' ? Number(formData.temperatura_C) : null,
        dias_incubacion: formData.dias_incubacion !== '' ? Number(formData.dias_incubacion) : null,
        cantidad_derivados: Number(formData.cantidad_derivados) || 1,
        fecha: formData.fecha,
        operario: formData.operario,
        observaciones: formData.observaciones || null,
        medio_prep_id: formData.medio_prep_id || null,
        sala_destino_id: formData.sala_destino_id || null,
        contenedor_id: formData.contenedor_id || null,
        ubicacion_detalle: formData.ubicacion_detalle || null,
        cantidad_unidades: formData.cantidad_unidades != null && formData.cantidad_unidades !== '' ? Number(formData.cantidad_unidades) : null,
        modo_id: formData.modo_id || 'individual',
        createdAt: serverTimestamp(),
      });

      const salaDestinoObj = salas.find(s => s.id === formData.sala_destino_id);

      // Crear los batches (placas madre)
      const qty = Number(formData.cantidad_derivados) || 1;
      const createdBatchIds = [];
      for (let i = 0; i < qty; i++) {
        const letra = String.fromCharCode(65 + i); // A, B, C...
        
        const m = extraerCodigoMedio(formData.medio_prep?.alias || formData.medio_prep?.codigo);
        const batchId = generarIdBatch({
          genero: ejemplarOrigen?.genero,
          especie: ejemplarOrigen?.especie,
          codigo_cepa: ejemplarOrigen?.codigo_cepa,
          es_hibridacion: false,
          codigo_medio: m,
          fecha_iso: formData.fecha,
          secuencia_diaria: currentBatchSeq,
          letra_unidad: letra,
          numero_transferencia: 1
        });

        const batchRef = doc(db, 'batches', batchId);
        const soporteFinal = formData.fraccion_destino?.tipo_unidad || formData.medio_prep?.tipo_soporte || formData.medio_prep?.soporte || 'No definido';
        
        wb.set(batchRef, {
          genero: ejemplarOrigen?.genero || '',
          especie: ejemplarOrigen?.especie || '',
          evento_aislamiento_id: newId,
          ejemplarId: formData.ejemplar_origen_id,
          batch_origen_id: formData.batch_origen_id || null,
          tecnica_aislamiento: formData.tecnica,
          operator: formData.operario || 'Sistema',
          fechaInoculacion: formData.fecha,
          proxima_revision: proximaRevision,
          status: 'Incubación',
          observaciones: formData.observaciones || '',
          tipo_inoculacion: 'aislamiento_primario',
          destino_criopreservacion: false,
          medioPrepId: formData.medio_prep?.id || null,
          fraccionId: formData.fraccion_destino?.id || null,
          destinoId: formData.sala_destino_id || null,
          contenedorId: formData.contenedor_id || null,
          ubicacionDetalle: formData.ubicacion_detalle || '',
          soporte: soporteFinal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        createdBatchIds.push({
          id: batchId,
          especie: `${ejemplarOrigen?.genero || ''} ${ejemplarOrigen?.especie || ''} ${ejemplarOrigen?.codigo_cepa || ''}`.trim(),
          tipo_inoculacion: 'aislamiento_primario',
          generacion: (ejemplarOrigen?.generacion ?? 0) + 1,
          fecha: formData.fecha,
          operario: formData.operario || 'Sistema',
          sala: salaDestinoObj ? `${salaDestinoObj.nombre} (${salaDestinoObj.tipo})` : '',
          alias: `${ejemplarOrigen?.genero || ''} ${ejemplarOrigen?.especie || ''}`.trim(),
          nombre_receta: formData.medio_prep?.nombre_receta || formData.medio_prep?.alias || 'Medio',
          tipo_uso: 'aislamiento_primario',
          tipo_etiqueta: getZplProfileForSoporte(soporteFinal)
        });
      }

      const totalDescuento = (Number(formData.cantidad_derivados) || 1) * (formData.fraccion_destino?.por_volumen || (!formData.fraccion_destino && formData.medio_prep) ? (mlPorPlaca > 0 ? mlPorPlaca : 20) : 1);
      if (formData.fraccion_destino && formData.medio_prep) {
        const medioId = formData.fraccion_destino.medioId || formData.medio_prep.id;
        if (totalDescuento > (formData.fraccion_destino.disponible ?? 0)) {
          throw new Error(`La fracción solo tiene ${formData.fraccion_destino.disponible ?? 0} ${formData.fraccion_destino.por_volumen ? 'ml' : 'unidades'} disponibles y querés consumir ${totalDescuento}`);
        }
        const sfRef = doc(db, 'medios_preparados', medioId, 'subfracciones', formData.fraccion_destino.id);
        wb.update(sfRef, { disponible: increment(-totalDescuento) });
        if ((formData.fraccion_destino.disponible ?? 0) <= totalDescuento) {
          wb.update(sfRef, { estado: 'Agotada', fecha_agotamiento: serverTimestamp() });
          const mRef = doc(db, 'medios_preparados', medioId);
          wb.update(mRef, { subfracciones_disponibles: increment(-1) });
        }
      } else if (formData.medio_prep && !formData.fraccion_destino) {
        const bulkDisp = formData.medio_prep.stock_bulk?.cantidad_actual ?? formData.medio_prep.cantidad_actual ?? 0;
        if (totalDescuento > bulkDisp) {
          throw new Error(`El medio solo tiene ${bulkDisp} ml en bulk y querés consumir ${totalDescuento} ml`);
        }
        const medioRef = doc(db, 'medios_preparados', formData.medio_prep.id);
        wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-totalDescuento) });
      }

      await wb.commit();

      // Guardar batches creados para imprimir si corresponde
      if (formData.imprimir_etiqueta) {
        const batchIds = createdBatchIds.map(b => b.id || '').filter(Boolean);
        if (batchIds.length > 0) {
          try {
            const yaEnCola = await getDocs(query(collection(db, 'cola_impresion'), where('batch_ids', 'array-contains-any', batchIds), where('estado', '==', 'Pendiente')));
            if (yaEnCola.empty) {
              const batchPorPerfil = createdBatchIds.reduce((acc, curr) => {
                if (!acc[curr.tipo_etiqueta]) acc[curr.tipo_etiqueta] = [];
                acc[curr.tipo_etiqueta].push(curr);
                return acc;
              }, {});
              for (const [perfil, batchesPerf] of Object.entries(batchPorPerfil)) {
                await addDoc(collection(db, 'cola_impresion'), {
                  modulo: 'aislamiento',
                  batch_ids: batchesPerf.map(b => b.id || '').filter(Boolean),
                  tipo_etiqueta: perfil,
                  datos_etiquetas: batchesPerf.map(b => ({
                    id: b.id || '',
                    alias: b.alias || b.especie || '',
                    nombre_receta: b.nombre_receta || '',
                    fecha: b.fecha || '',
                    operador: b.operario || '',
                    sala: b.sala || '',
                    tipo_uso: b.tipo_uso || '',
                    tipo_etiqueta: b.tipo_etiqueta || perfil,
                  })),
                  copias: 1,
                  estado: 'Pendiente',
                  fecha_generacion: serverTimestamp(),
                  operario: formData.operario || 'Sistema',
                });
              }
            }
          } catch (err) {
            console.error('Error al enviar etiquetas a la cola:', err);
          }
        }
        setCreatedBatches(createdBatchIds);
        setShowPrint(true);
      } else {
        toast.success('Evento de aislamiento registrado con ID: ' + newId);
        onClose();
      }
    } catch (err) {
      console.error(err);
      toast.error('Error: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const ejemplaresOptions = ejemplares.map(e => ({
    id: e.id,
    nombre: `${e.id_semantico || e.id} · ${e.genero ?? ''} ${e.especie ?? ''} · Gen${e.generacion ?? 0}`,
  }));

  const salasOptions = salas.map(s => ({
    id: s.id,
    nombre: s.nombre || s.id,
  }));

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

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>🔬 Registrar Evento de Aislamiento</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>

          {/* Ejemplar origen */}
          <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1200 }}>
            <label className="form-label">Ejemplar de Origen <span style={{ color: 'red' }}>*</span></label>
            <SearchableSelect
              options={ejemplaresOptions}
              value={formData.ejemplar_origen_id}
              onChange={val => handleChange('ejemplar_origen_id', val)}
              placeholder="— Buscar ejemplar —"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
              Solo se listan ejemplares. Si venís de un esporoma, generá el ejemplar con «+ Nueva Derivación» en Esporomas o crealo en Ejemplares.
            </p>
            <div style={{ marginTop: '0.5rem' }}>
              <ScanInput
                onScan={async (scannedId) => {
                  const id = scannedId.trim();

                  // Caso 1: es un batch (BAT-...) → buscar batch y extraer ejemplarId
                  if (id.startsWith('BAT-')) {
                    const batch = batches.find(b => b.id === id);
                    if (batch && batch.ejemplarId) {
                      const ejemplar = ejemplares.find(e => e.id === batch.ejemplarId);
                      if (ejemplar) {
                        handleChange('ejemplar_origen_id', ejemplar.id);
                        handleChange('batch_origen_id', batch.id);
                        toast.success(`Ejemplar seleccionado: ${ejemplar.id} (desde batch ${batch.id})`);
                        return;
                      }
                    }
                    toast.error(`No se encontró el ejemplar del batch: ${id}`);
                    return;
                  }

                  // Caso 2: es un ejemplar directo (EJE-...)
                  const opt = ejemplaresOptions.find(e => e.id === id);
                  if (opt) {
                    handleChange('ejemplar_origen_id', opt.id);
                    handleChange('batch_origen_id', '');
                    toast.success(`Ejemplar seleccionado: ${opt.nombre}`);
                  } else {
                    toast.error(`No se encontró ejemplar: ${id}`);
                  }
                }}
                label="📷 Escanear QR del Ejemplar o Placa"
              />
            </div>
          </div>

          {/* Placa de origen (opcional) */}
          {formData.ejemplar_origen_id && (
            <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1150 }}>
              <label className="form-label">
                Placa de origen (opcional)
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  — Si venís de una placa específica
                </span>
              </label>
              <SearchableSelect
                options={batches
                  .filter(b => b.ejemplarId === formData.ejemplar_origen_id)
                  .map(b => ({
                    id: b.id,
                    nombre: `${b.id} · ${b.genero || ''} ${b.especie || ''} · ${b.status}`
                  }))}
                value={formData.batch_origen_id || ''}
                onChange={val => handleChange('batch_origen_id', val)}
                placeholder="— Seleccionar placa de origen —"
              />
              <div style={{ marginTop: '0.5rem' }}>
                <ScanInput
                  onScan={async (scannedId) => {
                    const id = scannedId.trim();
                    if (!id.startsWith('BAT-')) {
                      toast.error('Escaneá un QR de placa (BAT-...)');
                      return;
                    }
                    const batch = batches.find(b => b.id === id);
                    if (!batch) {
                      toast.error(`No se encontró batch: ${id}`);
                      return;
                    }
                    if (batch.ejemplarId !== formData.ejemplar_origen_id) {
                      toast.error(`Este batch pertenece a otro ejemplar: ${batch.ejemplarId}`);
                      return;
                    }
                    handleChange('batch_origen_id', batch.id);
                    toast.success(`Placa de origen: ${batch.id}`);
                  }}
                  label="📷 Escanear QR de la Placa"
                />
              </div>
            </div>
          )}

          {/* Técnica */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Técnica <span style={{ color: 'red' }}>*</span></label>
            <select
              className="form-control" required
              value={formData.tecnica}
              onChange={e => handleChange('tecnica', e.target.value)}
            >
              {TECNICAS.map(t => <option key={t} value={t}>{labelDe('tecnica', t)}</option>)}
            </select>
          </div>

          {/* Temperatura / Días — grid 2 columnas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Temperatura (°C)</label>
              <input
                type="number" className="form-control"
                placeholder="Ej: 25"
                value={formData.temperatura_C}
                onChange={e => handleChange('temperatura_C', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Días incubación</label>
              <input
                type="number" className="form-control"
                placeholder="Ej: 14"
                value={formData.dias_incubacion}
                onChange={e => handleChange('dias_incubacion', e.target.value)}
              />
            </div>
          </div>

          {/* Cantidad derivados */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cantidad de derivados <span style={{ color: 'red' }}>*</span></label>
            <input
              type="number" className="form-control" required
              min="1"
              value={formData.cantidad_derivados}
              onChange={e => handleChange('cantidad_derivados', e.target.value)}
            />
            {(() => {
              const esVol = !!formData.fraccion_destino?.por_volumen || (!formData.fraccion_destino && !!formData.medio_prep);
              if (!esVol) return null;
              const ml = mlPorPlaca > 0 ? mlPorPlaca : 20;
              return (
                <small style={{ display: 'block', marginTop: '0.3rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  💧 Se descontarán {Math.max(1, Number(formData.cantidad_derivados) || 1) * ml} ml del frasco (a {ml} ml/placa) ·{' '}
                  <input type="number" min="1" style={{ width: '64px', display: 'inline-block' }} className="form-control" value={mlPorPlaca || ''} placeholder="20" onChange={e => setMlPorPlaca(e.target.value)} /> ml/placa
                </small>
              );
            })()}
          </div>

          {/* Fecha / Operario */}
          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fecha <span style={{ color: 'red' }}>*</span></label>
              <input
                type="date" className="form-control" required
                value={formData.fecha}
                onChange={e => handleChange('fecha', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Operario <span style={{ color: 'red' }}>*</span></label>
              <input
                type="text" className="form-control" required
                value={formData.operario}
                onChange={e => handleChange('operario', e.target.value)}
              />
            </div>
          </div>

          {/* NUEVOS CAMPOS OPERATIVOS */}
          <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1100 }}>
            <label className="form-label">Medio a usar <span style={{ color: 'red' }}>*</span></label>
            <SearchableSelect
              options={mediosDestinoOptions}
              value={formData.fraccion_destino ? formData.fraccion_destino.id : (formData.medio_prep ? formData.medio_prep.id : '')}
              onChange={handleSelectMedioDestino}
              placeholder="— Buscar medio disponible —"
            />
            <div style={{ marginTop: '0.5rem' }}>
              <ScanInput
                onScan={async (scannedId) => {
                  const id = scannedId.trim();
                  const opt = mediosDestinoOptions.find(m => m.id === id);
                  if (opt) {
                    handleSelectMedioDestino(opt.id);
                    toast.success(`Medio seleccionado: ${opt.nombre}`);
                  } else {
                    toast.error(`No se encontró medio: ${id}`);
                  }
                }}
                label="📷 Escanear QR del Medio"
              />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', fontSize: '0.85rem', padding: '0.45rem 0.8rem' }}
                disabled={!formData.medio_prep}
                onClick={() => {
                  if (formData.fraccion_destino) {
                    setShowSubSubModal(true);
                  } else {
                    setShowSubfraccionModal(true);
                  }
                }}
                title={formData.medio_prep
                  ? (formData.fraccion_destino
                    ? `Crear una subfracción desde el envase ${formData.fraccion_destino.id_bolsa || formData.fraccion_destino.id} e insertarla en este evento`
                    : 'Crear una nueva subfracción (bolsa/placa) de este medio e insertarla en este evento')
                  : 'Seleccioná primero un medio'}
              >
                {formData.fraccion_destino ? '➕ Nueva subfracción de este envase' : '➕ Nueva subfracción de este medio'}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1100 }}>
            <label className="form-label">Sala destino <span style={{ color: 'red' }}>*</span></label>
            <SearchableSelect
              options={salasOptions}
              value={formData.sala_destino_id}
              onChange={val => handleChange('sala_destino_id', val)}
              placeholder="— Seleccionar sala —"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, position: 'relative', zIndex: 1100 }}>
            <label className="form-label">Contenedor / Agrupación física <span style={{ color: 'red' }}>*</span></label>
            <SearchableSelect
              options={contenedoresOptions}
              value={formData.contenedor_id}
              onChange={val => {
                const opt = contenedoresOptions.find(o => o.id === val);
                if (opt?.data?.isNew) {
                  handleCrearContenedor(opt.data.tipo);
                } else {
                  handleChange('contenedor_id', val);
                  if (opt?.data?.sala_actual) {
                     const matchSala = salas.find(s => s.nombre === opt.data.sala_actual);
                     if (matchSala) handleChange('sala_destino_id', matchSala.id);
                  }
                }
              }}
              placeholder="— Buscar o Crear Contenedor —"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Ubicación detalle</label>
            <input
              type="text"
              className="form-control"
              placeholder="Estante, caja, etc."
              value={formData.ubicacion_detalle}
              onChange={e => handleChange('ubicacion_detalle', e.target.value)}
            />
          </div>

          {(formData.tecnica === 'subcultivo' || formData.tecnica === 'explanto_directo') && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Explantos por placa (opcional)
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>— Solo descriptivo, no afecta stock</span>
              </label>
              <input
                type="number"
                className="form-control"
                min="1"
                value={formData.cantidad_unidades || ''}
                onChange={e => handleChange('cantidad_unidades', e.target.value)}
                placeholder="Ej: 3"
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Modo de ID</label>
            <div>
              <label style={{ marginRight: '1rem' }}>
                <input
                  type="radio"
                  name="modo_id"
                  value="individual"
                  checked={formData.modo_id === 'individual'}
                  onChange={e => handleChange('modo_id', e.target.value)}
                /> Individual
              </label>
              <label>
                <input
                  type="radio"
                  name="modo_id"
                  value="global"
                  checked={formData.modo_id === 'global'}
                  onChange={e => handleChange('modo_id', e.target.value)}
                /> Global
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              <input
                type="checkbox"
                checked={formData.imprimir_etiqueta}
                onChange={e => handleChange('imprimir_etiqueta', e.target.checked)}
              /> Imprimir etiqueta ZPL
            </label>
          </div>

          {/* Observaciones */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Observaciones</label>
            <textarea
              className="form-control" rows="2"
              placeholder="Notas adicionales..."
              value={formData.observaciones}
              onChange={e => handleChange('observaciones', e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minHeight: '48px', fontSize: '1rem' }}>
            {loading ? '💾 Guardando...' : '🔬 Registrar Evento'}
          </button>
        </form>
        {showPrint && <PrintLabelsModal
          batches={createdBatches}
          onClose={() => { setShowPrint(false); onClose(); }}
          usuarioActivo={formData.operario}
          initialProfile={createdBatches[0]?.tipo_etiqueta || 'PORTAOBJETOS'}
        />}
        {showSubfraccionModal && formData.medio_prep && (
          <AddBagModal
            medio={formData.medio_prep}
            existingBags={subfraccionesAll.filter(s => s.medioId === formData.medio_prep.id)}
            salasList={salas}
            insumosList={insumos}
            onClose={() => setShowSubfraccionModal(false)}
            onAdded={() => {}}
            onCreated={(creadas) => {
              const sub = creadas[0];
              if (!sub) return;
              handleChange('medio_prep_id', sub.id);
              handleChange('medio_prep', formData.medio_prep);
              handleChange('fraccion_destino', sub);
              toast.success(`Subfracción ${sub.id_bolsa || sub.id} creada y seleccionada como destino`);
            }}
          />
        )}
        {showSubSubModal && formData.fraccion_destino && formData.medio_prep && (
          <AddSubBagModal
            medio={formData.medio_prep}
            parentBag={formData.fraccion_destino}
            existingBags={subfraccionesAll.filter(s => s.medioId === formData.medio_prep.id)}
            salasList={salas}
            insumosList={insumos}
            onClose={() => setShowSubSubModal(false)}
            onAdded={() => {}}
            onCreated={(creadas) => {
              const sub = creadas[0];
              if (!sub) return;
              handleChange('medio_prep_id', sub.id);
              handleChange('medio_prep', formData.medio_prep);
              handleChange('fraccion_destino', sub);
              toast.success(`Subfracción ${sub.id_bolsa || sub.id} creada y seleccionada como destino`);
            }}
          />
        )}
      </div>
    </div>
  );
}
