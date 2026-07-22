# FungiTrack — Módulo 4: Inoculaciones + Cola de Impresión
## Prompt definitivo para Antigravity
> Junio 2026 — Hito: 20 de junio

---

## REGLAS DE ORO — LEER ANTES DE EMPEZAR

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. **Al finalizar cada bloque, responder el checklist de verificación** y esperar confirmación de Maxi antes de continuar.
3. **No romper nada.** Todos los cambios son aditivos. No eliminar lógica existente.
4. **Defensive programming:** `campo?.subcampo ?? fallback` siempre.
5. **Decimales:** normalizar coma a punto antes de guardar en Firestore.
6. **Imágenes:** Google Drive vía Apps Script proxy. **NUNCA Firebase Storage.**
7. **Deploy:** `npm run build` + Firebase Hosting (`fungitrack-9b463.web.app`). **NUNCA Vercel ni Netlify.**
8. **`writeBatch`** para toda operación que toca más de un documento de Firestore.
9. **No modificar** `esporomas`, `salas`, ni la lógica de stock de `medios_preparados`.

---

## CONTEXTO DEL SISTEMA

FungiTrack es un LIMS de trazabilidad micológica.
**Stack:** React 19 + Vite + Firebase Firestore + Firebase Auth + Google Drive + Zebra ZD220 USB.

**Colecciones existentes relevantes:**
- `esporomas` — cuerpos fructíferos físicos. **NO TOCAR.**
- `batches` — lotes de cultivo. Datos dummy. **Verde para reescribir.**
- `medios_preparados` + subcolección `subfracciones`. **No tocar lógica de stock.** Solo agregar opción de cola.
- `salas` — espacios físicos. Solo lectura.
- `tareas` — tareas del lab. Solo lectura.
- `insumos_base` / `insumos_lotes` — inventario. Solo lectura.

**Colecciones nuevas que crea este módulo:**
- `ejemplares` — identidades genéticas / linajes.
- `cola_impresion` — cola centralizada de etiquetas Zebra.

---

## ESQUEMA DE DATOS NUEVOS

### Colección `ejemplares`
```javascript
{
  id: string,           // semántico: EJE-[GENEROESPECIE]-AAAAMMDD-NNN
                        // ej: EJE-CORMIL-20260601-001
  genero: string,
  especie: string,
  ploidia: string,      // "Haploide" | "Diploide"
  tipo_micelio: string, // "Monocarión" | "Dicarión" | "Polispórico" | "Población"
  mat: string,          // "MAT 1-1" | "MAT 1-2" | "Desconocido" | "N/A"
                        // N/A si ploidia === "Diploide"
  esporomaOrigenId: string | null,  // link a esporomas (opcional)
  ejemplarPadreId: string | null,   // link a ejemplar padre (opcional)
  generacion: number,   // 0 = Origen Cero. Si tiene padre: padre.generacion + 1
  fecha_ingreso: timestamp,
  operario: string,
  observaciones: string,
  fotoUrl: string | null,
  estado: string,       // "Activo" | "Criopreservado" | "Agotado" | "Contaminado"
  eliminado: boolean
}
```

### Colección `cola_impresion`
```javascript
{
  id: autogenerado,
  modulo: string,           // "inoculaciones" | "medios" (para futura integración)
  batch_ids: array,         // IDs de los batches incluidos
  tipo_etiqueta: string,    // "batch_individual" | "batch_lote"
  datos_etiquetas: array,   // objetos con datos para generar ZPL
  estado: string,           // "Pendiente" | "Impreso"
  fecha_generacion: timestamp,
  operario: string,
  impreso_por: string | null,
  fecha_impresion: timestamp | null
}
```

