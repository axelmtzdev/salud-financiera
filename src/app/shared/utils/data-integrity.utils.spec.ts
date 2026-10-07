import { purgeOldMovements, sanitizeAppData } from './data-integrity.utils';

describe('data-integrity.utils', () => {
  it('devuelve datos vacíos ante basura', () => {
    expect(sanitizeAppData('nope').data.movements).toEqual([]);
    expect(sanitizeAppData(null).data.user).toBeNull();
  });

  it('descarta movimientos inválidos o duplicados y repara campos opcionales', () => {
    const { data, discarded } = sanitizeAppData({
      movements: [
        { id: 'a', type: 'egreso', category: 'Vivienda', amount: 10.555, date: '2026-01-01' },
        { id: 'a', type: 'egreso', category: 'Vivienda', amount: 5, date: '2026-01-01' },
        { id: 'b', type: 'otro', category: 'X', amount: 5, date: '2026-01-01' },
        { id: 'c', type: 'ingreso', category: 'Salario', amount: -5, date: '2026-01-01' },
        { id: 'd', type: 'ingreso', category: 'Salario', amount: 5, date: '2026-02-30' },
      ],
    });
    expect(discarded).toBe(4);
    expect(data.movements.length).toBe(1);
    expect(data.movements[0].amount).toBe(10.56);
    expect(data.movements[0].description).toBe('');
  });

  it('limpia categorías personalizadas duplicadas o iguales a las predefinidas', () => {
    const { data } = sanitizeAppData({
      categories: { egreso: ['Mascotas', 'mascotas', 'Vivienda', 'Un nombre larguísimo de más de veinte'], ingreso: 'x' },
    });
    expect(data.categories.egreso).toEqual(['Mascotas', 'Un nombre larguísimo']);
    expect(data.categories.ingreso).toEqual([]);
  });

  it('purga movimientos con más de 2 años', () => {
    const base = { type: 'egreso' as const, category: 'A', amount: 1, description: '', createdAt: '' };
    const { kept, removed } = purgeOldMovements(
      [
        { ...base, id: '1', date: '2024-10-05' },
        { ...base, id: '2', date: '2024-10-06' },
      ],
      2,
      '2026-10-06',
    );
    expect(removed).toBe(1);
    expect(kept.map((m) => m.id)).toEqual(['2']);
  });
});
