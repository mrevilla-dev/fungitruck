Para Antigravity:

Esta es la primera vez que entrás al proyecto FungiTrack. Leé el archivo deep34.md que te adjunto abajo. Es el Módulo de Equipos completo.

Contexto mínimo del proyecto:

FungiTrack es un LIMS de trazabilidad micológica.

Stack: React 19 + Vite + Firebase Firestore + Firebase Auth + Google Drive + Zebra ZD220.

Web: https://fungitrack-9b463.web.app

Repositorio local: c:/Users/Usuario/Documents/maxi

Implementá los cambios en 7 bloques separados, en orden. Empezá por el Bloque 1.

Reglas:

Un bloque a la vez.

Antes de escribir código, mostrame un plan de implementación y esperá mi confirmación.

Al finalizar cada bloque, ejecutá npm run build y confirmá que no haya errores.

No rompas nada de lo que ya funciona.

Todos los cambios son aditivos.

No modificar DestinoSelector hasta el Bloque 7.
## FungiTrack · Para ejecutar con Antigravity · Bloque a bloque

---

> **ANTES DE EMPEZAR — REGLAS OBLIGATORIAS**
> 1. Leer cada archivo completo antes de modificarlo
> 2. Un bloque a la vez — `npm run build` y confirmar entre bloques
> 3. Cambios aditivos únicamente — no eliminar lógica existente
> 4. Defensive programming: `campo?.subcampo ?? fallback` siempre
> 5. Mostrar plan antes de tocar código y esperar confirmación
> 6. Si el writeBatch falla: toast de error, no resetear el formulario
> 7. IDs: leer `src/utils/idGenerator.js` antes de modificar

---

## CONTEXTO Y DECISIONES DE DISEÑO

### Situación actual
- Los equipos están mezclados en `insumos_base` con `categoria: "Equipamiento"`
- No existe colección `equipos` en Firestore
- `mantenimiento` solo registra condiciones ambientales y rutinas — no reparaciones ni calibraciones vinculadas a equipos específicos
- Las salas (`salas`) son objetos simples — un equipo puede estar en una sala pero no hay vínculo estructural

### Decisiones tomadas
1. **Colección separada `equipos`** — no flag en `insumos_base`
2. **Mini-migración** de equipos existentes en `insumos_base` → `equipos`
3. **Una sala puede tener varios equipos** — relación `equipo.sala_actual_id → salas.id`
4. **`es_destino_de_batches`** se asigna automáticamente según categoría:
   - `true` → Incubación, Refrigeración, Freezer
   - `false` → Laboratorio, Otro
5. **ID semántico**: `EQP-YYMMDD-NNN`
6. **Mantenimiento extendido** — agregar tipos `Reparacion` y `Calibracion` vinculados a `equipo_id`

---

## SCHEMA DE REFERENCIA

### Colección `equipos` (nueva)
```json
{
  "id": "EQP-260708-001",
  "nombre": "Estufa de cultivo 1",
  "categoria": "Incubación | Refrigeración | Freezer | Laboratorio | Otro",
  "marca_modelo": "Memmert IN55",
  "nro_serie": "123456",
  "propietario": "Facultad | Emprendimiento | Personal",
  "fecha_adquisicion": "2024-01-15",
  "vida_util_anios": 10,
  "valor_compra": 850000,
  "valor_residual": 85000,
  "sala_actual_id": "sala-xyz",
  "es_destino_de_batches": true,
  "estado_operativo": "Operativo | En mantenimiento | Fuera de servicio",
  "parametros_ideales": {
    "temp_min": 24,
    "temp_max": 26,
    "hum_min": 70,
    "hum_max": 80
  },
  "foto_url": "",
  "notas": "",
  "migrado_desde_insumo_id": null,
  "fecha_creacion": "timestamp",
  "operario": "Maxi"
}
```

