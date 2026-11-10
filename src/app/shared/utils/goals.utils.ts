import { ACCOUNT_KINDS, AccountKind, Goal, GoalContribution } from '../models/finance.models';
import { monthDiff, monthKey } from './date.utils';
import { round2 } from './format.utils';

export type GoalStatus = 'completada' | 'alcanzada' | 'vencida' | 'en-curso';

export interface GoalProgress {
  goal: Goal;
  saved: number;
  /** Cuánto falta (0 si ya se alcanzó) */
  remaining: number;
  /** 0-100 */
  percent: number;
  /** Lo apartado, por cuenta */
  byAccount: Record<AccountKind, number>;
  /** Meses para la fecha objetivo contando el actual; null sin fecha */
  monthsLeft: number | null;
  /** Cuánto apartar al mes para llegar a tiempo; null sin fecha o si ya se alcanzó */
  monthly: number | null;
  status: GoalStatus;
}

export function goalProgress(goal: Goal, contributions: readonly GoalContribution[], today: string): GoalProgress {
  const byAccount = { efectivo: 0, banco: 0 } as Record<AccountKind, number>;
  for (const c of contributions) if (c.goalId === goal.id) byAccount[c.account] += c.amount;
  for (const a of ACCOUNT_KINDS) byAccount[a] = round2(byAccount[a]);
  const saved = round2(byAccount.efectivo + byAccount.banco);
  const remaining = round2(Math.max(0, goal.target - saved));

  const monthsLeft = goal.targetDate ? Math.max(1, monthDiff(monthKey(today), monthKey(goal.targetDate)) + 1) : null;
  const overdue = !!goal.targetDate && goal.targetDate < today;
  const status: GoalStatus = goal.completedAt ? 'completada' : remaining === 0 ? 'alcanzada' : overdue ? 'vencida' : 'en-curso';
  const monthly = status === 'en-curso' || status === 'vencida' ? (monthsLeft ? round2(remaining / monthsLeft) : null) : null;

  return {
    goal,
    saved,
    remaining,
    percent: Math.min(100, goal.target > 0 ? (saved / goal.target) * 100 : 0),
    byAccount,
    monthsLeft,
    monthly,
    status,
  };
}

/** Dinero apartado para metas activas, por cuenta: sigue en la cuenta, pero ya no está libre. */
export function reservedByAccount(goals: readonly Goal[], contributions: readonly GoalContribution[]): Record<AccountKind, number> {
  const active = new Set(goals.filter((g) => !g.completedAt).map((g) => g.id));
  const result = { efectivo: 0, banco: 0 } as Record<AccountKind, number>;
  for (const c of contributions) if (active.has(c.goalId)) result[c.account] += c.amount;
  for (const a of ACCOUNT_KINDS) result[a] = round2(Math.max(0, result[a]));
  return result;
}
