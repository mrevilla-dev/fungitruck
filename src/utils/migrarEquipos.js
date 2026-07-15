import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { generarIdEquipo } from './idGenerator';

/**
 * Categorías que se consideran destino de batches automáticamente
 */
const CATEGORIAS_DESTINO = ['Incubación', 'Refrigeración', 'Freezer'];

/**
 * Mapeo de categorías de insumos_base a categorías de equipos
 */
function mapearCategoria(categoriaInsumo) {
  const mapa = {
    'Equipamiento': 'Laboratorio', // default si no hay más info
  };
  return mapa[categoriaInsumo] ?? 'Otro';
}

/**
 * Migra equipos de insumos_base a la colección equipos
 * SOLO migra ítems con categoria === "Equipamiento"
 * NO elimina los ítems originales — los marca como migrados
 */
export async function migrarEquiposDesdeInsumos() {
  const resultados = { migrados: 0, errores: [], omitidos: 0 };

  try {
    // 1. Buscar todos los equipos en insumos_base
    const q = query(
      collection(db, 'insumos_base'),
      where('categoria', '==', 'Equipamiento')
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      console.log('No se encontraron equipos en insumos_base');
      return resultados;
    }

    console.log(`Encontrados ${snap.docs.length} equipos para migrar`);

    // 2. Migrar uno a uno (no en batch para respetar generación de IDs atómicos)
    for (const insumoDoc of snap.docs) {
      try {
        const insumo = insumoDoc.data();

        // Verificar si ya fue migrado
        if (insumo.migrado_a_equipos) {
          resultados.omitidos++;
          continue;
        }

        const nuevoId = await generarIdEquipo(db);

        // Inferir categoría desde nombre si es posible
        const nombre = insumo.nombre?.toLowerCase() ?? '';
        let categoria = 'Laboratorio';
        if (nombre.includes('estufa') || nombre.includes('incubador')) {
          categoria = 'Incubación';
        } else if (nombre.includes('heladera') || nombre.includes('frío') || nombre.includes('frio')) {
          categoria = 'Refrigeración';
        } else if (nombre.includes('freezer') || nombre.includes('frizer')) {
          categoria = 'Freezer';
        }

        const equipo = {
          id: nuevoId,
          nombre: insumo.nombre ?? '',
          categoria,
          marca_modelo: insumo.marca_modelo ?? '',
          nro_serie: insumo.nro_serie ?? '',
          propietario: insumo.propietario ?? 'Facultad',
          fecha_adquisicion: insumo.fecha_adquisicion ?? null,
          vida_util_anios: insumo.vida_util_anios ?? null,
          valor_compra: insumo.valor_compra ?? 0,
          valor_residual: insumo.valor_residual ?? 0,
          sala_actual_id: null,
          es_destino_de_batches: CATEGORIAS_DESTINO.includes(categoria),
          estado_operativo: 'Operativo',
          parametros_ideales: {
            temp_min: null,
            temp_max: null,
            hum_min: null,
            hum_max: null,
          },
          foto_url: insumo.foto_url ?? '',
          notas: insumo.notas ?? '',
          migrado_desde_insumo_id: insumoDoc.id,
          fecha_creacion: serverTimestamp(),
          operario: 'Migración automática',
        };

        // Crear en equipos
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'equipos', nuevoId), equipo);

        // Marcar el insumo original como migrado (NO eliminarlo)
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'insumos_base', insumoDoc.id), {
          migrado_a_equipos: true,
          equipo_id_nuevo: nuevoId,
        });

        resultados.migrados++;
        console.log(`✅ Migrado: ${insumo.nombre} → ${nuevoId}`);

      } catch (err) {
        resultados.errores.push({ insumoId: insumoDoc.id, error: err.message });
        console.error(`❌ Error migrando ${insumoDoc.id}:`, err);
      }
    }

  } catch (err) {
    console.error('Error general en migración:', err);
    resultados.errores.push({ error: err.message });
  }

  return resultados;
}
