import { Movement, MovementType } from '../models/finance.models';
import { buildInsights, byCategory, monthlySeries, sortMovements, summarize, toSlices } from './analytics.utils';

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

describe('analytics.utils', () => {
  it('resume ingresos, egresos, saldo y tasa de ahorro', () => {
    const s = summarize([mv('ingreso', 'Salario', 1000, '2026-03-01'), mv('egreso', 'Vivienda', 300.1, '2026-03-02')]);
    expect(s).toEqual({ income: 1000, expense: 300.1, net: 699.9, savingsRate: 0.6999, count: 2 });
    expect(summarize([]).savingsRate).toBeNull();
  });

  it('agrupa por categoría ordenando de mayor a menor', () => {
    const stats = byCategory(
      [mv('egreso', 'A', 100, '2026-03-01'), mv('egreso', 'B', 300, '2026-03-01'), mv('egreso', 'A', 100, '2026-03-02')],
      'egreso',
    );
    expect(stats.map((s) => [s.category, s.total, s.count])).toEqual([
      ['B', 300, 1],
      ['A', 200, 2],
    ]);
    expect(stats[0].percent).toBe(60);
  });

  it('ordena por fecha descendente y luego por captura', () => {
    const a = mv('egreso', 'A', 1, '2026-03-01');
    const b = mv('egreso', 'A', 1, '2026-03-05');
    const c = mv('egreso', 'A', 1, '2026-03-05');
    expect(sortMovements([a, b, c]).map((m) => m.id)).toEqual([c.id, b.id, a.id]);
  });

  it('genera 6 meses consecutivos con ceros donde no hay datos', () => {
    const series = monthlySeries([mv('ingreso', 'Salario', 500, '2026-01-10')], '2026-03-20', 6);
    expect(series.map((p) => p.key)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(series[3].income).toBe(500);
    expect(series[0].net).toBe(0);
  });

  it('agrupa en "Otras" las categorías sin color propio', () => {
    const slices = toSlices(
      [
        { category: 'A', total: 10, percent: 50, count: 1 },
        { category: 'B', total: 6, percent: 30, count: 1 },
        { category: 'C', total: 4, percent: 20, count: 1 },
      ],
      new Map([['A', '#111111']]),
    );
    expect(slices.map((s) => s.label)).toEqual(['A', 'Otras']);
    expect(slices[1].value).toBe(10);
  });

  describe('buildInsights', () => {
    const range = { from: '2026-03-01', to: '2026-03-31' };
    const ids = (movements: Movement[]) => buildInsights(movements, range, '2026-03-20').map((i) => i.id);

    it('alerta cuando el gasto supera el 80% del ingreso y sugiere ahorrar', () => {
      const result = ids([
        mv('ingreso', 'Salario', 1000, '2026-03-01'),
        mv('egreso', 'Entretenimiento', 950, '2026-03-02'),
      ]);
      expect(result).toContain('high-spending');
      expect(result).toContain('no-savings');
      expect(result).toContain('top-category');
      expect(result).toContain('projection');
    });

    it('felicita cuando el ahorro es de al menos 20%', () => {
      const result = ids([mv('ingreso', 'Salario', 1000, '2026-03-01'), mv('egreso', 'Vivienda', 100, '2026-03-02')]);
      expect(result).toContain('good-savings');
      expect(result).not.toContain('high-spending');
    });

    it('compara con el mes anterior por categoría', () => {
      const insights = buildInsights(
        [
          mv('ingreso', 'Salario', 10000, '2026-03-01'),
          mv('egreso', 'Transporte', 100, '2026-02-10'),
          mv('egreso', 'Transporte', 150, '2026-03-10'),
        ],
        range,
        '2026-03-20',
      );
      const comparison = insights.find((i) => i.id === 'month-comparison');
      expect(comparison?.message).toContain('50% más que el anterior en Transporte');
    });

    it('proyecta el saldo a 12 meses', () => {
      const projection = buildInsights(
        [mv('ingreso', 'Salario', 1000, '2026-03-01'), mv('egreso', 'Vivienda', 500, '2026-03-02')],
        range,
        '2026-03-20',
      ).find((i) => i.id === 'projection');
      expect(projection?.message).toContain('$6,000.00');
    });

    it('devuelve un aviso informativo cuando no hay datos', () => {
      expect(ids([])).toEqual(['empty']);
    });
  });
});
