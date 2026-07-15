# FungiTrack — Corrección de transacción Firestore y concurrencia
## Módulo: Medios Preparados → Descuento de insumos
> Mayo 2026

---

## CONTEXTO INMEDIATO

Al implementar el descuento automático de insumos en `NuevoMedioModal.jsx`
apareció el siguiente error de Firestore:

> `firestore transactions require all reads to be executed before all writes`

Esto ocurre porque dentro de `runTransaction` se está haciendo una lectura
(`transaction.get()`) después de haber ejecutado una escritura (`transaction.update()`).
Firestore **obliga** a realizar todas las lecturas antes que cualquier escritura.

Además, el sistema pronto será utilizado por múltiples operarios en simultáneo
desde dispositivos móviles y de escritorio. Es obligatorio preparar todas las
operaciones de inventario para que sean atómicas y consistentes.

---

## REGLAS DE ORO (NO NEGOCIABLES)

1. **No romper lo que ya funciona.** Solo corregir el orden de operaciones.
2. **Un solo cambio a la vez.** Deployar a Firebase Hosting y esperar confirmación.
3. **Cambios aditivos.** No eliminar lógica existente, solo reorganizar.
4. **Atomicidad obligatoria:** toda modificación de inventario (stock, mermas,
   subfracciones, cambios de estado) DEBE usar `runTransaction`, no `writeBatch` solo.
5. **Orden estricto dentro de la transacción:**
   - PRIMERO: todos los `transaction.get()` necesarios.
   - DESPUÉS: todos los cálculos de nuevos valores.
   - POR ÚLTIMO: todos los `transaction.update()` y `transaction.set()`.
6. **Defensive programming:** `campo?.subcampo ?? fallback` siempre.

---

## COMPORTAMIENTO ESPERADO

Al confirmar la preparación de un medio, el sistema debe:

1. Leer todos los documentos necesarios (medio, receta, lotes de insumos,
   stock general) dentro de una única `runTransaction`.
2. Calcular los nuevos valores de stock a partir de los datos leídos.
3. Aplicar todas las escrituras juntas al final de la transacción.
4. Si ocurre cualquier error, la transacción se revierte automáticamente
   sin modificar ningún dato.

---

## CORRECCIÓN TÉCNICA EXACTA

### Archivo a modificar
`src/components/NuevoMedioModal.jsx` (o el componente donde se ejecuta
la lógica de descuento al crear un medio preparado).

### Patrón correcto a implementar

```javascript
await runTransaction(db, async (transaction) => {
  // ============================================
  // FASE 1: LECTURAS (todas juntas al principio)
  // ============================================
  
  // Leer el medio que se está creando (si ya existe)
  const medioRef = doc(collection(db, 'medios_preparados'), nuevoMedioId);
  const medioSnap = await transaction.get(medioRef);
  
  // Leer la receta
  const recetaRef = doc(db, 'recetas', recetaId);
  const recetaSnap = await transaction.get(recetaRef);
  
  // Leer todos los lotes de insumos necesarios
  const ingredientes = recetaSnap.data().ingredientes;
  const lotesSnaps = await Promise.all(
    ingredientes.map(async (ing) => {
      const lotesQuery = query(
        collection(db, 'insumos_lotes'),
        where('insumoId', '==', ing.insumoId),
        where('cantidad_base_actual', '>', 0),
        orderBy('cantidad_base_actual', 'desc'),
        orderBy('fecha_ingreso', 'asc')
      );
      const snapshot = await transaction.get(lotesQuery);
      return { insumoId: ing.insumoId, lotes: snapshot.docs };
    })
  );
  
  // Leer stock general de cada insumo (por si no hay lotes)
  const insumosBaseRefs = ingredientes.map(ing => 
    doc(db, 'insumos_base', ing.insumoId)
  );
  const insumosBaseSnaps = await Promise.all(
    insumosBaseRefs.map(ref => transaction.get(ref))
  );

  // ============================================
  // FASE 2: CÁLCULOS (solo con datos ya leídos)
  // ============================================
  
  const advertenciasStock = [];
  const operaciones = []; // guardar { ref, cantidadADescontar, tipo }
  
  for (const ing of ingredientes) {
    const cantidadRequerida = ing.cantidad; // ajustar según volumen real
    
    // Buscar lotes disponibles para este insumo
    const lotesDisponibles = lotesSnaps
      .find(l => l.insumoId === ing.insumoId)?.lotes || [];
    
    let cantidadRestante = cantidadRequerida;
    
    if (lotesDisponibles.length > 0) {
      // Descontar de lotes (FIFO)
      for (const loteDoc of lotesDisponibles) {
        if (cantidadRestante <= 0) break;
        const stockLote = loteDoc.data().cantidad_base_actual;
        const aDescontar = Math.min(cantidadRestante, stockLote);
        operaciones.push({
          ref: loteDoc.ref,
          cantidad: aDescontar,
          tipo: 'lote'
        });
        cantidadRestante -= aDescontar;
      }
    }
    
    // Si todavía falta, descontar del stock general
    if (cantidadRestante > 0) {
      const insumoBaseSnap = insumosBaseSnaps.find(
        snap => snap.id === ing.insumoId
      );
      const stockGeneral = insumoBaseSnap?.data()?.stock_total_base || 0;
      
      if (stockGeneral < cantidadRestante) {
        advertenciasStock.push({
          insumoId: ing.insumoId,
          nombre: ing.nombre,
          disponible: stockGeneral,
          requerido: cantidadRestante
        });
      }
      
      operaciones.push({
        ref: insumoBaseSnap.ref,
        cantidad: cantidadRestante,
        tipo: 'general'
      });
    }
  }

  // Si hay advertencias, mostrar confirmación ANTES de la transacción
  // (esto se maneja en el frontend con window.confirm antes de llamar a runTransaction)
  
  // ============================================
  // FASE 3: ESCRITURAS (todas juntas al final)
  // ============================================
  
  // Crear el medio preparado
  transaction.set(medioRef, datosMedio);
  
  // Aplicar descuentos
  for (const op of operaciones) {
    transaction.update(op.ref, {
      [op.tipo === 'lote' ? 'cantidad_base_actual' : 'stock_total_base']: 
        increment(-op.cantidad)
    });
    
    // Crear registro de auditoría para cada descuento
    const auditoriaRef = doc(
      collection(db, 'insumos_base', op.ref.id, 'auditorias')
    );
    transaction.set(auditoriaRef, {
      tipo: 'Consumo Automático',
      cantidad: -op.cantidad,
      medioId: nuevoMedioId,
      fecha: serverTimestamp(),
      operario: usuarioActual
    });
  }
});