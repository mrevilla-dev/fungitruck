# INFORME PARA OPENCLAUDE — FungiTrack

**Fecha:** 02/08/2026 (última actualización: 05/08/2026 — sesión de validación en labo)
**Repo:** https://github.com/mrevilla-dev/fungitruck (rama `main`)
**Web:** https://fungitrack-9b463.web.app (Firebase Hosting)
**Stack:** Vite + React 18 + Firebase (Firestore, Auth, Hosting) + Google Drive API

> Este documento resume todo el trabajo realizado en la sesión y cómo continuar desde acá. Se asume que OpenClaude tiene acceso al repo o a los archivos mencionados.

---

## 1. Comandos de entorno (Windows / PowerShell)

```powershell
# Build (PowerShell bloquea npm directamente, usar cmd)
cmd /c "npm run build"

# Deploy a Firebase Hosting
cmd /c "firebase deploy --only hosting"
```

> **IMPORTANTE:** el build compila incluso con imports faltantes usados en runtime. Un bug clásico que ya ocurrió: `ReferenceError: where is not defined` porque `where` se usaba en una query pero no estaba en el import de `firebase/firestore`. **El build NO detecta esto.** Siempre validar que todos los helpers de Firestore (`where`, `orderBy`, `onSnapshot`, `query`, `collection`, `doc`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `writeBatch`, `serverTimestamp`, `arrayUnion`, `runTransaction`) estén importados cuando se usan.

---

## 2. Reglas críticas del usuario (NO romper)

1. **NO modificar la lógica de IDs semánticos** (`src/utils/idGenerator.js` + la generación inline en páginas). Solo se permiten cambios de formato/visualización, y deben ser consistentes en todo el proyecto.
2. **NO cambiar el esquema de colecciones en Firestore.** Las queries/páginas deben adaptarse al esquema real, nunca al revés.
3. **NO romper módulos que andan** (efecto túnel). Trabajar por bloques atómicos: un commit por bloque, build OK por cada uno.
4. **Ver imágenes:** el modelo actual no tiene visión. Si el usuario pega capturas, pedir que pegue el texto del error de la consola.
5. El usuario es Maxi, del labo de la facultad. Trabaja desde Windows (git + firebase CLI instalados). El repo local vive en `C:\Users\Usser\Documents\New OpenCode Project\fungitrack`.

---

## 3. Esquemas Firestore relevantes

### `equipos` (colección)
```javascript
{
  id: string,            // semántico EQ-XXXX (también es el doc ID)
  nombre: string,
  categoria: 'Incubación' | 'Refrigeración' | 'Freezer' | 'Laboratorio' | 'Otro',
  estado_operativo: 'Operativo' | 'En mantenimiento' | 'Fuera de servicio',
  marca_modelo: string,
  nro_serie: string,
  propietario: 'Facultad' | 'Emprendimiento' | 'Personal',
  fecha_adquisicion: string|null,
  vida_util_anios: number|null,
  valor_compra: number,
  valor_residual: number,
  sala_actual_id: string|null,
  es_destino_de_batches: boolean,      // true para Incubación/Refrigeración/Freezer
  parametros_ideales: { temp_min, temp_max, hum_min, hum_max },
  foto_url: string,
  notas: string,
  migrado_desde_insumo_id: string|null,
  fecha_creacion: Timestamp,
  operario: string
}
```

### `salas`
Documentos con `{ nombre, estanterias: [...] }`, doc ID arbitrario.

### `mantenimiento`
```javascript
{ tipo: 'Reparacion'|'Calibracion', equipo_id, fecha, descripcion, operario, createdAt: Timestamp, ... }
```

### Consumidores de `equipos` que NO hay que romper
- `Dashboard.jsx:179` → `onSnapshot(collection("equipos"))`, lee `estado_operativo` y `sala_actual_id`.
- `DestinoSelector.jsx:32` → `where('es_destino_de_batches','==',true)`, lee `id` y `nombre`.
- `SalasPage.jsx:27` → `where('sala_actual_id','==',sala.id)`, navega a `/equipos/${eq.id}`.
- `InventoryPage.jsx` → link a `/equipos`.

