# Informe de Actualización - FungiTrack (15 de Julio de 2026)

## Resumen de Cambios Recientes

Durante las últimas sesiones, se han introducido múltiples mejoras sustanciales en la aplicación, abarcando optimización de impresión de etiquetas, reestructuración del empaquetado (nesting) de ZPL y una nueva navegación mobile-first, entre otros.

### 1. Correcciones de Etiquetas e Impresión ZPL
- **Algoritmo de Nesting (NFDH)**: Se implementó un algoritmo *Next-Fit Decreasing Height* en la cola de impresión (`src/components/PrintLabelsModal.jsx` y `src/pages/PrintQueue.jsx`) para acomodar etiquetas de múltiples tamaños (MAXI, MEDIO, PORTAOBJETOS) de forma eficiente en una misma hoja, resolviendo la superposición.
- **Rediseño de Formatos (zplProfiles.js)**:
  - **MEDIO_ESTANDAR (5x5)**: Se achicó el código QR y se acomodaron las cajas de texto (`^FB`) para que el texto largo no pise el QR.
  - **PORTAOBJETOS**: Se ajustó la limitación de caracteres y el formato en bloque para no salirse de los márgenes derecho.
  - **MAXI_BOLSA y SLIM_PETRI**: Se agregaron bloques `^FB` para truncar dinámicamente y envolver los textos demasiado largos (ej. `Ref:`).
  - **Densidad del QR**: Se redujo el nivel de corrección de error de los códigos QR (pasando a Nivel M `^FDMA`) en etiquetas pequeñas (ej. Eppendorfs y Portaobjetos) para facilitar la lectura rápida desde la cámara del celular.
- **Corrección en PrintQueue**: Se reparó un bug crónico en `PrintQueue.jsx` donde al reimprimir un lote se forzaba siempre el perfil `MEDIO_ESTANDAR`, ignorando la configuración guardada en la base de datos (ahora respeta la propiedad `tipo_etiqueta`).

### 2. Navegación Mobile-First (Prompt deep35)
Se introdujo una capa de navegación especialmente diseñada para ser operada desde dispositivos móviles (pantallas pequeñas, uso con guantes) sin alterar la vista tradicional de PC.
- **`useIsMobile.js`**: Hook personalizado para detectar pantallas menores a 768px.
- **Menú Inferior Fijo (`BarraInferiorMobile.jsx`)**: En mobile, la barra de navegación superior desaparece y es reemplazada por una barra inferior persistente con botones grandes: `Inicio`, `Escanear` (resaltado) y `Menú`.
- **Panel de Módulos (Drawer)**: Al tocar `Menú`, se levanta un modal con todos los módulos (`Insumos`, `Salas`, `Ejemplares`, `Criobanco`, `Equipos`, `Experimentos`, etc.) distribuidos en grilla.
- **Rutas Consolidadas**: Se configuró `menuItems.js` en sintonía con las rutas existentes de `App.jsx`, agregando nuevos accesos como `/ingreso-material` y `/equipos`.
- **Ajustes de Interfaz Global (`index.css`)**: 
  - Se incrementó el área táctil mínima (44x44px) para botones y selectores.
  - Se configuró la excepción `.btn-compact` para preservar el diseño original de los botones chicos preexistentes (como tachos de basura o acciones inline).
  - Se añadió *scroll horizontal* automático para las tablas desbordadas en celulares.

### 3. Deploy y Build
Todos los cambios han sido compilados exitosamente mediante Vite (`npm run build`) y publicados en Firebase Hosting de forma iterativa. 

> *El código completo se ha comiteado en el repositorio local y pusheado al remoto para permitir su clonación y continuidad desde cualquier otro equipo de desarrollo.*
