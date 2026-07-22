# FungiTrack — Prompt de Cierre
## Módulo Medios Preparados — Bloques finales
> Mayo 2026

---

## CONTEXTO

El módulo de Medios Preparados está casi completo.
Los siguientes bloques están implementados y deployados en producción:

- Bloque 1 ✅ — Bug mobile corregido + filtros + datos en cards
- Bloque 2 ✅ — Campos formulario (categoría, ubicación, operario) + búsqueda por categoría
- Bloque 4 ✅ — Subfraccionamiento con novedades + fotos a Drive + etiquetas ZPL + unidades dinámicas
- Bloque 5 ✅ — Sanitización con terminología correcta + mermas con descuento automático + autocompletado

Lo que sigue son los bloques finales. Implementar uno a la vez,
deployar y confirmar con Maxi antes de continuar.

**REGLA DE ORO:** Antes de modificar cualquier archivo, leerlo completo.
Todos los cambios son aditivos. No tocar lo que ya funciona.

---

## REGLAS TÉCNICAS TRANSVERSALES

- `stock_bulk?.cantidad_actual ?? cantidad_actual ?? 0` en toda lectura de stock
- Decimales: normalizar coma a punto antes de guardar en Firestore
- `writeBatch` para toda operación multi-documento
- Subcolecciones: cargar lazy (al abrir acordeón)
- Imágenes: Google Drive vía Apps Script proxy — NUNCA Firebase Storage
- Deploy: `npm run build` + Firebase Hosting (fungitrack-9b463.web.app)
- No usar Vercel ni Netlify

---

## BLOQUE 1 ADICIONAL — Filtro de ubicación multinivel

Este ajuste complementa el Bloque 1 ya implementado.
Solo agregar esta lógica al filtro de ubicación existente, sin tocar el resto.

El filtro de ubicación debe buscar en dos niveles simultáneamente:

**Nivel 1:** medios donde el campo `ubicacion` del documento principal coincide.

**Nivel 2:** medios que tengan al menos una bolsa en su subcolección
`subfracciones/` con ese valor de `ubicacion`.

Mostrar la unión de ambos resultados sin duplicados.
Si un medio aparece por ambas razones, mostrarlo una sola vez.

Implementación sugerida:
```javascript
// Query nivel 1 — documento principal
const q1 = query(
  collection(db, 'medios_preparados'),
  where('ubicacion', '==', filtroUbicacion),
  where('eliminado', '!=', true)
);

// Query nivel 2 — subcolecciones (collectionGroup)
const q2 = query(
  collectionGroup(db, 'subfracciones'),
  where('ubicacion', '==', filtroUbicacion)
);
// De q2 extraer los medioIds padre y agregarlos al resultado

// Unión sin duplicados por id
```

El chip de ubicación en cada card debe reflejar TODAS las ubicaciones
activas del medio, no solo la del documento principal:
```
📍 Heladera Lab · Freezer -20°C
```
Si el medio tiene bulk en un lugar y bolsas en otro, mostrar ambos.

Nota: `collectionGroup` requiere un índice en Firestore para el campo
`ubicacion` en la subcolección `subfracciones`. Crearlo si no existe.

---

## BLOQUE 3 — Ciclo de vida: Archivar y vista de historial

### 3A — Verificar o implementar botón Archivar

Verificar si el botón Archivar ya existe y funciona. Comportamiento esperado:

1. Al hacer click → modal de confirmación:
   "¿Archivar este medio? No aparecerá en el listado activo."

2. Caso borde — si el medio tiene bolsas con `disponible > 0`:
   Mostrar advertencia adicional (no bloquear, solo informar):
   "Este medio tiene bolsas con stock activo. Al archivarlo seguirán
   visibles en el historial pero no podrán usarse para nuevas inoculaciones.
   ¿Continuar?"

3. Al confirmar → `updateDoc` con `{ estado: "Archivado" }`

4. El medio desaparece inmediatamente del listado sin recargar la página
   (actualización reactiva del estado local tras el updateDoc)

5. El documento NO se elimina de Firestore

Si ya funciona así → confirmarlo y pasar a 3B.
Si no → implementarlo.

### 3B — Vista de historial con toggle

Agregar un ícono 🗃️ en la cabecera de la pantalla de medios preparados,
a la derecha del título "Medios Preparados".

Implementación del toggle:
```javascript
const [modoHistorial, setModoHistorial] = useState(false);
```

**Vista activa** (default, `modoHistorial === false`):
Muestra medios con `eliminado !== true` AND `estado !== "Archivado"`

**Vista historial** (`modoHistorial === true`):
Muestra medios con `estado === "Archivado"` OR `eliminado === true`

Comportamiento visual del toggle:
- El ícono cambia visualmente según el modo
- Cambiar el título: "Medios Preparados" ↔ "Medios Preparados — Historial"
- Agregar chip: "📋 Activos" / "📦 Historial"

Cards en vista historial:
- Solo lectura — no mostrar botones de acción
- Excepción: botón "Restaurar" visible SOLO en medios con
  `estado === "Archivado"` (NO en eliminados)
  Al restaurar → `updateDoc` con `{ estado: "Activo" }`
  La card desaparece del historial y reaparece en vista activa reactivamente