---

## 4. Trabajo realizado en esta sesión (cronológico, con commits)

### 🔧 Criobanco
| Commit | Qué |
|---|---|
| `c5c4d60` | **Impresión de etiquetas al crear crioviales** (`CriopreservacionNuevaPage.jsx`): se capturan los IDs de `crearCrioviales()` y se abre `PrintLabelsModal` con el formato estándar de criovial (`tipo_etiqueta: 'MICRO_TUBOS'`). **Navegación en misma pestaña** (`BatchEditModal.jsx`): "🧊 Criopreservar" y "🌳 Ver Árbol" pasaron de `window.open(...,'_blank')` a `useNavigate`. |

### 🔧 Fix crítico aislamiento
| Commit | Qué |
|---|---|
| `63260f1` | `ReferenceError: where is not defined` al crear un aislamiento. Faltaba `where` en el import de `firebase/firestore` de `NuevoEventoAislamientoModal.jsx`. |

### ⚙️ Módulo de Equipos (reparación completa por bloques)
Diagnóstico previo: el toast "Error cargando equipos" venía de queries con `where + orderBy` que requieren **índice compuesto en Firestore** (no configurado en el repo: `firebase.json` solo tiene hosting). Los filtros no funcionaban porque esas queries fallaban en el server y nunca re-filtraban.

| Commit | Bloque | Qué |
|---|---|---|
| `1a337c7` | 1 | **Carga y filtros**: `onSnapshot` con query simple (sin índice compuesto) + **filtrado en cliente** con `useMemo` (categoría, estado, sala, propietario, búsqueda texto). Estados de error inline, vacío ("No hay equipos registrados") y skeleton. |
| `08b186a` | 2 | **Estética**: cards estilo EsporomasPage (badge 🟢🟡🔴, `label-id`, `salas-grid`, `flex-gap`, `no-print`), panel de filtros con `.form-control`. |
| `83b57bf` | 3 | **Modal**: tema oscuro (`.modal-box`, `.form-control`) + **selector de estado operativo** al crear/editar. `equipoService.crearEquipo` ahora respeta `estado_operativo` (antes forzaba 'Operativo'). |
| `9f6af78` | 4 | **Detalle**: tema oscuro, badge consistente, `.btn-outline`. |

**Hallazgos clave del módulo Equipos:**
- Las clases `.btn-secondary` y `.filters-card` **no existen** en `index.css`/`App.css` (usadas en todo el módulo sin efecto). Se reemplazaron por `.btn-outline`/`.btn`/`flex-gap`.
- Los equipos migrados desde `insumos_base` (`migrarEquipos.js`) tienen `categoria: 'Laboratorio'`, `sala_actual_id: null` y `estado_operativo: 'Operativo'` **por diseño de la migración** → es dato, no bug de UI. Se corrigen editando el equipo desde la UI.

### 🍄 Esporomas (previo, ya en la web)
| Commit | Qué |
|---|---|
| `a0b4de1` | Quick Win #2: hook `useMediosDisponibles.js` (DRY entre `DerivacionEsporomaModal` y `NuevoEventoAislamientoModal`). |
| `10bd293` | `especiesUnicas` y `origenesUnicos` en `useMemo`. |
| `e5c0cf9` | Fix de IDs: se eliminó la concatenación `origenCode + seq` que generaba `INT01`; ahora genera `ESP-GENESP-CEPA-ORIGEN-YYMMDD-NNN`. `origenMap` con `Intercambio: EXC`, `Donación: DON`. |
| `dc9a7b2` | Overflow: `flex-wrap` en `.sala-header` y `.flex-gap`. |
| `38b1936` | Responsive mobile (`@media max-width: 768px`). |

