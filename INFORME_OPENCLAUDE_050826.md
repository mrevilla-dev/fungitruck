# INFORME FUNGITRACK PARA OPENCLAUDE — 05/08/2026

**Repositorio:** https://github.com/mrevilla-dev/fungitruck (rama `main`)
**Web (Firebase Hosting):** https://fungitrack-9b463.web.app
**Stack:** Vite + React 18 + Firebase (Firestore, Auth, Hosting) + Google Drive API
**Repo local (PC de Maxi):** `C:\Users\Usser\Documents\New OpenCode Project\fungitrack`

> Informe para pegar en OpenClaude (o enviar por mail). Es un resumen completo de estado para retomar la sesión sin contexto previo. Todo lo que está acá es verificado y pusheado a GitHub.

---

## 1. Estado del repo

- Working tree **limpio**, `origin/main` actualizado (último push: `9ed4635`).
- El commit `9afb20f` hecho desde la facultad **ya está integrado** (fetch/pull ff-only) y deployado.
- Última versión en web incluye el **fix del escaneo QR** (`e64d8bc`) → deploy OK.

### Historial de commits (relevantes, último primero)

| Commit | Qué |
|---|---|
| `9ed4635` | docs: hash del fix de QR en el informe |
| `e64d8bc` | **fix(scanner): resolver medio padre al escanear bolsa FRAC- + badge de subfracción** |
| `9afb20f` | fix(aislamiento): ejemplares nuevos no aparecían en el selector de origen (hecho en la facu) |
| `5910543` | docs: informe de sesión para compartir + ignorar cache de firebase (`.firebase/` al `.gitignore`) |
| `9f6af78` / `83b57bf` / `08b186a` / `1a337c7` | Módulo Equipos completo (carga/filtros cliente, estética, modal, detalle) |
| `c5c4d60` | Criobanco: imprimir etiquetas al crear crioviales + navegación en misma pestaña |
| `63260f1` | Fix `ReferenceError: where is not defined` en NuevoEventoAislamientoModal |
| `38b1936` / `dc9a7b2` / `e5c0cf9` / `10bd293` / `a0b4de1` | Esporomas: responsive, overflow, IDs semánticos, useMemo, hook useMediosDisponibles |

---

## 2. Comandos de entorno (Windows / PowerShell)

```powershell
# Build (PowerShell bloquea npm directamente, usar cmd)
cmd /c "npm run build"

# Deploy a Firebase Hosting
cmd /c "firebase deploy --only hosting"
```

> **IMPORTANTE:** el build compila incluso con imports faltantes usados en runtime. Bug clásico ya ocurrido: `ReferenceError: where is not defined` (se usaba `where` sin importarlo). **El build NO detecta esto.** Siempre validar que todos los helpers de Firestore usados estén importados (`where`, `orderBy`, `onSnapshot`, `query`, `collection`, `doc`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `writeBatch`, `serverTimestamp`, `arrayUnion`, `runTransaction`).

---

## 3. Reglas críticas del usuario (NO romper)

1. **NO modificar la lógica de IDs semánticos** (`src/utils/idGenerator.js` + la generación inline en páginas). Solo cambios de formato/visualización, consistentes en todo el proyecto.
2. **NO cambiar el esquema de colecciones en Firestore.** Las queries/páginas se adaptan al esquema real, nunca al revés.
3. **NO romper módulos que andan** (efecto túnel). Trabajar por bloques atómicos: un commit por bloque, build OK por cada uno.
4. **El modelo no tiene visión.** Si el usuario pega capturas, pedir el texto del error de la consola.
5. Usuario: **Maxi**, del labo de la facultad. Trabaja desde Windows (git + firebase CLI instalados).

---

## 4. Flujo real del lab (validación de campo — 05/08/2026)

Flujo probado en uso real:
1. **Medio preparado creado** → subfraccionado (bolsas/frascos).
2. **Esporoma registrado.**
3. **Aislamiento primario logrado tras varios intentos.**
4. **3 placas físicas registradas.**
5. **Árbol genealógico:** "con cosas por mejorar" (cualitativo).
6. **Etiquetas impresas:** "con algunos problemas" (cualitativo).
7. **Escaneo QR del medio:** "lo lee pero no lo encuentra" → **FIXEADO** (ver punto 5).

---

## 5. Fix del escaneo QR del medio (commit `e64d8bc` — ya en web)

**Síntoma:** el QR de la etiqueta del medio (bolsa/frasco subfraccionado) se lee pero la tarjeta sale vacía ("no lo encuentra").

