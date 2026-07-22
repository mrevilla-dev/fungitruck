# FungiTrack — Prompt para Antigravity
## Rutas faltantes en Módulo 4 (Inoculaciones)
> 22/06/2026

---

## REGLAS DE ORO

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.
3. Todos los cambios son aditivos. No eliminar lógica existente ni documentos de Firestore.
4. Defensive programming: `campo?.subcampo ?? fallback` siempre.
5. No tocar la colección `esporomas`, módulo de cosechas, criobanco, ni impresión ZPL.
6. **Antes de escribir código de cada bloque, mostrame un plan de implementación y esperá mi confirmación.**
7. Confirmar antes de avanzar al siguiente bloque.

---

## CONTEXTO

Hoy `NuevoCultivoModal.jsx` tiene estas rutas funcionando:
- Aislamiento Primario (ya corregido — abre `NuevoEventoAislamientoModal`)
- Placa → Líquido
- Líquido → Líquido
- Placa → Placa (Repique)
- Hibridación

**Faltan dos rutas:** Placa/Líquido/Grano → Grano (Spawn), y Grano/Líquido → Sustrato definitivo. Se agregan en 3 bloques.

---

## BLOQUE 1 — Componente compartido: Alta rápida de Ejemplar comercial

**Archivos a crear/modificar:** nuevo componente (ej. `AltaRapidaEjemplarExterno.jsx`) o función reusable.

### Objetivo
Ambas rutas nuevas (Bloques 2 y 3) necesitan la opción de origen "Material nuevo (externo)" — spawn comprado, jeringa comprada, etc. Conviene resolver esto una sola vez y reusarlo.

### 1.1 — Componente/función
Al dispararse desde el selector de origen:
- Campos: Género, Especie (manual), `tipo_material` (select: "Micelio en grano" / "Jeringa (LC)"), `procedencia` (pre-cargado "Comercial", editable), resto de campos mínimos del modelo `ejemplares` ya existente (ID semántico generado vía el mismo mecanismo transaccional actual).
- Al confirmar, crea el documento en `ejemplares` y devuelve el `ejemplarId` para que el wizard que lo llamó lo use como origen del batch.
- No acoplarlo únicamente a las rutas de Grano/Sustrato — pensarlo reusable a futuro.

**Build y confirmar antes de continuar.**

---

## BLOQUE 2 — Ruta Grano (Spawn)

**Archivos a modificar:** `NuevoCultivoModal.jsx`

### 2.1 — Orígenes posibles (selector de origen)
1. Placa existente (batch tipo placa, Ejemplar interno)
2. Líquido existente (batch tipo LC, Ejemplar interno)
3. Grano existente (amplificación/repique de spawn a spawn, mismo Ejemplar)
4. "Material nuevo (externo)" → dispara el componente del Bloque 1

### 2.2 — Destino
- Contenedor: `SearchableSelect` de `config/tipos_envase` (igual que Paso 4 del modal), no fijo.
- Medio a usar: spawn/semilla ya preparado, vía el mismo `SearchableSelect` de medios + subfracciones ya existente en el modal.
- Sala destino.

### 2.3 — Checkbox "Marcar origen como agotado"
Si se marca, el batch/Ejemplar origen pasa a estado de agotado correspondiente. No se elimina, queda como dato histórico.

### 2.4 — Descuento de stock
Misma lógica que rutas existentes: resta de la subfracción de medio seleccionada.

**Build y confirmar antes de continuar.**

---

## BLOQUE 3 — Ruta Sustrato definitivo

**Archivos a modificar:** `NuevoCultivoModal.jsx`

### 3.1 — Orígenes posibles (selector de origen)
1. Grano existente (batch tipo spawn, Ejemplar interno)
2. Líquido existente (batch tipo LC, Ejemplar interno — caso Cordyceps en medio líquido)
3. "Material nuevo (externo)" → reusar el componente del Bloque 1

### 3.2 — Destino
- Contenedor: `SearchableSelect` de `config/tipos_envase`, no fijo (pote, bandeja, bolsa, etc.).
- Sustrato a usar: vía el mismo `SearchableSelect` de medios + subfracciones (el sustrato definitivo ya preparado se carga como medio/receta, igual que el resto).
- Sala destino.

### 3.3 — Campo cantidad
- Registrar como **peso húmedo al momento de carga** (no peso seco — el peso seco es dato posterior, de la etapa de Cosecha, para Eficiencia Biológica. No tocar el modelo de Cosechas).
- Si el sustrato final es líquido (ej. Cordyceps en medio líquido para cordicepina), permitir que el campo acepte la unidad correspondiente (peso o volumen) — sin rama de lógica especial, solo flexibilidad en la unidad mostrada.

### 3.4 — Checkbox "Marcar origen como agotado"
Misma lógica que Bloque 2.

### 3.5 — Descuento de stock
Misma lógica que rutas existentes.

**Build y confirmar antes de continuar.**

---

## VERIFICACIÓN FINAL (después de los 3 bloques)

1. Build sin errores.
2. Probar Ruta Grano desde cada uno de los 4 orígenes (incluyendo alta rápida externa).
3. Probar Ruta Sustrato definitivo desde cada uno de los 3 orígenes.
4. Verificar checkbox "agotado" en ambas rutas.
5. Verificar descuento de stock correcto en ambas rutas.
6. Verificar que las rutas existentes (Aislamiento Primario, Placa→Líquido, Líquido→Líquido, Repique, Hibridación) siguen funcionando sin cambios.

---

**Recordatorio: mostrame el plan de cada bloque antes de tocar código. Un bloque a la vez.**
