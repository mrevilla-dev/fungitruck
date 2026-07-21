import { useNavigate, useLocation } from 'react-router-dom';
import { MENU_ITEMS } from '../../config/menuItems';

export default function MenuMobilePanel({ abierto, onCerrar }) {
  const navigate = useNavigate();
  const location = useLocation();

  function irA(ruta) {
    navigate(ruta);
    onCerrar();
  }

  if (!abierto) return null;

  return (
    <>
      {/* Overlay oscuro detrás del panel */}
      <div
        onClick={onCerrar}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 200,
        }}
      />

      {/* Panel drawer desde abajo */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--bg-color)',
          borderRadius: '20px 20px 0 0',
          padding: '16px',
          zIndex: 201,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
            Menú
          </span>
          <button
            onClick={onCerrar}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
              // Área táctil grande
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Grilla de módulos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}>
          {MENU_ITEMS.map(item => {
            const esActivo = location.pathname === item.ruta ||
              location.pathname.startsWith(item.ruta + '/');

            return (
              <button
                key={item.id}
                onClick={() => irA(item.ruta)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px 8px',
                  borderRadius: '12px',
                  border: esActivo ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                  backgroundColor: esActivo ? 'var(--surface-color)' : 'var(--bg-color)',
                  cursor: 'pointer',
                  // Área táctil mínima 48px
                  minHeight: '80px',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>
                  {item.icono}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: esActivo ? 'bold' : 'normal',
                  color: esActivo ? '#2E7D32' : '#424242',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Espacio inferior para no tapar con la barra del sistema */}
        <div style={{ height: '16px' }} />
      </div>
    </>
  );
}
