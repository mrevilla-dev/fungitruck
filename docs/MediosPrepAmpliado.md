# FungiTrack — Prompt para Antigravity
## Módulo: Medios Preparados — Ampliación completa
> Generado: Mayo 2026

---

## CONTEXTO DEL SISTEMA

FungiTrack es un LIMS (Laboratory Information Management System) especializado en
trazabilidad de laboratorio micológico.

**Stack:**
- Frontend: React 19 + Vite
- Base de datos: Firebase Firestore (NoSQL)
- Autenticación: Firebase Auth (Google Sign-In)
- Imágenes: Google Drive vía Apps Script proxy
- QR generación: qrcode.react (SVG)
- QR lectura: html5-qrcode (cámara)
- Etiquetas: Zebra ZD220 USB — ZPL — 6 perfiles ya implementados en rollo 100×150mm
- Deploy: Firebase Hosting

**Patrones de código ya establecidos en el proyecto:**
- Defensive programming: siempre `objeto?.campo ?? fallback` antes de leer propiedades anidadas
- Modales para formularios (ya existen: `NuevoMedioModal`, `AuditMedioModal`, `RecipeFormModal`)
- Acordeones/desplegables para secciones secundarias dentro de un registro
- Componente `SearchableSelect` para selects con filtrado dinámico
- Transacciones atómicas Firestore (`writeBatch`) para operaciones que tocan múltiples documentos
- CSS puro con variables globales en `index.css`, glassmorphism, UI oscura/clara, glove-friendly

---

## REGLA PRINCIPAL — LEER ANTES DE TOCAR

**Antes de modificar cualquier componente o colección existente, leer su código completo.**
Todos los cambios son ADITIVOS. No eliminar campos existentes. No romper registros actuales.
Los documentos existentes en Firestore no tienen los nuevos campos — eso es correcto y esperado.
Los componentes deben funcionar igual si los campos nuevos no existen (defensive programming).

**Pedir confirmación antes de avanzar al siguiente bloque.**

---

## ESTADO ACTUAL DEL MÓDULO

El módulo de Medios Preparados YA EXISTE y funciona con:
- Maestro con listado de registros (`medios_preparados` en Firestore)
- Formulario de ingreso de nuevo medio (`NuevoMedioModal` o equivalente)

Esquema actual del documento en Firestore:
```json
{
  "id": "medprep-xyz",
  "nombre_medio": "Agar Papa Dextrosa",
  "alias": "APD Lote 3",
  "recetaId": "rec-001",
  "cantidad_inicial": 20,
  "cantidad_actual": 14,
  "es_fraccionado": true,
  "operator": "Maxi"
}
```

No modificar estos campos. Solo agregar campos nuevos.

---

## NUEVA ESTRUCTURA DE DATOS — CAMPOS A AGREGAR

Al documento existente de `medios_preparados` se agregan estos campos nuevos:

```json
{
  "estado": "Activo | Agotado | Contaminado | Archivado",
  "eliminado": false,
  "fecha_eliminacion": null,

  "ubicacion": "Heladera Lab | Heladera Facultad | Freezer -20°C | Freezer -80°C | Temperatura ambiente | Otra",
  "ubicacion_detalle": "Estante 2, cajón inferior",

  "sanitizacion": {
    "metodo": "Autoclave | Pasteurización | Tindalización | Sin esterilización",
    "operario": "Maxi",
    "fecha_inicio": "2026-05-19",
    "duracion_min": 30,
    "temperatura_c": 121,
    "ciclos": null,
    "resultado": "Exitoso | Dudoso | Fallido",
    "indicador_biologico": false,
    "observaciones": ""
  },

  "ph_real": null,
  "densidad_real_brix": null,
  "peso_seco_pct": null,

  "fecha_agotamiento": null,
  "motivo_agotamiento": "Se usó todo | Se descartó el resto | Venció"
}
```

Subcolecciones nuevas dentro de cada documento de `medios_preparados`:

```
medios_preparados/
  └── {medioId}/
        ├── subfracciones/      ← bolsas de fraccionamiento
        │     └── {fraccionId}
        └── auditorias/         ← historial de eventos QC
              └── {timestamp}
```

---

## BLOQUE 1 — ACCIONES EN EL HEADER DE CADA CARD

**Implementar primero. Confirmar antes de continuar.**

Agregar estos botones en el header de cada registro del maestro.
No eliminar ni mover controles existentes. Agregarlos junto a lo que ya hay.

