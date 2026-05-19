import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { uploadFileToDrive } from '../services/driveService';
import { compressImage } from '../utils/imageUtils';
import RegistroInsumoModal from './RegistroInsumoModal';


export default function EditInsumoModal({ insumo, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [showQuickPurchase, setShowQuickPurchase] = useState(false);
  const [salas, setSalas] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(insumo.imageUrl || null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);

  // Calculamos el stock mínimo en unidad de vista para el input inicial
  const initialStockMinimoVista = insumo.stock_minimo_base / (insumo.factor_display || 1);

  const [formData, setFormData] = useState({
    nombre: insumo.nombre || '',
    categoria: insumo.categoria || 'Medios y reactivos',
    tipo_uso: insumo.tipo_uso || '',
    stock_minimo_vista: initialStockMinimoVista || 0,
    salaId: typeof insumo.ubicacion === 'object' ? insumo.ubicacion.salaId : (insumo.ubicacion || ''),
    detalleUbicacion: typeof insumo.ubicacion === 'object' ? insumo.ubicacion.detalle : '',
    unidad_compra: insumo.unidad_compra || '',
    unidad_display: insumo.unidad_display || '',
    unidad_base: insumo.unidad_base || '',
    factor_compra: insumo.factor_compra || 1,
    factor_display: insumo.factor_display || 1,
    stock_total_base: insumo.stock_total_base || 0,
    // Campos Equipamiento
    marca_modelo: insumo.equipamiento?.marca_modelo || '',
    nro_serie: insumo.equipamiento?.nro_serie || '',
    propietario: insumo.equipamiento?.propietario || 'facultad',
    fecha_adquisicion: insumo.equipamiento?.fecha_adquisicion || new Date().toISOString().split('T')[0],
    valor_compra: insumo.equipamiento?.valor_compra || 0,
    vida_util_anios: insumo.equipamiento?.vida_util_anios || 5,
    valor_residual: insumo.equipamiento?.valor_residual || 0,
    // Campos Reutilizables
    tipo_contenedor: insumo.reutilizable?.tipo_contenedor || '',
    capacidad_ml: insumo.reutilizable?.capacidad_ml || 0,
    // Campos Bioseguridad
    concentracion_uso: insumo.bioseguridad?.concentracion_uso || '',
    clasificacion: insumo.bioseguridad?.clasificacion || 'limpieza',
    // Campos Descartables
    esterilidad_origen: insumo.descartables?.esterilidad_origen || 'N',
    // Propiedades Bioquímicas
    porcentaje_carbono: insumo.bioquimica?.porcentaje_carbono || '',
    porcentaje_nitrogeno: insumo.bioquimica?.porcentaje_nitrogeno || '',
    porcentaje_humedad: insumo.bioquimica?.porcentaje_humedad || ''
  });

  useEffect(() => {
    const q = query(collection(db, "salas"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSalas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddSala = async () => {
    const nombreSala = window.prompt("🏷️ Ingrese el nombre de la NUEVA SALA / UBICACIÓN:");
    if (!nombreSala || nombreSala.trim() === '') return;
    
    try {
      setLoading(true);
      const { setDoc } = await import('firebase/firestore');
      const newSalaRef = doc(collection(db, 'salas'));
      const salaData = { 
        nombre: nombreSala.trim(), 
        tipo: 'Depósito / Almacén', 
        createdAt: serverTimestamp(),
        descripcion: 'Creada rápidamente desde edición'
      };
      
      await setDoc(newSalaRef, salaData);
      
      setFormData(prev => ({ ...prev, salaId: newSalaRef.id }));
      alert(`✅ Sala "${nombreSala}" creada y seleccionada.`);
    } catch (err) {
      console.error(err);
      alert("Error al crear la sala.");
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

  const categories = [
    'Medios y reactivos',
    'Sustratos y granos',
    'Descartables',
    'Reutilizables',
    'Bioseguridad',
    'Equipamiento'
  ];

  const factorTotal = Number(formData.factor_compra || 0) * Number(formData.factor_display || 0);
  const conversionPreview = `1 ${formData.unidad_compra || 'un'} = ${formData.factor_compra || 0} ${formData.unidad_display || 'vista'} = ${factorTotal} ${formData.unidad_base || 'base'}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const insumoRef = doc(db, 'insumos_base', insumo.id);
      
      let uploadedUrl = insumo.imageUrl || null;
      if (photoFile) {
        setUploadProgress(10);
        const compressed = await compressImage(photoFile, { maxWidth: 1200, quality: 0.8 });
        setUploadProgress(30);
        const driveResult = await uploadFileToDrive(compressed, (prog) => setUploadProgress(30 + (prog * 0.6)));
        uploadedUrl = driveResult.imageUrl || driveResult.url || driveResult.webViewLink;
        setUploadProgress(100);
      }

      // Convertimos el stock mínimo de vista a base para guardar
      const stockMinimoBase = Number(formData.stock_minimo_vista) * Number(formData.factor_display);

      const updateData = {
        nombre: formData.nombre,
        categoria: formData.categoria,
        tipo_uso: formData.tipo_uso || null,
        stock_minimo_base: stockMinimoBase,
        ubicacion: {
          salaId: formData.salaId,
          detalle: formData.detalleUbicacion
        },
        unidad_compra: formData.unidad_compra,
        unidad_display: formData.unidad_display,
        unidad_base: formData.unidad_base,
        factor_compra: Number(formData.factor_compra),
        factor_display: Number(formData.factor_display),
        factor_conversion: factorTotal,
        stock_total_base: Number(formData.stock_total_base),
        imageUrl: uploadedUrl || null,
        updatedAt: serverTimestamp()
      };

      if (formData.categoria === 'Equipamiento') {
        updateData.equipamiento = {
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
        updateData.reutilizable = {
          tipo_contenedor: formData.tipo_contenedor,
          capacidad_ml: Number(formData.capacidad_ml)
        };
      }

      if (formData.categoria === 'Bioseguridad') {
        updateData.bioseguridad = {
          concentracion_uso: formData.concentracion_uso,
          clasificacion: formData.clasificacion
        };
      }

      if (formData.categoria === 'Descartables') {
        updateData.descartables = {
          esterilidad_origen: formData.esterilidad_origen
        };
      }

      if (['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(formData.categoria)) {
        updateData.bioquimica = {
          porcentaje_carbono: formData.porcentaje_carbono ? Number(formData.porcentaje_carbono) : 0,
          porcentaje_nitrogeno: formData.porcentaje_nitrogeno ? Number(formData.porcentaje_nitrogeno) : 0,
          porcentaje_humedad: formData.porcentaje_humedad ? Number(formData.porcentaje_humedad) : 0
        };
      }

      await updateDoc(insumoRef, updateData);

      onSaved();
    } catch (error) {
      console.error("Error al actualizar insumo:", error);
      alert("Error al actualizar los datos: " + (error.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>✏️ Editar Maestro: {insumo.nombre}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <button 
            className="btn btn-primary" 
            style={{ background: 'var(--accent-color)' }}
            onClick={() => setShowQuickPurchase(true)}
          >
            ➕ Ingresar Nueva Compra
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nombre del Insumo</label>
              <input type="text" className="form-control" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select className="form-control" value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Ubicación Predeterminada (Sala)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="form-control" value={formData.salaId} onChange={e => setFormData({...formData, salaId: e.target.value})}>
                  <option value="">-- Seleccioná Ubicación --</option>
                  {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: 'auto', padding: '0 1rem', fontSize: '1.2rem' }}
                  onClick={handleAddSala}
                  title="Añadir nueva sala"
                >+</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Detalle (Estante/Cajón)</label>
              <input 
                type="text" 
                className="form-control" 
                value={formData.detalleUbicacion} 
                onChange={e => setFormData({...formData, detalleUbicacion: e.target.value})} 
              />
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
                    {loading && photoFile && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'var(--primary-color)', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                   <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="form-control" 
                    onChange={handlePhotoCapture} 
                    id="edit-photo-input"
                    style={{ display: 'none' }}
                  />
                  <button type="button" className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => document.getElementById('edit-photo-input').click()}>📁 Subir Archivo</button>
                  <button type="button" className="btn btn-outline" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => setShowCamera(true)}>📷 Tomar Foto</button>
                </div>
            </div>
          </div>

          {/* CUADRO DE EQUIVALENCIAS (Omitido para Reutilizables) */}
          {formData.categoria !== 'Reutilizables' && (
            <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px dashed rgba(59, 130, 246, 0.3)', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.75rem', fontWeight: '600' }}>
                📐 CONFIGURACIÓN DE RENDIMIENTO
              </div>
              <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Unidad Compra (Rollo, Pack)</label>
                  <input type="text" className="form-control" value={formData.unidad_compra} onChange={e => setFormData({...formData, unidad_compra: e.target.value})} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Contenido por Unidad</label>
                  <div className="flex-gap">
                    <input type="number" className="form-control" value={formData.factor_compra} onChange={e => setFormData({...formData, factor_compra: e.target.value})} />
                    <input type="text" className="form-control" style={{ width: '90px' }} value={formData.unidad_display} onChange={e => setFormData({...formData, unidad_display: e.target.value})} placeholder="gr/m" />
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ margin: '1rem 0 0 0' }}>
                <label className="form-label">Equivalencia Mínima (Laboratorio)</label>
                <div className="flex-gap">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>1 {formData.unidad_display || 'un'} =</span>
                  <input type="number" className="form-control" value={formData.factor_display} onChange={e => setFormData({...formData, factor_display: e.target.value})} />
                  <input type="text" className="form-control" style={{ width: '90px' }} value={formData.unidad_base} onChange={e => setFormData({...formData, unidad_base: e.target.value})} placeholder="mg/cm" />
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary-color)', marginTop: '1rem' }}>
                ✨ {conversionPreview}
              </div>
            </div>
          )}

          {['Medios y reactivos', 'Sustratos y granos', 'Adjuntos'].includes(formData.categoria) && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem', marginBottom: '0.5rem' }}>
              <h4 style={{ marginBottom: '1rem', color: '#8b5cf6' }}>🔬 Propiedades Bioquímicas (Opcional)</h4>
              <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">% Carbono (C)</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-control" placeholder="Ej: 40.0" value={formData.porcentaje_carbono} onChange={e => setFormData({...formData, porcentaje_carbono: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">% Nitrógeno (N)</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-control" placeholder="Ej: 2.0" value={formData.porcentaje_nitrogeno} onChange={e => setFormData({...formData, porcentaje_nitrogeno: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">% Humedad Teórica</label>
                  <input type="number" step="0.1" min="0" max="100" className="form-control" placeholder="Ej: 10.0" value={formData.porcentaje_humedad} onChange={e => setFormData({...formData, porcentaje_humedad: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="form-group">
               <label className="form-label">
                 🔔 Stock Mínimo Alerta ({(formData.categoria === 'Reutilizables' || formData.categoria === 'Descartables') ? 'unidades' : (formData.unidad_display || 'Vista')})
               </label>
              <input 
                type="number" 
                className="form-control" 
                required 
                value={formData.stock_minimo_vista} 
                onChange={e => setFormData({...formData, stock_minimo_vista: e.target.value})} 
                disabled={formData.categoria === 'Equipamiento'}
              />
            </div>
            <div className="form-group">
               <label className="form-label">Stock Total Actual ({formData.categoria === 'Reutilizables' ? 'un' : formData.unidad_base})</label>
               <input 
                type="number" 
                className="form-control" 
                value={formData.categoria === 'Reutilizables' ? formData.stock_total_base / (formData.factor_display || 1) : formData.stock_total_base} 
                onChange={e => setFormData({...formData, stock_total_base: formData.categoria === 'Reutilizables' ? Number(e.target.value) * (formData.factor_display || 1) : Number(e.target.value)})} 
                style={{ border: '1px solid var(--danger-color)' }}
                disabled={formData.categoria === 'Equipamiento'}
               />
               <small style={{ fontSize: '0.65rem', color: 'var(--danger-color)' }}>⚠️ Edición manual del stock base total.</small>
            </div>
          </div>

          {formData.categoria === 'Equipamiento' && (() => {
            const amortMensual = (Number(formData.valor_compra) - Number(formData.valor_residual)) / (Number(formData.vida_util_anios) * 12);
            return (
              <div className="section-divider animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🛠️ Datos de Equipamiento</h4>
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
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Fecha de Adquisición</label>
                    <input type="date" className="form-control" value={formData.fecha_adquisicion} onChange={e => setFormData({...formData, fecha_adquisicion: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor de Compra ($)</label>
                    <input type="number" className="form-control" value={formData.valor_compra} onChange={e => setFormData({...formData, valor_compra: e.target.value})} />
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
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
                   <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>
                     💰 Amortización Mensual: ${amortMensual > 0 ? amortMensual.toFixed(2) : '0.00'}
                   </span>
                </div>
              </div>
            );
          })()}

          {formData.categoria === 'Reutilizables' && (
            <div className="section-divider animate-fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🔄 Propiedades Reutilizables</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo de Contenedor</label>
                  <input type="text" className="form-control" placeholder="Ej: Beaker, Frasco, Caja" value={formData.tipo_contenedor} onChange={e => setFormData({...formData, tipo_contenedor: e.target.value})} />
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
                  <input type="text" className="form-control" placeholder="Ej: 70%, 10%, 200ppm" value={formData.concentracion_uso} onChange={e => setFormData({...formData, concentracion_uso: e.target.value})} />
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

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>Cerrar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Actualizar Maestro'}
            </button>
          </div>
        </form>
      </div>
      {showQuickPurchase && (
        <RegistroInsumoModal 
          preselectedInsumo={insumo}
          hideMasterConfig={true}
          onClose={() => setShowQuickPurchase(false)}
          onSaved={() => {
            setShowQuickPurchase(false);
            onSaved();
          }}
        />
      )}
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
