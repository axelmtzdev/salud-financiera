import { Goal, GoalContribution, Movement, PlannedExpense, RecurringPayment } from '../models/finance.models';
import { lastMonthKeys, monthKey, monthLabel, monthRange, shiftMonthKey } from './date.utils';
import { round2 } from './format.utils';
import { goalProgress } from './goals.utils';
import { dueDatesBetween, findPayment, matchesPayment } from './recurring.utils';

/** Meses cerrados con los que se estima el ingreso y el gasto variable. */
export const PROJECTION_BASIS_MONTHS = 3;

export interface ProjectionMonth {
  key: string;
  label: string;
  income: number;
  /** Gasto del día a día (sin pagos recurrentes) */
  variable: number;
  recurring: number;
  planned: number;
  /** Lo que habría que apartar para las metas con fecha */
  goals: number;
  net: number;
  /** Saldo libre al cierre del mes */
  balance: number;
}

export interface ProjectionBasis {
  avgIncome: number;
  avgVariable: number;
  /** Meses cerrados con movimientos que se promediaron */
  months: string[];
}

export interface Projection {
  basis: ProjectionBasis;
  start: number;
  months: ProjectionMonth[];
  /** Primer mes que cerraría en negativo */
  firstNegative: ProjectionMonth | null;
  lowest: ProjectionMonth | null;
}

export interface ProjectionInput {
  today: string;
  /** Saldo libre de hoy (disponible − apartado para metas) */
  start: number;
  /** Meses a proyectar, empezando por el actual */
  horizon: number;
  movements: readonly Movement[];
  recurring: readonly RecurringPayment[];
  planned: readonly PlannedExpense[];
  goals: readonly Goal[];
  contributions: readonly GoalContribution[];
}

const isRecurring = (m: Movement, recurring: readonly RecurringPayment[]) => recurring.some((r) => matchesPayment(r, m));

/**
 * Promedio mensual de ingresos y de gasto variable en los últimos meses cerrados con movimientos.
 * Los egresos que corresponden a un pago recurrente se excluyen: esos se proyectan por su fecha.
 */
export function projectionBasis(movements: readonly Movement[], recurring: readonly RecurringPayment[], today: string): ProjectionBasis {
  const candidates = lastMonthKeys(shiftMonthKey(monthKey(today), -1), PROJECTION_BASIS_MONTHS);
  const months = candidates.filter((key) => movements.some((m) => monthKey(m.date) === key));
  let income = 0;
  let variable = 0;
  for (const m of movements) {
    if (!months.includes(monthKey(m.date))) continue;
    if (m.type === 'ingreso') income += m.amount;
    else if (!isRecurring(m, recurring)) variable += m.amount;
  }
  const n = months.length || 1;
  return { avgIncome: round2(income / n), avgVariable: round2(variable / n), months };
}

/**
 * Saldo libre al cierre de cada mes: ingresos y gasto variable promedio, pagos recurrentes por su
 * fecha, gastos planeados y lo que conviene apartar para las metas. Del mes en curso solo cuenta
 * lo que falta: el promedio menos lo que ya pasó y los pagos que siguen pendientes.
 */
export function projectBalance(input: ProjectionInput): Projection {
  const { today, movements, recurring, planned } = input;
  const basis = projectionBasis(movements, recurring, today);
  const current = monthKey(today);
  const thisMonth = movements.filter((m) => monthKey(m.date) === current && m.date <= today);
  const incomeSoFar = thisMonth.filter((m) => m.type === 'ingreso').reduce((s, m) => s + m.amount, 0);
  const variableSoFar = thisMonth.filter((m) => m.type === 'egreso' && !isRecurring(m, recurring)).reduce((s, m) => s + m.amount, 0);

  // El ahorro mensual de cada meta se fija hoy y se aparta hasta su mes objetivo
  const goalPlans = input.goals
    .map((g) => goalProgress(g, input.contributions, today))
    .filter((p) => p.monthly !== null && p.monthly > 0 && p.goal.targetDate)
    .map((p) => ({ monthly: p.monthly!, until: monthKey(p.goal.targetDate! < today ? today : p.goal.targetDate!) }));

  let balance = input.start;
  const months: ProjectionMonth[] = [];
  for (let i = 0; i < input.horizon; i++) {
    const key = shiftMonthKey(current, i);
    const { from, to } = monthRange(key);
    const isCurrent = i === 0;
    const pendingFrom = isCurrent ? today : from;

    const income = isCurrent ? Math.max(0, basis.avgIncome - incomeSoFar) : basis.avgIncome;
    const variable = isCurrent ? Math.max(0, basis.avgVariable - variableSoFar) : basis.avgVariable;
    let recurringTotal = 0;
    for (const rec of recurring) {
      for (const due of dueDatesBetween(rec, from, to)) {
        // Del mes en curso: lo que no se ha pagado (aunque ya haya vencido)
        if (isCurrent ? !findPayment(rec, due, movements) : true) recurringTotal += rec.amount;
      }
    }
    const plannedTotal = planned.filter((p) => p.date >= pendingFrom && p.date <= to).reduce((s, p) => s + p.amount, 0);
    const goals = goalPlans.filter((g) => key <= g.until).reduce((s, g) => s + g.monthly, 0);

    const net = round2(income - variable - recurringTotal - plannedTotal - goals);
    balance = round2(balance + net);
    months.push({
      key,
      label: monthLabel(key),
      income: round2(income),
      variable: round2(variable),
      recurring: round2(recurringTotal),
      planned: round2(plannedTotal),
      goals: round2(goals),
      net,
      balance,
    });
  }

  const lowest = months.reduce<ProjectionMonth | null>((low, m) => (!low || m.balance < low.balance ? m : low), null);
  return { basis, start: input.start, months, firstNegative: months.find((m) => m.balance < 0) ?? null, lowest };
}
