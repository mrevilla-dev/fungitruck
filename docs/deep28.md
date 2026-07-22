
---
---

### 📋 PARTE 2: Copiar y pegar en Antigravity (Bloques 4, 5, 6 y 7)
*(Pegar esto SOLO después de que Antigravity haya terminado y hecho build exitoso de la Parte 1)*

```markdown
# FungiTrack — Prompt para Antigravity (PARTE 2)
## Módulo: Cosechas (No conformidades, Cierre, Historial y Página General)
> Basado en auditoría de Claude — 23/06/2026

---

## REGLAS DE ORO

1. **Un bloque a la vez.** ANTES de escribir código de cada bloque, leer el archivo completo que va a modificar.
2. Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.
3. Todos los cambios son aditivos. No eliminar lógica existente.
4. Defensive programming: `campo?.subcampo ?? fallback` siempre.
5. **Imágenes: siempre Google Drive vía `uploadFileToDrive`.**
6. **Antes de escribir código, mostrame el plan y esperá mi confirmación.**
7. No tocar: módulo de criobanco, árbol genealógico, impresión ZPL, diseño experimental, módulo de mantenimiento, ni la lógica de formularios de la Parte 1.

---

## BLOQUE 4 — Registro de no conformidades

**Archivos a crear:** `NoConformidadBatchModal.jsx`
**Archivos a modificar:** ficha de detalle de batch (`BatchDetailPage.jsx` o equivalente)

### 4.1 — Botón en ficha del batch
Agregar "Registrar No Conformidad" en la ficha de cada batch activo. Abre el modal.

### 4.2 — Campos del modal
- Tipo: select → Contaminación / Deformación / Aborto de primordios / Otro
- Descripción (texto libre)
- Acción tomada: select → Descarte / Descontaminación local / Cuarentena (cambio de sector) / Monitoreo / Otro
- Si acción = Cuarentena: selector de sala destino.
- Foto (Google Drive), Operario, Fecha de detección (default: hoy).

### 4.3 — writeBatch al confirmar
1. Crear documento en `no_conformidades_batch` (ID formato: `NC-GENESP-YYMMDD-NNN`).
2. Si acción = Descarte: actualizar `batches.status` a "Descartado".
3. Si acción = Cuarentena: actualizar `batches.destinoId` al sector seleccionado.

### 4.4 — Historial en ficha del batch
Mostrar lista de no conformidades del batch (fecha, tipo, acción).

**Build y confirmar antes de continuar.**

---

## BLOQUE 5 — Cierre de batch: destino del sustrato

**Archivos a modificar:** ficha de detalle de batch

### 5.1 — Sección "Cierre de batch"
Aparece cuando `batches.status === "Cosechado"`.

### 5.2 — Campos de cierre
- Destino del sustrato: select → Descarte (bolsa roja) / Descontaminación antes de descarte / Secado para análisis / Reutilización / Reservado para investigación.
- Fecha de cierre, Observaciones de cierre.
- Checkbox "Devolver contenedor al ciclo de lavado".

### 5.3 — Actualización en Firestore
Guardar directamente en el documento `batches` existente:
`destino_sustrato`, `fecha_cierre`, `observaciones_cierre`, `contenedor_devuelto`.

**Build y confirmar antes de continuar.**

---

## BLOQUE 6 — Historial y métricas en ficha del batch

**Archivos a modificar:** `BatchDetailPage.jsx` o equivalente

### 6.1 — Sección "Cosechas" en la ficha
- Tabla con todas las cosechas del batch: fecha, oleada, peso fresco, EB oleada, destino.
- Cards de métricas: EB acumulada total, TPB actual, Días desde inoculación.
- Botón "Nueva Cosecha" -> abre `NuevaCosechaModal` pre-cargado con ese batch.

### 6.2 — Gráfico de oleadas
Barras simples (peso fresco por oleada). SOLO implementar si se puede hacer con librerías YA instaladas (ej. recharts). Si requiere instalar dependencias nuevas, omitir el gráfico y dejar un placeholder.

**Build y confirmar antes de continuar.**

---

## BLOQUE 7 — Página general de cosechas

**Archivos a crear:** `CosechasPage.jsx` (y agregar ruta en el router)

### 7.1 — Listado de cosechas recientes
Tabla filtrable por: Especie, Rango de fechas, Modo de cosecha, Operario.

### 7.2 — Métricas comparativas (si hay datos)
Cards superiores: EB promedio por especie, TPB promedio por especie.

### 7.3 — Acceso rápido
Botón "Nueva Cosecha" flotante o en header -> abre selector de modo.

**Build y confirmar antes de continuar.**

---

## VERIFICACIÓN FINAL

1. Build sin errores.
2. No conformidad: verificar que "Descarte" cambia status del batch y "Cuarentena" cambia el sector.
3. Cierre de batch: verificar que el destino del sustrato se guarda en el documento `batches`.
4. Ficha del batch: historial de cosechas completo con métricas calculadas correctamente.
5. Página general: filtros funcionando.
6. Ningún archivo va a Firebase Storage.