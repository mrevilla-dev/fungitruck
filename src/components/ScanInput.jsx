import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';

export default function ScanInput({ onScan, label = 'Escanear' }) {
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  const startScan = () => setScanning(true);

  useEffect(() => {
    if (!scanning) return;
    let scanner;
    const containerId = `scan-inline-${Date.now()}`;

    const timer = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.id = containerId;
        scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 },
          (decodedText) => {
            scanner.stop().catch(() => {});
            setScanning(false);
            onScan(decodedText);
          },
          () => {}
        ).catch(() => {
          scanner.start(
            { facingMode: 'user' },
            { fps: 15, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 },
            (decodedText) => {
              scanner.stop().catch(() => {});
              setScanning(false);
              onScan(decodedText);
            },
            () => {}
          ).catch(err => {
            toast.error('No se pudo acceder a la cámara');
            setScanning(false);
          });
        });
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [scanning, onScan]);

  if (scanning) {
    return (
      <div style={{ marginTop: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%' }} />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setScanning(false); if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {}); }}
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 10 }}
        >✕ Cerrar</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={startScan}
      style={{ marginTop: '0.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '40px' }}
    >📷 {label}</button>
  );
}
