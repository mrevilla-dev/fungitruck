# FungiTrack — Prompt para Antigravity
## Nuevo formato de IDs semánticos para Batches
> 22/06/2026

---

## REGLAS DE ORO

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.
3. Todos los cambios son aditivos. **No eliminar lógica existente.**
4. **No migrar IDs existentes.** Los batches ya creados conservan su ID actual tal cual está. Esto solo aplica a partir de ahora, para batches nuevos.
5. Defensive programming: `campo?.subcampo ?? fallback` siempre.
6. **Antes de escribir código de cada bloque, mostrame un plan de implementación y esperá mi confirmación.**
7. Confirmar antes de avanzar al siguiente bloque.

---

## CONTEXTO

Los IDs de `esporomas`, `ejemplares` y `eventos_aislamiento` ya usan año de 2 dígitos y están funcionando bien. Los IDs de `batches` quedaron desactualizados: no incluyen código de cepa, no distinguen hibridación, y no reflejan el número de transferencia (repique). Se corrige ahora, estandarizando todo.

---

## FORMATO NUEVO — Referencia completa

| Colección | Formato de ID | Año |
|-----------|---------------|-----|
| `esporomas` | `ESP-GENESP-CEPA-ORIGENNN-AAMMDD-NNN` | 2 dígitos (sin cambios) |
| `ejemplares` | `EJE-GENESP-CEPA-TIPO-AAMMDD-NNN` | 2 dígitos (sin cambios) |
| `eventos_aislamiento` | `EVT-GENESP-AAMMDD-NNN` | 2 dígitos (sin cambios) |
| `batches` (normal) | `GEN-ESP-CEPA-MED-YYMMDD-NNN-LETRA-T[N]` | 2 dígitos (**nuevo**) |
| `batches` (hibridación) | `GEN-ESP-H[NN]-MED-YYMMDD-NNN-LETRA-T[N]` | 2 dígitos (**nuevo**) |

### Reglas del formato de batch

1. `CODIGO_CEPA` se toma del `ejemplar` vinculado al batch. Si el ejemplar no tiene `codigo_cepa`, se omite el segmento completo (no poner "SIN-CEPA").
2. `H[NN]` reemplaza al segmento de cepa **solo en hibridaciones**. El contador `NN` es **por especie** — cada combinación de género+especie tiene su propio correlativo de hibridación (Pleurotus ostreatus H1, H2... es independiente de Hericium erinaceus H1, H2...).
3. `NNN` (secuencia del día) se calcula con contador atómico en `metadata/counters`, igual que las otras colecciones.
4. `LETRA` (A, B, C...) identifica cada unidad individual cuando el modo es "Lote".
5. `T[N]` es el número de transferencia (`numero_transferencia`, ya existe como campo). **Se omite el segmento completo si es T1** (placa/batch original, sin repique). Se muestra desde T2 en adelante.

### Ejemplos

```
COR-MIL-1-MEA-260618-001-A              (normal, T1 → sin sufijo)
COR-MIL-1-MEA-260618-001-A-T2           (normal, primer repique)
PLE-OES-MEA-260618-001-A                (normal, sin código de cepa)
PLE-OES-H1-CALDO-260610-001-A           (hibridación, T1)
PLE-OES-H1-CALDO-260610-001-A-T2        (hibridación, repique)
HER-ERI-H1-APD-260618-001-A             (hibridación de Hericium — H1 propio, independiente de Pleurotus)
```

---

## BLOQUE 1 — Función central de generación de ID de batch

**Archivos a modificar:** ubicar el helper/util compartido de generación de IDs (si no existe uno centralizado, identificar dónde está duplicada la lógica entre los 3 archivos del Bloque 2).

### Objetivo
Antes de tocar los 3 modales, conviene tener **una sola función** que genere el ID de batch según este formato, para no duplicar la lógica 3 veces con riesgo de inconsistencia.

### 1.1 — Función `generarIdBatch()`
Debe recibir: género, especie, código de cepa (opcional), si es hibridación (y su contador por especie), medio/código de medio, fecha, letra, número de transferencia.
Debe devolver el ID armado según las reglas de arriba, omitiendo segmentos opcionales correctamente.

### 1.2 — Contadores atómicos
- `NNN`: contador diario existente, sin cambios de mecanismo.
- `H[NN]`: nuevo contador atómico **por especie**, en `metadata/counters` (ej. `counters/hibridacion_{genero}_{especie}`).

**Build y confirmar antes de continuar.**

---

## BLOQUE 2 — Aplicar la función en los 3 puntos de creación de batch

**Archivos a modificar:** `NuevoCultivoModal.jsx`, `NuevoEventoAislamientoModal.jsx`, `RegistroMasivoAislamientosModal.jsx`

### 2.1 — Reemplazar la generación de ID actual
En cada uno de los 3 archivos, reemplazar la lógica de armado de ID de batch por una llamada a `generarIdBatch()` del Bloque 1.

### 2.2 — Verificar el campo `numero_transferencia`
Confirmar que cada uno de los 3 flujos efectivamente calcula y pasa el `numero_transferencia` correcto a la función (T1 para batch nuevo/madre, T2+ para repiques — esto ya existe como lógica del Bloque 3 anterior, solo hay que asegurarse de que se use en el ID).

### 2.3 — No tocar
- Generación de IDs de `ejemplares`, `esporomas`, `eventos_aislamiento` — quedan exactamente como están.
- Batches existentes — no se migran, no se tocan sus documentos.

**Build y confirmar antes de continuar.**

---

## VERIFICACIÓN FINAL

1. Build sin errores.
2. Crear un batch normal con código de cepa → verificar formato completo con T1 omitido.
3. Crear un repique (T2) del mismo Ejemplar → verificar que el ID incluye `-T2`.
4. Crear un batch sin código de cepa → verificar que el segmento se omite limpio (sin "SIN-CEPA" ni guiones dobles).
5. Crear una hibridación de una especie → verificar `H1`.
6. Crear una hibridación de una especie distinta → verificar que también arranca en `H1` (contador independiente por especie).
7. Crear una segunda hibridación de la primera especie → verificar que da `H2`.
8. Confirmar que batches ya existentes en Firestore conservan su ID viejo sin cambios.
9. Confirmar que `esporomas`, `ejemplares`, `eventos_aislamiento` siguen generando IDs exactamente igual que antes.

---

**Recordatorio: mostrame el plan de cada bloque antes de tocar código. Un bloque a la vez.**
