# FungiTrack Handoff v9 — Agosto 2026

**Última actualización:** 06/08/2026 (estado verificado contra repo + web)
**Autor:** Maximiliano Revilla (mrevilla@fvet.uba.ar)
**Repo:** https://github.com/mrevilla-dev/fungitruck (rama `main`)
**Web:** https://fungitrack-9b463.web.app (Firebase Hosting, HTTPS)
**Repo local (PC actual):** `C:\Users\Usuario\Documents\Default Project\fungitruck`
**Build:** `cmd /c "npm run build"` (PowerShell bloquea `npm` directo)
**Git identity:** `Maximiliano Revilla` / `mrevilla@fvet.uba.ar`
**Último commit:** `ad5ed46` (Web y GitHub sincronizados)

---

## 1. Estado del proyecto (tablero real)

| Módulo | Estado | Nota |
|--------|--------|------|
| Medios Preparados | 🟢 Funcional | Subfracciones en subcolección con `id_bolsa` FRAC- |
| Inoculaciones (M4) | 🟢 Funcional | — |
| Ventanilla Única (IngresoMaterialPage) | 🟢 Funcional | |
| Criobanco | 🟢 Funcional | **Imprime etiquetas al crear crioviales** (`c5c4d60`) |
| EsporomasPage | 🟢 UX mejorada | IDs corregidos (`e5c0cf9`), useMemo (`10bd293`), responsive |
| EjemplaresPage | 🟢 UX mejorada | PhotoLightbox, filtros, query eliminados server-side |
| DerivacionEsporomaModal | 🟢 | Hook `useMediosDisponibles` |
| NuevoEventoAislamientoModal | 🟢 | Fix selector de ejemplares nuevos (`9afb20f`), fix import `where` (`63260f1`) |
| **Equipos** | 🟢 **FIXEADO** | Carga + filtros en cliente, cards, modal, detalle (**NO está roto**) |
| **Scanner QR (medios)** | 🟢 **FIXEADO** | Índice collection group + stock subfracción (**hoy**) |
| Agente IA Híbrido | 🟢 | Ollama + Gemini fallback |
| Layout responsive | 🟢 | mobile-first + drawer |

---

## 2. Stack real (verificado en package.json)

- **React 19.2** (NO 18) + react-dom 19.2 — importante: la versión correcta
- **Vite 8**, **react-router-dom 7**
- **Firebase 12.12** (Firestore + Auth + Hosting; Storage casi sin uso: fotos van a **Google Drive**)
- **@mui/material 9.0** (presente), **@xyflow/react** (React Flow — árbol genealógico), **dagre**
- **html5-qrcode**, **qrcode.react**, **react-hot-toast**, **puppeteer** (dev)

---

## 🧬 Sistema de IDs semánticos

Generados en `src/utils/idGenerator.js` + contadores atómicos en `metadata/counters` (`runTransaction`).

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Esporoma | `ESP-{GEN}{ESP}-{CEPA}-{ORIGEN}-{YYMMDD}-{NNN}` | `ESP-GANLUC-A01-SIL-260715-001` |
| Ejemplar | `EJE-{GEN}{ESP}-{CEPA}-{TM}-{YYMMDD}-{NNN}` | `EJE-GANLUC-A01-ESP-260715-001` |
| Evento | `EVT-{GEN}{ESP}-{YYMMDD}-{NNN}` | `EVT-GANLUC-260715-001` |
| Batch | `BAT-{GEN}{ESP}-{CEPA}-{MED}-{YYMMDD}-{NNN}{LETRA}` | `BAT-GANLUC-A01-MEA-260715-001A` |
| Subfracción (medio) | `FRAC-{CODIGO}-{YYYYMMDD}-{LETRA}` | `FRAC-MEA-20260804-A` (lo que lleva el QR) |
| Criovial | `CRV-...` / `CRY-...` / `DCG-...` | |
| Equipo | `EQ-YYYYDD-NNN` | |

**REGLA CRÍTICA:** NO modificar `idGenerator.js` ni `metadata/counters`.

---

## 🗄️ Colecciones Firestore (esquema real)

