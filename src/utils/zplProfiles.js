/**
 * FungiTrack - ZPL Layout Profiles for Zebra ZD220 (203 dpi)
 * Physical Roll Size: 100mm x 150mm (800 x 1200 dots)
 */
import toast from 'react-hot-toast';

export const PROFILES = [
  {
    id: 'PORTAOBJETOS',
    name: 'Portaobjetos (Etiqueta Chica)',
    icon: '🔬',
    group: 'Rollo Chico (Directo)',
    description: 'Impresión individual para etiqueta chica (ej. 50x30mm). QR + ID completo.',
    cols: 1,
    rows: 1,
    pageWidth: 400,
    pageHeight: 240,
    slotWidth: 400,
    slotHeight: 240,
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
    
    const pw = profile.pageWidth || 800;
    const ll = profile.pageHeight || 1200;

    zpl += '^XA\n';
    zpl += '^CI28\n'; // UTF-8 Encoding
    zpl += `^PW${pw}\n`; // Width
    zpl += `^LL${ll}\n`; // Height
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

      zpl += getZplForProfile(profileId, batch, xStart, yStart);
    });

    zpl += '^XZ\n\n';
  }

  return zpl;
}

/**
 * Returns the ZPL code for a single label given its profile and coordinates
 */
function getZplForProfile(profileId, batch, xStart, yStart) {
  let zpl = '';
  // Extract batch information safely
  const qrData = batch.id || 'N/A';
  const alias = (batch.alias || batch.cepa || batch.especie || 'S/C').substring(0, 15);
  const nombre = (batch.nombre_receta || batch.substrate || batch.nombre_insumo || '').substring(0, 30);
  const fecha = formatDate(batch.fecha || batch.trazabilidad?.fecha_preparacion || batch.fecha_inoculacion || '');
  const meta = batch.id || '';
  const transferencia = batch.numero_transferencia ? `T${batch.numero_transferencia}` : '';
  const tipoUso = batch.tipo_uso || ''; // e.g. 'Semilla', 'Sustrato', 'Frasco'
  const vencimiento = formatDate(batch.fecha_vencimiento || '');

  const ubicacion = batch.ubicacion || '';
  const operador = batch.operador || batch.operario || '';

      if (profileId === 'PORTAOBJETOS') {
        // --- 1. PORTAOBJETOS (Slot: 400 x 240) ---
        // QR compact size 4 (aprox 120-140 dots)
        zpl += `^FO${xStart + 10},${yStart + 20}^BQN,2,4^FDMA,${batch.id}^FS\n`;

        // Text info
        const idTrunc = (batch.id || '').substring(0, 19);
        zpl += `^FO${xStart + 130},${yStart + 20}^A0N,20,20^FD${idTrunc}^FS\n`;

        // Desc (tipo_inoculacion o alias)
        const desc = (batch.tipo_inoculacion || 'Aislamiento Primario').replace(/_/g, ' ');
        zpl += `^FO${xStart + 130},${yStart + 45}^A0N,20,20^FB260,2,0,L,0^FD${desc}^FS\n`;

        // Gen and Unidad
        const gen = batch.generacion ?? '0';
        const numUni = batch.numero_unidad ?? '1';
        const totUni = batch.total_unidades ?? '1';
        zpl += `^FO${xStart + 130},${yStart + 95}^A0N,20,20^FDGen: ${gen} | ${numUni}/${totUni}^FS\n`;

        // Fecha and Sala
        zpl += `^FO${xStart + 130},${yStart + 120}^A0N,18,18^FDFec: ${fecha} | ${batch.sala || ''}^FS\n`;

        // Transferencia (si aplica)
        if (transferencia) {
          zpl += `^FO${xStart + 130},${yStart + 145}^A0N,18,18^FD${transferencia}^FS\n`;
        }


      } else if (profileId === 'MICRO_TUBOS') {
        // --- 2. MICRO_TUBOS (Slot: 266 x 120) ---
        // QR compact size 3 (87x87 dots)
        zpl += `^FO${xStart + 10},${yStart + 15}^BQN,2,3^FDMA,${qrData}^FS\n`;
        // Lot / Info right
        zpl += `^FO${xStart + 110},${yStart + 20}^A0N,22,22^FD${alias}^FS\n`;
        zpl += `^FO${xStart + 110},${yStart + 50}^A0N,18,18^FD${fecha}${transferencia ? ` ${transferencia}` : ''}^FS\n`;
        zpl += `^FO${xStart + 110},${yStart + 75}^A0N,18,18^FDRef: ${meta.substring(0, 15)}^FS\n`;

      } else if (profileId === 'SLIM_PETRI') {
        // --- 3. SLIM_PETRI (Slot: 800 x 120) ---
        // QR compact far left
        zpl += `^FO${xStart + 20},${yStart + 15}^BQN,2,3^FDMA,${qrData}^FS\n`;
        // Long stretched text layout for edge of plate
        zpl += `^FO${xStart + 130},${yStart + 30}^A0N,30,30^FD${alias} | ${nombre.substring(0, 30)}^FS\n`;
        zpl += `^FO${xStart + 130},${yStart + 70}^A0N,24,24^FB650,2,0,L,0^FDFec: ${fecha} | Ref: ${meta}${transferencia ? ` | ${transferencia}` : ''}^FS\n`;

      } else if (profileId === 'MEDIO_ESTANDAR') {
        // --- 4. MEDIO_ESTANDAR (Slot: 400 x 400) ---
        // QR arriba a la izquierda (size 5 es aprox 180 dots)
        zpl += `^FO${xStart + 15},${yStart + 15}^BQN,2,5^FDMA,${qrData}^FS\n`;
        
        // Bloque de texto arriba a la derecha (x=210)
        zpl += `^FO${xStart + 210},${yStart + 20}^A0N,26,26^FB180,2,0,L,0^FDID: ${alias}^FS\n`;
        zpl += `^FO${xStart + 210},${yStart + 75}^A0N,20,20^FB180,3,0,L,0^FD${tipoUso.replace(/_/g, ' ')}^FS\n`;
        
        // Contenido Principal (mitad de abajo, debajo del QR)
        zpl += `^FO${xStart + 15},${yStart + 210}^A0N,28,28^FB370,2,0,L,0^FD${nombre}^FS\n`;
        
        // Metadatos inferiores
        let currentBottomY = yStart + 270;
        zpl += `^FO${xStart + 15},${currentBottomY}^A0N,20,20^FDFec: ${fecha}${vencimiento ? ` | Vto: ${vencimiento}` : ''}^FS\n`;
        currentBottomY += 30;
        
        zpl += `^FO${xStart + 15},${currentBottomY}^A0N,20,20^FDRef: ${meta.substring(0,25)}^FS\n`;
        currentBottomY += 30;
        
        if (transferencia) {
          zpl += `^FO${xStart + 15},${currentBottomY}^A0N,20,20^FDOp: ${operador} | ${transferencia}^FS\n`;
        } else {
          zpl += `^FO${xStart + 15},${currentBottomY}^A0N,20,20^FDOp: ${operador}^FS\n`;
        }
        currentBottomY += 30;

        if (ubicacion) {
          zpl += `^FO${xStart + 15},${currentBottomY}^A0N,20,20^FDUbic: ${ubicacion}^FS\n`;
        }

      } else if (profileId === 'MAXI_BOLSA') {
        // --- 5. MAXI_BOLSA (Full Sheet: 800 x 1200) ---
        // Large QR at the top
        zpl += `^FO${xStart + 250},${yStart + 80}^BQN,2,10^FDMA,${qrData}^FS\n`;
        
        // Large Cepa/Species ID
        zpl += `^FO${xStart + 50},${yStart + 420}^A0N,50,50^FB700,2,0,L,0^FDID: ${alias}^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 510}^A0N,45,45^FB700,2,0,L,0^FDDesc: ${nombre}^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 590}^A0N,40,40^FB700,2,0,L,0^FDTipo: ${tipoUso || 'Cultivo'}^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 670}^A0N,40,40^FB700,2,0,L,0^FDFecha: ${fecha} | Ref: ${meta}^FS\n`;

        
        // Historial de inoculación or metadata
        const gen = batch.generacion || 'Sc1';
        zpl += `^FO${xStart + 50},${yStart + 750}^A0N,40,40^FD${transferencia ? `${transferencia} | ` : ''}Gen: ${gen} | Origen: ${batch.medio_origen_alias || 'N/A'}^FS\n`;

        if (ubicacion) {
          zpl += `^FO${xStart + 50},${yStart + 810}^A0N,40,40^FDUbic: ${ubicacion}^FS\n`;
        }
        if (operador) {
          zpl += `^FO${xStart + 400},${yStart + 810}^A0N,40,40^FDOp: ${operador}^FS\n`;
        }

        // Large 1D Barcode at the bottom for easy scanning at distance
        zpl += `^FO${xStart + 100},${yStart + 900}^BY3^BCN,120,Y,N,N^FD${qrData.substring(0, 15)}^FS\n`;

      } else if (profileId === 'MAPA_GRADILLA') {
        // --- 6. MAPA_GRADILLA (Full Grid Report: 800 x 1200) ---
        // Header
        zpl += `^FO${xStart + 50},${yStart + 40}^A0N,36,36^FDMAPA DE GRADILLA / FREEZER^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 90}^A0N,24,24^FDFecha: ${fecha || new Date().toLocaleDateString('es-AR')} | Caja: ${alias}^FS\n`;
        
        // Draw a clean 9x9 box grid
        const gridX = xStart + 60;
        const gridY = yStart + 160;
        const boxSize = 75; // 75 * 9 = 675 dots wide/high
        
        // Horizontal grid lines
        for (let r = 0; r <= 9; r++) {
          const y = gridY + (r * boxSize);
          zpl += `^FO${gridX},${y}^GB675,2,2^FS\n`;
        }
        // Vertical grid lines
        for (let c = 0; c <= 9; c++) {
          const x = gridX + (c * boxSize);
          zpl += `^FO${x},${gridY}^GB2,675,2^FS\n`;
        }

        // Add headers A-I for rows and 1-9 for columns
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
        for (let r = 0; r < 9; r++) {
          const y = gridY + (r * boxSize) + 25;
          zpl += `^FO${gridX - 30},${y}^A0N,24,24^FD${rows[r]}^FS\n`;
        }
        for (let c = 0; c < 9; c++) {
          const x = gridX + (c * boxSize) + 30;
          zpl += `^FO${x},${gridY - 30}^A0N,24,24^FD${c + 1}^FS\n`;
        }

        // Add some instructions/notes lines at the bottom
        zpl += `^FO${xStart + 50},${yStart + 900}^A0N,24,24^FDNotas / Observaciones:^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 960}^GB700,2,2^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 1020}^GB700,2,2^FS\n`;
        zpl += `^FO${xStart + 50},${yStart + 1080}^GB700,2,2^FS\n`;
      }
  return zpl;
}

