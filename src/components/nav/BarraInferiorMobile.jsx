import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MenuMobilePanel from './MenuMobilePanel';

export default function BarraInferiorMobile() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const esDashboard = location.pathname === '/';
  const esEscanear = location.pathname === '/escanear';

  const estiloBoton = (activo) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '8px 4px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: activo ? '#4CAF50' : '#757575',
    gap: '2px',
    // Área táctil mínima
    minHeight: '56px',
  });

  return (
    <>
      <MenuMobilePanel
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      />

      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'var(--bg-color)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        zIndex: 100,
        // Soporte para notch de iPhone
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: 'none',
      }}>

        {/* Inicio */}
        <button
          style={estiloBoton(esDashboard)}
          onClick={() => navigate('/')}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }}>🏠</span>
          <span style={{ fontSize: '10px', fontWeight: esDashboard ? 'bold' : 'normal' }}>
            Inicio
          </span>
        </button>

        {/* Escanear — botón central destacado */}
        <button
          style={{
            ...estiloBoton(esEscanear),
            // Botón central más grande y destacado
            flex: 1.2,
          }}
          onClick={() => navigate('/escanear')}
        >
          <span style={{
            fontSize: '26px',
            lineHeight: 1,
            backgroundColor: '#4CAF50',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            📷
          </span>
          <span style={{ fontSize: '10px', color: '#4CAF50', fontWeight: 'bold' }}>
            Escanear
          </span>
        </button>

        {/* Menú */}
        <button
          style={estiloBoton(menuAbierto)}
          onClick={() => setMenuAbierto(true)}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }}>☰</span>
          <span style={{ fontSize: '10px', fontWeight: menuAbierto ? 'bold' : 'normal' }}>
            Menú
          </span>
        </button>

      </nav>

      {/* Espaciador para que el contenido no quede tapado por la barra */}
      <div style={{ height: '70px' }} />
    </>
  );
}
