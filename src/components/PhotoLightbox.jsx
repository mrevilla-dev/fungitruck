import { useEffect } from 'react';

export default function PhotoLightbox({ imageUrl, onClose }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
    >
      <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
        <img
          src={imageUrl}
          alt="Foto ampliada"
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            borderRadius: '8px'
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-2rem',
            right: 0,
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '2rem',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
        <a
          href={imageUrl}
          download
          target="_blank"
          rel="noreferrer"
          style={{
            position: 'absolute',
            bottom: '-2rem',
            right: 0,
            color: 'white',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}
        >
          ⬇️ Descargar
        </a>
      </div>
    </div>
  );
}
