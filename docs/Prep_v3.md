# FungiTrack — Prompt Antigravity
## Módulo Medios Preparados — Mejoras y correcciones
> Mayo 2026

---

## CONTEXTO

El módulo de Medios Preparados fue implementado y verificado.
Ya existen y funcionan correctamente:

- `InventoryPage.jsx` — maestro con listado de medios
- `SubfraccionamientoAccordion.jsx` — bolsas y novedades
- `SanitizacionAccordion.jsx` — registro de sanitización
- `AuditoriaAccordion.jsx` — historial de auditorías con peso seco, pH y densidad
- `AgotarMedioModal.jsx` — marcar medio como agotado
- `AuditMedioModal.jsx` / `AuditInsumoModal.jsx` — ajustes de stock
- `NuevoCultivoModal.jsx` — inoculación con selección de bolsa
- Stock usa `stock_bulk?.cantidad_actual ?? cantidad_actual ?? 0` en los 5 archivos
- Eliminación lógica con `eliminado: true` y `fecha_eliminacion` implementada
- Auditoría QC con peso seco, pH y densidad propagando valores al documento del medio

**REGLA ESTRICTA:** Un bloque a la vez. Compilar y pedir confirmación de Maxi
antes de pasar al siguiente. No implementar todo junto.

**REGLA DE CÓDIGO:** Antes de modificar cualquier archivo, leerlo completo.
Todos los cambios son aditivos. No eliminar campos ni lógica existente.
Defensive programming obligatorio: `campo?.subcampo ?? fallback` siempre.
Decimales: aceptar punto y coma, normalizar a punto antes de guardar en Firestore.

---

## BLOQUE 1 — UI/UX Mobile y filtros del maestro

### 1A — Bug visual en mobile

Los botones de acción de cada card (Editar, Reimprimir, Archivar, Eliminar)
y la flecha del acordeón se estiran horizontalmente rompiendo el diseño
en pantallas chicas.

Corregir con Flexbox usando `flexWrap: 'wrap'` o Grid responsivo.
Resultado esperado: botones grandes, bien separados, sin superposición
en pantallas de 360px a 430px de ancho (glove-friendly, mínimo 48px de alto táctil).

### 1B — Filtros en la vista principal

Agregar tres selectores de filtrado rápido encima del listado, en una fila compacta.
Los filtros se aplican en tiempo real y se pueden combinar entre sí.
El filtro base siempre activo (no modificar): `eliminado !== true` AND `estado !== "Archivado"`.

```
Filtro 1 — Ubicación
  Todas | Heladera Lab | Heladera Facultad | Freezer -20°C |
  Freezer -80°C | Temperatura ambiente | Otra

Filtro 2 — Categoría de medio
  Todas | Líquido | Agar | Semilla

Filtro 3 — Operario
  Todos | lista dinámica generada desde los registros existentes en la colección
```

### 1C — Datos críticos visibles en cada card

Cada card del maestro debe mostrar de forma visible, sin necesidad de abrir acordeones:

```
- Fecha de preparación
- Ubicación actual → chip 📍
- Categoría del medio → chip (Agar / Líquido / Semilla)
- Estado de vencimiento:
    si fecha_actual > fecha_vencimiento → chip rojo "⚠️ VENCIDO"
    calcular como: fecha_preparacion + vida_util_dias
    si no tiene vida_util_dias definido, no mostrar nada
```

---

## BLOQUE 2 — Formulario de preparación

### 2A — Campos nuevos en el formulario de ingreso

Agregar al formulario de nuevo medio existente, sin eliminar campos actuales:

```
categoria *         select → Líquido | Agar | Semilla

ubicacion *         select → Heladera Lab | Heladera Facultad | Freezer -20°C |
                             Freezer -80°C | Temperatura ambiente | Otra

ubicacion_detalle   string — opcional — ej: "Estante 2, cajón inferior"

operario *          string — usuario logueado por defecto, editable

vida_util_dias      number — opcional
                    si se completa, calcular y guardar:
                    fecha_vencimiento = fecha_preparacion + vida_util_dias
```

### 2B — Búsqueda de receta filtrada por categoría

Cuando el usuario selecciona una categoría en el formulario, el buscador
de recetas debe mostrar automáticamente solo las recetas de esa categoría.

Si no hay categoría seleccionada → mostrar todas las recetas (comportamiento actual).
Usar el campo `categoria` que ya existe en la colección `recetas_medios`.