### Extensión de `mantenimiento` (colección existente)
Agregar dos tipos nuevos sin modificar los existentes:
```json
{
  "tipo": "Reparacion",
  "equipo_id": "EQP-260708-001",
  "destinoId": null,
  "fecha": "2026-07-08",
  "descripcion": "Cambio de resistencia calefactora",
  "costo": 15000,
  "operario": "Maxi",
  "notas": "",
  "createdAt": "timestamp"
}

{
  "tipo": "Calibracion",
  "equipo_id": "EQP-260708-001",
  "destinoId": null,
  "fecha": "2026-07-08",
  "resultado": "Aprobado | Desaprobado",
  "descripcion": "Calibración de termostato",
  "certificado_url": "",
  "proximo_vencimiento": "2027-07-08",
  "operario": "Maxi",
  "notas": "",
  "createdAt": "timestamp"
}
```

---

## BLOQUE 1 — Generador de IDs + mini-migración

### Objetivo
Agregar el generador de IDs semánticos para equipos y migrar los equipos
existentes de `insumos_base` a la nueva colección `equipos`.

### 1.1 — Leer primero
```
src/utils/idGenerator.js          ← leer completo antes de modificar
src/pages/InventoryPage.jsx       ← entender cómo se muestran los equipos hoy
src/components/InsumoFormModal.jsx ← ver campos de equipamiento existentes
```

### 1.2 — Agregar en `src/utils/idGenerator.js`

Agregar al final sin modificar funciones existentes:

```javascript
/**
 * Genera ID semántico para equipos
 * Formato: EQP-YYMMDD-NNN
 * Ejemplo: EQP-260708-001
 */
export async function generarIdEquipo(db) {
  const fecha = new Date();
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const fechaStr = `${yy}${mm}${dd}`;
  const counterKey = `EQP-${fechaStr}`;

  const counterRef = doc(db, 'metadata', 'counters');
  let nuevoNumero;

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const data = counterDoc.exists() ? counterDoc.data() : {};
    nuevoNumero = (data[counterKey] ?? 0) + 1;
    transaction.set(counterRef, { [counterKey]: nuevoNumero }, { merge: true });
  });

  const nnn = String(nuevoNumero).padStart(3, '0');
  return `EQP-${fechaStr}-${nnn}`;
}
```

### 1.3 — Crear script de mini-migración

Crear `src/utils/migrarEquipos.js`:

```javascript
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
        await doc(db, 'equipos', nuevoId).set
          ? (await import('firebase/firestore')).setDoc(
              doc(db, 'equipos', nuevoId), equipo
            )
          : null;

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
```

### 1.4 — Crear página de migración temporal

Crear `src/pages/MigracionEquiposPage.jsx` — página de uso único para ejecutar
la migración desde la UI. Se puede eliminar después de migrar.

```jsx
import { useState } from 'react';
import { migrarEquiposDesdeInsumos } from '../utils/migrarEquipos';

export default function MigracionEquiposPage() {
  const [estado, setEstado] = useState('idle'); // idle | ejecutando | completado | error
  const [resultados, setResultados] = useState(null);

  async function ejecutarMigracion() {
    setEstado('ejecutando');
    try {
      const res = await migrarEquiposDesdeInsumos();
      setResultados(res);
      setEstado('completado');
    } catch (err) {
      setEstado('error');
      console.error(err);
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Migración de Equipos</h1>
      <p>
        Esta herramienta migra los ítems de <strong>insumos_base</strong> con
        categoría "Equipamiento" a la nueva colección <strong>equipos</strong>.
        Los originales no se eliminan — quedan marcados como migrados.
      </p>

      {estado === 'idle' && (
        <button
          onClick={ejecutarMigracion}
          style={{ padding: '12px 24px', backgroundColor: '#FF9800', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
        >
          Ejecutar migración
        </button>
      )}

      {estado === 'ejecutando' && <p>⏳ Migrando equipos...</p>}

      {estado === 'completado' && resultados && (
        <div>
          <p>✅ Migración completada</p>
          <p>Migrados: <strong>{resultados.migrados}</strong></p>
          <p>Omitidos (ya migrados): <strong>{resultados.omitidos}</strong></p>
          {resultados.errores.length > 0 && (
            <div>
              <p>❌ Errores ({resultados.errores.length}):</p>
              <pre>{JSON.stringify(resultados.errores, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 1.5 — Agregar ruta temporal

En `App.jsx`, agregar ruta temporal:
```jsx
<Route path="/migracion-equipos" element={<MigracionEquiposPage />} />
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- Navegar a `/migracion-equipos` y ejecutar la migración
- Verificar en la consola de Firestore que se crearon documentos en `equipos`
- Verificar que los ítems originales en `insumos_base` tienen `migrado_a_equipos: true`
- Confirmar la cantidad de equipos migrados antes de continuar