**Causa raíz (verificada en código):**
- La etiqueta del medio codifica el `id_bolsa` de la **subfracción** (`FRAC-{CODIGO}-{YYYYMMDD}-{LETRA}`), generado en `NuevoMedioModal.jsx:656-724` y usado como `batch.id` en `PrintLabelsModal.jsx:372` y `zplProfiles.js:166` (el QR = `batch.id`).
- En `ScannerPage.jsx`, la rama `FRAC-` encontraba la subfracción vía `collectionGroup('subfracciones')` pero **reemplazaba `recordData` con los campos de la subfracción** (`id_bolsa`, `tipo_envase`, `cantidad`, `fecha`…) y marcaba `recordType='medio'`. La vista de medio lee campos del doc `medios_preparados` (`alias`, `nombre_receta`, `stock_bulk`, `trazabilidad`) → todos `undefined` → tarjeta en blanco.
- El medio padre (`subDoc.ref.parent.parent`) estaba disponible pero nunca se usaba.

**Fix aplicado (solo `ScannerPage.jsx`):**
- En la rama `FRAC-` se hace `getDoc` del medio padre y se mergea su data en `recordData`.
- La vista de medio ahora muestra un **badge** con la bolsa escaneada (`id_bolsa`, tipo de envase, unidades disponibles).

**Gap latente detectado (sin tocar):** la rama `MED-` de `ScannerPage` consulta `where('id_semantico','==',id)` en `medios_preparados`, pero ese campo **no se guarda** al crear medios → código muerto. Decidir si generar `id_semantico` al crear medios o eliminar la rama.

---

## 6. Esquemas Firestore relevantes

### `medios_preparados`
```javascript
{
  id: string,                 // doc ID (auto de Firestore) + campo id duplicado
  alias: string,              // ej: "Agar Papa Dextrosa Lote 1" (NO hay id_semantico)
  nombre_receta, recetaId, tipo,
  estado: 'Personalizado',
  stock_bulk: { cantidad_inicial, cantidad_actual, unidad },
  stock_fraccionado: { cantidad_inicial, cantidad_actual, recipienteId, recipienteNombre, unidad_final },
  envases_principales: [{ id, nombre, recipienteId, volumen_inicial, volumen_actual, sub_fraccionamientos: [] }],
  trazabilidad: { insumos_consumidos, fecha_preparacion, operador, observaciones, categoria, ubicacion, ... },
  control_calidad: {...},
  fecha_vencimiento, operario, ubicacion, categoria,
  createdAt, updatedAt: Timestamp
}
```

### `medios_preparados/{medioId}/subfracciones`
```javascript
{
  id_bolsa: 'FRAC-{CODIGO}-{YYYYMMDD}-{LETRA}',  // lo que lleva el QR de la etiqueta
  parent_id: string|null,        // id_bolsa del envase padre (para bolsas subfraccionadas)
  tipo_envase: 'Envase Principal' | 'Bolsa',
  tipo_unidad, cantidad, disponible,
  volumen_por_unidad_ml, ubicacion, ubicacion_detalle,
  fecha, operario, estado: 'Disponible', novedades: [],
  createdAt: Timestamp
}
```

### `equipos` (colección)
```javascript
{
  id: string,            // semántico EQ-XXXX (también es el doc ID)
  nombre, categoria: 'Incubación'|'Refrigeración'|'Freezer'|'Laboratorio'|'Otro',
  estado_operativo: 'Operativo'|'En mantenimiento'|'Fuera de servicio',
  marca_modelo, nro_serie, propietario, fecha_adquisicion, vida_util_anios,
  valor_compra, valor_residual, sala_actual_id,
  es_destino_de_batches: boolean,
  parametros_ideales: { temp_min, temp_max, hum_min, hum_max },
  foto_url, notas, migrado_desde_insumo_id, fecha_creacion, operario
}
```

### Otras
- `salas`: `{ nombre, estanterias: [...] }`.
- `mantenimiento`: `{ tipo: 'Reparacion'|'Calibracion', equipo_id, fecha, descripcion, operario, createdAt }`.
- `ejemplares`, `esporomas`, `batches`, `insumos_base`, `insumos_lotes`, `cosechas`, `crioviales`: usan `id_semantico` como campo (los medios NO).

---

## 7. Hallazgos de la sesión de lab — pendientes de auditoría

