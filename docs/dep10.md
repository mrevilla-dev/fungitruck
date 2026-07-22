Estábamos implementando el plan `dep9.md` (te lo pego abajo). 
Ya completamos el Bloque 1 con éxito. 
Te dejo el reporte de lo que se hizo y una mini-tarea de ajuste antes de seguir con el Bloque 2.

---

## Reporte Bloque 1 (completado)
- Se modificó `SubfraccionamientoAccordion.jsx`:
  - Se agregó "Unidad independiente" al selector de tipo de envase.
  - Se implementó generación de múltiples subfracciones cuando se elige "Unidad independiente" (una por cada unidad, con IDs secuenciales).
  - Se guardan los nuevos tipos de envase ("Otro") en `config/tipos_envase` en Firestore, de forma global.
- Maxi aprobó el funcionamiento, pero detectó un detalle:

## Ajuste solicitado por Maxi (antes del Bloque 2)
Cuando se elige "Unidad independiente" y se generan N subfracciones, **todas reciben la misma ubicación**. Maxi necesita que cada unidad independiente pueda tener su propia ubicación.

### Mini-prompt (Ajuste sobre Bloque 1)
1. En el `AddBagModal`, si se selecciona "Unidad independiente", mostrar un aviso: "Cada unidad puede tener una ubicación distinta."
2. Antes de ejecutar el `writeBatch`, mostrar un panel donde cada unidad (Frasco 1, Frasco 2, …) tenga su propio selector de ubicación, usando las ubicaciones dinámicas ya existentes.
3. Si una unidad no tiene ubicación asignada, usar la ubicación general del formulario como fallback.
4. La generación atómica en `writeBatch` debe usar la ubicación específica de cada unidad.
5. No modificar: generación de IDs, persistencia de "Otro", contadores globales, ni otras funciones.

**Implementá solo este ajuste, deployá y confirmame. Después avanzamos al Bloque 2.**

---

Abajo te dejo el plan completo `dep9.md`.