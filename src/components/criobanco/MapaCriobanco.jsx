import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const ESTADO_CONFIG = {
  'Criopreservado':     { color: '#10b981', badge: '🟢', bg: '#10b98120' },
  'Parcialmente usado': { color: '#f59e0b', badge: '🟡', bg: '#f59e0b20' },
  'Agotado':            { color: '#ef4444', badge: '🔴', bg: '#ef444420' },
};

export default function MapaCriobanco({ crioviales = [] }) {
  const navigate = useNavigate();

  // Extract unique equipos
  const equipos = useMemo(() => {
    const eqSet = new Set();
    crioviales.forEach(c => {
      if (c.ubicacion_actual?.equipo) {
        eqSet.add(c.ubicacion_actual.equipo);
      }
    });
    return Array.from(eqSet).sort();
  }, [crioviales]);

  const [equipoSeleccionado, setEquipoSeleccionado] = useState(equipos.length > 0 ? equipos[0] : '');
  const [panelAbierto, setPanelAbierto] = useState(null);

  // Auto-select first equipo if available and not set
  React.useEffect(() => {
    if (equipos.length > 0 && !equipos.includes(equipoSeleccionado)) {
      setEquipoSeleccionado(equipos[0]);
    }
  }, [equipos, equipoSeleccionado]);

  // Filter crioviales for selected equipo
  const criovialesEquipo = useMemo(() => {
    return crioviales.filter(c => c.ubicacion_actual?.equipo === equipoSeleccionado);
  }, [crioviales, equipoSeleccionado]);

  // Infer mode from the first criovial (assuming all in the same equipo use the same mode, or at least the mode is defined at the equipo/contenedor level)
  const modo = useMemo(() => {
    if (criovialesEquipo.length === 0) return 'libre';
    return criovialesEquipo[0].ubicacion_actual?.modo === 'rack' ? 'rack' : 'libre';
  }, [criovialesEquipo]);

  // Group by contenedor for rendering
  const contenedores = useMemo(() => {
    const grupos = {};
    criovialesEquipo.forEach(c => {
      const cont = c.ubicacion_actual?.contenedor || 'Sin contenedor';
      if (!grupos[cont]) {
        grupos[cont] = [];
      }
      grupos[cont].push(c);
    });
    return grupos;
  }, [criovialesEquipo]);

  if (equipos.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No hay equipos registrados en las ubicaciones de los crioviales.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', position: 'relative', minHeight: '400px', overflow: 'hidden' }}>
      
      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '1rem', transition: 'margin-right 0.3s', marginRight: panelAbierto ? '350px' : '0' }}>
        
        {/* Selector de equipo */}
        <div style={{ marginBottom: '1.5rem' }}>
          {equipos.length <= 5 ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {equipos.map(eq => (
                <button
                  key={eq}
                  onClick={() => { setEquipoSeleccionado(eq); setPanelAbierto(null); }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: equipoSeleccionado === eq ? 'var(--primary-color)' : 'var(--surface-color)',
                    color: equipoSeleccionado === eq ? '#fff' : 'var(--text-color)',
                    cursor: 'pointer',
                    fontWeight: equipoSeleccionado === eq ? 'bold' : 'normal',
                  }}
                >
                  {eq}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={equipoSeleccionado}
              onChange={(e) => { setEquipoSeleccionado(e.target.value); setPanelAbierto(null); }}
              className="form-control"
              style={{ maxWidth: '300px' }}
            >
              {equipos.map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          )}
        </div>

        {/* Mapa View */}
        <div>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Contenido de: <span style={{ color: 'var(--primary-color)' }}>{equipoSeleccionado}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '1rem', fontWeight: 'normal' }}>
              Modo: {modo.toUpperCase()}
            </span>
          </h3>

          {Object.keys(contenedores).length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>No hay crioviales en este equipo.</p>
          )}

          {modo === 'rack' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {Object.entries(contenedores).map(([nombreCont, viales]) => {
                // Find dimensions, fallback to 6x6
                let filas = 6;
                let columnas = 6;
                for (const v of viales) {
                  if (v.ubicacion_actual?.dimensiones) {
                    filas = v.ubicacion_actual.dimensiones.filas || 6;
                    columnas = v.ubicacion_actual.dimensiones.columnas || 6;
                    break;
                  }
                }
                const totalCeldas = filas * columnas;

                // Create a simple map of celdas, placing viales
                // For simplicity, we just fill the grid from left to right if no explicit coordinate
                // or we try to use a coordinate if it's "1", "2", etc.
                const gridData = Array(totalCeldas).fill(null);
                
                viales.forEach((v, idx) => {
                  let posIndex = idx;
                  if (v.ubicacion_actual?.posicion) {
                    const parsed = parseInt(v.ubicacion_actual.posicion, 10);
                    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalCeldas) {
                      posIndex = parsed - 1; // 1-based to 0-based
                    }
                  }
                  // find next available if taken
                  while (gridData[posIndex] && posIndex < totalCeldas) {
                    posIndex++;
                  }
                  if (posIndex < totalCeldas) {
                    gridData[posIndex] = v;
                  }
                });

                return (
                  <div key={nombreCont} className="card" style={{ padding: '1rem' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>📦 {nombreCont}</h4>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${columnas}, 1fr)`,
                      gap: '4px',
                      background: 'var(--surface-color)',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      maxWidth: 'fit-content'
                    }}>
                      {gridData.map((celda, i) => {
                        const bg = celda ? (ESTADO_CONFIG[celda.estado]?.bg || '#ccc') : '#f3f4f6';
                        const color = celda ? (ESTADO_CONFIG[celda.estado]?.color || '#333') : '#9ca3af';
                        const title = celda ? `ID: ${celda.id}\nEspecie: ${celda.especie}\nEstado: ${celda.estado}` : `Celda ${i+1} (Vacía)`;
                        return (
                          <div
                            key={i}
                            title={title}
                            onClick={() => { if (celda) setPanelAbierto(celda); }}
                            style={{
                              width: '40px',
                              height: '40px',
                              background: bg,
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: celda ? 'pointer' : 'default',
                              border: celda ? `1px solid ${color}` : '1px solid #e5e7eb',
                              fontSize: '0.6rem',
                              fontWeight: 'bold',
                              color: color,
                              boxShadow: celda ? 'inset 0 0 0 1px rgba(0,0,0,0.05)' : 'none'
                            }}
                          >
                            {celda ? (ESTADO_CONFIG[celda.estado]?.badge || '🦠') : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {modo === 'libre' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {Object.entries(contenedores).map(([nombreCont, viales]) => {
                
                // Group by sub_contenedor
                const subGrupos = {};
                viales.forEach(v => {
                  const sub = v.ubicacion_actual?.sub_contenedor || '';
                  if (!subGrupos[sub]) subGrupos[sub] = [];
                  subGrupos[sub].push(v);
                });

                return (
                  <details key={nombreCont} className="card" style={{ padding: '1rem', marginBottom: 0 }} open>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', outline: 'none' }}>
                      📦 {nombreCont} ({viales.length} crioviales)
                    </summary>
                    <div style={{ marginTop: '1rem', paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-color)' }}>
                      {Object.entries(subGrupos).map(([subCont, subViales]) => {
                        const renderViales = (lista) => (
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {lista.map(v => {
                              const cfg = ESTADO_CONFIG[v.estado] || { color: '#666', badge: '⚪' };
                              return (
                                <li key={v.id || v._docId} style={{ marginBottom: '0.5rem' }}>
                                  <button
                                    onClick={() => setPanelAbierto(v)}
                                    style={{
                                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
                                      fontFamily: 'inherit', fontSize: '0.9rem'
                                    }}
                                  >
                                    <span>{cfg.badge}</span>
                                    <span style={{ fontFamily: 'monospace', color: cfg.color, fontWeight: 'bold' }}>{v.id}</span>
                                    <span>- {v.genero} {v.especie}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        );

                        if (!subCont) {
                          return <div key="sin-sub" style={{ marginTop: '0.5rem' }}>{renderViales(subViales)}</div>;
                        }

                        return (
                          <details key={subCont} style={{ marginTop: '0.5rem' }} open>
                            <summary style={{ cursor: 'pointer', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                              📁 {subCont}
                            </summary>
                            <div style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                              {renderViales(subViales)}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Panel Lateral (Drawer) */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: panelAbierto ? 0 : '-350px',
        width: '350px',
        height: '100%',
        background: 'var(--surface-color)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: panelAbierto ? '-4px 0 15px rgba(0,0,0,0.05)' : 'none',
        transition: 'right 0.3s ease-in-out',
        padding: '1.5rem',
        overflowY: 'auto',
        zIndex: 10
      }}>
        {panelAbierto && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'monospace', color: 'var(--primary-color)' }}>{panelAbierto.id}</h3>
              <button
                onClick={() => setPanelAbierto(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
              <div>
                <strong>Especie:</strong><br />
                {panelAbierto.genero} {panelAbierto.especie} {panelAbierto.cepa ? `(${panelAbierto.cepa})` : ''}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <strong>Soporte:</strong><br />
                  {panelAbierto.soporte || '—'}
                </div>
                <div>
                  <strong>Volumen:</strong><br />
                  {panelAbierto.volumen_ml ? `${panelAbierto.volumen_ml} ml` : '—'}
                </div>
              </div>

              <div>
                <strong>Temperatura:</strong><br />
                {panelAbierto.temperatura_almacenamiento || '—'}
              </div>

              <div>
                <strong>Fecha:</strong><br />
                {panelAbierto.fecha_criopreservacion || '—'}
              </div>

              <div>
                <strong>Estado:</strong><br />
                {ESTADO_CONFIG[panelAbierto.estado]?.badge} {panelAbierto.estado || '—'}
              </div>
            </div>

            <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/criobanco/criovial/' + panelAbierto.id)}
              >
                🔍 Ver detalle completo
              </button>
              {panelAbierto.estado === 'Criopreservado' && (
                <button
                  className="btn"
                  style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                  onClick={() => navigate('/criobanco/criovial/' + panelAbierto.id + '/descongelar')}
                >
                  🌡️ Registrar descongelación
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