---

## BLOQUE 2 — Servicio Firestore para equipos

### Objetivo
Crear el servicio de acceso a datos para la colección `equipos`.

### 2.1 — Crear `src/services/equipoService.js`

```javascript
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { generarIdEquipo } from '../utils/idGenerator';

const CATEGORIAS_DESTINO = ['Incubación', 'Refrigeración', 'Freezer'];

export async function crearEquipo(datos) {
  const id = await generarIdEquipo(db);

  const equipo = {
    id,
    nombre: datos.nombre,
    categoria: datos.categoria,
    marca_modelo: datos.marca_modelo ?? '',
    nro_serie: datos.nro_serie ?? '',
    propietario: datos.propietario ?? 'Facultad',
    fecha_adquisicion: datos.fecha_adquisicion ?? null,
    vida_util_anios: datos.vida_util_anios ?? null,
    valor_compra: datos.valor_compra ?? 0,
    valor_residual: datos.valor_residual ?? 0,
    sala_actual_id: datos.sala_actual_id ?? null,
    es_destino_de_batches: CATEGORIAS_DESTINO.includes(datos.categoria),
    estado_operativo: 'Operativo',
    parametros_ideales: {
      temp_min: datos.temp_min ?? null,
      temp_max: datos.temp_max ?? null,
      hum_min: datos.hum_min ?? null,
      hum_max: datos.hum_max ?? null,
    },
    foto_url: datos.foto_url ?? '',
    notas: datos.notas ?? '',
    migrado_desde_insumo_id: null,
    fecha_creacion: serverTimestamp(),
    operario: datos.operario,
  };

  await setDoc(doc(db, 'equipos', id), equipo);
  return id;
}

export async function getEquipos(filtros = {}) {
  let q = collection(db, 'equipos');
  const condiciones = [];

  if (filtros.categoria) {
    condiciones.push(where('categoria', '==', filtros.categoria));
  }
  if (filtros.estado_operativo) {
    condiciones.push(where('estado_operativo', '==', filtros.estado_operativo));
  }
  if (filtros.sala_actual_id) {
    condiciones.push(where('sala_actual_id', '==', filtros.sala_actual_id));
  }
  if (filtros.es_destino_de_batches !== undefined) {
    condiciones.push(where('es_destino_de_batches', '==', filtros.es_destino_de_batches));
  }

  q = condiciones.length > 0
    ? query(q, ...condiciones, orderBy('fecha_creacion', 'desc'))
    : query(q, orderBy('fecha_creacion', 'desc'));

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export async function getEquipo(id) {
  const snap = await getDoc(doc(db, 'equipos', id));
  return snap.exists() ? { ...snap.data(), _docId: snap.id } : null;
}

export async function actualizarEquipo(id, datos) {
  await updateDoc(doc(db, 'equipos', id), {
    ...datos,
    es_destino_de_batches: CATEGORIAS_DESTINO.includes(datos.categoria),
    fecha_actualizacion: serverTimestamp(),
  });
}

export async function actualizarEstadoOperativo(id, nuevoEstado) {
  await updateDoc(doc(db, 'equipos', id), {
    estado_operativo: nuevoEstado,
    fecha_actualizacion: serverTimestamp(),
  });
}

export async function moverEquipoASala(id, nuevaSalaId) {
  await updateDoc(doc(db, 'equipos', id), {
    sala_actual_id: nuevaSalaId ?? null,
    fecha_actualizacion: serverTimestamp(),
  });
}

// ─── MANTENIMIENTO DE EQUIPOS ───────────────────────────────────────────────

export async function registrarReparacion(equipoId, datos) {
  await addDoc(collection(db, 'mantenimiento'), {
    tipo: 'Reparacion',
    equipo_id: equipoId,
    destinoId: null,
    fecha: datos.fecha,
    descripcion: datos.descripcion ?? '',
    costo: datos.costo ?? 0,
    operario: datos.operario,
    notas: datos.notas ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function registrarCalibracion(equipoId, datos) {
  await addDoc(collection(db, 'mantenimiento'), {
    tipo: 'Calibracion',
    equipo_id: equipoId,
    destinoId: null,
    fecha: datos.fecha,
    resultado: datos.resultado ?? 'Aprobado',
    descripcion: datos.descripcion ?? '',
    certificado_url: datos.certificado_url ?? '',
    proximo_vencimiento: datos.proximo_vencimiento ?? null,
    operario: datos.operario,
    notas: datos.notas ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function getMantenimientosDeEquipo(equipoId) {
  const q = query(
    collection(db, 'mantenimiento'),
    where('equipo_id', '==', equipoId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export async function getEquiposDeSala(salaId) {
  const q = query(
    collection(db, 'equipos'),
    where('sala_actual_id', '==', salaId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El servicio importa correctamente desde `../firebase`
- No se crea ningún documento en Firestore todavía

---

## BLOQUE 3 — Lista de equipos + formulario de creación

### Objetivo
Crear la página principal del módulo de equipos con lista filtrable
y formulario de alta.

### 3.1 — Crear `src/pages/EquiposPage.jsx`

**Filtros:**
- Por categoría: `Todos | Incubación | Refrigeración | Freezer | Laboratorio | Otro`
- Por estado operativo: `Todos | Operativo | En mantenimiento | Fuera de servicio`
- Por sala: selector de salas existentes
- Por propietario: `Todos | Facultad | Emprendimiento | Personal`

**Lista — card por equipo:**
```
┌────────────────────────────────────┐
│ [badge estado_operativo]           │
│ Nombre del equipo                  │
│ Categoría · Marca/Modelo           │
│ Sala actual (si tiene)             │
│ [🔧 Mantenimiento] [✏️ Editar]    │
└────────────────────────────────────┘
```

**Badges de estado operativo:**
- 🟢 `Operativo` — verde
- 🟡 `En mantenimiento` — amarillo
- 🔴 `Fuera de servicio` — rojo

**Botón principal:** "➕ Nuevo equipo" → abre modal de creación

### 3.2 — Modal de creación/edición de equipo

Campos del formulario:
- `nombre` — texto (requerido)
- `categoria` — select: `Incubación | Refrigeración | Freezer | Laboratorio | Otro`
- `marca_modelo` — texto
- `nro_serie` — texto
- `propietario` — select: `Facultad | Emprendimiento | Personal`
- `fecha_adquisicion` — date picker
- `vida_util_anios` — número
- `valor_compra` — número (pesos)
- `valor_residual` — número (pesos)
- `sala_actual_id` — selector de salas existentes (usa `DestinoSelector` si aplica)
- Sección "Parámetros ideales" (visible solo si categoría es Incubación/Refrigeración/Freezer):
  - `temp_min`, `temp_max` — números
  - `hum_min`, `hum_max` — números
- `foto_url` — uploader via `uploadFileToDrive`
- `notas` — textarea

**Nota informativa** si categoría es Incubación/Refrigeración/Freezer:
> "Este equipo aparecerá como destino disponible para batches de cultivo"

### 3.3 — Agregar ruta

```jsx
<Route path="/equipos" element={<EquiposPage />} />
```

Agregar entrada "Equipos" en la navegación (buscar dónde están los otros ítems
del menú y agregar sin eliminar ninguno existente).

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La lista carga equipos migrados correctamente
- El formulario de creación guarda en Firestore con ID semántico
- Los badges de estado tienen los colores correctos
- La sección de parámetros ideales aparece/desaparece según categoría

---

## BLOQUE 4 — Detalle de equipo + mantenimiento

### Objetivo
Crear la vista de detalle de un equipo con su historial de mantenimiento
y los formularios para registrar reparaciones y calibraciones.

### 4.1 — Crear `src/pages/EquipoDetallePage.jsx`

**Sección superior — Ficha del equipo:**
- Nombre + badge estado operativo
- Categoría, marca/modelo, serie
- Propietario, fecha adquisición, vida útil
- Valor compra, valor residual, depreciación estimada (calculada)
- Sala actual (con link a la sala)
- Parámetros ideales (si aplica)
- Foto
- Botones: "✏️ Editar ficha" | "📍 Cambiar sala" | "⚙️ Cambiar estado operativo"

**Sección — Historial de mantenimiento:**

Timeline vertical con todos los registros de mantenimiento del equipo,
incluyendo los tipos existentes (Temperatura, Limpieza, etc.) y los nuevos
(Reparacion, Calibracion).

Cada entrada del timeline muestra:
```
📅 Fecha · Tipo (badge)
Descripción
Operario
[datos específicos según tipo]
```

Botones para agregar:
- "🔧 Registrar reparación"
- "📐 Registrar calibración"

### 4.2 — Modal de reparación

```
Fecha (requerido)
Descripción del problema y solución (requerido)
Costo ($)
Operario (pre-rellenado con Auth)
Notas
```

### 4.3 — Modal de calibración

```
Fecha (requerido)
Descripción
Resultado: Aprobado | Desaprobado
Próximo vencimiento (date picker)
Certificado URL (link externo o subir a Drive)
Operario (pre-rellenado con Auth)
Notas
```

### 4.4 — Agregar ruta

```jsx
<Route path="/equipos/:id" element={<EquipoDetallePage />} />
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La ficha carga los datos del equipo correctamente
- El historial de mantenimiento muestra reparaciones y calibraciones
- Los formularios guardan en Firestore con `equipo_id` correcto
- El botón "Cambiar sala" actualiza `sala_actual_id` correctamente

