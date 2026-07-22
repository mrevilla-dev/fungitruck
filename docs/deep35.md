# Prompt — Navegación Mobile-First
## FungiTrack · Para ejecutar con Antigravity · Bloque a bloque
## v2 — con correcciones de Deepseek (deep35)

---

> **ANTES DE EMPEZAR — REGLAS OBLIGATORIAS**
> 1. Leer cada archivo completo antes de modificarlo
> 2. Un bloque a la vez — `npm run build` y confirmar entre bloques
> 3. Cambios aditivos únicamente — no eliminar lógica existente
> 4. Defensive programming: `campo?.subcampo ?? fallback` siempre
> 5. Mostrar plan antes de tocar código y esperar confirmación
> 6. En desktop: el menú actual NO cambia — solo se agrega comportamiento mobile

---

## CONTEXTO

El menú de navegación actual es una barra horizontal superior con todos los
módulos en una sola fila. En desktop funciona bien. En mobile es ilegible —
los ítems son pequeños, la barra hace scroll horizontal y es imposible de
usar con guantes de nitrilo.

Este prompt agrega una navegación mobile específica sin tocar la desktop.
El sistema se usa en cabina de flujo laminar con guantes — los elementos
táctiles deben ser grandes (mínimo 48px de alto).

---

## DISEÑO OBJETIVO

### Desktop (sin cambios)
Barra horizontal superior existente — no tocar.

### Mobile (nuevo)
```
┌─────────────────────────────┐
│  contenido de la página     │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│  🏠        📷        ☰     │
│ Inicio   Escanear   Menú   │
└─────────────────────────────┘
```

Barra inferior fija con 3 botones grandes.
Al tocar "Menú" se abre un panel con todos los módulos en grilla de íconos.

### Panel de menú completo (mobile)
```
┌─────────────────────────────┐
│ ✕  Menú                     │
├─────────────────────────────┤
│   🧫        📦        🧬   │
│   Lab     Insumos  Genética │
│                             │
│   🌡️        🍄        ❄️   │
│  Salas    Cosecha    Crío   │
│                             │
│   🌳        🧪        📋   │
│  Árbol    Medios     Cola   │
│                             │
│   🔬        📊        🛒   │
│ Experim.  Dashboard Compras │
└─────────────────────────────┘
```

Íconos grandes (mínimo 72px), dos columnas o tres según ancho disponible,
fácil de tocar con guantes.

---

## BLOQUE 1 — Leer la navegación existente

### Objetivo
Entender la estructura actual antes de tocar nada.

### 1.1 — Leer primero
```
src/components/Navbar.jsx (o el nombre real del componente de navegación)
src/App.jsx (o router principal — para ver todas las rutas)
```

Identificar:
- Nombre exacto del componente de navegación
- Cómo se renderizan los ítems del menú (array, hardcodeado, etc.)
- Si ya existe algún breakpoint mobile en el CSS
- Qué librería de estilos usa el proyecto (CSS modules, Tailwind, styled-components, CSS puro)

### 1.2 — NO modificar nada en este bloque
Solo lectura. Documentar los hallazgos como comentario antes de continuar.

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- Identificados: nombre del componente, estructura de ítems, sistema de estilos

---

## BLOQUE 2 — Hook de detección de dispositivo

### Objetivo
Crear un hook reutilizable que detecte si el usuario está en mobile.
Este hook se usará en la navegación y en cualquier componente que
necesite comportamiento diferencial mobile/desktop.

### 2.1 — Crear `src/hooks/useIsMobile.js`

