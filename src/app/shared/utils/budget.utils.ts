import { Budget, CategoryStat, Movement } from '../models/finance.models';
import { byCategory, filterByRange } from './analytics.utils';
import { daysInMonth, monthKey, monthRange, parseIsoDate, shiftMonthKey, todayIso } from './date.utils';
import { round2 } from './format.utils';
import { normalizeText } from './text.utils';

/** Desde qué proporción del tope se avisa que una categoría va cerca del límite. */
export const BUDGET_WARNING_RATIO = 0.8;
/** No se proyecta el cierre antes de este avance del mes: con pocos días la proyección exagera. */
const MIN_ELAPSED_FOR_PROJECTION = 0.2;
/** Meses cerrados que se promedian para sugerir montos. */
export const SUGGESTION_MONTHS = 3;
/** Categorías que no tiene sentido topar: apartar dinero es la meta, no un gasto a contener. */
const NOT_SUGGESTED = ['ahorros'];

export type BudgetLevel = 'ok' | 'warning' | 'over';

export interface BudgetLine {
  category: string;
  limit: number;
  spent: number;
  /** Negativo cuando se excede */
  remaining: number;
  /** spent / limit (puede pasar de 1) */
  ratio: number;
  level: BudgetLevel;
  /** Gasto estimado al cierre del mes en curso a este ritmo; null si no aplica */
  projected: number | null;
}

export interface BudgetOverview {
  /** 'YYYY-MM' */
  month: string;
  /** Más comprometidas primero */
  lines: BudgetLine[];
  totalLimit: number;
  /** Gastado en categorías con presupuesto */
  totalSpent: number;
  totalRemaining: number;
  totalLevel: BudgetLevel;
  /** Gasto del mes en categorías sin presupuesto, de mayor a menor */
  unbudgeted: CategoryStat[];
  unbudgetedTotal: number;
  /** Proporción del mes transcurrida (0 futuro, 1 cerrado) */
  elapsed: number;
  /** Día del mes en curso; null si el mes no es el actual */
  day: number | null;
}

export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio > 1) return 'over';
  return ratio >= BUDGET_WARNING_RATIO ? 'warning' : 'ok';
}

/** Estado de los presupuestos en un mes: gastado, disponible, nivel y proyección al cierre. */
export function budgetOverview(
  budgets: readonly Budget[],
  movements: readonly Movement[],
  month: string,
  today = todayIso(),
): BudgetOverview {
  const spentByCategory = byCategory(filterByRange(movements, monthRange(month)), 'egreso');
  const keyOf = (category: string) => normalizeText(category);
  const budgeted = new Set(budgets.map((b) => keyOf(b.category)));

  const current = monthKey(today);
  const day = month === current ? parseIsoDate(today).getDate() : null;
  const elapsed = day !== null ? day / daysInMonth(month) : month < current ? 1 : 0;

  const lines = budgets
    .map<BudgetLine>((b) => {
      // Suma todas las variantes del nombre (p. ej. un respaldo con "alimentacion" sin acento)
      const spent = round2(
        spentByCategory.filter((s) => keyOf(s.category) === keyOf(b.category)).reduce((sum, s) => sum + s.total, 0),
      );
      const ratio = spent / b.amount;
      const projected =
        day !== null && elapsed >= MIN_ELAPSED_FOR_PROJECTION && spent > 0
          ? projectClose(movements, b.category, month, day, spent)
          : null;
      return {
        category: b.category,
        limit: b.amount,
        spent,
        remaining: round2(b.amount - spent),
        ratio,
        level: budgetLevel(ratio),
        projected,
      };
    })
    .sort((a, b) => b.ratio - a.ratio || b.spent - a.spent);

  const unbudgeted = spentByCategory.filter((s) => !budgeted.has(keyOf(s.category)));
  const totalLimit = round2(lines.reduce((sum, l) => sum + l.limit, 0));
  const totalSpent = round2(lines.reduce((sum, l) => sum + l.spent, 0));

  return {
    month,
    lines,
    totalLimit,
    totalSpent,
    totalRemaining: round2(totalLimit - totalSpent),
    totalLevel: budgetLevel(totalLimit > 0 ? totalSpent / totalLimit : 0),
    unbudgeted,
    unbudgetedTotal: round2(unbudgeted.reduce((sum, s) => sum + s.total, 0)),
    elapsed,
    day,
  };
}

