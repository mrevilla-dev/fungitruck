# FungiTrack — Prompt para Antigravity
## Módulo: Ventanilla Única de Ingreso de Material (IngresoMaterialPage.jsx)
> 22/06/2026

---

## REGLAS DE ORO

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.
3. Todos los cambios son aditivos. No eliminar lógica existente ni documentos de Firestore.
4. Defensive programming: `campo?.subcampo ?? fallback` siempre.
5. **Imágenes y archivos: siempre Google Drive vía Apps Script proxy. NUNCA Firebase Storage.**
6. **Antes de escribir código de cada bloque, mostrame un plan de implementación y esperá mi confirmación.**
7. Confirmar antes de avanzar al siguiente bloque.
8. No tocar: colección `esporomas` existente, módulo de cosechas, criobanco, impresión ZPL, árbol genealógico.
9. **Si el writeBatch falla, mostrar un toast/alerta de error y NO resetear el formulario.** El usuario debe poder corregir y reintentar sin perder los datos cargados.

---

## IMPORTS DE UTILIDADES (usar siempre estos, no crear nuevos)

```javascript
// IMPORTANTE: Antes de usar cualquier función de idGenerator.js,
// leer el archivo completo src/utils/idGenerator.js y usar la función
// correcta según la colección (puede llamarse generarIdBatch, generarIdEjemplar,
// generarIdEvento, etc.). No asumir el nombre — verificar en el archivo.

// Subida de archivos a Google Drive vía Apps Script
import { uploadFileToDrive } from '../services/driveService';
```

Estos mismos imports ya los usan `NuevoEsporomaModal`, `EjemplaresPage` y otros formularios — reutilizar la misma lógica, no reinventar.

---

## CONTEXTO Y DECISIÓN ARQUITECTÓNICA

**No se fusionan las colecciones `esporomas` y `ejemplares`.** Se mantienen separadas en Firestore.

**El problema actual:** Los formularios de "Nuevo Esporoma" y "Nuevo Ejemplar" existen como pantallas separadas, lo que genera confusión porque el usuario no sabe por cuál entrar según el material que tiene en mano.

**La solución:** Una nueva pantalla `IngresoMaterialPage.jsx` que actúa como **fachada de entrada única**. El usuario elige el tipo de material que está ingresando, y el sistema crea los documentos correctos en las colecciones correctas de forma transparente.

Los formularios viejos (`NuevoEsporomaModal`, `NuevoEjemplarModal`) **no se eliminan** — quedan como fallback interno pero ya no son el punto de entrada principal para el usuario.

---

## BLOQUE 1 — Estructura base: IngresoMaterialPage.jsx

**Archivos a crear:** `src/pages/IngresoMaterialPage.jsx`
**Archivos a modificar:** routing principal (agregar la nueva ruta).

### 1.1 — Pantalla inicial: selector de tipo de ingreso

Al entrar a `IngresoMaterialPage`, el usuario ve **dos opciones grandes y claras** (botones de alta visibilidad, aptos para uso con guantes):

**[🍄] Ruta A — Recolección propia / Cultivo interno**
- Casos: hongo silvestre recolectado en campo, o cuerpo fructífero cosechado de producción interna.
- Crea documentos en `esporomas` + opcionalmente en `ejemplares` y `eventos_aislamiento`.

**[📦] Ruta B — Genética externa / Comprada**
- Casos: jeringa de micelio líquido comprada, placa colonizada, spawn externo, sello de esporas de proveedor.
- Crea únicamente un documento en `ejemplares` con `esporoma_origen_id: null`.
- Nunca pasa por `esporomas`.

### 1.2 — Estado local compartido

```javascript
const [formIngreso, setFormIngreso] = useState({
  esporoma: {
    genero: "", especie: "", codigo_cepa: "", origen_material: "",
    lugar_recoleccion: "", latitud: "", longitud: "", fotoUrl: ""
  },
  derivaciones: []
  // Cada derivación: { tipo_derivacion, datosEjemplar, requiere_evento, datosEvento? }
});
```

### 1.3 — IDs semánticos
Ambas rutas deben usar la función correcta de `src/utils/idGenerator.js` para todos los documentos creados (`ESP-...`, `EJE-...`, `EVT-...`, `BAT-...`). Leer ese archivo antes de codificar para identificar el nombre exacto de cada función.

**Build y confirmar antes de continuar.**

---

## BLOQUE 2 — Ruta A: Recolección propia / Cultivo interno

**Archivos a modificar:** `IngresoMaterialPage.jsx`

### 2.1 — Campos del Esporoma (siempre visibles en Ruta A)
- Género, Especie, Código de cepa (opcional)
- Origen: select → `Silvestre` / `Cultivo interno`
  - Si `Silvestre`: mostrar Lugar de recolección (texto) + Latitud + Longitud
  - Si `Cultivo interno`: mostrar selector de batch de origen (opcional, del sistema)
- Foto (subir con `uploadFileToDrive` de `src/services/driveService.js`)
- Fecha, Operario, Observaciones

### 2.2 — Sección "Derivaciones inmediatas" (checkboxes al final)

El usuario puede marcar qué va a extraer del Esporoma en ese mismo momento. Cada derivación tiene dos tipos:

**Derivación "Seca"** (ej. Sello de Esporas):
- NO genera Evento de Aislamiento ni Batch.
- Solo crea un documento `EJE-...` en `ejemplares`.
- Campos: Tipo de material (pre-cargado según derivación), Tipo de micelio (pre-cargado: Polispórico), Ploidía.