```javascript
import { useState, useEffect } from 'react';

/**
 * Detecta si el viewport es mobile (< 768px)
 * Se actualiza automáticamente al rotar el dispositivo
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < breakpoint
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  return isMobile;
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El hook existe y es importable

---

## BLOQUE 3 — Definir ítems del menú mobile

### Objetivo
Crear el archivo de configuración con todos los módulos del sistema
y sus íconos para el panel mobile. Separado de la lógica de renderizado.

> ⚠️ **NOTA OBLIGATORIA ANTES DE ESCRIBIR ESTE BLOQUE (Deepseek, deep35):**
> Las rutas del array de ejemplo abajo son **provisorias** y probablemente
> no coinciden todas con las reales. Casos ya detectados:
> - `/inoculaciones` no existe como ruta independiente — probablemente
>   vive dentro de `/inventario` o de una ruta de batch.
> - `/medios` no existe como tal en la tabla de rutas del handoff.
> - `/cola` probablemente corresponde a `/print-queue`.
>
> **Antes de crear `menuItems.js`, leer `App.jsx` completo y confirmar
> cada ruta contra el router real.** Si una ruta del ejemplo no existe,
> corregirla o comentarla con `// pendiente — verificar ruta real`.
> No asumir que el array de ejemplo de este prompt es correcto — es
> solo una referencia de estructura, no de rutas definitivas.

### 3.1 — Crear `src/config/menuItems.js`

```javascript
/**
 * Configuración centralizada del menú
 * Usado tanto en la navbar desktop existente como en el panel mobile nuevo
 *
 * IMPORTANTE: No eliminar ítems existentes — solo agregar los nuevos módulos
 * que se hayan implementado (Experimentos, Criobanco, etc.)
 *
 * IMPORTANTE: Rutas verificadas contra App.jsx real antes de confirmar —
 * ver nota de Deepseek arriba. No copiar las rutas de este ejemplo sin chequear.
 */

export const MENU_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icono: '📊',
    ruta: '/',
  },
  {
    id: 'escanear',
    label: 'Escanear',
    icono: '📷',
    ruta: '/escanear',
  },
  {
    id: 'inventario',
    label: 'Insumos',
    icono: '📦',
    ruta: '/inventario',
  },
  {
    id: 'medios',
    label: 'Medios',
    icono: '🧪',
    ruta: '/medios', // pendiente — verificar ruta real, puede no existir
  },
  {
    id: 'salas',
    label: 'Salas',
    icono: '🌡️',
    ruta: '/salas',
  },
  {
    id: 'esporomas',
    label: 'Esporomas',
    icono: '🍂',
    ruta: '/esporomas',
  },
  {
    id: 'ejemplares',
    label: 'Ejemplares',
    icono: '🧬',
    ruta: '/ejemplares',
  },
  {
    id: 'inoculaciones',
    label: 'Lab',
    icono: '🧫',
    ruta: '/inoculaciones', // pendiente — verificar ruta real, puede vivir dentro de /inventario
  },
  {
    id: 'cosechas',
    label: 'Cosecha',
    icono: '🍄',
    ruta: '/cosechas',
  },
  {
    id: 'criobanco',
    label: 'Crío',
    icono: '❄️',
    ruta: '/criobanco',
  },
  {
    id: 'arbol',
    label: 'Árbol',
    icono: '🌳',
    ruta: '/arbol',
  },
  {
    id: 'experimentos',
    label: 'Experim.',
    icono: '🔬',
    ruta: '/experimentos',
  },
  {
    id: 'cola',
    label: 'Cola',
    icono: '📋',
    ruta: '/print-queue', // corregido — la ruta real es /print-queue, no /cola
  },
  {
    id: 'mantenimiento',
    label: 'Mantenim.',
    icono: '🔧',
    ruta: '/mantenimiento',
  },
];

// Ítems que aparecen en la barra inferior fija (siempre visibles en mobile)
export const MENU_BOTTOM_BAR = ['dashboard', 'escanear'];
// El tercer botón es siempre "Menú" → abre el panel completo
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- **Cada ruta en `menuItems.js` fue chequeada contra `App.jsx` real** — no solo copiada del ejemplo
- Si alguna ruta no existe todavía, comentarla con `// pendiente`

