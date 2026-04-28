import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Genera un ID semántico tipo GEN-ESP-SUST-0001
 * GEN: 3 letras del género (ej: PLO)
 * ESP: 3 letras de la especie (ej: OST)
 * SUST: 3 letras del sustrato (ej: APD)
 */
export async function generateSemanticId(genero, especie, sustrato) {
  if (!genero || !especie || !sustrato) {
    throw new Error("Datos insuficientes para generar ID Semántico. Género, Especie y Sustrato son obligatorios.");
  }
  
  // Limpiar y normalizar a 3 letras
  const g = genero.slice(0, 3).toUpperCase();
  const e = especie.slice(0, 3).toUpperCase();
  const s = sustrato.slice(0, 3).toUpperCase();
  
  const counterId = `${g}-${e}-${s}`;
  const counterRef = doc(db, 'counters', counterId);

  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let count = 1;
      
      if (counterDoc.exists()) {
        count = counterDoc.data().count + 1;
      }
      
      transaction.set(counterRef, { count });
      return count;
    });

    // Formatear con ceros a la izquierda (4 dígitos)
    const seq = newCount.toString().padStart(4, '0');
    return `${g}-${e}-${s}-${seq}`;
  } catch (error) {
    console.error("Error al generar ID semántico:", error);
    throw error; // No permitimos un fallback a ERR para forzar la integridad
  }
}

export const SUBSTRATE_CODES = {
  "Agar Papa Dextrosa (APD)": "APD",
  "Agar Malta (AM)": "AMT",
  "Agar AMCCC (Malta + Carbonato + CMMC + Celulosa)": "CCC",
  "Agar Nutritivo": "NUT",
  "Grano de Trigo esterilizado": "GTR",
  "Grano de Centeno esterilizado": "GCE",
  "Sustrato lignocelulósico (paja de trigo)": "SLI",
  "Medio líquido (agitación)": "LIQ",
  "Otro": "OTR"
};

export function getSubstrateCode(name) {
  return SUBSTRATE_CODES[name] || name.slice(0, 3).toUpperCase();
}