### Campos nuevos en `batches` (sobre los existentes — no eliminar ningún campo actual)
```javascript
{
  // CAMPOS EXISTENTES — NO MODIFICAR
  // id, batchGroupId, genero, especie, cepa, generacion,
  // substrate, medioPrepId, destinoId, destinoNombre,
  // tipoContenedor, observaciones, operator, fotoUrl,
  // fechaInoculacion, status

  // CAMPOS NUEVOS
  ejemplarId: string,          // ejemplar fuente principal
  tipo_inoculacion: string,
  // "placa_a_liquido" | "liquido_a_grano" | "placa_a_placa" | "aislamiento_primario"

  es_aislamiento_primario: boolean,
  // true = Origen Cero, no descuenta stock de ningún lado

  // Origen físico
  fraccionId: string | null,       // bolsa de subfracción origen
  batch_origen_id: string | null,  // batch origen si es repique

  // Métricas del inóculo
  cantidad_inoculo: number | null,
  unidad_inoculo: string | null,   // "mL" | "µL" | "g" | "%"
  fraccion_placa: string | null,   // "1/8" | "1/4" | "1/2" | "1"

  // Lote
  batch_index: number,             // posición en el lote (ej: 3 de 20)
  batch_total: number,             // total del lote
  batch_grupo_id: string,          // ID compartido por todas las unidades del lote

  // Viabilidad origen
  origen_declarado_agotado: boolean,

  // UFC — opcional, editable a posteriori
  ufc: number | null,

  // Agrupación física — opcional
  contenedor_logico: string | null,

  // Cola de impresión
  cola_impresion_id: string | null,

  // Heredado del medio preparado
  peso_seco_pct: number | null
}
```

---

## BLOQUE 0 — Infraestructura de cola de impresión

**Objetivo:** crear la pantalla centralizada de gestión de etiquetas.
Este bloque no toca ningún módulo existente.

### 0A — Componente PrintQueue.jsx + ruta /print-queue

Crear `src/pages/PrintQueue.jsx` y agregar la ruta al router.
Agregar acceso desde el menú principal con ícono 🖨️.

**Funcionalidades:**

Leer todos los documentos de `cola_impresion` donde `estado === "Pendiente"`.

Mostrar listado:
```
🖨️ COLA DE IMPRESIÓN

[Módulo: Inoculaciones] — 01/06/2026 · Maxi
  20 etiquetas · COR-MIL-LC-20260601-001-A a -T
  [Ver detalle] [Imprimir lote] [Marcar como impreso]

[Módulo: Medios] — 29/05/2026 · Nacho
  3 etiquetas · FRAC-ECA-20260529-A, -B, -C
  [Ver detalle] [Imprimir lote] [Marcar como impreso]

─────────────────────────────────────
[🖨️ Imprimir TODO lo pendiente]
```

**Lógica de impresión:**
```javascript
const imprimirLote = async (colaItem) => {
  for (const etiqueta of colaItem.datos_etiquetas) {
    const zpl = generarZPL(etiqueta);
    await enviarAImpresora(zpl); // usar función ZPL existente
    await delay(300);            // pausa para no saturar buffer Zebra
  }
  await updateDoc(colaRef, {
    estado: 'Impreso',
    impreso_por: usuarioActivo,
    fecha_impresion: serverTimestamp()
  });
};
```

Usar la función de envío ZPL que ya existe en el proyecto.
No crear un nuevo sistema de impresión — reutilizar el existente.

### 0B — No crear la colección manualmente
Firestore crea `cola_impresion` automáticamente al guardar el primer documento.

---

### ✅ VERIFICACIÓN BLOQUE 0 — responder antes de continuar

```
[ ] ¿La ruta /print-queue es accesible desde el menú?
[ ] ¿El listado lee correctamente de cola_impresion en Firestore?
[ ] ¿Los botones "Imprimir lote" y "Marcar como impreso" funcionan?
[ ] ¿Deploy exitoso en Firebase Hosting?
```

---

## BLOQUE 1 — Botón "Enviar a cola" en Medios Preparados

**Objetivo:** integrar medios preparados con la nueva cola de impresión.
Cambio mínimo, no invasivo. Solo agregar una opción donde ya existe el botón de impresión.

### Archivos a modificar

Identificar dónde se dispara la impresión de etiquetas en el módulo de medios.
Puede ser en `SubfraccionamientoAccordion.jsx` o en un modal de impresión existente.
**Leer el archivo completo antes de tocar.**

### Cambio requerido

Donde hoy existe el botón **[🏷️ Imprimir]**, agregar junto a él:
**[📥 Enviar a cola]**