- Cards de medios eliminados: sin ningún botón

Indicador visual en cada card del historial:
- Archivados → chip gris "📦 Archivado"
- Eliminados → chip rojo "🗑️ Eliminado"

---

## BLOQUE 6 — Cámara en vivo para fotos de evidencia

### Contexto del intento fallido

En la sesión anterior se intentó:
- `facingMode: { exact: "environment" }` en el scanner QR
- `capture="environment"` en todos los inputs de imagen

Problemas causados:
1. `facingMode: { exact }` bloqueó el scanner en PC y en móviles con
   permisos estrictos — no encuentra cámara trasera y no hace fallback
2. `capture="environment"` en inputs de insumos bloqueó la galería,
   obligando a usar cámara en contextos donde no corresponde

Se revirtió todo. El sistema está 100% funcional.

### Solución correcta — enfoque quirúrgico

NO TOCAR bajo ningún concepto:
- `ScannerPage.jsx` — el scanner QR no se modifica
- `RegistroInsumoModal.jsx` — no se modifica
- `EditInsumoModal.jsx` — no se modifica
- `NuevoMedioModal.jsx` — no se modifica

SOLO modificar estos dos archivos:
- `SubfraccionamientoAccordion.jsx` — sección de novedades de bolsa
- `AuditoriaAccordion.jsx` — sección de registro de auditoría

En cada uno, reemplazar el input de imagen único por DOS botones separados:

```
[ 📷 Tomar foto ]    [ 🖼️ Galería ]
```

Implementación con useRef:
```jsx
const camaraInputRef = useRef(null);
const galeriaInputRef = useRef(null);

{/* Input cámara — capture es sugerencia al navegador, no forzado */}
<input
  type="file"
  accept="image/*"
  capture="environment"
  style={{ display: 'none' }}
  ref={camaraInputRef}
  onChange={handleImagenSeleccionada}
/>

{/* Input galería — sin capture, siempre abre explorador */}
<input
  type="file"
  accept="image/*"
  style={{ display: 'none' }}
  ref={galeriaInputRef}
  onChange={handleImagenSeleccionada}
/>

<button onClick={() => camaraInputRef.current?.click()}>
  📷 Tomar foto
</button>
<button onClick={() => galeriaInputRef.current?.click()}>
  🖼️ Galería
</button>
```

Nota técnica importante: NO usar `facingMode: { exact: "environment" }` —
fue la causa del fallo anterior. `capture="environment"` es solo una
sugerencia al navegador. En desktop ambos botones abren el explorador
de archivos (comportamiento nativo correcto). En mobile, el botón
"Tomar foto" abre la cámara y "Galería" abre la galería.

El flujo de subida a Google Drive vía Apps Script proxy no cambia.
Solo cambia cómo el usuario selecciona la imagen.

---

## ISSUE — Nomenclatura de bolsas de subfraccionamiento

Problema: al generar el ID de una bolsa nueva, el sistema está usando
el ID interno de Firestore en lugar del alias del medio.

```
Resultado actual:   FRAC-Tg9oWYqDSj3MeZNYLmrV-20260526-A
Resultado esperado: FRAC-ECA-20260526-A
```

Solución — extraer el código del campo `alias` del documento del medio:

```javascript
const extraerCodigoMedio = (alias) => {
  if (!alias) return 'MED';
  const partes = alias.split(' ');
  const codigo = partes.find(p =>
    !['lote', 'batch', 'nro', 'n°'].includes(p.toLowerCase()) && isNaN(p)
  );
  return codigo?.toUpperCase() || 'MED';
};

const codigoMedio = extraerCodigoMedio(medio.alias);
const idBolsa = `FRAC-${codigoMedio}-${fecha}-${letra}`;
```

Corregir en `SubfraccionamientoAccordion.jsx` donde se genera `id_bolsa`.
Bolsas existentes: no migrar. Solo aplicar a nuevas bolsas.

---

## ORDEN DE IMPLEMENTACIÓN

```
BLOQUE 1 ADICIONAL → Filtro ubicación multinivel
  ├── Agregar query collectionGroup para subfracciones
  ├── Unión de resultados sin duplicados
  ├── Chip de ubicaciones múltiples en card
  └── Deploy + confirmar con Maxi

BLOQUE 3 → Archivar + historial
  ├── 3A: Verificar/corregir botón Archivar + caso borde stock
  ├── 3B: Toggle historial con estados reactivos
  └── Deploy + confirmar con Maxi

BLOQUE 6 → Cámara en vivo (quirúrgico)
  ├── Solo SubfraccionamientoAccordion.jsx y AuditoriaAccordion.jsx
  ├── Dos botones separados con useRef
  ├── NO tocar Scanner ni inputs de insumos
  └── Deploy + confirmar con Maxi

ISSUE → Nomenclatura de bolsas
  ├── Corregir extraerCodigoMedio con alias
  └── Deploy
```

---

## REPORTE FINAL REQUERIDO

Al terminar todos los bloques, generar reporte con:
- Archivos modificados
- Campos nuevos en Firestore (si los hay)
- Lógica implementada en cada bloque
- Pendientes que quedan fuera de este prompt
- Riesgos detectados
