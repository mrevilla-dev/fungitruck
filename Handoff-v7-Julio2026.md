# FungiTrack Handoff v7 — Julio 2026

**Última actualización:** Julio 2026  
**Autor:** Maximiliano Revilla (mrevilla@fvet.uba.ar)  
**Repo:** `C:\Users\Usser\Documents\New OpenCode Project\fungitrack`  
**Build:** `cmd /c "npm run build"` (PowerShell bloquea `npm` directo)  
**Git identity:** `Maximiliano Revilla` / `mrevilla@fvet.uba.ar`

---

## 1. Estado General del Proyecto

| Módulo | Estado | Último Commit |
|--------|--------|---------------|
| Medios Preparados | 🟢 100% funcional | — |
| Inoculaciones | 🟢 100% funcional | `a842fc1` |
| Ventanilla Única (IngresoMaterialPage) | 🟢 Fase 2 completa | `d66f4e4` |
| Criobanco (Impresión ZPL) | 🟢 100% funcional | `4ca2419` |
| EsporomasPage | 🟢 UX mejorada | `d533771`, `8274917` |
| EjemplaresPage | 🟢 UX mejorada | `35609e3` |
| DerivacionEsporomaModal | 🟢 ScanInput integrado | `aa1880a` |
| NuevoEventoAislamientoModal | 🟢 ScanInput integrado | `e00274b` |
| **Agente IA Híbrido** | 🟢 Ollama + Gemini | `8501549`, `529375e`, `3ebd23c` |

---

## 2. Arquitectura de la App

### Stack
- **Frontend:** React 18 + Vite
- **Backend:** Firebase (Firestore + Auth + Storage)
- **Hosting:** Firebase Hosting (con HTTPS automático)
- **Impresión:** ZPL via PrintLabelsModal
- **IA:** Híbrida Ollama (local) + Gemini Flash (cloud fallback)

### Estructura de carpetas clave
```
src/
── agent/
│   ├── llmRouter.js          # Router Ollama ↔ Gemini
│   └── firestoreContext.js   # Constructor de contexto para IA
├── components/
│   ├── AsistenteFlotante.jsx # Chat flotante con voz
│   ├── PhotoLightbox.jsx     # Modal de fotos ampliadas
│   ├── PrintLabelsModal.jsx  # Impresión ZPL
│   ├── ScanInput.jsx         # Escaneo QR
│   ├── SearchableSelect.jsx  # Dropdown con búsqueda
│   ├── DerivacionEsporomaModal.jsx
│   └── NuevoEventoAislamientoModal.jsx
── pages/
│   ├── EsporomasPage.jsx
│   ├── EjemplaresPage.jsx
│   ├── IngresoMaterialPage.jsx
│   ├── CriovialDescongelacionPage.jsx
│   └── CriovialDetallePage.jsx
├── services/
│   ├── criobancService.js
│   └── driveService.js
├── utils/
│   ├── idGenerator.js        # IDs semánticos
│   └── imageUtils.js
├── firebase.js               # Config hardcoded (sin .env)
── config.js                 # GEMINI_API_KEY via import.meta.env
```

---

## 3. Sistema de IDs Semánticos

Todos los IDs se generan con `src/utils/idGenerator.js` y siguen patrones estrictos:

| Tipo | Formato | Ejemplo |
|------|---------|---------|
| Esporoma | `ESP-{GEN}{ESP}-{CEPA}-{ORIGEN}-{YYMMDD}-{NNN}` | `ESP-GANLUC-A01-SIL-260715-001` |
| Ejemplar | `EJE-{GEN}{ESP}-{CEPA}-{TM}-{YYMMDD}-{NNN}` | `EJE-GANLUC-A01-ESP-260715-001` |
| Evento | `EVT-{GEN}{ESP}-{YYMMDD}-{NNN}` | `EVT-GANLUC-260715-001` |
| Batch | `BAT-{GEN}{ESP}-{CEPA}-{MED}-{YYMMDD}-{NNN}{LETRA}` | `BAT-GANLUC-A01-MEA-260715-001A` |

**Regla crítica:** Nunca modificar `idGenerator.js` ni la lógica de contadores en `metadata/counters`.

---

## 4. Colecciones de Firestore

