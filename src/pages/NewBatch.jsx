import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { db, storage } from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, onSnapshot, orderBy, where, writeBatch, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Html5QrcodeScanner } from 'html5-qrcode';
import DestinoSelector from '../components/DestinoSelector';
import { generateSemanticId, getSubstrateCode } from '../utils/idGenerator';

const MEDIOS_SUGERIDOS = [
  "Agar Papa Dextrosa (APD)",
  "Agar Malta (AM)",
  "Agar AMCCC (Malta + Carbonato + CMMC + Celulosa)",
  "Agar Nutritivo",
  "Grano de Trigo esterilizado",
  "Grano de Centeno esterilizado",
  "Sustrato lignocelulósico (paja de trigo)",
  "Medio líquido (agitación)",
  "Otro / Nuevo"
];

const CONTENEDORES = [
  { id: 'tubo_15ml', label: '🧪 Tubo 15ml (QR 1x1cm)', px: 60 },
  { id: 'placa_petri', label: '🧫 Placa Petri (QR 2x2cm)', px: 85 },
  { id: 'frasco_1l', label: '🫙 Frasco 1L (QR 3x3cm)', px: 120 },
  { id: 'bolsa_3kg', label: '🛍️ Bolsa 3kg (QR 5x5cm)', px: 180 },
  { id: 'otro', label: '📦 Otro (QR 3x3cm)', px: 120 },
];

