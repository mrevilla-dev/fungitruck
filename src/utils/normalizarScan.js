/**
 * Normaliza el texto decodificado de un QR antes de entregarlo a los handlers.
 *
 * Las etiquetas ZPL imprimen el QR con el prefijo de modo Zebra "MA,"
 * (^FDMA,<id>). Los IDs reales comienzan con ESP-, EJE-, BAT-, EVT-, CRV-,
 * FRAC-, MED- o son IDs de Firestore — el prefijo "MA," solo rompe el lookup.
 */
export function normalizarScan(texto) {
  if (!texto) return '';
  // trim + prefijo de modo Zebra "MA," + NULs terminales que a veces agregan
  // los decodificadores a payloads impresos por ZPL
  return String(texto).trim().replace(/^MA,\s*/i, '').replace(/\0/g, '');
}
