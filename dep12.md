# FungiTrack — Prompt para Antigravity
## Módulos: Genética Avanzada + Flujo de Aislamiento Masivo
> Junio 2026 — Post-refactorización Módulo 5

---

## REGLAS DE ORO

1. **Un bloque a la vez.** Leer cada archivo completo antes de tocarlo.
2. **Al finalizar cada bloque, ejecutar `npm run build` y confirmar que no haya errores.**
3. **Todos los cambios son aditivos.** No eliminar lógica existente ni documentos de Firestore.
4. **Defensive programming:** `campo?.subcampo ?? fallback` siempre.
5. **No modificar** la colección `esporomas` ni componentes fuera de los listados en cada bloque.
6. **Confirmar antes de avanzar al siguiente bloque.**

---

## CONTEXTO CONCEPTUAL (leer antes de empezar)

El sistema tiene dos módulos que operan sobre el mismo evento biológico desde ángulos distintos:

- **Módulo 4 (NuevoCultivoModal):** responsabilidad física/operativa — medio, contenedor, sala, etiqueta, ZPL.
- **Módulo 5 (Ejemplares + Eventos):** responsabilidad de identidad genética — quién es, de dónde viene, qué MAT tiene.

**No se reemplaza ninguno.** Se construyen los vínculos que hoy faltan entre ellos.

---

## BLOQUE 1 — Estado "En evaluación" para Ejemplares de hibridación

**Archivos a modificar:** `EjemplaresPage.jsx` y cualquier constante de estados.

### 1.1 — Nuevo estado en Ejemplares

Agregar el estado `"En evaluación"` a la lista de estados válidos de un Ejemplar, junto a los existentes: `Activo / Criopreservado / Agotado / Contaminado`.

- **Semántica:** indica que el Ejemplar fue creado como resultado de un cruce pero su viabilidad aún no está confirmada.
- **Color de badge sugerido:** amarillo/ámbar (distinto de Activo=verde, Contaminado=rojo).

### 1.2 — Nuevo estado "Inviable"

Agregar el estado `"Inviable"` a la lista de estados válidos.

- **Semántica:** el cruce no prosperó. Es un resultado experimental, no un accidente. Distinto de Contaminado.
- **Color de badge sugerido:** gris oscuro.
- **Este estado NO elimina el Ejemplar.** Queda en el cepario como dato histórico de compatibilidad.

### 1.3 — Campo `motivo_inviabilidad` (opcional, texto libre)

Aparece solo cuando el estado es `"Inviable"`. Permite registrar: incompatibilidad MAT, sin crecimiento conjunto, morfología anómala, etc.

**Build y confirmar antes de continuar.**

---

## BLOQUE 2 — Flujo de hibridación: vínculo duro con Ejemplar nuevo

**Archivos a modificar:** `NuevoCultivoModal.jsx`

**Objetivo:** cuando se registra una hibridación, el sistema debe crear un Ejemplar nuevo en estado `"En evaluación"` vinculado al batch del cruce. Este Ejemplar existe desde el momento del cruce — su inviabilidad eventual es dato experimental, no razón para no crearlo.

### 2.1 — Al confirmar un cruce en NuevoCultivoModal

Después de guardar el batch de hibridación, mostrar un modal secundario (no salteable en el flujo de hibridación):

**Título:** "Registrar nueva identidad genética"
**Texto:** "Este cruce genera un nuevo Ejemplar. Completá los datos conocidos ahora. Podés editar cuando confirmes viabilidad."

**Campos del modal:**
- Género y Especie (pre-cargados desde los padres, editables)
- Código de cepa (opcional, texto)
- Ploidía: pre-cargado como "Diploide"
- Tipo de micelio: pre-cargado como "Dicarión"
- MAT: "No determinado" por defecto
- Ejemplar Padre (pre-cargado: MAT 1-1 del cruce)
- Ejemplar Madre (pre-cargado: MAT 1-2 del cruce)
- Estado: forzado a "En evaluación" (no editable en este paso)
- Observaciones (texto libre)

### 2.2 — Vínculo en Firestore

El Ejemplar nuevo debe guardar:
```javascript
{
  batch_origen_id: "ID del batch de hibridación",
  ejemplar_padre_id: "ID del Ejemplar MAT 1-1",
  ejemplar_madre_id: "ID del Ejemplar MAT 1-2",
  estado: "En evaluación",
  fecha_ingreso: fecha del cruce
}
```

El batch de hibridación debe guardar:
```javascript
{
  ejemplar_resultado_id: "ID del nuevo Ejemplar creado"
}
```

### 2.3 — Tarea pendiente en Dashboard

Agregar al Dashboard una sección "Pendientes de confirmación" que liste todos los Ejemplares con estado `"En evaluación"`, con botón directo a su ficha para marcar como Activo o Inviable.

**Build y confirmar antes de continuar.**

---

## BLOQUE 3 — Repique con opción de generar Ejemplar nuevo

**Archivos a modificar:** `NuevoCultivoModal.jsx` (ruta Placa → Placa)

### 3.1 — Checkbox en flujo de repique

En la ruta "Placa → Placa", agregar un checkbox:

**Label:** "Este repique implica selección de colonia (genera nuevo Ejemplar)"

- **Si NO está tildado:** comportamiento actual. Nuevo batch del mismo Ejemplar. El número de transferencia se incrementa en el batch.
- **Si está tildado:** al guardar, disparar el mismo modal secundario del Bloque 2 (simplificado — sin campos padre/madre, solo padre).

