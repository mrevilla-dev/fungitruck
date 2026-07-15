import dagre from 'dagre';

const NODE_WIDTH = 220;
const NODE_HEIGHT_COLLAPSED = 80;
const NODE_HEIGHT_EXPANDED = 200;

/**
 * Calcula posiciones de nodos usando Dagre
 * direction: 'TB' (top-bottom, mobile) | 'LR' (left-right, desktop)
 */
export function calcularLayout(nodos, aristas, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  nodos.forEach(nodo => {
    // Si es foco, asumimos que está expandido y requiere más altura
    const height = nodo.data?.esFoco ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED;
    dagreGraph.setNode(nodo.id, {
      width: NODE_WIDTH,
      height: height,
    });
  });

  aristas.forEach(arista => {
    dagreGraph.setEdge(arista.source, arista.target);
  });

  dagre.layout(dagreGraph);

  return nodos.map(nodo => {
    const nodeWithPosition = dagreGraph.node(nodo.id);
    
    // Si la dirección es horizontal (LR), las entradas y salidas de los handles deben estar a los costados
    // Pero en el prompt se especificaba Handles fijos Top/Bottom, para simplificar, Dagre calculará X e Y 
    // y nosotros seteamos targetPosition y sourcePosition según la dirección.
    const isHorizontal = direction === 'LR';
    
    // Como pusimos los handles en position "Top" y "Bottom" por default en los componentes,
    // debemos sobreescribirlos aquí en la data de react-flow si estamos en horizontal
    const sourcePosition = isHorizontal ? 'right' : 'bottom';
    const targetPosition = isHorizontal ? 'left' : 'top';

    return {
      ...nodo,
      sourcePosition,
      targetPosition,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });
}
