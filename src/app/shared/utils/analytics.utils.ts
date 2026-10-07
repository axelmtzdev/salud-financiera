import {
  CATEGORICAL_PALETTE,
  ESSENTIAL_EXPENSE_CATEGORIES,
  OTHER_CATEGORY_COLOR,
  OTHER_CATEGORY_LABEL,
} from '../models/categories';
import {
  CategoryStat,
  DateRange,
  Insight,
  InsightLevel,
  Movement,
  MovementType,
  MonthlyPoint,
  Summary,
} from '../models/finance.models';
import { lastMonthKeys, monthKey, monthLabel, shiftMonthKey, todayIso } from './date.utils';
import { formatCurrency, formatPercent, joinSpanish, round2 } from './format.utils';
import { effectiveEnd, isInRange, monthsElapsed } from './period.utils';

/** Más recientes primero: por fecha y, a igual fecha, por momento de captura. */
export function sortMovements(movements: readonly Movement[]): Movement[] {
  return [...movements].sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );
}

export function filterByRange(movements: readonly Movement[], range: DateRange): Movement[] {
  return movements.filter((m) => isInRange(m.date, range));
}

export function summarize(movements: readonly Movement[]): Summary {
  let income = 0;
  let expense = 0;
  for (const m of movements) {
    if (m.type === 'ingreso') income += m.amount;
    else expense += m.amount;
  }
  income = round2(income);
  expense = round2(expense);
  const net = round2(income - expense);
  return { income, expense, net, savingsRate: income > 0 ? net / income : null, count: movements.length };
}

