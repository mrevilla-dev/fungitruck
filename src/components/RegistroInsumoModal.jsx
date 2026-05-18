import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp, query, onSnapshot, collection } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import PrintLabelsModal from './PrintLabelsModal';
import { uploadFileToDrive } from '../services/driveService';
import { compressImage } from '../utils/imageUtils';


export default function RegistroInsumoModal({ onClose, onSaved, preselectedInsumo = null, hideMasterConfig = false }) {

  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [salas, setSalas] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);

  const [formData, setFormData] = useState({
    // Maestro
    nombre: '',
    categoria: 'Medios y reactivos',
    unidad_compra: 'un',
    unidad_display: 'un',
    unidad_base: 'un',
    factor_compra: 1, 
    factor_display: 1, 
    stock_minimo_base: 0,
    salaId: '',
    detalleUbicacion: '',
    tipo_uso: '',
    
    // Entrada
    proveedor_nombre: '',
    link_compra: '',
    cantidad_compra: 1,
    costo_total: '',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '',
    estado_apertura: 'Activo', 
    comentarios_lote: '',      
    observaciones: '',
    lote_interno: '',
    codigo_barras_comercial: preselectedInsumo?.codigo_barras_comercial || '',
    
    // Campos Específicos Maestro (Extendidos)
    marca_modelo: '',
    nro_serie: '',
    propietario: 'facultad',
    fecha_adquisicion: new Date().toISOString().split('T')[0],
    valor_compra: 0,
    vida_util_anios: 5,
    valor_residual: 0,
    tipo_contenedor: '',
    capacidad_ml: 0,
    concentracion_uso: '',
    clasificacion: 'limpieza',
    esterilidad_origen: 'N'
  });


  useEffect(() => {
    if (preselectedInsumo) {
      setFormData(prev => ({
        ...prev,
        nombre: preselectedInsumo.nombre,
        categoria: preselectedInsumo.categoria,
        unidad_compra: preselectedInsumo.unidad_compra,
        unidad_display: preselectedInsumo.unidad_display,
        unidad_base: preselectedInsumo.unidad_base,
        factor_compra: preselectedInsumo.factor_compra,
        factor_display: preselectedInsumo.factor_display,
        stock_minimo_base: preselectedInsumo.stock_minimo_base,
        salaId: typeof preselectedInsumo.ubicacion === 'object' ? preselectedInsumo.ubicacion.salaId : preselectedInsumo.ubicacion || '',
        detalleUbicacion: typeof preselectedInsumo.ubicacion === 'object' ? preselectedInsumo.ubicacion.detalle : '',
        codigo_barras_comercial: preselectedInsumo.codigo_barras_comercial || '',
        // Traer últimos datos de compra (Solo proveedor y link por seguridad)
        proveedor_nombre: preselectedInsumo.metadata?.ultimo_proveedor || '',
        link_compra: preselectedInsumo.metadata?.link_compra || '',
        cantidad_compra: '', // Vacío para evitar duplicados accidentales
        costo_total: ''      // Vacío para evitar duplicados accidentales
      }));
    }
  }, [preselectedInsumo]);

  const handleAddSala = async () => {
    const nombreSala = window.prompt("🏷️ Ingrese el nombre de la NUEVA SALA / UBICACIÓN:");
    if (!nombreSala || nombreSala.trim() === '') return;
    
    try {
      setLoading(true);
      const newSalaRef = doc(collection(db, 'salas'));
      const salaData = { 
        nombre: nombreSala.trim(), 
        tipo: 'Depósito / Almacén', 
        createdAt: serverTimestamp(),
        descripcion: 'Creada rápidamente desde registro'
      };
      
      await runTransaction(db, async (transaction) => {
        transaction.set(newSalaRef, salaData);
      });
      
      setFormData(prev => ({ ...prev, salaId: newSalaRef.id }));
      alert(`✅ Sala "${nombreSala}" creada y seleccionada.`);
    } catch (err) {
      console.error(err);
      alert("Error al crear la sala. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const [successData, setSuccessData] = useState(null); // Para mostrar el botón de QR al finalizar

  useEffect(() => {
    const q = query(collection(db, "salas"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSalas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const categories = [
    'Medios y reactivos',
    'Sustratos y granos',
    'Descartables',
    'Reutilizables',
    'Bioseguridad',
    'Equipamiento'
  ];

  const safeNumber = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  const factorTotal = formData.categoria === 'Reutilizables' ? 1 : (safeNumber(formData.factor_compra) * safeNumber(formData.factor_display));
  
  // Generar preview de forma ultra-segura
  let conversionPreview = "";
  try {
    const uCompra = String(formData.unidad_compra || 'unidad');
    const uDisplay = String(formData.unidad_display || 'un');
    const uBase = String(formData.unidad_base || 'un');
    conversionPreview = formData.categoria === 'Reutilizables' 
      ? `1 unidad = 1 unidad` 
      : `1 ${uCompra} = ${safeNumber(formData.factor_compra)} ${uDisplay} = ${factorTotal} ${uBase}`;
  } catch (e) {
    conversionPreview = "Error en formato de unidades";
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      let uploadedUrl = preselectedInsumo?.imageUrl || null;

      if (photoFile) {
        setUploadProgress(10);
        const compressed = await compressImage(photoFile, { maxWidth: 1200, quality: 0.8 });
        setUploadProgress(30);
        const driveResult = await uploadFileToDrive(compressed, (prog) => setUploadProgress(30 + (prog * 0.6)));
        uploadedUrl = driveResult.imageUrl || driveResult.url || driveResult.webViewLink;
        setUploadProgress(100);
      }

      const insumoId = preselectedInsumo ? preselectedInsumo.id : formData.nombre.toLowerCase().replace(/\s+/g, '-');
      const insumoRef = doc(db, 'insumos_base', insumoId);
      
      const cantidadBaseNueva = Number(formData.cantidad_compra) * factorTotal;
      const costoUnidadBase = Number(formData.costo_total) / (cantidadBaseNueva || 1);

      await runTransaction(db, async (transaction) => {
        const insumoDoc = await transaction.get(insumoRef);
        
        // 1. Crear o actualizar el Maestro
        const masterData = {
          nombre: formData.nombre,
          categoria: formData.categoria,
          tipo_uso: formData.tipo_uso || null,
          unidad_compra: formData.unidad_compra,
          unidad_display: formData.unidad_display,
          unidad_base: formData.unidad_base,
          factor_compra: Number(formData.factor_compra),
          factor_display: Number(formData.factor_display),
          factor_conversion: factorTotal,
          stock_minimo_base: Number(formData.stock_minimo_base),
          ubicacion: {
            salaId: formData.salaId,
            detalle: formData.detalleUbicacion
          },
          estado_actual: formData.categoria === 'Reutilizables' ? formData.estado_apertura : 'N/A',
          stock_total_base: (insumoDoc.exists() ? insumoDoc.data().stock_total_base : 0) + 
            (['Contaminado', 'Descartado', 'Hidratado', 'Roto / De Baja'].includes(formData.estado_apertura) ? 0 : cantidadBaseNueva),
          metadata: {
            ultimo_proveedor: formData.proveedor_nombre,
            fecha_ultima_compra: formData.fecha_ingreso,
            costo_promedio_base: costoUnidadBase,
            link_compra: formData.link_compra,
            ultima_cantidad_compra: Number(formData.cantidad_compra),
            ultimo_costo_total: Number(formData.costo_total)
          },
          codigo_barras_comercial: formData.codigo_barras_comercial || '',
          imageUrl: uploadedUrl || null,
          updatedAt: serverTimestamp()
        };

        // Campos condicionales por categoría
        if (formData.categoria === 'Equipamiento') {
          masterData.equipamiento = {
            marca_modelo: formData.marca_modelo,
            nro_serie: formData.nro_serie,
            propietario: formData.propietario,
            fecha_adquisicion: formData.fecha_adquisicion,
            valor_compra: Number(formData.valor_compra),
            vida_util_anios: Number(formData.vida_util_anios),
            valor_residual: Number(formData.valor_residual)
          };
        }
        if (formData.categoria === 'Reutilizables') {
          masterData.reutilizable = {
            tipo_contenedor: formData.tipo_contenedor,
            capacidad_ml: Number(formData.capacidad_ml)
          };
        }
        if (formData.categoria === 'Bioseguridad') {
          masterData.bioseguridad = {
            concentracion_uso: formData.concentracion_uso,
            clasificacion: formData.clasificacion
          };
        }
        if (formData.categoria === 'Descartables') {
          masterData.descartables = {
            esterilidad_origen: formData.esterilidad_origen
          };
        }


        if (!insumoDoc.exists()) {
          transaction.set(insumoRef, { ...masterData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

        } else {
          transaction.update(insumoRef, masterData);
        }

        // 2. Registrar UN LOTE por cada unidad de compra (bolsa, saco, etc.)
        const cantidadUnidades = Math.max(1, Number(formData.cantidad_compra) || 1);
        const cantidadBasePorUnidad = cantidadBaseNueva / cantidadUnidades;
        const lotesCreados = [];

        for (let i = 0; i < cantidadUnidades; i++) {
          const timestamp = Date.now() + i; // Asegurar IDs únicos
          const loteId = `LOT-${formData.nombre.toUpperCase().slice(0, 3)}-${timestamp.toString().slice(-4)}`;
          const newLoteRef = doc(collection(db, 'insumos_lotes'));
          
          const loteData = {
            id: newLoteRef.id,
            lote_interno: loteId,
            insumoId: insumoId,
            nombre_insumo: formData.nombre,
            proveedor: formData.proveedor_nombre,
            fecha_ingreso: formData.fecha_ingreso,
            fecha_vencimiento: formData.fecha_vencimiento || null,
            cantidad_compra: 1, // Cada lote = 1 unidad fisica
            unidad_compra: formData.unidad_compra,
            factor_conversion: factorTotal,
            cantidad_base_inicial: cantidadBasePorUnidad,
            cantidad_base_actual: cantidadBasePorUnidad,
            unidad_base: formData.unidad_base,
            costo_total_compra: Number(formData.costo_total) / cantidadUnidades,
            costo_unidad_base: costoUnidadBase,
            costo_unidad_base: costoUnidadBase,
            estado_apertura: formData.categoria === 'Reutilizables' ? 'Activo' : formData.estado_apertura, // Fallback for old system
            estado_actual: formData.categoria === 'Reutilizables' ? formData.estado_apertura : 'N/A',
            comentarios_lote: formData.comentarios_lote,
            observaciones: formData.observaciones,
            link_compra: formData.link_compra,
            ubicacion: {
              salaId: formData.salaId,
              detalle: formData.detalleUbicacion
            },
            codigo_barras_comercial: formData.codigo_barras_comercial || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          transaction.set(newLoteRef, loteData);
          lotesCreados.push(loteData);
        }

        setSuccessData(lotesCreados);
      });

      onSaved();
    } catch (error) {
      console.error("Error en el registro:", error);
      alert("Error al guardar: " + (error.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };


  const handleBarcodeKeyDown = (e) => {

    if (e.key === 'Enter') {
      e.preventDefault(); // Evitar que el 'Enter' del escáner mande el form
      console.log("Código escaneado (pistola):", formData.codigo_barras_comercial);
    }
  };

  const startScanner = () => {
    setShowScanner(true);
  };


  if (successData) {
    // successData es ahora un array de lotes
    const lotesArray = Array.isArray(successData) ? successData : [successData];
    return (
      <PrintLabelsModal 
        batches={lotesArray.map(l => ({
          id: l.lote_interno,
          nombre_insumo: l.nombre_insumo,
          proveedor: l.proveedor_nombre || l.proveedor,
          fecha: l.fecha_ingreso,
          fecha_vencimiento: l.fecha_vencimiento,
          tipo: 'LOTE_INSUMO'
        }))}
        onClose={() => {
          onSaved();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>📦 Registro de Insumo / Compra</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          {!hideMasterConfig && (
            <div className="section-divider">

            <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)', fontSize: '0.9rem' }}>1. CATÁLOGO MAESTRO (Configuración de Unidades)</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nombre del Insumo</label>
                <input type="text" className="form-control" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej: Bolsa Tubular 40cm" />
              </div>
              <div className="form-group">
                <label className="form-label">Código de Barras (Opcional)</label>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.codigo_barras_comercial || ''} 
                    onChange={e => setFormData({...formData, codigo_barras_comercial: e.target.value})} 
                    onKeyDown={handleBarcodeKeyDown}
                    placeholder="Escanea aquí..." 
                    autoFocus
                  />
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    style={{ width: 'auto', padding: '0.5rem' }} 
                    onClick={startScanner}
                    title="Escanear con cámara"
                  >
                    📷
                  </button>
                </div>
              </div>
            </div>


            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-control" value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de Uso</label>
                <select 
                  className="form-control" 
                  value={formData.tipo_uso} 
                  onChange={e => setFormData({...formData, tipo_uso: e.target.value})}
                >
                  <option value="">-- Sin clasificar --</option>
                  <option value="descartable">♻️ Descartable</option>
                  <option value="reutilizable">🔄 Reutilizable</option>
                </select>
              </div>
            </div>
              <div className="form-group">
                <label className="form-label">📷 Foto del Producto (Bolsa/Envase)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="form-control" 
                  onChange={handlePhotoCapture} 
                />
                {photoPreview && (
                  <div style={{ marginTop: '0.5rem', position: 'relative' }}>
                    <img src={photoPreview} alt="Preview" style={{ width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '8px' }} />
                    {loading && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'var(--primary-color)', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                   <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="form-control" 
                    onChange={handlePhotoCapture} 
                    id="photo-input"
                    style={{ display: 'none' }}
                  />
                  <button type="button" className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => document.getElementById('photo-input').click()}>📁 Subir Archivo</button>
                  <button type="button" className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => setShowCamera(true)}>📷 Tomar Foto</button>
                </div>
              </div>

            <div className="form-group">
              <label className="form-label">Unidad de Compra (ej. Rollo, Bolsa)</label>
              <input 
                type="text" 
                className="form-control" 
                autoComplete="off"
                value={formData.unidad_compra || ''} 
                onChange={e => setFormData({...formData, unidad_compra: e.target.value})} 
              />
            </div>




            {formData.categoria !== 'Equipamiento' && (
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px dashed rgba(59, 130, 246, 0.3)', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontWeight: '600' }}>
                  💡 CONFIGURACIÓN DE RENDIMIENTO (Ej: Bolsa de 20 un, Rollo de 50m)
                </div>
                <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Contenido por {String(formData.unidad_compra || 'Unidad')}</label>
                    <div className="flex-gap">
                      <input type="number" className="form-control" value={formData.factor_compra} onChange={e => setFormData({...formData, factor_compra: e.target.value})} placeholder="20" />
                      <input type="text" className="form-control" style={{ width: '90px' }} autoComplete="off" placeholder="un" value={formData.unidad_display || ''} onChange={e => setFormData({...formData, unidad_display: e.target.value})} title="Unidad en la que querés ver el stock" />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Equivalencia a Unidad Mínima</label>
                    <div className="flex-gap">
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>1 {String(formData.unidad_display || 'un')} =</span>
                      <input type="number" className="form-control" value={formData.factor_display} onChange={e => setFormData({...formData, factor_display: e.target.value})} placeholder="1" />
                      <input type="text" className="form-control" style={{ width: '90px' }} autoComplete="off" placeholder="un" value={formData.unidad_base || ''} onChange={e => setFormData({...formData, unidad_base: e.target.value})} />
                    </div>
                  </div>
                </div>
                
                <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(59, 130, 246, 0.2)', paddingTop: '1rem' }}>
                  <label className="form-label" style={{ color: '#10b981', fontWeight: 'bold' }}>🔔 Stock Mínimo para Alerta ({String(formData.unidad_base || 'unidades')})</label>
                  <input type="number" className="form-control" value={formData.stock_minimo_base} onChange={e => setFormData({...formData, stock_minimo_base: e.target.value})} placeholder="Ej: 50" />
                  <small style={{ fontSize: '0.65rem', opacity: 0.7 }}>Te avisaremos cuando queden menos de esta cantidad de unidades individuales en laboratorio.</small>
                </div>

                <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary-color)', marginTop: '0.5rem' }}>
                  📐 TOTAL POR COMPRA: {conversionPreview}
                </div>
              </div>
            )}

            {formData.categoria === 'Equipamiento' && (
              <div className="section-divider animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🛠️ Configuración de Equipamiento</h4>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Marca / Modelo</label>
                    <input type="text" className="form-control" value={formData.marca_modelo} onChange={e => setFormData({...formData, marca_modelo: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nro Serie</label>
                    <input type="text" className="form-control" value={formData.nro_serie} onChange={e => setFormData({...formData, nro_serie: e.target.value})} />
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">Vida Útil (Años)</label>
                    <input type="number" className="form-control" value={formData.vida_util_anios} onChange={e => setFormData({...formData, vida_util_anios: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor Residual ($)</label>
                    <input type="number" className="form-control" value={formData.valor_residual} onChange={e => setFormData({...formData, valor_residual: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Propietario</label>
                    <select className="form-control" value={formData.propietario} onChange={e => setFormData({...formData, propietario: e.target.value})}>
                      <option value="facultad">Facultad</option>
                      <option value="emprendimiento">Emprendimiento</option>
                      <option value="personal">Personal</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {formData.categoria === 'Reutilizables' && (
              <div className="section-divider animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🔄 Propiedades Reutilizables</h4>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Tipo de Contenedor</label>
                    <input type="text" className="form-control" placeholder="Ej: Beaker, Frasco" value={formData.tipo_contenedor} onChange={e => setFormData({...formData, tipo_contenedor: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Capacidad (ml)</label>
                    <input type="number" className="form-control" value={formData.capacidad_ml} onChange={e => setFormData({...formData, capacidad_ml: e.target.value})} />
                  </div>
                </div>
              </div>
            )}

            {formData.categoria === 'Bioseguridad' && (
              <div className="section-divider animate-fade-in" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '1rem', color: '#10b981' }}>🛡️ Datos de Bioseguridad</h4>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Concentración de Uso</label>
                    <input type="text" className="form-control" placeholder="Ej: 70%" value={formData.concentracion_uso} onChange={e => setFormData({...formData, concentracion_uso: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Clasificación</label>
                    <select className="form-control" value={formData.clasificacion} onChange={e => setFormData({...formData, clasificacion: e.target.value})}>
                      <option value="limpieza">Limpieza</option>
                      <option value="desinfectante">Desinfectante</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {formData.categoria === 'Descartables' && (
              <div className="section-divider animate-fade-in" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '1rem', color: '#f59e0b' }}>📦 Datos de Descartables</h4>
                <div className="form-group">
                  <label className="form-label">¿Esterilidad de Origen?</label>
                  <select className="form-control" value={formData.esterilidad_origen} onChange={e => setFormData({...formData, esterilidad_origen: e.target.value})}>
                    <option value="S">Sí</option>
                    <option value="N">No</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          )}



          <div className="section-divider" style={{ border: 'none', padding: 0, margin: 0 }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>2. Detalle de la Compra Actual</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Ubicación / Sala</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select 
                    className="form-control" 
                    required
                    value={formData.salaId} 
                    onChange={e => setFormData({...formData, salaId: e.target.value})}
                  >
                    <option value="">-- Seleccionar Sala --</option>
                    {salas.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ width: 'auto', padding: '0 1rem', fontSize: '1.2rem' }}
                    onClick={handleAddSala}
                    title="Añadir nueva sala inmediatamente"
                  >+</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Detalle Ubicación (Estante/Cajón)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Ej: Estante 2, cajón inf." 
                  value={formData.detalleUbicacion} 
                  onChange={e => setFormData({...formData, detalleUbicacion: e.target.value})} 
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Proveedor (Nombre corto máx 20)</label>
                <input type="text" className="form-control" required maxLength="20" value={formData.proveedor_nombre} onChange={e => setFormData({...formData, proveedor_nombre: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Link de Compra (ML / Web)</label>
                <input type="url" className="form-control" placeholder="https://..." value={formData.link_compra} onChange={e => setFormData({...formData, link_compra: e.target.value})} />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Cantidad Comprada ({String(formData.unidad_compra || 'u')})</label>
                <input type="number" className="form-control" required value={formData.cantidad_compra} onChange={e => setFormData({...formData, cantidad_compra: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Costo Total ($)</label>
                <input type="number" step="0.01" className="form-control" required value={formData.costo_total} onChange={e => setFormData({...formData, costo_total: e.target.value})} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Fecha Ingreso</label>
                <input type="date" className="form-control" value={formData.fecha_ingreso} onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Vencimiento (Opc)</label>
                <input type="date" className="form-control" value={formData.fecha_vencimiento} onChange={e => setFormData({...formData, fecha_vencimiento: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Estado Inicial</label>
                {formData.categoria === 'Reutilizables' ? (
                  <select className="form-control" value={formData.estado_apertura} onChange={e => setFormData({...formData, estado_apertura: e.target.value})}>
                    <option value="Disponible">Disponible</option>
                    <option value="En Uso">En Uso</option>
                    <option value="En Lavado">En Lavado</option>
                    <option value="Roto / De Baja">Roto / De Baja</option>
                  </select>
                ) : (
                  <select className="form-control" value={formData.estado_apertura} onChange={e => setFormData({...formData, estado_apertura: e.target.value})}>
                    <option value="Activo">Activo</option>
                    <option value="Agotado">Agotado</option>
                    <option value="Vencido">Vencido</option>
                    <option value="Hidratado">Hidratado</option>
                  </select>
                )}
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Observaciones de Compra (No se imprime)</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  placeholder="Detalles sobre el envío, factura, etc."
                  value={formData.observaciones} 
                  onChange={e => setFormData({...formData, observaciones: e.target.value})} 
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Notas del Lote (Pilar 1)</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  placeholder="Ej: Lote con empaque ligeramente dañado, bolsa #45"
                  value={formData.comentarios_lote} 
                  onChange={e => setFormData({...formData, comentarios_lote: e.target.value})} 
                />
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cerrar</button>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Procesando...' : 'Confirmar y Guardar'}
            </button>
          </div>
        </form>
      </div>
      {showCamera && (
        <CameraCaptureModal 
          onCapture={(file) => {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {showScanner && (
        <ScannerModal 
          onScan={(text) => {
            setFormData(prev => ({ ...prev, codigo_barras_comercial: text }));
            setShowScanner(false);
          }} 
          onClose={() => setShowScanner(false)} 
        />
      )}
    </div>

  );
}

// Modal para capturar foto con la cámara (webcam)
function CameraCaptureModal({ onCapture, onClose }) {
  const videoRef = React.useRef(null);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        console.error("Error acceso cámara:", err);
        alert("No se pudo acceder a la cámara.");
        onClose();
      }
    }
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      onCapture(file);
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000, background: 'rgba(0,0,0,0.9)' }}>
      <div className="modal-box" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <h4>Capturar Foto</h4>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '12px', marginTop: '1rem', background: '#000' }} />
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={takePhoto}>📸 Capturar</button>
        </div>
      </div>
    </div>
  );
}


// Modal secundario para el scanner
function ScannerModal({ onScan, onClose }) {
  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    const config = { 
      fps: 15, 
      qrbox: { width: 300, height: 150 }, // Más ancho para códigos de barras
      aspectRatio: 1.0
    };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (text) => {
        onScan(text);
        html5QrCode.stop();
      },
      () => {}
    ).catch(err => {
      // Si falla environment (común en PC), intentar con cualquier cámara
      html5QrCode.start({ facingMode: "user" }, config, (text) => {
        onScan(text);
        html5QrCode.stop();
      }, () => {});
    });
    return () => {
      if (html5QrCode.getState() === 2) html5QrCode.stop();
    };
  }, []);

  return (
    <div className="modal-overlay" style={{ zIndex: 3000, background: 'rgba(0,0,0,0.9)' }}>
      <div className="modal-box" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <h4>Escaneando Código de Barras</h4>
        <div id="reader" style={{ width: '100%', minHeight: '250px', background: '#000', borderRadius: '12px', marginTop: '1rem' }}></div>
        <button className="btn btn-danger" style={{ marginTop: '1.5rem' }} onClick={onClose}>Cancelar Escaneo</button>
      </div>
    </div>
  );
}

