import React, { useState } from 'react';
import { ZPL_PROFILES, generateZPL } from '../utils/zplGenerator';
import { printZPL } from '../services/zebraPrintService';
import './LabelPrinter.css';

const profiles = [
  { 
    id: ZPL_PROFILES.PERFIL_PORTAOBJETOS, 
    title: '🔬 Portaobjetos', 
    desc: 'Etiqueta resistente para portaobjetos', 
    group: 'Grupo 1 — Chico (30×15mm)', 
    groupKey: 1 
  },
  { 
    id: ZPL_PROFILES.PERFIL_MICRO_TUBOS, 
    title: '🧪 Micro Tubos', 
    desc: 'Eppendorf y crioviales', 
    group: 'Grupo 1 — Chico (30×15mm)', 
    groupKey: 1 
  },
  { 
    id: ZPL_PROFILES.PERFIL_SLIM_PETRI, 
    title: '🧫 Petri / Falcon', 
    desc: 'Borde de placas y tubos', 
    group: 'Grupo 1 — Chico (30×15mm)', 
    groupKey: 1 
  },
  { 
    id: ZPL_PROFILES.PERFIL_MEDIO_ESTANDAR, 
    title: '🫙 Medio Estándar', 
    desc: 'Frascos de vidrio y Nescafé', 
    group: 'Grupo 2 — Grande (100×150mm)', 
    groupKey: 2 
  },
  { 
    id: ZPL_PROFILES.PERFIL_MAXI_BOLSA, 
    title: '🛍️ Bolsa de Sustrato', 
    desc: 'Bolsas grandes con código barras', 
    group: 'Grupo 2 — Grande (100×150mm)', 
    groupKey: 2 
  },
  { 
    id: ZPL_PROFILES.PERFIL_MAPA_GRADILLA, 
    title: '🗺️ Mapa Gradilla', 
    desc: 'Reporte para tapas de cajas', 
    group: 'Grupo 2 — Grande (100×150mm)', 
    groupKey: 2 
  },
];

const LabelPrinter = ({ itemData }) => {
  const [selectedProfile, setSelectedProfile] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [status, setStatus] = useState('');

  // Default mock data if no item is provided
  const data = itemData || {
    qrData: 'FT-123456',
    strainId: 'PLE-OST-01',
    date: new Date().toLocaleDateString(),
    lotCode: 'L-24-001',
    mediumId: 'MEA-01',
    mediumName: 'Malt Extract Agar',
    expiryDate: '12/2026',
    barcode: '123456789',
    generation: 'Sc1',
    gridName: 'Freezer 1, Caja 3',
    gridData: 'A1: PLE-OST, B1: GAN-LUC',
  };

  const handlePrint = async () => {
    if (!selectedProfile) {
      setStatus('Por favor seleccione un tipo de envase.');
      return;
    }

    setIsPrinting(true);
    setStatus('Generando e imprimiendo...');
    try {
      const zpl = generateZPL(selectedProfile, data);
      await printZPL(zpl);
      setStatus('Impresión exitosa o archivo descargado.');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const group1 = profiles.filter(p => p.groupKey === 1);
  const group2 = profiles.filter(p => p.groupKey === 2);

  return (
    <div className="label-printer-container">
      <h3>Seleccionar Tipo de Envase</h3>

      {/* Grupo 1 */}
      <div className="group-header group-small">📏 Grupo 1 — Chico (30×15mm)</div>
      <div className="cards-grid">
        {group1.map(p => (
          <div
            key={p.id}
            className={`print-card ${selectedProfile === p.id ? 'selected' : ''}`}
            onClick={() => setSelectedProfile(p.id)}
          >
            <div className="card-title">{p.title}</div>
            <div className="card-desc">{p.desc}</div>
          </div>
        ))}
      </div>

      {/* Grupo 2 */}
      <div className="group-header group-large">📐 Grupo 2 — Grande (100×150mm)</div>
      <div className="cards-grid">
        {group2.map(p => (
          <div
            key={p.id}
            className={`print-card ${selectedProfile === p.id ? 'selected' : ''}`}
            onClick={() => setSelectedProfile(p.id)}
          >
            <div className="card-title">{p.title}</div>
            <div className="card-desc">{p.desc}</div>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary print-action-btn"
        onClick={handlePrint}
        disabled={isPrinting || !selectedProfile}
      >
        {isPrinting ? 'Imprimiendo...' : '🖨️ Imprimir Etiqueta'}
      </button>

      {status && <div className="print-status">{status}</div>}
    </div>
  );
};

export default LabelPrinter;
