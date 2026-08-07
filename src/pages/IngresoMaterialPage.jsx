import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp, increment, runTransaction, where, collectionGroup, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { uploadFileToDrive } from '../services/driveService';
import { generarIdEsporoma, generarIdEjemplar, generarIdEvento, generarIdBatch } from '../utils/idGenerator';
import { getTipoMaterialCodigo } from '../utils/tipoMaterialCodes';
import SearchableSelect from '../components/SearchableSelect';
import PrintLabelsModal from '../components/PrintLabelsModal';
import ScanInput from '../components/ScanInput';
import { compressImage } from '../utils/imageUtils';
import toast from 'react-hot-toast';

const TIPOS_MATERIAL = [
  { id: 'sello_esporas', label: 'Sello de Esporas' },
  { id: 'explanto', label: 'Explanto de Tejido' },
  { id: 'micelio', label: 'Micelio' },
  { id: 'grano', label: 'Grano Colonizado' },
  { id: 'liquido', label: 'Cultivo Líquido' },
];

const TECNICAS_AISLAMIENTO = [
  { id: 'aislamiento_primario', label: 'Aislamiento Primario (Origen Cero)' },
  { id: 'explanto_estipite', label: 'Explanto de Estípite' },
  { id: 'explanto_pileo', label: 'Explanto de Pileo' },
  { id: 'transferencia', label: 'Transferencia Aséptica' },
  { id: 'germinacion', label: 'Germinación de Esporas' },
];

const PLOIDIAS = [
  { id: 'haploide', label: 'Haploide' },
  { id: 'diploide', label: 'Diploide' },
  { id: 'desconocido', label: 'Desconocido' },
];

const TIPOS_MICELIO = [
  { id: 'dicarion', label: 'Dicarión' },
  { id: 'monocarion', label: 'Monocarión' },
  { id: 'polisporico', label: 'Polispórico' },
];