| Colección | Campos clave | Notas |
|-----------|-------------|-------|
| `medios_preparados` | `id`, `alias`, `nombre_receta`, `tipo`, `estado`, `stock_bulk{cantidad_inicial,cantidad_actual,unidad}`, `stock_fraccionado`, `envases_principales[]`, `trazabilidad{...}`, `control_calidad`, `fecha_vencimiento`, `createdAt` | **NO guarda `id_semantico`** |
| `medios_preparados/{id}/subfracciones` | `id_bolsa` (`FRAC-...`), `parent_id`, `tipo_envase` (Envase Principal\|Bolsa), `tipo_unidad`, `cantidad`, `disponible`, `volumen_por_unidad_ml`, `ubicacion`, `fecha`, `estado`, `novedades[]` | El QR de la etiqueta = `id_bolsa` |
| `ejemplares` | `id_semantico`, `genero`, `especie`, `estado`, `generacion`, `fotoUrl`, `ejemplarPadreId`, `evento_aislamiento_id`, `eliminado:false` | Soft delete |
| `esporomas` | `id_semantico`, `genero`, `especie`, `codigo_cepa`, `origen`, `fotoUrl`, `...` | — |
| `eventos_aislamiento` | `id_semantico`, `ejemplar_origen_id`, `tecnica`, `fecha`, `operario`, `medio_prep_id`, `sala_destino_id` | — |
| `batches` | `id`, `genero`, `especie`, `status`, `fechaInoculacion`, `medioPrepId`, `fraccionId`, `destinoId` | **legacy** |
| `equipos` | `id` (semántico = doc ID), `nombre`, `categoria` (Incubación\|Refrigeración\|Freezer\|Laboratorio\|Otro), `estado_operativo` (Operativo\|En mantenimiento\|Fuera de servicio), `marca_modelo`, `nro_serie`, `propietario`, `fecha_adquisicion`, `vida_util_anios`, `valor_compra`, `valor_residual`, `sala_actual_id`, `es_destino_de_batches`, `parametros_ideales{temp_min,temp_max,hum_min,hum_max}`, `foto_url`, `notas`, `migrado_desde_insumo_id`, `fecha_creacion`, `operario` | — |
| `salas` | `{ nombre, estanterias:[] }` | — |
| `mantenimiento` | `{ tipo: Reparacion\|Calibracion, equipo_id, fecha, descripcion, operario }` | — |
| `insumos_base` / `insumos_lotes` / `cosechas` / `crioviales` / `experimentos` / `tracking` / `cola_impresion` | — | Módulos ya construidos |

**Consumidores que NO romper:** `Dashboard.jsx` (onSnapshot equipos), `DestinoSelector.jsx` (`es_destino_de_batches==true`), `SalasPage.jsx` (filtro por sala), `InventoryPage.jsx` (links).

---

## 🗂️ Índices Firestore (configurable en repo desde hoy)

`firestore.indexes.json` + `firebase.json` → sección `firestore`. Deploy con:
```powershell
cmd /c "npx firebase deploy --only firestore:indexes"
```

Índices actuales:
- `insumos_lotes` (COLLECTION): `estado_apertura`+`cantidad_base_actual`+`__name__` (x2 variantes)
- **`subfracciones.id_bolsa` COLLECTION_GROUP ASCENDING** (fieldOverride) → habilitó el escaneo QR de bolsas FRAC- (commit `d969a72`). También arregla la misma query en `NuevoCultivoModal` y `IngresoMaterialPage`.

> ⚠️ Recordar: el deploy de índices **reemplaza** la config. Antes de agregar, conservar los existentes copiando desde `npx firebase firestore:indexes`.

---

## 🧩 Workflow / reglas de oro (de todas las sesiones)

1. **Un bloque por commit**, siempre con build OK: `cmd /c "npm run build"`.
2. Commit style: `fix(modulo): ...`, `feat(modulo): ...`, `style(modulo): ...`, `perf(modulo): ...`.
3. Terminar con `git push origin main` → `cmd /c "npx firebase deploy --only hosting"`.
4. **NO tocar:** `src/utils/idGenerator.js`, `metadata/counters`, esquema de colecciones, lógica de transacciones atómicas (lecturas→cálculos→escrituras obligatorio en `runTransaction`).
5. **NO romper módulos que andan.** Cambios aditivos; defensivos: `campo?.subcampo ?? fallback`.
6. Imágenes **solo Google Drive** (Apps Script `uploadFilesToDrive`), nunca Firebase Storage.
7. El build **NO detecta imports faltantes de Firestore usados en runtime** (`ReferenceError: where is not defined`). Validar siempre `where, orderBy, onSnapshot, query, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp, arrayUnion, runTransaction`.
8. **El modelo no tiene visión**: si el usuario pasa capturas, pedir el texto del error de la consola.
9. Mobile-first: mínimo táctil ≥44px (`12.btn-compact` para botones chicos).

---

