import { AppData, Movement, createEmptyData } from '../models/finance.models';
import { countRecords, diffAppData, isEmptyChanges, itemKey, mergeAppData } from './sync.utils';

const mv = (id: string, amount = 10): Movement => ({
  id,
  type: 'egreso',
  category: 'Vivienda',
  amount,
  date: '2026-10-01',
  description: '',
  createdAt: '2026-10-01T00:00:00.000Z',
});

const data = (over: Partial<AppData> = {}): AppData => ({ ...createEmptyData(), ...over });

describe('sync.utils', () => {
  it('claves: id, tipo + patrón para reglas y categoría normalizada para presupuestos', () => {
    expect(itemKey('movements', mv('a'))).toBe('a');
    expect(itemKey('rules', { pattern: 'oxxo', label: 'OXXO', type: 'egreso', category: 'Alimentación' })).toBe('egreso:oxxo');
    expect(itemKey('budgets', { category: 'Alimentación', amount: 1 })).toBe('alimentacion');
  });

  it('diff: solo lo nuevo, lo modificado y lo eliminado', () => {
    const a = mv('a');
    const b = mv('b');
    const prev = data({ movements: [a, b], budgets: [{ category: 'Vivienda', amount: 1 }] });
    const changed = { ...a, amount: 20 };
    const c = mv('c');
    const next = { ...prev, movements: [changed, c], budgets: [] };

    expect(diffAppData(prev, next)).toEqual({
      upsert: { movements: [changed, c] },
      remove: { movements: ['b'], budgets: ['vivienda'] },
    });
  });

  it('diff: sin cambios está vacío y las listas completas se envían si cambiaron', () => {
    const prev = data();
    expect(isEmptyChanges(diffAppData(prev, { ...prev }))).toBeTrue();
    const next = { ...prev, categories: { ingreso: ['Bonos'], egreso: [] }, recurringIgnored: ['netflix'] };
    const changes = diffAppData(prev, next);
    expect(changes.categories).toEqual({ ingreso: ['Bonos'], egreso: [] });
    expect(changes.recurringIgnored).toEqual(['netflix']);
    expect(isEmptyChanges(changes)).toBeFalse();
  });

  it('merge: agrega solo lo que no existe y gana lo que ya está en la cuenta', () => {
    const base = data({ movements: [mv('a', 10)], categories: { ingreso: [], egreso: ['Mascotas'] } });
    const extra = data({
      movements: [mv('a', 99), mv('b')],
      categories: { ingreso: ['Bonos'], egreso: ['mascotas'] },
      recurringIgnored: ['x'],
    });
    const merged = mergeAppData(base, extra);
    expect(merged.movements.map((m) => [m.id, m.amount])).toEqual([['a', 10], ['b', 10]]);
    expect(merged.categories).toEqual({ ingreso: ['Bonos'], egreso: ['Mascotas'] });
    expect(merged.recurringIgnored).toEqual(['x']);
    expect(countRecords(merged)).toBe(2);
    expect(mergeAppData(base, data()).movements).toBe(base.movements);
  });
});
