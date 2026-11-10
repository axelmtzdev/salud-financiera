import { AccountKind, Movement, MovementType, Transfer } from '../models/finance.models';
import { sanitizeOpening, sanitizeTransfer } from './data-integrity.utils';
import { accountBalances, rollOpeningForward } from './accounts.utils';

let seq = 0;
const mv = (type: MovementType, account: AccountKind, amount: number, date: string): Movement => ({
  id: String(++seq),
  type,
  category: 'X',
  amount,
  date,
  description: '',
  account,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const tr = (from: AccountKind, to: AccountKind, amount: number, date: string): Transfer => ({
  id: String(++seq),
  from,
  to,
  amount,
  date,
  description: '',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const opening = { date: '2026-03-01', efectivo: 500, banco: 10000 };
const movements = [
  mv('ingreso', 'banco', 30000, '2026-03-01'),
  mv('egreso', 'banco', 12000, '2026-03-02'),
  mv('egreso', 'efectivo', 350.5, '2026-03-05'),
  mv('egreso', 'banco', 999, '2026-02-28'), // antes del saldo inicial: no cuenta
  mv('egreso', 'banco', 100, '2026-03-25'), // después de "hoy": aún no cuenta
];
const transfers = [tr('banco', 'efectivo', 1000, '2026-03-10')];

describe('accounts.utils', () => {
  it('saldo por cuenta: inicial + ingresos − egresos ± traspasos desde la fecha del saldo inicial', () => {
    const b = accountBalances(opening, movements, transfers, '2026-03-20')!;
    expect(b.banco).toEqual({ account: 'banco', opening: 10000, income: 30000, expense: 12000, transfersIn: 0, transfersOut: 1000, balance: 27000 });
    expect(b.efectivo.balance).toBe(500 - 350.5 + 1000);
    expect(b.total).toBe(27000 + 1149.5);
  });

  it('sin saldo inicial no hay saldo', () => {
    expect(accountBalances(null, movements, transfers, '2026-03-20')).toBeNull();
  });

  it('al recorrer el saldo inicial el saldo final no cambia', () => {
    const rolled = rollOpeningForward(opening, movements, transfers, '2026-03-06')!;
    expect(rolled).toEqual({ date: '2026-03-06', efectivo: 149.5, banco: 28000 });
    const kept = movements.filter((m) => m.date >= '2026-03-06');
    expect(accountBalances(rolled, kept, transfers, '2026-03-20')!.total).toBe(accountBalances(opening, movements, transfers, '2026-03-20')!.total);
    expect(rollOpeningForward(opening, movements, transfers, '2026-02-01')).toBe(opening);
  });

  it('valida traspasos y saldo inicial', () => {
    expect(sanitizeTransfer({ from: 'banco', to: 'banco', amount: 10, date: '2026-03-01' })).toBeNull();
    expect(sanitizeTransfer({ from: 'banco', to: 'tarjeta', amount: 10, date: '2026-03-01' })).toBeNull();
    expect(sanitizeTransfer({ from: 'banco', to: 'efectivo', amount: 10.005, date: '2026-03-01' })?.amount).toBe(10.01);
    expect(sanitizeOpening({ date: '2026-03-01', efectivo: 0, banco: -25 })).toEqual({ date: '2026-03-01', efectivo: 0, banco: -25 });
    expect(sanitizeOpening({ date: 'ayer', efectivo: 0, banco: 0 })).toBeNull();
    expect(sanitizeOpening({ date: '2026-03-01', efectivo: '100', banco: 0 })).toBeNull();
  });
});
