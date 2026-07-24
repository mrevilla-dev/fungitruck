import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Construye el árbol completo centrado en un batch
 * Retorna estructura compatible con React Flow
 */
export async function construirArbolDesdeBatch(batchId) {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error('Batch no encontrado');

  const nodos = [];
  const aristas = [];

  // Nodo central — el batch escaneado
  nodos.push(crearNodoBatch(batch, { esFoco: true }));

  // Árbol hacia arriba — ancestros
  await construirHaciaArriba(batch, nodos, aristas);

  // Árbol hacia abajo — descendientes
  await construirHaciaAbajo(batch, nodos, aristas);

  const { nodosResult, aristasResult } = aplicarColapsoInteligente(nodos, aristas);

  return { nodos: nodosResult, aristas: aristasResult, foco: batchId };
}

/**
 * Construye el árbol completo centrado en un ejemplar
 */
export async function construirArbolDesdeEjemplar(ejemplarId) {
  const ejemplar = await getEjemplar(ejemplarId);
  if (!ejemplar) throw new Error('Ejemplar no encontrado');

  const nodos = [];
  const aristas = [];

  // Nodo central — el ejemplar
  nodos.push(crearNodoEjemplar(ejemplar, { esFoco: true }));

  // Hacia arriba — esporoma origen si existe
  if (ejemplar.esporoma_origen_id) {
    const esporoma = await getEsporoma(ejemplar.esporoma_origen_id);
    if (esporoma) {
      nodos.push(crearNodoEsporoma(esporoma));
      aristas.push(crearArista(esporoma.id, ejemplar.id, 'origen'));
    }
  }

  // Hacia abajo — todos los batches de este ejemplar
  const batches = await getBatchesDeEjemplar(ejemplarId);
  for (const b of batches) {
    nodos.push(crearNodoBatch(b));
    aristas.push(crearArista(ejemplarId, b.id, 'batch'));
    await construirHaciaAbajo(b, nodos, aristas);
  }

  const { nodosResult, aristasResult } = aplicarColapsoInteligente(nodos, aristas);

  return { nodos: nodosResult, aristas: aristasResult, foco: ejemplarId };
}

// ─── CONSTRUCCIÓN HACIA ARRIBA ──────────────────────────────────────────────

async function construirHaciaArriba(batch, nodos, aristas) {
  if (!batch.ejemplarId) return;

  // 1. Ejemplar del batch
  const ejemplar = await getEjemplar(batch.ejemplarId);
  if (ejemplar) {
    if (!nodos.find(n => n.id === ejemplar.id)) {
      nodos.push(crearNodoEjemplar(ejemplar));
    }
    aristas.push(crearArista(ejemplar.id, batch.id, 'ejemplar'));

    // 2. Esporoma origen
    if (ejemplar.esporoma_origen_id) {
      const esporoma = await getEsporoma(ejemplar.esporoma_origen_id);
      if (esporoma) {
        if (!nodos.find(n => n.id === esporoma.id)) {
          nodos.push(crearNodoEsporoma(esporoma));
        }
        aristas.push(crearArista(esporoma.id, ejemplar.id, 'origen'));
      }
    }

    // 3. Si vino de hibridación — dos padres
    if (ejemplar.ejemplar_padre_id) {
      const padre = await getEjemplar(ejemplar.ejemplar_padre_id);
      if (padre) {
        if (!nodos.find(n => n.id === padre.id)) {
          nodos.push(crearNodoEjemplar(padre, { esHibridacion: true }));
        }
        aristas.push(crearArista(padre.id, ejemplar.id, 'hibridacion'));
      }
    }
    if (ejemplar.ejemplar_madre_id) {
      const madre = await getEjemplar(ejemplar.ejemplar_madre_id);
      if (madre) {
        if (!nodos.find(n => n.id === madre.id)) {
          nodos.push(crearNodoEjemplar(madre, { esHibridacion: true }));
        }
        aristas.push(crearArista(madre.id, ejemplar.id, 'hibridacion'));
      }
    }
  }
}

// ─── CONSTRUCCIÓN HACIA ABAJO ───────────────────────────────────────────────

async function construirHaciaAbajo(batch, nodos, aristas) {
  // Cosechas del batch
  const cosechas = await getCosechasDelBatch(batch.id);
  for (const cosecha of cosechas) {
    if (!nodos.find(n => n.id === cosecha.id)) {
      nodos.push(crearNodoCosecha(cosecha));
    }
    aristas.push(crearArista(batch.id, cosecha.id, 'cosecha'));
  }

  // Crioviales del batch
  const crioviales = await getCriovialesDelBatch(batch.id);
  if (crioviales.length > 0) {
    const crioNodoId = `crio-${batch.id}`;
    if (!nodos.find(n => n.id === crioNodoId)) {
      // Agrupar en un nodo resumen de criopreservación
      nodos.push(crearNodoCrioResumen(batch.id, crioviales));
    }
    aristas.push(crearArista(batch.id, crioNodoId, 'criopreservacion'));
  }
}

