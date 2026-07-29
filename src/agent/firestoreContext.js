import { db } from '../firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

const CACHE_TTL = 60000;
let cache = { data: null, timestamp: 0 };

export async function buildContext() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  try {
    const [esporomasSnap, ejemplaresSnap, batchesSnap, mediosSnap, eventosSnap] = await Promise.all([
      getDocs(query(collection(db, 'esporomas'), limit(50))),
      getDocs(query(collection(db, 'ejemplares'), where('eliminado', '==', false), limit(100))),
      getDocs(query(collection(db, 'batches'), where('status', 'in', ['Activo', 'Incubando', 'Inoculado']), limit(100))),
      getDocs(collection(db, 'medios_preparados')),
      getDocs(query(collection(db, 'eventos_aislamiento'), limit(50)))
    ]);

    const esporomas = esporomasSnap.docs.map(d => d.data());
    const ejemplares = ejemplaresSnap.docs.map(d => d.data());
    const batches = batchesSnap.docs.map(d => d.data());
    const medios = mediosSnap.docs.map(d => d.data());
    const eventos = eventosSnap.docs.map(d => d.data());

    const stockMedios = medios
      .filter(m => m.estado === 'Activo')
      .map(m => ({
        id: m.id,
        nombre: m.alias || m.nombre_receta,
        stock: m.stock_bulk?.cantidad_actual || 0,
        unidad: m.stock_bulk?.unidad || 'ml'
      }))
      .filter(m => m.stock > 0);

    const batchesPorEstado = {};
    batches.forEach(b => {
      batchesPorEstado[b.status] = (batchesPorEstado[b.status] || 0) + 1;
    });

    const context = `
ESTADO ACTUAL DEL LABORATORIO:
- Esporomas registrados: ${esporomas.length} (últimos 50)
- Ejemplares activos: ${ejemplares.length}
- Batches activos: ${batches.length} (${Object.entries(batchesPorEstado).map(([k,v]) => `${k}: ${v}`).join(', ')})
- Medios con stock: ${stockMedios.length}

STOCK DE MEDIOS:
${stockMedios.map(m => `- ${m.nombre}: ${m.stock} ${m.unidad}`).join('\n')}

ÚLTIMOS ESPOROMAS:
${esporomas.slice(0, 5).map(e => `- ${e.id}: ${e.genero} ${e.especie} (${e.origen || 'N/A'})`).join('\n')}

ÚLTIMOS EJEMPLARES:
${ejemplares.slice(0, 5).map(e => `- ${e.id_semantico || e.id}: ${e.genero} ${e.especie} [${e.estado}]`).join('\n')}
    `.trim();

    cache = { data: context, timestamp: now };
    return context;
  } catch (err) {
    console.error('Error building context:', err);
    return 'Error al cargar datos de Firestore.';
  }
}

export async function consultarStock(medioNombre) {
  const snap = await getDocs(collection(db, 'medios_preparados'));
  const medios = snap.docs.map(d => d.data());
  const encontrado = medios.find(m =>
    (m.alias || '').toLowerCase().includes(medioNombre.toLowerCase()) ||
    (m.nombre_receta || '').toLowerCase().includes(medioNombre.toLowerCase())
  );
  if (!encontrado) return null;
  return {
    nombre: encontrado.alias || encontrado.nombre_receta,
    stock: encontrado.stock_bulk?.cantidad_actual || 0,
    unidad: encontrado.stock_bulk?.unidad || 'ml'
  };
}

export async function buscarEjemplar(nombre) {
  const snap = await getDocs(query(collection(db, 'ejemplares'), where('eliminado', '==', false)));
  const ejemplares = snap.docs.map(d => d.data());
  return ejemplares.find(e =>
    (e.genero || '').toLowerCase().includes(nombre.toLowerCase()) ||
    (e.especie || '').toLowerCase().includes(nombre.toLowerCase()) ||
    (e.id_semantico || e.id || '').toLowerCase().includes(nombre.toLowerCase())
  );
}
