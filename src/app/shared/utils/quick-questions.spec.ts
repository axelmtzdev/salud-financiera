import { Movement, MovementType } from '../models/finance.models';
import { formatCurrency } from './format.utils';
import { QUICK_QUESTIONS, QuestionId, QuestionInputs, answerQuestion } from './quick-questions';

let seq = 0;
const mv = (type: MovementType, category: string, amount: number, date: string, description = ''): Movement => ({
  id: String(++seq),
  type,
  category,
  amount,
  date,
  description,
  createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
});

const TODAY = '2026-03-20';
const money = (value: number) => formatCurrency(value);

const movements = [
  mv('ingreso', 'Salario', 30000, '2026-01-01', 'Nómina'),
  mv('egreso', 'Vivienda', 12000, '2026-01-02', 'Renta'),
  mv('ingreso', 'Salario', 30000, '2026-02-01', 'Nómina'),
  mv('egreso', 'Vivienda', 12000, '2026-02-02', 'Renta'),
  mv('egreso', 'Alimentación', 3000, '2026-02-10', 'Súper'),
  mv('egreso', 'Alimentación', 1000, '2026-02-25', 'Súper'),
  mv('ingreso', 'Salario', 30000, '2026-03-01', 'Nómina'),
  mv('egreso', 'Vivienda', 12000, '2026-03-02', 'Renta'),
  mv('egreso', 'Alimentación', 4500, '2026-03-07', 'Súper'),
  mv('egreso', 'Transporte', 800, '2026-03-09', 'Uber al aeropuerto'),
  mv('egreso', 'Transporte', 350, '2026-03-15', 'UBER'),
  mv('egreso', 'Ahorros', 2000, '2026-03-16'),
];

const march = { from: '2026-03-01', to: '2026-03-31' };
const defaults: QuestionInputs = { range: march, category: '', month: '2026-03', count: 5, text: '', months: 6 };

const ask = (id: QuestionId, inputs: Partial<QuestionInputs> = {}, data = movements) =>
  answerQuestion(id, { ...defaults, ...inputs }, data, TODAY);

