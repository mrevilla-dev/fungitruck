/**
 * FungiTrack - ZPL Layout Profiles for Zebra ZD220 (203 dpi)
 * Physical Roll Size: 100mm x 150mm (800 x 1200 dots)
 */

export const PROFILES = [
  {
    id: 'PORTAOBJETOS',
    name: 'Portaobjetos (30x15mm)',
    icon: '🔬',
    group: 'Rollo Chico (Tiled)',
    description: 'Optimizado para el extremo del portaobjetos. QR compacto + cepa y tinción.',
    cols: 3,
    rows: 10,
    slotWidth: 266,
    slotHeight: 120,
  },
  {
    id: 'MICRO_TUBOS',
    name: 'Micro Tubos / Eppendorf',
    icon: '🧪',
    group: 'Rollo Chico (Tiled)',
    description: 'Para eppendorfs (0.2ml a 1.5ml) y crioviales. QR + código de lote.',
    cols: 3,
    rows: 10,
    slotWidth: 266,
    slotHeight: 120,
  },
  {
    id: 'SLIM_PETRI',
    name: 'Petri / Falcon Slim',
    icon: '🧫',
    group: 'Rollo Chico (Tiled)',
    description: 'Para borde de placa de Petri y tubos Falcon. Texto alargado + QR mini.',
    cols: 1,
    rows: 10,
    slotWidth: 800,
    slotHeight: 120,
  },
  {
    id: 'MEDIO_ESTANDAR',
    name: 'Frascos Medios (50x50mm)',
    icon: '🫙',
    group: 'Rollo Grande (Tiled)',
    description: 'Para frascos Schott, Nescafé o mermelada. QR mediano + medio grande + lote + vencimiento.',
    cols: 2,
    rows: 3,
    slotWidth: 400,
    slotHeight: 400,
  },
  {
    id: 'MAXI_BOLSA',
    name: 'Bolsas Sustrato / Grano',
    icon: '📦',
    group: 'Rollo Grande (Full)',
    description: 'Para bolsas de 20-60cm. Cepa e historial visibles a gran distancia.',
    cols: 1,
    rows: 1,
    slotWidth: 800,
    slotHeight: 1200,
  },
  {
    id: 'MAPA_GRADILLA',
    name: 'Mapa de Gradilla (9x9)',
    icon: '🗺️',
    group: 'Reporte (Full)',
    description: 'Índice de posiciones para pegar en tapas de cajas de freezer o PCR.',
    cols: 1,
    rows: 1,
    slotWidth: 800,
    slotHeight: 1200,
  }
];

/**
 * Formats a date string to DD/MM/YYYY
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

/**
 * Generates ZPL II code for a set of batches tiled onto a single 100x150mm sheet (800x1200 dots)
 * @param {string} profileId - The active profile ID
 * @param {Array} batches - List of batches to print
 * @param {number} copies - Number of copies per batch
 * @returns {string} ZPL II text
 */
