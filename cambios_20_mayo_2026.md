# 🍄 FungiTrack — Cambios del 20 de Mayo 2026 (Sesión Casa)

> **Branch:** `main` · **Último commit:** `3997b8a` · **Estado:** Todo pusheado a GitHub ✅

---

## 📋 Instrucciones para mañana en la Facu

```bash
cd fungitruck     # o donde tengas el repo
git pull origin main
npm run dev
```

> [!WARNING]
> Si la facu tiene cambios locales sin commitear (como la calculadora), Git va a pedir resolver conflictos. No pasa nada, se resuelven en el momento y quedan las dos cosas juntas.

---

## ✅ Lista de Cambios (6 commits)

### 1. Selección de lote opcional + advertencia sin bloqueo
**Commit:** `ab5a3e2`  
**Archivo:** `NuevoMedioModal.jsx`

- Se puede guardar un medio **sin haber seleccionado un lote** para un ingrediente (opción "Sin lote específico / No abierto").
- Si falta lote o el stock queda negativo, el sistema muestra una **advertencia (pop-up)** pero te deja continuar si aceptás.
- Ya no se ocultan secciones por el estado `allChecked`.

---

### 2. Checklist dividido: Materiales vs Equipos + "Marcar todo"
**Commit:** `991ee84`  
**Archivo:** `NuevoMedioModal.jsx`

- El Paso 0 (Alistamiento) ahora tiene **dos columnas separadas**: Materiales/Vidriería y Equipamiento.
- Cada columna tiene un botón **"✅ Marcar todo" / "❌ Desmarcar todo"** para agilizar.
- Se agregó la opción **"Otro / Genérico (No descuenta stock)"** para envases principales y de sub-fraccionamiento.

---

### 3. Buscador inteligente en todos los selectores
**Commit:** `c8e5535`  
**Archivos:** `NuevoMedioModal.jsx`, `SearchableSelect.jsx`

- Todos los `<select>` nativos del modal fueron reemplazados por el componente **`SearchableSelect`**.
- Afecta a: **Recetas**, **Lotes de Ingredientes**, **Envase Principal**, **Envase Secundario (Fraccionado)**.
- Ahora podés **escribir para filtrar** en tiempo real, y la lista aparece **ordenada alfabéticamente (A-Z)**.
- Los lotes sin seleccionar muestran un **borde naranja** de advertencia visual.

---

### 4. Checklist interactivo de pesaje + alerta de stock bajo
**Commit:** `13e5f47`  
**Archivo:** `NuevoMedioModal.jsx`

- En la sección "⚖️ Cantidades Calculadas", cada ingrediente ahora es una **tarjeta clickeable** con checkbox.
- Al tildar, la tarjeta se pone **verde** → indica que ya fue pesado.
- Si el stock disponible en lotes no alcanza para la cantidad calculada, la tarjeta aparece con **borde y fondo rojo** + texto `"⚠️ Faltan X g en lotes"`.
- **No bloquea el guardado**, es solo visual.

---

### 5. Campos de Control de Calidad + Operario
**Commit:** `4f10e4a`  
**Archivo:** `NuevoMedioModal.jsx`

La sección "Observaciones del Lote" ahora se llama **"📝 Control de Calidad y Observaciones"** e incluye:

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| pH Observado | Numérico (step 0.1) | 5.5 |
| Densidad Observada | Numérico (step 0.01) | 1.02 |
| Osmolaridad (mOsm/L) | Numérico (step 1) | 300 |
| Peso Muestra Húmeda (g) | Numérico (step 0.01) | 12.5 |
| Operario / Responsable | Texto con sugerencias | "Maxi Revilla" |

- El campo **Operario** usa un `<datalist>`: sugiere nombres guardados pero permite **escribir cualquier otro** libremente.
- Todo se guarda en Firebase bajo `control_calidad` y `trazabilidad.operador`.

---

### 6. Botón "Reponer" inteligente desde el Dashboard
**Commit:** `3997b8a`  
**Archivos:** `Dashboard.jsx`, `InventoryPage.jsx`, `RegistroInsumoModal.jsx`

- Cuando en el Panel Inteligente tocás **"Reponer"** en una alerta de insumo bajo:
  1. Te redirige a `/inventory`
  2. Se abre **automáticamente** el modal de Registro de Compra
  3. El formulario viene **pre-cargado** con el nombre, categoría, unidades y último proveedor del insumo
  4. Aparece un **banner naranja** diciendo: *"Reponiendo: [Nombre del Insumo]"* con stock actual y mínimo
  5. La sección de "Catálogo Maestro" se oculta (ya configurada), solo hay que llenar los datos de la compra nueva

---

## 🔧 Archivos modificados en esta sesión

| Archivo | Cambios |
|---------|---------|
| `src/components/NuevoMedioModal.jsx` | SearchableSelect, checklist pesaje, QC fields, operario, advertencias |
| `src/components/SearchableSelect.jsx` | Prop `hasWarning` para borde naranja |
| `src/components/RegistroInsumoModal.jsx` | Banner "Reponiendo" con datos del insumo |
| `src/pages/Dashboard.jsx` | Link "Reponer" pasa `state` con `insumoId` |
| `src/pages/InventoryPage.jsx` | Detecta `location.state`, abre modal pre-filled |

---

## ⚠️ Pendiente de compaginar mañana

Los cambios de la **facu** (calculadora y otras features de ~16 hs) **no llegaron a GitHub**. Están solo en la PC de la facu. Mañana al hacer `git pull` se van a fusionar con estos cambios. Si hay conflictos en `NuevoMedioModal.jsx` (muy probable porque ambos tocaron ese archivo), hay que resolverlos manualmente.