/** Movimientos mínimos en el mes para proyectar en línea recta cuando la categoría no tiene historial. */
const MIN_MOVEMENTS_FOR_LINEAR = 3;

/**
 * Gasto estimado al cierre: lo gastado más lo que normalmente se gasta en la categoría después de
 * este día del mes (promedio de los meses cerrados recientes con datos). Así un pago fijo como la
 * renta, que ya se hizo, no se proyecta como si siguiera creciendo. Sin historial se extrapola en
 * línea recta, solo si el gasto del mes ya está repartido en varios movimientos; si no, null.
 */
function projectClose(
  movements: readonly Movement[],
  category: string,
  month: string,
  day: number,
  spent: number,
): number | null {
  const key = normalizeText(category);
  const ofCategory = movements.filter((m) => m.type === 'egreso' && normalizeText(m.category) === key);

  let monthsWithData = 0;
  let afterDay = 0;
  for (let i = 1; i <= SUGGESTION_MONTHS; i++) {
    const past = ofCategory.filter((m) => monthKey(m.date) === shiftMonthKey(month, -i));
    if (!past.length) continue;
    monthsWithData++;
    afterDay += past.filter((m) => parseIsoDate(m.date).getDate() > day).reduce((sum, m) => sum + m.amount, 0);
  }
  if (monthsWithData) return round2(spent + afterDay / monthsWithData);

  const thisMonth = ofCategory.filter((m) => monthKey(m.date) === month).length;
  return thisMonth >= MIN_MOVEMENTS_FOR_LINEAR ? round2(spent / (day / daysInMonth(month))) : null;
}

/** Estado de una sola categoría en un mes (para avisar al registrar un egreso). */
export function budgetLineFor(
  budgets: readonly Budget[],
  movements: readonly Movement[],
  category: string,
  month: string,
  today = todayIso(),
): BudgetLine | null {
  const budget = budgets.find((b) => normalizeText(b.category) === normalizeText(category));
  if (!budget) return null;
  return budgetOverview([budget], movements, month, today).lines[0];
}

export interface BudgetSuggestion {
  category: string;
  amount: number;
  /** Promedio mensual sin redondear */
  average: number;
}

/**
 * Montos sugeridos para las categorías de egreso sin presupuesto: promedio de los últimos
 * meses cerrados que tienen egresos, redondeado hacia arriba a centenas.
 */
export function suggestBudgets(
  budgets: readonly Budget[],
  movements: readonly Movement[],
  today = todayIso(),
  months = SUGGESTION_MONTHS,
): BudgetSuggestion[] {
  const budgeted = new Set(budgets.map((b) => normalizeText(b.category)));
  const current = monthKey(today);
  const keys = Array.from({ length: months }, (_, i) => shiftMonthKey(current, -(i + 1)));

  const totals = new Map<string, number>();
  let monthsWithData = 0;
  for (const key of keys) {
    const stats = byCategory(filterByRange(movements, monthRange(key)), 'egreso');
    if (stats.length) monthsWithData++;
    for (const s of stats) totals.set(s.category, (totals.get(s.category) ?? 0) + s.total);
  }
  if (!monthsWithData) return [];

  return [...totals.entries()]
    .filter(([category]) => !budgeted.has(normalizeText(category)) && !NOT_SUGGESTED.includes(normalizeText(category)))
    .map(([category, total]) => {
      const average = round2(total / monthsWithData);
      return { category, average, amount: Math.max(100, Math.ceil(average / 100) * 100) };
    })
    .sort((a, b) => b.amount - a.amount);
}