export function byCategory(movements: readonly Movement[], type: MovementType): CategoryStat[] {
  const totals = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const m of movements) {
    if (m.type !== type) continue;
    const entry = totals.get(m.category) ?? { total: 0, count: 0 };
    entry.total += m.amount;
    entry.count++;
    totals.set(m.category, entry);
    grand += m.amount;
  }
  return [...totals.entries()]
    .map(([category, { total, count }]) => ({
      category,
      total: round2(total),
      count,
      percent: grand > 0 ? (total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export type CategoryColors = Record<MovementType, ReadonlyMap<string, string>>;

/**
 * Asigna la paleta por ranking histórico (todo el período guardado) de cada tipo.
 * Las categorías fuera de las primeras N quedan sin color propio y se agrupan en "Otras".
 */
export function categoryColorMap(movements: readonly Movement[]): CategoryColors {
  const build = (type: MovementType) =>
    new Map(
      byCategory(movements, type)
        .slice(0, CATEGORICAL_PALETTE.length)
        .map((stat, i) => [stat.category, CATEGORICAL_PALETTE[i]] as const),
    );
  return { ingreso: build('ingreso'), egreso: build('egreso') };
}

export interface ChartSlice {
  label: string;
  value: number;
  color: string;
}

/** Rebanadas para la gráfica de pastel; las categorías sin color propio se suman en "Otras". */
export function toSlices(stats: readonly CategoryStat[], colors: ReadonlyMap<string, string>): ChartSlice[] {
  const slices: ChartSlice[] = [];
  let other = 0;
  for (const stat of stats) {
    const color = colors.get(stat.category);
    if (color) slices.push({ label: stat.category, value: stat.total, color });
    else other += stat.total;
  }
  if (other > 0) slices.push({ label: OTHER_CATEGORY_LABEL, value: round2(other), color: OTHER_CATEGORY_COLOR });
  return slices;
}

/** Serie mensual de `count` meses que termina en el mes de `endDate`. */
export function monthlySeries(movements: readonly Movement[], endDate: string, count = 6): MonthlyPoint[] {
  const keys = lastMonthKeys(monthKey(endDate), count);
  const points = new Map(keys.map((key) => [key, { income: 0, expense: 0 }]));
  for (const m of movements) {
    const point = points.get(monthKey(m.date));
    if (!point) continue;
    if (m.type === 'ingreso') point.income += m.amount;
    else point.expense += m.amount;
  }
  return keys.map((key) => {
    const { income, expense } = points.get(key)!;
    return { key, label: monthLabel(key), income: round2(income), expense: round2(expense), net: round2(income - expense) };
  });
}

/** Fin de la ventana de las gráficas mensuales para un período (no se extiende a meses futuros). */
export function chartEndDate(range: DateRange, today = todayIso()): string {
  return effectiveEnd(range, today);
}

const LEVEL_ORDER: Record<InsightLevel, number> = { danger: 0, warning: 1, info: 2, success: 3 };

/** Recomendaciones automáticas para el período seleccionado (y comparativa del mes en curso). */
export function buildInsights(all: readonly Movement[], range: DateRange, today = todayIso()): Insight[] {
  const inRange = filterByRange(all, range);
  const s = summarize(inRange);

  if (s.count === 0) {
    return [
      {
        id: 'empty',
        level: 'info',
        icon: 'inbox',
        title: 'Aún no hay datos suficientes',
        message: 'Registra ingresos y egresos en este período para recibir recomendaciones personalizadas.',
      },
    ];
  }

  const insights: Insight[] = [];
  const expenses = byCategory(inRange, 'egreso');

  // 1. Nivel de gasto respecto al ingreso
  if (s.income === 0 && s.expense > 0) {
    insights.push({
      id: 'no-income',
      level: 'danger',
      icon: 'triangle-alert',
      title: 'Egresos sin ingresos registrados',
      message: `Llevas ${formatCurrency(s.expense)} en egresos y ningún ingreso en este período. Verifica que tus ingresos estén registrados.`,
    });
  } else if (s.income > 0 && s.expense / s.income > 0.8) {
    const nonEssential = expenses
      .filter((c) => !ESSENTIAL_EXPENSE_CATEGORIES.includes(c.category))
      .slice(0, 3)
      .map((c) => c.category);
    insights.push({
      id: 'high-spending',
      level: s.expense > s.income ? 'danger' : 'warning',
      icon: 'triangle-alert',
      title: 'Tu gasto es muy alto',
      message:
        `Tus egresos equivalen al ${formatPercent(s.expense / s.income)} de tus ingresos. ` +
        `Considera reducir en categorías no esenciales${nonEssential.length ? ` como ${joinSpanish(nonEssential)}` : ''}.`,
    });
  }

  // 2. Categoría con mayor gasto (como proporción del ingreso)
  const top = expenses[0];
  if (top && s.income > 0) {
    const share = Math.round((top.total / s.income) * 100);
    if (share >= 15) {
      insights.push({
        id: 'top-category',
        level: 'info',
        icon: 'lightbulb',
        title: `Tu mayor gasto: ${top.category}`,
        message: `Gastar ${share}% de tus ingresos en ${top.category} es alto. Intenta reducirlo a ${Math.max(share - 10, 5)}%.`,
      });
    }
  }

  // 3. Ahorro (lo destinado a la categoría "Ahorros" también cuenta)
  if (s.income > 0) {
    const saved = expenses.find((c) => c.category === 'Ahorros')?.total ?? 0;
    const rate = (s.net + saved) / s.income;
    if (rate < 0.1) {
      insights.push({
        id: 'no-savings',
        level: 'warning',
        icon: 'piggy-bank',
        title: 'Construye tu fondo de emergencia',
        message: `Reserva al menos 10-20% de tus ingresos para emergencias. Hoy tu tasa de ahorro es de ${formatPercent(Math.max(rate, 0))}.`,
      });
    } else if (rate >= 0.2) {
      insights.push({
        id: 'good-savings',
        level: 'success',
        icon: 'circle-check',
        title: 'Vas muy bien',
        message: `Estás ahorrando el ${formatPercent(rate)} de tus ingresos. Mantén ese hábito.`,
      });
    }
  }

  // 4. Comparativa con el mes anterior (por categoría de egreso)
  const currentKey = monthKey(today);
  const previousKey = shiftMonthKey(currentKey, -1);
  const current = categoryTotals(all, currentKey);
  const previous = categoryTotals(all, previousKey);
  let worst: { category: string; increase: number } | null = null;
  for (const [category, before] of previous) {
    const now = current.get(category) ?? 0;
    if (before > 0 && now > before) {
      const increase = (now - before) / before;
      if (!worst || increase > worst.increase) worst = { category, increase };
    }
  }
  if (worst && worst.increase >= 0.1) {
    insights.push({
      id: 'month-comparison',
      level: 'warning',
      icon: 'trending-up',
      title: 'Aumento respecto al mes anterior',
      message: `Este mes gastaste ${formatPercent(worst.increase)} más que el anterior en ${worst.category}.`,
    });
  }

  // 5. Proyección a 12 meses con el promedio mensual del período
  const monthlyAverage = s.net / monthsElapsed(range, today);
  const projection = monthlyAverage * 12;
  insights.push({
    id: 'projection',
    level: projection >= 0 ? 'info' : 'warning',
    icon: projection >= 0 ? 'trending-up' : 'trending-down',
    title: 'Proyección a 12 meses',
    message:
      projection >= 0
        ? `A este ritmo, tus ahorros serán de ${formatCurrency(projection)} en 12 meses (promedio de ${formatCurrency(monthlyAverage)} al mes).`
        : `A este ritmo, acumularás un déficit de ${formatCurrency(-projection)} en 12 meses (promedio de ${formatCurrency(monthlyAverage)} al mes).`,
  });

  return insights.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

function categoryTotals(movements: readonly Movement[], key: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const m of movements) {
    if (m.type === 'egreso' && monthKey(m.date) === key) {
      totals.set(m.category, (totals.get(m.category) ?? 0) + m.amount);
    }
  }
  return totals;
}