---

## BLOQUE 5 — Integración con salas y batches

### Objetivo
Mostrar los equipos de una sala en `SalasPage` y asegurar que los equipos
con `es_destino_de_batches: true` aparezcan como destinos disponibles.

### 5.1 — Modificar `src/pages/SalasPage.jsx`

Leer el archivo completo antes de modificar.

En el detalle de cada sala, agregar sección "Equipos en esta sala":
```jsx
// Al cargar el detalle de una sala, traer sus equipos
const equiposDeSala = await getEquiposDeSala(sala.id);
```

Mostrar lista compacta de equipos con nombre, categoría y estado operativo.
Botón "Ver equipo" → navega a `/equipos/:id`.

### 5.2 — Verificar integración con selectores de destino

Buscar en el proyecto dónde se cargan las salas/destinos para los formularios
de inoculación (probablemente `DestinoSelector.jsx`).

**No modificar la lógica existente** — solo verificar que los equipos con
`es_destino_de_batches: true` ya aparecen como salas (porque fueron registrados
también en `salas` al momento de la migración o al crearse).

Si no aparecen: agregar nota en el formulario de creación de equipo que diga
"Para que este equipo aparezca como destino de batches, también debe estar
registrado como Sala en el sistema".

> **NOTA IMPORTANTE:** No cambiar la lógica de `DestinoSelector` en este bloque.
> La integración profunda entre equipos y destinos de batches es un refactor
> mayor que se puede hacer en una segunda iteración cuando el módulo esté estable.

