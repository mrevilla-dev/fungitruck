import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { createPortal } from 'react-dom';


export default function PrintLabelsModal({ batches, onClose }) {
  const [mode, setMode] = useState('thermal'); // 'thermal' or 'a4'
  const [zplSize, setZplSize] = useState('large'); // for ZPL
  const [profile, setProfile] = useState('standard'); // for PDF


  const handlePrint = () => {
    // Aplicar clase al html para el tamaño de @page
    document.documentElement.className = profile === 'micro' ? 'print-micro' : 'print-standard';
    window.print();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const generateZPL = () => {
    let zpl = '';
    
    batches.forEach(batch => {
      const qrData = batch.id;
      const alias = batch.alias || batch.cepa || batch.especie || 'N/A';
      const nombre = (batch.nombre_receta || batch.substrate || batch.nombre_insumo || '').substring(0, 30);
      const meta1 = batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || batch.fecha || '';
      const meta2 = batch.medio_origen_alias || (batch.id ? batch.id.slice(-4) : '');
      
      zpl += '^XA\n';
      zpl += '^CI28\n'; // UTF-8
      
      if (zplSize === 'large') {
        zpl += '^PW800\n^LL1200\n';
        zpl += `^FO250,150^BQN,2,10^FDQA,${qrData}^FS\n`;
        zpl += `^FO50,550^A0N,60,60^FDID: ${alias}^FS\n`;
        zpl += `^FO50,630^A0N,45,45^FDDesc: ${nombre}^FS\n`;
        zpl += `^FO50,700^A0N,40,40^FDFecha: ${meta1}^FS\n`;
        zpl += `^FO50,760^A0N,40,40^FDRef: ${meta2}^FS\n`;
      } else if (zplSize === 'medium') {
        zpl += '^PW400\n^LL400\n';
        zpl += `^FO120,30^BQN,2,6^FDQA,${qrData}^FS\n`;
        zpl += `^FO20,240^A0N,30,30^FD${alias}^FS\n`;
        zpl += `^FO20,280^A0N,25,25^FD${nombre}^FS\n`;
        zpl += `^FO20,320^A0N,20,20^FD${meta1} | ${meta2}^FS\n`;
      } else {
        zpl += '^PW400\n^LL200\n';
        zpl += `^FO10,10^BQN,2,4^FDQA,${qrData}^FS\n`;
        zpl += `^FO120,20^A0N,30,30^FD${alias}^FS\n`;
        zpl += `^FO120,60^A0N,20,20^FD${nombre}^FS\n`;
        zpl += `^FO120,100^A0N,20,20^FD${meta1}^FS\n`;
      }
      
      zpl += '^XZ\n\n';
    });

    return zpl;
  };

  const handleDownloadZPL = () => {
    const zpl = generateZPL();
    const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas_${zplSize}_${Date.now()}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
            📟 Modo Térmico (Zebra)
          </button>
          <button 
            className={`btn ${mode === 'a4' ? 'btn-primary' : 'btn-outline'}`} 
            style={{ flex: 1 }}
            onClick={() => setMode('a4')}
          >
            📄 Modo Hoja A4 (Respaldo)
          </button>
        </div>

        {mode === 'thermal' && (
          <div style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Tamaño Zebra (ZPL):</label>
              <select 
                className="form-control" 
                value={zplSize} 
                onChange={e => setZplSize(e.target.value)}
              >
                <option value="large">Grande (10x15 cm) - Bolsas</option>
                <option value="medium">Mediana (5x5 cm) - Frascos</option>
                <option value="small">Pequeña (5x2.5 cm) - Tubos</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" onClick={handleDownloadZPL} style={{ flex: 1, backgroundColor: '#10b981' }}>
                ⬇️ Descargar ZPL
              </button>
              <button 
                className={`btn ${profile === 'standard' ? 'btn-primary' : 'btn-outline'}`} 
                style={{ flex: 1, fontSize: '0.8rem' }}
                onClick={() => setProfile('standard')}
              >
                📏 PDF Standard
              </button>
              <button 
                className={`btn ${profile === 'micro' ? 'btn-primary' : 'btn-outline'}`} 
                style={{ flex: 1, fontSize: '0.8rem' }}
                onClick={() => setProfile('micro')}
              >
                🧪 PDF Micro
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'center' }}>
              Usa ZPL para Zebra Z220 o PDF para impresión normal.
            </p>
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
                  <div key={batch.id} className="etiqueta-lab" style={{ 
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    width: zplSize === 'large' ? '100mm' : '50mm',
                    height: zplSize === 'large' ? '150mm' : zplSize === 'medium' ? '50mm' : '25mm',
                    flexDirection: zplSize === 'large' ? 'column' : 'row',
                    gap: zplSize === 'large' ? '10mm' : '3mm',
                    background: 'white',
                    color: 'black'
                  }}>
                    <div className="etiqueta-qr" style={{ 
                      width: zplSize === 'large' ? '60mm' : zplSize === 'medium' ? '30mm' : '20mm',
                      height: zplSize === 'large' ? '60mm' : zplSize === 'medium' ? '30mm' : '20mm',
                      margin: zplSize === 'large' ? '0 auto' : '0'
                    }}>
                      <QRCodeSVG value={batch.id} size="100%" level="M" />
                    </div>
                    <div className="etiqueta-info" style={{ textAlign: zplSize === 'large' ? 'center' : 'left' }}>
                      <div className="etiqueta-id" style={{ fontSize: zplSize === 'large' ? '16pt' : '8pt' }}>{batch.alias || batch.cepa || batch.id}</div>
                      <div className="etiqueta-nombre" style={{ fontSize: zplSize === 'large' ? '14pt' : '7pt', whiteSpace: zplSize === 'large' ? 'normal' : 'nowrap' }}>{batch.nombre_receta || batch.substrate || batch.nombre_insumo}</div>
                      <div className="etiqueta-meta" style={{ fontSize: zplSize === 'large' ? '12pt' : '6pt' }}>
                        {formatDate(batch.fecha) || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion} <br />
                        {batch.medio_origen_alias ? `Origen: ${batch.medio_origen_alias}` : `Lote: ${batch.id.slice(-4)}`}
                      </div>
                    </div>
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
                    <div className="etiqueta-info">
                      <div className="etiqueta-id" style={{ fontSize: '7pt' }}>{batch.alias || batch.cepa || batch.id}</div>
                      <div className="etiqueta-nombre" style={{ fontSize: '6pt' }}>{batch.nombre_receta || batch.substrate || batch.nombre_insumo}</div>
                      <div className="etiqueta-meta" style={{ fontSize: '5pt' }}>
                        {formatDate(batch.fecha) || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion} <br />
                        {batch.medio_origen_alias ? `Org: ${batch.medio_origen_alias}` : `ID: ${batch.id.slice(-4)}`}
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
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ Imprimir PDF (Navegador)</button>
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

