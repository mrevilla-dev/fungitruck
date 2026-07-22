# FungiTrack — Correcciones V4 (Modo Seguro)
## Módulo: Medios Preparados
> Junio 2026

---

## REGLAS DE ORO (NO NEGOCIABLES)

1. **No romper nada.** Si una corrección compromete una funcionalidad existente, abortar y reportar.
2. **Un bloque por vez.** Deployar a Firebase Hosting y esperar confirmación de Maxi.
3. **Cambios aditivos.** No eliminar campos, ni lógica, ni endpoints.
4. **Defensive programming:** `campo?.subcampo ?? fallback` siempre.
5. **Imágenes:** Google Drive vía Apps Script. **Nunca Firebase Storage.**
6. **Transacciones:** `writeBatch` para operaciones multi-documento.
7. **Mobile-first:** targets táctiles ≥48px.

---

## BLOQUE 1 — Filtro de ubicación cruzado + unidades dinámicas

### 1A — Filtro de ubicación que también busque en subfracciones

**Problema:** al filtrar por "Heladera Lab" solo aparecen medios cuyo bulk está ahí.  
**Solución:** combinar dos fuentes:

1. Medios donde `ubicacion == filtro`.
2. Medios que tengan al menos una bolsa en `subfracciones/` con `ubicacion == filtro` (usar `collectionGroup` con índice compuesto si hace falta).
3. Unir los IDs de medio sin duplicados.
4. Mostrar las cards correspondientes.

**Chip de ubicación:** si un medio tiene bulk en un lugar y bolsas en otro, mostrar ambas: `📍 Heladera Lab · Freezer -20°C`.

### 1B — Unidades dinámicas en formulario de subfraccionamiento

**Problema:** dice "484 uds" sin contexto.  
**Solución:** leer `stock_bulk.unidad` (o `unidad` del medio) y mostrarlo. Ej: `484 ml disponibles`. Si no hay dato, usar "unidades".

---

## BLOQUE 2 — Corrección de IDs y eliminación de texto libre

### 2A — ID de bolsa legible

**Problema:** se genera `FRAC-idFirestore-...` en lugar del alias.  
**Solución:** implementar la función `extraerCodigoMedio` que extraiga el código del alias (ej: de "ML-ECA Lote 1" → "ECA").  
Usar `codigoMedio` para construir `id_bolsa = FRAC-CODIGO-FECHA-LETRA`.  
Solo para bolsas nuevas. Las viejas quedan como están.

### 2B — Tipo de envase desde inventario

**Problema:** era un input de texto libre.  
**Solución:**  
- Crear un `<select>` que consulte `insumos_base` filtrando por un campo booleano que identifique envases/contenedores (por ejemplo `es_envase: true`).  
- Incluir una opción "Otro" que, al seleccionarse, muestre un campo de texto adicional y, si se confirma la bolsa, cree automáticamente un registro mínimo en `insumos_base` con ese nombre y `es_envase: true` (para completar después).  
- Mantener la opción de "Placa Petri", "Frasco 100ml", etc., si ya existen en el inventario.

### 2C — Ubicación con salas registradas

**Problema:** había un select fijo, pero no incluía las salas del módulo de Salas.  
**Solución:** unificar las ubicaciones predefinidas (Heladera Lab, Freezer -80°C, etc.) con los documentos de la colección `salas`. Mostrar la lista combinada.  
Si se selecciona una sala, guardar el `id` y el `nombre`.

### 2D — Operario precargado pero editable

**Problema:** querías evitar tipeo libre, pero necesitás flexibilidad.  
**Solución:**  
- Precargar con el email o displayName del usuario autenticado.  
- El campo es editable. Si se modifica, mostrar una advertencia estilo toast: "Estás registrando como [nombre distinto]. ¿Continuar?".  
- No bloquear la acción.

---

## BLOQUE 3 — UI/UX, vista previa de receta y cámara

### 3A — Solapamiento en campo pH

**Problema:** al seleccionar "pH medido", el input se monta sobre el selector.  
**Solución:** agregar `marginTop: 16px` y usar un contenedor flex con gap. Revisar `z-index`.

### 3B — Colisión de dropdowns en búsqueda de recetas

**Solución:** ajustar `z-index` del menú desplegable de recetas (ej: `MenuProps={{ style: { zIndex: 2000 } }}`). Verificar que el padre no tenga `overflow: hidden`.

### 3C — Vista previa de receta seleccionada

Al seleccionar una receta en el formulario de preparación, mostrar debajo:

- **Descripción corta** (campo `descripcion_corta` del documento).
- **pH esperado** (`ph_esperado`).
- **Peso seco por unidad** (`peso_seco_por_unidad_g`).
- **Ingredientes** (nombre + cantidad).
- **Protocolo** como link si existe (`protocolo_url`).

Se oculta si no hay receta seleccionada.

### 3D — Opción dual para fotos (Tomar foto / Galería)

**Archivos:** `SubfraccionamientoAccordion.jsx` y `AuditoriaAccordion.jsx`.  
Implementar dos botones:

- 📷 **Tomar foto**: `<input type="file" accept="image/*" capture="environment" />`
- 🖼️ **Galería**: `<input type="file" accept="image/*" />`

Ambos invisibles, disparados con `useRef`. No modificar el flujo de subida a Drive.

---

## BLOQUE 4 — Impresión ZPL con ubicación

**Solo esto, sin tocar subfracciones ni cantidades:**  
Modificar los perfiles ZPL existentes (ej: `STANDARD`, `SLIM_PETRI`) para incluir la ubicación física del medio.

Agregar una línea con la variable `{ubicacion}` en una coordenada adecuada, por ejemplo: