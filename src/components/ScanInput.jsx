import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { normalizarScan } from '../utils/normalizarScan';
import toast from 'react-hot-toast';

// Resolución alta: los QR de etiquetas 10×15 son chicos y a ~20-30 cm un
// stream a 1920×1080 le da bastante más píxeles al decodificador.
const VIDEO_CONSTRAINTS = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };

export default function ScanInput({ onScan, label = 'Escanear' }) {
  const [scanning, setScanning] = useState(false);
  const containerRef = useRef(null);
  const detenerRef = useRef(null);

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let html5Scanner = null;
    let stream = null;
    let videoEl = null;
    let rafId = null;

    const detenerTodo = () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
      if (html5Scanner && html5Scanner.isScanning) html5Scanner.stop().catch(() => {});
    };

    const onDetect = (texto) => {
      if (cancelled) return;
      const limpio = normalizarScan(texto);
      detenerTodo();
      setScanning(false);
      if (limpio) onScan(limpio);
    };

    detenerRef.current = detenerTodo;

    // Fallback: html5-qrcode (jsQR interno) con constraints de video a resolución completa
    const iniciarHtml5Qrcode = (facingMode = 'environment') => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;
      const containerId = `scan-inline-${Date.now()}`;
      container.id = containerId;
      html5Scanner = new Html5Qrcode(containerId);
      html5Scanner.start(
        { facingMode },
        {
          fps: 15,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
          videoConstraints: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
        },
        onDetect,
        () => {}
      ).catch(() => {
        if (facingMode === 'environment') {
          iniciarHtml5Qrcode('user');
        } else {
          toast.error('No se pudo acceder a la cámara');
          setScanning(false);
        }
      });
    };

    // Vía primaria: BarcodeDetector nativo, detect() directo sobre el <video>
    // a resolución completa (sin pasos intermedios por canvas).
    const iniciarBarcodeDetector = async (facingMode = 'environment') => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO_CONSTRAINTS, facingMode } });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        videoEl = document.createElement('video');
        videoEl.setAttribute('playsinline', 'true');
        videoEl.style.width = '100%';
        videoEl.srcObject = stream;
        containerRef.current.appendChild(videoEl);
        await videoEl.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const loop = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              onDetect(codes[0].rawValue);
              return;
            }
          } catch (e) { /* frame inválido — seguir escaneando */ }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        if (cancelled) return;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
        videoEl = null;
        iniciarHtml5Qrcode(facingMode);
      }
    };

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (window.BarcodeDetector) {
        iniciarBarcodeDetector();
      } else {
        iniciarHtml5Qrcode();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      detenerTodo();
    };
  }, [scanning, onScan]);

  if (scanning) {
    return (
      <div style={{ marginTop: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%' }} />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setScanning(false); detenerRef.current?.(); }}
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 10 }}
        >✕ Cerrar</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={() => setScanning(true)}
      style={{ marginTop: '0.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '40px' }}
    >📷 {label}</button>
  );
}