### 5.3 — Dashboard — agregar indicadores de equipos

Buscar el componente del dashboard. Agregar sección (sin modificar las existentes):

**Indicadores:**
- Equipos fuera de servicio (alerta roja si hay alguno)
- Calibraciones próximas a vencer (próximos 30 días)
- Equipos sin sala asignada

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- `SalasPage` muestra los equipos de cada sala
- El dashboard muestra los indicadores de equipos
- No se modificó `DestinoSelector` ni ninguna lógica de inoculación

---

## BLOQUE 6 — Limpieza post-migración

### Objetivo
Ocultar los equipos migrados del inventario general para evitar duplicados,
y remover la ruta de migración temporal.

### 6.1 — Modificar `src/pages/InventoryPage.jsx`

Leer el archivo completo antes de modificar.

En la lista de insumos, filtrar los ítems que tienen `migrado_a_equipos: true`:
```javascript
// Filtrar equipos ya migrados de la vista de inventario
const insumosFiltrados = insumos.filter(i => !i.migrado_a_equipos);
```

Agregar un aviso informativo en la sección de equipamiento:
```
ℹ️ Los equipos ahora se gestionan en el módulo "Equipos".
   Ver equipos →
```

### 6.2 — Remover ruta de migración temporal

En `App.jsx`, eliminar (o comentar) la ruta:
```jsx
// <Route path="/migracion-equipos" element={<MigracionEquiposPage />} />
```