Los 3 puntos cualitativos quedan **documentados, sin arreglar todavía**. Para avanzar, falta evidencia concreta (texto de error de consola o descripción exacta de qué falló).

| # | Hallazgo | Estado | Dónde mirar |
|---|---|---|---|
| 1 | **Escaneo QR del medio no muestra el registro** | ✅ FIXEADO (`e64d8bc`, en web) | `ScannerPage.jsx` |
| 2 | **Aislamiento primario "varios intentos"** | ⏳ Pendiente de auditoría | `NuevoEventoAislamientoModal.jsx`, `DerivacionEsporomaModal.jsx`, `EjemplaresPage.jsx`, `RegistroMasivoAislamientosModal.jsx` |
| 3 | **Árbol genealógico "con cosas por mejorar"** | ⏳ Pendiente de auditoría | `ArbolGenealogicoPage.jsx`, `construirArbolGenealogico.js`, `layoutArbol.js` |
| 4 | **Etiquetas "con algunos problemas"** | ⏳ Pendiente de revisión | `PrintLabelsModal.jsx`, `zplProfiles.js` |

### Contexto sobre el punto 2 (aislamiento)
- El commit `9afb20f` (facu) ya arregló: **ejemplares nuevos no aparecían en el selector de origen** del modal de aislamiento. Fix = filtrado de eliminados en cliente + orden por `createdAt` (evita índice compuesto) + `eliminado: false` al crear ejemplares (`DerivacionEsporomaModal`, `EjemplaresPage`).
- "Aislamiento logrado tras varios intentos" puede ser un tema de **proceso/UI** (el selector no mostraba el ejemplar nuevo hasta recargar, ahora debería estar OK) o de **datos** (origen no encontrado). Falta que Maxi indique qué pasó exactamente.

### Etiquetas (punto 4) — lo que ya se sabe del código
- `PrintLabelsModal` imprime en Zebra ZD220 vía `zplProfiles.generateZPL`; el QR de cada etiqueta = `batch.id` (para medios = `id_bolsa` FRAC).
- El perfil por defecto es `PORTAOBJETOS`; los perfiles disponibles: PORTAOBJETOS, MICRO_TUBOS, SLIM_PETRI, MEDIO_ESTANDAR, MAXI_BOLSA, MAPA_GRADILLA.
- Impresión directa apunta a un servidor local `http://localhost:5174/print` (print-server.js). Si no está corriendo → toast "Fallo de conexión con la impresora".
- Preguntar a Maxi: ¿"algunos problemas" = layout, tamaño de QR, que no imprime, o texto cortado?

---

## 8. Errores de consola benignos conocidos (NO son bugs)

- CORS a `http://localhost:11434/api/tags` desde el dominio (router cae a Gemini, esperable).
- `sw.js` con respuestas de error.
- Fotos de Google Drive devolviendo 403 (no bloquean el flujo).

---

## 9. Cómo continuar (recomendado)

1. **Validar en el labo el fix del QR:** escanear una bolsa/frasco de medio → debe mostrar la ficha del medio con el badge de la bolsa escaneada.
2. **Pedir evidencia a Maxi** sobre los 3 puntos cualitativos (texto de error de consola o descripción exacta).
3. **Auditar por bloques** (un commit por bloque, build OK por cada uno):
   - Bloque A: aislamiento/ejemplares (punto 2).
   - Bloque B: árbol genealógico (punto 3).
   - Bloque C: etiquetas ZPL (punto 4).
4. **Gap `MED-`:** decidir si generar `id_semantico` al crear medios o eliminar la rama muerta de `ScannerPage`.
5. **Índices compuestos:** hoy todo el filtrado de Equipos es en cliente para evitar índices. Si se quiere filtrado server-side, crear `firestore.indexes.json` + `firestore.rules` y subirlos con `firebase deploy`.
6. **Datos de equipos migrados:** la categoría/sala/estado reales hay que cargarlos por UI o migración — no es bug de código.

---

## 10. Resumen de lo logrado en la sesión (para el mail)

- Integrado y deployado el commit de la facu (`9afb20f`): ejemplares nuevos ya aparecen en el selector de origen del aislamiento.
- **Diagnosticado y FIXEADO el escaneo QR del medio** (causa raíz: la rama FRAC- mostraba los datos de la subfracción en la vista de medio). En producción.
- Documentados los 4 hallazgos del lab en este informe.
- Repo pusheado (working tree limpio), web al día.
- Para la próxima: auditar aislamiento, árbol y etiquetas con la evidencia que Maxi pueda dar del lab.
