import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

// The 6 label profiles matching zplGenerator.js
const LABEL_PROFILES = [
  {
    id: 'PERFIL_PORTAOBJETOS',
    title: '🔬 Portaobjetos',
    desc: 'Etiqueta resistente (30×15mm)',
    group: 'Grupo 1 — Chico (30×15mm)',
    groupKey: 1,
    widthMM: 30, heightMM: 15,
    zplWidth: 240, zplHeight: 120,
    qrSize: 3, fontSize: { id: '6pt', name: '5pt', meta: '4.5pt' },
    qrMM: 10,
  },
  {
    id: 'PERFIL_MICRO_TUBOS',
    title: '🧪 Micro Tubos',
    desc: 'Eppendorf / Crioviales (30×15mm)',
    group: 'Grupo 1 — Chico (30×15mm)',
    groupKey: 1,
    widthMM: 30, heightMM: 15,
    zplWidth: 240, zplHeight: 120,
    qrSize: 3, fontSize: { id: '6pt', name: '5pt', meta: '4.5pt' },
    qrMM: 10,
  },
  {
    id: 'PERFIL_SLIM_PETRI',
    title: '🧫 Petri / Falcon',
    desc: 'Placas y tubos cónicos (30×15mm)',
    group: 'Grupo 1 — Chico (30×15mm)',
    groupKey: 1,
    widthMM: 30, heightMM: 15,
    zplWidth: 240, zplHeight: 120,
    qrSize: 3, fontSize: { id: '6pt', name: '5pt', meta: '4.5pt' },
    qrMM: 10,
  },
  {
    id: 'PERFIL_MEDIO_ESTANDAR',
    title: '🫙 Medio Estándar',
    desc: 'Frascos de vidrio / Nescafé (100×150mm)',
    group: 'Grupo 2 — Grande (100×150mm)',
    groupKey: 2,
    widthMM: 100, heightMM: 150,
    zplWidth: 812, zplHeight: 1218,
    qrSize: 10, fontSize: { id: '16pt', name: '14pt', meta: '12pt' },
    qrMM: 50,
  },
  {
    id: 'PERFIL_MAXI_BOLSA',
    title: '🛍️ Bolsa de Sustrato',
    desc: 'Bolsas grandes, código de barras (100×150mm)',
    group: 'Grupo 2 — Grande (100×150mm)',
    groupKey: 2,
    widthMM: 100, heightMM: 150,
    zplWidth: 812, zplHeight: 1218,
    qrSize: 10, fontSize: { id: '16pt', name: '14pt', meta: '12pt' },
    qrMM: 50,
  },
  {
    id: 'PERFIL_MAPA_GRADILLA',
    title: '🗺️ Mapa Gradilla',
    desc: 'Reporte para tapas de cajas (100×150mm)',
    group: 'Grupo 2 — Grande (100×150mm)',
    groupKey: 2,
    widthMM: 100, heightMM: 150,
    zplWidth: 812, zplHeight: 1218,
    qrSize: 10, fontSize: { id: '16pt', name: '14pt', meta: '12pt' },
    qrMM: 50,
  },
];