// ─── CREADORES DE NODOS ─────────────────────────────────────────────────────

function crearNodoBatch(batch, opciones = {}) {
  return {
    id: batch.id,
    type: 'batchNode',
    data: {
      tipo: 'batch',
      esFoco: opciones.esFoco ?? false,
      id: batch.id,
      status: batch.status ?? 'Inoculado',
      tipoContenedor: batch.tipoContenedor ?? '',
      medioPrepNombre: batch.medio_prep?.nombre_receta ?? batch.medio_prep?.alias ?? batch.medio_prep?.nombre ?? batch.medioPrepId ?? 'Sin medio',
      salaDestino: batch.sala_destino?.nombre ?? batch.destinoNombre ?? batch.destinoId ?? 'Sin sala',
      numeroTransferencia: batch.numero_transferencia ?? 1,
      fechaInoculacion: batch.fechaInoculacion ?? '',
      fotoUrl: batch.fotoUrl ?? batch.foto_url ?? null,
      operador: batch.operator ?? batch.operador ?? batch.operario ?? '',
      atributosExperimentales: batch.atributos_experimentales ?? {},
      experimento_id: batch.experimento_id ?? null,
    },
    position: { x: 0, y: 0 }, // React Flow calcula layout automático
  };
}

function crearNodoEjemplar(ejemplar, opciones = {}) {
  return {
    id: ejemplar.id,
    type: 'ejemplarNode',
    data: {
      tipo: 'ejemplar',
      esFoco: opciones.esFoco ?? false,
      esHibridacion: opciones.esHibridacion ?? false,
      id: ejemplar.id,
      genero: ejemplar.genero ?? '',
      especie: ejemplar.especie ?? '',
      cepa: ejemplar.codigo_cepa ?? '',
      tipoMaterial: ejemplar.tipo_material ?? 'Desconocido',
      ploidia: ejemplar.ploidia ?? '',
      tipoMicelio: ejemplar.tipo_micelio ?? '',
      mat: ejemplar.mat ?? '',
      estado: ejemplar.estado ?? 'Activo',
      generacion: ejemplar.generacion ?? null,
      esporomaOrigen: ejemplar.esporoma_origen_id ?? null,
      fotoUrl: ejemplar.fotoUrl ?? ejemplar.foto_url ?? ejemplar.foto_principal ?? null,
      _ejemplarId: ejemplar.id,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoEsporoma(esporoma) {
  return {
    id: esporoma.id,
    type: 'esporomaNode',
    data: {
      tipo: 'esporoma',
      id: esporoma.id,
      genero: esporoma.genero ?? '',
      especie: esporoma.especie ?? '',
      cepa: esporoma.codigo_cepa ?? '',
      origen_material: esporoma.origen_material ?? '',
      fechaRecoleccion: esporoma.fechaRecoleccion ?? '',
      fotoUrl: esporoma.fotoUrl ?? esporoma.foto_url ?? esporoma.foto_principal ?? null,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoCosecha(cosecha) {
  return {
    id: cosecha.id,
    type: 'cosechaNode',
    data: {
      tipo: 'cosecha',
      id: cosecha.id,
      fecha: cosecha.fecha_cosecha ?? '',
      pesoFrescoG: cosecha.peso_fresco_g ?? 0,
      ebOleada: cosecha.eb_oleada ?? null,
      ebAcumulada: cosecha.eb_acumulada ?? null,
      numeroOleada: cosecha.numero_oleada ?? 1,
    },
    position: { x: 0, y: 0 },
  };
}

function crearNodoCrioResumen(batchId, crioviales) {
  const activos = crioviales.filter(c => c.estado === 'Criopreservado').length;
  return {
    id: `crio-${batchId}`,
    type: 'crioResumenNode',
    data: {
      tipo: 'crioResumen',
      total: crioviales.length,
      activos,
      crioviales,
    },
    position: { x: 0, y: 0 },
  };
}

// ─── CREADOR DE ARISTAS ─────────────────────────────────────────────────────

function crearArista(desde, hasta, tipo) {
  const colores = {
    origen:          '#9C27B0', // violeta — vínculo genético
    repique:         '#2196F3', // azul — transferencia
    hibridacion:     '#FF5722', // naranja — hibridación
    cosecha:         '#4CAF50', // verde — producción
    criopreservacion:'#00BCD4', // cyan — criobanco
    batch:           '#607D8B', // gris azulado — ejemplar → batch
    ejemplar:        '#9C27B0', // violeta
  };

  return {
    id: `${desde}-${hasta}`,
    source: desde,
    target: hasta,
    type: 'smoothstep',
    style: { stroke: colores[tipo] ?? '#9E9E9E', strokeWidth: 2 },
    animated: tipo === 'hibridacion',
  };
}

// ─── QUERIES FIRESTORE ──────────────────────────────────────────────────────

async function getBatch(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'batches', id));
    if (!snap.exists()) return null;
    const data = snap.data();

    // Resolver medio_prep
    if (data.medioPrepId) {
      const medioSnap = await getDoc(doc(db, 'medios_preparados', data.medioPrepId));
      if (medioSnap.exists()) {
        data.medio_prep = medioSnap.data();
      }
    }

    // Resolver sala destino
    if (data.destinoId) {
      const salaSnap = await getDoc(doc(db, 'salas', data.destinoId));
      if (salaSnap.exists()) {
        data.sala_destino = salaSnap.data();
      }
    }

    return { ...data, id: snap.id };
  } catch (e) {
    console.error('Error getBatch:', e);
    return null;
  }
}

async function getEjemplar(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'ejemplares', id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch (e) {
    console.error('Error getEjemplar:', e);
    return null;
  }
}

async function getEsporoma(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'esporomas', id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch (e) {
    console.error('Error getEsporoma:', e);
    return null;
  }
}

async function getBatchesDeEjemplar(ejemplarId) {
  try {
    const q = query(
      collection(db, 'batches'),
      where('ejemplarId', '==', ejemplarId)
    );
    const snap = await getDocs(q);
    const batches = [];
    for (const d of snap.docs) {
      const data = { ...d.data(), id: d.id };
      if (data.medioPrepId) {
        const medioSnap = await getDoc(doc(db, 'medios_preparados', data.medioPrepId));
        if (medioSnap.exists()) data.medio_prep = medioSnap.data();
      }
      batches.push(data);
    }
    return batches;
  } catch (e) {
    console.error('Error getBatchesDeEjemplar:', e);
    return [];
  }
}

async function getCosechasDelBatch(batchId) {
  try {
    const q = query(
      collection(db, 'cosechas'),
      where('batchId', '==', batchId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    return [];
  }
}

async function getCriovialesDelBatch(batchId) {
  try {
    const criovialesQ = query(
      collection(db, 'criopreservacion'),
      where('batchOrigenId', '==', batchId)
    );
    const criovialesSnap = await getDocs(criovialesQ);
    return criovialesSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    return [];
  }
}

// ─── COLAPSO INTELIGENTE ────────────────────────────────────────────────────

function aplicarColapsoInteligente(nodos, aristas) {
  const MAX_HIJOS = 10;
  let aristasResult = [...aristas];
  let nodosResult = [...nodos];

  // Identificar los hijos de cada nodo
  const hijosPorNodo = {};
  aristas.forEach(a => {
    if (!hijosPorNodo[a.source]) hijosPorNodo[a.source] = [];
    hijosPorNodo[a.source].push(a);
  });

  // Iterar por cada nodo padre para ver si excede MAX_HIJOS
  const nodosAEliminar = new Set();
  const aristasAEliminar = new Set();

  Object.entries(hijosPorNodo).forEach(([sourceId, edges]) => {
    if (edges.length > MAX_HIJOS) {
      // Ordenamos por algún criterio estable si queremos, pero dejemos el natural
      const aristasAConservar = edges.slice(0, MAX_HIJOS);
      const aristasAColapsar = edges.slice(MAX_HIJOS);

      aristasAColapsar.forEach(a => {
        aristasAEliminar.add(a.id);
        nodosAEliminar.add(a.target);
        marcarDescendenciaParaEliminar(a.target, hijosPorNodo, nodosAEliminar, aristasAEliminar);
      });

      // Crear nodo de colapso
      const colapsoId = `colapso_${sourceId}`;
      nodosResult.push({
        id: colapsoId,
        type: 'colapsoNode',
        data: {
          tipo: 'colapso',
          cantidad: aristasAColapsar.length,
          sourceId,
        },
        position: { x: 0, y: 0 }
      });

      // Conectar source con el nodo colapso
      aristasResult.push(crearArista(sourceId, colapsoId, 'batch')); // color gris/neutro
    }
  });

  // Filtrar los arrays finales
  nodosResult = nodosResult.filter(n => !nodosAEliminar.has(n.id));
  aristasResult = aristasResult.filter(a => !aristasAEliminar.has(a.id));

  return { nodosResult, aristasResult };
}

function marcarDescendenciaParaEliminar(nodoId, hijosPorNodo, nodosAEliminar, aristasAEliminar) {
  const hijos = hijosPorNodo[nodoId] || [];
  hijos.forEach(a => {
    aristasAEliminar.add(a.id);
    nodosAEliminar.add(a.target);
    marcarDescendenciaParaEliminar(a.target, hijosPorNodo, nodosAEliminar, aristasAEliminar);
  });
}
