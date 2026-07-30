import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection, doc, onSnapshot, orderBy, query, getDoc, setDoc,
  serverTimestamp, runTransaction, writeBatch, collectionGroup, increment, where
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import SearchableSelect from './SearchableSelect';
import ScanInput from './ScanInput';
import PrintLabelsModal from './PrintLabelsModal';
import { generarIdBatch } from '../utils/idGenerator';
import { useMediosDisponibles } from '../hooks/useMediosDisponibles';
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
  'Agotamiento en superficie',
  'Aislamiento monospórico',
  'Subcultivo',
  'Explanto directo',
  'Esporulación directa',
  'N/A',
];

const EMPTY_EVT = {
  ejemplar_origen_id: '',
  tecnica: 'Subcultivo',
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
  cantidad_unidades: 1,
  modo_id: 'individual',
  medio_prep: null,
  fraccion_destino: null,
};

export default function NuevoEventoAislamientoModal({ onClose }) {
  const [formData, setFormData] = useState(EMPTY_EVT);
  const [loading, setLoading] = useState(false);
  const [ejemplares, setEjemplares] = useState([]);
  const [salas, setSalas] = useState([]);
  const [contenedores, setContenedores] = useState([]);

  const [globalEnvaseTypes, setGlobalEnvaseTypes] = useState([]);
  const [showPrint, setShowPrint] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);

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
    const q = query(
      collection(db, 'ejemplares'),
      where('eliminado', '==', false),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setEjemplares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
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

      const newDocRef = doc(collection(db, 'eventos_aislamiento'));
      wb.set(newDocRef, {
        id_semantico: newId,
        ejemplar_origen_id: formData.ejemplar_origen_id,
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
        cantidad_unidades: Number(formData.cantidad_unidades) || 1,
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
          tecnica_aislamiento: formData.tecnica,
          operator: formData.operario || 'Sistema',
          fechaInoculacion: formData.fecha,
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

      const totalDescuento = (Number(formData.cantidad_derivados) || 1) * (Number(formData.cantidad_unidades) || 1);
      if (formData.fraccion_destino && formData.medio_prep) {
        const medioId = formData.fraccion_destino.medioId || formData.medio_prep.id;
        const sfRef = doc(db, 'medios_preparados', medioId, 'subfracciones', formData.fraccion_destino.id);
        wb.update(sfRef, { disponible: increment(-totalDescuento) });
        if ((formData.fraccion_destino.disponible ?? 0) <= totalDescuento) {
          const mRef = doc(db, 'medios_preparados', medioId);
          wb.update(mRef, { subfracciones_disponibles: increment(-1) });
        }
      } else if (formData.medio_prep && !formData.fraccion_destino) {
        const medioRef = doc(db, 'medios_preparados', formData.medio_prep.id);
        wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-totalDescuento) });
      }

      await wb.commit();

      // Guardar batches creados para imprimir si corresponde
      if (formData.imprimir_etiqueta) {
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
            <div style={{ marginTop: '0.5rem' }}>
              <ScanInput
                onScan={async (scannedId) => {
                  const id = scannedId.trim();
                  const opt = ejemplaresOptions.find(e => e.id === id);
                  if (opt) {
                    handleChange('ejemplar_origen_id', opt.id);
                    toast.success(`Ejemplar seleccionado: ${opt.nombre}`);
                  } else {
                    toast.error(`No se encontró ejemplar: ${id}`);
                  }
                }}
                label="📷 Escanear QR del Ejemplar"
              />
            </div>
          </div>

          {/* Técnica */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Técnica <span style={{ color: 'red' }}>*</span></label>
            <select
              className="form-control" required
              value={formData.tecnica}
              onChange={e => handleChange('tecnica', e.target.value)}
            >
              {TECNICAS.map(t => <option key={t} value={t}>{t}</option>)}
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

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cantidad de unidades <span style={{ color: 'red' }}>*</span></label>
            <input
              type="number"
              className="form-control"
              min="1"
              value={formData.cantidad_unidades}
              onChange={e => handleChange('cantidad_unidades', e.target.value)}
            />
          </div>

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
        {showPrint && <PrintLabelsModal batches={createdBatches} onClose={() => { setShowPrint(false); onClose(); }} usuarioActivo={formData.operario} />}
      </div>
    </div>
  );
}
