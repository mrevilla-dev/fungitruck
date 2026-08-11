const TIPO_MICELIO = {
  monocarion: 'Monocarión (n)',
  dicarion: 'Dicarión (n+n)',
  polisporico: 'Polispórico',
};

const PLOIDIA = {
  haploide: 'Haploide (n)',
  nn: 'Dicarión (n+n)',
  diploide: 'Diploide (2n)',
  desconocido: 'Desconocido',
};

const TIPO_MATERIAL = {
  sello_esporas: 'Sello de esporas',
  explanto: 'Explanto de tejido',
  micelio: 'Micelio en agar',
  grano: 'Grano colonizado',
  liquido: 'Cultivo líquido',
};

const TECNICA = {
  aislamiento_primario: 'Aislamiento primario (origen cero)',
  explanto_estipite: 'Explanto de estípite',
  explanto_pileo: 'Explanto de pileo',
  transferencia: 'Transferencia aséptica',
  germinacion: 'Germinación de esporas',
  subcultivo: 'Subcultivo',
  agotamiento_superficie: 'Agotamiento en superficie',
  aislamiento_monosporico: 'Aislamiento monospórico',
  esporulacion_directa: 'Esporulación directa',
  explanto_directo: 'Explanto directo',
  aislamiento_colonias: 'Aislamiento de colonias',
  na: 'No aplica',
};

const MAPAS = { tipo_micelio: TIPO_MICELIO, ploidia: PLOIDIA, tipo_material: TIPO_MATERIAL, tecnica: TECNICA };

const ALIASES = {
  tipo_micelio: {
    'dicarion': 'dicarion', 'dicariado': 'dicarion', 'dicario': 'dicarion',
    'monocarion': 'monocarion', 'monocario': 'monocarion',
    'polisporico': 'polisporico',
    'poblacion': 'polisporico',
  },
  ploidia: {
    'haploide': 'haploide', 'haploide (n)': 'haploide',
    'nn': 'nn', 'dicarion (n+n)': 'nn', 'dicarion (n + n)': 'nn', 'dicariotico': 'nn', 'n+n': 'nn',
    'diploide': 'diploide', 'diploide (2n)': 'diploide',
    'desconocido': 'desconocido', 'no determinado': 'desconocido',
  },
  tipo_material: {
    'esp': 'sello_esporas', 'sello de esporas': 'sello_esporas', 'sello esporas': 'sello_esporas', 'esporas': 'sello_esporas',
    'exp': 'explanto', 'explanto': 'explanto', 'explanto de tejido': 'explanto',
    'aga': 'micelio', 'micelio': 'micelio', 'micelio en agar': 'micelio', 'placa colonizada': 'micelio', 'tubo/slant': 'micelio',
    'gra': 'grano', 'grano': 'grano', 'grano colonizado': 'grano', 'granos colonizados': 'grano', 'spawn externo': 'grano',
    'jer': 'liquido', 'liquido': 'liquido', 'cultivo liquido': 'liquido', 'jeringa liquida': 'liquido',
  },
  tecnica: {
    'aislamiento primario (origen cero)': 'aislamiento_primario', 'aislamiento primario': 'aislamiento_primario',
    'explanto de estipite': 'explanto_estipite', 'explanto de pileo': 'explanto_pileo',
    'transferencia aseptica': 'transferencia', 'transferencia': 'transferencia',
    'germinacion de esporas': 'germinacion', 'germinacion': 'germinacion',
    'subcultivo': 'subcultivo',
    'agotamiento en superficie': 'agotamiento_superficie', 'agotamiento superficie': 'agotamiento_superficie',
    'aislamiento monosporico': 'aislamiento_monosporico',
    'esporulacion directa': 'esporulacion_directa',
    'explanto directo': 'explanto_directo',
    'aislamiento de colonias': 'aislamiento_colonias',
    'material externo': 'na', 'na': 'na', 'n/a': 'na', 'no aplica': 'na',
  },
};

export function normalizarValor(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function idCanonico(campo, valor) {
  const n = normalizarValor(valor);
  if (!n) return null;
  if (Object.prototype.hasOwnProperty.call(MAPAS[campo] || {}, n)) return n;
  const alias = (ALIASES[campo] || {})[n];
  return alias || null;
}

export function labelDe(campo, valor, contexto = {}) {
  const id = idCanonico(campo, valor);
  if (!id) return 'Desconocido';
  if (campo === 'ploidia' && id === 'diploide' && idCanonico('tipo_micelio', contexto.tipo_micelio) === 'dicarion') {
    return PLOIDIA.nn;
  }
  return MAPAS[campo][id];
}

export function opcionesDe(campo) {
  return Object.entries(MAPAS[campo] || {}).map(([id, label]) => ({ id, label }));
}

export function ploidiaSugerida(tipoMicelio) {
  const id = idCanonico('tipo_micelio', tipoMicelio);
  if (id === 'monocarion') return 'haploide';
  if (id === 'dicarion') return 'nn';
  if (id === 'polisporico') return 'desconocido';
  return '';
}