import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase';

export function useMediosDisponibles() {
  const [allMedios, setAllMedios] = useState([]);
  const [allSubfracciones, setAllSubfracciones] = useState([]);

  useEffect(() => {
    const unsubMedios = onSnapshot(collection(db, 'medios_preparados'), snap => {
      setAllMedios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSub = onSnapshot(collectionGroup(db, 'subfracciones'), snap => {
      setAllSubfracciones(snap.docs.map(d => ({
        id: d.id,
        medioId: d.ref.parent.parent?.id,
        ...d.data()
      })));
    });
    return () => { unsubMedios(); unsubSub(); };
  }, []);

  const opciones = useMemo(() => {
    const options = [];
    allMedios.forEach(m => {
      if (m.estado === 'Activo') {
        const bulkCant = m.stock_bulk?.cantidad_actual ?? m.cantidad_actual ?? 0;
        if (bulkCant > 0) {
          options.push({
            id: m.id,
            nombre: `${m.alias || ''} · ID: ${m.id} · ${m.nombre_receta} (Bulk) — ${bulkCant} ${m.stock_bulk?.unidad || 'ml'} disponibles`,
            type: 'bulk',
            medio: m,
            data: { medio: m }
          });
        }
      }
      const sfs = allSubfracciones.filter(s => s.medioId === m.id && s.disponible > 0);
      sfs.forEach(s => {
        options.push({
          id: s.id,
          nombre: `${m.alias || m.nombre_receta} → ${s.id_bolsa || s.id} — ${s.tipo_unidad || 'Unidad'} — ${s.disponible}/${s.cantidad} ${s.por_volumen ? 'ml' : 'disponibles'}${s.volumen_por_unidad_ml && s.volumen_por_unidad_ml !== 1 ? `— ${s.volumen_por_unidad_ml} ml/u` : ''}`,
          type: 'sub',
          medio: m,
          sub: s,
          data: { medio: m, sub: s }
        });
      });
    });
    return options;
  }, [allMedios, allSubfracciones]);

  return opciones;
}
