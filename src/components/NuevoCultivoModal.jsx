import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, where, getDocs, doc, getDoc, collectionGroup, writeBatch, serverTimestamp, updateDoc, increment, setDoc, runTransaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import SearchableSelect from './SearchableSelect';
import { PROFILES } from '../utils/zplProfiles';
import PrintLabelsModal from './PrintLabelsModal';
import HibridacionEjemplarModal from './HibridacionEjemplarModal';
import NuevoEventoAislamientoModal from './NuevoEventoAislamientoModal';
import toast from 'react-hot-toast';
import { generarIdBatch, incrementarSecuenciaHibridacion } from '../utils/idGenerator';
import AltaRapidaEjemplarExterno from './AltaRapidaEjemplarExterno';
import ScanInput from './ScanInput';
import { OPERARIOS } from '../constants/operarios';

const TIPOS_INOCULACION = [
  { id: 'aislamiento_primario', label: 'Aislamiento Primario (Origen Cero)' },
  { id: 'placa_a_liquido', label: 'Placa Agar → Medio Líquido' },
  { id: 'liquido_a_liquido', label: 'Medio Líquido → Medio Líquido (Expansión)' },
  { id: 'hacia_grano', label: 'Hacia Grano (Spawn)' },
  { id: 'hacia_sustrato', label: 'Hacia Sustrato Definitivo' },
  { id: 'placa_a_placa', label: 'Placa Agar → Placa Agar (Repique)' },
];

const TIPO_ENVASE_OPTIONS = ['Bolsa', 'Caja', 'Cajón', 'Bandeja', 'Canasto'];

