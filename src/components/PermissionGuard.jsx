import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

export default function PermissionGuard({ children }) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Verificar si ya se concedieron los permisos en el pasado
    const hasPermission = localStorage.getItem('fungitrack_permissions_granted');
    if (hasPermission === 'true') {
      setPermissionGranted(true);
      setChecking(false);
    } else {
      setChecking(false);
    }
  }, []);

  const requestPermission = async () => {
    setChecking(true);
    setError(null);
    try {
      // 1. Cámara
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      }
      
      // 2. Notificaciones (si el navegador lo soporta)
      if ('Notification' in window && Notification.permission !== 'granted') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          console.warn("Notification request failed", e);
        }
      }

      // 3. Geolocalización (para los ejemplares/esporomas)
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      
      localStorage.setItem('fungitrack_permissions_granted', 'true');
      setPermissionGranted(true);
    } catch (err) {
      console.error("Error al conceder permisos:", err);
      setError("Necesitamos estos permisos para que el sistema de trazabilidad funcione (Cámara para QR y GPS para ejemplares). Por favor, aceptalos en tu navegador.");
    } finally {
      setChecking(false);
    }
  };

  if (permissionGranted) {
    return children;
  }

  if (checking) {
    return (
      <div className="modal-overlay">
        <div className="modal-box" style={{ textAlign: 'center' }}>
          <p>Solicitando autorizaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box animate-fade-in" style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🍄</div>
        <h2>Configuración Inicial</h2>
        <p style={{ marginBottom: '2rem' }}>
          Para que FungiTrack funcione al 100% en el laboratorio y el campo, necesitamos habilitar:
          <br/><br/>
          📷 <strong>Cámara</strong> (Escaneo de QR)<br/>
          📍 <strong>Ubicación</strong> (Registro de ejemplares)<br/>
          🔔 <strong>Notificaciones</strong> (Alertas de cultivo)
        </p>
        
        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: 'var(--danger-color)', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1.5rem',
            fontSize: '0.9rem'
          }}>
            ⚠️ {error}
          </div>
        )}

        <button className="btn btn-primary" onClick={requestPermission}>
          🚀 Habilitar Todo y Empezar
        </button>
        
        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Haremos esto una sola vez para que no te interrumpa mientras trabajás.
        </p>
      </div>
    </div>
  );
}

PermissionGuard.propTypes = {
  children: PropTypes.node.isRequired,
};
