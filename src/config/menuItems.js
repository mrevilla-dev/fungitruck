/**
 * Configuración centralizada del menú
 * Usado tanto en la navbar desktop existente como en el panel mobile nuevo
 *
 * IMPORTANTE: No eliminar ítems existentes — solo agregar los nuevos módulos
 * que se hayan implementado (Experimentos, Criobanco, etc.)
 */

export const MENU_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icono: '📊',
    ruta: '/',
  },
  {
    id: 'escanear',
    label: 'Escanear',
    icono: '📷',
    ruta: '/escanear',
  },
  {
    id: 'ingreso',
    label: 'Ingreso',
    icono: '🍄',
    ruta: '/ingreso-material',
  },
  {
    id: 'inventario',
    label: 'Insumos',
    icono: '📦',
    ruta: '/inventario',
  },
  {
    // id: 'medios',
    // label: 'Medios',
    // icono: '🧪',
    // ruta: '/medios', // pendiente — verificar ruta real, puede no existir
  },
  {
    id: 'salas',
    label: 'Salas',
    icono: '🌡️',
    ruta: '/salas',
  },
  {
    id: 'esporomas',
    label: 'Esporomas',
    icono: '🍂',
    ruta: '/esporomas',
  },
  {
    id: 'ejemplares',
    label: 'Ejemplares',
    icono: '🧬',
    ruta: '/ejemplares',
  },
  {
    // id: 'inoculaciones',
    // label: 'Lab',
    // icono: '🧫',
    // ruta: '/inoculaciones', // pendiente — verificar ruta real, puede vivir dentro de /inventario
  },
  {
    id: 'cosechas',
    label: 'Cosecha',
    icono: '🍄',
    ruta: '/cosechas',
  },
  {
    id: 'criobanco',
    label: 'Crío',
    icono: '❄️',
    ruta: '/criobanco',
  },
  {
    id: 'arbol',
    label: 'Árbol',
    icono: '🌳',
    ruta: '/arbol',
  },
  {
    id: 'experimentos',
    label: 'Experim.',
    icono: '🔬',
    ruta: '/experimentos',
  },
  {
    id: 'cola',
    label: 'Cola',
    icono: '📋',
    ruta: '/print-queue',
  },
  {
    id: 'mantenimiento',
    label: 'Mantenim.',
    icono: '🔧',
    ruta: '/mantenimiento',
  },
  {
    id: 'equipos',
    label: 'Equipos',
    icono: '⚙️',
    ruta: '/equipos',
  },
  {
    id: 'limpieza',
    label: 'Limpieza',
    icono: '🧹',
    ruta: '/limpieza-duplicado',
  },
].filter(item => item.id); // Filter out empty commented out items

// Ítems que aparecen en la barra inferior fija (siempre visibles en mobile)
export const MENU_BOTTOM_BAR = ['dashboard', 'escanear'];
// El tercer botón es siempre "Menú" → abre el panel completo

/**
 * Configuración agrupada del menú mobile
 * Laboratorio y Cultivo son grupos de primer nivel.
 * Investigación es un sub-grupo dentro de Cultivo.
 *
 * IMPORTANTE: no incluir Hibridación (sin ruta propia — acción
 * contextual en tabla de Cultivos), ni Medios/Recetas (viven dentro
 * de /inventario, no tienen ruta propia).
 *
 * Rutas verificadas contra App.jsx real.
 */
export const MENU_GROUPS = [
  {
    id: 'laboratorio',
    label: 'Laboratorio',
    icono: '🧪',
    items: [
      { id: 'salas', label: 'Salas', icono: '🌡️', ruta: '/salas' },
      { id: 'mantenimiento', label: 'Mantenim.', icono: '🔧', ruta: '/mantenimiento' },
      { id: 'equipos', label: 'Equipos', icono: '⚙️', ruta: '/equipos' },
      { id: 'limpieza', label: 'Limpieza', icono: '🧹', ruta: '/limpieza-duplicado' },
      { id: 'inventario', label: 'Inventario', icono: '📦', ruta: '/inventario' },
      { id: 'cola', label: 'Cola', icono: '📋', ruta: '/print-queue' },
    ],
  },
  {
    id: 'cultivo',
    label: 'Cultivo',
    icono: '🍄',
    items: [
      { id: 'ingreso', label: 'Ingreso', icono: '📥', ruta: '/ingreso-material' },
      { id: 'ejemplares', label: 'Ejemplares', icono: '🧬', ruta: '/ejemplares' },
      { id: 'esporomas', label: 'Esporomas', icono: '🍂', ruta: '/esporomas' },
      { id: 'criobanco', label: 'Crío', icono: '❄️', ruta: '/criobanco' },
      { id: 'cosechas', label: 'Cosecha', icono: '🍄', ruta: '/cosechas' },
      { id: 'arbol', label: 'Árbol', icono: '🌳', ruta: '/arbol' },
    ],
    subgrupos: [
      {
        id: 'investigacion',
        label: 'Investigación',
        icono: '🔬',
        items: [
          { id: 'experimentos', label: 'Experim.', icono: '🔬', ruta: '/experimentos' },
        ],
      },
    ],
  },
];