Al hacer click en "Enviar a cola":
```javascript
await addDoc(collection(db, 'cola_impresion'), {
  modulo: 'medios',
  batch_ids: [],                    // no aplica para medios
  tipo_etiqueta: 'subfraccion',
  datos_etiquetas: [datosEtiqueta], // mismos datos que se envían a la Zebra hoy
  estado: 'Pendiente',
  fecha_generacion: serverTimestamp(),
  operario: usuarioActivo,
  impreso_por: null,
  fecha_impresion: null
});
// Mostrar toast: "✅ Etiqueta enviada a la cola de impresión"
```

El botón "Imprimir ahora" existente **no se toca**. Ambas opciones conviven.

---

### ✅ VERIFICACIÓN BLOQUE 1 — responder antes de continuar

```
[ ] ¿El botón "Imprimir ahora" sigue funcionando igual que antes?
[ ] ¿Al hacer "Enviar a cola" aparece el toast de confirmación?
[ ] ¿El documento se guarda en cola_impresion con estado "Pendiente"?
[ ] ¿El documento aparece en /print-queue?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 2 — Colección `ejemplares` y formulario de alta

**Objetivo:** crear la nueva colección y su UI de gestión.

### 2A — Ubicación visual

Crear ruta nueva `/ejemplares` para no recargar `InventoryPage.jsx`.
Agregar al menú principal con ícono 🧬.

### 2B — Formulario de alta de ejemplar

```
genero *           string
especie *          string

ploidia *          select → Haploide | Diploide

tipo_micelio *     select → Monocarión | Dicarión | Polispórico | Población

mat *              select → MAT 1-1 | MAT 1-2 | Desconocido | Polispórico
                   VISIBLE y obligatorio SOLO si ploidia === "Haploide"
                   Si ploidia === "Diploide" → ocultar campo y setear mat = "N/A"

esporomaOrigenId   SearchableSelect → colección esporomas — opcional
ejemplarPadreId    SearchableSelect → colección ejemplares — opcional

generacion         número — SOLO LECTURA — calculado:
                   Si tiene ejemplarPadreId → padre.generacion + 1
                   Si no tiene padre → 0

fecha_ingreso *    date — hoy por defecto
operario *         string — usuario Firebase Auth por defecto, editable con dropdown
observaciones      textarea — opcional
foto               dos botones: [📷 Cámara] [🖼️ Galería] — igual que módulo de medios
```

### 2C — Listado de ejemplares

Cards con: ID · especie · tipo_micelio · mat · generación · estado.

Badge de estado:
- Activo → 🟢 verde
- Agotado → 🔵 azul
- Contaminado → 🔴 rojo
- Criopreservado → 🔵 celeste

Filtros: especie · estado · tipo_micelio.

Botones por card: 🖊️ Editar · 🗑️ Eliminar (soft delete: `eliminado: true`).

---

### ✅ VERIFICACIÓN BLOQUE 2 — responder antes de continuar

```
[ ] ¿La ruta /ejemplares es accesible desde el menú?
[ ] ¿El campo mat se oculta automáticamente cuando ploidia === "Diploide"?
[ ] ¿La generación se calcula automáticamente al seleccionar un padre?
[ ] ¿Se puede crear un ejemplar sin padre (Origen Cero, generación 0)?
[ ] ¿El listado muestra cards con filtros funcionando?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 3 — Formulario de inoculación: UI Rutas 1 y 2

**Objetivo:** reescribir `NuevoCultivoModal.jsx` con los primeros dos flujos.
El componente actual tiene solo datos dummy — verde para reescribir completamente.
**En este bloque: solo UI. La lógica transaccional va en el BLOQUE 5.**
Al confirmar el formulario, mostrar un `console.log` con los datos y cerrar el modal.
No guardar nada en Firestore todavía.

### Rutas a implementar en este bloque

```
Ruta 1: Placa Agar → Medio Líquido     (prioridad alta)
Ruta 2: Medio Líquido → Grano/Spawn   (prioridad alta)
```

### Estructura del formulario (pasos secuenciales)

**PASO 1 — Tipo de inoculación**
```
tipo_inoculacion *   select →
  "Placa Agar → Medio Líquido"         ← Ruta 1
  "Medio Líquido → Grano/Spawn"        ← Ruta 2
  "Placa Agar → Placa Agar (Repique)"  ← Ruta 3 (BLOQUE 4)
  "Aislamiento Primario (Origen Cero)" ← Ruta 4 (BLOQUE 4)

Rutas 3 y 4: mostrar en el select pero mostrar mensaje
"Próximamente disponible" si se seleccionan. No bloquear el selector.
```

