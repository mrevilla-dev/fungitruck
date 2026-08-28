/**
 * Funciones puras de dominio para matemática de volumen/agotamiento de medios.
 * Sin dependencias de React, Firestore ni side-effects.
 */

export function calcularDescuentoVolumen({ disponibleMl, descuentoMl, volU }) {
  if (typeof disponibleMl !== 'number' || typeof descuentoMl !== 'number' || typeof volU !== 'number') {
    return {
      nuevoDisponible: 0,
      sobranteMl: 0,
      agotada: false,
      unidadesRestantes: 0,
      valido: false,
      errorMsg: 'Parámetros inválidos: se esperan números',
    };
  }
  if (descuentoMl < 0) {
    return {
      nuevoDisponible: disponibleMl,
      sobranteMl: 0,
      agotada: false,
      unidadesRestantes: Math.floor(disponibleMl / (volU || 1)),
      valido: false,
      errorMsg: 'El descuento no puede ser negativo',
    };
  }
  if (descuentoMl > disponibleMl) {
    return {
      nuevoDisponible: disponibleMl,
      sobranteMl: 0,
      agotada: false,
      unidadesRestantes: Math.floor(disponibleMl / (volU || 1)),
      valido: false,
      errorMsg: `Descuento (${descuentoMl}) supera disponible (${disponibleMl})`,
    };
  }

  const nuevoDisponible = disponibleMl - descuentoMl;
  const agotada = nuevoDisponible <= 0;

  let unidadesRestantes = 0;
  let sobranteMl = 0;

  if (volU > 0) {
    unidadesRestantes = agotada ? 0 : Math.floor(nuevoDisponible / volU);
    sobranteMl = nuevoDisponible - (unidadesRestantes * volU);
  }

  return {
    nuevoDisponible: Math.max(0, nuevoDisponible),
    sobranteMl,
    agotada,
    unidadesRestantes,
    valido: true,
    errorMsg: null,
  };
}

export function evaluarAgotamiento({ nuevoDisponible, estadoActual }) {
  const debeAgotar = nuevoDisponible <= 0 && estadoActual !== 'Agotada';
  return {
    debeAgotar,
    fechaAgotamiento: debeAgotar ? new Date() : null,
  };
}

export function migrarFrascoAMl({ cantidad, volU, disponible }) {
  const cantidadNum = Number(cantidad) || 0;
  const volUNum = Number(volU) || 0;
  const disponibleNum = Number(disponible) || 0;

  if (volUNum <= 0) {
    return {
      cantidadMl: null,
      disponibleMl: null,
      flag: 'SIN_VOL_U',
    };
  }
  if (disponibleNum < 0) {
    return {
      cantidadMl: Math.round(cantidadNum * volUNum),
      disponibleMl: Math.round(disponibleNum * volUNum),
      flag: 'DISPO_NEGATIVO',
    };
  }
  return {
    cantidadMl: Math.round(cantidadNum * volUNum),
    disponibleMl: Math.round(disponibleNum * volUNum),
    flag: null,
  };
}

export function calcularDescuentoEvento({ cantidadPlacas, mlPorPlaca, padre }) {
  const placas = Math.max(1, Number(cantidadPlacas) || 1);
  const ml = Number(mlPorPlaca) || 0;
  const porVolumen = !!padre?.por_volumen;
  const esBulk = padre?.type === 'bulk';
  const volU = Number(padre?.volumen_por_unidad_ml) || (porVolumen ? 1 : 0);
  const disponible = Number(padre?.disponible ?? padre?.stock_bulk?.cantidad_actual ?? 0);
  const tipoUnidad = padre?.tipo_unidad || (porVolumen ? 'ml' : 'uds.');

  if (porVolumen || esBulk) {
    if (ml <= 0) {
      return {
        descuentoTotal: 0,
        unidad: 'ml',
        valido: false,
        errorMsg: 'mlPorPlaca requerido para medios por volumen/bulk',
      };
    }
    const descuentoTotal = placas * ml;
    if (descuentoTotal > disponible) {
      return {
        descuentoTotal,
        unidad: 'ml',
        valido: false,
        errorMsg: `Descuento ${descuentoTotal}ml supera disponible ${disponible}ml`,
      };
    }
    return {
      descuentoTotal,
      unidad: 'ml',
      valido: true,
      errorMsg: null,
    };
  }

  const descuentoTotal = placas;
  if (descuentoTotal > disponible) {
    return {
      descuentoTotal,
      unidad: tipoUnidad,
      valido: false,
      errorMsg: `Descuento ${descuentoTotal} supera disponible ${disponible}`,
    };
  }
  return {
    descuentoTotal,
    unidad: tipoUnidad,
    valido: true,
    errorMsg: null,
  };
}

