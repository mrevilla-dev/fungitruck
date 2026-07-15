import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

/**
 * Resuelve el peso seco del sustrato con fallback estricto.
 * Orden: peso_seco_pct → peso_seco_sustrato_g → manual (null)
 * Si usa peso_seco_pct, requiere el peso húmedo total para convertir a gramos.
 * 
 * @param {Object} batch Lote del cual extraer datos
 * @param {Number} pesoHumedoTotal Peso húmedo post-cosecha (si está disponible)
 * @returns {{ valor: number|null, fuente: 'auditoria'|'receta'|'manual' }}
 */
export function resolverPesoSeco(batch, pesoHumedoTotal) {
  if (batch.peso_seco_pct && batch.peso_seco_pct > 0) {
    if (pesoHumedoTotal && pesoHumedoTotal > 0) {
      return { 
        valor: (Number(batch.peso_seco_pct) / 100) * Number(pesoHumedoTotal), 
        fuente: 'auditoria' 
      };
    }
    // Si tenemos pct pero no tenemos peso húmedo para calcular, pedimos manual
    return { valor: null, fuente: 'manual' };
  }

  if (batch.peso_seco_sustrato_g && batch.peso_seco_sustrato_g > 0) {
    return { 
      valor: Number(batch.peso_seco_sustrato_g), 
      fuente: 'receta' 
    };
  }

  return { valor: null, fuente: 'manual' };
}

/**
 * Consulta las condiciones ambientales de la sala del lote.
 * Si el registro existe y es < 24h: retorna { temperatura, humedad, fuente: 'mantenimiento' }
 * Si no: retorna { temperatura: '', humedad: '', fuente: 'manual' }
 * 
 * @param {Object} db Instancia de Firestore
 * @param {string} destinoId ID de la sala/destino
 * @returns {Promise<{ temperatura: string, humedad: string, fuente: 'mantenimiento'|'manual' }>}
 */
export async function obtenerCondicionesAmbientales(db, destinoId) {
  if (!destinoId) return { temperatura: '', humedad: '', fuente: 'manual' };

  try {
    const q = query(
      collection(db, "mantenimiento"),
      where("destinoId", "==", destinoId),
      where("tipo", "==", "Temperatura"),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0].data();
      // Compatibilidad si createdAt es Timestamp o String ISO
      let createdAt;
      if (docData.createdAt?.toDate) {
        createdAt = docData.createdAt.toDate();
      } else if (docData.createdAt) {
        createdAt = new Date(docData.createdAt);
      }
      
      if (createdAt && !isNaN(createdAt.getTime())) {
        const now = new Date();
        const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
        
        if (hoursDiff <= 24) {
          return {
            temperatura: docData.temperatura || '',
            humedad: docData.humedad || '',
            fuente: 'mantenimiento'
          };
        }
      }
    }
  } catch (err) {
    console.error("Error al obtener condiciones ambientales:", err);
  }

  return { temperatura: '', humedad: '', fuente: 'manual' };
}