export default function PrintLabelsModal({ batches, onClose }) {
  const [mode, setMode] = useState('thermal'); // 'thermal' or 'a4'
  const [selectedProfile, setSelectedProfile] = useState(null);

  const handlePrint = () => {
    window.print();
  };

  const generateZPL = () => {
    if (!selectedProfile) return '';
    let zpl = '';

    batches.forEach(batch => {
      const qrData = batch.id;
      const alias = batch.alias || batch.cepa || batch.especie || 'N/A';
      const nombre = (batch.nombre_receta || batch.substrate || '').substring(0, 30);
      const meta1 = batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '';
      const meta2 = batch.medio_origen_alias || (batch.id ? batch.id.slice(-4) : '');

      zpl += '^XA\n';
      zpl += '^CI28\n';
      zpl += `^PW${selectedProfile.zplWidth}\n^LL${selectedProfile.zplHeight}\n`;

      if (selectedProfile.groupKey === 1) {
        // Small labels (30x15mm)
        zpl += `^FO10,10^BQN,2,${selectedProfile.qrSize}^FDQA,${qrData}^FS\n`;
        zpl += `^FO110,15^A0N,20,18^FD${alias.substring(0, 12)}^FS\n`;
        zpl += `^FO110,45^A0N,16,14^FD${nombre.substring(0, 14)}^FS\n`;
        zpl += `^FO110,70^A0N,14,12^FD${meta1}^FS\n`;
      } else {
        // Large labels (100x150mm)
        zpl += `^FO250,100^BQN,2,${selectedProfile.qrSize}^FDQA,${qrData}^FS\n`;
        zpl += `^FO50,500^A0N,60,60^FDID: ${alias}^FS\n`;
        zpl += `^FO50,580^A0N,45,45^FDDesc: ${nombre}^FS\n`;
        zpl += `^FO50,650^A0N,40,40^FDFecha: ${meta1}^FS\n`;
        zpl += `^FO50,720^A0N,40,40^FDRef: ${meta2}^FS\n`;

        if (selectedProfile.id === 'PERFIL_MAXI_BOLSA') {
          zpl += `^FO50,820^BCN,100,Y,N,N^FD${batch.barcode || qrData}^FS\n`;
        }
      }

      zpl += '^XZ\n\n';
    });

    return zpl;
  };

  const handleDownloadZPL = () => {
    const zpl = generateZPL();
    if (!zpl) {
      alert('Seleccioná un perfil de etiqueta primero.');
      return;
    }
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas_${selectedProfile.id}_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const group1 = LABEL_PROFILES.filter(p => p.groupKey === 1);
  const group2 = LABEL_PROFILES.filter(p => p.groupKey === 2);

  return (
    <div className="modal-overlay no-print">
      <div className="modal-box" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>🖨️ Centro de Impresión de Etiquetas</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '12px' }}>
          <button
            className={`btn ${mode === 'thermal' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('thermal')}
          >
            📟 Modo Térmico (Zebra)
          </button>
          <button
            className={`btn ${mode === 'a4' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('a4')}
          >
            📄 Modo Hoja A4
          </button>
        </div>

        {mode === 'thermal' && (
          <>
            {/* Profile Selector - Group 1 */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ color: 'var(--accent-color)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                📏 Grupo 1 — Chico (30×15mm)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {group1.map(profile => (
                  <div
                    key={profile.id}
                    onClick={() => setSelectedProfile(profile)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: selectedProfile?.id === profile.id
                        ? '2px solid var(--accent-color)'
                        : '2px solid var(--border-color)',
                      background: selectedProfile?.id === profile.id
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{profile.title.split(' ')[0]}</div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {profile.title.split(' ').slice(1).join(' ')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{profile.desc.split('(')[0].trim()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile Selector - Group 2 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ color: 'var(--primary-color)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                📐 Grupo 2 — Grande (100×150mm)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {group2.map(profile => (
                  <div
                    key={profile.id}
                    onClick={() => setSelectedProfile(profile)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: selectedProfile?.id === profile.id
                        ? '2px solid var(--primary-color)'
                        : '2px solid var(--border-color)',
                      background: selectedProfile?.id === profile.id
                        ? 'rgba(59, 130, 246, 0.1)'
                        : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{profile.title.split(' ')[0]}</div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {profile.title.split(' ').slice(1).join(' ')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{profile.desc.split('(')[0].trim()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Download Button */}
            <button
              className="btn btn-primary"
              onClick={handleDownloadZPL}
              disabled={!selectedProfile}
              style={{
                width: '100%',
                backgroundColor: selectedProfile ? '#10b981' : '#475569',
                marginBottom: '1rem',
                opacity: selectedProfile ? 1 : 0.5,
              }}
            >
              {selectedProfile
                ? `⬇️ Descargar ZPL — ${selectedProfile.title}`
                : '⬆️ Seleccioná un perfil de etiqueta arriba'}
            </button>
          </>
        )}

        {/* Preview Area */}
        <div style={{
          background: '#f1f5f9',
          padding: '1.5rem',
          borderRadius: '12px',
          maxHeight: '400px',
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          {mode === 'thermal' && selectedProfile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {batches.map(batch => {
                const isSmall = selectedProfile.groupKey === 1;
                const previewW = isSmall ? '80mm' : '100mm';
                const previewH = isSmall ? '40mm' : '150mm';
                const alias = batch.alias || batch.cepa || batch.especie || 'N/A';
                const nombre = batch.nombre_receta || batch.substrate || '';
                const meta1 = batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '';
                const meta2 = batch.medio_origen_alias || (batch.id ? batch.id.slice(-4) : '');

                return (
                  <div key={batch.id} style={{
                    width: previewW,
                    height: previewH,
                    background: 'white',
                    color: 'black',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: isSmall ? '2mm' : '5mm',
                    display: 'flex',
                    flexDirection: isSmall ? 'row' : 'column',
                    alignItems: isSmall ? 'center' : 'center',
                    gap: isSmall ? '3mm' : '5mm',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}>
                    <div style={{
                      width: isSmall ? '25mm' : '50mm',
                      height: isSmall ? '25mm' : '50mm',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <QRCodeSVG value={batch.id} size={isSmall ? 70 : 150} level="M" />
                    </div>
                    <div style={{
                      flex: 1,
                      overflow: 'hidden',
                      textAlign: isSmall ? 'left' : 'center',
                      lineHeight: 1.2,
                      minWidth: 0,
                    }}>
                      <div style={{
                        fontSize: selectedProfile.fontSize.id,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>{alias}</div>
                      <div style={{
                        fontSize: selectedProfile.fontSize.name,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '1pt',
                      }}>{nombre}</div>
                      <div style={{
                        fontSize: selectedProfile.fontSize.meta,
                        color: '#666',
                        marginTop: '2pt',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {meta1}{!isSmall && ` | ${meta2}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'thermal' && !selectedProfile && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>👆</div>
              <p style={{ color: '#64748b' }}>Seleccioná un perfil de etiqueta para ver la vista previa</p>
            </div>
          )}

          {mode === 'a4' && (
            <div style={{
              width: '210mm',
              minHeight: '297mm',
              background: 'white',
              padding: '10mm',
              boxSizing: 'border-box',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(10, 1fr)',
              gap: '2mm',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}>
              {[...Array(30)].map((_, i) => {
                const batch = batches[i % batches.length];
                if (!batch) return <div key={i} style={{ border: '1px dashed #ccc' }}></div>;
                return (
                  <div key={i} style={{
                    border: '1px solid #ddd',
                    padding: '2mm',
                    display: 'flex',
                    gap: '2mm',
                    alignItems: 'center',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ flexShrink: 0 }}>
                      <QRCodeSVG value={batch.id} size={55} level="M" />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', lineHeight: 1.1 }}>
                      <div style={{ fontSize: '7pt', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {batch.alias || batch.cepa}
                      </div>
                      <div style={{ fontSize: '6pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {batch.nombre_receta || batch.substrate}
                      </div>
                      <div style={{ fontSize: '5pt', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ Imprimir PDF (Navegador)</button>
        </div>
      </div>

      {/* PRINT-ONLY ELEMENTS */}
      <div className="print-only">
        {mode === 'thermal' && selectedProfile ? (
          <div>
            {batches.map(batch => {
              const isSmall = selectedProfile.groupKey === 1;
              return (
                <div key={batch.id} className="etiqueta-lab print-label-area" style={{
                  width: isSmall ? '30mm' : '100mm',
                  height: isSmall ? '15mm' : '150mm',
                  flexDirection: isSmall ? 'row' : 'column',
                }}>
                  <div className="etiqueta-qr" style={{ width: isSmall ? '12mm' : '40mm', height: isSmall ? '12mm' : '40mm' }}>
                    <QRCodeSVG value={batch.id} size={isSmall ? 40 : 120} />
                  </div>
                  <div className="etiqueta-info">
                    <div className="etiqueta-id" style={{ fontSize: isSmall ? '6pt' : '14pt' }}>{batch.alias || batch.cepa}</div>
                    <div className="etiqueta-nombre" style={{ fontSize: isSmall ? '5pt' : '12pt' }}>{batch.nombre_receta || batch.substrate}</div>
                    <div className="etiqueta-meta" style={{ fontSize: isSmall ? '4.5pt' : '10pt' }}>
                      {batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="a4-print-layout" style={{
            width: '210mm',
            height: '297mm',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(10, 1fr)',
            gap: '2mm',
            padding: '10mm',
          }}>
            {[...Array(30)].map((_, i) => {
              const batch = batches[i % batches.length];
              if (!batch) return <div key={i}></div>;
              return (
                <div key={i} className="etiqueta-lab">
                  <div className="etiqueta-qr">
                    <QRCodeSVG value={batch.id} size={65} />
                  </div>
                  <div className="etiqueta-info">
                    <div className="etiqueta-id">{batch.alias}</div>
                    <div className="etiqueta-nombre">{batch.nombre_receta}</div>
                    <div className="etiqueta-meta">
                      {batch.trazabilidad?.fecha_preparacion}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