describe('quick-questions', () => {
  it('cada pregunta tiene id único y responde sin datos', () => {
    expect(new Set(QUICK_QUESTIONS.map((q) => q.id)).size).toBe(QUICK_QUESTIONS.length);
    for (const q of QUICK_QUESTIONS) {
      const answer = ask(q.id, { category: 'Vivienda', text: 'renta' }, []);
      expect(answer.headline).toBeTruthy();
      expect(answer.rows).toEqual([]);
    }
  });

  describe('summary', () => {
    it('resume el período y menciona lo apartado en Ahorros', () => {
      const answer = ask('summary');
      expect(answer.headline).toBe(`Ingresaste ${money(30000)} y gastaste ${money(19650)}: te quedaron ${money(10350)}.`);
      expect(answer.detail).toContain(`apartaste ${money(2000)}`);
      expect(answer.stats.map((s) => s.value).slice(0, 3)).toEqual([money(30000), money(19650), money(10350)]);
      expect(answer.link).toEqual({ from: march.from, to: march.to });
    });

    it('avisa cuando el gasto supera al ingreso', () => {
      const answer = ask('summary', { range: { from: '2026-03-02', to: '2026-03-31' } });
      expect(answer.headline).toContain('más de lo que ingresaste');
      expect(answer.detail).toContain('No hay ingresos');
      expect(answer.stats[2].negative).toBeTrue();
    });
  });

  it('top-categories ordena las categorías de egreso y filtra Movimientos por egresos', () => {
    const answer = ask('top-categories');
    expect(answer.headline).toMatch(/^Tu mayor gasto fue Vivienda: /);
    expect(answer.rows.map((r) => r.label)).toEqual(['Vivienda', 'Alimentación', 'Ahorros', 'Transporte']);
    expect(answer.rows[0].percent).toBeCloseTo((12000 / 19650) * 100);
    expect(answer.link?.type).toBe('egreso');
  });

  describe('category-spend', () => {
    it('suma la categoría y lista sus movimientos recientes', () => {
      const answer = ask('category-spend', { category: 'Transporte' });
      expect(answer.headline).toBe(`Gastaste ${money(1150)} en Transporte en 2 movimientos.`);
      expect(answer.rows.map((r) => r.label)).toEqual(['UBER', 'Uber al aeropuerto']);
      expect(answer.link).toEqual({ type: 'egreso', category: 'Transporte', from: march.from, to: march.to });
    });

    it('pide elegir una categoría si falta', () => {
      expect(ask('category-spend').headline).toBe('Elige una categoría.');
    });
  });

  describe('month-comparison', () => {
    it('compara el mes en curso contra el mismo tramo del anterior', () => {
      const answer = ask('month-comparison');
      // Febrero hasta el día 20: 12,000 + 3,000 (el súper del 25 queda fuera)
      expect(answer.headline).toContain(`Gastaste ${money(4650)} más que en febrero`);
      expect(answer.detail).toContain('del 1 al 20');
      expect(answer.rows.map((r) => [r.label, r.tone])).toEqual([
        ['Ahorros', 'expense'],
        ['Alimentación', 'expense'],
        ['Transporte', 'expense'],
      ]);
      expect(answer.link).toEqual({ from: '2026-03-01', to: TODAY });
    });

    it('sin egresos en el mes anterior usa "llevas" solo para el mes en curso', () => {
      const data = [mv('egreso', 'Vivienda', 500, '2026-02-03'), mv('egreso', 'Vivienda', 700, '2026-03-03')];
      expect(ask('month-comparison', { month: '2026-02' }, data).headline).toBe(
        `En enero de 2026 no registraste egresos; en febrero de 2026 gastaste ${money(500)}.`,
      );
      const inProgress = ask('month-comparison', { month: '2026-03' }, [mv('egreso', 'Vivienda', 700, '2026-03-03')]);
      expect(inProgress.headline).toContain(`en marzo de 2026 llevas ${money(700)}`);
    });

    it('compara meses cerrados completos', () => {
      const answer = ask('month-comparison', { month: '2026-02' });
      expect(answer.headline).toContain(`${money(4000)} más que en enero`);
      expect(answer.detail).toBeUndefined();
    });
  });

  it('largest-expenses lista los N egresos más grandes', () => {
    const answer = ask('largest-expenses', { count: 2 });
    expect(answer.headline).toBe(`Tu gasto más grande fue “Renta”: ${money(12000)}, el 02/03/2026.`);
    expect(answer.rows[0].detail).toBe('02/03/2026 · Vivienda');
    expect(answer.rows.map((r) => r.value)).toEqual([`−${money(12000)}`, `−${money(4500)}`]);
    expect(answer.detail).toContain(money(16500));
  });

  describe('search', () => {
    it('busca en la descripción sin distinguir mayúsculas', () => {
      const answer = ask('search', { text: '  uber ' });
      expect(answer.headline).toBe(`Llevas ${money(1150)} en egresos con “uber” (2 movimientos).`);
      expect(answer.link?.search).toBe('uber');
    });

    it('guía cuando no hay texto o no hay resultados', () => {
      expect(ask('search', { text: '   ' }).headline).toContain('Escribe qué quieres buscar');
      expect(ask('search', { text: 'transporte' }).headline).toContain('No encontré movimientos');
    });
  });

  it('trend promedia solo los meses cerrados y lista del más reciente al más antiguo', () => {
    const answer = ask('trend', { months: 3 });
    expect(answer.headline).toBe(`En promedio ingresas ${money(30000)} y gastas ${money(14000)} al mes: te quedan ${money(16000)}.`);
    expect(answer.detail).toContain('enero de 2026');
    expect(answer.detail).toContain('no incluye marzo');
    expect(answer.rows.map((r) => r.label)).toEqual(['Marzo de 2026', 'Febrero de 2026', 'Enero de 2026']);
    expect(answer.detail).not.toContain('sin movimientos');
  });

  it('trend avisa cuántos meses cerrados sin movimientos quedaron fuera del promedio', () => {
    // 6 meses: oct-mar; con datos solo enero y febrero (cerrados) y marzo (en curso)
    const answer = ask('trend', { months: 6 });
    expect(answer.headline).toContain(`gastas ${money(14000)} al mes`);
    expect(answer.detail).toContain('Tampoco cuentan 3 meses sin movimientos registrados.');
  });

  describe('budget', () => {
    const budgets = [
      { category: 'Alimentación', amount: 4000 },
      { category: 'Transporte', amount: 2000 },
    ];
    const askBudget = (month: string, list = budgets) =>
      answerQuestion('budget', { ...defaults, month }, movements, TODAY, list);

    it('en el mes en curso señala las categorías excedidas y el gasto sin presupuesto', () => {
      const answer = askBudget('2026-03');
      expect(answer.headline).toBe('Vas dentro del total, pero te pasaste en 1 categoría: Alimentación.');
      expect(answer.detail).toContain(`Además gastaste ${money(14000)} en categorías sin presupuesto.`);
      expect(answer.rows.map((r) => [r.label, r.value])).toEqual([
        ['Alimentación', `−${money(500)}`],
        ['Transporte', `Quedan ${money(850)}`],
      ]);
    });

    it('en un mes cerrado habla en pasado y avisa lo que quedó cerca del límite', () => {
      const answer = askBudget('2026-02');
      expect(answer.headline).toBe(`Gastaste ${money(4000)} de ${money(6000)} y te sobraron ${money(2000)}.`);
      expect(answer.detail).toContain('Cerca del límite: Alimentación.');
    });

    it('sin presupuestos invita a crearlos', () => {
      expect(askBudget('2026-03', []).headline).toContain('Aún no tienes presupuestos');
    });
  });

  describe('recurring', () => {
    const base = { category: 'Vivienda', frequency: 'mensual' as const, month: null, subscription: false, createdAt: '2026-01-01T00:00:00.000Z' };
    const recurring = [
      { ...base, id: 'r1', name: 'Renta', amount: 12000, day: 2, match: 'renta' },
      { ...base, id: 'r2', name: 'Gimnasio', category: 'Salud', amount: 600, day: 25, match: 'gimnasio', subscription: true },
      { ...base, id: 'r3', name: 'Seguro', category: 'Seguros', amount: 1800, day: 12, match: 'seguro' },
    ];
    const askRecurring = (list = recurring) => answerQuestion('recurring', defaults, movements, TODAY, [], list);

    it('lista lo vencido y lo que viene en 30 días, con el compromiso mensual', () => {
      // Renta del 2 de marzo está pagada (movimiento "Renta"); Seguro del 12 venció; Gimnasio vence el 25;
      // dentro de 30 días también entran la renta y el seguro de abril
      const answer = askRecurring();
      expect(answer.headline).toBe(`Tienes 1 pago vencido y 3 por venir: ${money(1800 + 600 + 12000 + 1800)} en total.`);
      expect(answer.rows.map((r) => r.label)).toEqual(['Seguro', 'Gimnasio', 'Renta', 'Seguro']);
      expect(answer.detail).toContain(`${money(600)} corresponden a 1 suscripción`);
    });

    it('sin pagos registrados invita a agregarlos', () => {
      expect(askRecurring([]).headline).toContain('Aún no registras pagos recurrentes');
    });
  });
});
