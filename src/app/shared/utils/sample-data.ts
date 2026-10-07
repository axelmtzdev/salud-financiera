import { MovementInput } from '../models/finance.models';
import { parseIsoDate, toIsoDate, todayIso } from './date.utils';

/** Genera ~6 meses de movimientos ficticios para explorar la app. */
export function generateSampleMovements(today = todayIso()): MovementInput[] {
  const t = parseIsoDate(today);
  const result: MovementInput[] = [];
  // Variación determinista para que la muestra sea reproducible
  const wobble = (i: number, spread: number) => Math.round(((Math.sin(i * 12.9898) + 1) / 2) * spread);

  for (let back = 5; back >= 0; back--) {
    const year = t.getFullYear();
    const month = t.getMonth() - back;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const maxDay = back === 0 ? t.getDate() : lastDay;
    const day = (d: number) => toIsoDate(new Date(year, month, Math.min(d, maxDay)));
    const add = (m: Omit<MovementInput, 'date'>, d: number) => {
      if (d <= maxDay) result.push({ ...m, date: day(d) });
    };

    add({ type: 'ingreso', category: 'Salario', amount: 32000, description: 'Nómina quincenal' }, 1);
    add({ type: 'ingreso', category: 'Salario', amount: 32000, description: 'Nómina quincenal' }, 15);
    if (back % 2 === 0) {
      add({ type: 'ingreso', category: 'Freelance/Honorarios', amount: 6500 + wobble(back, 3000), description: 'Proyecto de consultoría' }, 20);
    }
    add({ type: 'egreso', category: 'Vivienda', amount: 14500, description: 'Renta del departamento' }, 2);
    add({ type: 'egreso', category: 'Servicios', amount: 1450 + wobble(back + 1, 400), description: 'Luz, agua e internet' }, 5);
    add({ type: 'egreso', category: 'Alimentación', amount: 4200 + wobble(back + 2, 1500), description: 'Súper' }, 7);
    add({ type: 'egreso', category: 'Alimentación', amount: 3100 + wobble(back + 3, 1200), description: 'Súper y mercado' }, 21);
    add({ type: 'egreso', category: 'Transporte', amount: 2200 + wobble(back + 4, 900), description: 'Gasolina' }, 10);
    add({ type: 'egreso', category: 'Seguros', amount: 1800, description: 'Seguro de auto' }, 12);
    add({ type: 'egreso', category: 'Entretenimiento', amount: 1200 + wobble(back + 5, 2600), description: 'Cine y restaurantes' }, 18);
    add({ type: 'egreso', category: 'Ropa/Personal', amount: 900 + wobble(back + 6, 2400), description: 'Ropa' }, 24);
    add({ type: 'egreso', category: 'Deudas', amount: 3500, description: 'Pago tarjeta de crédito' }, 25);
    add({ type: 'egreso', category: 'Ahorros', amount: 5000, description: 'Transferencia a cuenta de ahorro' }, 16);
    if (back % 3 === 1) {
      add({ type: 'egreso', category: 'Salud', amount: 1300 + wobble(back + 7, 1000), description: 'Consulta médica' }, 14);
    }
    add({ type: 'egreso', category: 'Miscelánea', amount: 450 + wobble(back + 8, 700), description: 'Varios' }, 27);
  }
  return result;
}
