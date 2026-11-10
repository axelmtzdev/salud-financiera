import { AccountKind, Goal, GoalContribution, Movement, MovementType, RecurringPayment } from '../models/finance.models';
import { sanitizeContribution, sanitizeGoal, sanitizePlanned } from './data-integrity.utils';
import { goalProgress, reservedByAccount } from './goals.utils';
import { projectBalance, projectionBasis } from './projection.utils';

let seq = 0;
const mv = (type: MovementType, amount: number, date: string, description = ''): Movement => ({
  id: String(++seq),
  type,
  category: 'X',
  amount,
  date,
  description,
  account: 'banco',
  createdAt: '2026-01-01T00:00:00.000Z',
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'iPhone',
  target: 24000,
  targetDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  ...over,
});
const abono = (amount: number, account: AccountKind = 'banco', goalId = 'g1'): GoalContribution => ({
  id: String(++seq),
  goalId,
  account,
  amount,
  date: '2026-03-01',
  createdAt: '2026-03-01T00:00:00.000Z',
});
const renta: RecurringPayment = {
  id: 'r1',
  name: 'Renta',
  category: 'Vivienda',
  amount: 10000,
  frequency: 'mensual',
  day: 2,
  month: null,
  match: 'renta',
  subscription: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const TODAY = '2026-04-10';
// Enero sin movimientos; febrero y marzo cerrados; abril en curso
const movements = [
  mv('ingreso', 30000, '2026-02-01'),
  mv('egreso', 10000, '2026-02-02', 'Renta'),
  mv('egreso', 8000, '2026-02-15', 'Súper'),
  mv('ingreso', 30000, '2026-03-01'),
  mv('egreso', 10000, '2026-03-02', 'Renta'),
  mv('egreso', 12000, '2026-03-15', 'Súper'),
  mv('ingreso', 30000, '2026-04-01'),
  mv('egreso', 4000, '2026-04-05', 'Súper'),
];

describe('goals.utils', () => {
  it('progreso, faltante y ahorro mensual sugerido hasta la fecha objetivo', () => {
    const p = goalProgress(goal({ targetDate: '2026-06-30' }), [abono(6000), abono(2000, 'efectivo')], TODAY);
    expect(p.saved).toBe(8000);
    expect(p.remaining).toBe(16000);
    expect(p.percent).toBeCloseTo(33.33, 1);
    expect(p.byAccount).toEqual({ efectivo: 2000, banco: 6000 });
    expect(p.monthsLeft).toBe(3); // abril, mayo y junio
    expect(p.monthly).toBe(5333.33);
    expect(p.status).toBe('en-curso');
  });

  it('estados: alcanzada, vencida, completada y sin fecha', () => {
    expect(goalProgress(goal(), [abono(24000)], TODAY).status).toBe('alcanzada');
    const vencida = goalProgress(goal({ targetDate: '2026-03-31' }), [abono(4000)], TODAY);
    expect([vencida.status, vencida.monthly]).toEqual(['vencida', 20000]);
    expect(goalProgress(goal({ completedAt: '2026-04-01T00:00:00.000Z' }), [], TODAY).status).toBe('completada');
    expect(goalProgress(goal(), [], TODAY).monthly).toBeNull();
  });

  it('lo apartado cuenta retiros y solo metas activas', () => {
    const goals = [goal(), goal({ id: 'g2', completedAt: '2026-04-01T00:00:00.000Z' })];
    expect(reservedByAccount(goals, [abono(5000), abono(-1000), abono(700, 'efectivo'), abono(9999, 'banco', 'g2')])).toEqual({ efectivo: 700, banco: 4000 });
  });
});

describe('projection.utils', () => {
  it('promedia los meses cerrados con datos y excluye los pagos recurrentes del gasto variable', () => {
    expect(projectionBasis(movements, [renta], TODAY)).toEqual({ avgIncome: 30000, avgVariable: 10000, months: ['2026-02', '2026-03'] });
  });

  it('proyecta el saldo libre: del mes en curso solo lo que falta', () => {
    const projection = projectBalance({
      today: TODAY,
      start: 5000,
      horizon: 3,
      movements,
      recurring: [renta],
      planned: [
        { id: 'p1', description: 'Vacaciones', category: 'Entretenimiento', amount: 15000, date: '2026-05-20', createdAt: '' },
        { id: 'p0', description: 'Ya pasó', category: 'X', amount: 999, date: '2026-04-01', createdAt: '' },
      ],
      goals: [goal({ targetDate: '2026-05-31' })],
      contributions: [abono(4000)],
    });
    const [abril, mayo, junio] = projection.months;
    // Abril: el ingreso ya llegó (0), faltan 6,000 de variable, la renta del 2 no se ha pagado y la meta pide 10,000
    expect(abril).toEqual(jasmine.objectContaining({ income: 0, variable: 6000, recurring: 10000, planned: 0, goals: 10000, net: -26000, balance: -21000 }));
    expect(mayo).toEqual(jasmine.objectContaining({ income: 30000, variable: 10000, recurring: 10000, planned: 15000, goals: 10000, balance: -36000 }));
    expect(junio).toEqual(jasmine.objectContaining({ goals: 0, net: 10000, balance: -26000 }));
    expect(projection.firstNegative?.key).toBe('2026-04');
    expect(projection.lowest?.key).toBe('2026-05');
  });

  it('valida metas, abonos y gastos planeados', () => {
    expect(sanitizeGoal({ name: ' iPhone  16 ', target: 24000.005, targetDate: 'pronto' })).toEqual(
      jasmine.objectContaining({ name: 'iPhone 16', target: 24000.01, targetDate: null, completedAt: null }),
    );
    expect(sanitizeGoal({ name: 'X', target: 0 })).toBeNull();
    expect(sanitizeContribution({ goalId: 'g1', account: 'banco', amount: -500, date: '2026-04-01' })?.amount).toBe(-500);
    expect(sanitizeContribution({ goalId: 'g1', account: 'banco', amount: 0, date: '2026-04-01' })).toBeNull();
    expect(sanitizePlanned({ description: 'Tenencia', category: 'Transporte', amount: 1500, date: '2026-01-31' })?.amount).toBe(1500);
    expect(sanitizePlanned({ description: '', category: 'X', amount: 1, date: '2026-01-31' })).toBeNull();
  });
});