**Derivación "Húmeda/Viva"** (ej. Explanto en agar, lluvia de esporas en placa, embudo a LC):
- SÍ genera Evento de Aislamiento + Batch físico para incubación.
- Crea: `EJE-...` + `EVT-...` + `BAT-...` (todos en el mismo `writeBatch`).
- Campos adicionales: Medio a usar (`SearchableSelect` de medios+subfracciones, igual que `NuevoCultivoModal`), Sala destino, Temperatura, Técnica de aislamiento.

### 2.3 — writeBatch atómico al confirmar

El `writeBatch` debe crear en una sola operación:
1. El documento en `esporomas`
2. Por cada derivación marcada: el documento en `ejemplares` con `esporoma_origen_id` referenciando al esporoma recién creado
3. Por cada derivación húmeda: el documento en `eventos_aislamiento` + el documento en `batches`
4. **Descuento de stock:** restar la cantidad usada al campo `disponible` en la subfracción correspondiente de la colección `medios_preparados` (misma lógica que `NuevoCultivoModal`)

### 2.4 — Resultado visible post-confirmación
Resumen: "Se registró el Esporoma ESP-... con 2 derivaciones: 1 Ejemplar EJE-... (Sello de Esporas) y 1 Ejemplar EJE-... + Batch BAT-... (Explanto en agar)."

**Build y confirmar antes de continuar.**

---

## BLOQUE 3 — Ruta B: Genética externa / Comprada

**Archivos a modificar:** `IngresoMaterialPage.jsx`

### 3.1 — Campos del Ejemplar externo
- Género, Especie, Código de cepa (opcional)
- Forma de ingreso: select → Jeringa (LC) / Placa colonizada / Spawn (Micelio en grano) / Sello de esporas / Otro
- Ploidía, Tipo de micelio (pre-cargados según forma de ingreso, editables)
- Fecha de ingreso, Operario, Observaciones
- Foto (subir con `uploadFileToDrive` de `src/services/driveService.js`)

### 3.2 — Campos comerciales (siempre visibles en Ruta B)
- Proveedor (texto)
- Fecha de compra
- Precio (número)
- Lote del proveedor (texto)
- Certificado / Ficha técnica: input de archivo → subir con `uploadFileToDrive` de `src/services/driveService.js` → guardar URL en Firestore como `certificadoUrl`

### 3.3 — writeBatch al confirmar
Crea únicamente un documento en `ejemplares` con:
```javascript
{
  esporoma_origen_id: null,
  ejemplar_padre_id: null,
  procedencia: "Comercial",
  externo: true,
  proveedor: "...",
  fecha_compra: "...",
  precio: 0,
  lote_proveedor: "...",
  certificadoUrl: "..."
}
```

### 3.4 — Resultado visible post-confirmación
"Se registró el Ejemplar EJE-... (Jeringa LC · Polispórico · Proveedor: Janicagram)."

**Build y confirmar antes de continuar.**

---

## BLOQUE 4 — Derivación asincrónica desde ficha de Esporoma

**Archivos a modificar:** página/componente de detalle o listado de Esporomas existente.
**Archivos a crear:** `src/components/DerivacionEsporomaModal.jsx`

### Objetivo
Permitir que, días o semanas después de haber registrado un Esporoma, el usuario pueda extraer una nueva derivación (nuevo Ejemplar) sin crear un Esporoma nuevo.

### 4.1 — Botón "Nueva Derivación" en ficha de Esporoma
En la vista de detalle o card de cada Esporoma existente, agregar un botón: **"+ Nueva Derivación"**.

### 4.2 — Modal DerivacionEsporomaModal
Al presionar el botón, abrir un modal que reutiliza la lógica de derivaciones del Bloque 2 (sección 2.2), pero:
- El Esporoma ya está seleccionado (viene como prop, no se elige).
- El modal pregunta solo: tipo de derivación (Seca o Húmeda) + campos correspondientes.
- Al confirmar, `writeBatch` crea el `EJE-...` (+ `EVT-...` + `BAT-...` si es húmeda), todos con `esporoma_origen_id` del Esporoma de contexto.
- Si el writeBatch falla: toast de error, formulario no se resetea.

### 4.3 — Diseño para reutilización futura
`DerivacionEsporomaModal` recibe `esporomaId` como prop — no está acoplado a ninguna página específica. Cuando se implemente el Árbol Genealógico (módulo futuro), este mismo modal se llamará desde la ficha del nodo Esporoma en el árbol, sin modificaciones.

**Build y confirmar antes de continuar.**

---

## VERIFICACIÓN FINAL

1. Build sin errores.
2. Ruta A, origen Silvestre → campos GPS visibles, derivación seca crea solo EJE, derivación húmeda crea EJE + EVT + BAT, stock descontado en `medios_preparados`.
3. Ruta A, origen Cultivo interno → sin campos GPS.
4. Ruta B → campos comerciales visibles, `esporoma_origen_id: null`, certificado subido a Drive (no Firebase Storage).
5. Desde ficha de Esporoma existente → botón "Nueva Derivación" abre modal, crea EJE vinculado al esporoma.
6. Simular fallo de writeBatch → toast de error, formulario conserva los datos.
7. Todos los IDs usan la función correcta de `src/utils/idGenerator.js` (verificar nombre en el archivo).
8. Ningún archivo va a Firebase Storage — todo a Google Drive vía `uploadFileToDrive`.
9. Formularios viejos (`NuevoEsporomaModal`, `NuevoEjemplarModal`) siguen funcionando sin cambios.

---

**Recordatorio: mostrame el plan de cada bloque antes de tocar código. Un bloque a la vez.**
