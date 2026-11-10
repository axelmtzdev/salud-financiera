import { ACCOUNT_KINDS, AccountKind, Movement, OpeningBalance, Transfer } from '../models/finance.models';
import { addDays } from './date.utils';
import { round2 } from './format.utils';

/** Cómo se llegó al saldo de una cuenta desde el saldo inicial. */
export interface AccountStatement {
  account: AccountKind;
  opening: number;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  balance: number;
}

export interface AccountBalances {
  efectivo: AccountStatement;
  banco: AccountStatement;
  total: number;
}

/**
 * Saldo de cada cuenta al cierre de `until` (incluido): saldo inicial + ingresos − egresos ± traspasos,
 * contando solo lo ocurrido desde la fecha del saldo inicial. null si aún no hay saldo inicial.
 */
export function accountBalances(
  opening: OpeningBalance | null,
  movements: readonly Movement[],
  transfers: readonly Transfer[],
  until: string,
): AccountBalances | null {
  if (!opening) return null;
  const inRange = (date: string) => date >= opening.date && date <= until;
  const statement = (account: AccountKind): AccountStatement => ({
    account,
    opening: opening[account],
    income: 0,
    expense: 0,
    transfersIn: 0,
    transfersOut: 0,
    balance: 0,
  });
  const result = { efectivo: statement('efectivo'), banco: statement('banco') };

  for (const m of movements) {
    if (!inRange(m.date)) continue;
    if (m.type === 'ingreso') result[m.account].income += m.amount;
    else result[m.account].expense += m.amount;
  }
  for (const t of transfers) {
    if (!inRange(t.date)) continue;
    result[t.from].transfersOut += t.amount;
    result[t.to].transfersIn += t.amount;
  }

  for (const account of ACCOUNT_KINDS) {
    const s = result[account];
    s.income = round2(s.income);
    s.expense = round2(s.expense);
    s.transfersIn = round2(s.transfersIn);
    s.transfersOut = round2(s.transfersOut);
    s.balance = round2(s.opening + s.income - s.expense + s.transfersIn - s.transfersOut);
  }
  return { ...result, total: round2(result.efectivo.balance + result.banco.balance) };
}

/**
 * Antes de borrar lo anterior a `cutoff` (retención de 2 años), lleva el saldo inicial a esa fecha
 * con el efecto de lo que se va a borrar: así el saldo actual no cambia.
 */
export function rollOpeningForward(
  opening: OpeningBalance | null,
  movements: readonly Movement[],
  transfers: readonly Transfer[],
  cutoff: string,
): OpeningBalance | null {
  if (!opening || opening.date >= cutoff) return opening;
  const balances = accountBalances(opening, movements, transfers, addDays(cutoff, -1))!;
  return { date: cutoff, efectivo: balances.efectivo.balance, banco: balances.banco.balance };
}
