import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

// Mapa de migración: categoría vieja → categoría nueva
const CATEGORY_MIGRATION_MAP = {
  'Químicos/Medios': 'Medios y reactivos',
  'Granos/Sustratos': 'Sustratos y granos',
  'Consumibles y Empaque': 'Descartables',
  'Sanidad': 'Bioseguridad',
};

const MIGRATION_KEY = 'fungitrack_categories_migrated_v2';

/**
 * Migra las categorías de insumos_base e insumos_lotes a los nuevos nombres.
 * Corre una sola vez, guardando flag en localStorage.
 */
export async function migrateCategoriesIfNeeded() {
  // Evitar re-ejecución
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return;

  console.log('[FungiTrack] Ejecutando migración de categorías...');

  try {
    // --- Migrar insumos_base ---
    const insumosSnap = await getDocs(collection(db, 'insumos_base'));
    const batch1 = writeBatch(db);
    let count1 = 0;

    insumosSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const nuevaCategoria = CATEGORY_MIGRATION_MAP[data.categoria];
      if (nuevaCategoria) {
        batch1.update(doc(db, 'insumos_base', docSnap.id), { categoria: nuevaCategoria });
        count1++;
        console.log(`  [insumos_base] "${docSnap.data().nombre}": "${data.categoria}" → "${nuevaCategoria}"`);
      }
    });

    if (count1 > 0) await batch1.commit();

    // --- Migrar insumos_lotes (campo categoria si existe) ---
    const lotesSnap = await getDocs(collection(db, 'insumos_lotes'));
    const batch2 = writeBatch(db);
    let count2 = 0;

    lotesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const nuevaCategoria = CATEGORY_MIGRATION_MAP[data.categoria];
      if (nuevaCategoria) {
        batch2.update(doc(db, 'insumos_lotes', docSnap.id), { categoria: nuevaCategoria });
        count2++;
      }
    });

    if (count2 > 0) await batch2.commit();

    console.log(`[FungiTrack] Migración completada: ${count1} insumos base, ${count2} lotes actualizados.`);
    localStorage.setItem(MIGRATION_KEY, 'done');
  } catch (err) {
    console.error('[FungiTrack] Error en migración de categorías:', err);
  }
}
