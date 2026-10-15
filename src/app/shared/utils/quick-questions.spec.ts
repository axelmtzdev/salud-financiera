import { Movement, MovementType } from '../models/finance.models';
import { formatCurrency, formatDate } from './format.utils';
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

    it('compara meses cerrados completos', () => {
      const answer = ask('month-comparison', { month: '2026-02' });
      expect(answer.headline).toContain(`${money(4000)} más que en enero`);
      expect(answer.detail).toBeUndefined();
    });
  });

  it('largest-expenses lista los N egresos más grandes', () => {
    const answer = ask('largest-expenses', { count: 2 });
    expect(answer.headline).toBe(`Tu gasto más grande fue “Renta”: ${money(12000)}, el ${formatDate('2026-03-02')}.`);
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
  });
});