## 🧪 Bugs conocidos y su estado

| Bug | Estado |
|-----|--------|
| Scanner QR medio "lo lee vacío" | ✅ FIXEADO (`e64d8bc`) — resuelve padre + badge bolsa |
| Scanner QR — librepase necesita índice collection group | ✅ FIXEADO (`d969a70` + índice deployado) |
| Stock mostraba `0 ml` (bulk) en vez de subfracción | ✅ FIXEADO (`ad5edaa`) — muestra `disponible`+`tipo_unidad` + volumen |
| Módulo Equipos "Error cargando equipos" | ✅ FIXEADO (commits `1a337c7`..`9f6af` , carga + filtros en cliente) |
| IDs de esporomas mezclaban origen+secuencia (`INT01`) | ✅ FIXEADO (`e5c0cf9`) |
| Ejemplares nuevos no aparecían en selector de origen (aislamiento) | ✅ FIXEADO (`9afb20f`) |
| **Gap `MED-` (código muerto)**: ScannerPage rama `MED-` consulta `id_semantico`, campo NO guardado en medios | ⏳ Pendiente de decisión: generar `id_semantico` al crear medios o eliminar la rama |
| **Histórico mantenimiento**: `getMantenimientosDeEquipo` usa `where('equipo_id')+orderBy('createdAt')` → requiere índice compuesto | ⏳ Si no aparece, crear índice o filtrar en cliente |
| **`tracking`** query legacy `where(batchId)+orderBy(createdAt)` requiere índice compuesto | ⏳ Solo afecta si hay batch legacy |
| Fotos huérfanas en Drive al eliminar esporoma | ⏳ Actualmente solo `console.warn` |
| "Versiones mezcladas de código" (código viejo+nuevo en el mismo archivo) | 🟡 Cuidado al editar archivos grandes: leer el archivo actual |

---

## 📋 Pendientes de la sesión de lab (05/08) — falta evidencia concreta

Cualitativos reportados por Maxi en uso real, **sin arreglar**:

| # | Hallazgo | Dónde mirar |
|---|---|---|
| 1 | Aislamiento primario "varios intentos" | `NuevoEventoAislamientoModal`, `DerivacionEsporomaModal`, `EjemplaresPage` |
| 2 | Árbol genealógico "con cosas por mejorar" | `ArbolGenealogicoPage`, `construirArbol Genealogico.js` |
| 3 | Etiquetas impresas "con algunos problemas" | `PrintLabelsModal`, `zplProfiles.js` |

Para avanzar falta que Maxi pegue el texto de error de consola o describa exactamente qué falló.

---

## 🗒️ Pendientes/futuro (sin prioridad asignada)

- [ ] Auditar árbol genealógico / etiquetas ZPL (arriba)
- [ ] Gap `MED-`: decidir if `id_semantico` en medios o eliminar rama `MED-` de ScannerPage
- [ ] Alertas de calibración vencida de equipos + QR por equipo (deep31/34)
- [ ] Creación sincronizada equipo+sala
- [ ] Contexto global (salas, medios, contenedores) para reducir listeners `onSnapshot`
- [ ] Modo offline robutso (Firestore `source:'cache'` + detector de conectividad)
- [ ] Búsqueda global en Dashboard / Inventario
- [ ] Exportar árbol genealógico a CSV/imagen (V2)
- [ ] Eliminación real de fotos en Drive al borrar esporoma
- [ ] Stats con export CSV en experimentos

---

## ✅ Testing checklist (antes de cada deploy)

- [ ] Build pasa (1493 módulos sin errores)
- [ ] ScannerPage: escanear bolsa FRAC- → ficha del medio + badge "🔎 Bolsa escaneada" + disponible correcto
- [ ] Aislamiento: selector de ejemplares muestra los nuevos (sin índice)
- [ ] Equipos: carga sin error, filtros funcionan
- [ ] EsporomasPage/Ejemplares: búsqueda, PhotoLightbox, sin overflow
- [ ] Responsive mobile sin overflow horizontal

---

## Comandos útiles

```powershell
cmd /c "npm run dev"                      # dev server
cmd /c "npm run build"                    # build producción (PowerShell bloquea npm directo)
cmd /c "npx firebase deploy --only hosting"        # web
cmd /c "npx firebase deploy --only firestore:indexes"  # índices (¡reemplaza la config!)
cmd /c "npx firebase firestore:indexes"   # listar índices actuales
git push origin main
```

---

**Fin del Handoff v9** — *verificado contra el repo real, commits y web al 06/08/2026* 🍄