/**
 * Generates ZPL II code for mixed labels, using a shelf bin-packing algorithm
 * @param {Array} itemsToPrint - Array of objects { batch, profileId, copies }
 * @returns {string} ZPL II text
 */
export function generateMixedZPL(itemsToPrint) {
  let zpl = '';
  const pw = 800;
  const ll = 1200;
  
  let flatItems = [];
  itemsToPrint.forEach(item => {
    const qty = item.copies || 1;
    for(let i=0; i<qty; i++) {
      const profile = PROFILES.find(p => p.id === item.profileId) || PROFILES.find(p => p.id === 'MAXI_BOLSA');
      flatItems.push({ 
        batch: item.batch, 
        profileId: item.profileId,
        w: profile.slotWidth || 800,
        h: profile.slotHeight || 1200
      });
    }
  });

  if (flatItems.length === 0) return '';

  // NFDH (Next-Fit Decreasing Height) Optimization:
  // Sort by height descending, then width descending
  flatItems.sort((a, b) => {
    if (b.h !== a.h) {
      return b.h - a.h;
    }
    return b.w - a.w;
  });

  let currentX = 0;
  let currentY = 0;
  let rowMaxHeight = 0;
  let pageZpl = '';

  const startNewPage = () => {
    zpl += '^XA\n^CI28\n^PW800\n^LL1200\n^LH0,0\n';
    zpl += pageZpl;
    zpl += '^XZ\n\n';
    pageZpl = '';
    currentX = 0;
    currentY = 0;
    rowMaxHeight = 0;
  };

  flatItems.forEach((item) => {
    const { w, h } = item;

    if (currentX + w > pw) {
      currentX = 0;
      currentY += rowMaxHeight;
      rowMaxHeight = 0;
    }

    if (currentY + h > ll) {
      startNewPage();
    }

    const xStart = currentX;
    const yStart = currentY;

    pageZpl += getZplForProfile(item.profileId, item.batch, xStart, yStart);

    currentX += w;
    rowMaxHeight = Math.max(rowMaxHeight, h);
  });

  if (pageZpl !== '') {
    startNewPage();
  }

  return zpl;
}

export async function sendToPrinter(zpl) {
  try {
    // Servidor local de impresión (print-server.js corriendo en la PC con la Zebra)
    const response = await fetch('http://localhost:5174/print', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: zpl,
    });
    if (!response.ok) {
      console.error('Failed to send ZPL to printer', response.statusText);
      toast.error('Error al enviar a la impresora (Zebra). Verifique la consola.');
    }
  } catch (err) {
    console.error('Error sending ZPL to printer', err);
    toast.error('Fallo de conexión con la impresora. ¿Está encendida y configurada?');
  }
}