### 6.3 — Actualizar navegación mobile

Si ya se implementó el prompt de navegación mobile (`Prompt_NavMobile_FungiTrack.md`),
agregar "Equipos" en `src/config/menuItems.js`:
```javascript
{
  id: 'equipos',
  label: 'Equipos',
  icono: '⚙️',
  ruta: '/equipos',
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- Los equipos migrados no aparecen duplicados en inventario
- El aviso informativo aparece en la sección de equipamiento
- La ruta de migración ya no es accesible
- El módulo de equipos funciona de forma independiente

---

## BLOQUE 7 — Modificar DestinoSelector para incluir equipos

### Objetivo
Modificar `DestinoSelector.jsx` para que cargue tanto salas como equipos
con `es_destino_de_batches: true`, mostrándolos juntos en el selector
sin duplicar datos. Este bloque hace que los equipos como estufas y heladeras
aparezcan disponibles al inocular o criopreservar.

### 7.1 — Leer primero
```
src/components/DestinoSelector.jsx   ← leer completo antes de modificar
```

Identificar:
- Cómo carga actualmente las salas (query a `salas`)
- Qué props recibe el componente
- Qué formato devuelve al seleccionar (id, nombre, objeto completo)
- En qué formularios se usa (buscar todos los imports de DestinoSelector)

### 7.2 — Modificar `src/components/DestinoSelector.jsx`

La lógica nueva carga en paralelo salas y equipos, los combina y los
muestra agrupados en el selector:

```javascript
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export default function DestinoSelector({ value, onChange, placeholder }) {
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarDestinos();
  }, []);

  async function cargarDestinos() {
    try {
      setCargando(true);

      // Cargar salas y equipos en paralelo
      const [snapSalas, snapEquipos] = await Promise.all([
        getDocs(query(collection(db, 'salas'), orderBy('nombre'))),
        getDocs(query(
          collection(db, 'equipos'),
          where('es_destino_de_batches', '==', true),
          where('estado_operativo', '==', 'Operativo'),
          orderBy('nombre')
        )),
      ]);

      const salas = snapSalas.docs.map(d => ({
        id: d.id,
        nombre: d.data().nombre ?? d.id,
        tipo: 'sala',
        grupo: 'Salas',
      }));

      const equipos = snapEquipos.docs.map(d => ({
        id: d.id,
        nombre: d.data().nombre ?? d.id,
        categoria: d.data().categoria ?? '',
        tipo: 'equipo',
        grupo: 'Equipos',
      }));

      // Evitar duplicados — si un equipo tiene el mismo nombre que una sala,
      // el equipo tiene precedencia (es la fuente de verdad)
      const nombresSalas = new Set(salas.map(s => s.nombre.toLowerCase()));
      const equiposSinDuplicar = equipos.filter(
        e => !nombresSalas.has(e.nombre.toLowerCase())
      );

      setOpciones([...salas, ...equiposSinDuplicar]);
    } catch (err) {
      console.error('Error cargando destinos:', err);
      setOpciones([]);
    } finally {
      setCargando(false);
    }
  }

  if (cargando) return <select disabled><option>Cargando...</option></select>;

  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const seleccionado = opciones.find(o => o.id === e.target.value);
        onChange(seleccionado ?? null);
      }}
      className="form-select"
    >
      <option value="">{placeholder ?? '-- Seleccionar destino --'}</option>

      {/* Grupo Equipos primero — más relevante en el lab */}
      {opciones.filter(o => o.tipo === 'equipo').length > 0 && (
        <optgroup label="⚙️ Equipos">
          {opciones
            .filter(o => o.tipo === 'equipo')
            .map(equipo => (
              <option key={equipo.id} value={equipo.id}>
                {equipo.nombre}
                {equipo.categoria ? ` (${equipo.categoria})` : ''}
              </option>
            ))
          }
        </optgroup>
      )}

      {/* Grupo Salas */}
      {opciones.filter(o => o.tipo === 'sala').length > 0 && (
        <optgroup label="🏠 Salas">
          {opciones
            .filter(o => o.tipo === 'sala')
            .map(sala => (
              <option key={sala.id} value={sala.id}>
                {sala.nombre}
              </option>
            ))
          }
        </optgroup>
      )}
    </select>
  );
}
```

### 7.3 — Verificar compatibilidad con todos los usos existentes

Buscar todos los archivos que importan `DestinoSelector` y verificar que:

1. El formato del valor seleccionado no cambió — si antes `onChange` devolvía
   solo el `id` (string) y ahora devuelve el objeto completo, hay que adaptar
   los consumidores o ajustar el componente para mantener compatibilidad.

2. Si algún formulario usaba `destinoId` como string directamente, verificar
   que sigue funcionando con la nueva firma.

**Estrategia de compatibilidad** — si hay riesgo de romper formularios existentes,
agregar prop `compatMode` que mantiene el comportamiento anterior:

```javascript
// Con compatMode={true} → onChange recibe solo el id (comportamiento anterior)
// Con compatMode={false} → onChange recibe el objeto completo (nuevo default)
onChange={compatMode
  ? (obj) => onChangeProp(obj?.id ?? null)
  : onChangeProp
}
```

### 7.4 — Verificar en formularios clave

Verificar manualmente que el selector funciona correctamente en:
- Formulario de inoculación (el más crítico)
- Wizard de criopreservación (`CriopreservacionNuevaPage`)
- Wizard de experimentos (si usa DestinoSelector para factor tipo `destino`)
- Cualquier otro formulario que use DestinoSelector

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- En el formulario de inoculación, los equipos (estufas, heladeras, freezers)
  aparecen en el selector junto con las salas
- Los equipos en estado "En mantenimiento" o "Fuera de servicio" NO aparecen
- No hay duplicados entre salas y equipos
- Los formularios existentes siguen funcionando correctamente
- El valor guardado en `batches.destinoId` es el ID del equipo o sala

---

## RESUMEN DE ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Acción | Bloque |
|---|---|---|
| `src/utils/idGenerator.js` | Modificar — agregar `generarIdEquipo` | 1 |
| `src/utils/migrarEquipos.js` | Crear nuevo (temporal) | 1 |
| `src/pages/MigracionEquiposPage.jsx` | Crear nuevo (temporal) | 1 |
| `src/services/equipoService.js` | Crear nuevo | 2 |
| `src/pages/EquiposPage.jsx` | Crear nuevo | 3 |
| `src/pages/EquipoDetallePage.jsx` | Crear nuevo | 4 |
| `src/pages/SalasPage.jsx` | Modificar — agregar equipos por sala | 5 |
| Dashboard | Modificar — agregar indicadores equipos | 5 |
| `src/pages/InventoryPage.jsx` | Modificar — filtrar migrados + aviso | 6 |
| `src/components/DestinoSelector.jsx` | Modificar — cargar equipos + salas | 7 |
| Router (App.jsx) | Modificar — agregar/remover rutas | 1, 3, 4, 6 |
| Navegación | Modificar — agregar entrada Equipos | 3 |

**Archivos que NO se modifican:**
- Colección `salas` — no se toca
- Colección `insumos_base` — solo se agrega flag `migrado_a_equipos`
- Formularios de inoculación — solo se verifica compatibilidad

---

## NOTAS PARA ITERACIÓN FUTURA

1. **Alertas automáticas** — notificaciones cuando una calibración vence
2. **QR por equipo** — etiqueta imprimible con la ficha técnica del equipo
3. **Creación sincronizada** — cuando se crea un equipo con
   `es_destino_de_batches: true`, ofrecer crear también la sala correspondiente

---

*Prompt generado por Claude · FungiTrack · 08/07/2026*
*Actualizado con Bloque 7 — integración DestinoSelector*
*Ejecutar con Antigravity bloque a bloque — confirmar build entre bloques*