---

**PASO 2 — Origen (dinámico según tipo)**

**Ruta 1 — Origen: Placa Agar**
```
ejemplar_fuente *   SearchableSelect → ejemplares donde estado === "Activo"
                    mostrar: ID + especie + generacion + mat

placa_origen *      SearchableSelect → batches donde:
                      ejemplarId === ejemplar_fuente.id
                      AND status IN ["Activo", "Incubando"]
                    cargar LAZY al seleccionar el ejemplar
                    mostrar: ID batch + fecha + ubicación

fraccion_placa *    select → 1/8 | 1/4 | 1/2 | 1 placa entera

origen_declarado_agotado   checkbox
  label: "Declarar placa origen como no viable después de esta inoculación"
  default: false (sin marcar)
```

**Ruta 2 — Origen: Medio Líquido**
```
ejemplar_fuente *   SearchableSelect → igual que Ruta 1

batch_liquido *     SearchableSelect → batches donde:
                      ejemplarId === ejemplar_fuente.id
                      AND tipo_inoculacion === "placa_a_liquido" (o similar)
                      AND status IN ["Activo", "Incubando"]
                    cargar LAZY al seleccionar el ejemplar

cantidad_inoculo *  number
unidad_inoculo *    select → mL | µL
```

---

**PASO 3 — Destino**

**Ruta 1 — Destino: Medio Líquido**
```
medio_prep *        SearchableSelect → medios_preparados donde:
                      categoria === "Líquido" AND estado === "Activo"
                    mostrar: alias + cantidad disponible + ubicación

fraccion_destino    SearchableSelect → subfracciones del medio seleccionado
                      donde disponible > 0
                    cargar LAZY al seleccionar el medio
                    opcional — si no se elige, va al bulk

cantidad_unidades * number — cuántos frascos/unidades se inoculan
```

**Ruta 2 — Destino: Grano/Spawn**
```
medio_prep *        SearchableSelect → medios_preparados donde:
                      categoria === "Semilla" AND estado === "Activo"

fraccion_destino    igual que Ruta 1

cantidad_unidades * number
cantidad_inoculo *  number — inóculo por unidad
unidad_inoculo *    select → % | g
```

---

**PASO 4 — Lote e identificación**
```
modo_id *           radio →
  ● IDs Individuales Correlativos (default)
    Un ID único por cada unidad
    ej: COR-MIL-LC-20260601-001-A, ...-B, ...-C
  ○ ID Global de Lote
    Un ID para todo el grupo (unidades anónimas)

cantidad_total *    number — cuántas unidades se inoculan en esta sesión
                    mostrar preview de los IDs que se generarán

contenedor_logico   string — opcional
                    label: "Agrupación física (cajón, bandeja, bolsa)"
                    placeholder: "ej: Cajón A, Bolsa Roja"

fecha_inoculacion * date — hoy por defecto

operario *          string — usuario Firebase Auth por defecto
                    editable con dropdown de usuarios del sistema

observaciones       textarea — opcional

ufc                 number — opcional
                    label: "UFC (editable a posteriori)"
```

---

**PASO 5 — Destino físico**
```
sala_destino *      SearchableSelect → colección salas
                    mostrar: nombre + tipo
                    OBLIGATORIO — no se puede avanzar sin sala

estante             string — opcional
                    placeholder: "ej: Estante B, nivel 3"
```

---

**PASO 6 — Resumen**

Mostrar resumen completo antes de confirmar. Ejemplo:
```
Tipo: Placa Agar → Medio Líquido
Ejemplar: EJE-CORMIL-20260601-001 · Cordyceps militaris · Monocarión · MAT 1-1
Origen: Batch COR-MIL-APD-20260601-003 · 1/4 de placa
Destino: LC-Cordyceps Lote 2 · Bolsa FRAC-LC-20260601-A · 20 frascos
Sala: Bioterio · Estante B
Operario: Maxi · 01/06/2026

IDs a generar:
COR-MIL-LC-20260601-001-A
COR-MIL-LC-20260601-001-B
... (y 18 más)

[✓ Confirmar — NO guarda en Firestore todavía] [Cancelar]
```

Al confirmar → `console.log(datosCompletos)` y cerrar modal.

---

