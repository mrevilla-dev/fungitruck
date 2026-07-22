import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp, increment, runTransaction, where, collectionGroup } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { uploadFileToDrive } from '../services/driveService';
import { generarIdEsporoma, generarIdEjemplar, generarIdEvento, generarIdBatch } from '../utils/idGenerator';
import SearchableSelect from '../components/SearchableSelect';
import { compressImage } from '../utils/imageUtils';
import toast from 'react-hot-toast';

function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export default function IngresoMaterialPage() {
  const navigate = useNavigate();
  const [ruta, setRuta] = useState(null); // 'A' or 'B'
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Datos globales
  const [authName, setAuthName] = useState('Sistema');
  
  // Data lists para SearchableSelects
  const [batchesActivos, setBatchesActivos] = useState([]);
  const [mediosDisponibles, setMediosDisponibles] = useState([]);
  const [salas, setSalas] = useState([]);

  // Estado del formulario (Ruta A)
  const [formA, setFormA] = useState({
    genero: "", especie: "", codigo_cepa: "", origen: "",
    lugar_recoleccion: "", latitud: "", longitud: "", 
    batch_origen_id: null,
    observaciones: "",
    fecha: new Date().toISOString().split('T')[0]
  });

  // Estado del formulario (Ruta B)
  const [formB, setFormB] = useState({
    genero: "", especie: "", codigo_cepa: "",
    proveedor: "", pais: "", formato_recepcion: "",
    observaciones: "",
    fecha: new Date().toISOString().split('T')[0],
    fecha_compra: "",
    precio: "",
    lote_proveedor: "",
    tipo_micelio: "Dicarión",
    ploidia: "Diploide"
  });

  const [foto, setFoto] = useState(null);
  const [certificado, setCertificado] = useState(null);
  const [derivaciones, setDerivaciones] = useState([]); // Solo para Ruta A

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      setAuthName(auth.currentUser.displayName || auth.currentUser.email || 'Sistema');
    }

    const unsubBatches = onSnapshot(query(collection(db, 'batches'), where('status', 'in', ['Activo', 'Incubando', 'Inoculado'])), snap => {
      setBatchesActivos(snap.docs.map(d => ({ id: d.id, nombre: `${d.id} · ${d.genero} ${d.especie}`, ...d.data() })));
    });

    const medios = [];
    const subfracciones = [];
    
    const unsubMedios = onSnapshot(collection(db, 'medios_preparados'), snap => {
      medios.length = 0;
      snap.docs.forEach(d => medios.push({ id: d.id, ...d.data() }));
      actualizarListaMedios(medios, subfracciones);
    });

    const unsubSub = onSnapshot(collectionGroup(db, 'subfracciones'), snap => {
      subfracciones.length = 0;
      snap.docs.forEach(d => subfracciones.push({ id: d.id, medioId: d.ref.parent.parent?.id, ...d.data() }));
      actualizarListaMedios(medios, subfracciones);
    });

    const unsubSalas = onSnapshot(collection(db, 'salas'), snap => {
      setSalas(snap.docs.map(d => ({ id: d.id, nombre: `${d.nombre} (${d.tipo || ''})`, ...d.data() })));
    });

    return () => { unsubBatches(); unsubMedios(); unsubSub(); unsubSalas(); };
  }, []);

  const actualizarListaMedios = (meds, subs) => {
    const options = [];
    meds.forEach(m => {
      if (m.estado === 'Activo') {
        const bulkCant = m.stock_bulk?.cantidad_actual ?? m.cantidad_actual ?? 0;
        if (bulkCant > 0) {
          options.push({ id: m.id, nombre: `${m.alias || ''} · ${m.nombre_receta} (Bulk) — ${bulkCant} disp`, type: 'bulk', medio: m });
        }
      }
      const sfs = subs.filter(s => s.medioId === m.id && s.disponible > 0);
      sfs.forEach(s => {
        options.push({ id: s.id, nombre: `${m.alias || m.nombre_receta} → ${s.id_bolsa || s.id} — ${s.disponible} disp`, type: 'sub', medio: m, sub: s });
      });
    });
    setMediosDisponibles(options);
  };

  const handleAddDerivacion = (tipo) => {
    setDerivaciones([
      ...derivaciones, 
      {
        id: Date.now() + Math.random(),
        tipo_derivacion: tipo,
        ploidia: 'Diploide',
        tipo_micelio: 'Dicarión',
        tipo_material: tipo === 'seca' ? 'Sello de Esporas' : 'Explanto',
        medio_prep_id: null,
        sala_destino_id: null,
        temperatura: '',
        tecnica: tipo === 'humeda' ? 'aislamiento_primario' : ''
      }
    ]);
  };

  const updateDerivacion = (id, field, value) => {
    setDerivaciones(derivaciones.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDerivacion = (id) => {
    setDerivaciones(derivaciones.filter(d => d.id !== id));
  };

  // Helper para resetear
  const resetForm = () => {
    setFormA({
      genero: "", especie: "", codigo_cepa: "", origen: "",
      lugar_recoleccion: "", latitud: "", longitud: "", batch_origen_id: null,
      observaciones: "", fecha: new Date().toISOString().split('T')[0]
    });
    setFormB({
      genero: "", especie: "", codigo_cepa: "",
      proveedor: "", pais: "", formato_recepcion: "",
      observaciones: "", fecha: new Date().toISOString().split('T')[0],
      fecha_compra: "", precio: "", lote_proveedor: "",
      tipo_micelio: "Dicarión", ploidia: "Diploide"
    });
    setDerivaciones([]);
    setFoto(null);
    setCertificado(null);
    setUploadProgress(0);
  };

  const handleFormatoRecepcionChange = (formato) => {
    let tipo_m = 'Dicarión';
    let ploid = 'Diploide';
    if (formato === 'Sello de esporas' || formato === 'Jeringa de esporas') {
      tipo_m = 'Polispórico';
      ploid = 'Haploide'; // o diploide poli
    }
    setFormB({ ...formB, formato_recepcion: formato, tipo_micelio: tipo_m, ploidia: ploid });
  };

  const handleSubmit = async (e, rutaActiva) => {
    e.preventDefault();
    const formValues = rutaActiva === 'A' ? formA : formB;
    
    if (!formValues.genero || !formValues.especie) return toast.error("Faltan datos básicos del género/especie.");
    if (rutaActiva === 'A' && !formValues.origen) return toast.error("Falta definir el origen.");
    if (rutaActiva === 'B' && !formValues.formato_recepcion) return toast.error("Falta el formato de recepción.");
    
    setLoading(true);
    try {
      if (rutaActiva === 'A') {
        // LÓGICA RUTA A (ESPOROMA + DERIVACIONES)
        const datePart = formValues.fecha.replace(/-/g, '').slice(2);
        const seqKeyEsp = `ESP_${datePart}`;
        const batchSeqKey = `batches_${datePart}`;
        
        let seqEsp = 1;
        let seqBatch = 1;
        
        await runTransaction(db, async (t) => {
          const counterRef = doc(db, 'metadata', 'counters');
          const docSnap = await t.get(counterRef);
          const data = docSnap.exists() ? docSnap.data() : {};
          
          seqEsp = (data[seqKeyEsp] || 0) + 1;
          seqBatch = (data[batchSeqKey] || 0) + 1;
          
          t.set(counterRef, { [seqKeyEsp]: seqEsp, [batchSeqKey]: seqBatch + derivaciones.filter(d => d.tipo_derivacion==='humeda').length }, { merge: true });
        });

        const origenCode = formValues.origen === 'Silvestre' ? 'SIL' : 'INT';
        
        const esporomaId = generarIdEsporoma({
          genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
          origen_codigo: origenCode, fecha_iso: formValues.fecha, secuencia: seqEsp
        });

        let fotoUrl = null;
        if (foto) {
          let fileToUpload = foto;
          if (foto.size > 1024 * 1024 * 8) {
            try { fileToUpload = await compressImage(foto, { maxWidth: 4000, quality: 0.9 }); } catch(e){}
          }
          const res = await uploadFileToDrive(fileToUpload, setUploadProgress);
          fotoUrl = res.url;
        }

        const wb = writeBatch(db);
        
        wb.set(doc(db, 'esporomas', esporomaId), {
          id: esporomaId,
          genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
          origen: formValues.origen,
          lugarRecoleccion: formValues.origen === 'Silvestre' ? formValues.lugar_recoleccion : '',
          latitud: formValues.origen === 'Silvestre' ? formValues.latitud : '',
          longitud: formValues.origen === 'Silvestre' ? formValues.longitud : '',
          batch_origen_id: formValues.origen === 'Cultivo interno' ? formValues.batch_origen_id : null,
          fechaRecoleccion: formValues.fecha,
          operator: authName,
          observaciones: formValues.observaciones,
          fotoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        let resText = `🍄 Esporoma ${esporomaId} registrado.\n\n`;
        let currentBatchSeq = seqBatch;

        derivaciones.forEach((deriv, i) => {
          const ejemplarId = generarIdEjemplar({
            genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
            tipo_micelio_codigo: deriv.tipo_micelio, fecha_iso: formValues.fecha, secuencia: seqEsp + i
          });

          wb.set(doc(db, 'ejemplares', ejemplarId), {
            id: ejemplarId,
            esporoma_origen_id: esporomaId,
            genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
            tipo_micelio: deriv.tipo_micelio, ploidia: deriv.ploidia,
            tipo_material: deriv.tipo_material,
            fechaIngreso: formValues.fecha,
            procedencia: 'Interna',
            externo: false,
            operator: authName,
            estado: 'Activo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          
          if (deriv.tipo_derivacion === 'seca') {
            resText += `✅ Ejemplar (Seco): ${ejemplarId}\n`;
          }

          if (deriv.tipo_derivacion === 'humeda') {
            const eventoId = generarIdEvento({
              genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
              tecnica_codigo: deriv.tecnica, fecha_iso: formValues.fecha, secuencia: seqEsp + i
            });

            wb.set(doc(db, 'eventos_aislamiento', eventoId), {
              id: eventoId,
              ejemplar_resultante_id: ejemplarId,
              esporoma_origen_id: esporomaId,
              tecnica: deriv.tecnica,
              fecha: formValues.fecha,
              operador: authName,
              createdAt: serverTimestamp()
            });

            const medioOpt = mediosDisponibles.find(m => m.id === deriv.medio_prep_id);
            const salaOpt = salas.find(s => s.id === deriv.sala_destino_id);
            const codMedio = extraerCodigoMedio(medioOpt?.medio?.alias || medioOpt?.medio?.codigo);
            const soporteFinal = medioOpt?.type === 'sub' ? medioOpt.sub.tipo_unidad : medioOpt?.medio?.tipo_soporte || medioOpt?.medio?.soporte || 'No definido';

            const batchId = generarIdBatch({
              genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
              codigo_medio: codMedio, fecha_iso: formValues.fecha, secuencia_diaria: currentBatchSeq
            });

            wb.set(doc(db, 'batches', batchId), {
              experimento_id: null,
              tratamiento_id: null,
              atributos_experimentales: {},
              id: batchId,
              genero: formValues.genero, especie: formValues.especie,
              ejemplarId: ejemplarId,
              medioPrepId: medioOpt?.medio?.id || null,
              fraccionId: medioOpt?.type === 'sub' ? medioOpt.sub.id : null,
              destinoId: salaOpt?.id || null,
              destinoNombre: salaOpt?.nombre || '',
              operator: authName,
              fechaInoculacion: formValues.fecha,
              status: 'Inoculado',
              tipo_inoculacion: 'aislamiento_primario',
              es_aislamiento_primario: true,
              destino_criopreservacion: false,
              batch_origen_id: null,
              soporte: soporteFinal,
              createdAt: serverTimestamp()
            });

            if (medioOpt) {
              if (medioOpt.type === 'sub') {
                const sfRef = doc(db, 'medios_preparados', medioOpt.medio.id, 'subfracciones', medioOpt.sub.id);
                wb.update(sfRef, { disponible: increment(-1) });
              } else {
                const medioRef = doc(db, 'medios_preparados', medioOpt.medio.id);
                wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-1) });
              }
            }

            resText += `✅ Ejemplar (Húmedo): ${ejemplarId} → Batch: ${batchId}\n`;
            currentBatchSeq++;
          }
        });

        await wb.commit();
        toast(resText);
      } else {
        // LÓGICA RUTA B (SOLO EJEMPLAR)
        const datePart = formValues.fecha.replace(/-/g, '').slice(2);
        const seqKeyEje = `EJE_${datePart}`;
        
        let seqEje = 1;
        
        await runTransaction(db, async (t) => {
          const counterRef = doc(db, 'metadata', 'counters');
          const docSnap = await t.get(counterRef);
          const data = docSnap.exists() ? docSnap.data() : {};
          
          seqEje = (data[seqKeyEje] || 0) + 1;
          t.set(counterRef, { [seqKeyEje]: seqEje }, { merge: true });
        });

        const ejemplarId = generarIdEjemplar({
          genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
          tipo_micelio_codigo: formValues.tipo_micelio, fecha_iso: formValues.fecha, secuencia: seqEje
        });

        let fotoUrl = null;
        if (foto) {
          let fileToUpload = foto;
          if (foto.size > 1024 * 1024 * 8) {
            try { fileToUpload = await compressImage(foto, { maxWidth: 4000, quality: 0.9 }); } catch(e){}
          }
          const res = await uploadFileToDrive(fileToUpload, setUploadProgress);
          fotoUrl = res.url;
        }

        let certificadoUrl = null;
        if (certificado) {
          const resCert = await uploadFileToDrive(certificado, setUploadProgress);
          certificadoUrl = resCert.url;
        }

        const wb = writeBatch(db);
        
        wb.set(doc(db, 'ejemplares', ejemplarId), {
          id: ejemplarId,
          esporoma_origen_id: null,
          ejemplar_padre_id: null,
          genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
          tipo_micelio: formValues.tipo_micelio, ploidia: formValues.ploidia,
          tipo_material: formValues.formato_recepcion,
          fechaIngreso: formValues.fecha,
          procedencia: 'Comercial',
          externo: true,
          proveedor: formValues.proveedor,
          pais: formValues.pais,
          fecha_compra: formValues.fecha_compra,
          precio: formValues.precio ? Number(formValues.precio) : 0,
          lote_proveedor: formValues.lote_proveedor,
          certificadoUrl,
          fotoUrl,
          observaciones: formValues.observaciones,
          operator: authName,
          estado: 'Activo',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await wb.commit();
        toast.success(`Ejemplar externo registrado con éxito: ${ejemplarId} (${formValues.formato_recepcion})`);
      }
      
      resetForm();
      setRuta(null); // volver al selector
    } catch (error) {
      console.error(error);
      toast.error(`Error al guardar: ${error.message}. Tus datos NO se borraron, podés reintentar.`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  if (!ruta) {
    return (
      <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>Ventanilla Única de Ingreso de Material</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-secondary)' }}>
          Seleccioná el tipo de material biológico que estás ingresando al sistema.
        </p>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            onClick={() => setRuta('A')}
            style={{ 
              flex: '1 1 300px', padding: '2rem', borderRadius: '16px', 
              border: '2px solid var(--primary-color)', background: 'var(--surface-color)',
              color: 'var(--text-color)', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🍄</div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Recolección propia / Cultivo interno</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Hongo silvestre recolectado en campo, o cuerpo fructífero cosechado de producción interna.
            </p>
          </button>

          <button 
            onClick={() => setRuta('B')}
            style={{ 
              flex: '1 1 300px', padding: '2rem', borderRadius: '16px', 
              border: '2px solid #8b5cf6', background: 'var(--surface-color)',
              color: 'var(--text-color)', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📦</div>
            <h3 style={{ marginBottom: '1rem', color: '#8b5cf6' }}>Genética externa / Comprada</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Jeringa de micelio, placa colonizada, spawn externo, o sello de esporas de proveedor comercial.
            </p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <button type="button" className="btn btn-secondary" style={{ marginBottom: '1rem' }} onClick={() => { resetForm(); setRuta(null); }} disabled={loading}>
        ← Volver al selector
      </button>
      
      {ruta === 'A' && (
        <form onSubmit={(e) => handleSubmit(e, 'A')} className="card">
          <h2 style={{ color: 'var(--primary-color)', marginBottom: '1.5rem' }}>🍄 Recolección propia / Cultivo interno</h2>
          
          <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Datos del Esporoma</h4>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Género *</label>
              <input type="text" className="form-control" required value={formA.genero} onChange={e => setFormA({...formA, genero: e.target.value})} placeholder="Ej: Ganoderma" />
            </div>
            <div className="form-group">
              <label className="form-label">Especie *</label>
              <input type="text" className="form-control" required value={formA.especie} onChange={e => setFormA({...formA, especie: e.target.value})} placeholder="Ej: lucidum" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código de Cepa (Opcional)</label>
              <input type="text" className="form-control" value={formA.codigo_cepa} onChange={e => setFormA({...formA, codigo_cepa: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Origen *</label>
              <select className="form-control" required value={formA.origen} onChange={e => setFormA({...formA, origen: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                <option value="Silvestre">Silvestre</option>
                <option value="Cultivo interno">Cultivo interno</option>
              </select>
            </div>
          </div>

          {formA.origen === 'Silvestre' && (
            <div className="grid-2 animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Lugar de Recolección *</label>
                <input type="text" className="form-control" required value={formA.lugar_recoleccion} onChange={e => setFormA({...formA, lugar_recoleccion: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Latitud</label>
                <input type="number" step="any" className="form-control" value={formA.latitud} onChange={e => setFormA({...formA, latitud: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Longitud</label>
                <input type="number" step="any" className="form-control" value={formA.longitud} onChange={e => setFormA({...formA, longitud: e.target.value})} />
              </div>
            </div>
          )}

          {formA.origen === 'Cultivo interno' && (
            <div className="form-group animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', zIndex: 100, position: 'relative' }}>
              <label className="form-label">Batch de Origen *</label>
              <SearchableSelect 
                options={batchesActivos} 
                value={formA.batch_origen_id || ''} 
                onChange={val => setFormA({...formA, batch_origen_id: val})} 
                placeholder="-- Buscar Batch Activo --" 
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Foto del ejemplar</label>
            <input type="file" accept="image/*" className="form-control" onChange={e => setFoto(e.target.files[0])} />
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="2" value={formA.observaciones} onChange={e => setFormA({...formA, observaciones: e.target.value})} />
          </div>

          {/* Compartido: Derivaciones UI */}
          {renderDerivacionesUI()}
          {renderSubmitButton()}
        </form>
      )}

      {ruta === 'B' && (
        <form onSubmit={(e) => handleSubmit(e, 'B')} className="card">
          <h2 style={{ color: '#8b5cf6', marginBottom: '1.5rem' }}>📦 Genética externa / Comprada</h2>
          
          <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Identificación de la Genética</h4>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Género *</label>
              <input type="text" className="form-control" required value={formB.genero} onChange={e => setFormB({...formB, genero: e.target.value})} placeholder="Ej: Pleurotus" />
            </div>
            <div className="form-group">
              <label className="form-label">Especie *</label>
              <input type="text" className="form-control" required value={formB.especie} onChange={e => setFormB({...formB, especie: e.target.value})} placeholder="Ej: ostreatus" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código de Cepa (Si aplica)</label>
              <input type="text" className="form-control" value={formB.codigo_cepa} onChange={e => setFormB({...formB, codigo_cepa: e.target.value})} placeholder="Ej: Blue Oyster 12" />
            </div>
            <div className="form-group">
              <label className="form-label">Formato de Recepción *</label>
              <select className="form-control" required value={formB.formato_recepcion} onChange={e => handleFormatoRecepcionChange(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                <option value="Jeringa líquida">Jeringa de micelio líquido</option>
                <option value="Sello de esporas">Sello de esporas</option>
                <option value="Placa colonizada">Placa de Agar colonizada</option>
                <option value="Tubo/Slant">Tubo / Slant</option>
                <option value="Spawn externo">Spawn comercial</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de Micelio</label>
              <select className="form-control" value={formB.tipo_micelio} onChange={e => setFormB({...formB, tipo_micelio: e.target.value})}>
                <option value="Dicarión">Dicarión</option>
                <option value="Monocarión">Monocarión</option>
                <option value="Polispórico">Polispórico</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ploidía</label>
              <select className="form-control" value={formB.ploidia} onChange={e => setFormB({...formB, ploidia: e.target.value})}>
                <option value="Diploide">Diploide</option>
                <option value="Haploide">Haploide</option>
                <option value="Desconocido">Desconocido</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Proveedor</label>
              <input type="text" className="form-control" value={formB.proveedor} onChange={e => setFormB({...formB, proveedor: e.target.value})} placeholder="Nombre del proveedor o tienda" />
            </div>
            <div className="form-group">
              <label className="form-label">Lote del Proveedor</label>
              <input type="text" className="form-control" value={formB.lote_proveedor} onChange={e => setFormB({...formB, lote_proveedor: e.target.value})} placeholder="Ej: L-2023-A" />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">País de Origen</label>
              <input type="text" className="form-control" value={formB.pais} onChange={e => setFormB({...formB, pais: e.target.value})} placeholder="Ej: Argentina" />
            </div>
            <div className="form-group">
              <label className="form-label">Precio</label>
              <input type="number" step="0.01" className="form-control" value={formB.precio} onChange={e => setFormB({...formB, precio: e.target.value})} placeholder="Ej: 5000" />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fecha de Compra</label>
              <input type="date" className="form-control" value={formB.fecha_compra} onChange={e => setFormB({...formB, fecha_compra: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Foto de Recepción</label>
            <input type="file" accept="image/*" className="form-control" onChange={e => setFoto(e.target.files[0])} />
          </div>

          <div className="form-group">
            <label className="form-label">Certificado / Ficha Técnica (Opcional)</label>
            <input type="file" className="form-control" onChange={e => setCertificado(e.target.files[0])} />
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="2" value={formB.observaciones} onChange={e => setFormB({...formB, observaciones: e.target.value})} />
          </div>

          {/* Ruta B no tiene derivaciones (generan 1 Ejemplar y listo) */}
          {renderSubmitButton()}
        </form>
      )}
    </div>
  );

  function renderDerivacionesUI() {
    return (
      <>
        <h4 style={{ marginTop: '2rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Derivaciones Inmediatas
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleAddDerivacion('seca')}>+ Seca (Guardar)</button>
            <button type="button" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleAddDerivacion('humeda')}>+ Húmeda (Cultivar)</button>
          </div>
        </h4>

        {derivaciones.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No hay derivaciones agregadas. Se guardará solo el Esporoma/Registro.</p>
        ) : (
          derivaciones.map((d, idx) => (
            <div key={d.id} className="animate-fade-in" style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${d.tipo_derivacion === 'seca' ? '#fbbf24' : '#60a5fa'}`, borderRadius: '8px', padding: '1rem', marginBottom: '1rem', position: 'relative', zIndex: 90 - idx }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <strong style={{ color: d.tipo_derivacion === 'seca' ? '#fbbf24' : '#60a5fa' }}>
                  {idx + 1}. Derivación {d.tipo_derivacion === 'seca' ? 'Seca (Sin Batch)' : 'Húmeda (Genera Batch)'}
                </strong>
                <button type="button" onClick={() => removeDerivacion(d.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>🗑️</button>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo de Material</label>
                  <input type="text" className="form-control" value={d.tipo_material} onChange={e => updateDerivacion(d.id, 'tipo_material', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de Micelio</label>
                  <select className="form-control" value={d.tipo_micelio} onChange={e => updateDerivacion(d.id, 'tipo_micelio', e.target.value)}>
                    <option value="Dicarión">Dicarión</option>
                    <option value="Monocarión">Monocarión</option>
                    <option value="Polispórico">Polispórico</option>
                  </select>
                </div>
              </div>

              {d.tipo_derivacion === 'humeda' && (
                <div className="grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group" style={{ position: 'relative', zIndex: 90 - idx }}>
                    <label className="form-label">Medio Preparado *</label>
                    <SearchableSelect 
                      options={mediosDisponibles} 
                      value={d.medio_prep_id || ''} 
                      onChange={val => updateDerivacion(d.id, 'medio_prep_id', val)} 
                      placeholder="-- Buscar Medio Disponible --" 
                    />
                  </div>
                  <div className="form-group" style={{ position: 'relative', zIndex: 80 - idx }}>
                    <label className="form-label">Sala Destino *</label>
                    <SearchableSelect 
                      options={salas} 
                      value={d.sala_destino_id || ''} 
                      onChange={val => updateDerivacion(d.id, 'sala_destino_id', val)} 
                      placeholder="-- Buscar Sala --" 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Técnica Aislamiento</label>
                    <input type="text" className="form-control" placeholder="Ej: Explanto de estípite" value={d.tecnica} onChange={e => updateDerivacion(d.id, 'tecnica', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Temperatura Incubación</label>
                    <input type="text" className="form-control" value={d.temperatura} onChange={e => updateDerivacion(d.id, 'temperatura', e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </>
    );
  }

  function renderSubmitButton() {
    return (
      <>
        {loading && uploadProgress > 0 && (
          <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              <span>Subiendo foto...</span><span>{Math.round(uploadProgress)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--primary-color)' }}></div>
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1.5rem' }} disabled={loading}>
          {loading ? 'Guardando Transacción...' : '💾 Registrar Ingreso Completo'}
        </button>
      </>
    );
  }
}
