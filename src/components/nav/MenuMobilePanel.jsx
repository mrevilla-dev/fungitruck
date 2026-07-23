import { useNavigate, useLocation } from 'react-router-dom';
import { MENU_GROUPS } from '../../config/menuItems';
import PropTypes from 'prop-types';

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

        {/* Grupos de módulos */}
        {MENU_GROUPS.map(grupo => (
          <div key={grupo.id} style={{ marginBottom: '16px' }}>
            {/* Título del grupo */}
            <div style={{
              fontSize: '13px',
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              paddingLeft: '4px',
            }}>
              {grupo.icono} {grupo.label}
            </div>

            {/* Grilla de items del grupo */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}>
              {grupo.items.map(item => {
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

            {/* Sub-grupos (ej: Investigación dentro de Cultivo) */}
            {grupo.subgrupos && grupo.subgrupos.map(sub => (
              <div key={sub.id} style={{ marginTop: '12px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                  paddingLeft: '12px',
                  opacity: 0.8,
                }}>
                  {sub.icono} {sub.label}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                }}>
                  {sub.items.map(item => {
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
              </div>
            ))}
          </div>
        ))}

        {/* Espacio inferior para no tapar con la barra del sistema */}
        <div style={{ height: '16px' }} />
      </div>
    </>
  );
}

MenuMobilePanel.propTypes = {
  abierto: PropTypes.bool.isRequired,
  onCerrar: PropTypes.func.isRequired,
};