| Colección | Campos clave | Notas |
|-----------|-------------|-------|
| `esporomas` | id, genero, especie, codigo_cepa, origen, fotoUrl, lugarRecoleccion, fechaRecoleccion, ploidia, tipo_micelio | IDs semánticos |
| `ejemplares` | id, id_semantico, genero, especie, estado, generacion, fotoUrl, ejemplarPadreId, evento_aislamiento_id | Soft delete con campo `eliminado: true` |
| `eventos_aislamiento` | id_semantico, ejemplar_origen_id, tecnica, fecha, operario, medio_prep_id, sala_destino_id | — |
| `batches` | id, genero, especie, status, fechaInoculacion, medioPrepId, fraccionId, destinoId | Status: Activo/Incubando/Inoculado/Agotado |
| `medios_preparados` | id, alias, nombre_receta, estado, stock_bulk, subfracciones (subcolección) | Subcolección `subfracciones` con campo `disponible` |
| `salas` | id, nombre, tipo | — |
| `contenedores` | id, nombre, tipo, sala_actual, eliminado | Soft delete |
| `metadata/counters` | Secuencias diarias por tipo | Usado por `runTransaction` para IDs únicos |

---

## 5. Agente IA Híbrido

### Arquitectura
```
Usuario (voz/texto)
      ↓
AsistenteFlotante.jsx (Web Speech API + Text-to-Speech)
      ↓
llmRouter.js → ¿Ollama disponible en localhost:11434?
      ├── SÍ → Ollama (llama3.2:3b) → privado, rápido
      └── NO → Gemini Flash API → cloud, funciona en celular
      ↓
firestoreContext.js → Resume esporomas, ejemplares, batches, medios
      ↓
Respuesta en chat + voz
```

### Archivos
- `src/agent/llmRouter.js`: Router dual con fallback automático
- `src/agent/firestoreContext.js`: Constructor de contexto (cache 60s)
- `src/components/AsistenteFlotante.jsx`: UI del chat flotante
- `.env`: `VITE_GEMINI_API_KEY=...` (no se sube a Git)
- `.env.example`: Template documentado

### Configuración
1. **Ollama (PC):** `ollama pull llama3.2:3b` + dejar corriendo
2. **Gemini (celular):** API key gratis en https://aistudio.google.com/app/apikey

### Limitaciones actuales
- No completa formularios automáticamente (solo responde consultas)
- No tiene navegación contextual (no sabe en qué página estás)
- Web Speech API requiere HTTPS (funciona en deploy, no en localhost desde celular)

---

## 6. Mejoras UX Implementadas

### EsporomasPage
- ✅ Botón 📋 para copiar ID al portapapeles
- ✅ Badges de origen con colores (Silvestre=verde, Cultivo=azul, Compra=amarillo, etc.)
- ✅ PhotoLightbox al hacer clic en fotos
- ✅ Filtros por especie y origen
- ✅ PrintLabelsModal integrado

### EjemplaresPage
- ✅ Filtros completos en "Eventos de Aislamiento" (texto, técnica, operario, fechas, ordenamiento)
- ✅ Badges de estado con colores
- ✅ Contador "Mostrando X de Y"

### Modales
- ✅ ScanInput en `DerivacionEsporomaModal` (escaneo QR de medio)
- ✅ ScanInput en `NuevoEventoAislamientoModal` (escaneo QR de medio)

---

## 7. Variables CSS (index.css)

```css
--bg-color, --surface-color, --primary-color, --primary-hover,
--accent-color, --text-primary, --text-secondary, --border-color, --danger-color
```

Usar estas variables en todos los componentes nuevos para mantener consistencia.

---

## 8. Pendientes / Futuro

- [ ] Agente IA: completar formularios por voz (requiere LLM más potente o prompts estructurados)
- [ ] Agente IA: navegación contextual (saber en qué página está el usuario)
- [ ] Agente diario: sugerencias de tareas según estado de batches
- [ ] Búsqueda por texto global en EsporomasPage y EjemplaresPage (Linajes)
- [ ] Ordenamiento configurable en EsporomasPage
- [ ] Testing integral de todas las mejoras UX
- [ ] Documentación de API de impresión ZPL

---

## 9. Comandos Útiles

```bash
# Desarrollo
npm run dev

# Build
cmd /c "npm run build"

# Deploy (Firebase)
firebase deploy

# Git
git add .
git commit -m "..."
git push

# Ollama
ollama pull llama3.2:3b
ollama list
ollama ps
```

---

## 10. Decisiones Técnicas Clave

1. **Firebase config hardcoded** en `src/firebase.js` (no `.env`) — decisión original del proyecto
2. **IDs semánticos** generados con `runTransaction` sobre `metadata/counters` — garantiza unicidad
3. **Soft delete** en ejemplares y contenedores (campo `eliminado: true`) — preserva historial
4. **Subfracciones** como subcolección de `medios_preparados` — permite tracking granular
5. **Agente IA híbrido** Ollama+Gemini — privacidad en PC, funcionalidad en celular
6. **Web Speech API** nativa — sin costos, funciona offline (en PC con Ollama)
