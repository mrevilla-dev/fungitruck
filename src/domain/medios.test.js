import { describe, it, expect } from 'vitest';
import {
  calcularDescuentoVolumen,
  evaluarAgotamiento,
  migrarFrascoAMl,
  calcularDescuentoEvento,
  calcularConsumoSubfraccion,
  calcularFraccionBulk,
  calcularRestauracionBulk,
  inferirMlIniciales,
} from './medios.js';

describe('calcularDescuentoVolumen', () => {
  it('frasco 500ml -60ml = 440ml no agotada', () => {
    const r = calcularDescuentoVolumen({ disponibleMl: 500, descuentoMl: 60, volU: 1 });
    expect(r.nuevoDisponible).toBe(440);
    expect(r.agotada).toBe(false);
    expect(r.sobranteMl).toBe(0);
    expect(r.unidadesRestantes).toBe(440);
    expect(r.valido).toBe(true);
  });

  it('frasco 440ml -60ml = 380ml', () => {
    const r = calcularDescuentoVolumen({ disponibleMl: 440, descuentoMl: 60, volU: 1 });
    expect(r.nuevoDisponible).toBe(380);
    expect(r.valido).toBe(true);
  });

  it('padre vol/u=25 con 440ml -> 17 uds + 15ml sobrante', () => {
    const r = calcularDescuentoVolumen({ disponibleMl: 440, descuentoMl: 0, volU: 25 });
    expect(r.unidadesRestantes).toBe(17);
    expect(r.sobranteMl).toBe(15);
    expect(r.valido).toBe(true);
  });

  it('descuento exacto a 0 -> agotada=true', () => {
    const r = calcularDescuentoVolumen({ disponibleMl: 60, descuentoMl: 60, volU: 1 });
    expect(r.nuevoDisponible).toBe(0);
    expect(r.agotada).toBe(true);
    expect(r.valido).toBe(true);
    const a = evaluarAgotamiento({ nuevoDisponible: 0, estadoActual: 'Disponible' });
    expect(a.debeAgotar).toBe(true);
    expect(a.fechaAgotamiento).toBeInstanceOf(Date);
  });

  it('sobre-consumo bloquea con errorMsg', () => {
    const r = calcularDescuentoVolumen({ disponibleMl: 50, descuentoMl: 60, volU: 1 });
    expect(r.valido).toBe(false);
    expect(r.errorMsg).toContain('supera disponible');
  });
});

describe('migrarFrascoAMl', () => {
  it('migración 1x500 -> 500ml', () => {
    const r = migrarFrascoAMl({ cantidad: 1, volU: 500, disponible: 1 });
    expect(r.cantidadMl).toBe(500);
    expect(r.disponibleMl).toBe(500);
    expect(r.flag).toBeNull();
  });

  it('migración 0x500 -> 0ml', () => {
    const r = migrarFrascoAMl({ cantidad: 0, volU: 500, disponible: 0 });
    expect(r.cantidadMl).toBe(0);
    expect(r.disponibleMl).toBe(0);
  });

  it('migración sin volU -> flag SIN_VOL_U', () => {
    const r = migrarFrascoAMl({ cantidad: 1, volU: 0, disponible: 1 });
    expect(r.flag).toBe('SIN_VOL_U');
  });

  it('migración disponible negativo -> flag DISPO_NEGATIVO', () => {
    const r = migrarFrascoAMl({ cantidad: 1, volU: 500, disponible: -1 });
    expect(r.flag).toBe('DISPO_NEGATIVO');
  });
});

describe('calcularDescuentoEvento', () => {
  it('evento 20 placas x 15ml = 300ml (por_volumen)', () => {
    const r = calcularDescuentoEvento({
      cantidadPlacas: 20,
      mlPorPlaca: 15,
      padre: { por_volumen: true, volU: 1, disponible: 500, tipo_unidad: 'Frasco' },
    });
    expect(r.descuentoTotal).toBe(300);
    expect(r.unidad).toBe('ml');
    expect(r.valido).toBe(true);
  });

  it('evento 20 placas x 20ml = 400ml (por_volumen, mlPorPlaca obligatorio)', () => {
    const r = calcularDescuentoEvento({
      cantidadPlacas: 20,
      mlPorPlaca: 20,
      padre: { por_volumen: true, volU: 1, disponible: 500, tipo_unidad: 'Frasco' },
    });
    expect(r.descuentoTotal).toBe(400);
    expect(r.unidad).toBe('ml');
    expect(r.valido).toBe(true);
  });

  it('evento bulk mlPorPlaca obligatorio', () => {
    const r = calcularDescuentoEvento({
      cantidadPlacas: 5,
      mlPorPlaca: 0,
      padre: { type: 'bulk', volU: 1, disponible: 1000, tipo_unidad: 'Bulk' },
    });
    expect(r.valido).toBe(false);
    expect(r.errorMsg).toContain('mlPorPlaca requerido');
  });

  it('evento unidades (sin por_volumen) -> descuento en unidades', () => {
    const r = calcularDescuentoEvento({
      cantidadPlacas: 3,
      mlPorPlaca: 0,
      padre: { por_volumen: false, disponible: 10, tipo_unidad: 'Placa' },
    });
    expect(r.descuentoTotal).toBe(3);
    expect(r.unidad).toBe('Placa');
    expect(r.valido).toBe(true);
  });

  it('sobre-consumo evento -> errorMsg', () => {
    const r = calcularDescuentoEvento({
      cantidadPlacas: 10,
      mlPorPlaca: 20,
      padre: { por_volumen: true, volU: 1, disponible: 150, tipo_unidad: 'Frasco' },
    });
    expect(r.valido).toBe(false);
    expect(r.errorMsg).toContain('supera disponible');
  });
});