### ✅ VERIFICACIÓN BLOQUE 3 — responder antes de continuar

```
[ ] ¿El selector de tipo de inoculación adapta el formulario dinámicamente?
[ ] ¿El SearchableSelect de ejemplar filtra solo los Activos?
[ ] ¿Las placas/batches de origen cargan lazy al seleccionar el ejemplar?
[ ] ¿El preview de IDs se actualiza al cambiar cantidad_total?
[ ] ¿El paso 5 bloquea el avance si no se selecciona sala?
[ ] ¿El resumen del paso 6 muestra todos los datos correctamente?
[ ] ¿Las rutas 3 y 4 muestran "Próximamente" sin romper el formulario?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 4 — Formulario de inoculación: UI Rutas 3 y 4

**Objetivo:** completar el formulario con los dos flujos restantes.
Mismo patrón que BLOQUE 3. Solo UI, sin lógica transaccional todavía.

### Ruta 3 — Placa Agar → Placa Agar (Repique)

Igual que Ruta 1 en el Paso 2 (origen: placa).
En el Paso 3, el destino es:
```
medio_prep *   SearchableSelect → medios_preparados donde categoria === "Agar"
```
El resto del formulario igual que Rutas 1 y 2.

### Ruta 4 — Aislamiento Primario (Origen Cero)

**Paso 2 — Origen especial:**
```
ejemplar_fuente *   SearchableSelect → colección ejemplares
                    (puede ser recién creado en /ejemplares)

nota informativa    mostrar banner:
  "⚠️ Aislamiento Primario: este es el Origen Cero del ejemplar seleccionado.
  No se descuenta stock de ningún origen.
  Se crea el primer contenedor físico de esta línea genética."

NO mostrar campos de cantidad de inóculo ni fracción de placa.
NO mostrar checkbox de "declarar origen agotado".
```

**Paso 3 — Destino:**
```
medio_prep *   SearchableSelect → medios_preparados donde categoria === "Agar"
fraccion_destino   igual que otras rutas
cantidad_unidades * number
```

El resto del formulario (pasos 4, 5, 6) igual que las otras rutas.

---

### ✅ VERIFICACIÓN BLOQUE 4 — responder antes de continuar

```
[ ] ¿La Ruta 3 muestra destino de tipo "Agar" correctamente?
[ ] ¿La Ruta 4 muestra el banner de Aislamiento Primario?
[ ] ¿La Ruta 4 oculta los campos de inóculo y el checkbox de origen agotado?
[ ] ¿Las 4 rutas conviven en el mismo formulario sin errores?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 5 — Lógica transaccional (writeBatch)

**Objetivo:** conectar el formulario con Firestore.
Reemplazar el `console.log` del paso 6 por el `writeBatch` real.

### 5A — Verificación de stock antes de escribir

```javascript
// Antes del writeBatch, verificar:
if (fraccionDestino && fraccionDestino.disponible < cantidadUnidades) {
  mostrarAdvertencia(
    `La bolsa seleccionada tiene ${fraccionDestino.disponible} unidades
     disponibles pero querés inocular ${cantidadUnidades}.
     ¿Continuar de todas formas?`
  );
  // Permitir continuar — el operario decide
}
```

### 5B — writeBatch completo