### 🔎 Sesión de lab (05/08/2026): hallazgos de campo
Uso real en laboratorio. Flujo probado: medio creado → subfraccionado → esporoma registrado → aislamiento primario logrado tras varios intentos; 3 placas físicas registradas; árbol "con cosas por mejorar"; etiquetas impresas "con algunos problemas"; escaneo de QR del medio "lo lee pero no lo encuentra".

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **Escaneo QR del medio preparado no muestra el registro** | ✅ **FIXEADO** (ver abajo, commit de esta sesión) |
| 2 | Aislamiento primario "tras varios intentos" (selector de origen / ejemplares nuevos) | ⏳ Cualitativo, pendiente de auditoría (el fix `9afb20f` ya cubrió la parte de ejemplares nuevos en el selector) |
| 3 | Árbol genealógico "con cosas por mejorar" | ⏳ Cualitativo, pendiente de auditoría (`ArbolGenealogicoPage.jsx` + `construirArbolGenealogico.js`) |
| 4 | Etiquetas impresas "con algunos problemas" | ⏳ Cualitativo, pendiente de revisión (`PrintLabelsModal.jsx` + `zplProfiles.js`) |

### 🔧 Fix escaneo QR del medio (sesión de lab) — commit `e64d8bc` (pusheado + deploy)
**Síntoma:** el QR de la etiqueta del medio (bolsa/frasco subfraccionado) se lee pero la tarjeta sale vacía ("no lo encuentra").

**Causa raíz (verificada en código):**
- La etiqueta del medio codifica el `id_bolsa` de la **subfracción** (`FRAC-{CODIGO}-{YYYYMMDD}-{LETRA}`), generado en `NuevoMedioModal.jsx:656-724` y usado como `batch.id` en `PrintLabelsModal.jsx:372` y `zplProfiles.js:166` (el QR = `batch.id`).
- En `ScannerPage.jsx`, la rama `FRAC-` encontraba la subfracción vía `collectionGroup('subfracciones')` pero **reemplazaba `recordData` con los campos de la subfracción** (`id_bolsa`, `tipo_envase`, `cantidad`, `fecha`…) y marcaba `recordType='medio'`. La vista de medio lee campos del doc `medios_preparados` (`alias`, `nombre_receta`, `stock_bulk`, `trazabilidad`) → todos `undefined` → tarjeta en blanco.
- El medio padre (`subDoc.ref.parent.parent`) estaba disponible pero nunca se usaba.

**Fix aplicado (solo `ScannerPage.jsx`):** en la rama `FRAC-` se hace `getDoc` del medio padre y se mergea su data en `recordData`. Además, la vista de medio ahora muestra un badge con la bolsa escaneada (`id_bolsa`, tipo de envase, unidades disponibles).

**Gap latente detectado (sin tocar):** la rama `MED-` de `ScannerPage` consulta `where('id_semantico','==',id)` en `medios_preparados`, pero ese campo **no se guarda** al crear medios → es código muerto. Si en el futuro las etiquetas de medios usan IDs `MED-...`, hay que generar/guardar `id_semantico` al crear el medio.

### 🧫 Ejemplares (previo)
| Commit | Qué |
|---|---|
| `a2ecaf1` | Quick Win #1: `PhotoLightbox` en `EjemplaresPage` (ver fotos fullscreen). |
| `ca8db03` | Quick Win #3: query con `where('eliminado','==',false)` en servidor. |

---

## 5. Archivos clave (módulos tocados)

