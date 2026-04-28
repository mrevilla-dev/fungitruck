import { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { db, storage } from '../firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { QRCodeSVG } from 'qrcode.react';
import DestinoSelector from '../components/DestinoSelector';
import BatchEditModal from '../components/BatchEditModal';

function ScannerPage() {
  const [scanResult, setScanResult] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [history, setHistory] = useState([]);
  const [statusText, setStatusText] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newDestino, setNewDestino] = useState({ id: '', nombre: '' });

  useEffect(() => {
    if (!scanResult) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          setScanResult(decodedText);
          scanner.clear();
        },
        (error) => {}
      );

      return () => {
        scanner.clear().catch(e => console.error(e));
      };
    } else {
      fetchBatchDetails(scanResult);
    }
  }, [scanResult]);

  const fetchBatchDetails = async (id) => {
    setLoading(true);
    try {
      // 1. Get Batch Info
      const bDoc = await getDoc(doc(db, "batches", id));
      if (bDoc.exists()) {
        setBatchData(bDoc.data());
        
        // 2. Get Tracking History
        const hQuery = query(
          collection(db, "tracking"), 
          where("batchId", "==", id),
          orderBy("createdAt", "desc")
        );
        const hSnapshot = await getDocs(hQuery);
        setHistory(hSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        alert("No se encontró información para el lote: " + id);
        setScanResult(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveTracking = async () => {
    if (!statusText && !photoFile) return;
    setLoading(true);
    try {
      let uploadedUrl = null;
      if (photoFile) {
        const fileRef = ref(storage, `tracking/${scanResult}/${Date.now()}-${photoFile.name}`);
        await uploadBytes(fileRef, photoFile);
        uploadedUrl = await getDownloadURL(fileRef);
      }

      const logEntry = {
        batchId: scanResult,
        status: statusText,
        imageUrl: uploadedUrl,
        operator: 'Maxi',
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      };

      await addDoc(collection(db, "tracking"), logEntry);
      
      // Update local state
      setHistory([logEntry, ...history]);
      setStatusText('');
      setPhotoFile(null);
      setPhotoUrl(null);
      alert("Seguimiento guardado");
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleMoveBatch = async () => {
    if (!newDestino.id) return;
    setLoading(true);
    try {
      // 1. Update Batch Document
      await updateDoc(doc(db, "batches", scanResult), {
        destinoId: newDestino.id,
        destinoNombre: newDestino.nombre
      });

      // 2. Add Tracking Log
      await addDoc(collection(db, "tracking"), {
        batchId: scanResult,
        status: `📦 Movido a: ${newDestino.nombre}`,
        type: 'movement',
        operator: 'Maxi',
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });

      setBatchData({ ...batchData, destinoId: newDestino.id, destinoNombre: newDestino.nombre });
      setShowMoveModal(false);
      fetchBatchDetails(scanResult); // Refresh
    } catch (err) {
      console.error(err);
      alert("Error al mover");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!window.confirm(`¿Seguro que querés marcar este lote como ${newStatus}?`)) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "batches", scanResult), { status: newStatus });
      await addDoc(collection(db, "tracking"), {
        batchId: scanResult,
        status: `⚠️ Estado cambiado a: ${newStatus}`,
        type: 'status_change',
        operator: 'Maxi',
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
      setBatchData({ ...batchData, status: newStatus });
      fetchBatchDetails(scanResult);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar estado");
    } finally {
      setLoading(false);
    }
  };

  if (scanResult && batchData) {
    return (
      <div className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-outline no-print" style={{ width: 'auto' }} onClick={() => { setScanResult(null); setBatchData(null); }}>← Volver</button>
          <div className="label-id" style={{ margin: 0 }}>{scanResult}</div>
          <button className="btn btn-primary no-print" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => window.print()}>🖨️ Reimprimir</button>
        </div>

        {/* --- PRINTABLE LABEL (Hidden in UI, visible in print) --- */}
        <div className="print-only label-card card" style={{ textAlign: 'center', padding: '20px', border: '1px solid black' }}>
          <div className="label-id" style={{ fontSize: '1.2rem', marginBottom: '10px' }}>{scanResult}</div>
          <QRCodeSVG value={scanResult} size={150} />
          <div style={{ marginTop: '10px', fontSize: '0.9rem' }}>
            <strong>{batchData.genero} {batchData.especie}</strong><br/>
            G{batchData.generacion} | {batchData.substrate}<br/>
            {new Date(batchData.createdAt).toLocaleDateString()}
          </div>
        </div>

        <div className="card no-print" style={{ borderTop: `6px solid ${
          batchData.status === 'Contaminado' ? 'var(--danger-color)' : 
          batchData.status === 'Cosechado' ? 'var(--accent-color)' : 'var(--primary-color)'
        }` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ marginBottom: '0.2rem' }}>{batchData.genero} {batchData.especie}</h2>
              <p style={{ margin: 0 }}>{batchData.cepa || 'Sin cepa'} | <strong style={{ color: 
                batchData.status === 'Contaminado' ? 'var(--danger-color)' : 
                batchData.status === 'Cosechado' ? 'var(--accent-color)' : 'inherit'
              }}>{batchData.status}</strong></p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="sala-tipo">G{batchData.generacion}</span>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{batchData.esDicarion ? 'Dicarión' : 'Haploide'}</p>
            </div>
          </div>
          
          <div className="section-divider" style={{ marginTop: '1rem', paddingTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Ubicación Actual</label>
                <p>📍 {batchData.destinoNombre || 'No definida'} 
                  {batchData.subUbicacion && <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}> - {batchData.subUbicacion}</span>}
                </p>
              </div>
              <div>
                <label className="form-label">Sustrato</label>
                <p>🧫 {batchData.substrate}</p>
              </div>
            </div>
            
            <div className="flex-gap" style={{ marginTop: '1rem' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowMoveModal(true)}>📦 Mover</button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowEditModal(true)}>✏️ Editar</button>
              
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {batchData.status === 'Inoculado' && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem' }} onClick={() => handleUpdateStatus('Colonizando')}>🔜</button>
                )}
                {batchData.status === 'Colonizando' && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem', background: '#f59e0b' }} onClick={() => handleUpdateStatus('Fructificando')}>🍄</button>
                )}
                {batchData.status === 'Fructificando' && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem', background: 'var(--accent-color)' }} onClick={() => handleUpdateStatus('Cosechado')}>✅</button>
                )}
                {batchData.status !== 'Contaminado' && batchData.status !== 'Cosechado' && (
                  <button className="btn btn-danger" style={{ width: 'auto', padding: '0.5rem' }} onClick={() => handleUpdateStatus('Contaminado')}>☣️</button>
                )}
              </div>
            </div>
          </div>

          {batchData.parentId && (
            <div className="section-divider">
              <label className="form-label">Linaje (Padre)</label>
              <p style={{ cursor: 'pointer', color: 'var(--primary-color)' }} onClick={() => setScanResult(batchData.parentId)}>
                🧬 {batchData.parentId}
              </p>
            </div>
          )}
        </div>

        {/* --- NUEVO SEGUIMIENTO --- */}
        <h3 className="no-print">Nuevo Seguimiento</h3>
        <div className="card no-print">
          <div className="form-group">
            <label className="form-label">Estado / Evolución</label>
            <textarea 
              className="form-control" 
              rows="2" 
              placeholder="Ej: Micelio colonizando bien, sin contaminaciones."
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Foto de control</label>
            <input type="file" capture="environment" accept="image/*" className="form-control" onChange={handlePhotoCapture} />
            {photoUrl && <img src={photoUrl} alt="Preview" style={{ width: '100%', borderRadius: '12px', marginTop: '1rem' }} />}
          </div>
          <button className="btn btn-primary" onClick={handleSaveTracking} disabled={loading || (!statusText && !photoFile)}>
            {loading ? "Guardando..." : "💾 Guardar Registro"}
          </button>
        </div>

        {/* --- HISTORIAL --- */}
        <div className="no-print">
          <h3>Historial</h3>
          {history.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem' }}>Sin registros previos.</p>
          ) : (
            <div className="history-list">
              {history.map((log, i) => (
                <div key={i} className="card" style={{ padding: '1rem', marginBottom: '1rem', borderLeft: '4px solid var(--primary-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    <span>{new Date(log.createdAt).toLocaleString('es-AR')}</span>
                    <span>{log.operator}</span>
                  </div>
                  <p style={{ margin: 0, fontWeight: log.type === 'movement' ? 'bold' : 'normal' }}>{log.status}</p>
                  {log.imageUrl && <img src={log.imageUrl} alt="Evidencia" style={{ width: '100%', borderRadius: '8px', marginTop: '0.5rem' }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- MOVE MODAL --- */}
        {showMoveModal && (
          <div className="modal-overlay no-print">
            <div className="modal-box">
              <div className="modal-header">
                <h3>Mover Lote</h3>
                <button className="modal-close" onClick={() => setShowMoveModal(false)}>×</button>
              </div>
              <p>Seleccioná la nueva sala para el lote <strong>{scanResult}</strong></p>
              <DestinoSelector 
                value={newDestino.id} 
                onChange={(e) => setNewDestino({ id: e.target.value, nombre: e.target.label })} 
              />
              <div className="flex-gap" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-primary" onClick={handleMoveBatch} disabled={!newDestino.id || loading}>Confirmar Movimiento</button>
                <button className="btn btn-outline" onClick={() => setShowMoveModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
        {/* --- EDIT MODAL --- */}
        {showEditModal && (
          <BatchEditModal 
            batch={{ id: scanResult, ...batchData }} 
            onClose={() => setShowEditModal(false)} 
            onSaved={(updated) => {
              setBatchData(updated);
              fetchBatchDetails(scanResult);
            }} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in no-print">
      <h2>Escanear Lote</h2>
      <p>Apunta con la cámara al código QR del lote para ver su ficha y trazabilidad.</p>
      <div className="card" style={{ padding: '0.5rem', overflow: 'hidden' }}>
        <div id="reader" style={{ width: '100%', border: 'none' }}></div>
      </div>
    </div>
  );
}

export default ScannerPage;