function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export default function NuevoCultivoModal({ onClose, onSaved }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [batchesToPrint, setBatchesToPrint] = useState(null);
  const [hibridacionResult, setHibridacionResult] = useState(null);
  const [repiqueResult, setRepiqueResult] = useState(null);
  const [formData, setFormData] = useState({
    tipo_inoculacion: '',
    ejemplar_fuente: null,
    ejemplar_fuente_2: null,
    es_hibridacion: false,
    es_seleccion_colonia: false,
    placa_origen: null,
    placa_origen_2: null,
    batch_liquido: null,
    fraccion_placa: '1/8',
    fraccion_placa_2: '1/8',
    origen_declarado_agotado: false,
    origen_declarado_agotado_2: false,
    cantidad_inoculo: '',
    unidad_inoculo: 'mL',
    medio_prep: null,
    fraccion_destino: null,
    cantidad_unidades: 1,
    modo_id: 'individual',
    cantidad_total: 1,
    contenedor_logico: '',
    origen_grano_tipo_material: 'interno',
    origen_grano_tipo_batch: 'grano',
    batch_grano: null,
    peso_humedo_unidad: '',
    unidad_peso_humedo: 'kg',
    fecha_inoculacion: new Date().toISOString().split('T')[0],
    operario: '',
    observaciones: '',
    ufc: '',
    sala_destino: null,
    estante: '',
    perfil_zpl: 'MEDIO_ESTANDAR',
    contenedorId: null
  });
  const [ejemplares, setEjemplares] = useState([]);
  const [batchesOrigen, setBatchesOrigen] = useState([]);
  const [batchesOrigen2, setBatchesOrigen2] = useState([]);
  const [batchesLiquido, setBatchesLiquido] = useState([]);
  const [allMedios, setAllMedios] = useState([]);
  const [allSubfracciones, setAllSubfracciones] = useState([]);
  const [salas, setSalas] = useState([]);
  const [globalEnvaseTypes, setGlobalEnvaseTypes] = useState([]);
  const [contenedores, setContenedores] = useState([]);

  const [tipoContenedor, setTipoContenedor] = useState('');
  const [otroContenedorNombre, setOtroContenedorNombre] = useState('');
  const [nextSeqDiaria, setNextSeqDiaria] = useState(1);
  const [nextContadorHib, setNextContadorHib] = useState(1);
  const [showSubfraccionModal, setShowSubfraccionModal] = useState(false);
  const [busquedaPorEnvase, setBusquedaPorEnvase] = useState(false);
  const [envaseSeleccionado, setEnvaseSeleccionado] = useState('');
  const [subfracTipo, setSubfracTipo] = useState('Bolsa');
  const [subfracCantidad, setSubfracCantidad] = useState('');
  const [subfracSaving, setSubfracSaving] = useState(false);

  useEffect(() => {
    const fetchNextSeq = async () => {
      try {
        const dateKey = formData.fecha_inoculacion.replace(/-/g, '').substring(2);
        const batchSeqKey = `batches_${dateKey}`;
        const counterDoc = await getDoc(doc(db, 'metadata', 'counters'));
        const data = counterDoc.exists() ? counterDoc.data() : {};
        setNextSeqDiaria((data[batchSeqKey] || 0) + 1);

        if (formData.es_hibridacion && formData.ejemplar_fuente) {
          const g = (formData.ejemplar_fuente.data?.genero || 'UNK').toLowerCase().replace(/\s+/g, '_');
          const e = (formData.ejemplar_fuente.data?.especie || 'UNK').toLowerCase().replace(/\s+/g, '_');
          const fieldName = `hibridacion_${g}_${e}`;
          setNextContadorHib((data[fieldName] || 0) + 1);
        }
      } catch (err) {
        console.error("Error fetching next seq:", err);
      }
    };
    fetchNextSeq();
  }, [formData.fecha_inoculacion, formData.es_hibridacion, formData.ejemplar_fuente]);

  // Helper to create new container
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
        sala_actual: formData.sala_destino?.nombre || formData.sala_destino?.data?.nombre || '',
        fecha_creacion: serverTimestamp(),
        operario: formData.operario || 'Sistema',
        estado: 'Activo',
        eliminado: false
      });
      handleChange('contenedorId', id);
    } catch (err) {
      console.error(err);
      toast.error("Error creando contenedor");
    }
  };

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser && !formData.operario) {
      const name = auth.currentUser.displayName || auth.currentUser.email || '';
      if (OPERARIOS.includes(name)) {
        setFormData(prev => ({ ...prev, operario: name }));
      }
    }

    getDoc(doc(db, 'config', 'tipos_envase')).then(docSnap => {
      if (docSnap.exists()) setGlobalEnvaseTypes(docSnap.data().tipos || []);
    }).catch(err => console.error(err));

    const unsubEje = onSnapshot(query(collection(db, 'ejemplares'), where('estado', '==', 'Activo')), snap => {
      setEjemplares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubMedios = onSnapshot(collection(db, 'medios_preparados'), snap => {
      setAllMedios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSubfrac = onSnapshot(collectionGroup(db, 'subfracciones'), snap => {
      const subsData = snap.docs.map(d => ({ 
        id: d.id, 
        medioId: d.ref.parent.parent?.id, 
        ...d.data() 
      }));
      setAllSubfracciones(subsData);
    });

    const unsubSalas = onSnapshot(collection(db, 'salas'), snap => {
      setSalas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCont = onSnapshot(query(collection(db, 'contenedores'), where('eliminado', '==', false)), snap => {
      setContenedores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubEje(); unsubMedios(); unsubSubfrac(); unsubSalas(); unsubCont(); };
  }, []);

  useEffect(() => {
    if (!formData.ejemplar_fuente || formData.tipo_inoculacion === 'aislamiento_primario') {
      setBatchesOrigen([]);
      return;
    }
    const q = query(
      collection(db, 'batches'), 
      where('ejemplarId', '==', formData.ejemplar_fuente.id),
      where('status', 'in', ['Activo', 'Incubando', 'Incubación', 'Inoculado'])
    );
    getDocs(q).then(snap => {
      setBatchesOrigen(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status !== 'Planificado'));
    }).catch(err => {
      getDocs(query(collection(db, 'batches'), where('ejemplarId', '==', formData.ejemplar_fuente.id))).then(snap2 => {
         setBatchesOrigen(snap2.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => ['Activo', 'Incubando', 'Incubación', 'Inoculado'].includes(b.status) && b.status !== 'Planificado'));
      });
    });
  }, [formData.ejemplar_fuente]);

  // Cargar batches para segundo ejemplar (hibridación)
  useEffect(() => {
    if (!formData.ejemplar_fuente_2) {
      setBatchesOrigen2([]);
      return;
    }
    const q = query(
      collection(db, 'batches'), 
      where('ejemplarId', '==', formData.ejemplar_fuente_2.id),
      where('status', 'in', ['Activo', 'Incubando', 'Incubación', 'Inoculado'])
    );
    getDocs(q).then(snap => {
      setBatchesOrigen2(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status !== 'Planificado'));
    }).catch(err => {
      getDocs(query(collection(db, 'batches'), where('ejemplarId', '==', formData.ejemplar_fuente_2.id))).then(snap2 => {
         setBatchesOrigen2(snap2.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => ['Activo', 'Incubando', 'Incubación', 'Inoculado'].includes(b.status) && b.status !== 'Planificado'));
      });
    });
  }, [formData.ejemplar_fuente_2]);

  const envaseOptions = useMemo(() => {
    return Array.from(new Set([...TIPO_ENVASE_OPTIONS, ...globalEnvaseTypes, 'Otro']));
  }, [globalEnvaseTypes]);

  const ejemplaresOptions = ejemplares.map(e => ({
    id: e.id,
    nombre: `${e.genero || ''} ${e.especie || ''} · Gen${e.generacion ?? 0} · ${e.id_semantico || e.id} · ${e.mat || ''}`,
    data: e
  }));

  const renderEjemplarOption = (opt, isSelected) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          {opt.data?.genero || ''} {opt.data?.especie || ''} · Gen{opt.data?.generacion ?? 0}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {opt.data?.id_semantico || opt.id} · {opt.data?.mat || ''}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(opt.data?.id_semantico || opt.id); toast.success('ID copiado'); }}
        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
        title="Copiar ID"
      >📋</button>
    </div>
  );

  const placaOrigenOptions = batchesOrigen.map(b => ({
    id: b.id,
    nombre: `${b.id} · ${b.fecha_inoculacion || b.fechaInoculacion || ''} · 📍 ${b.destinoNombre || b.sala_actual || 'Sin sala'}`,
    data: b
  }));

  const placaOrigenOptions2 = batchesOrigen2.map(b => ({
    id: b.id,
    nombre: `${b.id} · ${b.fecha_inoculacion || b.fechaInoculacion || ''} · 📍 ${b.destinoNombre || b.sala_actual || 'Sin sala'}`,
    data: b
  }));

  const liquidoOrigenOptions = batchesOrigen.map(b => ({
    id: b.id,
    nombre: `${b.id} · ${b.fecha_inoculacion || b.fechaInoculacion || ''} · 📍 ${b.destinoNombre || b.sala_actual || 'Sin sala'}`,
    data: b
  }));

  const granoOrigenOptions = batchesOrigen.map(b => ({
    id: b.id,
    nombre: `${b.id} · ${b.fecha_inoculacion || b.fechaInoculacion || ''} · 📍 ${b.destinoNombre || b.sala_actual || 'Sin sala'}`,
    data: b
  }));

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

  const mediosDestinoOptions = useMemo(() => {
    const options = [];
    allMedios.forEach(m => {
      if (m.eliminado === true) return;
      if (formData.tipo_inoculacion === 'placa_a_placa') {
        if (m.categoria !== 'Agar') return;
      } else if (['placa_a_liquido', 'liquido_a_liquido'].includes(formData.tipo_inoculacion)) {
        if (m.categoria !== 'Líquido' && m.categoria !== 'Liquido') return;
      } else if (formData.tipo_inoculacion === 'liquido_a_grano') {
        if (m.categoria !== 'Semilla') return;
      }

      if (busquedaPorEnvase && envaseSeleccionado) {
        const subfraccionesConEnvase = allSubfracciones.filter(s => 
          s.medioId === m.id && 
          s.disponible > 0 &&
          (s.tipo_unidad || '').toLowerCase().includes(envaseSeleccionado.toLowerCase())
        );
        if (subfraccionesConEnvase.length === 0) return;
        subfraccionesConEnvase.forEach(s => {
          options.push({
            id: s.id,
            nombre: `${s.id_bolsa} · ${s.tipo_unidad} — ${s.disponible}/${s.cantidad} disp.`,
            type: 'sub',
            data: { medio: m, sub: s }
          });
        });
        return;
      }

      if (m.estado === 'Activo') {
        const bulkCant = m.stock_bulk?.cantidad_actual ?? m.cantidad_actual ?? 0;
        if (bulkCant > 0) {
          options.push({
            id: m.id,
            nombre: `${m.alias || m.nombre_receta} (Bulk) — ${bulkCant} ${m.stock_bulk?.unidad || 'ml'} disponibles`,
            type: 'bulk',
            data: { medio: m }
          });
        }
      }

      const subs = allSubfracciones.filter(s => s.medioId === m.id && s.disponible > 0);
      subs.forEach(s => {
        const esHija = s.parent_id ? ` ↳ (Hijo de ${s.parent_id})` : '';
        options.push({
          id: s.id,
          nombre: `${m.alias || m.nombre_receta} → ${s.id_bolsa || 'Soporte'}${esHija} — ${s.tipo_unidad || 'Unidad'} — ${s.disponible}/${s.cantidad} disp. ${s.volumen_por_unidad_ml ? `· ${s.volumen_por_unidad_ml} ml/u` : ''}`,
          type: 'sub',
          data: { medio: m, sub: s }
        });
      });
    });
    return options;
  }, [allMedios, allSubfracciones, formData.tipo_inoculacion, busquedaPorEnvase, envaseSeleccionado]);

  const salasOptions = salas.map(s => ({
    id: s.id,
    nombre: `${s.nombre} ${s.tipo ? `(${s.tipo})` : ''}`,
    data: s
  }));

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'tipo_inoculacion') {
        next.ejemplar_fuente = null;
        next.ejemplar_fuente_2 = null;
        next.es_hibridacion = false;
        next.placa_origen = null;
        next.placa_origen_2 = null;
        next.batch_liquido = null;
        next.batch_grano = null;
        next.medio_prep = null;
        next.fraccion_destino = null;
        next.origen_grano_tipo_material = 'interno';
        next.origen_grano_tipo_batch = value === 'hacia_sustrato' ? 'grano' : 'grano';
      }
      if (field === 'cantidad_unidades') {
        next.cantidad_total = value;
      }
      return next;
    });
  };

  const handleSelectMedioDestino = (valId) => {
    const selectedOption = mediosDestinoOptions.find(o => o.id === valId);
    if (!selectedOption) {
      handleChange('medio_prep', null);
      handleChange('fraccion_destino', null);
      return;
    }
    
    const fraccion = selectedOption.type === 'bulk' ? null : selectedOption.data.sub;
    
    if (selectedOption.type === 'bulk') {
      handleChange('medio_prep', selectedOption.data.medio);
      handleChange('fraccion_destino', null);
    } else {
      handleChange('medio_prep', selectedOption.data.medio);
      handleChange('fraccion_destino', fraccion);
    }

    const envase = (fraccion?.tipo_unidad || '').toLowerCase();
    const volumen = Number(fraccion?.volumen_por_unidad_ml || 0);
    let p = 'MEDIO_ESTANDAR';
    
    if (envase.includes('placa') || envase.includes('petri')) {
      p = 'SLIM_PETRI';
    } else if (envase.includes('eppendorf') || envase.includes('criovial') || envase.includes('tubo') || (volumen > 0 && volumen <= 5)) {
      p = 'PORTAOBJETOS';
    } else if (envase.includes('bolsa')) {
      p = 'MAXI_BOLSA';
    } else {
      p = 'MEDIO_ESTANDAR';
    }
    
    handleChange('perfil_zpl', p);
  };

  const resolveBatchTargetField = (batchData) => {
    const route = formData.tipo_inoculacion;
    const soporte = (batchData.soporte || '').toLowerCase();
    const tipo = (batchData.tipo_inoculacion || '').toLowerCase();
    if (route === 'liquido_a_liquido') return { field: 'batch_liquido' };
    if (route === 'hacia_grano' || route === 'hacia_sustrato') {
      if (soporte.includes('placa') || tipo.includes('placa')) return { field: 'placa_origen', tipoBatch: 'placa' };
      if (soporte.includes('líquido') || soporte.includes('liquido') || tipo.includes('líquido') || tipo.includes('liquido')) return { field: 'batch_liquido', tipoBatch: 'liquido' };
      if (soporte.includes('grano') || soporte.includes('spawn') || tipo.includes('grano')) return { field: 'batch_grano', tipoBatch: 'grano' };
      const current = formData.origen_grano_tipo_batch;
      if (current === 'placa') return { field: 'placa_origen' };
      if (current === 'liquido') return { field: 'batch_liquido' };
      return { field: 'batch_grano' };
    }
    return null;
  };

  const handleScanEjemplar = async (scannedId, field = 'ejemplar_fuente') => {
    const id = scannedId.trim();
    try {
      // 1. Buscar directo en ejemplares (doc ID)
      const ejeDoc = await getDoc(doc(db, 'ejemplares', id));
      if (ejeDoc.exists()) {
        const ejeData = { id: ejeDoc.id, ...ejeDoc.data() };
        const opt = { id: ejeDoc.id, data: ejeData, nombre: `${ejeData.id_semantico || ejeDoc.id} · ${ejeData.especie || ''}` };
        handleChange(field, opt);
        toast.success(`Ejemplar seleccionado: ${ejeData.id_semantico || id}`);
        return;
      }

      // 2. Buscar en ejemplares por id_semantico
      const qEje = query(collection(db, 'ejemplares'), where('id_semantico', '==', id));
      const snapEje = await getDocs(qEje);
      if (!snapEje.empty) {
        const d = snapEje.docs[0];
        const ejeData = { id: d.id, ...d.data() };
        const opt = { id: d.id, data: ejeData, nombre: `${ejeData.id_semantico || d.id} · ${ejeData.especie || ''}` };
        handleChange(field, opt);
        toast.success(`Ejemplar seleccionado: ${ejeData.id_semantico || id}`);
        return;
      }

      // 3. Buscar en batches por doc ID (placas, lotes, etc.)
      const batchDoc = await getDoc(doc(db, 'batches', id));
      let batchData = batchDoc.exists() ? { id: batchDoc.id, ...batchDoc.data() } : null;

      // 4. Si no encontró, buscar en batches por id_semantico
      if (!batchData) {
        const qBatch = query(collection(db, 'batches'), where('id_semantico', '==', id));
        const snapBatch = await getDocs(qBatch);
        if (!snapBatch.empty) {
          batchData = { id: snapBatch.docs[0].id, ...snapBatch.docs[0].data() };
        }
      }

      // 5. Si encontró batch, intentar traer el ejemplar vinculado
      if (batchData && batchData.ejemplarId) {
        const ejeLinked = await getDoc(doc(db, 'ejemplares', batchData.ejemplarId));
        if (ejeLinked.exists()) {
          const ejeData = { id: ejeLinked.id, ...ejeLinked.data() };
          const opt = { id: ejeLinked.id, data: ejeData, nombre: `${ejeData.id_semantico || ejeLinked.id} · ${ejeData.especie || ''}` };
          handleChange(field, opt);

          // Autocompletar campo de origen según la ruta
          const batchOpt = {
            id: batchData.id,
            nombre: `${batchData.id} · ${batchData.fecha_inoculacion || batchData.fechaInoculacion || ''} · ${batchData.destinoNombre || batchData.sala_actual || ''}`,
            data: batchData
          };
          const target = resolveBatchTargetField(batchData);
          if (target) {
            if (target.tipoBatch) handleChange('origen_grano_tipo_batch', target.tipoBatch);
            handleChange(target.field, batchOpt);
          } else {
            if (field === 'ejemplar_fuente') handleChange('placa_origen', batchOpt);
            else handleChange('placa_origen_2', batchOpt);
          }

          toast.success(`Ejemplar y origen seleccionados: ${batchData.id} → ${ejeData.id_semantico || ejeLinked.id}`);
          return;
        }
      }

      // 6. Si encontró batch pero sin ejemplar vinculado, setear solo la placa
      if (batchData) {
        const batchOpt = {
          id: batchData.id,
          nombre: `${batchData.id} · ${batchData.fecha_inoculacion || batchData.fechaInoculacion || ''} · ${batchData.destinoNombre || batchData.sala_actual || ''}`,
          data: batchData
        };
        const target = resolveBatchTargetField(batchData);
        if (target) {
          if (target.tipoBatch) handleChange('origen_grano_tipo_batch', target.tipoBatch);
          handleChange(target.field, batchOpt);
        } else {
          if (field === 'ejemplar_fuente') handleChange('placa_origen', batchOpt);
          else handleChange('placa_origen_2', batchOpt);
        }
        toast.success(`Origen seleccionado: ${batchData.id} (sin ejemplar vinculado)`);
        return;
      }

      toast.error(`No se encontró registro para: ${id}`);
    } catch (err) {
      toast.error('Error al buscar ejemplar escaneado');
    }
  };

  const handleScanMedio = async (scannedId) => {
    const id = scannedId.trim();
    try {
      // Try as raw Firestore doc ID for medios_preparados
      const medioDoc = await getDoc(doc(db, 'medios_preparados', id));
      if (medioDoc.exists()) {
        const opt = mediosDestinoOptions.find(o => o.type === 'bulk' && o.data.medio.id === id);
        if (opt && !opt.disabled) {
          handleSelectMedioDestino(opt.id);
          toast.success(`Medio seleccionado: ${opt.data.medio.alias || opt.data.medio.nombre_receta}`);
        } else {
          toast.error(opt ? 'Este medio no tiene stock disponible' : 'Medio encontrado pero no disponible para esta ruta');
        }
        return;
      }
      // Try as FRAC- subfraccion ID via collectionGroup
      if (id.startsWith('FRAC-')) {
        const qSub = query(collectionGroup(db, 'subfracciones'), where('id_bolsa', '==', id));
        const snapSub = await getDocs(qSub);
        if (!snapSub.empty) {
          const subDoc = snapSub.docs[0];
          const subData = subDoc.data();
          const opt = mediosDestinoOptions.find(o => o.type === 'sub' && o.id === subDoc.id);
          if (opt && !opt.disabled) {
            handleSelectMedioDestino(opt.id);
            toast.success(`Subfracción seleccionada: ${subData.id_bolsa || id}`);
          } else {
            toast.error(opt ? 'Esta subfracción no tiene stock disponible' : 'Subfracción encontrada pero no disponible para esta ruta');
          }
          return;
        }
      }
      // Try as id_semantico query
      const qMed = query(collection(db, 'medios_preparados'), where('id_semantico', '==', id));
      const snapMed = await getDocs(qMed);
      if (!snapMed.empty) {
        const mDoc = snapMed.docs[0];
        const opt = mediosDestinoOptions.find(o => o.type === 'bulk' && o.data.medio.id === mDoc.id);
        if (opt && !opt.disabled) {
          handleSelectMedioDestino(opt.id);
          toast.success(`Medio seleccionado: ${opt.data.medio.alias || opt.data.medio.nombre_receta}`);
        } else {
          toast.error('Medio encontrado pero no disponible para esta ruta');
        }
        return;
      }
      toast.error(`No se encontró medio o subfracción: ${id}`);
    } catch (err) {
      toast.error('Error al buscar medio escaneado');
    }
  };

  const handleSubfraccionar = async () => {
    const qty = Number(subfracCantidad) || 0;
    if (qty <= 0) return toast.error('Ingresá una cantidad válida');
    if (!formData.medio_prep) return toast.error('Seleccioná un medio primero');

    const bulk = formData.medio_prep.stock_bulk?.cantidad_actual ?? formData.medio_prep.cantidad_actual ?? 0;
    if (qty > bulk) return toast.error(`Solo quedan ${bulk} disponibles en el bulk`);

    setSubfracSaving(true);
    try {
      const { writeBatch: wb, doc: d, increment: inc, serverTimestamp: st, collection: col } = await import('firebase/firestore');
      const batch = wb(db);
      const medioRef = d(db, 'medios_preparados', formData.medio_prep.id);
      const bagRef = d(col(db, `medios_preparados/${formData.medio_prep.id}/subfracciones`));

      const codigo = (formData.medio_prep.alias || 'MED').split(' ').find(p => !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)) || 'MED';
      const dateStr = new Date().toISOString().replace(/-/g, '').substring(0, 8);
      const existingCount = allSubfracciones.filter(s => s.medioId === formData.medio_prep.id).length;
      let letter = '';
      let temp = existingCount;
      do { letter = String.fromCharCode(65 + (temp % 26)) + letter; temp = Math.floor(temp / 26) - 1; } while (temp >= 0);
      const bagId = `FRAC-${codigo.toUpperCase().replace(/[^A-Z0-9-]/g, '')}-${dateStr}-${letter}`;

      batch.set(bagRef, {
        id_bolsa: bagId,
        tipo_envase: subfracTipo,
        tipo_unidad: subfracTipo,
        cantidad: qty,
        disponible: qty,
        volumen_por_unidad_ml: null,
        ubicacion: 'Heladera Lab',
        fecha: new Date().toISOString().split('T')[0],
        operario: formData.operario || 'Sistema',
        estado: 'Disponible',
        novedades: [],
        createdAt: st()
      });

      batch.update(medioRef, {
        'stock_bulk.cantidad_actual': bulk - qty,
        total_subfracciones: inc(1),
        subfracciones_disponibles: inc(1)
      });

      await batch.commit();
      toast.success(`Subfracción ${bagId} creada (${qty} unidades)`);
      setShowSubfraccionModal(false);
      setSubfracCantidad('');
    } catch (err) {
      toast.error('Error al crear subfracción: ' + err.message);
    } finally {
      setSubfracSaving(false);
    }
  };

  const isRutaValida = ['placa_a_liquido', 'hacia_grano', 'hacia_sustrato', 'liquido_a_liquido', 'aislamiento_primario', 'placa_a_placa'].includes(formData.tipo_inoculacion);

  const previewIds = useMemo(() => {
    if (!formData.medio_prep || !formData.ejemplar_fuente) return [];
    const ids = [];
    const ejemplarData = formData.ejemplar_fuente.data || {};
    
    let m = 'MED';
    if (formData.fraccion_destino && formData.fraccion_destino.id_bolsa) {
      const parts = formData.fraccion_destino.id_bolsa.split('-');
      if (parts.length > 1 && parts[0] === 'FRAC') m = parts[1];
      else m = extraerCodigoMedio(formData.medio_prep.alias || formData.medio_prep.codigo);
    } else {
      m = extraerCodigoMedio(formData.medio_prep.alias || formData.medio_prep.codigo);
    }
    
    for (let i = 0; i < Math.min(formData.cantidad_total, 10); i++) {
      const letra = formData.modo_id === 'individual' ? String.fromCharCode(65 + i) : null;
      
      const batchId = generarIdBatch({
        genero: ejemplarData.genero,
        especie: ejemplarData.especie,
        codigo_cepa: ejemplarData.codigo_cepa,
        es_hibridacion: formData.es_hibridacion,
        contador_hibridacion: nextContadorHib,
        codigo_medio: m,
        fecha_iso: formData.fecha_inoculacion,
        secuencia_diaria: nextSeqDiaria,
        letra_unidad: letra,
        numero_transferencia: null
      });

      if (!ids.includes(batchId)) ids.push(batchId);
    }
    return ids;
  }, [formData.medio_prep, formData.ejemplar_fuente, formData.fraccion_destino, formData.fecha_inoculacion, formData.modo_id, formData.cantidad_total, nextSeqDiaria, formData.es_hibridacion, nextContadorHib]);

  const handleNext = () => {
    if (step === 2 && ['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion)) {
      if (formData.origen_grano_tipo_material === 'interno') {
        if (!formData.ejemplar_fuente) return toast.error("Seleccioná un ejemplar.");
        if (formData.origen_grano_tipo_batch === 'placa' && !formData.placa_origen) return toast.error("Seleccioná la placa origen.");
        if (formData.origen_grano_tipo_batch === 'liquido' && !formData.batch_liquido) return toast.error("Seleccioná el batch líquido origen.");
        if (formData.origen_grano_tipo_batch === 'grano' && !formData.batch_grano) return toast.error("Seleccioná el grano origen.");
      } else {
        if (!formData.ejemplar_fuente) return toast.error("Debes crear el material externo primero.");
      }
    } else {
      if (step === 2 && !formData.ejemplar_fuente) return toast.error("Seleccioná un ejemplar.");
    }
    
    if (step === 2 && formData.es_hibridacion && !formData.ejemplar_fuente_2) return toast.error("Seleccioná el segundo ejemplar para la hibridación.");
    if (step === 2 && formData.tipo_inoculacion === 'placa_a_liquido' && !formData.placa_origen) return toast.error("Seleccioná una placa origen.");
    if (step === 2 && ['placa_a_liquido','placa_a_placa'].includes(formData.tipo_inoculacion) && formData.es_hibridacion && !formData.placa_origen_2) return toast.error("Seleccioná la segunda placa origen para la hibridación.");
    if (step === 3 && !formData.medio_prep) return toast.error("Seleccioná un medio destino.");
    if (step === 5 && !formData.sala_destino) return toast.error("Seleccioná una sala destino.");

    setStep(s => s + 1);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const esAislamientoPrimario = formData.tipo_inoculacion === 'aislamiento_primario';
      const cantidadTotal = Number(formData.cantidad_total) || 1;
      const cantidadUnidades = Number(formData.cantidad_unidades) || 1;
      const ejemplarData = formData.ejemplar_fuente?.data || {};

      const f = formData.fecha_inoculacion.replace(/-/g, '');
      const g = (ejemplarData.genero || 'XX').substring(0, 3).toUpperCase();
      const e = (ejemplarData.especie || 'XXX').substring(0, 3).toUpperCase();
      let m = 'MED';
      if (formData.fraccion_destino?.id_bolsa) {
        const parts = formData.fraccion_destino.id_bolsa.split('-');
        if (parts.length > 1 && parts[0] === 'FRAC') m = parts[1];
        else m = extraerCodigoMedio(formData.medio_prep?.alias || formData.medio_prep?.codigo);
      } else {
        m = extraerCodigoMedio(formData.medio_prep?.alias || formData.medio_prep?.codigo);
      }

      // Calcular numero_transferencia para repiques
      let numeroTransferencia = null;
      if (formData.tipo_inoculacion === 'placa_a_placa' && formData.ejemplar_fuente?.id) {
        try {
          const prevSnap = await getDocs(query(
            collection(db, 'batches'),
            where('ejemplarId', '==', formData.ejemplar_fuente.id),
            where('tipo_inoculacion', '==', 'placa_a_placa')
          ));
          numeroTransferencia = prevSnap.size + 1;
        } catch (e) {
          numeroTransferencia = 1;
        }
      }

      // Una hibridación genera un nuevo ejemplar, por ende empieza en T1
      if (formData.es_hibridacion) {
        numeroTransferencia = 1;
      }

      // Transacción atómica para obtener secuencia diaria (y de hibridación si corresponde)
      const dateKey = formData.fecha_inoculacion.replace(/-/g, '').substring(2);
      const batchSeqKey = `batches_${dateKey}`;
      
      let seqDiaria = 1;
      let contadorHib = null;

      await runTransaction(db, async (t) => {
        const counterRef = doc(db, 'metadata', 'counters');
        const counterDoc = await t.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        
        seqDiaria = (data[batchSeqKey] || 0) + 1;
        const updates = { [batchSeqKey]: seqDiaria };

        if (formData.es_hibridacion) {
          const g = (ejemplarData.genero || 'UNK').toLowerCase().replace(/\s+/g, '_');
          const e = (ejemplarData.especie || 'UNK').toLowerCase().replace(/\s+/g, '_');
          const fieldName = `hibridacion_${g}_${e}`;
          contadorHib = (data[fieldName] || 0) + 1;
          updates[fieldName] = contadorHib;
        }

        t.set(counterRef, updates, { merge: true });
      });

      const grupoId = `GRP-${Date.now()}`;
      const batchIds = [];

      for (let i = 0; i < cantidadTotal; i++) {
        const letra = formData.modo_id === 'individual' ? String.fromCharCode(65 + i) : null;
        
        const batchId = generarIdBatch({
          genero: ejemplarData.genero,
          especie: ejemplarData.especie,
          codigo_cepa: ejemplarData.codigo_cepa,
          es_hibridacion: formData.es_hibridacion,
          contador_hibridacion: contadorHib,
          codigo_medio: m,
          fecha_iso: formData.fecha_inoculacion,
          secuencia_diaria: seqDiaria,
          letra_unidad: letra,
          numero_transferencia: numeroTransferencia
        });

        if (!batchIds.includes(batchId)) batchIds.push(batchId);
      }


      const wb = writeBatch(db);

      let origenId = null;
      
      const getExtractId = (field) => field?.id || (typeof field === 'string' ? field : null);

      if (['placa_a_liquido', 'placa_a_placa'].includes(formData.tipo_inoculacion)) origenId = getExtractId(formData.placa_origen);
      else if (formData.tipo_inoculacion === 'liquido_a_liquido') origenId = getExtractId(formData.batch_liquido);
      else if (['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && formData.origen_grano_tipo_material === 'interno') {
        if (formData.origen_grano_tipo_batch === 'placa') origenId = getExtractId(formData.placa_origen);
        else if (formData.origen_grano_tipo_batch === 'liquido') origenId = getExtractId(formData.batch_liquido);
        else if (formData.origen_grano_tipo_batch === 'grano') origenId = getExtractId(formData.batch_grano);
      }

      const origenId2 = formData.es_hibridacion ? (formData.placa_origen_2?.id ?? null) : null;

      const soporteFinal = formData.fraccion_destino?.tipo_unidad || formData.medio_prep?.tipo_soporte || formData.medio_prep?.soporte || 'No definido';

      for (let i = 0; i < batchIds.length; i++) {
        wb.set(doc(db, 'batches', batchIds[i]), {
          experimento_id: null,
          tratamiento_id: null,
          atributos_experimentales: {},
          genero: ejemplarData.genero || '',
          especie: ejemplarData.especie || '',
          medioPrepId: formData.medio_prep?.id || null,
          destinoId: formData.sala_destino?.id || null,
          destinoNombre: formData.sala_destino?.data?.nombre || formData.sala_destino?.nombre || '',
          operator: formData.operario || 'Sistema',
          fechaInoculacion: formData.fecha_inoculacion,
          status: 'Inoculado',
          observaciones: formData.observaciones || '',
          ejemplarId: formData.ejemplar_fuente?.id || null,
          ejemplarId_2: formData.es_hibridacion ? (formData.ejemplar_fuente_2?.id || null) : null,
          es_hibridacion: formData.es_hibridacion || false,
          es_seleccion_colonia: formData.es_seleccion_colonia || false,
          tipo_inoculacion: formData.tipo_inoculacion,
          destino_criopreservacion: false,
          es_aislamiento_primario: esAislamientoPrimario,
          numero_transferencia: numeroTransferencia,
          fraccionId: formData.fraccion_destino?.id ?? null,
          batch_origen_id: origenId,
          placa_origen_id_2: formData.es_hibridacion ? getExtractId(formData.placa_origen_2) : null,
          cantidad_inoculo: formData.cantidad_inoculo ? Number(formData.cantidad_inoculo) : null,
          unidad_inoculo: formData.unidad_inoculo || null,
          peso_humedo_unidad: formData.tipo_inoculacion === 'hacia_sustrato' && formData.peso_humedo_unidad ? Number(formData.peso_humedo_unidad) : null,
          unidad_peso_humedo: formData.tipo_inoculacion === 'hacia_sustrato' ? formData.unidad_peso_humedo : null,
          fraccion_placa: ['placa_a_liquido', 'placa_a_placa'].includes(formData.tipo_inoculacion) ? (formData.fraccion_placa || null) : null,
          observaciones_placa: formData.observaciones_placa || '',
          batch_index: i + 1,
          batch_total: cantidadTotal,
          batch_grupo_id: grupoId,
          origen_declarado_agotado: formData.origen_declarado_agotado || false,
          ufc: formData.ufc ? Number(formData.ufc) : null,
          contenedorId: formData.contenedorId || null,
          estante: formData.estante || '',
          soporte: soporteFinal,
          createdAt: serverTimestamp()
        });
      }

      if (formData.fraccion_destino && formData.medio_prep) {
        const medioId = formData.fraccion_destino.medioId || formData.medio_prep.id;
        const sfRef = doc(db, 'medios_preparados', medioId, 'subfracciones', formData.fraccion_destino.id);
        wb.update(sfRef, { disponible: increment(-cantidadUnidades) });
        if ((formData.fraccion_destino.disponible ?? 0) <= cantidadUnidades) {
          const mRef = doc(db, 'medios_preparados', medioId);
          wb.update(mRef, { subfracciones_disponibles: increment(-1) });
        }
      } else if (formData.medio_prep && !formData.fraccion_destino) {
        const medioRef = doc(db, 'medios_preparados', formData.medio_prep.id);
        wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-cantidadUnidades) });
      }

      // Marcar placa 1 como agotada
      if (formData.origen_declarado_agotado && origenId) {
        wb.update(doc(db, 'batches', origenId), { status: 'Agotado', updatedAt: serverTimestamp() });
      }

      // Marcar placa 2 como agotada
      if (formData.es_hibridacion && formData.origen_declarado_agotado_2 && origenId2) {
        wb.update(doc(db, 'batches', origenId2), { status: 'Agotado', updatedAt: serverTimestamp() });
      }

      await wb.commit();

      const batchesParaImpresion = batchIds.map((id, i) => {
        let aliasGenerado = `${ejemplarData.genero || ''} ${ejemplarData.especie || ''}`.trim();
        if (formData.es_hibridacion && formData.ejemplar_fuente_2) {
          aliasGenerado += ` x ${formData.ejemplar_fuente_2.data?.genero || ''} ${formData.ejemplar_fuente_2.data?.especie || ''}`.trim();
        }

        return {
          id,
          alias: aliasGenerado,
          especie: aliasGenerado,
          tipo_inoculacion: formData.tipo_inoculacion,
          generacion: ejemplarData.generacion ?? 0,
          mat: ejemplarData.mat || 'Desconocido',
          fecha: formData.fecha_inoculacion,
          medio_origen_alias: formData.medio_prep?.alias || formData.medio_prep?.codigo || '',
          operario: formData.operario || 'Sistema',
          sala: formData.sala_destino?.data?.nombre || formData.sala_destino?.nombre || '',
          contenedorId: formData.contenedorId || null,
          numero_unidad: i + 1,
          total_unidades: cantidadTotal,
          nombre_receta: formData.medio_prep?.nombre_receta || formData.medio_prep?.alias || formData.tipo_inoculacion.replace(/_/g, ' '),
          batch_origen_id: formData.placa_origen?.id || formData.batch_liquido?.id || '',
          numero_transferencia: numeroTransferencia,
          tipo_uso: formData.tipo_inoculacion.replace(/_/g, ' '),
          tipo_etiqueta: formData.perfil_zpl || 'MEDIO_ESTANDAR'
        };
      });

      if (formData.es_hibridacion) {
        setHibridacionResult({
          batchIds,
          batchesParaImpresion
        });
        setLoading(false);
      } else if (formData.tipo_inoculacion === 'placa_a_placa' && formData.es_seleccion_colonia) {
        setRepiqueResult({
          batchIds,
          batchesParaImpresion
        });
        setLoading(false);
      } else {
        setBatchesToPrint(batchesParaImpresion);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error al registrar la inoculación:', error);
      toast.error('Error al registrar la inoculación. No se guardó nada. Intentá de nuevo.');
      setLoading(false);
    }
  };

  if (repiqueResult) {
    return (
      <HibridacionEjemplarModal
        batchIds={repiqueResult.batchIds}
        ejemplarPadre={formData.ejemplar_fuente}
        ejemplarMadre={null}
        placaOrigen1Id={formData.placa_origen?.id}
        placaOrigen2Id={null}
        fechaIngreso={formData.fecha_inoculacion}
        operario={formData.operario || 'Sistema'}
        modoRepique={true}
        onSaved={() => {
          setBatchesToPrint(repiqueResult.batchesParaImpresion);
          setRepiqueResult(null);
        }}
      />
    );
  }

  if (hibridacionResult) {
    return (
      <HibridacionEjemplarModal
        batchIds={hibridacionResult.batchIds}
        ejemplarPadre={formData.ejemplar_fuente}
        ejemplarMadre={formData.ejemplar_fuente_2}
        placaOrigen1Id={formData.placa_origen?.id}
        placaOrigen2Id={formData.placa_origen_2?.id}
        fechaIngreso={formData.fecha_inoculacion}
        operario={formData.operario || 'Sistema'}
        onSaved={() => {
          // The batches for printing are already prepared in `batchesParaImpresion`
          setBatchesToPrint(hibridacionResult.batchesParaImpresion);
          setHibridacionResult(null);
        }}
      />
    );
  }

  if (batchesToPrint) {
    return (
      <PrintLabelsModal 
        batches={batchesToPrint} 
        usuarioActivo={formData.operario || 'Sistema'}
        onClose={() => {
          setBatchesToPrint(null);
          if (onSaved) onSaved();
          onClose();
        }}
      />
    );
  }

  if (formData.tipo_inoculacion === 'aislamiento_primario') {
    return <NuevoEventoAislamientoModal onClose={onClose} />;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '750px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>🌱 Nueva Inoculación (Paso {step}/6)</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
          {[1,2,3,4,5,6].map(s => (
            <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: s <= step ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ display: 'grid', gap: '1.25rem', padding: '0.5rem 0' }}>
          
          {step === 1 && (
            <div className="form-group animate-fade-in" style={{ display: 'grid', gap: '1rem' }}>
              <label className="form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Tipo de Tarea de Laboratorio</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
                {TIPOS_INOCULACION.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`btn ${formData.tipo_inoculacion === t.id ? 'btn-primary' : 'btn-outline'}`}
                    style={{ 
                      padding: '1rem', 
                      textAlign: 'left',
                      background: formData.tipo_inoculacion === t.id ? 'var(--primary-color)' : 'transparent',
                      borderWidth: '2px',
                      borderColor: formData.tipo_inoculacion === t.id ? 'var(--primary-color)' : 'var(--border-color)',
                      color: formData.tipo_inoculacion === t.id ? 'white' : 'var(--text-color)'
                    }}
                    onClick={() => handleChange('tipo_inoculacion', t.id)}
                  >
                    <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{t.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>2. Origen del inóculo</h4>
              
              {['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && (
                <div className="form-group" style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ color: 'var(--primary-color)' }}>Tipo de Material Origen</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="radio" name="origen_grano_tipo_material" value="interno" checked={formData.origen_grano_tipo_material === 'interno'} onChange={(e) => handleChange('origen_grano_tipo_material', e.target.value)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Material Interno (Mi Banco)
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="radio" name="origen_grano_tipo_material" value="externo" checked={formData.origen_grano_tipo_material === 'externo'} onChange={(e) => handleChange('origen_grano_tipo_material', e.target.value)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Material Externo (Nuevo)
                    </label>
                  </div>
                </div>
              )}

              {['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && formData.origen_grano_tipo_material === 'externo' && (
                 <div style={{ marginTop: '1rem', marginBottom: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem' }}>
                   <h5 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-secondary)' }}>Ingreso de Material Externo</h5>
                   <AltaRapidaEjemplarExterno onSaved={(ejemplarId, ejemplarObj) => {
                      handleChange('ejemplar_fuente', { id: ejemplarId, data: ejemplarObj, nombre: `${ejemplarId} · ${ejemplarObj.especie}` });
                      toast.success('Ejemplar externo guardado exitosamente. Podés pasar al siguiente paso.');
                   }} />
                 </div>
              )}

              <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              {(!['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) || (['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && formData.origen_grano_tipo_material === 'interno')) && (
                <div className="form-group" style={{ position: 'relative', zIndex: 1200 }}>
                  <label className="form-label">Ejemplar / Linaje Genético *</label>
                  <SearchableSelect 
                    options={ejemplaresOptions} 
                    value={formData.ejemplar_fuente?.id || ''} 
                    onChange={val => handleChange('ejemplar_fuente', ejemplaresOptions.find(o => o.id === val))} 
                    placeholder="-- Buscar Ejemplar Activo --" 
                    renderOption={renderEjemplarOption}
                  />
                  <ScanInput onScan={(id) => handleScanEjemplar(id, 'ejemplar_fuente')} label="Escanear Ejemplar" />
                </div>
              )}

              {['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && formData.origen_grano_tipo_material === 'interno' && (
                <div className="form-group" style={{ marginTop: '1.5rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ color: 'var(--primary-color)' }}>Formato del Inóculo</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                    {formData.tipo_inoculacion !== 'hacia_sustrato' && (
                      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="radio" name="origen_grano_tipo_batch" value="placa" checked={formData.origen_grano_tipo_batch === 'placa'} onChange={(e) => handleChange('origen_grano_tipo_batch', e.target.value)} style={{ width: '1.2rem', height: '1.2rem' }} />
                        Placa Agar
                      </label>
                    )}
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="radio" name="origen_grano_tipo_batch" value="liquido" checked={formData.origen_grano_tipo_batch === 'liquido'} onChange={(e) => handleChange('origen_grano_tipo_batch', e.target.value)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Medio Líquido
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="radio" name="origen_grano_tipo_batch" value="grano" checked={formData.origen_grano_tipo_batch === 'grano'} onChange={(e) => handleChange('origen_grano_tipo_batch', e.target.value)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Grano (G2G / Spawn)
                    </label>
                  </div>
                </div>
              )}

              {['placa_a_liquido', 'placa_a_placa'].includes(formData.tipo_inoculacion) && (
                <>
                  <div className="form-group" style={{ position: 'relative', zIndex: 1100 }}>
                    <label className="form-label">Placa Origen 1 *</label>
                    <SearchableSelect 
                      options={placaOrigenOptions} 
                      value={formData.placa_origen?.id || ''} 
                      onChange={val => handleChange('placa_origen', placaOrigenOptions.find(o => o.id === val))} 
                      placeholder={formData.ejemplar_fuente ? "-- Buscar Placa --" : "-- Seleccioná ejemplar primero --"} 
                      disabled={!formData.ejemplar_fuente}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fracción de la placa 1 usada *</label>
                    <select className="form-control" value={formData.fraccion_placa} onChange={e => handleChange('fraccion_placa', e.target.value)}>
                      <option value="1/8">1/8</option>
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="1">1 placa entera</option>
                      <option value="1/1 (placa entera)">1/1 (placa entera)</option>
                      <option value="Sacabocados">Sacabocados</option>
                      <option value="Anzada">Anzada</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginTop: '0.2rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
                      <input type="checkbox" checked={formData.origen_declarado_agotado} onChange={e => handleChange('origen_declarado_agotado', e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Declarar placa origen 1 como agotada
                    </label>
                  </div>
                </>
              )}
              </div>

              {['placa_a_liquido', 'placa_a_placa', 'aislamiento_primario'].includes(formData.tipo_inoculacion) && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.5rem 0 1rem 0' }} />
                  <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" id="chk_hibridacion" checked={formData.es_hibridacion} onChange={e => {
                      handleChange('es_hibridacion', e.target.checked);
                      if (!e.target.checked) {
                        handleChange('ejemplar_fuente_2', null);
                        handleChange('placa_origen_2', null);
                      }
                    }} style={{ width: '1.2rem', height: '1.2rem' }} />
                    <label htmlFor="chk_hibridacion" style={{ margin: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}>Hibridación (dos padres)</label>
                  </div>
                </>
              )}

              {formData.es_hibridacion && (
                <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div className="form-group animate-fade-in" style={{ position: 'relative', zIndex: 1150 }}>
                    <label className="form-label" style={{ color: '#8b5cf6' }}>Ejemplar Padre 2 *</label>
                    <SearchableSelect 
                      options={ejemplaresOptions} 
                      value={formData.ejemplar_fuente_2?.id || ''} 
                      onChange={val => handleChange('ejemplar_fuente_2', ejemplaresOptions.find(o => o.id === val))} 
                      placeholder="-- Buscar Segundo Ejemplar --" 
                      renderOption={renderEjemplarOption}
                    />
                    <ScanInput onScan={(id) => handleScanEjemplar(id, 'ejemplar_fuente_2')} label="Escanear Padre 2" />
                  </div>

                  {['placa_a_liquido', 'placa_a_placa'].includes(formData.tipo_inoculacion) && (
                    <>
                      <div className="form-group" style={{ position: 'relative', zIndex: 1100, marginTop: '0.5rem' }}>
                        <label className="form-label">Placa Origen 2 *</label>
                        <SearchableSelect 
                          options={placaOrigenOptions2} 
                          value={formData.placa_origen_2?.id || ''} 
                          onChange={val => handleChange('placa_origen_2', placaOrigenOptions2.find(o => o.id === val))} 
                          placeholder={formData.ejemplar_fuente_2 ? "-- Buscar Placa 2 --" : "-- Seleccioná segundo ejemplar primero --"} 
                          disabled={!formData.ejemplar_fuente_2}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fracción de la placa 2 usada *</label>
                        <select className="form-control" value={formData.fraccion_placa_2} onChange={e => handleChange('fraccion_placa_2', e.target.value)}>
                          <option value="1/8">1/8</option>
                          <option value="1/4">1/4</option>
                          <option value="1/2">1/2</option>
                          <option value="1">1 placa entera</option>
                          <option value="1/1 (placa entera)">1/1 (placa entera)</option>
                          <option value="Sacabocados">Sacabocados</option>
                          <option value="Anzada">Anzada</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginTop: '0.2rem', marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
                          <input type="checkbox" checked={formData.origen_declarado_agotado_2} onChange={e => handleChange('origen_declarado_agotado_2', e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                          Declarar placa origen 2 como agotada
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}

              {formData.tipo_inoculacion === 'placa_a_placa' && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: '600', color: '#8b5cf6' }}>
                    <input
                      type="checkbox"
                      id="chk_seleccion_colonia"
                      checked={formData.es_seleccion_colonia}
                      onChange={e => handleChange('es_seleccion_colonia', e.target.checked)}
                      style={{ width: '1.2rem', height: '1.2rem' }}
                    />
                    Este repique implica selección de colonia (genera nuevo Ejemplar)
                  </label>
                  {formData.es_seleccion_colonia && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '1.7rem', marginTop: '0.4rem', marginBottom: 0 }}>
                      Al confirmar, se abrirá un modal para registrar la identidad genética del nuevo Ejemplar derivado.
                    </p>
                  )}
                </div>
              )}

              {formData.tipo_inoculacion === 'liquido_a_liquido' && (
                <>
                  <div className="form-group" style={{ position: 'relative', zIndex: 1100 }}>
                    <label className="form-label">Batch Líquido Origen *</label>
                    <SearchableSelect 
                      options={liquidoOrigenOptions} 
                      value={formData.batch_liquido?.id || ''} 
                      onChange={val => handleChange('batch_liquido', liquidoOrigenOptions.find(o => o.id === val))} 
                      placeholder={formData.ejemplar_fuente ? "-- Buscar Batch Líquido --" : "-- Seleccioná ejemplar primero --"} 
                      disabled={!formData.ejemplar_fuente}
                    />
                  </div>
                  <div className="form-group" style={{ marginTop: '0.2rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
                      <input type="checkbox" checked={formData.origen_declarado_agotado} onChange={e => handleChange('origen_declarado_agotado', e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Declarar batch líquido origen como agotado
                    </label>
                  </div>
                </>
              )}

              {['hacia_grano', 'hacia_sustrato'].includes(formData.tipo_inoculacion) && formData.origen_grano_tipo_material === 'interno' && (
                <>
                  {formData.origen_grano_tipo_batch === 'placa' && (
                    <>
                      <div className="form-group" style={{ position: 'relative', zIndex: 1100 }}>
                        <label className="form-label">Placa Origen *</label>
                        <SearchableSelect 
                          options={placaOrigenOptions} 
                          value={formData.placa_origen?.id || ''} 
                          onChange={val => handleChange('placa_origen', placaOrigenOptions.find(o => o.id === val))} 
                          placeholder={formData.ejemplar_fuente ? "-- Buscar Placa --" : "-- Seleccioná ejemplar primero --"} 
                          disabled={!formData.ejemplar_fuente}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fracción de la placa usada *</label>
                        <select className="form-control" value={formData.fraccion_placa} onChange={e => handleChange('fraccion_placa', e.target.value)}>
                          <option value="1/8">1/8</option>
                          <option value="1/4">1/4</option>
                          <option value="1/2">1/2</option>
                          <option value="1">1 placa entera</option>
                          <option value="1/1 (placa entera)">1/1 (placa entera)</option>
                          <option value="Sacabocados">Sacabocados</option>
                          <option value="Anzada">Anzada</option>
                        </select>
                      </div>
                    </>
                  )}
                  {formData.origen_grano_tipo_batch === 'liquido' && (
                    <div className="form-group" style={{ position: 'relative', zIndex: 1100 }}>
                      <label className="form-label">Batch Líquido Origen *</label>
                      <SearchableSelect 
                        options={liquidoOrigenOptions} 
                        value={formData.batch_liquido?.id || ''} 
                        onChange={val => handleChange('batch_liquido', liquidoOrigenOptions.find(o => o.id === val))} 
                        placeholder={formData.ejemplar_fuente ? "-- Buscar Batch Líquido --" : "-- Seleccioná ejemplar primero --"} 
                        disabled={!formData.ejemplar_fuente}
                      />
                    </div>
                  )}
                  {formData.origen_grano_tipo_batch === 'grano' && (
                    <div className="form-group" style={{ position: 'relative', zIndex: 1100 }}>
                      <label className="form-label">Batch Grano/Sustrato Origen *</label>
                      <SearchableSelect 
                        options={granoOrigenOptions} 
                        value={formData.batch_grano?.id || ''} 
                        onChange={val => handleChange('batch_grano', granoOrigenOptions.find(o => o.id === val))} 
                        placeholder={formData.ejemplar_fuente ? "-- Buscar Batch Grano/Spawn --" : "-- Seleccioná ejemplar primero --"} 
                        disabled={!formData.ejemplar_fuente}
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
                      <input type="checkbox" checked={formData.origen_declarado_agotado} onChange={e => handleChange('origen_declarado_agotado', e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                      Declarar material origen como agotado
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>3. Medio Destino</h4>

              {/* Toggle: Buscar por medio o por envase */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={busquedaPorEnvase} 
                    onChange={(e) => {
                      setBusquedaPorEnvase(e.target.checked);
                      setEnvaseSeleccionado('');
                    }} 
                    style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                  />
                  Buscar por tipo de envase
                </label>
              </div>

              {/* Selector de envase (solo si busquedaPorEnvase es true) */}
              {busquedaPorEnvase && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Tipo de Envase Destino</label>
                  <select 
                    className="form-control" 
                    value={envaseSeleccionado} 
                    onChange={(e) => setEnvaseSeleccionado(e.target.value)}
                  >
                    <option value="">-- Seleccionar envase --</option>
                    <option value="Placa Petri">Placa Petri</option>
                    <option value="Placa">Placa (cualquier tamaño)</option>
                    <option value="Tubo Falcon 15ml">Tubo Falcon 15ml</option>
                    <option value="Tubo">Tubo (cualquier tamaño)</option>
                    <option value="Eppendorf">Eppendorf / Microtubo</option>
                    <option value="Frasco">Frasco (cualquier tamaño)</option>
                    <option value="Frasco de 500ml">Frasco de 500ml</option>
                    <option value="Bolsa">Bolsa</option>
                  </select>
                </div>
              )}

              {/* Dropdown de medios */}
              <div className="form-group">
                <label className="form-label">Medio Preparado o Subfracción *</label>
                <SearchableSelect 
                  options={mediosDestinoOptions} 
                  value={formData.fraccion_destino ? formData.fraccion_destino.id : (formData.medio_prep ? formData.medio_prep.id : '')} 
                  onChange={handleSelectMedioDestino} 
                  placeholder={busquedaPorEnvase ? "-- Buscar Medio por Envase --" : "-- Buscar Medio Disponible --"} 
                />
                <div style={{ marginTop: '0.5rem' }}>
                  <ScanInput onScan={handleScanMedio} label="Escanear Medio" />
                </div>
              </div>

              {formData.medio_prep && (
                <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{formData.medio_prep.alias || formData.medio_prep.nombre_receta}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {formData.medio_prep.categoria || 'Sin categoría'} · Stock bulk: {formData.medio_prep.stock_bulk?.cantidad_actual ?? formData.medio_prep.cantidad_actual ?? 0} {formData.medio_prep.stock_bulk?.unidad || ''}
                      </div>
                    </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        {formData.medio_prep.alias || formData.medio_prep.nombre_receta || 'Medio'}
                      </span>
                      {(() => {
                        const bulkStock = formData.medio_prep.stock_bulk?.cantidad_actual ?? formData.medio_prep.cantidad_actual ?? 0;
                        const canSubfraccionarFromBulk = bulkStock > 0;
                        const canSubfraccionarFromSub = formData.fraccion_destino && (
                          (formData.fraccion_destino.volumen_por_unidad_ml ?? 0) > 0 || 
                          (formData.fraccion_destino.disponible ?? 0) > 0
                        );
                        const canSubfraccionar = canSubfraccionarFromBulk || canSubfraccionarFromSub;
                        const availableVolume = canSubfraccionarFromSub 
                          ? (formData.fraccion_destino.volumen_por_unidad_ml || formData.fraccion_destino.disponible || 0)
                          : bulkStock;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (canSubfraccionarFromSub) {
                                  window.open(`/medios-preparados/${formData.medio_prep.id}?subfraccion=${formData.fraccion_destino.id}`, '_blank');
                                  toast.success('Abriendo maestro de medios para subfraccionar...');
                                } else {
                                  setShowSubfraccionModal(true);
                                }
                              }}
                              disabled={!canSubfraccionar}
                              style={{ 
                                background: canSubfraccionar ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)', 
                                color: canSubfraccionar ? '#000' : 'var(--text-secondary)',
                                border: 'none', 
                                padding: '0.3rem 0.7rem', 
                                borderRadius: '6px', 
                                cursor: canSubfraccionar ? 'pointer' : 'not-allowed',
                                fontSize: '0.75rem', 
                                fontWeight: 600,
                                opacity: canSubfraccionar ? 1 : 0.5
                              }}
                              title={canSubfraccionarFromSub 
                                ? `Crear sub-subfracciones desde ${formData.fraccion_destino.id_bolsa} (${availableVolume} disponibles)`
                                : (canSubfraccionarFromBulk ? 'Crear subfracciones desde bulk' : 'Sin stock disponible')
                              }
                            >
                              {canSubfraccionarFromSub ? '🧪 Subfraccionar (Level 2)' : '+ Subfraccionar'}
                            </button>
                            {!canSubfraccionar && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                (Sin stock disponible)
                              </span>
                            )}
                          </>
                        );
                      })()}
                      </div>
                  </div>

                  {(() => {
                    const subs = allSubfracciones.filter(s => {
                      if (s.medioId !== formData.medio_prep.id || s.disponible <= 0) return false;
                      if (formData.fraccion_destino) {
                        return s.id === formData.fraccion_destino.id;
                      }
                      if (busquedaPorEnvase && envaseSeleccionado) {
                        return (s.tipo_unidad || '').toLowerCase().includes(envaseSeleccionado.toLowerCase());
                      }
                      return true;
                    });
                    if (subs.length === 0) {
                      return (
                        <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                          {formData.fraccion_destino 
                            ? `Subfracción seleccionada: ${formData.fraccion_destino.id_bolsa || formData.fraccion_destino.id}`
                            : 'No hay subfracciones disponibles para este medio'
                          }
                        </div>
                      );
                    }
                    return (
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Soportes disponibles ({subs.length}):</div>
                        <div style={{ display: 'grid', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                          {subs.map(s => (
                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.85rem' }}>
                              <div>
                                <strong>{s.id_bolsa || 'Soporte'}</strong>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                  {s.tipo_unidad || s.tipo_envase || ''} · {s.disponible}/{s.cantidad} disp.
                                </span>
                                {s.volumen_por_unidad_ml && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>· {s.volumen_por_unidad_ml} ml/u</span>}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.ubicacion || ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in">
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>4. Cantidad y Contenedor</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Cantidad de Unidades (Recipientes) *</label>
                  <input type="number" min="1" className="form-control" value={formData.cantidad_unidades} onChange={e => handleChange('cantidad_unidades', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Modo de Identificación *</label>
                  <select className="form-control" value={formData.modo_id} onChange={e => handleChange('modo_id', e.target.value)}>
                    <option value="individual">Individual (1 ID x Unidad)</option>
                    <option value="lote">Por Lote (1 ID para todas)</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Contenedor / Agrupación (Opcional)</label>
                <SearchableSelect 
                  options={contenedoresOptions} 
                  value={formData.contenedorId || ''} 
                  onChange={val => {
                    const opt = contenedoresOptions.find(o => o.id === val);
                    if (opt?.data?.isNew) {
                      handleCrearContenedor(opt.data.tipo);
                    } else {
                      handleChange('contenedorId', val);
                      if (opt?.data?.sala_actual) {
                         const matchSala = salasOptions.find(s => s.nombre === opt.data.sala_actual);
                         if (matchSala) handleChange('sala_destino', matchSala);
                      }
                    }
                  }} 
                  placeholder="-- Buscar o Crear Contenedor --" 
                />
              </div>
              {formData.tipo_inoculacion === 'hacia_sustrato' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--primary-color)' }}>Cantidad / Peso por unidad *</label>
                    <input type="number" step="0.01" min="0" className="form-control" placeholder="Ej: 2.5" value={formData.peso_humedo_unidad} onChange={e => handleChange('peso_humedo_unidad', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--primary-color)' }}>Unidad de medida *</label>
                    <select className="form-control" value={formData.unidad_peso_humedo} onChange={e => handleChange('unidad_peso_humedo', e.target.value)}>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                      <option value="mL">mL</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="animate-fade-in">
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>5. Ubicación y Detalles</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Sala Destino (Incubación) *</label>
                  <SearchableSelect 
                    options={salasOptions} 
                    value={formData.sala_destino?.id || ''} 
                    onChange={val => handleChange('sala_destino', salasOptions.find(o => o.id === val))} 
                    placeholder="-- Buscar Sala --" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Estante / Ubicación específica</label>
                  <input type="text" className="form-control" placeholder="Ej: Estante 2A" value={formData.estante} onChange={e => handleChange('estante', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Operario Responsable</label>
                  <select className="form-control" value={formData.operario} onChange={e => handleChange('operario', e.target.value)}>
                    <option value="">-- Seleccionar operario --</option>
                    {OPERARIOS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de Inoculación</label>
                  <input type="date" className="form-control" value={formData.fecha_inoculacion} onChange={e => handleChange('fecha_inoculacion', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Observaciones (Opcional)</label>
                <textarea className="form-control" rows="2" placeholder="Notas sobre el proceso..." value={formData.observaciones} onChange={e => handleChange('observaciones', e.target.value)} />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="animate-fade-in">
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>6. Resumen</h4>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.8rem', background: 'var(--primary-color)', color: '#fff', fontWeight: 600 }}>
                    {TIPOS_INOCULACION.find(t => t.id === formData.tipo_inoculacion)?.label}
                  </span>
                  <span style={{ padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
                    {formData.cantidad_unidades} recipientes
                  </span>
                  {formData.es_hibridacion && (
                    <span style={{ padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                      Híbrido
                    </span>
                  )}
                </div>

                {formData.tipo_inoculacion !== 'aislamiento_primario' && (
                  <>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Origen:</strong> {formData.placa_origen?.nombre || formData.batch_liquido?.nombre || 'N/A'} {formData.tipo_inoculacion === 'placa_a_liquido' ? `· Fracción: ${formData.fraccion_placa}` : ''}</div>
                    {formData.es_hibridacion && formData.placa_origen_2 && (
                      <div><strong style={{ color: 'var(--text-secondary)' }}>Origen 2:</strong> {formData.placa_origen_2?.nombre || formData.placa_origen_2?.id}</div>
                    )}
                  </>
                )}
                {formData.tipo_inoculacion === 'aislamiento_primario' && (
                  <div><strong style={{ color: 'var(--text-secondary)' }}>Origen:</strong> <span style={{ color: '#3b82f6' }}>Origen Cero (Aislamiento Primario)</span></div>
                )}

                <div><strong style={{ color: 'var(--text-secondary)' }}>Destino:</strong> {formData.medio_prep?.alias || formData.medio_prep?.nombre} {formData.fraccion_destino ? `(${formData.fraccion_destino.id_bolsa || formData.fraccion_destino.id})` : '(Bulk)'}</div>
                {formData.tipo_inoculacion === 'hacia_sustrato' && formData.peso_humedo_unidad && (
                  <div><strong style={{ color: 'var(--text-secondary)' }}>Cantidad por unidad:</strong> {formData.peso_humedo_unidad} {formData.unidad_peso_humedo}</div>
                )}
                <div><strong style={{ color: 'var(--text-secondary)' }}>Sala:</strong> {formData.sala_destino?.nombre} {formData.estante ? `· ${formData.estante}` : ''}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Responsable:</strong> {formData.operario} · {formData.fecha_inoculacion}</div>
                {formData.contenedor_logico && <div><strong style={{ color: 'var(--text-secondary)' }}>Agrupación Fca:</strong> {formData.contenedor_logico}</div>}
                
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>IDs a generar ({formData.modo_id}):</strong>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(previewIds.join('\n')); toast.success('IDs copiados al portapapeles'); }}
                      style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      Copiar IDs
                    </button>
                  </div>
                  <div style={{ fontFamily: 'monospace', color: 'var(--primary-color)', marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--primary-color)' }}>
                    {previewIds.map((id, idx) => <div key={idx}>{id}</div>)}
                    {formData.cantidad_total > 10 && formData.modo_id === 'individual' && <div style={{ color: 'var(--text-secondary)' }}>... y {formData.cantidad_total - 10} más</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          {step > 1 ? (
            <button type="button" className="btn btn-outline" onClick={() => setStep(s => s - 1)}>← Atrás</button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          )}

          <div style={{ flex: 1 }}></div>

          {step < 6 ? (
            <button type="button" className="btn btn-primary" onClick={handleNext} disabled={!isRutaValida && step === 1}>Siguiente →</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={loading} style={{ background: '#10b981', color: 'white', fontWeight: 'bold' }}>{loading ? '⏳ Guardando...' : '✓ Confirmar Inoculación'}</button>
          )}
        </div>

      </div>

      {showSubfraccionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#2a3142', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '420px' }}>
            <h4 style={{ margin: 0, color: 'var(--primary-color)', marginBottom: '1rem' }}>Nueva subfracción</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              Crear nuevas unidades de <strong>{formData.medio_prep?.alias || formData.medio_prep?.nombre_receta}</strong> desde el stock bulk.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Stock bulk actual</label>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: 'var(--accent-color)' }}>
                {formData.medio_prep?.stock_bulk?.cantidad_actual ?? formData.medio_prep?.cantidad_actual ?? 0} unidades
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Tipo de envase</label>
              <select value={subfracTipo} onChange={e => setSubfracTipo(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', background: '#1a2233', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <option value="Bolsa">Bolsa</option>
                <option value="Placa">Placa</option>
                <option value="Tubo">Tubo</option>
                <option value="Frasco">Frasco</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Cantidad de unidades</label>
              <input type="number" min="1" value={subfracCantidad} onChange={e => setSubfracCantidad(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', background: '#1a2233', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: 'monospace' }}
                placeholder="Ej: 5" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowSubfraccionModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSubfraccionar} disabled={subfracSaving}>
                {subfracSaving ? '⏳ Creando...' : '✓ Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