```javascript
const batch = writeBatch(db);
const batchIds = [];
const grupoId = `GRP-${Date.now()}`;

// 1. Crear N documentos en batches
for (let i = 0; i < cantidadTotal; i++) {
  const letra = String.fromCharCode(65 + i); // A, B, C...
  const batchId = modoId === 'individual'
    ? `${codigoGenero}-${codigoEspecie}-${codigoMedio}-${fecha}-${secuencia}-${letra}`
    : `${codigoGenero}-${codigoEspecie}-${codigoMedio}-${fecha}-${secuencia}`;

  batchIds.push(batchId);

  batch.set(doc(db, 'batches', batchId), {
    // campos existentes
    genero, especie, medioPrepId, destinoId, destinoNombre,
    operator: operario, fechaInoculacion, status: 'Inoculado',
    // campos nuevos
    ejemplarId, tipo_inoculacion,
    es_aislamiento_primario: tipoRuta === 'aislamiento_primario',
    fraccionId: fraccionOrigen?.id ?? null,
    batch_origen_id: batchOrigen?.id ?? null,
    cantidad_inoculo: cantidadInoculo ?? null,
    unidad_inoculo: unidadInoculo ?? null,
    fraccion_placa: fraccionPlaca ?? null,
    batch_index: i + 1,
    batch_total: cantidadTotal,
    batch_grupo_id: grupoId,
    origen_declarado_agotado: origenDeclaradoAgotado,
    ufc: null,
    contenedor_logico: contenedorLogico ?? null,
    cola_impresion_id: null, // se actualiza en paso 5
    peso_seco_pct: medioPrepData?.peso_seco_pct ?? null
  });
}

// 2. Descontar stock del origen (si NO es aislamiento primario)
if (!esAislamientoPrimario && fraccionOrigenId) {
  batch.update(doc(db, 'medios_preparados', medioOrigenId,
    'subfracciones', fraccionOrigenId), {
    disponible: increment(-1)
  });
}

// 3. Marcar batch origen como agotado (si el operario lo declaró)
if (origenDeclaradoAgotado && batchOrigenId) {
  batch.update(doc(db, 'batches', batchOrigenId), {
    status: 'Agotado'
  });
}

// 4. Descontar del medio destino (si se seleccionó fracción)
if (fraccionDestinoId) {
  batch.update(doc(db, 'medios_preparados', medioDestinoId,
    'subfracciones', fraccionDestinoId), {
    disponible: increment(-cantidadUnidades)
  });
}

// 5. Crear documento en cola_impresion
const colaRef = doc(collection(db, 'cola_impresion'));
batch.set(colaRef, {
  modulo: 'inoculaciones',
  batch_ids: batchIds,
  tipo_etiqueta: modoId === 'individual' ? 'batch_individual' : 'batch_lote',
  datos_etiquetas: batchIds.map((id, i) => ({
    id,
    especie: `${genero} ${especie}`,
    tipo_inoculacion,
    generacion: ejemplarData.generacion,
    mat: ejemplarData.mat,
    fecha: fechaInoculacion,
    operario,
    sala: salaNombre,
    contenedor_logico: contenedorLogico ?? null,
    numero_unidad: i + 1,
    total_unidades: cantidadTotal
  })),
  estado: 'Pendiente',
  fecha_generacion: serverTimestamp(),
  operario,
  impreso_por: null,
  fecha_impresion: null
});

try {
  await batch.commit();
  // Actualizar cola_impresion_id en los batches creados
  // (hacer updateDoc individual por cada batch — no es crítico que sea atómico)
  for (const batchId of batchIds) {
    await updateDoc(doc(db, 'batches', batchId), {
      cola_impresion_id: colaRef.id
    });
  }
  mostrarExito('Inoculación registrada. Las etiquetas están en la cola de impresión.');
  cerrarModal();
} catch (error) {
  mostrarError('Error al registrar la inoculación. No se guardó nada. Intentá de nuevo.');
  console.error(error);
}
```

### 5C — Generación del ID semántico

```javascript
const generarBatchId = (genero, especie, medio, fecha, secuencia, letra) => {
  const g = genero.substring(0, 3).toUpperCase();     // ej: COR
  const e = especie.substring(0, 3).toUpperCase();    // ej: MIL
  const m = extraerCodigoMedio(medio.alias);           // ej: LC (función del módulo de medios)
  const f = fecha.replace(/-/g, '');                   // ej: 20260601
  const s = String(secuencia).padStart(3, '0');        // ej: 001
  return letra
    ? `${g}-${e}-${m}-${f}-${s}-${letra}`              // individual: COR-MIL-LC-20260601-001-A
    : `${g}-${e}-${m}-${f}-${s}`;                      // global: COR-MIL-LC-20260601-001
};
```

---

### ✅ VERIFICACIÓN BLOQUE 5 — responder antes de continuar