---

## BLOQUE 4 — Panel de menú mobile (drawer)

### Objetivo
Crear el componente del panel que se abre al tocar "Menú" en la barra inferior.
Es un drawer que sube desde abajo con todos los módulos en grilla.

### 4.1 — Crear `src/components/nav/MenuMobilePanel.jsx`

```jsx
import { useNavigate, useLocation } from 'react-router-dom';
import { MENU_ITEMS } from '../../config/menuItems';

export default function MenuMobilePanel({ abierto, onCerrar }) {
  const navigate = useNavigate();
  const location = useLocation();

  function irA(ruta) {
    navigate(ruta);
    onCerrar();
  }

  if (!abierto) return null;

  return (
    <>
      {/* Overlay oscuro detrás del panel */}
      <div
        onClick={onCerrar}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 200,
        }}
      />

      {/* Panel drawer desde abajo */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderRadius: '20px 20px 0 0',
          padding: '16px',
          zIndex: 201,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Header del panel */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
            Menú
          </span>
          <button
            onClick={onCerrar}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
              // Área táctil grande
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Grilla de módulos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}>
          {MENU_ITEMS.map(item => {
            const esActivo = location.pathname === item.ruta ||
              location.pathname.startsWith(item.ruta + '/');

            return (
              <button
                key={item.id}
                onClick={() => irA(item.ruta)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px 8px',
                  borderRadius: '12px',
                  border: esActivo ? '2px solid #4CAF50' : '1px solid #E0E0E0',
                  backgroundColor: esActivo ? '#F1F8E9' : 'white',
                  cursor: 'pointer',
                  // Área táctil mínima 48px
                  minHeight: '80px',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '28px', lineHeight: 1 }}>
                  {item.icono}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: esActivo ? 'bold' : 'normal',
                  color: esActivo ? '#2E7D32' : '#424242',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Espacio inferior para no tapar con la barra del sistema */}
        <div style={{ height: '16px' }} />
      </div>
    </>
  );
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- El componente renderiza sin errores con `abierto={true}`
- El overlay cierra el panel al tocarlo
- Los botones tienen área táctil mínima de 48px

---

## BLOQUE 5 — Barra inferior fija mobile

### Objetivo
Crear la barra inferior fija con los 3 botones: Inicio, Escanear, Menú.
Esta barra reemplaza visualmente la barra superior en mobile — no la elimina.

### 5.1 — Crear `src/components/nav/BarraInferiorMobile.jsx`

```jsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MenuMobilePanel from './MenuMobilePanel';

