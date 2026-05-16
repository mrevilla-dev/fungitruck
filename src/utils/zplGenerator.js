export const ZPL_PROFILES = {
  PERFIL_PORTAOBJETOS: 'PERFIL_PORTAOBJETOS',
  PERFIL_MICRO_TUBOS: 'PERFIL_MICRO_TUBOS',
  PERFIL_SLIM_PETRI: 'PERFIL_SLIM_PETRI',
  PERFIL_MEDIO_ESTANDAR: 'PERFIL_MEDIO_ESTANDAR',
  PERFIL_MAXI_BOLSA: 'PERFIL_MAXI_BOLSA',
  PERFIL_MAPA_GRADILLA: 'PERFIL_MAPA_GRADILLA',
};

export const generateZPL = (profile, data) => {
  let zpl = '';

  switch (profile) {
    case ZPL_PROFILES.PERFIL_PORTAOBJETOS:
      zpl = `^XA
^PW240
^LL120
^FO10,10^BQN,2,3^FDQA,${data.qrData || ''}^FS
^FO110,20^A0N,20,20^FD${data.strainId || ''}^FS
^FO110,50^A0N,20,20^FD${data.date || ''}^FS
^XZ`;
      break;

    case ZPL_PROFILES.PERFIL_MICRO_TUBOS:
      zpl = `^XA
^PW240
^LL120
^FO10,10^BQN,2,3^FDQA,${data.qrData || ''}^FS
^FO110,40^A0N,30,30^FD${data.lotCode || ''}^FS
^XZ`;
      break;

    case ZPL_PROFILES.PERFIL_SLIM_PETRI:
      zpl = `^XA
^PW240
^LL120
^FO10,30^A0N,30,30^FD${data.mediumId || ''}^FS
^FO170,10^BQN,2,2^FDQA,${data.qrData || ''}^FS
^XZ`;
      break;

    case ZPL_PROFILES.PERFIL_MEDIO_ESTANDAR:
      zpl = `^XA
^PW812
^LL1218
^FO50,50^BQN,2,10^FDQA,${data.qrData || ''}^FS
^FO50,400^A0N,80,80^FD${data.mediumName || ''}^FS
^FO50,500^A0N,50,50^FDLote: ${data.lotCode || ''}^FS
^FO50,560^A0N,50,50^FDVenc: ${data.expiryDate || ''}^FS
^XZ`;
      break;

    case ZPL_PROFILES.PERFIL_MAXI_BOLSA:
      zpl = `^XA
^PW812
^LL1218
^FO50,50^BQN,2,10^FDQA,${data.qrData || ''}^FS
^FO50,400^BCN,100,Y,N,N^FD${data.barcode || ''}^FS
^FO50,550^A0N,60,60^FDCepa: ${data.strainId || ''}^FS
^FO50,630^A0N,60,60^FDGen: ${data.generation || ''}^FS
^XZ`;
      break;

    case ZPL_PROFILES.PERFIL_MAPA_GRADILLA:
      zpl = `^XA
^PW812
^LL1218
^FO50,50^A0N,60,60^FDMapa de Gradilla: ${data.gridName || ''}^FS
^FO50,150^A0N,40,40^FD${data.gridData || ''}^FS
^XZ`;
      break;

    default:
      zpl = '^XA^XZ'; // Empty valid ZPL
  }

  return zpl;
};