function NewBatch() {
  const [formData, setFormData] = useState({
    genero: '',
    especie: '',
    cepa: '',
    generacion: 1,
    esDicarion: true,
    esporomaId: '',
    parentId: null,
    manualParentId: '', // New field for manual entry
    showManualParent: false, // Toggle for manual entry
    origenDescripcion: '',
    origenEsQR: false,
    destinoId: '',
    destinoNombre: '',
    observaciones: '',
    tipoContenedor: 'placa_petri',
    cantidadLotes: 1,
    operator: 'Maxi',
    fechaInoculacion: new Date().toISOString().split('T')[0],
    otroContenedorNombre: ''
  });

  const [isHeredado, setIsHeredado] = useState(false);
  const [medios, setMedios] = useState([{ id: Date.now(), nombre: '', cantidad: 1 }]);
  const [generatedBatches, setGeneratedBatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showOrigenScanner, setShowOrigenScanner] = useState(false);
  const [esporomas, setEsporomas] = useState([]);
  const [mediosPrepList, setMediosPrepList] = useState([]);
  const scannerRef = useRef(null);

  useEffect(() => {
    // Fetch Esporomas for selection
    const q = query(collection(db, "esporomas"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEsporomas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    // Fetch Medios Preparados for selection
    const qMedios = query(collection(db, "medios_preparados"), where("cantidad_actual", ">", 0));
    const unsubscribeMedios = onSnapshot(qMedios, (snapshot) => {
      setMediosPrepList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribe();
      unsubscribeMedios();
    };
  }, []);

  // --- Heritage Logic: Fetch Parent Data ---
  const handleParentScan = async (decodedId) => {
    setLoading(true);
    try {
      const parentDoc = await getDoc(doc(db, "batches", decodedId));
      if (parentDoc.exists()) {
        const data = parentDoc.data();
        setFormData(prev => ({
          ...prev,
          genero: data.genero || '',
          especie: data.especie || '',
          cepa: data.cepa || '',
          generacion: (data.generacion || 1) + 1,
          esporomaId: data.esporomaId || '',
          esDicarion: data.esDicarion ?? true,
          parentId: decodedId,
          origenEsQR: true,
        }));
        setIsHeredado(true);
      } else {
        alert("No se encontró el lote padre en la base de datos.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al escanear el padre.");
    } finally {
      setLoading(false);
      setShowOrigenScanner(false);
    }
  };

  useEffect(() => {
    if (showOrigenScanner) {
      const scanner = new Html5QrcodeScanner("origen-reader", { fps: 10, qrbox: 220 }, false);
      scanner.render(handleParentScan, () => {});
      scannerRef.current = scanner;
      return () => scanner.clear().catch(() => {});
    }
  }, [showOrigenScanner]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: type === 'checkbox' ? checked : value };
      
      // If selecting an esporoma, auto-fill taxonomy and set Dicarion to false
      if (name === 'esporomaId') {
        if (value) {
          const selected = esporomas.find(esp => esp.id === value);
          if (selected) {
            newData.genero = selected.genero;
            newData.especie = selected.especie;
            newData.esDicarion = false; // Esporulación = Aislado Haploide
          }
        } else {
          newData.esDicarion = true;
        }
      }
      return newData;
    });
  };

  const handleDestinoChange = (e) => {
    setFormData(prev => ({ ...prev, destinoId: e.target.value, destinoNombre: e.target.label }));
  };

  const handleMedioChange = (id, value) => {
    setMedios(prev => prev.map(m => m.id === id ? { ...m, nombre: value } : m));
  };

  // --- Submit: The Semantic & Batch Magic ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const results = [];
      const batchGroupId = `GRP-${Date.now()}`;
      const writeBatchOp = writeBatch(db);
      
      // 1. Verificación de stock previa a generar IDs
      for (const medio of medios) {
        if (!medio.nombre.trim() && !medio.medioPrepId) continue;
        const clonesCount = medio.cantidad || 1;
        
        if (medio.medioPrepId && medio.medioPrepId !== 'custom') {
           const mpDoc = await getDoc(doc(db, 'medios_preparados', medio.medioPrepId));
           if (!mpDoc.exists() || mpDoc.data().cantidad_actual < clonesCount) {
              alert(`❌ Stock insuficiente para el lote de medio seleccionado. Hay ${mpDoc.data()?.cantidad_actual || 0} disponibles, solicitaste ${clonesCount}.`);
              setLoading(false);
              return;
           }
           // Agregamos el decremento al batch
           const mpRef = doc(db, 'medios_preparados', medio.medioPrepId);
           writeBatchOp.update(mpRef, { cantidad_actual: increment(-clonesCount) });
        }
      }
      
      // We process each medium (substrate) added in the form
      for (const medio of medios) {
        if (!medio.nombre.trim() && !medio.medioPrepId) continue;
        
        const finalSubstrateName = medio.medioPrepId && medio.medioPrepId !== 'custom' 
            ? mediosPrepList.find(m => m.id === medio.medioPrepId)?.nombre_medio 
            : medio.nombre;

        // And for each medium, we can create multiple clones (quantity)
        for (let i = 0; i < (medio.cantidad || 1); i++) {
          const substrateCode = getSubstrateCode(finalSubstrateName);
          
          // Generate Semantic ID: PLO-OST-APD-0001
          const newId = await generateSemanticId(formData.genero, formData.especie, substrateCode);
          
          let fotoUrl = null;
          if (medio.foto) {
            const fileRef = ref(storage, `batches/${newId}/${Date.now()}-${medio.foto.name}`);
            await uploadBytes(fileRef, medio.foto);
            fotoUrl = await getDownloadURL(fileRef);
          }

          const batchDoc = {
            id: newId,
            batchGroupId,
            genero: formData.genero,
            especie: formData.especie,
            cepa: formData.cepa,
            generacion: formData.generacion,
            esDicarion: formData.esDicarion,
            esporomaId: formData.esporomaId,
            parentId: formData.parentId,
            batchIndex: i + 1,
            batchTotal: medio.cantidad || 1,
            substrate: finalSubstrateName,
            substrateCode,
            medioPrepId: medio.medioPrepId && medio.medioPrepId !== 'custom' ? medio.medioPrepId : null,
            destinoId: formData.destinoId,
            destinoNombre: formData.destinoNombre,
            tipoContenedor: formData.tipoContenedor === 'otro' ? formData.otroContenedorNombre : formData.tipoContenedor,
            observaciones: formData.observaciones,
            operator: formData.operator,
            fotoUrl,
            fechaInoculacion: formData.fechaInoculacion,
            createdAt: new Date().toISOString(),
            serverTimestamp: serverTimestamp(),
            status: "Inoculado",
          };

          writeBatchOp.set(doc(db, "batches", newId), batchDoc);
          results.push({ id: newId, medio: finalSubstrateName });
        }
      }

      await writeBatchOp.commit();
      setGeneratedBatches(results);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al guardar. Revisa la consola.");
    } finally {
      setLoading(false);
    }
  };

  const qrPx = CONTENEDORES.find(c => c.id === formData.tipoContenedor)?.px || 120;

  if (generatedBatches) {
    return (
      <div className="animate-fade-in">
        <h2 className="no-print">✅ {generatedBatches.length} Lote(s) Registrado(s)</h2>
        
        <div className="labels-container">
          {generatedBatches.map(batch => (
            <div key={batch.id} className="card print-only-card label-card">
              <div className="label-id">{batch.id}</div>
              <div className="label-qr">
                <QRCodeSVG value={batch.id} size={qrPx} />
              </div>
              <div className="label-details">
                <p><strong>{formData.genero} {formData.especie}</strong> {formData.cepa && `(${formData.cepa})`}</p>
                <p><strong>Gen:</strong> G{formData.generacion} | {formData.esDicarion ? 'Dicarión' : 'Haploide'}</p>
                <p><strong>Medio:</strong> {batch.medio}</p>
                <p><strong>Dest:</strong> {formData.destinoNombre}</p>
                <p><strong>Fecha:</strong> {new Date().toLocaleDateString('es-AR')}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="no-print flex-gap" style={{ marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Imprimir Etiquetas</button>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>➕ Nuevo Registro</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in no-print">
      <h2>Nueva Inoculación</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          
          {/* 1. ORIGEN / HERENCIA */}
          <div className="form-group section-divider">
            <label className="form-label">Origen / Madre</label>
            <div className="flex-gap">
              <button
                type="button"
                className={`btn ${isHeredado ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => setShowOrigenScanner(v => !v)}
                disabled={formData.showManualParent}
              >
                {isHeredado ? `✓ Heredado de ${formData.parentId}` : '📷 Escanear QR Padre'}
              </button>
              <button
                type="button"
                className={`btn ${formData.showManualParent ? 'btn-primary' : 'btn-outline'}`}
                style={{ width: 'auto' }}
                onClick={() => {
                  setFormData(prev => ({ ...prev, showManualParent: !prev.showManualParent, parentId: null }));
                  setIsHeredado(false);
                }}
              >
                ⌨️
              </button>
              {isHeredado && (
                <button type="button" className="btn btn-danger" style={{ width: 'auto' }} onClick={() => {
                   setIsHeredado(false);
                   setFormData(prev => ({ ...prev, parentId: null, genero: '', especie: '', cepa: '', generacion: 1 }));
                }}>✖</button>
              )}
            </div>
            
            {formData.showManualParent && (
              <div style={{ marginTop: '0.5rem' }} className="flex-gap">
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="ID del Padre (ej: PLO-OST-APD-0001)" 
                  value={formData.manualParentId}
                  onChange={(e) => setFormData(prev => ({ ...prev, manualParentId: e.target.value.toUpperCase() }))}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-primary" onClick={async () => {
                  const val = formData.manualParentId;
                  if (!val) return;
                  setLoading(true);
                  try {
                    const docRef = doc(db, 'batches', val);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                      const data = snap.data();
                      setFormData(prev => ({
                        ...prev,
                        parentId: val,
                        genero: data.genero,
                        especie: data.especie,
                        cepa: data.cepa,
                        generacion: (data.generacion || 1) + 1,
                        esDicarion: data.esDicarion ?? true
                      }));
                      setIsHeredado(true);
                    } else {
                      alert("No se encontró el ID padre.");
                    }
                  } catch (err) { console.error(err); }
                  setLoading(false);
                }} disabled={loading}>
                  Buscar
                </button>
              </div>
            )}

            {showOrigenScanner && (
              <div className="scanner-container">
                <div id="origen-reader"></div>
              </div>
            )}
            
            {!isHeredado && (
              <div style={{ marginTop: '1rem' }}>
                <label className="form-label">O vincular a Ejemplar (Esporoma)</label>
                <select name="esporomaId" className="form-control" value={formData.esporomaId} onChange={handleChange}>
                  <option value="">-- Origen no registrado o externo --</option>
                  {esporomas.map(esp => (
                    <option key={esp.id} value={esp.id}>{esp.genero} {esp.especie} ({esp.fechaRecoleccion})</option>
                  ))}
                </select>
                
                {!formData.esporomaId && (
                  <input
                    type="text"
                    name="origenDescripcion"
                    className="form-control"
                    placeholder="Descripción de origen externo (ej: Donación Lab X)"
                    value={formData.origenDescripcion}
                    onChange={handleChange}
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
              </div>
            )}
          </div>

          {/* 2. TAXONOMÍA */}
          <div className="form-group grid-2">
            <div>
              <label className="form-label">Género</label>
              <input type="text" name="genero" className="form-control" placeholder="Ej: Pleurotus" required value={formData.genero} onChange={handleChange} disabled={isHeredado} />
            </div>
            <div>
              <label className="form-label">Especie</label>
              <input type="text" name="especie" className="form-control" placeholder="Ej: ostreatus" required value={formData.especie} onChange={handleChange} disabled={isHeredado} />
            </div>
          </div>
          
          <div className="form-group grid-2">
            <div>
              <label className="form-label">Cepa (opcional)</label>
              <input type="text" name="cepa" className="form-control" placeholder="Ej: CEPA-01" value={formData.cepa} onChange={handleChange} disabled={isHeredado} />
            </div>
            <div>
              <label className="form-label">Generación</label>
              <input type="number" name="generacion" className="form-control" value={formData.generacion} onChange={handleChange} disabled={isHeredado} />
            </div>
          </div>

          <div className="form-group flex-gap">
            <label className="flex-gap" style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input type="checkbox" name="esDicarion" checked={formData.esDicarion} onChange={handleChange} />
              Es Dicarión (Micelio vegetativo)
            </label>
          </div>

          {/* 3. FECHA Y DESTINO */}
          <div className="form-group grid-2">
            <div>
              <label className="form-label">Fecha de Inoculación</label>
              <input type="date" name="fechaInoculacion" className="form-control" value={formData.fechaInoculacion} onChange={handleChange} />
            </div>
            <DestinoSelector value={formData.destinoId} onChange={handleDestinoChange} />
          </div>

          {/* 4. CONTENEDOR Y CANTIDAD */}
          <div className="form-group grid-2">
            <div>
              <label className="form-label">Tipo de Contenedor</label>
              <select name="tipoContenedor" className="form-control" value={formData.tipoContenedor} onChange={handleChange}>
                {CONTENEDORES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {formData.tipoContenedor === 'otro' && (
                <input 
                  type="text" 
                  name="otroContenedorNombre" 
                  className="form-control" 
                  placeholder="Ej: Tubo 50ml" 
                  style={{ marginTop: '0.5rem' }} 
                  value={formData.otroContenedorNombre}
                  onChange={handleChange}
                />
              )}
            </div>
          </div>

          {/* 5. MEDIOS MÚLTIPLES */}
          <div className="form-group section-divider">
            <label className="form-label flex-between" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Sustratos / Medios (Múltiples permitidos)</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setMedios([...medios, { id: Date.now(), nombre: '', cantidad: 1 }])}>
                ➕ Añadir Medio
              </button>
            </label>
            
            {medios.map((medio, index) => (
              <div key={medio.id} className="flex-gap" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <select 
                    className="form-control" 
                    value={medio.medioPrepId || ''} 
                    onChange={e => {
                      const newMedios = [...medios];
                      const val = e.target.value;
                      newMedios[index].medioPrepId = val;
                      if (val && val !== 'custom') {
                         newMedios[index].nombre = mediosPrepList.find(m => m.id === val)?.nombre_medio || '';
                      } else {
                         newMedios[index].nombre = '';
                      }
                      setMedios(newMedios);
                    }}
                  >
                    <option value="">— Elegir Medio de Inventario —</option>
                    {mediosPrepList.map(mp => (
                      <option key={mp.id} value={mp.id}>{mp.nombre_medio} - Lote {mp.lote_preparacion} ({mp.cantidad_actual} disp.)</option>
                    ))}
                    <option value="custom">Otro / Sin inventariar</option>
                  </select>
                  
                  {medio.medioPrepId === 'custom' && (
                    <input type="text" list="medios-list" className="form-control animate-fade-in" placeholder="Escribir nombre (Ej: Agar Papa Dextrosa)" required 
                      value={medio.nombre}
                      onChange={e => {
                        const newMedios = [...medios];
                        newMedios[index].nombre = e.target.value;
                        setMedios(newMedios);
                      }} />
                  )}
                </div>
                <input type="number" className="form-control" title="Cantidad" min="1" max="50" style={{ width: '80px' }}
                  value={medio.cantidad}
                  onChange={e => {
                    const newMedios = [...medios];
                    newMedios[index].cantidad = Number(e.target.value);
                    setMedios(newMedios);
                  }}
                />
                {medios.length > 1 && (
                  <button type="button" className="btn btn-danger" title="Eliminar" onClick={() => setMedios(medios.filter(m => m.id !== medio.id))}>🗑</button>
                )}
              </div>
            ))}
            <datalist id="medios-list">
              {MEDIOS_SUGERIDOS.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div className="form-group">
            <label className="form-label">Observaciones Científicas</label>
            <textarea name="observaciones" className="form-control" rows="2" placeholder="Ej: Lote de grano #001, temperatura 24C..." value={formData.observaciones} onChange={handleChange}></textarea>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading || !formData.genero || !formData.especie || !formData.destinoId || medios.some(m => !m.medioPrepId || (m.medioPrepId === 'custom' && !m.nombre))} 
            style={{ width: '100%', marginTop: '1rem', opacity: (!formData.genero || !formData.especie) ? 0.5 : 1 }}
          >
            {loading ? "Generando IDs..." : (!formData.genero || !formData.especie) ? "⚠️ Falta Género/Especie" : "Registrar Inoculación"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default NewBatch;