---

## BLOQUE 3 — Ciclo de vida: archivar y vista de historial

### 3A — Botón archivar corregido

El botón Archivar está roto. Al archivar, el medio debe desaparecer
inmediatamente del listado principal sin necesidad de recargar la página.

El filtro ya excluye `estado === "Archivado"` — verificar que el componente
actualiza el estado local tras el `updateDoc` de forma reactiva.

### 3B — Vista de historial

Agregar en la cabecera de la pantalla un ícono de archivo 🗃️.
Al hacer click conmuta entre dos vistas:

**Vista activa** (default):
medios con `eliminado !== true` AND `estado !== "Archivado"`

**Vista historial:**
medios con `estado === "Archivado"` OR `eliminado === true`

En la vista historial las cards son solo lectura.
No mostrar botones de acción excepto "Restaurar" (solo para Archivados,
no para eliminados) que vuelve el estado a "Activo".

---

## BLOQUE 4 — Correcciones en Sanitización

Modificar `SanitizacionAccordion.jsx`:

### 4A — Terminología correcta de laboratorio

```
Cambios en el selector de método:
- "Autoclave" → reemplazar por "Esterilización"
- Eliminar "Baño de agua" — no es método válido en este flujo
- Mantener "Pasteurización"
- Verificar ortografía "Tindalización" — corregir si está mal escrita
- Mantener "Sin esterilización"
```

### 4B — Campos faltantes

Agregar a los campos existentes:

```
equipo_empleado     string — opcional
                    texto libre por ahora — ej: "Autoclave 1", "Estufa 2"
                    en el futuro vendrá de la lista de equipos registrados

fecha_sanitizacion  date * — fecha en que se realizó el proceso
                    puede ser distinta a la fecha de preparación del medio
```

---

## BLOQUE 5 — Mermas en subfraccionamiento

Verificar que en el acordeón de Subfraccionamiento, el botón `[+ Novedad]`
de cada bolsa tenga exactamente estos tipos con la lógica de descuento correcta.
Si está incompleto o los tipos son distintos, corregir:

```
Contaminación         → restar cantidad_afectada de disponible de esa bolsa
Rotura                → restar cantidad_afectada de disponible de esa bolsa
Desecación            → restar cantidad_afectada de disponible de esa bolsa
Desarrollo espontáneo → registrar SIN descontar (las unidades siguen disponibles)
Otro                  → registrar SIN descontar
```

El descuento se aplica sobre `disponible` de la bolsa específica,
no sobre el bulk general del medio.
Si `disponible` de la bolsa llega a 0 → marcar esa bolsa como 🔴 Agotada.

---

## BLOQUE 6 — Cámara en vivo para fotos

En todos los puntos donde se puede subir una foto de evidencia
(auditoría y novedades de bolsa en subfraccionamiento), configurar el input así:

```html
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

Esto activa la cámara trasera directamente en mobile.
En desktop mantiene el comportamiento de explorador de archivos.
El flujo de subida a Google Drive vía Apps Script proxy no cambia.
Solo se modifica el atributo del input.

---

## NOTAS TÉCNICAS

- **Decimales:** aceptar punto y coma, normalizar a punto antes de guardar en Firestore
- **Defensive programming:** `campo?.subcampo ?? fallback` en todo campo nuevo
- **writeBatch:** toda operación que toca más de un documento usa transacción atómica
- **Subcolecciones:** cargar lazy, solo cuando el usuario abre el acordeón
- **Imágenes:** Google Drive vía Apps Script proxy — NO Firebase Storage
- **ZPL Zebra:** usar perfiles existentes, no crear nuevos sin consultar
- **Mobile-first:** mínimo 48px de alto táctil en todos los controles nuevos

---

## ORDEN DE IMPLEMENTACIÓN

```
BLOQUE 1 → Bug mobile + filtros + datos en card
BLOQUE 2 → Campos formulario + búsqueda por categoría
BLOQUE 3 → Archivar corregido + vista historial
BLOQUE 4 → Sanitización — terminología + campos
BLOQUE 5 → Mermas en bolsas — verificar o corregir
BLOQUE 6 → Cámara en vivo
```

Confirmar cada bloque con Maxi antes de continuar.
Al terminar la sesión generar reporte con: archivos modificados,
campos nuevos en Firestore, lógica implementada, pendientes y riesgos.