| Archivo | Notas |
|---|---|
| `src/pages/EquiposPage.jsx` | Lista + filtros cliente + cards. `ESTADO_CONFIG` local. |
| `src/components/EquipoFormModal.jsx` | Modal oscuro + campo estado. Usa `.modal-box`. |
| `src/pages/EquipoDetallePage.jsx` | Ficha + mantenimiento, tema oscuro. |
| `src/services/equipoService.js` | CRUD equipos + mantenimiento. `crearEquipo` acepta `estado_operativo`. |
| `src/pages/CriopreservacionNuevaPage.jsx` | Wizard; ahora imprime etiquetas al finalizar. |
| `src/components/BatchEditModal.jsx` | Navegación con `useNavigate` en vez de `window.open`. |
| `src/components/NuevoEventoAislamientoModal.jsx` | Import completo de Firestore (fix `where`). |
| `src/hooks/useMediosDisponibles.js` | Hook DRY de medios. |
| `src/pages/ScannerPage.jsx` | Escáner QR. Rama `FRAC-` resuelve el medio padre (`getDoc`) + badge de bolsa escaneada (fix sesión lab 05/08). Rama `MED-` es código muerto (ver Pendientes). |
| `src/utils/idGenerator.js` | **NO TOCAR** (lógica de IDs semánticos). |
| `src/index.css` | Variables CSS dark + `.salas-grid`, `.flex-gap`, `.card`, `.sala-card`, `@media 768px`. |

---

## 6. Pendientes / recomendaciones para la próxima sesión

1. **Auditar hallazgos cualitativos del lab** (sin arreglar todavía, falta pedir el texto de error/evidencia concreta):
   - **Aislamiento primario "varios intentos":** revisar flujo completo en `NuevoEventoAislamientoModal.jsx` / `DerivacionEsporomaModal.jsx` / `EjemplaresPage.jsx`. El fix `9afb20f` (ejemplares nuevos no aparecían en el selector de origen) ya está en la web. Preguntar a Maxi qué exactamente falló en el lab.
   - **Árbol genealógico "con cosas por mejorar":** auditar `ArbolGenealogicoPage.jsx` + `construirArbolGenealogico.js` (relaciones esporoma→ejemplar→batch→cosecha→criovial).
   - **Etiquetas "con algunos problemas":** revisar `PrintLabelsModal.jsx` + `zplProfiles.js` (layout, tamaño de QR, `^BQN` vs contenido).
2. **Validar en el labo:** escanear el QR de una bolsa/frasco de medio → debe mostrar la ficha del medio con el badge de la bolsa escaneada. Confirmar que el fix del QR anda en el celular real.
3. **Gap `MED-` (deuda):** las etiquetas de medios no guardan `id_semantico`. Decidir si generar `id_semantico` al crear el medio (alineado con el resto de módulos) o eliminar la rama `MED-` de `ScannerPage`.
4. **Índices compuestos:** si se quiere volver a filtros server-side en algún lado, crear `firestore.indexes.json` + `firestore.rules` y subirlos con `firebase deploy`. Hoy todo el filtrado de Equipos es en cliente para evitarlo.
5. **Datos de equipos migrados:** la categoría/sala/estado reales hay que cargarlos (por UI o una migración de datos puntual) — no es un bug de código.
6. **`getMantenimientosDeEquipo`** usa `where('equipo_id') + orderBy('createdAt')` → requiere índice compuesto. Si el historial de mantenimiento no aparece en el detalle, es eso (crear el índice o pasar a filtrado en cliente).
7. **Errores de consola benignos conocidos:** CORS a `http://localhost:11434/api/tags` desde el dominio (el router cae a Gemini, esperable), `sw.js` con respuestas de error, fotos de Google Drive devolviendo 403 (no bloquean el flujo).

---

## 7. Cómo trabajar acá (recomendado)

- **Un bloque por commit**, siempre con `npm run build` OK antes de commitear.
- Commit style: `fix(module): descripción`, `feat(module): ...`, `style(module): ...`, `perf(module): ...`.
- Antes de tocar cualquier página, revisar los consumidores de esa colección (grep `onSnapshot(collection(...))` y `where(...)`) para no romper stats/destinos/listas.
- Push + deploy al final: `git push origin main` → `cmd /c "firebase deploy --only hosting"`.