export function calcularConsumoSubfraccion({ parentHasVolume, parentVolU, parentDisponible, qty, volHijo, childPorVolumen }) {
  const cantidadHijas = Math.max(0, Number(qty) || 0);

  if (parentHasVolume) {
    if (!childPorVolumen && (!volHijo || volHijo <= 0)) {
      return {
        descuentoPadre: 0,
        nuevoDisponiblePadre: parentDisponible,
        sobranteMl: 0,
        unidadesRestantes: 0,
        padreAgotado: false,
        valido: false,
        errorMsg: 'volHijo requerido cuando hijo no es por_volumen',
      };
    }
    const descuentoPadre = childPorVolumen ? cantidadHijas : cantidadHijas * (Number(volHijo) || 0);
    const r = calcularDescuentoVolumen({
      disponibleMl: parentDisponible,
      descuentoMl: descuentoPadre,
      volU: parentVolU,
    });
    return {
      descuentoPadre,
      nuevoDisponiblePadre: r.nuevoDisponible,
      sobranteMl: r.sobranteMl,
      unidadesRestantes: r.unidadesRestantes,
      padreAgotado: r.agotada,
      valido: r.valido,
      errorMsg: r.errorMsg,
    };
  }

  const descuentoPadre = cantidadHijas;
  if (descuentoPadre > parentDisponible) {
    return {
      descuentoPadre,
      nuevoDisponiblePadre: parentDisponible,
      sobranteMl: 0,
      unidadesRestantes: 0,
      padreAgotado: false,
      valido: false,
      errorMsg: `Descuento ${descuentoPadre} supera disponible ${parentDisponible}`,
    };
  }
  return {
    descuentoPadre,
    nuevoDisponiblePadre: parentDisponible - descuentoPadre,
    sobranteMl: 0,
    unidadesRestantes: parentDisponible - descuentoPadre,
    padreAgotado: parentDisponible - descuentoPadre <= 0,
    valido: true,
    errorMsg: null,
  };
}

export function calcularFraccionBulk({ cantidadActual, existentes }) {
  const yaFraccionado = (existentes || []).reduce((sum, b) => {
    const q = Number(b.cantidad) || 0;
    const v = Number(b.volumen_por_unidad_ml) || 1;
    return sum + (q * v);
  }, 0);
  return {
    disponibleBulk: Math.max(0, (Number(cantidadActual) || 0) - yaFraccionado),
    yaFraccionado,
  };
}

export function calcularRestauracionBulk({ cantidadActual, bagQty, bagVolU }) {
  const descuentoRestaurado = (Number(bagQty) || 0) * (Number(bagVolU) || 0);
  return {
    descuentoRestaurado,
    nuevoBulk: (Number(cantidadActual) || 0) + descuentoRestaurado,
  };
}

export function inferirMlIniciales(tipo_unidad) {
  if (!tipo_unidad) return null;
  const t = String(tipo_unidad).toLowerCase();
  if (t.includes('500ml') || t.includes('500 ml') || t === 'frasco 500ml') return 500;
  if (t.includes('100ml') || t.includes('100 ml') || t === 'frasco 100ml') return 100;
  if (t.includes('1l') || t.includes('1 l') || t === 'frasco 1l' || t === 'frasco 1000ml') return 1000;
  if (t.includes('250ml') || t.includes('250 ml')) return 250;
  if (t.includes('2000ml') || t.includes('2l') || t === 'frasco 2l') return 2000;
  return null;
}