| Ícono | Acción | Rol mínimo |
|---|---|---|
| 🖊️ Editar | Modal edición de `alias`, `observaciones`, `ubicacion`, `ubicacion_detalle`. Inmutables: `recetaId`, `cantidad_inicial`, `fecha`. | Investigador |
| 🏷️ Reimprimir | Dispara ZPL del medio a Zebra. Usar el perfil ZPL existente más adecuado. | Colaborador |
| ✓ Marcar agotado | Solo visible si `estado === "Activo"`. Ver BLOQUE 5. | Investigador |
| 🗃️ Archivar | Modal de confirmación. Cambia `estado` a `"Archivado"`. No elimina. | Investigador |
| 🗑️ Eliminar | Modal de confirmación con advertencia. Eliminación lógica: `eliminado: true` + `fecha_eliminacion`. NO elimina el documento de Firestore. | Director |

**Filtro del listado maestro por defecto:**
`eliminado !== true` AND `estado !== "Archivado"`

Agregar toggle o pestaña "Ver archivados" que muestre los archivados sin borrar el filtro activo.

**Badge de estado en cada card:**

| Estado | Color |
|---|---|
| Activo | 🟢 verde |
| Agotado | 🔵 azul oscuro |
| Contaminado | 🔴 rojo |
| Archivado | ⚫ gris |

**Chip de ubicación** junto al badge de estado:
```
🟢 Activo  📍 Heladera Lab · Estante 2
```

---

## BLOQUE 2 — TRES ACORDEONES POR REGISTRO

Debajo de los datos principales de cada card, agregar tres secciones expandibles
con el mismo patrón visual que ya existe en el proyecto (acordeón/desplegable).
Solo uno puede estar abierto a la vez.

---

### ACORDEÓN 1 — 🫕 Sanitización

Registro único por medio (no historial). Se puede editar después de guardado.

**Campos del formulario:**

```
método *         select → Autoclave | Pasteurización | Tindalización | Sin esterilización
operario *       string — usuario logueado por defecto, editable
fecha inicio *   date
duración (min) * number
temperatura (°C) number — VISIBLE SOLO si método es Autoclave o Pasteurización
ciclos           number — VISIBLE SOLO si método es Tindalización
                          label: "Cantidad de ciclos de 1 hora"
resultado *      select → Exitoso | Dudoso | Fallido
indicador        checkbox — label: "Se usó indicador biológico"
observaciones    textarea — opcional
```

Si `resultado` es "Fallido" o "Dudoso": mostrar banner de advertencia visible en el card
del medio (no solo en el acordeón).

**Guardado:** campo `sanitizacion` (objeto) dentro del documento de `medios_preparados`.
Operación simple `updateDoc` — no requiere transacción.

---

### ACORDEÓN 2 — 📦 Subfraccionamiento

Un medio bulk puede generar N bolsas. Cada bolsa tiene su propio QR y su propio stock.
Las unidades dentro de la bolsa (placas, frascos) son anónimas hasta que se usan en inoculación.
La identidad individual nace en el momento de la inoculación, cuando se genera el batch.

**El acordeón muestra:**
- Listado de bolsas registradas con su estado
- Botón `[+ Nueva bolsa]`

**Modal "Nueva bolsa" — campos:**

```
id_bolsa         autogenerado — formato: FRAC-[CODIGO_MEDIO]-[AAAAMMDD]-[A/B/C...]
                 CODIGO_MEDIO viene del alias del medio padre.
                 Ejemplo: si el medio es "ML-ECA", la bolsa es "FRAC-ECA-20260519-A"
                 La letra final se incrementa automáticamente (A, B, C...)

tipo_envase *    select → Bolsa | Caja | Bandeja
tipo_unidad *    select → Placa Petri | Frasco 100ml | Frasco 500ml | Frasco 1L | Pote PP | Otro
cantidad *       number — cantidad de unidades en esta bolsa
disponible       calculado automáticamente = cantidad al crear. Se decrementa al usar.
volumen/unidad   number — ml por unidad — opcional
fecha *          date — hoy por defecto
operario *       string — usuario logueado por defecto
ubicacion        select → Heladera Lab | Heladera Facultad | Freezer -20°C |
                          Freezer -80°C | Temperatura ambiente | Otra
ubicacion_detalle string — opcional — ej: "Estante 3, bolsa roja"
observaciones    textarea — opcional
```

**Listado de bolsas en el acordeón:**

Cada bolsa muestra:
```
FRAC-ECA-20260519-A  |  20 placas Petri  |  disponibles: 17/20  |  📍 Heladera Lab
🟢 Disponible                              [+ Novedad]  [🏷️ Reimprimir]
──────────────────────────────────────────────────────────────────
  21/05  🔴 Contaminación · 3 unidades · "verde en borde"
  22/05  🟡 Desarrollo espontáneo · 2 unidades · foto 📷
```