export function generateZPL(profileId, batches, copies = 1) {
  const profile = PROFILES.find(p => p.id === profileId);
  if (!profile) return '';

  // Flatten the batches list based on copies
  let itemsToPrint = [];
  batches.forEach(batch => {
    for (let c = 0; c < copies; c++) {
      itemsToPrint.push(batch);
    }
  });

  const slotsPerPage = profile.cols * profile.rows;
  let zpl = '';

  // Process items in chunks of slotsPerPage (each chunk is one physical 100x150mm label)
  for (let i = 0; i < itemsToPrint.length; i += slotsPerPage) {
    const pageItems = itemsToPrint.slice(i, i + slotsPerPage);
    
    zpl += '^XA\n';
    zpl += '^CI28\n'; // UTF-8 Encoding
    zpl += '^PW800\n'; // Width: 100mm = 800 dots
    zpl += '^LL1200\n'; // Height: 150mm = 1200 dots
    zpl += '^LH0,0\n'; // Home position

    // Draw the grid lines (cut marks) for the whole label sheet to assist scissor cutting
    if (slotsPerPage > 1) {
      // Draw horizontal dashed/dotted lines
      for (let r = 1; r < profile.rows; r++) {
        const y = r * profile.slotHeight;
        // ZPL: Draw a horizontal line using thin blocks or dot patterns
        zpl += `^FO0,${y - 1}^GB800,2,2^FS\n`; // Thin line
      }
      // Draw vertical dashed/dotted lines
      for (let c = 1; c < profile.cols; c++) {
        const x = c * profile.slotWidth;
        zpl += `^FO${x - 1},0^GB2,1200,2^FS\n`;
      }
      
      // Draw scissors icon indicator in unused areas or corners
      zpl += `^FO770,10^A0N,20,20^FD✂^FS\n`;
    }

    // Print items inside their designated grid slot
    pageItems.forEach((batch, index) => {
      const col = index % profile.cols;
      const row = Math.floor(index / profile.cols);
      
      const xStart = col * profile.slotWidth;
      const yStart = row * profile.slotHeight;

      // Extract batch information safely
      const qrData = batch.id || 'N/A';
      const alias = (batch.alias || batch.cepa || batch.especie || 'S/C').substring(0, 15);
      const nombre = (batch.nombre_receta || batch.substrate || batch.nombre_insumo || '').substring(0, 30);
      const fecha = formatDate(batch.fecha || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '');
      const meta = batch.medio_origen_alias || (batch.id ? batch.id.slice(-4) : '');
      const tipoUso = batch.tipo_uso || ''; // e.g. 'Semilla', 'Sustrato', 'Frasco'
      const vencimiento = formatDate(batch.fecha_vencimiento || '');

      if (profileId === 'PORTAOBJETOS') {
        // --- 1. PORTAOBJETOS (Slot: 266 x 120) ---
        // Compact QR size 2 (58x58 dots ~7mm)
        zpl += `^FO${xStart + 10},${yStart + 25}^BQN,2,2^FDQA,${qrData}^FS\n`;
        // Micro Text right
        zpl += `^FO${xStart + 80},${yStart + 20}^A0N,18,18^FDID:${alias}^FS\n`;
        zpl += `^FO${xStart + 80},${yStart + 45}^A0N,15,15^FD${nombre.substring(0, 15)}^FS\n`;
        zpl += `^FO${xStart + 80},${yStart + 65}^A0N,14,14^FD${fecha}^FS\n`;
        zpl += `^FO${xStart + 80},${yStart + 85}^A0N,14,14^FD${meta}^FS\n`;

      } else if (profileId === 'MICRO_TUBOS') {
        // --- 2. MICRO_TUBOS (Slot: 266 x 120) ---
        // QR compact size 3 (87x87 dots)
        zpl += `^FO${xStart + 10},${yStart + 15}^BQN,2,3^FDQA,${qrData}^FS\n`;
        // Lot / Info right
        zpl += `^FO${xStart + 110},${yStart + 20}^A0N,22,22^FD${alias}^FS\n`;
        zpl += `^FO${xStart + 110},${yStart + 50}^A0N,18,18^FD${fecha}^FS\n`;
        zpl += `^FO${xStart + 110},${yStart + 75}^A0N,18,18^FD${meta}^FS\n`;

      } else if (profileId === 'SLIM_PETRI') {
        // --- 3. SLIM_PETRI (Slot: 800 x 120) ---
        // QR compact far left
        zpl += `^FO${xStart + 20},${yStart + 15}^BQN,2,3^FDQA,${qrData}^FS\n`;
        // Long stretched text layout for edge of plate
        zpl += `^FO${xStart + 130},${yStart + 30}^A0N,30,30^FD${alias} | ${nombre.substring(0, 20)}^FS\n`;
        zpl += `^FO${xStart + 130},${yStart + 70}^A0N,24,24^FDFec: ${fecha} | Lote: ${meta}^FS\n`;

      } else if (profileId === 'MEDIO_ESTANDAR') {
        // --- 4. MEDIO_ESTANDAR (Slot: 400 x 400) ---
        // QR center-left
        zpl += `^FO${xStart + 20},${yStart + 40}^BQN,2,6^FDQA,${qrData}^FS\n`;
        // Info details right and bottom
        zpl += `^FO${xStart + 210},${yStart + 40}^A0N,36,36^FDID:${alias}^FS\n`;
        zpl += `^FO${xStart + 210},${yStart + 90}^A0N,26,26^FD${tipoUso}^FS\n`;
        
        zpl += `^FO${xStart + 20},${yStart + 220}^A0N,32,32^FD${nombre.substring(0, 22)}^FS\n`;
        zpl += `^FO${xStart + 20},${yStart + 270}^A0N,24,24^FDFec:${fecha} | Lote:${meta}^FS\n`;
        if (vencimiento) {
          zpl += `^FO${xStart + 20},${yStart + 320}^A0N,24,24^FDVence: ${vencimiento}^FS\n`;
        }

      } else if (profileId === 'MAXI_BOLSA') {
        // --- 5. MAXI_BOLSA (Full Sheet: 800 x 1200) ---
        // Large QR at the top
        zpl += `^FO250,80^BQN,2,10^FDQA,${qrData}^FS\n`;
        
        // Large Cepa/Species ID
        zpl += `^FO50,420^A0N,60,60^FDID: ${alias}^FS\n`;
        zpl += `^FO50,510^A0N,45,45^FDDesc: ${nombre}^FS\n`;
        zpl += `^FO50,590^A0N,40,40^FDTipo: ${tipoUso || 'Cultivo'}^FS\n`;
        zpl += `^FO50,670^A0N,40,40^FDFecha: ${fecha} | Lote: ${meta}^FS\n`;
        
        // Historial de inoculación or metadata
        const gen = batch.generacion || 'Sc1';
        zpl += `^FO50,750^A0N,40,40^FDGen: ${gen} | Origen: ${batch.medio_origen_alias || 'N/A'}^FS\n`;

        // Large 1D Barcode at the bottom for easy scanning at distance
        zpl += `^FO100,900^BY3^BCN,120,Y,N,N^FD${qrData.substring(0, 15)}^FS\n`;

      } else if (profileId === 'MAPA_GRADILLA') {
        // --- 6. MAPA_GRADILLA (Full Grid Report: 800 x 1200) ---
        // Header
        zpl += `^FO50,40^A0N,36,36^FDMAPA DE GRADILLA / FREEZER^FS\n`;
        zpl += `^FO50,90^A0N,24,24^FDFecha: ${fecha || new Date().toLocaleDateString('es-AR')} | Caja: ${alias}^FS\n`;
        
        // Draw a clean 9x9 box grid
        const startX = 60;
        const startY = 160;
        const boxSize = 75; // 75 * 9 = 675 dots wide/high
        
        // Horizontal grid lines
        for (let r = 0; r <= 9; r++) {
          const y = startY + (r * boxSize);
          zpl += `^FO${startX},${y}^GB675,2,2^FS\n`;
        }
        // Vertical grid lines
        for (let c = 0; c <= 9; c++) {
          const x = startX + (c * boxSize);
          zpl += `^FO${x},${startY}^GB2,675,2^FS\n`;
        }

        // Add headers A-I for rows and 1-9 for columns
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
        for (let r = 0; r < 9; r++) {
          const y = startY + (r * boxSize) + 25;
          zpl += `^FO${startX - 30},${y}^A0N,24,24^FD${rows[r]}^FS\n`;
        }
        for (let c = 0; c < 9; c++) {
          const x = startX + (c * boxSize) + 30;
          zpl += `^FO${x},${startY - 30}^A0N,24,24^FD${c + 1}^FS\n`;
        }

        // Add some instructions/notes lines at the bottom
        zpl += `^FO50,900^A0N,24,24^FDNotas / Observaciones:^FS\n`;
        zpl += `^FO50,960^GB700,2,2^FS\n`;
        zpl += `^FO50,1020^GB700,2,2^FS\n`;
        zpl += `^FO50,1080^GB700,2,2^FS\n`;
      }
    });

    zpl += '^XZ\n\n';
  }

  return zpl;
}