### 3.2 — Campo `numero_transferencia` en batches de repique

Agregar campo entero `numero_transferencia` (T1, T2, T3...) que se auto-incrementa en cada repique del mismo Ejemplar. Calcularlo contando los batches previos de tipo "Placa → Placa" del mismo `ejemplarId`.

Mostrar en la card del batch como: 🔁 T2

**Build y confirmar antes de continuar.**

---

## BLOQUE 4 — Registro masivo de aislamientos desde placa

**Archivos a modificar:** `BatchDetailPage.jsx` o equivalente (ficha de detalle de un batch).

**Objetivo:** desde una placa de aislamiento con colonias visibles, registrar N Ejemplares haploides en una sola operación.

### 4.1 — Cambio de estado en batch de aislamiento

Agregar el estado `"Colonias visibles"` al flujo de estados de un batch de tipo aislamiento (entre Incubando y el estado final).

### 4.2 — Botón "Registrar aislamientos obtenidos"

Aparece solo cuando el batch tiene estado `"Colonias visibles"` y proviene de un Evento de Aislamiento.

Al presionar, abre un modal con:

**Paso 1 — Configuración del lote:**
- Cantidad de aislamientos: número entero (ej: 20)
- Género y Especie: pre-cargados desde el Ejemplar origen, editables
- Tipo de micelio esperado: select (Monocarión / Desconocido)
- Ploidía esperada: pre-cargado como "Haploide"
- Soporte destino: "Placa individual" / "Tubo eppendorf" / "Ambos"
- Medio a usar: selector de medios preparados disponibles
- Sala destino

**Paso 2 — Revisión y ajuste individual:**
Tabla con N filas, una por aislamiento, con columnas:
- Nº (auto: 001, 002... 020)
- Código de cepa sugerido (auto-generado, editable): `[CEPA_PADRE]-H001`, `[CEPA_PADRE]-H002`...
- Observaciones morfológicas (texto libre, opcional)
- Foto (opcional, cámara o galería)
- Checkbox "Descartar este aislamiento" (para colonias dudosas)

**Paso 3 — Confirmación:**
El sistema crea en una operación atómica (writeBatch):
- N documentos en `ejemplares`, todos con:
  - `evento_aislamiento_id`: ID del evento de origen
  - `ejemplar_padre_id`: ID del Ejemplar polispórico origen
  - `batch_origen_id`: ID de la placa de aislamiento
  - `estado`: "Activo"
  - `generacion`: padre + 1
- N batches (o 2N si soporte = "Ambos"), uno por Ejemplar creado
- Todos vinculados a la sala y medio seleccionados

### 4.3 — Resultado visible

Después de confirmar, mostrar resumen:
"Se registraron 18 Ejemplares haploides (2 descartados) derivados del Evento EVT-CORMI-260619-001"

Con links directos a la lista filtrada de esos Ejemplares.

**Build y confirmar antes de continuar.**

---

## BLOQUE 5 — Sincronización: Aislamiento Primario en Módulo 4

**Archivos a modificar:** `NuevoCultivoModal.jsx`

**Objetivo:** eliminar la redundancia entre "Aislamiento Primario" en Módulo 4 y los Eventos de Aislamiento del Módulo 5, sin romper flujos existentes.

### 5.1 — Ruta "Aislamiento Primario" en NuevoCultivoModal

Modificar esta ruta para que:

1. Al seleccionarla, muestre un aviso: "Para registrar un aislamiento con trazabilidad genética completa, usá el flujo de Eventos de Aislamiento en el módulo Genética → Ejemplares."
2. Si el usuario continúa igual, el comportamiento actual se mantiene (no romper).
3. Si el usuario hace click en "Ir a Eventos de Aislamiento", redirigir a `EjemplaresPage` con el modal de Evento de Aislamiento pre-abierto.

**No eliminar la ruta. Solo agregar el aviso y la redirección sugerida.**

**Build y confirmar antes de continuar.**

---

## BLOQUE 6 — Dashboard: sección "Pendientes de confirmación"

**Archivos a modificar:** `Dashboard.jsx`

Agregar una sección visible en el dashboard principal con tres subsecciones:

### 6.1 — Cruces en evaluación
Lista de Ejemplares con estado `"En evaluación"`, mostrando:
- ID del Ejemplar
- Padres (ID de ambos)
- Fecha del cruce
- Días transcurridos
- Botones: "Marcar como Activo" / "Marcar como Inviable"

### 6.2 — Placas con colonias visibles sin registrar
Lista de batches con estado `"Colonias visibles"` que aún no tienen Ejemplares hijos registrados.
- Botón directo: "Registrar aislamientos"

### 6.3 — Ejemplares sin MAT determinado
Lista de Ejemplares con `tipo_micelio = Monocarión` y `mat = "No determinado"`.
- Recordatorio para hacer PCR o apareamiento de prueba.

**Build y confirmar antes de continuar.**

---

## NOTAS FINALES

- **No tocar:** colección `esporomas`, módulo de cosechas, módulo de criobanco, impresión ZPL.
- **El módulo de criobanco** tiene su propio prompt pendiente — no anticipar cambios ahí.
- **El árbol genealógico visual** (React Flow) es un módulo separado, no parte de este prompt.
- Al finalizar todos los bloques, generar un informe de estado actualizado equivalente al `estado_proyecto.md` actual.
