import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, serverTimestamp, where, getDocs } from 'firebase/firestore';
import PrintLabelsModal from './PrintLabelsModal';
import { Html5Qrcode } from 'html5-qrcode';

export default function NuevoMedioModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdBatches, setCreatedBatches] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [lotesDisponibles, setLotesDisponibles] = useState([]);
  const [recipientes, setRecipientes] = useState([]);
  const [isExperimental, setIsExperimental] = useState(false);
  
  const [selectedLotes, setSelectedLotes] = useState({}); // { insumoId: loteId }
  const [checkedMaterials, setCheckedMaterials] = useState({});
  
  const [formData, setFormData] = useState({
    recetaId: '',
    cantidad_preparada: 1000, 
    fecha_preparacion: new Date().toISOString().split('T')[0],
    observaciones: '',
    
    // Campos Serie Experimental
    repeticiones: 1,
    variable_nombre: 'Respiración',
    variable_valores: 'Filtro 3M, Micropore, Sin Filtro',
    prefix_alias: 'EXP1'
  });

  // --- Estados de Envasado Múltiple y Fraccionamiento ---
  const [envasesList, setEnvasesList] = useState([]);
  const [addEnvaseForm, setAddEnvaseForm] = useState({
    recipienteId: '',
    volumen: 500,
    cantidad: 1
  });
  const [activeSubFracFormId, setActiveSubFracFormId] = useState(null);
  const [subFracForm, setSubFracForm] = useState({
    recipienteId: '',
    cantidad: 10,
    volumen_unidad: 20
  });

  // --- Estados del Scanner e Integración de Protocolos ---
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [activeScannerForInsumo, setActiveScannerForInsumo] = useState(null);
  const [scanMessage, setScanMessage] = useState('');

  useEffect(() => {
    // Suscripción a Recetas
    const q = query(collection(db, "recetas"));
    const unsubscribeRecetas = onSnapshot(q, (snapshot) => {
      setRecetas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Lotes Abiertos
    const qLotes = query(
      collection(db, "insumos_lotes"), 
      where("estado_apertura", "==", "Abierto"),
      where("cantidad_base_actual", ">", 0)
    );
    const unsubscribeLotes = onSnapshot(qLotes, (snapshot) => {
      setLotesDisponibles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Suscripción a Recipientes (Consumibles y Empaque)
    const qRecip = query(collection(db, "insumos_base"), where("categoria", "==", "Consumibles y Empaque"));
    const unsubscribeRecip = onSnapshot(qRecip, (snapshot) => {
      setRecipientes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeRecetas();
      unsubscribeLotes();
      unsubscribeRecip();
    };
  }, []);

  // --- Cámara y QR Scanner hook-like effect ---
  useEffect(() => {
    let qrScanner = null;
    if (activeScannerForInsumo) {
      setScanMessage('Iniciando cámara...');
      const startQr = async () => {
        try {
          qrScanner = new Html5Qrcode("modal-scanner-reader");
          const config = { fps: 10, qrbox: { width: 220, height: 220 } };
          await qrScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              handleScanSuccess(decodedText, activeScannerForInsumo, qrScanner);
            },
            () => {}
          );
          setScanMessage('Cámara activa. Enfocá el QR del lote.');
        } catch (err) {
          console.error("Camera error:", err);
          try {
            await qrScanner.start(
              { facingMode: "user" },
              config,
              (decodedText) => {
                handleScanSuccess(decodedText, activeScannerForInsumo, qrScanner);
              },
              () => {}
            );
            setScanMessage('Cámara activa (frontal). Enfocá el QR del lote.');
          } catch (userErr) {
            console.error("User camera error:", userErr);
            setScanMessage('No se pudo acceder a la cámara. Usá el simulador de abajo.');
          }
        }
      };
      
      const timer = setTimeout(startQr, 300);
      return () => {
        clearTimeout(timer);
        if (qrScanner && qrScanner.isScanning) {
          qrScanner.stop().catch(err => console.warn("Error stopping scanner", err));
        }
      };
    }
  }, [activeScannerForInsumo]);

  const handleScanSuccess = async (decodedText, insumoId, scanner) => {
    if (scanner && scanner.isScanning) {
      await scanner.stop().catch(err => console.warn(err));
    }
    setActiveScannerForInsumo(null);
    setScanMessage('');
    await verifyAndSelectLot(decodedText, insumoId);
  };

  const verifyAndSelectLot = async (code, insumoId) => {
    setLoading(true);
    try {
      const matchingLote = lotesDisponibles.find(l => 
        l.insumoId === insumoId && (l.lote_interno === code || l.id === code)
      );
      
      if (matchingLote) {
        setSelectedLotes(prev => ({ ...prev, [insumoId]: matchingLote.id }));
        alert(`✅ Lote "${matchingLote.lote_interno}" verificado y seleccionado.`);
        return;
      }
      
      const q = query(
        collection(db, "insumos_lotes"), 
        where("insumoId", "==", insumoId),
        where("lote_interno", "==", code)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const docId = snap.docs[0].id;
        const docData = snap.docs[0].data();
        
        if (docData.estado_apertura !== 'Abierto') {
          alert(`⚠️ Lote "${code}" encontrado pero NO está "Abierto" (Estado: ${docData.estado_apertura}).`);
        } else if (docData.cantidad_base_actual <= 0) {
          alert(`⚠️ Lote "${code}" no tiene stock disponible.`);
        } else {
          setSelectedLotes(prev => ({ ...prev, [insumoId]: docId }));
          alert(`✅ Lote "${code}" verificado y seleccionado.`);
        }
      } else {
        alert(`❌ No se encontró ningún lote activo con código "${code}" para este insumo.`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al verificar el lote.");
    } finally {
      setLoading(false);
    }
  };

  // --- Funciones Envasado ---
  const handleAddEnvasesPrincipales = () => {
    const { recipienteId, volumen, cantidad } = addEnvaseForm;
    if (!recipienteId) return alert("Seleccioná un recipiente");
    if (!volumen || volumen <= 0) return alert("Ingresá un volumen válido");
    if (!cantidad || cantidad <= 0) return alert("Ingresá una cantidad válida");

    const selectedRecip = recipientes.find(r => r.id === recipienteId);
    const newEnvases = [];
    const baseCount = envasesList.length + 1;
    
    for (let i = 0; i < cantidad; i++) {
      newEnvases.push({
        id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        nombre: `${selectedRecip.nombre} N°${baseCount + i}`,
        recipienteId: recipienteId,
        recipienteNombre: selectedRecip.nombre,
        volumen_inicial: Number(volumen),
        volumen_actual: Number(volumen),
        sub_fraccionamientos: []
      });
    }

    setEnvasesList(prev => [...prev, ...newEnvases]);
  };

  const handleAddSubFractionation = (envaseId) => {
    const { recipienteId, cantidad, volumen_unidad } = subFracForm;
    if (!recipienteId) return alert("Seleccioná un envase secundario");
    if (!cantidad || cantidad <= 0) return alert("Ingresá una cantidad válida");
    if (!volumen_unidad || volumen_unidad <= 0) return alert("Ingresá un volumen de unidad válido");

    const selectedRecip = recipientes.find(r => r.id === recipienteId);
    const totalSubVol = Number(cantidad) * Number(volumen_unidad);

    setEnvasesList(prev => prev.map(env => {
      if (env.id === envaseId) {
        if (env.volumen_actual < totalSubVol) {
          alert(`⚠️ Volumen insuficiente (${env.volumen_actual} ml disponibles) para extraer ${totalSubVol} ml.`);
          return env;
        }
        return {
          ...env,
          volumen_actual: env.volumen_actual - totalSubVol,
          sub_fraccionamientos: [
            ...env.sub_fraccionamientos,
            {
              id: `sf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              cantidad: Number(cantidad),
              volumen_unidad: Number(volumen_unidad),
              recipienteId: recipienteId,
              recipienteNombre: selectedRecip.nombre
            }
          ]
        };
      }
      return env;
    }));

    setActiveSubFracFormId(null);
  };

  const handleRemoveSubFractionation = (envaseId, sfId) => {
    setEnvasesList(prev => prev.map(env => {
      if (env.id === envaseId) {
        const removedSf = env.sub_fraccionamientos.find(sf => sf.id === sfId);
        const restoredVol = removedSf ? (removedSf.cantidad * removedSf.volumen_unidad) : 0;
        return {
          ...env,
          volumen_actual: env.volumen_actual + restoredVol,
          sub_fraccionamientos: env.sub_fraccionamientos.filter(sf => sf.id !== sfId)
        };
      }
      return env;
    }));
  };

  const handleRemoveEnvasePrincipal = (envaseId) => {
    setEnvasesList(prev => prev.filter(env => env.id !== envaseId));
  };

  // --- Submit del Formulario ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.recetaId) return alert("Seleccioná una receta");
    if (envasesList.length === 0) {
      return alert("Debés registrar al menos un envase de stock principal.");
    }
    
    setLoading(true);

    try {
      const receta = recetas.find(r => r.id === formData.recetaId);
      const itemsToCreate = isExperimental ? Number(formData.repeticiones) : 1;
      const variableValoresArr = formData.variable_valores.split(',').map(v => v.trim());
      const batchesData = [];

      // Consolidar descuentos de recipientes
      const recipientesDeductions = {};
      envasesList.forEach(env => {
        recipientesDeductions[env.recipienteId] = (recipientesDeductions[env.recipienteId] || 0) + 1;
        env.sub_fraccionamientos.forEach(sf => {
          recipientesDeductions[sf.recipienteId] = (recipientesDeductions[sf.recipienteId] || 0) + Number(sf.cantidad);
        });
      });

      await runTransaction(db, async (transaction) => {
        // 1. Verificar Stock de Insumos Base e Ingredientes
        const totalConsumo = {};
        receta.ingredientes.forEach(ing => {
          const factor = (formData.cantidad_preparada * itemsToCreate) / receta.rendimiento_teorico.cantidad;
          totalConsumo[ing.insumoId] = (totalConsumo[ing.insumoId] || 0) + (ing.cantidad * factor);
        });

        const insumosRefs = {};
        const insumosDocs = {};

        for (const insumoId in totalConsumo) {
          const selectedLoteId = selectedLotes[insumoId];
          if (!selectedLoteId) throw new Error(`Debés seleccionar un lote para el insumo: ${insumoId}`);

          insumosRefs[insumoId] = doc(db, 'insumos_lotes', selectedLoteId);
          const loteSnap = await transaction.get(insumosRefs[insumoId]);
          if (!loteSnap.exists()) throw new Error(`El lote seleccionado ya no existe.`);
          
          if (loteSnap.data().cantidad_base_actual < totalConsumo[insumoId]) {
            throw new Error(`Stock insuficiente en LOTE ${loteSnap.data().lote_interno}.`);
          }
          insumosDocs[insumoId] = loteSnap.data();
        }

        // 2. Verificar Stock de Recipientes
        const recipientesRefs = {};
        const recipientesSnaps = {};

        for (const recipienteId in recipientesDeductions) {
          const qtyNeeded = recipientesDeductions[recipienteId] * itemsToCreate;
          recipientesRefs[recipienteId] = doc(db, 'insumos_base', recipienteId);
          const snap = await transaction.get(recipientesRefs[recipienteId]);
          if (!snap.exists()) {
            throw new Error(`El recipiente con ID "${recipienteId}" no existe.`);
          }
          if (snap.data().stock_total_base < qtyNeeded) {
            throw new Error(`Stock insuficiente de "${snap.data().nombre}". Se requieren ${qtyNeeded} unidades.`);
          }
          recipientesSnaps[recipienteId] = snap.data();
        }

        // 3. Descontar stock de ingredientes
        for (const insumoId in totalConsumo) {
          transaction.update(insumosRefs[insumoId], {
            cantidad_base_actual: insumosDocs[insumoId].cantidad_base_actual - totalConsumo[insumoId]
          });
          const masterRef = doc(db, 'insumos_base', insumoId);
          const masterSnap = await transaction.get(masterRef);
          transaction.update(masterRef, {
            stock_total_base: masterSnap.data().stock_total_base - totalConsumo[insumoId]
          });
        }

        // 4. Descontar stock de recipientes
        for (const recipienteId in recipientesDeductions) {
          const qtyToDeduct = recipientesDeductions[recipienteId] * itemsToCreate;
          transaction.update(recipientesRefs[recipienteId], {
            stock_total_base: recipientesSnaps[recipienteId].stock_total_base - qtyToDeduct
          });
        }

        // 5. Crear Lotes de Medios Preparados
        const experimentId = isExperimental ? `EXP-${Date.now()}` : null;
        
        for (let i = 0; i < itemsToCreate; i++) {
          const newMedioRef = doc(collection(db, 'medios_preparados'));
          const variableValue = isExperimental ? variableValoresArr[i % variableValoresArr.length] : null;
          const alias = isExperimental 
            ? `${formData.prefix_alias}-P${i + 1}` 
            : `MP-${receta.nombre.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`;

          const totalSubFracUnits = envasesList.reduce((acc, env) => 
            acc + env.sub_fraccionamientos.reduce((sum, sf) => sum + sf.cantidad, 0)
          , 0);

          const data = {
            id: newMedioRef.id,
            alias: alias,
            recetaId: receta.id,
            nombre_receta: receta.nombre,
            tipo: receta.categoria,
            peso_seco_por_unidad_g: receta.peso_seco_por_unidad_g || 0,
            ph_esperado: receta.ph_esperado || null,
            estado: 'Personalizado', // Flow dinámico en etapas
            fecha_vencimiento: (() => {
              if (receta.tiempo_max_heladera_dias && formData.fecha_preparacion) {
                const prepDate = new Date(formData.fecha_preparacion + 'T12:00:00');
                prepDate.setDate(prepDate.getDate() + Number(receta.tiempo_max_heladera_dias));
                return prepDate.toISOString().split('T')[0];
              }
              return null;
            })(),

            stock_bulk: {
              cantidad_inicial: Number(formData.cantidad_preparada),
              cantidad_actual: envasesList.reduce((acc, env) => acc + env.volumen_actual, 0),
              unidad: receta.rendimiento_teorico.unidad || 'ml'
            },
            stock_fraccionado: {
              cantidad_inicial: totalSubFracUnits,
              cantidad_actual: totalSubFracUnits,
              recipienteId: envasesList[0]?.sub_fraccionamientos[0]?.recipienteId || null,
              recipienteNombre: envasesList[0]?.sub_fraccionamientos[0]?.recipienteNombre || null,
              unidad_final: 'Unidades'
            },
            envases_principales: envasesList.map(env => ({
              id: env.id,
              nombre: env.nombre,
              recipienteId: env.recipienteId,
              recipienteNombre: env.recipienteNombre,
              volumen_inicial: env.volumen_inicial,
              volumen_actual: env.volumen_actual,
              sub_fraccionamientos: env.sub_fraccionamientos.map(sf => ({
                id: sf.id,
                cantidad: sf.cantidad,
                volumen_unidad: sf.volumen_unidad,
                recipienteId: sf.recipienteId,
                recipienteNombre: sf.recipienteNombre
              }))
            })),
            trazabilidad: {
              insumos_consumidos: receta.ingredientes.map(ing => ({
                insumoId: ing.insumoId,
                loteId: selectedLotes[ing.insumoId],
                cantidad: (formData.cantidad_preparada / receta.rendimiento_teorico.cantidad) * ing.cantidad
              })),
              fecha_preparacion: formData.fecha_preparacion,
              operador: 'Sistema',
              observaciones: formData.observaciones || ''
            },
            observaciones: formData.observaciones || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          if (isExperimental) {
            data.experimentId = experimentId;
            data.variables_experimentales = { [formData.variable_nombre]: variableValue };
          }

          transaction.set(newMedioRef, data);
          batchesData.push(data);
        }
      });

      setCreatedBatches(batchesData);
      setSuccess(true);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return <PrintLabelsModal batches={createdBatches} onClose={() => { onSaved(); onClose(); }} />;
  }

  const currentReceta = recetas.find(r => r.id === formData.recetaId);

  // --- Dynamic materials checklist and capacity calculation ---
  const baseVol = currentReceta?.rendimiento_teorico?.cantidad || 1000;
  const targetVol = formData.cantidad_preparada || 1000;

  const scaleMaterial = (mat) => {
    const factor = targetVol / baseVol;
    if (!mat.nombre) {
      return {
        ...mat,
        cantidad: Math.ceil(mat.cantidad * factor),
        displayNombre: mat.insumoId
      };
    }

    const name = mat.nombre.toLowerCase();
    
    // Extract capacity/volume (e.g. 1L, 500ml, 1 Litro, 2 Litros)
    const volMatch = mat.nombre.match(/(\d+)\s*(L|ml|litro|litros)/i);
    if (!volMatch) {
      const isEquip = name.includes("balanza") || name.includes("espátula") || name.includes("agitador") || name.includes("placa") || name.includes("autoclave") || name.includes("termómetro") || name.includes("phmetro");
      const newQty = isEquip ? mat.cantidad : Math.ceil(mat.cantidad * factor);
      return {
        ...mat,
        cantidad: newQty,
        displayNombre: mat.nombre
      };
    }

    const numVal = parseInt(volMatch[1], 10);
    const unit = volMatch[2].toLowerCase();
    const baseCapacityMl = (unit.startsWith('l') || unit.includes('litro')) ? numVal * 1000 : numVal;
    
    const baseTotalCapMl = baseCapacityMl * mat.cantidad;
    const targetTotalCapMl = baseTotalCapMl * factor;

    const formatVolume = (valMl) => {
      if (valMl >= 1000) {
        const L = valMl / 1000;
        return `${L} ${L === 1 ? 'Litro' : 'Litros'}`;
      }
      return `${valMl}ml`;
    };

    if (name.includes("matraz") || name.includes("beaker") || name.includes("vaso de precipitado")) {
      const prefix = mat.nombre.split(/de \d+/i)[0].trim();
      const suggestedCapMl = targetTotalCapMl;
      const suggestedCapStr = suggestedCapMl >= 1000 ? `${suggestedCapMl/1000}L` : `${suggestedCapMl}ml`;
      const origCapStr = baseCapacityMl >= 1000 ? `${baseCapacityMl/1000}L` : `${baseCapacityMl}ml`;
      const origQtyScaled = Math.ceil(targetTotalCapMl / baseCapacityMl);

      const pluralPrefix = prefix.toLowerCase().endsWith('z') 
        ? prefix.slice(0, -1) + 'ces' 
        : (prefix.toLowerCase().includes('vaso') ? prefix.replace(/vaso/i, 'vasos') : prefix + 's');

      return {
        ...mat,
        cantidad: 1,
        displayNombre: `${prefix} de ${suggestedCapStr} (o ${origQtyScaled}x ${pluralPrefix} de ${origCapStr})`
      };
    }
    
    if (name.includes("probeta")) {
      const prefix = mat.nombre.split(/de \d+/i)[0].trim();
      const suggestedCapMl = targetTotalCapMl;
      const suggestedCapStr = suggestedCapMl >= 1000 ? `${suggestedCapMl/1000}L` : `${suggestedCapMl}ml`;
      
      return {
        ...mat,
        cantidad: 1,
        displayNombre: `${prefix} de ${suggestedCapStr} (o envases equivalentes para enrasar)`
      };
    }

    if (name.includes("frasco") || name.includes("botella") || name.includes("tubo") || name.includes("placa")) {
      const origQtyScaled = Math.ceil(targetTotalCapMl / baseCapacityMl);
      const origCapStr = baseCapacityMl >= 1000 ? `${baseCapacityMl/1000}L` : `${baseCapacityMl}ml`;
      
      let altCapMl = baseCapacityMl * 2;
      if (altCapMl > 1000) altCapMl = 1000;
      const altQty = Math.ceil(targetTotalCapMl / altCapMl);
      const altCapStr = formatVolume(altCapMl);

      const singularName = name.includes("frasco") ? "frasco" : name.includes("botella") ? "botella" : name.includes("tubo") ? "tubo" : "placa";
      const pluralName = singularName + (singularName === "botella" || singularName === "placa" ? "s" : "s");

      let displayNombre = mat.nombre;
      if (baseCapacityMl !== altCapMl && targetTotalCapMl >= altCapMl) {
        displayNombre = `${origQtyScaled}x ${pluralName} de ${origCapStr} (o ${altQty}x ${pluralName} de ${altCapStr})`;
      } else {
        displayNombre = `${origQtyScaled}x ${pluralName} de ${origCapStr}`;
      }

      return {
        ...mat,
        cantidad: 1,
        displayNombre: displayNombre
      };
    }

    return {
      ...mat,
      cantidad: Math.ceil(mat.cantidad * factor),
      displayNombre: mat.nombre
    };
  };

  const dynamicMaterials = (currentReceta?.materiales_requeridos || []).map(scaleMaterial);
  const allChecked = dynamicMaterials.length === 0 || dynamicMaterials.every((mat, idx) => checkedMaterials[idx]);

  // Check autoclave/plate capacity limit
  const checkEquipmentCapacityExceeded = () => {
    if (!currentReceta) return false;
    const eqList = currentReceta.equipamiento_requerido || currentReceta.equipamientoRequerido || [];
    const prepVol = targetVol;

    for (const eq of eqList) {
      if (!eq.nombre) continue;
      const name = eq.nombre.toLowerCase();

      if (name.includes('autoclave')) {
        let limit = 10000; // default 10L
        if (name.includes('chico') || name.includes('chica') || name.includes('pequeño') || name.includes('pequeña') || name.includes('mini')) {
          limit = 1500; // 1.5L limit
        }
        const match = eq.nombre.match(/(\d+)\s*(L|ml|litro|litros)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          limit = (unit.startsWith('l') || unit.includes('litro')) ? num * 1000 : num;
        }
        if (prepVol > limit) return true;
      }

      if (name.includes('placa') || name.includes('calefactora') || name.includes('agitador')) {
        let limit = 2000; // default 2L
        if (name.includes('chico') || name.includes('chica') || name.includes('pequeño') || name.includes('pequeña') || name.includes('mini') || name.includes('1l') || name.includes('500ml')) {
          limit = 1000; // 1L limit
        }
        const match = eq.nombre.match(/(\d+)\s*(L|ml|litro|litros)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          limit = (unit.startsWith('l') || unit.includes('litro')) ? num * 1000 : num;
        }
        if (prepVol > limit) return true;
      }
    }
    return false;
  };

  const showCapacityWarning = checkEquipmentCapacityExceeded();

  const formatMaterialLabel = (mat) => {
    if (/^\d/.test(mat.displayNombre) || mat.displayNombre.includes('(')) {
      return mat.displayNombre;
    }
    return `${mat.cantidad}x ${mat.displayNombre}`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '750px', width: '95%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.4rem' }}>🧫 Preparar y Envasar Medio</h3>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '2rem' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.5rem' }}>
          
          {/* SECCIÓN 1: RECETA Y PARÁMETROS */}
          <div className="section-divider">
            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)', fontSize: '1.1rem' }}>1. Receta y Volumen General</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <select className="form-control" style={{ height: '48px', fontSize: '1.05rem' }} required value={formData.recetaId} onChange={e => { setFormData({...formData, recetaId: e.target.value}); setCheckedMaterials({}); setSelectedLotes({}); }}>
                <option value="">-- Seleccioná Receta --</option>
                {recetas.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.categoria})</option>)}
              </select>

              {currentReceta && (
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  style={{ 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    color: '#3b82f6', 
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    height: '48px',
                    fontSize: '1rem',
                    fontWeight: 'bold'
                  }} 
                  onClick={() => setShowProtocolModal(true)}
                >
                  📄 Ver Protocolo Asociado
                </button>
              )}
            </div>

            <div className="grid-2" style={{ marginTop: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Volumen Total a Preparar (ml/g)</label>
                <input type="number" className="form-control" style={{ height: '48px', fontSize: '1.1rem' }} required value={formData.cantidad_preparada} onChange={e => setFormData({...formData, cantidad_preparada: Number(e.target.value)})} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha de Preparación</label>
                <input type="date" className="form-control" style={{ height: '48px', fontSize: '1.1rem' }} value={formData.fecha_preparacion} onChange={e => setFormData({...formData, fecha_preparacion: e.target.value})} />
              </div>
            </div>
          </div>

          {/* ASISTENTE DE PESADO / CANTIDADES CALCULADAS */}
          {currentReceta && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.85rem', fontSize: '1rem' }}>⚖️ Cantidades Calculadas (Regla de Tres)</h4>
              <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                {currentReceta.ingredientes.map(ing => {
                  const factor = formData.cantidad_preparada / (currentReceta.rendimiento_teorico?.cantidad || 1000);
                  const scaledQty = ing.cantidad * factor;
                  return (
                    <div key={ing.insumoId} style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', fontWeight: '500' }}>{ing.nombre || ing.insumoId}</span>
                      <span style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', display: 'block', margin: '0.3rem 0' }}>
                        {scaledQty.toFixed(2)} {ing.unidad || 'g'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Base: {ing.cantidad} {ing.unidad} (para {currentReceta.rendimiento_teorico?.cantidad || 1000} ml/g)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASO 0: ALISTAMIENTO DE MATERIALES */}
          {currentReceta && dynamicMaterials.length > 0 && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <h4 style={{ marginBottom: '0.75rem', color: '#f59e0b', fontSize: '1.05rem' }}>🧹 Paso 0: Alistamiento de Materiales</h4>
              
              {showCapacityWarning && (
                <div 
                  className="animate-fade-in" 
                  style={{ 
                    background: 'rgba(245, 158, 11, 0.1)', 
                    borderLeft: '4px solid #f59e0b', 
                    padding: '1rem', 
                    borderRadius: '8px', 
                    marginBottom: '1.25rem', 
                    display: 'flex', 
                    alignItems: 'start', 
                    gap: '0.75rem' 
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                    <strong>Atención:</strong> El volumen seleccionado puede requerir procesar el lote en tandas separadas o utilizar un equipo de mayor capacidad.
                  </div>
                </div>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Asegurate de que estos materiales estén esterilizados y en la mesa de trabajo:</p>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {dynamicMaterials.map((mat, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', cursor: 'pointer', border: checkedMaterials[idx] ? '2px solid #10b981' : '1px solid var(--border-color)', transition: 'all 0.2s' }}>
                    <input 
                      type="checkbox" 
                      style={{ transform: 'scale(1.6)', accentColor: '#10b981' }} 
                      checked={!!checkedMaterials[idx]}
                      onChange={(e) => setCheckedMaterials({...checkedMaterials, [idx]: e.target.checked})}
                    />
                    <span style={{ fontSize: '1.05rem', fontWeight: '600', color: checkedMaterials[idx] ? '#10b981' : 'var(--text-primary)' }}>
                      {formatMaterialLabel(mat)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* SECCIÓN 2: LOTES DE INSUMOS ACTIVOS (CON SCANNER QR INTEGRADO) */}
          {formData.recetaId && allChecked && (
            <div className="section-divider">
              <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary-color)' }}>🔍 2. Lotes de Insumos Activos</h4>
              
              {/* QR Scanner Container Overlay */}
              {activeScannerForInsumo && (
                <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '2px solid var(--primary-color)', padding: '1.25rem', borderRadius: '16px', marginBottom: '1.5rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h5 style={{ margin: 0 }}>Cámara activa para: <strong>{recetas.find(r => r.id === formData.recetaId)?.ingredientes.find(i => i.insumoId === activeScannerForInsumo)?.nombre || activeScannerForInsumo}</strong></h5>
                    <button type="button" className="btn btn-danger" style={{ width: 'auto', minHeight: 'auto', padding: '0.4rem 1rem' }} onClick={() => setActiveScannerForInsumo(null)}>✕ Cerrar</button>
                  </div>
                  <div id="modal-scanner-reader" style={{ width: '100%', maxWidth: '350px', height: '240px', margin: '0 auto', background: '#000', borderRadius: '12px', overflow: 'hidden' }}></div>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{scanMessage}</p>
                  
                  {/* Simulador para testing sin cámara */}
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Simulación (Tocar para emular lectura QR en mesa):</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {lotesDisponibles.filter(l => l.insumoId === activeScannerForInsumo).map(l => (
                        <button key={l.id} type="button" className="btn btn-outline" style={{ fontSize: '0.75rem', minWidth: 'auto', minHeight: '36px', height: '36px', padding: '0 0.75rem', width: 'auto' }} onClick={() => handleScanSuccess(l.lote_interno, activeScannerForInsumo, null)}>
                          Lote {l.lote_interno}
                        </button>
                      ))}
                      {lotesDisponibles.filter(l => l.insumoId === activeScannerForInsumo).length === 0 && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--danger-color)' }}>No hay lotes abiertos disponibles para este insumo.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {recetas.find(r => r.id === formData.recetaId)?.ingredientes.map(ing => (
                  <div key={ing.insumoId} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: 0, fontWeight: '600' }}>{ing.nombre || ing.insumoId}</label>
                      <button 
                        type="button" 
                        className="btn btn-outline flex-gap animate-fade-in" 
                        style={{ 
                          width: 'auto', 
                          minWidth: 'auto', 
                          minHeight: '40px', 
                          height: '40px', 
                          padding: '0 1rem', 
                          borderColor: '#8b5cf6', 
                          color: '#8b5cf6',
                          background: 'rgba(139, 92, 246, 0.05)'
                        }}
                        onClick={() => setActiveScannerForInsumo(ing.insumoId)}
                      >
                        📸 Escanear QR
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select 
                        className="form-control" 
                        style={{ height: '48px', fontSize: '1rem' }}
                        required 
                        value={selectedLotes[ing.insumoId] || ''} 
                        onChange={e => setSelectedLotes({...selectedLotes, [ing.insumoId]: e.target.value})}
                      >
                        <option value="">-- Elegir Lote Abierto --</option>
                        {lotesDisponibles.filter(l => l.insumoId === ing.insumoId).map(l => (
                          <option key={l.id} value={l.id}>{l.lote_interno} ({l.cantidad_base_actual.toFixed(1)} {l.unidad_base})</option>
                        ))}
                      </select>
                      {selectedLotes[ing.insumoId] && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.1)', border: '2px solid #10b981', color: '#10b981', borderRadius: '8px', padding: '0 0.85rem', fontSize: '1.25rem', fontWeight: 'bold' }} title="Lote verificado y vinculado">
                          ✓
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECCIÓN 3: ENVASADO Y SUB-FRACCIONAMIENTO (GLOVE FRIENDLY) */}
          {formData.recetaId && allChecked && (
            <div className="section-divider" style={{ background: 'rgba(16, 185, 129, 0.02)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-color)' }}>📦 3. Envasado y Sub-Fraccionamiento</h4>
              
              {/* Formulario rápido para añadir envase principal */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                <h5 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Registrar Envase Principal (Stock)</h5>
                
                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Seleccionar Envase Principal</label>
                    <select 
                      className="form-control" 
                      style={{ height: '48px', fontSize: '1rem' }}
                      value={addEnvaseForm.recipienteId} 
                      onChange={e => setAddEnvaseForm({...addEnvaseForm, recipienteId: e.target.value})}
                    >
                      <option value="">-- Seleccionar Envase --</option>
                      {recipientes.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.stock_total_base}u disp.)</option>)}
                    </select>
                  </div>
                  
                  <div className="grid-2">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Volumen c/u (ml)</label>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button type="button" className="btn btn-outline" style={{ width: '48px', minWidth: '48px', height: '48px', padding: 0 }} onClick={() => setAddEnvaseForm(prev => ({...prev, volumen: Math.max(50, prev.volumen - 100)}))}>-</button>
                        <input type="number" className="form-control" style={{ height: '48px', textAlign: 'center', fontSize: '1.1rem' }} value={addEnvaseForm.volumen} onChange={e => setAddEnvaseForm({...addEnvaseForm, volumen: Number(e.target.value)})} />
                        <button type="button" className="btn btn-outline" style={{ width: '48px', minWidth: '48px', height: '48px', padding: 0 }} onClick={() => setAddEnvaseForm(prev => ({...prev, volumen: prev.volumen + 100}))}>+</button>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Cantidad (Unidades)</label>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button type="button" className="btn btn-outline" style={{ width: '48px', minWidth: '48px', height: '48px', padding: 0 }} onClick={() => setAddEnvaseForm(prev => ({...prev, cantidad: Math.max(1, prev.cantidad - 1)}))}>-</button>
                        <input type="number" className="form-control" style={{ height: '48px', textAlign: 'center', fontSize: '1.1rem' }} value={addEnvaseForm.cantidad} onChange={e => setAddEnvaseForm({...addEnvaseForm, cantidad: Number(e.target.value)})} />
                        <button type="button" className="btn btn-outline" style={{ width: '48px', minWidth: '48px', height: '48px', padding: 0 }} onClick={() => setAddEnvaseForm(prev => ({...prev, cantidad: prev.cantidad + 1}))}>+</button>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ height: '48px', fontWeight: 'bold' }} 
                  onClick={handleAddEnvasesPrincipales}
                >
                  ➕ Agregar Envases al Lote
                </button>
              </div>

              {/* Listado de Envases Principales configurados */}
              {envasesList.length > 0 && (
                <div style={{ display: 'grid', gap: '1.25rem' }}>
                  <h5 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Distribución en Mesa:</h5>
                  
                  {envasesList.map((env) => (
                    <div key={env.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', padding: '1.25rem', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>📦 {env.nombre}</strong>
                          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Capacidad inicial: {env.volumen_inicial} ml</span>
                        </div>
                        <span style={{ 
                          fontSize: '1rem', 
                          fontWeight: '700', 
                          color: env.volumen_actual > 0 ? 'var(--accent-color)' : '#94a3b8',
                          background: env.volumen_actual > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                          padding: '0.4rem 0.85rem',
                          borderRadius: '8px'
                        }}>
                          Restante: {env.volumen_actual} ml
                        </span>
                      </div>

                      {/* Lista de Sub-fraccionamiento actual en el envase */}
                      {env.sub_fraccionamientos.length > 0 && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Sub-fraccionamiento:</span>
                          {env.sub_fraccionamientos.map(sf => (
                            <div key={sf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139, 92, 246, 0.05)', border: '1px dashed rgba(139, 92, 246, 0.3)', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                              <span style={{ fontSize: '0.95rem' }}>🧪 {sf.cantidad} {sf.recipienteNombre} (de {sf.volumen_unidad} ml)</span>
                              <button 
                                type="button" 
                                style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.5rem' }} 
                                onClick={() => handleRemoveSubFractionation(env.id, sf.id)}
                                title="Eliminar sub-fraccionamiento"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulario de Sub-fraccionamiento */}
                      {activeSubFracFormId === env.id ? (
                        <div style={{ marginTop: '1rem', background: 'rgba(139, 92, 246, 0.03)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '1rem', borderRadius: '10px', display: 'grid', gap: '1rem' }}>
                          <h6 style={{ margin: 0, fontSize: '0.9rem', color: '#8b5cf6' }}>Extraer y Sub-fraccionar:</h6>
                          
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Envase Destino (Fraccionado)</label>
                            <select 
                              className="form-control" 
                              style={{ height: '48px', fontSize: '0.95rem' }}
                              value={subFracForm.recipienteId} 
                              onChange={e => setSubFracForm({...subFracForm, recipienteId: e.target.value})}
                            >
                              <option value="">-- Seleccionar Envase Secundario --</option>
                              {recipientes.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.stock_total_base}u disp.)</option>)}
                            </select>
                          </div>

                          <div className="grid-2">
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Cantidad de Envases</label>
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button type="button" className="btn btn-outline" style={{ width: '40px', minWidth: '40px', height: '40px', padding: 0 }} onClick={() => setSubFracForm(prev => ({...prev, cantidad: Math.max(1, prev.cantidad - 1)}))}>-</button>
                                <input type="number" className="form-control" style={{ height: '40px', textAlign: 'center', fontSize: '1rem' }} value={subFracForm.cantidad} onChange={e => setSubFracForm({...subFracForm, cantidad: Number(e.target.value)})} />
                                <button type="button" className="btn btn-outline" style={{ width: '40px', minWidth: '40px', height: '40px', padding: 0 }} onClick={() => setSubFracForm(prev => ({...prev, cantidad: prev.cantidad + 1}))}>+</button>
                              </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Volumen por unidad (ml)</label>
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button type="button" className="btn btn-outline" style={{ width: '40px', minWidth: '40px', height: '40px', padding: 0 }} onClick={() => setSubFracForm(prev => ({...prev, volumen_unidad: Math.max(1, prev.volumen_unidad - 5)}))}>-</button>
                                <input type="number" className="form-control" style={{ height: '40px', textAlign: 'center', fontSize: '1rem' }} value={subFracForm.volumen_unidad} onChange={e => setSubFracForm({...subFracForm, volumen_unidad: Number(e.target.value)})} />
                                <button type="button" className="btn btn-outline" style={{ width: '40px', minWidth: '40px', height: '40px', padding: 0 }} onClick={() => setSubFracForm(prev => ({...prev, volumen_unidad: prev.volumen_unidad + 5}))}>+</button>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-outline" style={{ height: '40px', flex: 1 }} onClick={() => setActiveSubFracFormId(null)}>Cancelar</button>
                            <button type="button" className="btn btn-primary" style={{ height: '40px', flex: 1.5, background: '#8b5cf6' }} onClick={() => handleAddSubFractionation(env.id)}>Confirmar Extracción</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                          <button 
                            type="button" 
                            className="btn btn-outline" 
                            style={{ height: '44px', fontSize: '0.9rem', flex: 1, borderColor: '#8b5cf6', color: '#8b5cf6', background: 'rgba(139,92,246,0.03)' }} 
                            onClick={() => {
                              setActiveSubFracFormId(env.id);
                              // Default values helper
                              setSubFracForm(prev => ({
                                ...prev,
                                recipienteId: recipientes[0]?.id || ''
                              }));
                            }}
                          >
                            🧪 Sacar Placas/Tubos (Sub-fraccionar)
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-outline btn-danger" 
                            style={{ height: '44px', width: '48px', minWidth: '48px', padding: 0, border: 'none' }} 
                            onClick={() => handleRemoveEnvasePrincipal(env.id)}
                            title="Eliminar Envase Principal"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OBSERVACIONES DEL LOTE */}
          {formData.recetaId && allChecked && (
            <div className="section-divider animate-fade-in">
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--primary-color)' }}>📝 Observaciones del Lote</h4>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  style={{ fontSize: '1rem', padding: '0.75rem' }}
                  placeholder="Ej: pH corregido con NaOH, sin precipitados, lote listo para autoclavado..."
                  value={formData.observaciones} 
                  onChange={e => setFormData({...formData, observaciones: e.target.value})}
                />
              </div>
            </div>
          )}

          {/* BOTONES DE CONTROL GENERAL */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" style={{ height: '52px', fontSize: '1.1rem', fontWeight: '500' }} onClick={onClose} disabled={loading}>Cerrar</button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || (formData.recetaId && !allChecked) || envasesList.length === 0} 
              style={{ 
                flex: 1.5, 
                opacity: (!formData.recetaId || !allChecked || envasesList.length === 0) ? 0.5 : 1,
                height: '52px',
                fontSize: '1.1rem',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Procesando...' : '💾 Registrar Preparación y Descontar'}
            </button>
          </div>
        </form>
      </div>

      {/* --- MODAL AUXILIAR: PROTOCOLO ASOCIADO --- */}
      {showProtocolModal && currentReceta && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="modal-box animate-fade-in" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem' }}>📄 Protocolo: {currentReceta.nombre}</h3>
              <button className="modal-close" onClick={() => setShowProtocolModal(false)} style={{ fontSize: '1.8rem' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Descripción / Características</strong>
                <p style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>{currentReceta.descripcion || "Sin descripción cargada."}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>🔥 Autoclave</span>
                  <strong style={{ fontSize: '1rem' }}>{currentReceta.tiempo_autoclave_min ? `${currentReceta.tiempo_autoclave_min} min a ${currentReceta.temperatura_autoclave_c || 121}°C` : "N/A"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>❄️ Heladera</span>
                  <strong style={{ fontSize: '1rem' }}>{currentReceta.tiempo_max_heladera_dias ? `${currentReceta.tiempo_max_heladera_dias} días` : "N/A"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>🧪 pH Esperado</span>
                  <strong style={{ fontSize: '1rem', color: '#10b981' }}>{currentReceta.ph_esperado || "N/A"}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>⏱️ Confección</span>
                  <strong style={{ fontSize: '1rem' }}>{currentReceta.tiempo_estimado_confeccion || "N/A"}</strong>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Procedimiento (Paso a Paso)</strong>
                <div style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  padding: '1rem', 
                  borderRadius: '10px', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6', 
                  whiteSpace: 'pre-wrap', 
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}>
                  {currentReceta.procedimiento || 
                    `Guía Estándar para Preparación de Medios:
1. Alistar vidriería limpia.
2. Pesar los ingredientes secos de forma exacta en balanza analítica.
3. Disolver en agua destilada y calentar con agitación suave.
4. Ajustar pH si fuera requerido.
5. Esterilizar en Autoclave a 121°C (15 psi) durante 15-20 min.
6. Enfriar a 50°C en cabina de flujo antes de volcar o sub-fraccionar.`
                  }
                </div>
              </div>

              {currentReceta.protocolo_url && (
                <a 
                  href={currentReceta.protocolo_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', height: '48px', background: '#3b82f6', fontWeight: 'bold' }}
                >
                  🔗 Abrir Documento de Protocolo Oficial
                </a>
              )}

              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ height: '48px', fontWeight: 'bold' }} 
                onClick={() => setShowProtocolModal(false)}
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
