export const ICONOS_NODO = {
  // Tipo de contenedor / batch
  placa_petri:          '🧫',
  medio_liquido:        '🧪',
  spawn_grano:          '🫙',
  sustrato_definitivo:  '🌱',
  fructificando:        '🍄',
  criopreservado:       '❄️',

  // Tipo de material / ejemplar
  explanto:             '🔬',
  esporas_placa:        '⭕',
  jeringa_lc:           '💉',
  micelio_agar:         '🧫',
  micelio_grano:        '🫙',
  desconocido:          '❓',

  // Entidades
  ejemplar:             '🧬',
  esporoma:             '🍂',
  cosecha:              '📦',
  criovial:             '❄️',
};

export const COLORES_ESTADO = {
  'Planificado':        '#9E9E9E', // gris
  'Inoculado':          '#2196F3', // azul
  'Incubando':          '#FF9800', // naranja
  'Colonias visibles':  '#8BC34A', // verde claro
  'Fructificando':      '#4CAF50', // verde
  'Cosechado':          '#795548', // marrón
  'Contaminado':        '#F44336', // rojo
  'Descartado':         '#757575', // gris oscuro
  'Criopreservado':     '#00BCD4', // cyan
  'Activo':             '#4CAF50', // verde
  'En evaluación':      '#FF9800', // naranja
  'Inviable':           '#F44336', // rojo
  'Agotado':            '#757575', // gris
};

/**
 * Convierte cualquier URL de Google Drive al formato embebible en <img>.
 * Soporta:
 *   - https://drive.google.com/file/d/FILE_ID/view  (y variantes)
 *   - https://drive.google.com/open?id=FILE_ID
 *   - https://drive.google.com/uc?id=FILE_ID
 *   - https://lh3.googleusercontent.com/d/FILE_ID  (ya correcto)
 * Devuelve null si la URL es nula/vacía.
 * Si no es una URL de Drive reconocida, la devuelve tal cual.
 */
export function getDriveEmbedUrl(url) {
  if (!url) return null;

  // Ya está en formato embebible
  if (url.includes('lh3.googleusercontent.com/d/')) return url;

  let fileId = null;

  // https://drive.google.com/file/d/FILE_ID/view (o /preview, /edit, etc.)
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) fileId = fileMatch[1];

  // https://drive.google.com/open?id=FILE_ID  o  uc?id=FILE_ID
  if (!fileId) {
    const paramMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (paramMatch) fileId = paramMatch[1];
  }

  if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`;

  // URL no reconocida — devolver sin modificar (Firebase Storage u otro)
  return url;
}