describe('calcularConsumoSubfraccion', () => {
  it('AddSubBagModal: padre 100ml vol/u=10, hijo por_volumen 15ml total -> descuento 15ml', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: true,
      parentVolU: 10,
      parentDisponible: 100,
      qty: 15, // total ml a crear (childPorVolumen=true)
      volHijo: 5,
      childPorVolumen: true,
    });
    expect(r.descuentoPadre).toBe(15);
    expect(r.nuevoDisponiblePadre).toBe(85);
    expect(r.sobranteMl).toBe(5); // 85ml = 8 uds * 10 + 5ml sobrante
    expect(r.unidadesRestantes).toBe(8);
    expect(r.padreAgotado).toBe(false);
    expect(r.errorMsg).toBeNull();
  });

  it('AddSubBagModal: padre 100ml vol/u=10, 3 hijas NO por_volumen 5ml c/u -> descuento 15ml', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: true,
      parentVolU: 10,
      parentDisponible: 100,
      qty: 3, // 3 unidades
      volHijo: 5, // 5ml c/u
      childPorVolumen: false,
    });
    expect(r.descuentoPadre).toBe(15);
    expect(r.nuevoDisponiblePadre).toBe(85);
  });

  it('padre por_volumen, hijo NO por_volumen sin volHijo -> errorMsg', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: true,
      parentVolU: 10,
      parentDisponible: 100,
      qty: 3,
      volHijo: 0,
      childPorVolumen: false,
    });
    expect(r.errorMsg).toContain('volHijo requerido');
  });

  it('padre unidades -> descuento en unidades', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: false,
      parentVolU: 0,
      parentDisponible: 20,
      qty: 5,
      volHijo: 0,
      childPorVolumen: false,
    });
    expect(r.descuentoPadre).toBe(5);
    expect(r.nuevoDisponiblePadre).toBe(15);
    expect(r.padreAgotado).toBe(false);
  });

  it('REG-AddSubBagModal: padre 380ml vol/u=1, hijo NO por_volumen 10 uds x4ml -> valido, descuento 40ml', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: true,
      parentVolU: 1,
      parentDisponible: 380,
      qty: 10,
      volHijo: 4,
      childPorVolumen: false,
    });
    expect(r.valido).toBe(true);
    expect(r.descuentoPadre).toBe(40);
    expect(r.nuevoDisponiblePadre).toBe(340);
    expect(r.errorMsg).toBeNull();
  });

  it('REG-AddSubBagModal: mismo padre 400 uds x4ml=1600ml supera 380 -> valido:false errorMsg no vacío', () => {
    const r = calcularConsumoSubfraccion({
      parentHasVolume: true,
      parentVolU: 1,
      parentDisponible: 380,
      qty: 400,
      volHijo: 4,
      childPorVolumen: false,
    });
    expect(r.valido).toBe(false);
    expect(r.errorMsg).toBeTruthy();
    expect(r.errorMsg).toContain('supera disponible');
  });
});

describe('calcularFraccionBulk', () => {
  it('calcula disponible restando qty*volU de existentes', () => {
    const r = calcularFraccionBulk({
      cantidadActual: 1000,
      existentes: [
        { cantidad: 10, volumen_por_unidad_ml: 20 },
        { cantidad: 5, volumen_por_unidad_ml: 10 },
      ],
    });
    expect(r.yaFraccionado).toBe(250);
    expect(r.disponibleBulk).toBe(750);
  });
});

describe('calcularRestauracionBulk', () => {
  it('handleDeleteBag restaura qty*volU al bulk', () => {
    const r = calcularRestauracionBulk({ cantidadActual: 1000, bagQty: 5, bagVolU: 20 });
    expect(r.descuentoRestaurado).toBe(100);
    expect(r.nuevoBulk).toBe(1100);
  });
});

describe('inferirMlIniciales', () => {
  it('Frasco 500ml -> 500', () => expect(inferirMlIniciales('Frasco 500ml')).toBe(500));
  it('Frasco 100ml -> 100', () => expect(inferirMlIniciales('Frasco 100ml')).toBe(100));
  it('Frasco 1L -> 1000', () => expect(inferirMlIniciales('Frasco 1L')).toBe(1000));
  it('Frasco 250ml -> 250', () => expect(inferirMlIniciales('Frasco 250ml')).toBe(250));
  it('desconocido -> null', () => expect(inferirMlIniciales('Bolsa rara')).toBeNull());
});