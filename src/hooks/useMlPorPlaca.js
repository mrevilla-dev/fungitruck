import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_ML_POR_PLACA = 20;

export function useMlPorPlaca() {
  const [mlPorPlaca, setMlPorPlacaState] = useState(DEFAULT_ML_POR_PLACA);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'volumenes_placa'), snap => {
      const data = snap.data();
      if (data?.default) setMlPorPlacaState(Number(data.default) || DEFAULT_ML_POR_PLACA);
    });
    return unsub;
  }, []);

  const setMlPorPlaca = (value) => {
    const v = Number(value) || 0;
    setMlPorPlacaState(v);
    setDoc(doc(db, 'config', 'volumenes_placa'), { default: v }, { merge: true }).catch(() => {});
  };

  return [mlPorPlaca, setMlPorPlaca];
}