export default function BarraInferiorMobile() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const esDashboard = location.pathname === '/';
  const esEscanear = location.pathname === '/escanear';

  const estiloBoton = (activo) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '8px 4px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: activo ? '#4CAF50' : '#757575',
    gap: '2px',
    // Área táctil mínima
    minHeight: '56px',
  });

  return (
    <>
      <MenuMobilePanel
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      />

      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTop: '1px solid #E0E0E0',
        display: 'flex',
        zIndex: 100,
        // Soporte para notch de iPhone
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
      }}>

        {/* Inicio */}
        <button
          style={estiloBoton(esDashboard)}
          onClick={() => navigate('/')}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }}>🏠</span>
          <span style={{ fontSize: '10px', fontWeight: esDashboard ? 'bold' : 'normal' }}>
            Inicio
          </span>
        </button>

        {/* Escanear — botón central destacado */}
        <button
          style={{
            ...estiloBoton(esEscanear),
            // Botón central más grande y destacado
            flex: 1.2,
          }}
          onClick={() => navigate('/escanear')}
        >
          <span style={{
            fontSize: '26px',
            lineHeight: 1,
            backgroundColor: '#4CAF50',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            📷
          </span>
          <span style={{ fontSize: '10px', color: '#4CAF50', fontWeight: 'bold' }}>
            Escanear
          </span>
        </button>

        {/* Menú */}
        <button
          style={estiloBoton(menuAbierto)}
          onClick={() => setMenuAbierto(true)}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }}>☰</span>
          <span style={{ fontSize: '10px', fontWeight: menuAbierto ? 'bold' : 'normal' }}>
            Menú
          </span>
        </button>

      </nav>

      {/* Espaciador para que el contenido no quede tapado por la barra */}
      <div style={{ height: '70px' }} />
    </>
  );
}
```

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- La barra se fija en la parte inferior de la pantalla
- El botón Escanear es visualmente más prominente que los otros dos
- El panel de menú se abre y cierra correctamente
- El espaciador evita que el contenido quede tapado

---

## BLOQUE 6 — Integrar en el layout principal

### Objetivo
Mostrar la barra inferior solo en mobile, sin afectar desktop.

### 6.1 — Leer primero
```
src/App.jsx (o el componente raíz que envuelve todas las páginas)
src/components/Layout.jsx (si existe)
```

### 6.2 — Integrar `BarraInferiorMobile` en el layout

Buscar el componente raíz que envuelve todas las páginas (el que contiene
el `<Navbar>` actual y el `<Routes>`). Agregar la barra inferior condicionalmente:

```jsx
import { useIsMobile } from '../hooks/useIsMobile';
import BarraInferiorMobile from '../components/nav/BarraInferiorMobile';

// Dentro del componente raíz:
const isMobile = useIsMobile();

return (
  <>
    {/* Navbar desktop existente — se oculta en mobile */}
    {!isMobile && <Navbar />}

    {/* Contenido de la app */}
    <main>
      <Routes>
        {/* rutas existentes — no modificar */}
      </Routes>
    </main>

    {/* Barra inferior — solo mobile */}
    {isMobile && <BarraInferiorMobile />}
  </>
);
```

**IMPORTANTE (confirmado — no modificar ninguna ruta existente):**
- No eliminar el componente `<Navbar>` existente — solo ocultarlo en mobile
- No modificar ninguna ruta existente
- El `<main>` no necesita padding-bottom en desktop — solo en mobile
  (el espaciador dentro de `BarraInferiorMobile` ya lo maneja)

### 6.3 — Ocultar navbar desktop en mobile con CSS

Como refuerzo adicional, agregar en el CSS global o en el componente Navbar:

```css
/* En mobile, ocultar la navbar superior */
@media (max-width: 767px) {
  .navbar-desktop {
    display: none;
  }
}
```

Agregar la clase `navbar-desktop` al componente Navbar existente si no la tiene.

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- En desktop: navbar superior visible, sin barra inferior
- En mobile: navbar superior oculta, barra inferior visible
- Todas las rutas existentes funcionan desde ambas navegaciones
- El contenido no queda tapado por la barra inferior en mobile

---

## BLOQUE 7 — Ajustes de usabilidad mobile globales

### Objetivo
Aplicar reglas CSS globales que mejoren la usabilidad en mobile con guantes.
Sin tocar componentes individuales — solo reglas base.

> ⚠️ **NOTA OBLIGATORIA (Deepseek, deep35):**
> La regla `min-height: 44px` / `min-width: 44px` aplicada a **todos** los
> `button, [role="button"], a` puede romper botones chicos ya existentes
> en el proyecto — por ejemplo botones de "eliminar" dentro de cards, íconos
> de acción inline, etc. Antes de aplicar la regla global, agregar una clase
> de excepción (ej: `.btn-compact` o `.btn-icono-chico`) y **revisar si esos
> botones chicos ya tienen una clase identificable**. Si no la tienen, se
> puede agregar sin tocar su lógica, solo el `className`.

### 7.1 — Agregar en el CSS global (`src/index.css` o equivalente)

Agregar al final del archivo, sin modificar reglas existentes:

```css
/* ═══════════════════════════════════════════
   MEJORAS MOBILE — FungiTrack
   Aplicado solo en viewports < 768px
   No modifica estilos desktop
═══════════════════════════════════════════ */

