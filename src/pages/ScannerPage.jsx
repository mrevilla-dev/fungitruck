import { useState, useEffect } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { db, storage } from '../firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';
import { compressImage } from '../utils/imageUtils';

function ScannerPage() {
  const [scanResult, setScanResult] = useState(null);
  const [recordData, setRecordData] = useState(null);  // batch OR cultivo OR medio
  const [recordType, setRecordType] = useState(null);  // 'batch' | 'cultivo' | 'medio'
  const [history, setHistory] = useState([]);
  const [statusText, setStatusText] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let html5QrCode;
    if (!scanResult) {
      html5QrCode = new Html5Qrcode("reader");
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => { 
          setScanResult(decodedText); 
          html5QrCode.stop().catch(err => console.warn("Error stopping scanner", err));
        },
        () => {}
      ).catch(err => {
        console.error("Unable to start scanner", err);
        // Fallback to any camera if environment fails
        html5QrCode.start({ facingMode: "user" }, config, (decodedText) => {
          setScanResult(decodedText);
          html5QrCode.stop().catch(e => console.warn(e));
        }, () => {});
      });

      return () => {
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().catch(err => console.warn(err));
        }
      };
    } else {
      fetchDetails(scanResult);
    }
  }, [scanResult]);

  const fetchDetails = async (id) => {
    setLoading(true);
    setRecordData(null);
    setRecordType(null);
    setHistory([]);
    try {
      // 1. Intentar como Cultivo (CL-YYYYMMDD-XXXX)
      if (id.startsWith('CL-')) {
        const qCultivos = query(collection(db, "cultivos"), where("id", "==", id));
        const snapC = await getDocs(qCultivos);
        if (!snapC.empty) {
          setRecordData(snapC.docs[0].data());
          setRecordType('cultivo');
          setLoading(false);
          return;
        }
      }

      // 2. Intentar como Medio Preparado (ID de Firestore)
      const medioDoc = await getDoc(doc(db, "medios_preparados", id));
      if (medioDoc.exists()) {
        setRecordData({ dbId: id, ...medioDoc.data() });
        setRecordType('medio');
        setLoading(false);
        return;
      }

      // 3. Intentar como Lote de Insumo (insumos_lotes)
      const qLotes = query(collection(db, "insumos_lotes"), where("lote_interno", "==", id));
      const snapL = await getDocs(qLotes);
      if (!snapL.empty) {
        setRecordData({ id: snapL.docs[0].id, ...snapL.docs[0].data() });
        setRecordType('insumo_lote');
        setLoading(false);
        return;
      }

      // 4. Intentar como Insumo Base (Maestro)
      const insumoDoc = await getDoc(doc(db, "insumos_base", id));
      if (insumoDoc.exists()) {
        setRecordData({ id: id, ...insumoDoc.data() });
        setRecordType('insumo_base');
        setLoading(false);
        return;
      }

      // 5. Intentar como Batch (legacy)
      const batchDoc = await getDoc(doc(db, "batches", id));
      if (batchDoc.exists()) {
        setRecordData(batchDoc.data());
        setRecordType('batch');
        const hQuery = query(collection(db, "tracking"), where("batchId", "==", id), orderBy("createdAt", "desc"));
        const hSnap = await getDocs(hQuery);
        setHistory(hSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
        return;
      }

      alert(`No se encontró ningún registro para: ${id}`);
      setScanResult(null);
    } catch (err) {
      console.error("Error al buscar:", err);
      alert("Error al buscar el registro.");
      setScanResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) { setPhotoFile(file); setPhotoUrl(URL.createObjectURL(file)); }
  };

  const handleSaveTracking = async () => {
    if (!statusText && !photoFile) return;
    setLoading(true);
    try {
      let uploadedUrl = null;
      if (photoFile) {
        let fileToUpload = photoFile;
        try {
          if (photoFile.size > 1024 * 500) {
            fileToUpload = await compressImage(photoFile);
          }
        } catch (compErr) {
          console.warn("Error en compresión:", compErr);
        }

        const fileRef = ref(storage, `tracking/${scanResult}/${Date.now()}-${photoFile.name}`);
        
        try {
          await uploadBytes(fileRef, fileToUpload);
          uploadedUrl = await getDownloadURL(fileRef);
        } catch (uploadErr) {
          console.error("Storage Error:", uploadErr);
          throw new Error(`Fallo la subida: ${uploadErr.code || uploadErr.message}`);
        }
      }
      const logEntry = {
        batchId: scanResult,
        status: statusText,
        imageUrl: uploadedUrl,
        operator: 'Maxi',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, "tracking"), logEntry);
      setHistory([logEntry, ...history]);
      setStatusText('');
      setPhotoFile(null);
      setPhotoUrl(null);
      alert("✅ Seguimiento guardado");
    } catch (error) {
      console.error(error);
      alert(`⚠️ Error al guardar: ${error.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCultivoStatus = async (newStatus) => {
    if (!window.confirm(`¿Marcar este cultivo como "${newStatus}"?`)) return;
    setLoading(true);
    try {
      const q = query(collection(db, "cultivos"), where("id", "==", scanResult));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, "cultivos", snap.docs[0].id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });


        setRecordData({ ...recordData, status: newStatus });
      }
    } catch (err) {
      console.error(err);
      alert("Error al actualizar estado");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Incubación':     return 'var(--primary-color)';
      case 'Fructificación': return '#8b5cf6';
      case 'Cosechado':      return 'var(--accent-color)';
      case 'Contaminado':    return 'var(--danger-color)';
      default:               return 'var(--border-color)';
    }
  };

  // ── Pantalla de carga ──
  if (loading && !recordData) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
        <p style={{ color: 'var(--text-secondary)' }}>Buscando registro...</p>
      </div>
    );
  }

  // ── Vista: Cultivo ──
  if (recordType === 'cultivo' && recordData) {
    const statusColor = getStatusColor(recordData.status);
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline no-print" style={{ width: 'auto' }}
            onClick={() => { setScanResult(null); setRecordData(null); }}>← Volver</button>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>{scanResult}</div>
          <button className="btn btn-primary no-print" style={{ width: 'auto', padding: '0.5rem 1rem' }}
            onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>

        {/* Etiqueta de impresión */}
        <div className="print-only" style={{ textAlign: 'center', padding: '20px', border: '1px solid black' }}>
          <QRCodeSVG value={scanResult} size={150} />
          <div style={{ marginTop: '10px', fontSize: '0.9rem' }}>
            <strong>{recordData.cepa_especie}</strong><br />
            {recordData.id} · {recordData.fecha_inoculacion}
          </div>
        </div>

        <div className="card no-print" style={{ borderTop: `6px solid ${statusColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>{recordData.cepa_especie}</h2>
              <span style={{
                fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase',
                color: statusColor, background: `${statusColor}20`,
                padding: '3px 10px', borderRadius: '99px'
              }}>{recordData.status}</span>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <QRCodeSVG value={scanResult} size={64} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
            <div>
              <label className="form-label">Medio de Origen</label>
              <p style={{ margin: 0 }}>🧫 {recordData.medio_origen_alias || '—'}</p>
            </div>
            <div>
              <label className="form-label">Cantidad / Unidades</label>
              <p style={{ margin: 0 }}>📦 {recordData.cantidad} {recordData.unidad}</p>
            </div>
            <div>
              <label className="form-label">Fecha de Inoculación</label>
              <p style={{ margin: 0 }}>📅 {recordData.fecha_inoculacion}</p>
            </div>
          </div>

          {/* Acciones de estado */}
          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <label className="form-label">Cambiar Estado del Cultivo</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {recordData.status !== 'Fructificación' && recordData.status !== 'Cosechado' && recordData.status !== 'Contaminado' && (
                <button className="btn btn-outline" style={{ width: 'auto', borderColor: '#8b5cf6', color: '#8b5cf6' }}
                  onClick={() => handleUpdateCultivoStatus('Fructificación')}>🍄 Fructificación</button>
              )}
              {recordData.status !== 'Cosechado' && recordData.status !== 'Contaminado' && (
                <button className="btn btn-outline" style={{ width: 'auto', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                  onClick={() => handleUpdateCultivoStatus('Cosechado')}>🧺 Cosechado</button>
              )}
              {recordData.status !== 'Contaminado' && (
                <button className="btn btn-danger" style={{ width: 'auto' }}
                  onClick={() => handleUpdateCultivoStatus('Contaminado')}>☣️ Contaminado</button>
              )}
            </div>
          </div>
        </div>

        {/* Seguimiento */}
        <h3 className="no-print" style={{ marginTop: '1.5rem' }}>Agregar Observación</h3>
        <div className="card no-print">
          <div className="form-group">
            <label className="form-label">Notas / Observaciones</label>
            <textarea className="form-control" rows="2"
              placeholder="Ej: Micelio avanzando bien, sin señales de contaminación."
              value={statusText}
              onChange={e => setStatusText(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">📷 Foto de control</label>
            <input type="file" capture="environment" accept="image/*" className="form-control" onChange={handlePhotoCapture} />
            {photoUrl && <img src={photoUrl} alt="Preview" style={{ width: '100%', borderRadius: '12px', marginTop: '1rem' }} />}
          </div>
          <button className="btn btn-primary" onClick={handleSaveTracking}
            disabled={loading || (!statusText && !photoFile)}>
            {loading ? "Guardando..." : "💾 Guardar Observación"}
          </button>
        </div>
      </div>
    );
  }

  // ── Vista: Medio Preparado ──
  if (recordType === 'medio' && recordData) {
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline" style={{ width: 'auto' }}
            onClick={() => { setScanResult(null); setRecordData(null); }}>← Volver</button>
          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>
            {recordData.alias}
          </div>
        </div>

        <div className="card" style={{ borderTop: '6px solid var(--primary-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>{recordData.alias}</h2>
              <p style={{ margin: 0 }}>{recordData.nombre_receta} · <span className="sala-tipo" style={{ fontSize: '0.7rem' }}>{recordData.tipo}</span></p>
            </div>
            <QRCodeSVG value={scanResult} size={64} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
            <div>
              <label className="form-label">Stock Disponible</label>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1.2rem' }}>
                {recordData.stock_bulk?.cantidad_actual} {recordData.stock_bulk?.unidad}
              </p>
            </div>
            <div>
              <label className="form-label">Estado</label>
              <p style={{ margin: 0 }}><span className="sala-tipo">{recordData.estado}</span></p>
            </div>
            <div>
              <label className="form-label">Fecha de Preparación</label>
              <p style={{ margin: 0 }}>📅 {recordData.trazabilidad?.fecha_preparacion || '—'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista: Insumo Base (Maestro) ──
  if (recordType === 'insumo_base' && recordData) {
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline" style={{ width: 'auto' }}
            onClick={() => { setScanResult(null); setRecordData(null); }}>← Volver</button>
          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>
            ID: {recordData.id}
          </div>
        </div>

        <div className="card" style={{ borderTop: '6px solid var(--accent-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>{recordData.nombre}</h2>
              <span className="sala-tipo" style={{ fontSize: '0.7rem' }}>{recordData.categoria}</span>
            </div>
            <QRCodeSVG value={scanResult} size={64} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
            <div>
              <label className="form-label">Stock Total</label>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1.2rem' }}>
                {(recordData.stock_total_base / (recordData.factor_display || 1)).toFixed(1)} {recordData.unidad_display || recordData.unidad_base}
              </p>
            </div>
            <div>
              <label className="form-label">Ubicación</label>
              <p style={{ margin: 0 }}>📍 {recordData.ubicacion?.detalle || 'Principal'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista: Lote de Insumo ──
  if (recordType === 'insumo_lote' && recordData) {
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline" style={{ width: 'auto' }}
            onClick={() => { setScanResult(null); setRecordData(null); }}>← Volver</button>
          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>
            Lote: {recordData.lote_interno}
          </div>
        </div>

        <div className="card" style={{ borderTop: '6px solid var(--primary-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>{recordData.nombre_insumo}</h2>
              <p style={{ margin: 0 }}>{recordData.proveedor} · {recordData.estado_apertura}</p>
            </div>
            <QRCodeSVG value={scanResult} size={64} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
            <div>
              <label className="form-label">Cantidad Actual</label>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1.2rem' }}>
                {recordData.cantidad_base_actual} (base)
              </p>
            </div>
            <div>
              <label className="form-label">Fecha Ingreso</label>
              <p style={{ margin: 0 }}>📅 {recordData.fecha_ingreso}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista: Batch Legacy ──
  if (recordType === 'batch' && recordData) {
    const statusColor = recordData.status === 'Contaminado' ? 'var(--danger-color)'
                      : recordData.status === 'Cosechado'   ? 'var(--accent-color)'
                      : 'var(--primary-color)';
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline no-print" style={{ width: 'auto' }}
            onClick={() => { setScanResult(null); setRecordData(null); }}>← Volver</button>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>{scanResult}</div>
          <button className="btn btn-primary no-print" style={{ width: 'auto', padding: '0.5rem 1rem' }}
            onClick={() => window.print()}>🖨️</button>
        </div>

        <div className="print-only" style={{ textAlign: 'center', padding: '20px', border: '1px solid black' }}>
          <QRCodeSVG value={scanResult} size={150} />
          <div style={{ marginTop: '10px', fontSize: '0.9rem' }}>
            <strong>{recordData.genero} {recordData.especie}</strong><br />
            G{recordData.generacion} | {recordData.substrate}
          </div>
        </div>

        <div className="card no-print" style={{ borderTop: `6px solid ${statusColor}` }}>
          <h2>{recordData.genero} {recordData.especie}</h2>
          <p style={{ margin: 0 }}>G{recordData.generacion} · <strong>{recordData.status}</strong></p>
          <p style={{ margin: '0.5rem 0 0' }}>📍 {recordData.destinoNombre || '—'}</p>
        </div>

        {history.length > 0 && (
          <div className="no-print" style={{ marginTop: '1.5rem' }}>
            <h3>Historial</h3>
            {history.map((log, i) => (
              <div key={i} className="card" style={{ padding: '1rem', marginBottom: '0.75rem', borderLeft: '4px solid var(--primary-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  <span>{new Date(log.createdAt).toLocaleString('es-AR')}</span>
                  <span>{log.operator}</span>
                </div>
                <p style={{ margin: 0 }}>{log.status}</p>
                {log.imageUrl && <img src={log.imageUrl} alt="Evidencia" style={{ width: '100%', borderRadius: '8px', marginTop: '0.5rem' }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Pantalla principal: Scanner ──
  return (
    <div className="animate-fade-in no-print">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>Escanear QR</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Apuntá la cámara a cualquier etiqueta del laboratorio — cultivos, medios o lotes.
        </p>
      </div>
      <div className="card" style={{ padding: '0.5rem', overflow: 'hidden' }}>
        <div id="reader" style={{ width: '100%', border: 'none' }}></div>
      </div>
      <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          💡 Compatible con QRs de: <strong>Cultivos (CL-)</strong>, <strong>Medios Preparados</strong> y lotes heredados.
        </p>
      </div>
    </div>
  );
}

export default ScannerPage;
