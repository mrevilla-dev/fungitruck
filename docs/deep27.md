📋 PARTE 1: Copiar y pegar en Antigravity (Bloques 1, 2 y 3)
FungiTrack — Prompt para Antigravity (PARTE 1)
Módulo: Cosechas (Modelo de datos + Formularios Individual/Grupal/Sector)
Basado en auditoría de Claude — 23/06/2026

REGLAS DE ORO
Un bloque a la vez. ANTES de escribir el código de cada bloque, lea el archivo completo que va a modificar.
Al finalizar cada bloque, ejecute npm run buildy confirme que no haya errores.
Todos los cambios son aditivos. No eliminar lógicas ni documentos existentes de Firestore.
Programación defensiva: campo?.subcampo ?? fallbacksiempre.
Imágenes: siempre Google Drive vía uploadFileToDrivede src/services/driveService.js. Almacenamiento de base de fuego NUNCA.
ID: leer src/utils/idGenerator.jsantes de usar cualquier función — verificar el nombre exacto.
Antes de escribir el código de cada bloque, muestre un plan de implementación y esperará mi confirmación.
No crear nuevas colecciones para datos que ya existan en otras partes.
Confirmar antes de avanzar al siguiente bloque.
Si el writeBatch falla: brindis de error, no resetear el formulario.
No tocar: módulo de criobanco, árbol genealógico, impresión ZPL, diseño experimental, módulo de mantenimiento.
CONTEXTO
El ciclo de un lote en FungiTrack termina en la cosecha. Hoy ese paso no existe. Este mensaje (Parte 1) implementa el modelo de datos y los formularios de carga.

Datos ya disponibles en el sistema que consume este módulo:

batches.fechaInoculacion— para calcular días transcurridos.
batches.destinoId— sala/sector donde está el lote.
batches.status— filtrar lotes activos.
batches.peso_seco_pct— (Herencia de auditoría) Porcentaje de materia seca.
batches.peso_seco_sustrato_g— (Herencia de receta) Peso seco teórico por unidad.
Condiciones ambientales: Colección mantenimiento. Campos: destinoId, temperatura, humedad(solo cuando tipo === "Temperatura"), createdAt.
BLOQUE 1 — Modelo de datos, colección, IDs y Fallbacks
Archivos a verificar antes de crear nada:

Leer src/utils/idGenerator.js.
Leer estructura de batchespara confirmar campos de peso seco.
1.1 — ID semántico de cosecha
Formato: COS-GENESP-YYMMDD-NNN. Contador atómico en metadata/counters.

1.2 — Retroceso del peso seco (REGLA ESTRICTA)
Al calcular la EB, el sistema debe buscar el peso seco en este orden exacto:

Leer batches.peso_seco_pct(si existe y es > 0).
Si no, leer batches.peso_seco_sustrato_g(si existe y es > 0).
Si ambos son nullo 0, muestre el campo como editable en el formulario. Importante: Guarde el valor utilizado en cosechas.peso_seco_sustrato_gy marque el origen en peso_seco_sustrato_fuente: "auditoria" | "receta" | "manual".
1.3 — Respaldo de condiciones ambientales (REGLA ESTRICTA)
Para obtener la temperatura y humedad de la sala del lote, use esta consulta exacta en la colección mantenimiento:

query(  collection(db, "mantenimiento"),  where("destinoId", "==", batch.destinoId),  where("tipo", "==", "Temperatura"),  orderBy("createdAt", "desc"),  limit(1))
Si el registro existe y es de las últimas 24 horas: pre-cargar los valores en el formulario (solo lectura) y setear .condiciones_ambientales_fuente: "mantenimiento"
Si no hay registro o es mayor a 24 horas: mostrar los campos vacíos y editables, seteando .condiciones_ambientales_fuente: "manual"
Construya y confirme antes de continuar.

BLOQUE 2 — Forma de cosecha: modo individual
Archivos a crear: NuevaCosechaModal.jsx

2.1 — Selector de modo al abrir
Tres opciones claras (aptas para uso con guantes):

🍄 Individual — un lote específico
📦 Grupal — selección múltiple manual
🏠 Por sector — todos los lotes activos de una sala
2.2 — Campos generales (todos los modos)
Fecha de cosecha (predeterminado: hoy), Número de oleada (sugerido: cosechas previas + 1).
Peso fresco total (g) — obligatorio.
Peso húmedo del sustrato post-cosecha (g) — opcional.
Peso perdido en esta oleada (g) — opcional.
Morfología general (select), Primordios (Sí/No + Estado).
Destinos: lista dinámica (Destino + Cantidad g). Validar suma <= peso fresco.
Condiciones ambientales: traer con consulta de Bloque 1.3.
Foto (Drive), Operario, Observaciones.
experimento_id: null(reservado).
Casilla de verificación "Marcar lote como agotado" -> .batches.status = "Cosechado"
2.3 — Sección morfológica por especie (ATENCIÓN A LA ESTRUCTURA)
OBLIGATORIO: Antes de codificar esta sección, muestre un ejemplo del JSON exacto que se guardará en Firestore para un Cordyceps y para un Hericium para confirmar que la estructura de Map/Objeto no se rompe.

Si especie = Cordyceps militaris:

Número total de estromas.
Tabla de distribución de alturas (rangos 0-2 a 8-10 cm) con cantidad y checkbox "Esporulados".
Diámetro medio estroma (mm).
Estado esporulación general (select).
Si especie = Hericium erinaceus:

Número cuerpos fructíferos.
Peso medio por cuerpo (calculado automáticamente: peso_fresco / numero_cuerpos, editable).
Diámetro (cm), Firmeza (1-5), Color/Pardeamiento (1-5), Esporulación (seleccionar).
Para otras especies: texto libre.

2.4 — Métricas calculadas en tiempo real
OBLIGATORIO: Antes de codificar, mostrame un plan con un ejemplo matemático ficticio (ej. "Si peso fresco es 250g y peso seco es 100g...") demostrando cómo se calculan estas fórmulas:

eb_oleada= (peso_fresco_g / peso_seco_sustrato_g) × 100
eb_acumulada= (suma peso_fresco_g todas las oleadas / peso_seco_sustrato_g) × 100
tpb= eb_acumulada / dias_desde_inoculacion
2.5 — writeBatch al confirmar
Crear documento en . Si "Marcado como agotado", actualice .cosechasbatches.status

Construya y confirme antes de continuar.

BLOQUE 3 — Forma de cosecha: modo grupal y por sector
Archivos a modificar: NuevaCosechaModal.jsx

3.1 — Modo grupal manual
SearchableSelectmúltiples de lotes activos.
El usuario ingresa peso fresco total del grupo .
El sistema calcula: peso estimado por lote, grupo promedio EB, grupo promedio TPB.
Se crea un documento de cosecha por lote en el writeBatch (todos con y el array ).modo_cosecha: "grupal"batch_ids_grupo
3.2 — Modo por sector
Selector de sala. Traer automáticamente todos los lotes activos de esa sala.
Permitir desmarcar individuales. Flujo igual que grupal.
3.3 — Morfología en modos grupales/sector
Si misma especie: mostrar sección correspondiente (aplica al grupo).
Si especies mixtas: solo morfología general (texto libre).
3.4 — Casilla de verificación "Marcar todos como agotados"
Actualiza a "Cosechado" en todos los lotes del writeBatch.status

Construya y confirme antes de continuar.