```
[ ] ¿Al confirmar, se crean los N documentos en batches en Firestore?
[ ] ¿Los IDs son semánticos y legibles (no IDs de Firestore)?
[ ] ¿Se descuenta el stock del origen (si aplica)?
[ ] ¿La Ruta 4 (aislamiento primario) NO descuenta stock?
[ ] ¿Se crea el documento en cola_impresion con estado "Pendiente"?
[ ] ¿El documento aparece en /print-queue?
[ ] ¿Si el writeBatch falla, no se guarda nada y aparece el mensaje de error?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 6 — ZPL: layout de etiquetas para batches

**Objetivo:** crear el perfil ZPL para etiquetas de cultivo.
Basarse en los perfiles ZPL existentes. No crear un sistema nuevo.

### Datos a incluir en cada etiqueta

```
- ID del batch (texto legible + código QR con ese ID)
- Especie (ej: Cordyceps militaris)
- Tipo de inoculación (ej: Placa → LC)
- Generación (ej: Gen 2)
- MAT (si mat !== "N/A" y mat !== "Desconocido")
- Fecha de inoculación
- Operario
- Sala destino
- Contenedor lógico (si existe): "📦 Cajón A"
- Si es lote individual: "Unidad 3 / 20"
```

### Integración con PrintQueue

La función `generarZPL(etiqueta)` en `PrintQueue.jsx` debe usar
los datos del array `datos_etiquetas` de `cola_impresion`.

Usar el rollo 100×150mm ya configurado.
No intentar poner múltiples QR por etiqueta — una etiqueta por unidad.

---

### ✅ VERIFICACIÓN BLOQUE 6 — responder antes de continuar

```
[ ] ¿Las etiquetas de batches se generan con los datos correctos?
[ ] ¿El QR del batch escanea y devuelve el ID correcto?
[ ] ¿Si el batch tiene contenedor lógico, aparece en la etiqueta?
[ ] ¿El campo "Unidad X / Y" aparece solo en lotes individuales?
[ ] ¿Deploy exitoso?
```

---

## BLOQUE 7 — Dashboard: integración final

**Objetivo:** agregar dos bloques informativos al Dashboard existente.
No romper nada de lo que ya hay en el Dashboard.

### 7A — Bloque "🧫 Cultivos activos"

```javascript
// Leer batches agrupados por status
// Mostrar conteos:
Inoculado:      X
Incubando:      Y
Fructificando:  Z
Cosechado:      W  (últimos 30 días)
Contaminado:    V  (últimos 30 días)
```

Botón [Ver todos] → ruta de listado de batches (existente o nueva).

### 7B — Bloque "🖨️ Etiquetas pendientes"

```javascript
// Leer cola_impresion donde estado === "Pendiente"
// Contar total de etiquetas (sumar longitud de batch_ids)
// Si hay pendientes: mostrar bloque
// Si no hay: no mostrar el bloque (no mostrar "0 pendientes")
```

```
🖨️ 25 etiquetas pendientes de imprimir
[Ir a imprimir →]
```

---

### ✅ VERIFICACIÓN BLOQUE 7 — responder antes de continuar

```
[ ] ¿El bloque de cultivos activos muestra conteos reales de Firestore?
[ ] ¿El bloque de etiquetas pendientes desaparece cuando no hay nada en cola?
[ ] ¿El botón "Ir a imprimir" navega a /print-queue?
[ ] ¿El Dashboard existente sigue funcionando igual?
[ ] ¿Deploy exitoso?
```

---

## ORDEN DE IMPLEMENTACIÓN

```
BLOQUE 0 → Cola de impresión: PrintQueue.jsx + ruta /print-queue
BLOQUE 1 → Botón "Enviar a cola" en módulo de medios (no invasivo)
BLOQUE 2 → Colección ejemplares + formulario + listado
BLOQUE 3 → Formulario inoculación UI — Rutas 1 y 2 (solo UI)
BLOQUE 4 → Formulario inoculación UI — Rutas 3 y 4 (solo UI)
BLOQUE 5 → Lógica transaccional writeBatch (conectar UI con Firestore)
BLOQUE 6 → ZPL: layout de etiquetas para batches
BLOQUE 7 → Dashboard: cultivos activos + cola pendiente
```

Cada bloque termina con el checklist de verificación.
Maxi confirma antes de continuar.

---

## REPORTE FINAL

Al terminar todos los bloques, generar reporte con:
- Archivos creados y modificados
- Colecciones y campos nuevos en Firestore
- Las 4 rutas de inoculación implementadas y su estado
- Rutas postergadas para post-20 de junio:
  - Criovial → Placa/LC
  - Grano → Sustrato definitivo
  - Hibridación (dos fuentes simultáneas)
  - Cola de impresión global (integrar módulo de medios y genética)
- Pendientes y riesgos detectados
