export const TIPO_MATERIAL_CODES = {
  // DerivacionEsporomaModal (texto libre)
  'Sello de Esporas': 'ESP',
  'Explanto': 'EXP',
  // IngresoMaterialPage Ruta A (ids de TIPOS_MATERIAL)
  sello_esporas: 'ESP',
  explanto: 'EXP',
  micelio: 'AGA',
  grano: 'GRA',
  liquido: 'DES',
  // IngresoMaterialPage Ruta B (Formato de Recepción)
  'Jeringa líquida': 'JER',
  'Sello de esporas': 'ESP',
  'Placa colonizada': 'AGA',
  'Tubo/Slant': 'AGA',
  'Spawn externo': 'GRA',
  'Granos colonizados': 'GRA',
  'Cultivo líquido': 'DES',
  /* Códigos ya canónicos (idempotente: getTipoMaterialCodigo('ESP') === 'ESP') */
  ESP: 'ESP',
  EXP: 'EXP',
  JER: 'JER',
  AGA: 'AGA',
  GRA: 'GRA',
  DES: 'DES'
};

export function getTipoMaterialCodigo(tipoMaterial) {
  return TIPO_MATERIAL_CODES[tipoMaterial] || 'DES';
}