Badge de estado de la bolsa:
- 🟢 Disponible — si `disponible > 0`
- 🔴 Agotada — si `disponible === 0`

**Modal "+ Novedad" — campos:**

```
tipo *              select → Contaminación | Desarrollo espontáneo | Desecación | Uso en inoculación | Otro
cantidad afectada * number — cuántas unidades
foto_url            string — opcional — link a Drive (mismo flujo que fotos de cultivos)
observaciones       textarea — opcional
fecha               date — hoy por defecto
```

**Lógica de descuento automático:**
- Contaminación → restar `cantidad_afectada` de `disponible`
- Desecación → restar `cantidad_afectada` de `disponible`
- Desarrollo espontáneo → registrar SIN descontar (las placas siguen disponibles)
- Uso en inoculación → restar 1 (o la cantidad indicada) — ver BLOQUE 4

Si `disponible` llega a 0: cambiar badge de la bolsa a 🔴 Agotada.
Si TODAS las bolsas del medio están agotadas: cambiar `estado` del medio a "Agotado"
y registrar `fecha_agotamiento` automáticamente.

**Guardado en Firestore:**
- Cada bolsa: documento en subcolección `subfracciones/{fraccionId}`
- Cada novedad: elemento del array `novedades` dentro del documento de la bolsa

**Etiqueta ZPL para bolsas** (usar perfil existente más compatible o crear variante):
```
Contenido:
- ID bolsa (texto legible + código QR con ese ID)
- Nombre del medio padre (ej: ML-ECA)
- Tipo de unidad + cantidad total (ej: "20 Placas Petri")
- Volumen por unidad si existe (ej: "20 ml c/u")
- Fecha de fraccionamiento
- Operario
- Ubicación
```

---

### ACORDEÓN 3 — 🔍 Auditoría

Historial append-only de eventos de calidad del medio completo (no de bolsas individuales).
Los registros nunca se editan ni eliminan. Se agregan cronológicamente.

**Listado de registros** en orden cronológico inverso (más nuevo primero).
Cada registro muestra: fecha · tipo · operario · resumen de valores.

**Botón `[+ Registrar]`** abre modal con:

```
tipo *       select → Peso seco | pH medido | Densidad Brix |
                      Fuera de cadena de frío | Contaminación general | Otro
fecha *      date — hoy por defecto
operario *   string — usuario logueado por defecto
observaciones textarea — opcional
```

**Campos adicionales condicionales por tipo:**

**Peso seco:**
```
peso_humedo_g  number *
peso_seco_g    number *
→ calcular y mostrar en tiempo real: materia_seca_pct = (peso_seco_g / peso_humedo_g) × 100
→ al guardar: escribir también `peso_seco_pct` en el documento del medio
  (este valor se hereda al batch cuando se inocula con este medio)
```

**pH medido:**
```
ph_real  number decimal (ej: 6.8) *
→ al guardar: escribir también `ph_real` en el documento del medio
```

**Densidad Brix:**
```
densidad_real_brix  number *
→ al guardar: escribir también `densidad_real_brix` en el documento del medio
```

**Fuera de cadena de frío:**
```
tiempo_exposicion_min   number *
temperatura_estimada_c  number — opcional
```

**Contaminación general:**
```
agente_sospechoso  string — opcional
zona_afectada      string — opcional
→ al guardar: cambiar `estado` del medio a "Contaminado"
```

**Guardado en Firestore:**
Cada registro: documento en subcolección `auditorias/{timestamp_ISO}`.
Los campos que se propagan al documento del medio (`ph_real`, `densidad_real_brix`,
`peso_seco_pct`, `estado`) se escriben en la misma operación con `writeBatch`.

---

## BLOQUE 3 — UBICACIÓN EN EL FORMULARIO DE INGRESO

Al formulario de ingreso de nuevo medio (el que ya existe) agregar al final, antes de guardar:

```
ubicacion         select → Heladera Lab | Heladera Facultad | Freezer -20°C |
                           Freezer -80°C | Temperatura ambiente | Otra
ubicacion_detalle string — opcional — ej: "Estante 2, cajón inferior"
```

Estos campos también aparecen en el modal de edición (🖊️) del BLOQUE 1.

---

## BLOQUE 4 — INTEGRACIÓN CON INOCULACIÓN (campo fraccionId)

Cuando se crea un batch desde el módulo de Inoculación y se selecciona un medio preparado,
agregar un campo opcional de selección de bolsa:

