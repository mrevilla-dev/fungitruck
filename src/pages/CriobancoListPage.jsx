/**
 * CriobancoListPage.jsx
 * Bloque 4 — Lista de crioviales con filtros y KPIs
 * FungiTrack · 2026
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCrioviales } from '../services/criobancService';
import MapaCriobanco from '../components/criobanco/MapaCriobanco';

const ESTADOS = ['Criopreservado', 'Parcialmente usado', 'Agotado'];
const TEMPERATURAS = ['4°C', '-20°C', '-80°C', '-196°C (N₂ líquido)'];

const ESTADO_CONFIG = {
  'Criopreservado':     { color: '#10b981', badge: '🟢', bg: '#10b98120' },
  'Parcialmente usado': { color: '#f59e0b', badge: '🟡', bg: '#f59e0b20' },
  'Agotado':            { color: '#ef4444', badge: '🔴', bg: '#ef444420' },
};

export default function CriobancoListPage() {
  const navigate = useNavigate();

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [crioviales, setCrioviales] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [vista, setVista]           = useState('lista'); // 'lista' | 'mapa'

  // Filtros
  const [busqueda, setBusqueda]         = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroEspecie, setFiltroEspecie] = useState('');
  const [filtroTemp, setFiltroTemp]     = useState('todos');
  const [filtroEquipo, setFiltroEquipo] = useState('');

  // ── Carga de datos ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCrioviales()
      .then(data => { if (!cancelled) setCrioviales(data); })
      .catch(e   => { if (!cancelled) setError(e?.message ?? 'Error al cargar crioviales'); })
      .finally(  () => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Filtrado en memoria ────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return crioviales.filter(c => {
      const matchBusqueda = !q ||
        (c.id?.toLowerCase().includes(q)) ||
        (c.especie?.toLowerCase().includes(q)) ||
        (c.cepa?.toLowerCase().includes(q)) ||
        (c.ubicacion_actual?.equipo?.toLowerCase().includes(q));

      const matchEstado  = filtroEstado  === 'todos' || c.estado === filtroEstado;
      const matchEspecie = !filtroEspecie || (c.especie?.toLowerCase().includes(filtroEspecie.toLowerCase()));
      const matchTemp    = filtroTemp    === 'todos' || c.temperatura_almacenamiento === filtroTemp;
      const matchEquipo  = !filtroEquipo || (c.ubicacion_actual?.equipo?.toLowerCase().includes(filtroEquipo.toLowerCase()));

      return matchBusqueda && matchEstado && matchEspecie && matchTemp && matchEquipo;
    });
  }, [crioviales, busqueda, filtroEstado, filtroEspecie, filtroTemp, filtroEquipo]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:            crioviales.length,
    criopreservados:  crioviales.filter(c => c.estado === 'Criopreservado').length,
    parcialmente:     crioviales.filter(c => c.estado === 'Parcialmente usado').length,
    agotados:         crioviales.filter(c => c.estado === 'Agotado').length,
  }), [crioviales]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Módulo
          </p>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '2rem', fontWeight: '800' }}>🧊 Criobanco</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Gestión de crioviales y eventos de criopreservación
          </p>
        </div>
        {/* Toggle vista */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            id="criobanco-btn-lista"
            onClick={() => setVista('lista')}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)',
              cursor: 'pointer', fontWeight: vista === 'lista' ? '700' : '400',
              background: vista === 'lista' ? 'var(--primary-color)' : 'var(--surface-color)',
              color: vista === 'lista' ? '#fff' : 'var(--text-color)',
              transition: 'all 0.2s',
            }}
          >
            ☰ Lista
          </button>
          <button
            id="criobanco-btn-mapa"
            onClick={() => setVista('mapa')}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)',
              cursor: 'pointer', fontWeight: vista === 'mapa' ? '700' : '400',
              background: vista === 'mapa' ? 'var(--primary-color)' : 'var(--surface-color)',
              color: vista === 'mapa' ? '#fff' : 'var(--text-color)',
              transition: 'all 0.2s',
            }}
          >
            🗺️ Mapa
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#ef4444', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total crioviales', value: kpis.total,           color: 'var(--primary-color)', emoji: '🧬' },
          { label: 'Criopreservados',  value: kpis.criopreservados, color: '#10b981',              emoji: '🟢' },
          { label: 'Parcial. usados',  value: kpis.parcialmente,    color: '#f59e0b',              emoji: '🟡' },
          { label: 'Agotados',         value: kpis.agotados,        color: '#ef4444',              emoji: '🔴' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '1.25rem', borderTop: `3px solid ${k.color}`, marginBottom: 0 }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{k.emoji}</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.25rem' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── VISTA MAPA ─────────────────────────────── */}
      {vista === 'mapa' && (
        <MapaCriobanco crioviales={crioviales} />
      )}

      {/* ── VISTA LISTA ───────────────────────────────────────────────────── */}
      {vista === 'lista' && (
        <>
          {/* Filtros */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label">Buscar (ID, especie, cepa, equipo)</label>
                <input
                  id="criobanco-busqueda"
                  type="text"
                  className="form-control"
                  placeholder="Ej: CRV-COR..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Estado</label>
                <select
                  id="criobanco-filtro-estado"
                  className="form-control"
                  value={filtroEstado}
                  onChange={e => setFiltroEstado(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Especie</label>
                <input
                  id="criobanco-filtro-especie"
                  type="text"
                  className="form-control"
                  placeholder="Ej: militaris"
                  value={filtroEspecie}
                  onChange={e => setFiltroEspecie(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Temperatura</label>
                <select
                  id="criobanco-filtro-temp"
                  className="form-control"
                  value={filtroTemp}
                  onChange={e => setFiltroTemp(e.target.value)}
                >
                  <option value="todos">Todas</option>
                  {TEMPERATURAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Equipo</label>
                <input
                  id="criobanco-filtro-equipo"
                  type="text"
                  className="form-control"
                  placeholder="Ej: Freezer -80°C"
                  value={filtroEquipo}
                  onChange={e => setFiltroEquipo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              🔄 Cargando crioviales...
            </div>
          )}

          {/* Estado vacío */}
          {!loading && crioviales.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧊</div>
              <h3 style={{ margin: '0 0 0.5rem' }}>No hay crioviales registrados</h3>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>
                Para crear crioviales, marcá batches como "Destinado a criopreservación" desde el Inventario
                o usá el botón 🧊 en la ficha de un Ejemplar.
              </p>
              <button
                className="btn btn-outline"
                style={{ width: 'auto' }}
                onClick={() => navigate('/inventario')}
              >
                Ir a Inventario
              </button>
            </div>
          )}

          {/* Sin resultados de filtros */}
          {!loading && crioviales.length > 0 && filtrados.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <p>No se encontraron crioviales con los filtros aplicados.</p>
              <button
                className="btn btn-outline"
                style={{ width: 'auto', marginTop: '0.5rem' }}
                onClick={() => { setBusqueda(''); setFiltroEstado('todos'); setFiltroEspecie(''); setFiltroTemp('todos'); setFiltroEquipo(''); }}
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {/* Lista */}
          {!loading && filtrados.length > 0 && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {/* Cabecera */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1.5fr 0.8fr 1fr',
                padding: '0.4rem 1.25rem',
                fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <span>ID / Especie</span>
                <span>Soporte / Vol.</span>
                <span>Temperatura</span>
                <span>Ubicación</span>
                <span>Estado</span>
                <span style={{ textAlign: 'right' }}>Acciones</span>
              </div>

              {filtrados.map(criovial => {
                const cfg = ESTADO_CONFIG[criovial.estado] ?? { color: '#666', badge: '⚪', bg: '#66666620' };
                const ubi = criovial.ubicacion_actual ?? {};
                return (
                  <div
                    key={criovial._docId ?? criovial.id}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      marginBottom: 0,
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1.5fr 0.8fr 1fr',
                      alignItems: 'center',
                      borderLeft: `4px solid ${cfg.color}`,
                    }}
                  >
                    {/* ID / Especie */}
                    <div>
                      <strong style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.85rem', color: cfg.color }}>
                        {criovial.id ?? criovial._docId}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-color)' }}>
                        {criovial.genero ?? ''} {criovial.especie ?? ''}
                        {criovial.cepa ? ` (${criovial.cepa})` : ''}
                      </span>
                      {criovial.fecha_criopreservacion && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          📅 {criovial.fecha_criopreservacion}
                        </span>
                      )}
                    </div>

                    {/* Soporte / Volumen */}
                    <div style={{ fontSize: '0.85rem' }}>
                      <span style={{ display: 'block' }}>{criovial.soporte ?? '—'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {criovial.volumen_ml ?? '—'} ml
                      </span>
                    </div>

                    {/* Temperatura */}
                    <div>
                      <span style={{
                        display: 'inline-block', fontSize: '0.72rem', fontWeight: '700',
                        padding: '3px 8px', borderRadius: '12px',
                        background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                      }}>
                        {criovial.temperatura_almacenamiento ?? '—'}
                      </span>
                    </div>

                    {/* Ubicación */}
                    <div style={{ fontSize: '0.8rem' }}>
                      {ubi.equipo ? (
                        <>
                          <span style={{ display: 'block', fontWeight: '600' }}>{ubi.equipo}</span>
                          {ubi.contenedor && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {ubi.contenedor}{ubi.posicion ? ` · ${ubi.posicion}` : ''}
                            </span>
                          )}
                          <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            {ubi.modo ?? ''}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.8rem' }}>Sin ubicación</span>
                      )}
                    </div>

                    {/* Estado badge */}
                    <div>
                      <span style={{
                        display: 'inline-block', fontSize: '0.7rem', fontWeight: '700',
                        padding: '4px 10px', borderRadius: '20px',
                        background: cfg.bg, color: cfg.color,
                      }}>
                        {cfg.badge} {criovial.estado ?? 'Sin estado'}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        className="btn-icon"
                        title="Ver detalle"
                        onClick={() => navigate('/criobanco/criovial/' + (criovial.id ?? criovial._docId))}
                      >
                        🔍
                      </button>
                      {criovial.estado === 'Criopreservado' && (
                        <button
                          className="btn-icon"
                          title="Registrar descongelación"
                          style={{ color: '#f59e0b' }}
                          onClick={() => navigate('/criobanco/criovial/' + (criovial.id ?? criovial._docId))}
                        >
                          🌡️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
