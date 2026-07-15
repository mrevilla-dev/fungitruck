📄Prompt_Refactoring_Arbol_Genealogico.md
FungiTrack — Prompt de Refactoring UI/UX para Antigravity
Módulo: Árbol Genealógico (Mejora Visual Crítica)
Rol activo: Diseñador UX/UI Senior. La lógica de consultas NO se toca. Aquí corregimos estética, semántica visual, interacción y un error lateral.

REGLAS ESTRICTAS PARA ESTE PARCHE
Un cambio a la vez. Lea el archivo completo antes de modificarlo.
Ejecutar npm run buildy confirmar 0 errores después de CADA tarea.
Usar Tailwind CSS para los estilos. Nada de CSS en línea excepto para cálculos dinámicos obligatorios de React Flow.
NO TOCARconstruirArbolGenealogico.js excepto en la Tarea 1, que está expresamente permitida y delimitada.
NO INSTALAR NUEVAS DEPENDENCIAS. Usando lo que ya tienes React Flow.
TAREA 1: Preparar semántica en las conexiones (Edges)
Archivo a modificar: construirArbolGenealogico.js

Hoy los bordes no tienen tipo. Agregar un 4to parámetro en addEdgepara inyectar una propiedad data.tipo. Asignar estos valores exactos según el origen/destino de la conexión:

Conexiones de flujo biológico (Esporoma → Evento → Ejemplar):tipo: 'genetico'
Conexiones que entran o salen de un nodo Hibridación:tipo: 'hibridacion'
Conexiones de un Ejemplar hacia un nodo de Pasajes:tipo: 'pasaje'
npm run buildy confirmar.

TAREA 2: Reestructurar Jerarquía Visual de Nodos
Archivo a modificar: CustomNodes.jsx

Aplique esta escalada de importancia usando Tailwind. Los componentes ya existen aquí, solo hay que cambiarles las clases y agregarles la foto.

Nodo Esporoma (La Raíz - Máxima Prominencia):
Fondo: bg-gradient-to-br from-violet-900 to-slate-900.
Borde: border-2 border-violet-400.
Sombra: shadow-[0_0_15px_rgba(139,92,246,0.3)](brillo violeta).
FOTO: A la izquierda del texto, agregue un imgde 36x36 ( w-9 h-9 rounded-full object-cover border-2 border-violet-300). Leer la URL de data.fotoUrl. Si no existe, muestre un ícono SVG de hongo ( <GiMushroom />o similar).
Tipografía del ID: text-base font-bold text-white.
Nodo Ejemplar (El Sujeto):
Fondo: bg-slate-800/90 backdrop-blur-sm.
Borde: border-[1.5px] border-violet-500.
FOTO: Igual que el Esporoma (36x36, leer data.fotoUrl, ícono alternativo).
Tipografía del ID: text-sm font-semibold text-slate-100.
Nodo Hibridación (Rombo - Mantener rotación existente):
Fondo: bg-pink-900/60 backdrop-blur-sm.
Borde: border border-pink-400.
Sin foto.
Nodo Pasajes Comprimido ( 🔁 N pasajes- El más discreto):
Fondo: bg-slate-900/60.
Borde: border border-dashed border-slate-600(Punteado).
Sin foto. Solo ícono 🔁y texto text-xs text-slate-400.
INTERACCIÓN: Al hacer clic en ESTE nodo, en lugar de abrir una ficha genérica, disparará una función onOpenPasajesPanel(data.ejemplarId)que usaremos en la Tarea 4.
npm run buildy confirmar.

TAREA 3: Estilos de Conectores Semánticos
Archivo a modificar: El componente principal donde se renderiza <ReactFlow>(donde se definen los edgeTypeso defaultEdgeOptions).

Dejar de usar el Edge por defecto. Cree un Edge personalizado o aplique estilos condicionales basados ​​en edge.data.tipo:

Si tipo === 'genetico': stroke: '#a78bfa' (violeta), strokeWidth: 2, sólido.
Sí tipo === 'hibridacion': stroke: '#f472b6' (rosa), strokeWidth: 1.5, sólido.
Si tipo === 'pasaje': stroke: '#64748b' (gris), strokeWidth: 1.5, strokeDasharray: '5 5'(Punteado).
npm run buildy confirmar.

TAREA 4: Corrección de Bug y UX en Panel Lateral (Ficha de Detalle)
Archivo a modificar: Componente del panel lateral ( FichaNodoArbol.jsxo similar).

4.1 — Corregir "N/A" en Medio y Sala (CORRECCIÓN DE ERRORES)
Cuando el nodo contextual sea un Batch o Pasaje, dejará de mostrar "N/A".

Usar el campo medioPrepIdpara hacer una búsqueda en la colección medios_preparadosy mostrar el nombreo nombre_medidoreal.
Usar el campo salaDestinoIdpara buscar el nombre legible de la sala.
Si la consulta no devuelve nada, mostrar texto text-slate-500 italic "No registrado". NUNCA mostrar "N/A".
4.2 — Corregir color de Insignia "En evaluación"
Cuando se muestre el estado de una Hibridación en el panel:

"Activo" ->bg-emerald-500/20 text-emerald-400
"En evaluación" -> bg-amber-500/20 text-amber-400 border-amber-500/30(ÁMBAR, quitar cualquier rojo).
"Inviable" ->bg-slate-500/20 text-slate-400
4.3 — Enfoque Híbrido para Pasajes (NUEVA FUNCIONALIDAD)
Capturar el evento abierto por el nodo 🔁 N pasajes(Tarea 2.4). Cuando se dispare, el panel lateral debe mostrar:

Un título "Pasajes del Ejemplar [ID]".
Una lista vertical de los lotes/pasajes contenidos en ese grupo.
Cada elemento de la lista debe mostrar: ID, Fecha, y un Badge de estado (🟢 Activo, 🔴 Contaminado, ⚫ Agotado - basado en el statusdel lote).
Botón "Ver en árbol": Al lado de cada elemento de la lista, un botón pequeño. Al hacer clic, debe aplicar un estado en React Flow que ponga un borde brillante (ej. border-cyan-400y animación de pulso) únicamente a ese nodo de pasaje específico en el lienzo de fondo , para que el usuario sepa dónde quedó.
npm run buildy confirmar.

VERIFICACIÓN FINAL (Checklist Antigravedad)
El Esporoma tiene foto de perfil circular y brilla más que ningún otro nudo.
Los bordes hacia los pasajes son punteados grises. Los genéticos son sólidos violetas.
Al hacer clic en 🔁 3 pasajes, se abre el panel lateral con una lista de los 3 lotes y sus insignias de estado (verde/rojo/negro).
En esa lista, el botón "Ver en árbol" hace que el nodo correspondiente en el lienzo de fondo se pinte de otro color (ej. cyan) para resaltarlo.
Al abrir un pasaje individual, el campo Medio dice "MEA" (o el que sea) en lugar de "N/A".
El distintivo de "En evaluación" en el panel es amarillo/ámbar.
npm run buildpecado final errores.
Mostrame el plan de cómo vas a atacar la Tarea 1 y esperará mi confirmación.

Con este aviso, Antigravity no tiene que adivinar nada. Sabe en qué línea de qué archivo poner

