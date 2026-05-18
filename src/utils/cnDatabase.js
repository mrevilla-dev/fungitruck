/**
 * Base de datos estática ("Fallback") de parámetros bioquímicos
 * de materiales estandarizados en micología.
 * Extraído de la planilla del laboratorio (Mayo 2026).
 */

export const CN_DATABASE = [
  { nombre: "Trigo", c: 45, n: 2.0 },
  { nombre: "Mijo", c: 44, n: 1.8 },
  { nombre: "Arroz integral", c: 44, n: 1.5 },
  { nombre: "Cebada", c: 45, n: 1.8 },
  { nombre: "Maiz", c: 44, n: 1.5 },
  { nombre: "Sorgo", c: 44, n: 1.5 },
  { nombre: "Salvado trigo", c: 45, n: 2.5 },
  { nombre: "Avena", c: 45, n: 2.0 },
  { nombre: "Centeno", c: 45, n: 1.8 },
  { nombre: "Quinoa", c: 45, n: 3.0 },
  { nombre: "Miel", c: 40, n: 0.1 },
  { nombre: "Melaza", c: 40, n: 0.5 },
  { nombre: "Extracto levadura", c: 40, n: 10.0 },
  { nombre: "Peptona", c: 40, n: 15.0 },
  { nombre: "Harina soja", c: 45, n: 7.0 },
  { nombre: "Harina insecto", c: 45, n: 9.0 },
  { nombre: "Harina langostino", c: 40, n: 8.0 },
  { nombre: "Aserrin", c: 50, n: 0.1 },
  { nombre: "Aserrín madera dura", c: 50, n: 0.1 },
  { nombre: "Paja trigo", c: 45, n: 0.5 },
  { nombre: "Bagazo cerveza", c: 45, n: 4.0 },
  { nombre: "Pulpa remolacha", c: 40, n: 1.5 },
  { nombre: "Cascara arroz", c: 40, n: 0.5 },
  { nombre: "Celulosa", c: 44, n: 0.0 },
  { nombre: "CMC", c: 40, n: 0.0 },
  { nombre: "Agar", c: 0, n: 0.0 } // Neutral base
];

/**
 * Normaliza un texto removiendo acentos, espacios extras y pasándolo a minúsculas.
 */
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

/**
 * Busca valores de C/N de respaldo intentando encontrar
 * coincidencias en el nombre del material.
 * @param {string} nombreInsumo - El nombre del insumo registrado en base
 * @returns {Object|null} - { c, n } si hay match, o null
 */
export const getFallbackCN = (nombreInsumo) => {
  if (!nombreInsumo) return null;
  const target = normalizeText(nombreInsumo);

  // 1. Búsqueda exacta (tras normalizar)
  let match = CN_DATABASE.find(item => normalizeText(item.nombre) === target);
  
  if (!match) {
    // 2. Búsqueda por inclusión parcial (ej: "Aserrín de roble" -> matchea con "Aserrin")
    match = CN_DATABASE.find(item => target.includes(normalizeText(item.nombre)));
  }

  return match ? { c: match.c, n: match.n } : null;
};