@media (max-width: 767px) {

  /* Área táctil mínima para todos los botones,
     EXCEPTO los marcados explícitamente como compactos
     (ej: botones de eliminar en cards, íconos inline chicos) */
  button:not(.btn-compact), [role="button"]:not(.btn-compact), a:not(.btn-compact) {
    min-height: 44px;
    min-width: 44px;
  }

  /* Excepción explícita para botones chicos existentes —
     mantienen su tamaño original, no se agranda por esta regla */
  .btn-compact {
    min-height: unset;
    min-width: unset;
  }

  /* Inputs más grandes y fáciles de tocar */
  input, select, textarea {
    font-size: 16px; /* evita zoom automático en iOS */
    min-height: 44px;
    padding: 10px 12px;
  }

  /* Labels más legibles */
  label {
    font-size: 15px;
    margin-bottom: 6px;
    display: block;
  }

  /* Cards con más padding para tocar cómodo */
  .card, [class*="card"] {
    padding: 16px;
  }

  /* Tablas — scroll horizontal en lugar de comprimir */
  table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Modales — ocupar más pantalla en mobile */
  .modal, [class*="modal"] {
    width: 95vw !important;
    max-width: 95vw !important;
    margin: 10px auto;
  }

  /* Texto mínimo legible */
  body {
    font-size: 15px;
  }

  /* Evitar text overflow en títulos */
  h1, h2, h3 {
    word-break: break-word;
  }
}
```

### 7.2 — Antes de dar por cerrado este bloque

Revisar visualmente los botones chicos conocidos (eliminar en cards de
inventario, ejemplares, batches, etc.) en mobile después de aplicar la
regla. Si alguno se agrandó de forma indeseada, agregarle `.btn-compact`
en su `className` — sin tocar su `onClick` ni su lógica.

### ✅ Verificar antes de continuar
- `npm run build` sin errores
- En mobile: botones más grandes, inputs legibles sin zoom
- En mobile: botones chicos existentes (eliminar, íconos inline) **no** se rompieron ni se deformaron
- En desktop: ningún cambio visual

---

## RESUMEN DE ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Acción | Bloque |
|---|---|---|
| `src/hooks/useIsMobile.js` | Crear nuevo | 2 |
| `src/config/menuItems.js` | Crear nuevo — rutas verificadas contra App.jsx | 3 |
| `src/components/nav/MenuMobilePanel.jsx` | Crear nuevo | 4 |
| `src/components/nav/BarraInferiorMobile.jsx` | Crear nuevo | 5 |
| Componente raíz (App.jsx o Layout.jsx) | Modificar — integrar barra mobile | 6 |
| CSS global (index.css) | Modificar — agregar reglas mobile con excepción `.btn-compact` | 7 |

**Archivos que NO se modifican:**
- El componente Navbar desktop existente (solo se oculta en mobile)
- Ninguna ruta del router
- Ningún componente de página

---

## NOTAS PARA ITERACIÓN FUTURA

Una vez implementado esto y probado en el lab con guantes, los próximos
pasos de mobile-first serían:

1. **Reorganización del menú** — cuando quede claro con el uso real
   qué módulos se usan más desde mobile
2. **Componentes glove-friendly específicos** — formularios de inoculación,
   registro de observaciones, cambio de estado de batches
3. **Modo offline básico** — para zonas del lab sin señal
4. **Shortcut de voz** — dictado de observaciones (módulo IA)

---

*Prompt generado por Claude · FungiTrack · 07/07/2026*
*v2 (deep35) — incorpora observaciones de Deepseek: verificación de rutas
reales en Bloque 3, excepción de botones compactos en Bloque 7*
*Ejecutar con Antigravity bloque a bloque — confirmar build entre bloques*
