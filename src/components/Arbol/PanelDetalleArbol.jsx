import React from 'react';
import { COLORES_ESTADO, ICONOS_NODO, getDriveEmbedUrl } from '../../utils/arbolConstants';
import { useNavigate } from 'react-router-dom';

export default function PanelDetalleArbol({ datos, onCerrar }) {
  const navigate = useNavigate();

  if (!datos) return null;

  const { tipo } = datos;

  // Header helpers
  const BadgeEstado = ({ estado }) => {
    if (!estado) return null;
    const color = COLORES_ESTADO[estado] || '#9E9E9E';
    return (
      <span style={{ 
        background: color, color: 'white', padding: '2px 8px', 
        borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' 
      }}>
        {estado}
      </span>
    );
  };

  const Header = ({ titulo, subtitulo, estado, icono }) => (
    <div style={{ borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {icono} {titulo}
          </h3>
          {subtitulo && <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>{subtitulo}</div>}
        </div>
        <button 
          onClick={onCerrar} 
          style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <BadgeEstado estado={estado} />
      </div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <h4 style={{ color: '#38bdf8', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{title}</h4>
      <div style={{ color: '#cbd5e1', fontSize: '0.9rem', display: 'grid', gap: '0.4rem' }}>
        {children}
      </div>
    </div>
  );

  const Field = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ fontWeight: '500', textAlign: 'right' }}>{value || '-'}</span>
    </div>
  );

  const CarruselFotos = ({ url }) => {
    if (!url) return null;
    return (
      <>
        {getDriveEmbedUrl(url) && (
          <Section title="Fotos">
            <div style={{ display: 'flex', overflowX: 'auto', gap: '0.5rem', paddingBottom: '0.5rem' }}>
              <img src={getDriveEmbedUrl(url)} alt="Foto principal" loading="lazy" style={{ height: '120px', borderRadius: '8px', objectFit: 'cover', marginBottom: '0.5rem' }} />
            </div>
          </Section>
        )}
      </>
    );
  };

  const renderBatch = () => (
    <>
      <Header 
        titulo={datos.id} 
        subtitulo={datos.tipoContenedor ? `Contenedor: ${datos.tipoContenedor}` : null}
        estado={datos.status} 
        icono={ICONOS_NODO[datos.tipoContenedor] || '🧫'} 
      />
      
      <Section title="Este Batch">
        <Field label="Medio Preparado" value={datos.medioPrepNombre} />
        <Field label="Sala / Destino" value={datos.salaDestino} />
        <Field label="Pasaje Número" value={`T${datos.numeroTransferencia}`} />
        <Field label="Fecha Inoculación" value={datos.fechaInoculacion} />
        <Field label="Operador" value={datos.operador} />
        {datos.experimento_id && <Field label="Experimento ID" value={datos.experimento_id} />}
      </Section>

      <CarruselFotos url={datos.fotoUrl} />

      <Section title="Acciones">
        <button className="btn btn-outline" style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem', padding: '0.5rem', borderColor: '#475569', color: '#cbd5e1' }} onClick={() => navigate('/escanear')}>
          🔍 Observar / Auditar
        </button>
        <button className="btn btn-outline" style={{ width: '100%', marginBottom: '0.5rem', fontSize: '0.85rem', padding: '0.5rem', borderColor: '#475569', color: '#cbd5e1' }} onClick={() => navigate('/print-queue')}>
          🖨️ Cola de Impresión
        </button>
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => navigate('/')}>
          👁️ Ir al inicio
        </button>
      </Section>
    </>
  );

  const renderEjemplar = () => (
    <>
      <Header 
        titulo={datos.id} 
        subtitulo={`${datos.genero} ${datos.especie} · Cepa: ${datos.cepa}`}
        estado={datos.estado} 
        icono={ICONOS_NODO[datos.tipoMaterial] || ICONOS_NODO['ejemplar']} 
      />

      <Section title="Identidad Genética">
        <Field label="Ploidía" value={datos.ploidia} />
        <Field label="Tipo Micelio" value={datos.tipoMicelio} />
        <Field label="MAT" value={datos.mat} />
      </Section>

      <Section title="Línea">
        <Field label="Generación" value={datos.generacion ? `G${datos.generacion}` : 'N/A'} />
        <Field label="Esporoma Origen" value={datos.esporomaOrigen} />
        <Field label="Batches" value={datos.batches?.length ?? 0} />
      </Section>

      <CarruselFotos url={datos.fotoUrl} />

      <Section title="Acciones">
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => navigate('/ejemplares')}>
          👁️ Ver catálogo de ejemplares
        </button>
      </Section>
    </>
  );

  const renderEsporoma = () => (
    <>
      <Header 
        titulo={datos.id} 
        subtitulo={`${datos.genero} ${datos.especie}`}
        icono={ICONOS_NODO['esporoma']} 
      />

      <Section title="Información">
        <Field label="Cepa" value={datos.cepa} />
        <Field label="Origen" value={datos.origen_material || '-'} />
        <Field label="Fecha Recolección" value={datos.fechaRecoleccion || '-'} />
      </Section>

      <CarruselFotos url={datos.fotoUrl} />

      <Section title="Acciones">
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => navigate('/esporomas')}>
          👁️ Ver catálogo de esporomas
        </button>
      </Section>
    </>
  );

  const renderCosecha = () => (
    <>
      <Header 
        titulo={`Cosecha #${datos.numeroOleada}`} 
        subtitulo={datos.id}
        icono={ICONOS_NODO['cosecha']} 
      />

      <Section title="Métricas">
        <Field label="Fecha" value={datos.fecha} />
        <Field label="Peso Fresco" value={`${datos.pesoFrescoG} g`} />
        {datos.ebOleada !== null && <Field label="EB Oleada" value={`${datos.ebOleada}%`} />}
        {datos.ebAcumulada !== null && <Field label="EB Acumulada" value={`${datos.ebAcumulada}%`} />}
      </Section>

      <Section title="Acciones">
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => navigate('/cosechas')}>
          👁️ Ver registro de cosechas
        </button>
      </Section>
    </>
  );

  const renderCrioResumen = () => (
    <>
      <Header 
        titulo="Criobanco" 
        subtitulo={`${datos.activos} de ${datos.total} viales activos`}
        icono={ICONOS_NODO['criovial']} 
      />

      <Section title="Acciones">
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={() => navigate('/criobanco')}>
          ❄️ Ir al Criobanco
        </button>
      </Section>
    </>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {tipo === 'batch' && renderBatch()}
      {tipo === 'ejemplar' && renderEjemplar()}
      {tipo === 'esporoma' && renderEsporoma()}
      {tipo === 'cosecha' && renderCosecha()}
      {tipo === 'crioResumen' && renderCrioResumen()}
    </div>
  );
}
