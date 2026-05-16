import React from 'react';
import LabelPrinter from '../components/LabelPrinter';

const PrintPage = () => {
  return (
    <div className="page-container">
      <h2>Módulo de Impresión ZPL</h2>
      <p className="page-description">
        Seleccione el formato de etiqueta según el envase que va a rotular. 
        Asegúrese de que el servicio Zebra Browser Print esté ejecutándose en esta PC.
      </p>
      <LabelPrinter />
    </div>
  );
};

export default PrintPage;
