import { Budget, Movement, MovementType } from '../models/finance.models';
import { sanitizeBudgets } from './data-integrity.utils';
import { budgetLevel, budgetLineFor, budgetOverview, suggestBudgets } from './budget.utils';

let seq = 0;
const mv = (type: MovementType, category: string, amount: number, date: string): Movement => ({
  id: String(++seq),
  type,
  category,
  amount,
  date,
  description: '',
  createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
});

const TODAY = '2026-03-10'; // día 10 de 31
const budgets: Budget[] = [
  { category: 'Alimentación', amount: 5000 },
  { category: 'Transporte', amount: 1000 },
  { category: 'Entretenimiento', amount: 2000 },
];
const movements = [
  mv('egreso', 'Alimentación', 1800, '2026-03-02'),
  mv('egreso', 'alimentacion', 200, '2026-03-05'),
  mv('egreso', 'Transporte', 1200, '2026-03-08'),
  mv('egreso', 'Entretenimiento', 1700, '2026-03-09'),
  mv('egreso', 'Vivienda', 12000, '2026-03-01'),
  mv('ingreso', 'Salario', 30000, '2026-03-01'),
  mv('egreso', 'Alimentación', 9000, '2026-02-15'),
];

describe('budget.utils', () => {
  it('clasifica el nivel: en rango, cerca del límite y excedido', () => {
    expect(budgetLevel(0.5)).toBe('ok');
    expect(budgetLevel(0.8)).toBe('warning');
    expect(budgetLevel(1)).toBe('warning');
    expect(budgetLevel(1.01)).toBe('over');
  });

  describe('budgetOverview', () => {
    const overview = budgetOverview(budgets, movements, '2026-03', TODAY);

    it('suma solo los egresos del mes por categoría y ordena por lo más comprometido', () => {
      expect(overview.lines.map((l) => [l.category, l.spent, l.level])).toEqual([
        ['Transporte', 1200, 'over'],
        ['Entretenimiento', 1700, 'warning'],
        ['Alimentación', 2000, 'ok'],
      ]);
      expect(overview.lines[0].remaining).toBe(-200);
    });

    it('calcula totales y el gasto fuera de presupuesto (las variantes del nombre cuentan en su categoría)', () => {
      expect(overview.totalLimit).toBe(8000);
      expect(overview.totalSpent).toBe(4900);
      expect(overview.totalRemaining).toBe(3100);
      expect(overview.unbudgeted.map((s) => s.category)).toEqual(['Vivienda']);
      expect(overview.unbudgetedTotal).toBe(12000);
    });

    it('proyecta con lo que normalmente se gasta después de este día del mes', () => {
      expect(overview.day).toBe(10);
      // En febrero se gastaron 9,000 en Alimentación el día 15 (después del día 10)
      const food = overview.lines.find((l) => l.category === 'Alimentación')!;
      expect(food.projected).toBe(2000 + 9000);
    });

    it('un pago fijo que ya se hizo no se proyecta como si siguiera creciendo', () => {
      const rent = [
        mv('egreso', 'Vivienda', 12000, '2026-01-02'),
        mv('egreso', 'Vivienda', 12000, '2026-02-02'),
        mv('egreso', 'Vivienda', 12000, '2026-03-02'),
      ];
      const line = budgetOverview([{ category: 'Vivienda', amount: 12000 }], rent, '2026-03', TODAY).lines[0];
      expect(line.projected).toBe(12000);
    });

    it('sin historial proyecta en línea recta solo si el gasto ya está repartido en varios movimientos', () => {
      const one = budgetOverview([{ category: 'Ocio', amount: 1000 }], [mv('egreso', 'Ocio', 300, '2026-03-05')], '2026-03', TODAY);
      expect(one.lines[0].projected).toBeNull();
      const several = [
        mv('egreso', 'Ocio', 100, '2026-03-02'),
        mv('egreso', 'Ocio', 100, '2026-03-05'),
        mv('egreso', 'Ocio', 100, '2026-03-09'),
      ];
      const spread = budgetOverview([{ category: 'Ocio', amount: 1000 }], several, '2026-03', TODAY);
      expect(spread.lines[0].projected).toBe(Math.round((300 / (10 / 31)) * 100) / 100);
    });

    it('en meses cerrados no proyecta y en meses futuros no hay avance', () => {
      const closed = budgetOverview(budgets, movements, '2026-02', TODAY);
      expect(closed.elapsed).toBe(1);
      expect(closed.lines.every((l) => l.projected === null)).toBeTrue();
      expect(closed.lines.find((l) => l.category === 'Alimentación')?.level).toBe('over');
      expect(budgetOverview(budgets, movements, '2026-04', TODAY).elapsed).toBe(0);
    });

    it('no proyecta al inicio del mes', () => {
      const early = budgetOverview(budgets, movements, '2026-03', '2026-03-03');
      expect(early.lines.every((l) => l.projected === null)).toBeTrue();
    });
  });

  it('budgetLineFor busca la categoría sin distinguir acentos', () => {
    expect(budgetLineFor(budgets, movements, 'TRANSPORTE', '2026-03', TODAY)?.spent).toBe(1200);
    expect(budgetLineFor(budgets, movements, 'Vivienda', '2026-03', TODAY)).toBeNull();
  });

  describe('suggestBudgets', () => {
    const history = [
      mv('egreso', 'Alimentación', 4100, '2026-01-10'),
      mv('egreso', 'Alimentación', 4500, '2026-02-10'),
      mv('egreso', 'Transporte', 900, '2026-02-12'),
      mv('egreso', 'Ahorros', 5000, '2026-02-15'),
      mv('egreso', 'Ocio', 9999, '2026-03-05'), // mes en curso: no cuenta
    ];

    it('promedia los meses cerrados con datos y redondea a centenas hacia arriba', () => {
      const result = suggestBudgets([], history, TODAY);
      expect(result).toEqual([
        { category: 'Alimentación', average: 4300, amount: 4300 },
        { category: 'Transporte', average: 450, amount: 500 },
      ]);
    });

    it('omite las categorías que ya tienen presupuesto', () => {
      const result = suggestBudgets([{ category: 'alimentacion', amount: 1 }], history, TODAY);
      expect(result.map((s) => s.category)).toEqual(['Transporte']);
    });

    it('sin historial no sugiere nada', () => {
      expect(suggestBudgets([], [], TODAY)).toEqual([]);
    });
  });

  it('sanitizeBudgets descarta montos inválidos y duplicados', () => {
    expect(
      sanitizeBudgets([
        { category: 'Alimentación', amount: 5000.555 },
        { category: 'alimentacion', amount: 10 },
        { category: 'Transporte', amount: -1 },
        { category: '', amount: 100 },
        'basura',
      ]),
    ).toEqual([{ category: 'Alimentación', amount: 5000.56 }]);
    expect(sanitizeBudgets(undefined)).toEqual([]);
  });
});
