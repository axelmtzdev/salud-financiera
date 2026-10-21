import { Movement, MovementType, RecurringPayment } from '../models/finance.models';
import { sanitizeRecurring } from './data-integrity.utils';
import {
  currentOccurrence,
  detectRecurring,
  dueDateIn,
  dueDatesBetween,
  looksLikeSubscription,
  paymentKey,
  priceChange,
  recurringTotals,
  upcomingPayments,
} from './recurring.utils';

let seq = 0;
const mv = (category: string, amount: number, date: string, description: string, type: MovementType = 'egreso'): Movement => ({
  id: String(++seq),
  type,
  category,
  amount,
  date,
  description,
  createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
});

const rec = (over: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'r1',
  name: 'Netflix',
  category: 'Entretenimiento',
  amount: 249,
  frequency: 'mensual',
  day: 15,
  month: null,
  match: 'netflix',
  subscription: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const TODAY = '2026-03-20';

describe('recurring.utils', () => {
  describe('vencimientos', () => {
    it('ajusta el día al último del mes en meses cortos y respeta el mes de los anuales', () => {
      expect(dueDateIn(rec({ day: 31 }), '2026-02')).toBe('2026-02-28');
      expect(dueDateIn(rec({ frequency: 'anual', month: 3, day: 12 }), '2026-03')).toBe('2026-03-12');
      expect(dueDateIn(rec({ frequency: 'anual', month: 3, day: 12 }), '2026-04')).toBeNull();
    });

    it('lista los vencimientos dentro de un rango', () => {
      expect(dueDatesBetween(rec(), '2026-03-01', '2026-05-14')).toEqual(['2026-03-15', '2026-04-15']);
    });
  });

  describe('estado', () => {
    const netflix = rec();

    it('reconoce el pago por la descripción (también con el sufijo de tarjeta del atajo)', () => {
      const o = currentOccurrence(netflix, [mv('Entretenimiento', 249, '2026-03-14', 'NETFLIX · BBVA')], TODAY)!;
      expect(o.status).toBe('pagado');
      expect(o.due).toBe('2026-03-15');
    });

    it('marca vencido si pasó la fecha sin pago y pendiente si aún no llega', () => {
      expect(currentOccurrence(netflix, [], TODAY)?.status).toBe('vencido');
      expect(currentOccurrence(rec({ day: 28 }), [], TODAY)).toEqual(
        jasmine.objectContaining({ status: 'pendiente', due: '2026-03-28', daysLeft: 8 }),
      );
    });

    it('un pago fuera de la ventana de ±10 días no cuenta', () => {
      expect(currentOccurrence(netflix, [mv('Entretenimiento', 249, '2026-02-20', 'Netflix')], TODAY)?.status).toBe('vencido');
    });

    it('próximos pagos: vencidos primero y sin los ya pagados', () => {
      const list = [rec(), rec({ id: 'r2', name: 'Renta', match: 'renta', day: 25, amount: 12000 }), rec({ id: 'r3', name: 'Luz', match: 'luz', day: 2 })];
      const paid = [mv('Servicios', 300, '2026-04-02', 'Luz')];
      const upcoming = upcomingPayments(list, paid, TODAY, 30);
      expect(upcoming.map((o) => [o.payment.name, o.due, o.status])).toEqual([
        ['Netflix', '2026-03-15', 'vencido'],
        ['Renta', '2026-03-25', 'pendiente'],
        ['Netflix', '2026-04-15', 'pendiente'],
      ]);
    });
  });

  it('totales: compromiso mensual con anuales prorrateados, suscripciones y pendiente del mes', () => {
    const list = [
      rec({ amount: 300 }),
      rec({ id: 'r2', name: 'Renta', match: 'renta', amount: 12000, subscription: false, day: 25 }),
      rec({ id: 'r3', name: 'Prime', match: 'prime', amount: 1200, frequency: 'anual', month: 6, day: 1 }),
    ];
    const totals = recurringTotals(list, [mv('Entretenimiento', 300, '2026-03-15', 'Netflix')], TODAY);
    expect(totals.monthly).toBe(300 + 12000 + 100);
    expect(totals.subscriptionsMonthly).toBe(400);
    expect(totals.subscriptionsCount).toBe(2);
    expect(totals.pendingThisMonth).toBe(12000);
  });

  it('detecta un cambio de precio con el último cargo reconocido', () => {
    const change = priceChange(rec({ amount: 199 }), [mv('Entretenimiento', 249, '2026-03-15', 'Netflix')], TODAY);
    expect(change).toEqual(jasmine.objectContaining({ from: 199, to: 249 }));
    expect(priceChange(rec({ amount: 249 }), [mv('Entretenimiento', 250, '2026-03-15', 'Netflix')], TODAY)).toBeNull();
  });

  describe('detección', () => {
    const history: Movement[] = [];
    for (const month of ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']) {
      history.push(mv('Vivienda', 14500, `${month}-02`, 'Renta del departamento'));
      history.push(mv('Servicios', 1450 + (Number(month.slice(5)) % 4) * 80, `${month}-05`, 'Luz, agua e internet'));
      history.push(mv('Alimentación', 4000, `${month}-07`, 'Súper'));
      history.push(mv('Alimentación', 3000, `${month}-21`, 'Súper'));
      history.push(mv('Entretenimiento', 1000 + (Number(month.slice(5)) % 3) * 1500, `${month}-18`, 'Cine y restaurantes'));
    }
    history.push(mv('Entretenimiento', 249, '2026-02-14', 'Netflix · BBVA'));
    history.push(mv('Entretenimiento', 249, '2026-03-14', 'NETFLIX · BBVA'));
    history.push(mv('Ingreso', 30000, '2026-03-01', 'Nómina', 'ingreso'));

    it('encuentra pagos mensuales de monto parecido y descarta los frecuentes o variables', () => {
      const found = detectRecurring(history, [], [], TODAY);
      expect(found.map((d) => d.name)).toEqual(['Renta del departamento', 'Luz, agua e internet', 'Netflix']);
      expect(found[0]).toEqual(jasmine.objectContaining({ amount: 14500, day: 2, months: 6, subscription: false }));
      expect(found[2]).toEqual(jasmine.objectContaining({ key: 'netflix', months: 2, subscription: true }));
    });

    it('en categorías de gasto variable solo detecta montos prácticamente iguales', () => {
      const monthly = (category: string, description: string, amounts: number[]) =>
        amounts.map((amount, i) => mv(category, amount, `2026-0${i + 1}-10`, description));
      const found = detectRecurring(
        [
          ...monthly('Alimentación', 'Súper del mes', [4100, 4400, 4250]),
          ...monthly('Transporte', 'Gasolina', [2200, 2500, 2350]),
          ...monthly('Entretenimiento', 'Spotify', [129, 129, 129]),
          ...monthly('Servicios', 'Agua', [380, 450, 410]),
        ],
        [],
        [],
        TODAY,
      );
      expect(found.map((d) => d.name).sort()).toEqual(['Agua', 'Spotify']);
    });

    it('omite los ya registrados y los descartados', () => {
      const found = detectRecurring(history, [rec()], ['renta del departamento'], TODAY);
      expect(found.map((d) => d.name)).toEqual(['Luz, agua e internet']);
    });

    it('no sugiere pagos que dejaron de aparecer', () => {
      expect(detectRecurring(history, [], [], '2026-06-30').length).toBe(0);
    });
  });

  it('paymentKey y looksLikeSubscription', () => {
    expect(paymentKey('Spotify Premium · Nu')).toBe('spotify premium');
    expect(looksLikeSubscription('Spotify Premium', 'Servicios')).toBeTrue();
    expect(looksLikeSubscription('Renta', 'Vivienda')).toBeFalse();
  });

  it('sanitizeRecurring valida frecuencia, día y mes', () => {
    expect(sanitizeRecurring({ name: 'Netflix', category: 'Entretenimiento', amount: 249, frequency: 'mensual', day: 15 })).toEqual(
      jasmine.objectContaining({ match: 'netflix', month: null, subscription: false }),
    );
    expect(sanitizeRecurring({ name: 'Prime', category: 'X', amount: 1, frequency: 'anual', day: 1 })).toBeNull();
    expect(sanitizeRecurring({ name: 'X', category: 'X', amount: 1, frequency: 'semanal', day: 1 })).toBeNull();
    expect(sanitizeRecurring({ name: 'X', category: 'X', amount: 1, frequency: 'mensual', day: 40 })).toBeNull();
  });
});