function extraerCodigoMedio(alias) {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return (codigo || 'MED').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export default function IngresoMaterialPage() {
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
    fecha: new Date().toISOString().split('T')[0],
    precio: "",
    fecha_compra: ""
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
    tipo_micelio: "",
    ploidia: ""
  });

  const [fotos, setFotos] = useState([]);
  const [certificados, setCertificados] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imprimirEtiqueta, setImprimirEtiqueta] = useState(false);
  const [batchesToPrint, setBatchesToPrint] = useState(null);
  const [derivaciones, setDerivaciones] = useState([]); // Solo para Ruta A
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      setAuthName(auth.currentUser.displayName || auth.currentUser.email || 'Sistema');
    }

    const unsubBatches = onSnapshot(query(collection(db, 'batches'), where('status', 'in', ['Activo', 'Incubando', 'Inoculado'])), snap => {
      setBatchesActivos(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, nombre: `${d.id} · ${data.genero || ''} ${data.especie || ''}`.trim(), ...data };
      }));
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
        ploidia: tipo === 'seca' ? 'haploide' : 'diploide',
        tipo_micelio: tipo === 'seca' ? 'polisporico' : 'dicarion',
        tipo_material: tipo === 'seca' ? 'sello_esporas' : 'explanto',
        tecnica: tipo === 'humeda' ? 'aislamiento_primario' : '',
        medio_prep_id: null,
        sala_destino_id: null,
        temperatura: '',
        observaciones: '',
        foto: null
      }
    ]);
  };

  const updateDerivacion = (id, field, value) => {
    setDerivaciones(derivaciones.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDerivacion = (id) => {
    setDerivaciones(derivaciones.filter(d => d.id !== id));
  };

  const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

  const handleAddFotos = (files) => {
    const newFiles = Array.from(files);
    const totalSize = [...fotos, ...newFiles].reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) return toast.error('El total de imágenes no puede superar 50MB');
    setFotos(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFoto = (index) => setFotos(prev => prev.filter((_, i) => i !== index));

  const handleAddCertificados = (files) => {
    const newFiles = Array.from(files);
    setCertificados(prev => [...prev, ...newFiles]);
  };

  const handleRemoveCertificado = (index) => setCertificados(prev => prev.filter((_, i) => i !== index));

  // Helper para resetear
  const resetForm = () => {
    setFormA({
      genero: "", especie: "", codigo_cepa: "", origen: "",
      lugar_recoleccion: "", latitud: "", longitud: "", batch_origen_id: null,
      observaciones: "", fecha: new Date().toISOString().split('T')[0],
      precio: "", fecha_compra: ""
    });
    setFormB({
      genero: "", especie: "", codigo_cepa: "",
      proveedor: "", pais: "", formato_recepcion: "",
      observaciones: "", fecha: new Date().toISOString().split('T')[0],
      fecha_compra: "", precio: "", lote_proveedor: "",
      tipo_micelio: "", ploidia: ""
    });
    setDerivaciones([]);
    setFotos([]);
    setCertificados([]);
    setUploadingImages(false);
    setUploadProgress(0);
  };

  const handleFormatoRecepcionChange = (formato) => {
    let tipo_m = '';
    let ploid = '';
    if (formato === 'Sello de esporas' || formato === 'Jeringa de esporas') {
      tipo_m = 'polisporico';
      ploid = 'haploide';
    } else if (formato) {
      tipo_m = 'dicarion';
      ploid = 'diploide';
    }
    setFormB({ ...formB, formato_recepcion: formato, tipo_micelio: tipo_m, ploidia: ploid });
  };

  const handleSubmit = async (e, rutaActiva) => {
    e.preventDefault();
    const formValues = rutaActiva === 'A' ? formA : formB;
    let newRecordId = null;
    
    const newErrors = {};
    if (!formValues.genero) newErrors.genero = true;
    if (!formValues.especie) newErrors.especie = true;
    if (rutaActiva === 'A' && !formValues.origen) newErrors.origen = true;
    if (rutaActiva === 'B' && !formValues.formato_recepcion) newErrors.formato_recepcion = true;
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return toast.error("Completá los campos obligatorios.");
    }
    
    for (const deriv of derivaciones) {
      if (!deriv.tipo_material) {
        setLoading(false);
        return toast.error('Todas las derivaciones deben tener Tipo de Material');
      }
      if (deriv.tipo_derivacion === 'humeda' && !deriv.tecnica) {
        setLoading(false);
        return toast.error('Las derivaciones húmedas deben tener Técnica de Aislamiento');
      }
    }
    
    setErrors({});
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

        const origenMap = {
          'Silvestre': 'SIL',
          'Cultivo interno': 'INT',
          'Compra a productor': 'PRO',
          'Comercial': 'COM',
          'Intercambio': 'EXC',
          'Donación': 'DON',
          'Desconocido': 'DES'
        };
        const origenCode = origenMap[formValues.origen] || 'UNK';
        
        const esporomaId = generarIdEsporoma({
          genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
          origen_codigo: origenCode, fecha_iso: formValues.fecha, secuencia: seqEsp
        });

        let fotoUrl = null;
        const fotosUrls = [];
        if (fotos.length > 0) {
          let fileToUpload = fotos[0];
          if (fotos[0].size > 1024 * 1024 * 8) {
            try { fileToUpload = await compressImage(fotos[0], { maxWidth: 4000, quality: 0.9 }); } catch(e){}
          }
          const res = await uploadFileToDrive(fileToUpload, setUploadProgress);
          fotoUrl = res.imageUrl || res.url;
          fotosUrls.push(fotoUrl);
        }

        newRecordId = esporomaId;

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
          precio: formValues.precio ? Number(formValues.precio) : null,
          fecha_compra: formValues.fecha_compra || null,
          fotoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        let resText = `🍄 Esporoma ${esporomaId} registrado.\n\n`;
        let currentBatchSeq = seqBatch;
        let derivIdx = 0;

        for (const deriv of derivaciones) {
          let derivacionFotoUrl = null;
          if (deriv.foto) {
            try {
              const res = await uploadFileToDrive(deriv.foto);
              derivacionFotoUrl = res.imageUrl || res.url;
            } catch (err) {
              console.error('Error subiendo foto de derivación:', err);
            }
          }

          const ejemplarId = generarIdEjemplar({
            genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
            tipo_micelio_codigo: getTipoMaterialCodigo(deriv.tipo_material), fecha_iso: formValues.fecha, secuencia: seqEsp + derivIdx
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
            updatedAt: serverTimestamp(),
            tecnica: deriv.tecnica || null,
            observaciones_derivacion: deriv.observaciones || null,
            foto_derivacion: derivacionFotoUrl
          });
          
          if (deriv.tipo_derivacion === 'seca') {
            resText += `✅ Ejemplar (Seco): ${ejemplarId}\n`;
          }

          if (deriv.tipo_derivacion === 'humeda') {
            const eventoId = generarIdEvento({
              genero: formValues.genero, especie: formValues.especie, codigo_cepa: formValues.codigo_cepa,
              tecnica_codigo: deriv.tecnica, fecha_iso: formValues.fecha, secuencia: seqEsp + derivIdx
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
                if ((medioOpt.sub.disponible ?? 0) <= 1) {
                  const mRef = doc(db, 'medios_preparados', medioOpt.medio.id);
                  wb.update(mRef, { subfracciones_disponibles: increment(-1) });
                }
              } else {
                const medioRef = doc(db, 'medios_preparados', medioOpt.medio.id);
                wb.update(medioRef, { 'stock_bulk.cantidad_actual': increment(-1) });
              }
            }

            resText += `✅ Ejemplar (Húmedo): ${ejemplarId} → Batch: ${batchId}\n`;
            currentBatchSeq++;
          }

          derivIdx++;
        }

        await wb.commit();
        toast(resText);

        if (fotos.length > 1) {
          setUploadingImages(true);
          const nuevasFotosUrls = [];
          try {
            for (let i = 1; i < fotos.length; i++) {
              let fileToUpload = fotos[i];
              if (fotos[i].size > 1024 * 1024 * 8) {
                try { fileToUpload = await compressImage(fotos[i], { maxWidth: 4000, quality: 0.9 }); } catch(e){}
              }
              const res = await uploadFileToDrive(fileToUpload);
              nuevasFotosUrls.push(res.imageUrl || res.url);
            }
            if (nuevasFotosUrls.length > 0) {
              await updateDoc(doc(db, 'esporomas', esporomaId), {
                fotos_urls: [...fotosUrls, ...nuevasFotosUrls]
              });
              toast.success(`${nuevasFotosUrls.length} imágenes adicionales subidas en segundo plano`);
            }
          } catch (err) {
            console.error('Error en upload segundo plano:', err);
            toast.error('Algunas imágenes no pudieron subirse. Reintentá desde el registro.');
          } finally {
            setUploadingImages(false);
          }
        }
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
          tipo_micelio_codigo: getTipoMaterialCodigo(formValues.formato_recepcion), fecha_iso: formValues.fecha, secuencia: seqEje
        });

        let fotoUrl = null;
        const fotosUrls = [];
        if (fotos.length > 0) {
          let fileToUpload = fotos[0];
          if (fotos[0].size > 1024 * 1024 * 8) {
            try { fileToUpload = await compressImage(fotos[0], { maxWidth: 4000, quality: 0.9 }); } catch(e){}
          }
          const res = await uploadFileToDrive(fileToUpload, setUploadProgress);
          fotoUrl = res.imageUrl || res.url;
          fotosUrls.push(fotoUrl);
        }

        let certificadoUrl = null;
        const certificadosUrls = [];
        if (certificados.length > 0) {
          const resCert = await uploadFileToDrive(certificados[0], setUploadProgress);
          certificadoUrl = resCert.imageUrl || resCert.url;
          certificadosUrls.push(certificadoUrl);
        }

        newRecordId = ejemplarId;

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

        if (fotos.length > 1 || certificados.length > 1) {
          setUploadingImages(true);
          const nuevasFotosUrls = [];
          const nuevosCertUrls = [];
          try {
            for (let i = 1; i < fotos.length; i++) {
              let fileToUpload = fotos[i];
              if (fotos[i].size > 1024 * 1024 * 8) {
                try { fileToUpload = await compressImage(fotos[i], { maxWidth: 4000, quality: 0.9 }); } catch(e){}
              }
              const res = await uploadFileToDrive(fileToUpload);
              nuevasFotosUrls.push(res.imageUrl || res.url);
            }
            for (let i = 1; i < certificados.length; i++) {
              const res = await uploadFileToDrive(certificados[i]);
              nuevosCertUrls.push(res.imageUrl || res.url);
            }
            const updateData = {};
            if (nuevasFotosUrls.length > 0) updateData.fotos_urls = [...fotosUrls, ...nuevasFotosUrls];
            if (nuevosCertUrls.length > 0) updateData.certificados_urls = [...certificadosUrls, ...nuevosCertUrls];
            if (Object.keys(updateData).length > 0) {
              await updateDoc(doc(db, 'ejemplares', ejemplarId), updateData);
              toast.success(`${(nuevasFotosUrls.length + nuevosCertUrls.length)} archivos subidos en segundo plano`);
            }
          } catch (err) {
            console.error('Error en upload segundo plano:', err);
            toast.error('Algunos archivos no pudieron subirse.');
          } finally {
            setUploadingImages(false);
          }
        }
      }
      
      if (imprimirEtiqueta) {
        const batchData = {
          id: newRecordId,
          alias: formValues.codigo_cepa 
            ? `${formValues.genero} ${formValues.especie} [${formValues.codigo_cepa}]`
            : `${formValues.genero} ${formValues.especie}`.trim(),
          especie: formValues.codigo_cepa 
            ? `${formValues.genero} ${formValues.especie} [${formValues.codigo_cepa}]`
            : `${formValues.genero} ${formValues.especie}`.trim(),
          tipo_inoculacion: rutaActiva === 'A' ? 'esporoma' : 'ejemplar_externo',
          generacion: 0,
          numero_unidad: 1,
          total_unidades: 1,
          fecha: formValues.fecha,
          operario: authName,
          nombre_receta: `${formValues.genero} ${formValues.especie}`.trim(),
          tipo_uso: 'Registro',
          tipo_etiqueta: rutaActiva === 'A' ? 'PORTAOBJETOS' : 'MEDIO_ESTANDAR',
          codigo_cepa: formValues.codigo_cepa || null
        };
        setBatchesToPrint([batchData]);
        setImprimirEtiqueta(false);
        return;
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
            className="selector-card"
            style={{ 
              flex: '1 1 300px', padding: '2rem', borderRadius: '16px', 
              border: '2px solid var(--primary-color)', background: 'var(--surface-color)',
              color: 'var(--text-color)', cursor: 'pointer', textAlign: 'center'
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
            className="selector-card"
            style={{ 
              flex: '1 1 300px', padding: '2rem', borderRadius: '16px', 
              border: '2px solid #8b5cf6', background: 'var(--surface-color)',
              color: 'var(--text-color)', cursor: 'pointer', textAlign: 'center'
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
              <input type="text" className={`form-control ${errors.genero ? 'is-invalid' : ''}`} required value={formA.genero} onChange={e => { setFormA({...formA, genero: e.target.value}); setErrors(prev => ({...prev, genero: false})); }} placeholder="Ej: Ganoderma" />
              {errors.genero && <div className="form-error">Ingresá el género.</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Especie *</label>
              <input type="text" className={`form-control ${errors.especie ? 'is-invalid' : ''}`} required value={formA.especie} onChange={e => { setFormA({...formA, especie: e.target.value}); setErrors(prev => ({...prev, especie: false})); }} placeholder="Ej: lucidum" />
              {errors.especie && <div className="form-error">Ingresá la especie.</div>}
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código de Cepa (Opcional)</label>
              <input type="text" className="form-control" value={formA.codigo_cepa} onChange={e => setFormA({...formA, codigo_cepa: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Origen *</label>
              <select className={`form-control ${errors.origen ? 'is-invalid' : ''}`} required value={formA.origen} onChange={e => { setFormA({...formA, origen: e.target.value}); setErrors(prev => ({...prev, origen: false})); }}>
                <option value="">-- Seleccionar --</option>
                <option value="Silvestre">Silvestre</option>
                <option value="Cultivo interno">Cultivo interno</option>
                <option value="Donación">Donación</option>
                <option value="Intercambio">Intercambio</option>
                <option value="Compra">Compra</option>
              </select>
              {errors.origen && <div className="form-error">Seleccioná el origen.</div>}
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
              <div style={{ marginTop: '0.5rem' }}>
                <ScanInput 
                  onScan={async (scannedId) => {
                    const id = scannedId.trim();
                    const opt = batchesActivos.find(b => b.id === id);
                    if (opt) {
                      setFormA({...formA, batch_origen_id: opt.id});
                      toast.success(`Batch seleccionado: ${opt.id}`);
                    } else {
                      toast.error(`No se encontró batch activo: ${id}`);
                    }
                  }} 
                  label="Escanear QR del Batch" 
                />
              </div>
            </div>
          )}

          {(formA.origen === 'Compra' || formA.origen === 'Intercambio') && (
            <div className="grid-2 animate-fade-in" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
              <div className="form-group">
                <label className="form-label">Precio (ARS)</label>
                <input type="number" step="0.01" className="form-control" value={formA.precio || ''} onChange={e => setFormA({...formA, precio: e.target.value})} placeholder="Ej: 5000" />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de Compra/Intercambio</label>
                <input type="date" className="form-control" value={formA.fecha_compra || ''} onChange={e => setFormA({...formA, fecha_compra: e.target.value})} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Fotos del ejemplar (múltiples, máx 50MB total)</label>
            <input type="file" accept="image/*" multiple className="form-control" onChange={e => handleAddFotos(e.target.files)} />
            {fotos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {fotos.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                    <button type="button" onClick={() => handleRemoveFoto(i)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '0.7rem', lineHeight: '20px', textAlign: 'center' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="2" value={formA.observaciones} onChange={e => setFormA({...formA, observaciones: e.target.value})} />
          </div>

          {/* Compartido: Derivaciones UI */}
          {renderDerivacionesUI()}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <input type="checkbox" checked={imprimirEtiqueta} onChange={e => setImprimirEtiqueta(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
            <span style={{ fontWeight: 600 }}>🏷️ Generar etiqueta después de registrar</span>
          </label>
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
              <input type="text" className={`form-control ${errors.genero ? 'is-invalid' : ''}`} required value={formB.genero} onChange={e => { setFormB({...formB, genero: e.target.value}); setErrors(prev => ({...prev, genero: false})); }} placeholder="Ej: Pleurotus" />
              {errors.genero && <div className="form-error">Ingresá el género.</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Especie *</label>
              <input type="text" className={`form-control ${errors.especie ? 'is-invalid' : ''}`} required value={formB.especie} onChange={e => { setFormB({...formB, especie: e.target.value}); setErrors(prev => ({...prev, especie: false})); }} placeholder="Ej: ostreatus" />
              {errors.especie && <div className="form-error">Ingresá la especie.</div>}
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código de Cepa (Si aplica)</label>
              <input type="text" className="form-control" value={formB.codigo_cepa} onChange={e => setFormB({...formB, codigo_cepa: e.target.value})} placeholder="Ej: Blue Oyster 12" />
            </div>
            <div className="form-group">
              <label className="form-label">Formato de Recepción *</label>
              <select className={`form-control ${errors.formato_recepcion ? 'is-invalid' : ''}`} required value={formB.formato_recepcion} onChange={e => { handleFormatoRecepcionChange(e.target.value); setErrors(prev => ({...prev, formato_recepcion: false})); }}>
                <option value="">-- Seleccionar --</option>
                <option value="Jeringa líquida">Jeringa de micelio líquido</option>
                <option value="Sello de esporas">Sello de esporas</option>
                <option value="Placa colonizada">Placa de Agar colonizada</option>
                <option value="Tubo/Slant">Tubo / Slant</option>
                <option value="Spawn externo">Spawn comercial</option>
                <option value="Granos colonizados">Granos colonizados</option>
                <option value="Cultivo líquido">Cultivo líquido</option>
              </select>
              {errors.formato_recepcion && <div className="form-error">Seleccioná el formato de recepción.</div>}
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de Micelio</label>
              <select className="form-control" value={formB.tipo_micelio} onChange={e => setFormB({...formB, tipo_micelio: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {TIPOS_MICELIO.map(tm => (
                  <option key={tm.id} value={tm.id}>{tm.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ploidía</label>
              <select className="form-control" value={formB.ploidia} onChange={e => setFormB({...formB, ploidia: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {PLOIDIAS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
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
              <label className="form-label">Precio (ARS)</label>
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
            <label className="form-label">Fotos de Recepción (múltiples, máx 50MB total)</label>
            <input type="file" accept="image/*" multiple className="form-control" onChange={e => handleAddFotos(e.target.files)} />
            {fotos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {fotos.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                    <button type="button" onClick={() => handleRemoveFoto(i)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '0.7rem', lineHeight: '20px', textAlign: 'center' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Certificados / Fichas Técnicas (múltiples)</label>
            <input type="file" multiple className="form-control" onChange={e => handleAddCertificados(e.target.files)} />
            {certificados.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {certificados.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.8rem' }}>📄 {c.name}</span>
                    <button type="button" onClick={() => handleRemoveCertificado(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea className="form-control" rows="2" value={formB.observaciones} onChange={e => setFormB({...formB, observaciones: e.target.value})} />
          </div>

          {/* Ruta B: informar que derivaciones se crean desde Inoculaciones */}
          <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', fontSize: '0.85rem', color: '#c4b5fd' }}>
            💡 Las derivaciones (Seca / Húmeda) se crean desde el módulo de <strong>Inoculaciones</strong> una vez que el ejemplar está registrado.
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <input type="checkbox" checked={imprimirEtiqueta} onChange={e => setImprimirEtiqueta(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
            <span style={{ fontWeight: 600 }}>🏷️ Generar etiqueta después de registrar</span>
          </label>

          {renderSubmitButton()}
        </form>
      )}

      {batchesToPrint && <PrintLabelsModal batches={batchesToPrint} onClose={() => setBatchesToPrint(null)} />}
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
                  <label className="form-label">Tipo de Material *</label>
                  <select className="form-control" value={d.tipo_material} onChange={e => updateDerivacion(d.id, 'tipo_material', e.target.value)}>
                    {TIPOS_MATERIAL.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de Micelio</label>
                  <select className="form-control" value={d.tipo_micelio} onChange={e => updateDerivacion(d.id, 'tipo_micelio', e.target.value)}>
                    {TIPOS_MICELIO.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Ploidía *</label>
                  <select className="form-control" value={d.ploidia} onChange={e => updateDerivacion(d.id, 'ploidia', e.target.value)}>
                    {PLOIDIAS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Temperatura Incubación</label>
                  <input type="text" className="form-control" value={d.temperatura} onChange={e => updateDerivacion(d.id, 'temperatura', e.target.value)} />
                </div>
              </div>

              {d.tipo_derivacion === 'humeda' && (
                <div className="grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group" style={{ position: 'relative', zIndex: 90 - idx, gridColumn: '1 / -1' }}>
                    <label className="form-label">Medio Preparado *</label>
                    <SearchableSelect 
                      options={mediosDisponibles} 
                      value={d.medio_prep_id || ''} 
                      onChange={val => updateDerivacion(d.id, 'medio_prep_id', val)} 
                      placeholder="-- Buscar por nombre de medio o ID de bolsa --"
                      style={{ width: '100%' }}
                    />
                    <div style={{ marginTop: '0.5rem' }}>
                      <ScanInput 
                        onScan={async (scannedId) => {
                          const id = scannedId.trim();
                          const medioDoc = await getDoc(doc(db, 'medios_preparados', id));
                          if (medioDoc.exists()) {
                            const opt = mediosDisponibles.find(o => o.type === 'bulk' && o.data?.medio?.id === id);
                            if (opt) {
                              updateDerivacion(d.id, 'medio_prep_id', opt.id);
                              toast.success(`Medio seleccionado: ${opt.data.medio.alias}`);
                            } else {
                              toast.error('Medio encontrado pero no disponible');
                            }
                            return;
                          }
                          if (id.startsWith('FRAC-')) {
                            const qSub = query(collectionGroup(db, 'subfracciones'), where('id_bolsa', '==', id));
                            const snapSub = await getDocs(qSub);
                            if (!snapSub.empty) {
                              const opt = mediosDisponibles.find(o => o.type === 'sub' && o.id === snapSub.docs[0].id);
                              if (opt) {
                                updateDerivacion(d.id, 'medio_prep_id', opt.id);
                                toast.success(`Subfracción seleccionada: ${id}`);
                              } else {
                                toast.error('Subfracción encontrada pero no disponible');
                              }
                            } else {
                              toast.error(`No se encontró medio: ${id}`);
                            }
                          } else {
                            toast.error(`No se encontró medio: ${id}`);
                          }
                        }} 
                        label="Escanear QR del Medio" 
                      />
                    </div>
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
                    <label className="form-label">Técnica de Aislamiento *</label>
                    <select className="form-control" value={d.tecnica} onChange={e => updateDerivacion(d.id, 'tecnica', e.target.value)}>
                      <option value="">-- Seleccionar --</option>
                      {TECNICAS_AISLAMIENTO.map(ta => (
                        <option key={ta.id} value={ta.id}>{ta.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows="2" value={d.observaciones || ''} onChange={e => updateDerivacion(d.id, 'observaciones', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label className="form-label">Foto de evidencia</label>
                <input type="file" accept="image/*" className="form-control" onChange={e => updateDerivacion(d.id, 'foto', e.target.files[0])} />
                {d.foto && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10b981' }}>✅ {d.foto.name}</div>
                )}
              </div>
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
        {uploadingImages && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--accent-color)', textAlign: 'center' }}>
            🔄 Subiendo imágenes adicionales en segundo plano...
          </div>
        )}
      </>
    );
}

}
