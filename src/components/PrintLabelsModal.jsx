import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { createPortal } from 'react-dom';


export default function PrintLabelsModal({ batches, onClose }) {
  const [mode, setMode] = useState('thermal'); // 'thermal' or 'a4'
  const [profile, setProfile] = useState('standard'); // 'standard' or 'micro'

  const handlePrint = () => {
    // Aplicar clase al html para el tamaño de @page
    document.documentElement.className = profile === 'micro' ? 'print-micro' : 'print-standard';
    window.print();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    // Asumiendo formato YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };


  return (
    <>
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

        {mode === 'thermal' && (
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', padding: '0 1rem' }}>
            <button 
              className={`btn ${profile === 'standard' ? 'btn-primary' : 'btn-outline'}`} 
              style={{ flex: 1, fontSize: '0.8rem' }}
              onClick={() => setProfile('standard')}
            >
              📏 Standard (50x25mm)
            </button>
            <button 
              className={`btn ${profile === 'micro' ? 'btn-primary' : 'btn-outline'}`} 
              style={{ flex: 1, fontSize: '0.8rem' }}
              onClick={() => setProfile('micro')}
            >
              🧪 Micro (12x12mm)
            </button>
          </div>
        )}


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
            <div className="labels-preview-thermal" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {batches.map(batch => (
                profile === 'standard' ? (
                  <div key={batch.id} className="thermal-label" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #ddd' }}>
                    <div className="thermal-qr">
                      <QRCodeSVG value={batch.id} size={65} level="L" marginSize={0} />
                    </div>
                    <div className="thermal-info">
                      <div className="thermal-id">{batch.id}</div>
                      <div className="thermal-name">{batch.nombre_insumo || batch.especie}</div>
                      <div className="thermal-meta">
                        {formatDate(batch.fecha)}
                        {batch.fecha_vencimiento && ` | Ven: ${formatDate(batch.fecha_vencimiento)}`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={batch.id} className="micro-label" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #ddd' }}>
                    <QRCodeSVG value={batch.id} size={40} level="L" marginSize={0} />
                  </div>
                )
              ))}
            </div>
          )}


          {/* Vista Previa A4 (Mantener clases originales o adaptar si es necesario) */}
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
              {[...Array(30)].map((_, i) => {
                const batch = batches[i % batches.length];
                if (!batch) return <div key={i} style={{ border: '1px dashed #ccc' }}></div>;
                return (
                  <div key={i} className="thermal-label" style={{ border: '1px solid #ddd', width: '100%', height: '100%' }}>
                    <div className="thermal-qr">
                      <QRCodeSVG value={batch.id} size={50} level="M" />
                    </div>
                    <div className="thermal-info">
                      <div className="thermal-id" style={{ fontSize: '7pt' }}>{batch.alias || batch.id}</div>
                      <div className="thermal-name" style={{ fontSize: '6pt' }}>{batch.nombre_receta || batch.nombre_insumo || `${batch.genero} ${batch.especie}`}</div>
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
    </div>

    {/* ELEMENTOS REALES PARA IMPRESIÓN (OCULTOS EN WEB) */}

    {createPortal(
      <div className="print-only">
        {mode === 'thermal' ? (
          <div className="thermal-print-layout">
            {batches.map(batch => (
              profile === 'standard' ? (
                <div key={batch.id} className="thermal-label">
                  <div className="thermal-qr">
                    <QRCodeSVG value={batch.id} size={65} level="L" marginSize={0} />
                  </div>
                  <div className="thermal-info">
                    <div className="thermal-id">{batch.id}</div>
                    <div className="thermal-name">{batch.nombre_insumo || batch.especie}</div>
                    <div className="thermal-meta">
                      {formatDate(batch.fecha)}
                      {batch.fecha_vencimiento && ` | Ven: ${formatDate(batch.fecha_vencimiento)}`}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={batch.id} className="micro-label">
                  <QRCodeSVG value={batch.id} size={42} level="L" marginSize={0} />
                </div>
              )
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
                  <div key={i} className="thermal-label" style={{ width: '100%', height: '100%' }}>
                    <div className="thermal-qr">
                      <QRCodeSVG value={batch.id} size={50} />
                    </div>
                    <div className="thermal-info">
                      <div className="thermal-id">{batch.alias || batch.id}</div>
                      <div className="thermal-name">{batch.nombre_receta || batch.nombre_insumo || `${batch.genero} ${batch.especie}`}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>,
      document.getElementById('print-root')
    )}


    </>
  );
}