```
fraccionId  string — ID de la bolsa de subfracción de la que se toma la unidad
            select buscable — muestra solo las bolsas del medioPrepId seleccionado
            con disponible > 0
            label de cada opción: "FRAC-ECA-20260519-A · Placa Petri · 17 disponibles · 📍 Heladera Lab"
```

Si se selecciona una bolsa, al guardar el batch ejecutar en el mismo `writeBatch`:
1. Decrementar `cantidad_disponible` de esa bolsa en 1
2. Agregar novedad automática al array `novedades` de la bolsa:
   ```json
   {
     "tipo": "Uso en inoculación",
     "batch_id": "[id del batch generado]",
     "cantidad_afectada": 1,
     "fecha": "[hoy]",
     "operario": "[usuario logueado]"
   }
   ```
3. Si `disponible` llega a 0: marcar la bolsa como agotada
4. Si todas las bolsas del medio están agotadas: marcar el medio como "Agotado"

Esto cierra la trazabilidad: **bulk → bolsa → placa → batch**.

---

## BLOQUE 5 — MARCAR MEDIO COMO AGOTADO (manual)

Botón "✓ Marcar como agotado" visible en el header del card solo cuando `estado === "Activo"`.

Modal de confirmación con campos:
```
fecha_agotamiento  date — hoy por defecto
motivo *           select → Se usó todo | Se descartó el resto | Venció
observaciones      textarea — opcional
```

Al confirmar: `updateDoc` con `estado: "Agotado"`, `fecha_agotamiento`, `motivo_agotamiento`.
El registro queda visible en el maestro pero los acordeones de Sanitización y
Subfraccionamiento pasan a solo lectura (no se puede agregar nueva bolsa ni editar sanitización).
El acordeón de Auditoría sigue siendo editable (se puede seguir registrando QC).

---

## NOTAS TÉCNICAS CRÍTICAS

### Decimales — Bug conocido en el proyecto
Todos los campos numéricos de medición (pH, Brix, pesos, temperaturas, duraciones)
deben aceptar tanto punto como coma como separador decimal.
Normalizar a punto (`.`) antes de guardar en Firestore.
Ejemplo: el usuario escribe "6,8" → guardar como 6.8
Este sistema ya tuvo problemas con este tema. Revisar con cuidado en cada campo nuevo.

### Defensive programming — obligatorio
Antes de leer cualquier campo nuevo en un documento existente, verificar que existe.
Los registros actuales no tienen los nuevos campos y no deben romper la UI.

```javascript
// Correcto
const estado = medio?.estado ?? "Activo";
const sanitizacion = medio?.sanitizacion ?? null;
const ubicacion = medio?.ubicacion ?? "Sin especificar";

// Incorrecto — puede romper registros viejos
const estado = medio.estado;
```

### Subcolecciones — no bloquear la carga del maestro
Las subcolecciones (`subfracciones`, `auditorias`) se cargan lazy:
solo cuando el usuario abre el acordeón correspondiente.
El listado maestro NO debe esperar a que carguen las subcolecciones para renderizar.

### Imágenes
Las fotos van a Google Drive vía Apps Script proxy. Mismo flujo que fotos de cultivos.
NO usar Firebase Storage.

### ZPL — Zebra ZD220
La impresora está conectada por USB a una PC que actúa como servidor de impresión.
Usar el sistema ZPL ya implementado. Consultar los 6 perfiles existentes antes de
crear uno nuevo. Si hay un perfil compatible (SLIM_PETRI u otro), reutilizarlo.

---

## ORDEN DE IMPLEMENTACIÓN

Implementar en este orden. Pedir confirmación de Maxi antes de avanzar al siguiente bloque.

1. **BLOQUE 1** — Botones de acción en el header (Editar, Reimprimir, Archivar, Eliminar, Ubicación)
2. **BLOQUE 3** — Campo de ubicación en el formulario de ingreso
3. **BLOQUE 2A** — Acordeón Sanitización
4. **BLOQUE 2C** — Acordeón Auditoría
5. **BLOQUE 2B** — Acordeón Subfraccionamiento (bolsas + novedades)
6. **BLOQUE 5** — Botón marcar como agotado
7. **BLOQUE 4** — Integración con Inoculación (fraccionId en batch)

No implementar todo junto. Un bloque por vez.

---

## CONFIRMACIÓN ESPERADA

Al finalizar cada bloque, Antigravity debe confirmar:
- Qué archivos se modificaron
- Qué campos nuevos se agregaron a Firestore (si aplica)
- Si hay algún punto del bloque que no se pudo implementar y por qué

Maxi confirma el resultado antes de avanzar al siguiente bloque.
