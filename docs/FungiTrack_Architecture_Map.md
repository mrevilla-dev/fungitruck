# FungiTrack: Arquitectura y Mapa de Trazabilidad 🍄🧪

Este documento describe la estructura técnica y lógica de la aplicación FungiTrack para su auditoría y realineación.

---

## 1. Estructura de Archivos (Directorio `src`)

El proyecto está construido sobre **Vite + React + Firebase**. La lógica se divide en:

- **/pages**: Componentes de alto nivel (vistas principales).
  - `Dashboard.jsx`: Vista general y métricas.
  - `NewBatch.jsx`: **Core de Trazabilidad**. Registro de inoculaciones y herencia.
  - `InventoryPage.jsx`: Gestión de Insumos Base, Medios Preparados y Cultivos.
  - `EsporomasPage.jsx`: Registro de ejemplares silvestres (Genética).
  - `ScannerPage.jsx`: Lógica de lectura de QRs para seguimiento.

- **/components**: Modales y componentes reutilizables.
  - `NuevoMedioModal.jsx`: Lógica de descuento de stock de insumos al crear medios.
  - `PrintLabelsModal.jsx`: **Centro de Impresión de QRs**.
  - `CultivosTable.jsx`: Renderizado dinámico de lotes activos.

- **/services**: Integraciones externas.
  - `driveService.js`: Puente con Google Apps Script para almacenamiento de imágenes.

- **/utils**: Lógica auxiliar.
  - `idGenerator.js`: Generador de IDs semánticos (Ej: PLO-OST-APD-0001).
  - `imageUtils.js`: Compresión de imágenes en cliente (Canvas).

---

## 2. Esquema de Datos (Firestore)

### Colección: `batches` (Cultivos/Lotes)
- `id`: ID Semántico (Primary Key).
- `genero`/`especie`/`cepa`: Taxonomía.
- `genetica`: Haploide, Diploide o Dicarión.
- `parentId`: ID del lote padre (Trazabilidad ascendente).
- `esporomaId`: ID del ejemplar de origen (si aplica).
- `substrateCode`: Código de 3 letras del medio (Ej: APD).
- `fotoUrl`: Enlace a Google Drive.
- `status`: Inoculado, Incubando, Cosechado, Contaminado.

### Colección: `esporomas` (Ejemplares)
- `id`: Prefijo ESP + Fecha + Secuencia.
- `genetica`: Estado plustal inicial.
- `lugarRecoleccion`: Datos geográficos.

### Colección: `medios_preparados`
- `alias`: Nombre amigable del lote de medio.
- `recetaId`: Vínculo con la fórmula base.
- `stock_bulk`: Cantidad actual disponible para inoculaciones.

---

## 3. Flujo de Navegación (Rutas)

Configurado en `App.jsx` mediante `react-router-dom`:
- `/`: Dashboard (Vista consolidada).
- `/inventory`: Gestión de stock y trazabilidad de medios.
- `/new`: Formulario de inoculación (Generación de etiquetas).
- `/scan`: Interfaz de cámara para lectura de QRs en lab.
- `/esporomas`: Banco de germoplasma / registros silvestres.

---

## 4. Estado de Integraciones Críticas

### Trazabilidad QR
- **Generación:** Se ejecuta en `generateSemanticId` (utils) al confirmar una inoculación.
- **Impresión:** Centralizada en `PrintLabelsModal.jsx`. Utiliza `qrcode.react` para generar SVGs escalables.
- **Lectura:** `ScannerPage.jsx` utiliza la cámara del dispositivo para decodificar el ID y redirigir a la historia del lote.

### Google Drive Integration
- **Proxy:** Google Apps Script (Web App).
- **Configuración:** `src/config.js` contiene la `GOOGLE_DRIVE_SCRIPT_URL` y el `FOLDER_ID`.
- **Lógica:** El cliente convierte la imagen a Base64, la comprime y la envía al script para evadir restricciones de CORS y costos de Firebase Storage.

### Medios Preparados
- **Versión Activa:** V2.0. Soporta **Series Experimentales**. Permite crear múltiples lotes con variables controladas (ej: distintos filtros o sustratos) en una sola operación, descontando automáticamente el stock de insumos base.

---
**Generado por Antigravity para FungiTrack Lab.**
