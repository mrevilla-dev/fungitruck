import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { db, storage } from '../firebase';
import { doc, getDoc, collection, collectionGroup, addDoc, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';
import { compressImage } from '../utils/imageUtils';
import toast from 'react-hot-toast';

function ScannerPage() {
  const navigate = useNavigate();
  const [scanResult, setScanResult] = useState(null);
  const [recordData, setRecordData] = useState(null);  // batch OR medio
  const [recordType, setRecordType] = useState(null);  // 'batch' | 'medio' | 'insumo_lote' | 'insumo_base'
  const [history, setHistory] = useState([]);
  const [statusText, setStatusText] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let html5QrCode;
    if (!scanResult) {
      html5QrCode = new Html5Qrcode("reader");
      const config = { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
      
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
      // 0. Criovial (CRV-) — redirigir a ficha existente
      if (id.startsWith('CRV-')) {
        navigate(`/criobanco/criovial/${id}`);
        setScanResult(null);
        return;
      }

      // 0b. Subfracción (FRAC-) — buscar por id_bolsa en collectionGroup
      if (id.startsWith('FRAC-')) {
        const qSub = query(collectionGroup(db, 'subfracciones'), where('id_bolsa', '==', id));
        const snapSub = await getDocs(qSub);
        if (!snapSub.empty) {
          const subDoc = snapSub.docs[0];
          const parentPath = subDoc.ref.parent.parent;
          setRecordData({ dbId: subDoc.id, medioId: parentPath?.id, ...subDoc.data() });
          setRecordType('medio');
          setLoading(false);
          return;
        }
      }

      // 0c. Medio Preparado (MED-) — buscar por id_semantico o alias
      if (id.startsWith('MED-')) {
        const qMed = query(collection(db, 'medios_preparados'), where('id_semantico', '==', id));
        const snapMed = await getDocs(qMed);
        if (!snapMed.empty) {
          setRecordData({ dbId: snapMed.docs[0].id, ...snapMed.docs[0].data() });
          setRecordType('medio');
          setLoading(false);
          return;
        }
      }

      // 1. Intentar como Medio Preparado (ID de Firestore)
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

      toast.error(`No se encontró ningún registro para: ${id}`);
      setScanResult(null);
    } catch (err) {
      console.error("Error al buscar:", err);
      toast.error("Error al buscar el registro.");
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
      toast.success("Seguimiento guardado");
    } catch (error) {
      console.error(error);
      toast.error(`Error al guardar: ${error.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
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
          💡 Compatible con QRs de: <strong>Medios Preparados</strong>, <strong>Lotes de Insumo</strong>, <strong>Insumos Base</strong> y <strong>Batches</strong>.
        </p>
      </div>
    </div>
  );
}

export default ScannerPage;
