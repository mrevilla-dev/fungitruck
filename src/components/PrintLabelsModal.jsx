import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

export default function PrintLabelsModal({ batches, onClose }) {
  const [mode, setMode] = useState('thermal'); // 'thermal' or 'a4'

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay no-print">
      <div className="modal-box" style={{ maxWidth: '800px', width: '95%' }}>
        <div className="modal-header">
          <h3>🖨️ Centro de Impresión de Etiquetas</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
          <button 
            className={`btn ${mode === 'thermal' ? 'btn-primary' : 'btn-outline'}`} 
            style={{ flex: 1 }}
            onClick={() => setMode('thermal')}
          >
            📟 Modo Térmico (50x25mm)
          </button>
          <button 
            className={`btn ${mode === 'a4' ? 'btn-primary' : 'btn-outline'}`} 
            style={{ flex: 1 }}
            onClick={() => setMode('a4')}
          >
            📄 Modo Hoja A4 (Grilla 3x10)
          </button>
        </div>

        <div className="print-preview-container" style={{ 
          background: '#f1f5f9', 
          padding: '2rem', 
          borderRadius: '12px', 
          maxHeight: '500px', 
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center'
        }}>
          {/* Vista Previa Térmica */}
          {mode === 'thermal' && (
            <div className="labels-preview-thermal" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {batches.map(batch => (
                <div key={batch.id} className="etiqueta-lab" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  <div className="etiqueta-qr">
                    <QRCodeSVG value={batch.id} size={75} level="M" />
                  </div>
                  <div className="etiqueta-info">
                    <div className="etiqueta-id">{batch.alias}</div>
                    <div className="etiqueta-nombre">{batch.nombre_receta}</div>
                    <div className="etiqueta-meta">
                      {batch.trazabilidad.fecha_preparacion} <br />
                      {batch.variables_experimentales ? 
                        Object.entries(batch.variables_experimentales).map(([k, v]) => `${k}: ${v}`).join(', ') : 
                        `Lote: ${batch.id.slice(-4)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vista Previa A4 */}
          {mode === 'a4' && (
            <div className="a4-sheet" style={{ 
              width: '210mm', 
              minHeight: '297mm', 
              background: 'white', 
              padding: '10mm', 
              boxSizing: 'border-box',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(10, 1fr)',
              gap: '2mm',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              {/* Repetimos las etiquetas de los lotes creados hasta llenar la grilla o terminar los lotes */}
              {[...Array(30)].map((_, i) => {
                const batch = batches[i % batches.length];
                if (!batch) return <div key={i} style={{ border: '1px dashed #ccc' }}></div>;
                return (
                  <div key={i} className="etiqueta-lab" style={{ border: '1px solid #ddd', width: '100%', height: '100%' }}>
                    <div className="etiqueta-qr">
                      <QRCodeSVG value={batch.id} size={65} level="M" />
                    </div>
                    <div className="etiqueta-info">
                      <div className="etiqueta-id" style={{ fontSize: '7pt' }}>{batch.alias}</div>
                      <div className="etiqueta-nombre" style={{ fontSize: '6pt' }}>{batch.nombre_receta}</div>
                      <div className="etiqueta-meta" style={{ fontSize: '5pt' }}>
                        {batch.trazabilidad.fecha_preparacion} <br />
                        {batch.variables_experimentales ? 
                          Object.entries(batch.variables_experimentales)[0]?.join(': ') : 
                          `ID: ${batch.id.slice(-4)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ Mandar a Impresora</button>
        </div>
      </div>

      {/* ELEMENTOS REALES PARA IMPRESIÓN (OCULTOS EN WEB) */}
      <div className="print-only">
        {mode === 'thermal' ? (
          <div className="thermal-print-layout">
            {batches.map(batch => (
              <div key={batch.id} className="etiqueta-lab print-label-area">
                <div className="etiqueta-qr">
                  <QRCodeSVG value={batch.id} size={75} />
                </div>
                <div className="etiqueta-info">
                  <div className="etiqueta-id">{batch.alias}</div>
                  <div className="etiqueta-nombre">{batch.nombre_receta}</div>
                  <div className="etiqueta-meta">
                    {batch.trazabilidad.fecha_preparacion} | {batch.id.slice(-4)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="a4-print-layout" style={{ 
            width: '210mm', 
            height: '297mm', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gridTemplateRows: 'repeat(10, 1fr)',
            gap: '2mm',
            padding: '10mm'
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
                        {batch.trazabilidad.fecha_preparacion}
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
