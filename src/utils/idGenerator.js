/**
 * Generador de IDs Semánticos para FungiTrack
 */

export function generateBatchId(prefix, sequence = 1, suffix = null) {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const baseId = `${prefix}-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  return suffix ? `${baseId}-${suffix.toString().padStart(2, '0')}` : baseId;
}

export function generateLoteInsumoId(insumoNombre) {
  const prefix = (insumoNombre || 'INS').toUpperCase().slice(0, 3);
  const timestamp = Date.now().toString().slice(-4);
  return `LOT-${prefix}-${timestamp}`;
}

// Alias para compatibilidad con archivos antiguos (NewBatch.jsx)
export function generateSemanticId(genero, especie, substrateCode) {
  const prefix = `${genero.slice(0, 3)}-${especie.slice(0, 3)}-${substrateCode}`.toUpperCase();
  return generateBatchId(prefix);
}

export function getSubstrateCode(substrate) {
  if (!substrate) return 'UNK';
  return substrate.slice(0, 3).toUpperCase();
}
