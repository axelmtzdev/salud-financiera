import { Budget, DateRange, Movement, MovementType, RecurringPayment } from '../models/finance.models';
import { byCategory, filterByRange, monthlySeries, orderMovements, queryMovements, summarize } from './analytics.utils';
import { budgetOverview } from './budget.utils';
import { recurringTotals, upcomingPayments } from './recurring.utils';
import { monthKey, monthLabel, monthRange, parseIsoDate, shiftMonthKey, todayIso } from './date.utils';
import { formatCurrency, formatDate, formatPercent } from './format.utils';
import { collapseSpaces } from './text.utils';

/**
 * Preguntas rápidas: respuestas armadas al momento con las utilidades de análisis, sin IA.
 * Cada respuesta es un modelo de vista (frase, indicadores y renglones) que la pantalla solo pinta.
 */

export type QuestionId =
  | 'summary'
  | 'top-categories'
  | 'category-spend'
  | 'month-comparison'
  | 'largest-expenses'
  | 'search'
  | 'trend'
  | 'budget'
  | 'recurring';

/** Datos que pide cada pregunta, en el orden en que se muestran. */
export type QuestionParam = 'period' | 'category' | 'month' | 'count' | 'text' | 'months';

export interface QuickQuestion {
  id: QuestionId;
  label: string;
  /** Nombre de ícono Lucide */
  icon: string;
  params: readonly QuestionParam[];
}

export const QUICK_QUESTIONS: readonly QuickQuestion[] = [
  { id: 'summary', label: '¿Cuánto gasté y cuánto me quedó?', icon: 'wallet', params: ['period'] },
  { id: 'top-categories', label: '¿En qué gasto más?', icon: 'chart-pie', params: ['period'] },
  { id: 'category-spend', label: '¿Cuánto gasté en una categoría?', icon: 'tag', params: ['category', 'period'] },
  { id: 'month-comparison', label: '¿Cómo voy contra el mes anterior?', icon: 'arrow-left-right', params: ['month'] },
  { id: 'largest-expenses', label: '¿Cuáles fueron mis gastos más grandes?', icon: 'arrow-down-wide-narrow', params: ['count', 'period'] },
  { id: 'search', label: '¿Cuánto llevo en algo específico?', icon: 'search', params: ['text', 'period'] },
  { id: 'trend', label: '¿Cómo ha cambiado mi saldo?', icon: 'trending-up', params: ['months'] },
  { id: 'budget', label: '¿Cómo voy con mi presupuesto?', icon: 'target', params: ['month'] },
  { id: 'recurring', label: '¿Qué pagos fijos vienen?', icon: 'repeat', params: [] },
];

export const COUNT_OPTIONS: readonly number[] = [5, 10, 20];
export const MONTHS_OPTIONS: readonly number[] = [3, 6, 12];

/** Renglones que se listan como máximo en las respuestas con movimientos individuales. */
export const ANSWER_MAX_ROWS = 10;
const CATEGORY_MAX_ROWS = 8;
const COMPARISON_MAX_ROWS = 6;

export interface QuestionInputs {
  range: DateRange;
  category: string;
  /** 'YYYY-MM' */
  month: string;
  count: number;
  text: string;
  months: number;
}

export type AnswerTone = 'income' | 'expense' | 'neutral';

export interface AnswerStat {
  label: string;
  value: string;
  tone: AnswerTone;
  hint?: string;
  /** Pinta el valor en el tono de egreso (saldo negativo). */
  negative?: boolean;
}

export interface AnswerRow {
  label: string;
  detail: string;
  value: string;
  tone: AnswerTone;
  /** 0-100: dibuja una barra de proporción */
  percent?: number;
}

/** Filtros con los que se abre Movimientos desde una respuesta. */
export interface MovementsLink {
  type?: MovementType;
  category?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface QuickAnswer {
  headline: string;
  detail?: string;
  stats: AnswerStat[];
  rowsTitle?: string;
  rows: AnswerRow[];
  link?: MovementsLink;
}

export function answerQuestion(
  id: QuestionId,
  inputs: QuestionInputs,
  movements: readonly Movement[],
  today = todayIso(),
  budgets: readonly Budget[] = [],
  recurring: readonly RecurringPayment[] = [],
): QuickAnswer {
  switch (id) {
    case 'summary':
      return summaryAnswer(movements, inputs.range);
    case 'top-categories':
      return topCategoriesAnswer(movements, inputs.range);
    case 'category-spend':
      return categorySpendAnswer(movements, inputs.category, inputs.range);
    case 'month-comparison':
      return monthComparisonAnswer(movements, inputs.month, today);
    case 'largest-expenses':
      return largestExpensesAnswer(movements, inputs.count, inputs.range);
    case 'search':
      return searchAnswer(movements, inputs.text, inputs.range);
    case 'trend':
      return trendAnswer(movements, inputs.months, today);
    case 'budget':
      return budgetAnswer(movements, budgets, inputs.month, today);
    case 'recurring':
      return recurringAnswer(movements, recurring, today);
  }
}

function summaryAnswer(movements: readonly Movement[], range: DateRange): QuickAnswer {
  const inRange = filterByRange(movements, range);
  const s = summarize(inRange);
  if (s.count === 0) return empty('No hay movimientos registrados en este período.');

  const saved = byCategory(inRange, 'egreso').find((c) => c.category === 'Ahorros')?.total ?? 0;
  const details: string[] = [];
  if (s.savingsRate === null) details.push('No hay ingresos registrados en este período.');
  else if (s.net >= 0) details.push(`Equivale al ${formatPercent(s.savingsRate)} de tus ingresos.`);
  if (saved > 0) details.push(`Además apartaste ${money(saved)} en la categoría Ahorros.`);

  return {
    headline:
      s.net >= 0
        ? `Ingresaste ${money(s.income)} y gastaste ${money(s.expense)}: te quedaron ${money(s.net)}.`
        : `Gastaste ${money(s.expense)}, ${money(-s.net)} más de lo que ingresaste.`,
    detail: details.join(' ') || undefined,
    stats: [
      { label: 'Ingresos', value: money(s.income), tone: 'income' },
      { label: 'Egresos', value: money(s.expense), tone: 'expense' },
      { label: 'Saldo neto', value: money(s.net), tone: 'neutral', negative: s.net < 0 },
      { label: 'Ahorro', value: s.savingsRate === null ? '—' : formatPercent(s.savingsRate, 1), tone: 'neutral' },
    ],
    rows: [],
    link: { from: range.from, to: range.to },
  };
}

function topCategoriesAnswer(movements: readonly Movement[], range: DateRange): QuickAnswer {
  const stats = byCategory(filterByRange(movements, range), 'egreso');
  if (!stats.length) return empty('No hay egresos en este período.');

  const [top] = stats;
  const topThree = stats.slice(0, 3).reduce((sum, s) => sum + s.percent, 0);
  return {
    headline: `Tu mayor gasto fue ${top.category}: ${money(top.total)}, el ${percent(top.percent)} de tus egresos.`,
    detail: stats.length > 3 ? `Tus tres categorías principales suman el ${percent(topThree)} de lo que gastaste.` : undefined,
    stats: [],
    rowsTitle: stats.length > CATEGORY_MAX_ROWS ? `Las ${CATEGORY_MAX_ROWS} categorías principales` : 'Egresos por categoría',
    rows: stats.slice(0, CATEGORY_MAX_ROWS).map((s) => ({
      label: s.category,
      detail: `${percent(s.percent)} · ${plural(s.count, 'movimiento', 'movimientos')}`,
      value: money(s.total),
      tone: 'neutral',
      percent: s.percent,
    })),
    link: { type: 'egreso', from: range.from, to: range.to },
  };
}

function categorySpendAnswer(movements: readonly Movement[], category: string, range: DateRange): QuickAnswer {
  if (!category) return empty('Elige una categoría.');

  const expenses = queryMovements(movements, { type: 'egreso', from: range.from, to: range.to });
  const matches = queryMovements(expenses, { category });
  if (!matches.length) return empty(`No registraste gastos en ${category} en este período.`);

  const total = summarize(matches).expense;
  const allExpenses = summarize(expenses).expense;
  return {
    headline: `Gastaste ${money(total)} en ${category} en ${plural(matches.length, 'movimiento', 'movimientos')}.`,
    detail:
      `Es el ${formatPercent(total / allExpenses)} de tus egresos del período` +
      (matches.length > 1 ? `, con un promedio de ${money(total / matches.length)} por movimiento.` : '.'),
    stats: [],
    rowsTitle: recentTitle(matches.length),
    rows: orderMovements(matches, 'recent').slice(0, ANSWER_MAX_ROWS).map((m) => movementRow(m, false)),
    link: { type: 'egreso', category, from: range.from, to: range.to },
  };
}

function monthComparisonAnswer(movements: readonly Movement[], month: string, today: string): QuickAnswer {
  const previousMonth = shiftMonthKey(month, -1);
  let current = monthRange(month);
  let previous = monthRange(previousMonth);
  // El mes en curso se compara contra el mismo tramo del anterior para no medir un mes a medias contra uno completo
  const inProgress = month === monthKey(today);
  const day = parseIsoDate(today).getDate();
  if (inProgress) {
    // Un día que no existe en el mes anterior (p. ej. 31) se recorta a su último día
    const sameDay = `${previousMonth}-${pad(day)}`;
    current = { ...current, to: today };
    previous = { ...previous, to: sameDay < previous.to ? sameDay : previous.to };
  }

  const currentLabel = monthLabel(month, true);
  const previousLabel = monthLabel(previousMonth, true);
  const a = summarize(filterByRange(movements, current));
  const b = summarize(filterByRange(movements, previous));
  if (a.count === 0 && b.count === 0) return empty(`No hay movimientos en ${currentLabel} ni en ${previousLabel}.`);

  const diff = a.expense - b.expense;
  let headline: string;
  if (b.expense === 0) {
    headline =
      `En ${previousLabel} no registraste egresos; en ${currentLabel} ` +
      `${inProgress ? 'llevas' : 'gastaste'} ${money(a.expense)}.`;
  }
  else if (diff === 0) headline = `Gastaste lo mismo que en ${previousLabel}: ${money(a.expense)}.`;
  else {
    headline =
      `Gastaste ${money(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que en ${previousLabel} ` +
      `(${diff > 0 ? '+' : '−'}${formatPercent(Math.abs(diff) / b.expense)}).`;
  }

  const before = categoryTotals(filterByRange(movements, previous));
  const after = categoryTotals(filterByRange(movements, current));
  const changes = [...new Set([...before.keys(), ...after.keys()])]
    .map((category) => ({ category, before: before.get(category) ?? 0, after: after.get(category) ?? 0 }))
    .map((c) => ({ ...c, diff: c.after - c.before }))
    .filter((c) => Math.abs(c.diff) >= 0.01)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
    .slice(0, COMPARISON_MAX_ROWS);

  const previousHint = (value: number) => `${capitalize(previousLabel)}: ${money(value)}`;
  return {
    headline,
    detail: inProgress
      ? `Comparo del 1 al ${day} de cada mes, porque ${currentLabel} todavía no termina.`
      : undefined,
    stats: [
      { label: 'Egresos', value: money(a.expense), tone: 'expense', hint: previousHint(b.expense) },
      { label: 'Ingresos', value: money(a.income), tone: 'income', hint: previousHint(b.income) },
      { label: 'Saldo neto', value: money(a.net), tone: 'neutral', negative: a.net < 0, hint: previousHint(b.net) },
    ],
    rowsTitle: changes.length ? 'Categorías de egreso que más cambiaron' : undefined,
    rows: changes.map((c) => ({
      label: c.category,
      detail: `${money(c.before)} → ${money(c.after)}`,
      value: signedMoney(c.diff),
      // Gastar más es la señal de alerta; gastar menos, la buena noticia
      tone: c.diff > 0 ? 'expense' : 'income',
    })),
    link: { from: current.from, to: current.to },
  };
}

function largestExpensesAnswer(movements: readonly Movement[], count: number, range: DateRange): QuickAnswer {
  const expenses = queryMovements(movements, { type: 'egreso', from: range.from, to: range.to });
  if (!expenses.length) return empty('No hay egresos en este período.');

  const top = orderMovements(expenses, 'largest').slice(0, count);
  const [first] = top;
  const what = first.description ? `“${first.description}”` : `en ${first.category}`;
  const sum = summarize(top).expense;
  return {
    headline: `Tu gasto más grande fue ${what}: ${money(first.amount)}, el ${formatDate(first.date, 'short')}.`,
    detail:
      top.length > 1
        ? `Tus ${top.length} gastos más grandes suman ${money(sum)}, el ${formatPercent(sum / summarize(expenses).expense)} de lo que gastaste.`
        : undefined,
    stats: [],
    rowsTitle: top.length > 1 ? `Los ${top.length} más grandes` : undefined,
    rows: top.map((m) => movementRow(m)),
    link: { type: 'egreso', from: range.from, to: range.to },
  };
}

function searchAnswer(movements: readonly Movement[], rawText: string, range: DateRange): QuickAnswer {
  const text = collapseSpaces(rawText);
  if (!text) return empty('Escribe qué quieres buscar en la descripción, por ejemplo “Uber”, “renta” o “súper”.');

  const matches = queryMovements(movements, { text, from: range.from, to: range.to });
  if (!matches.length) return empty(`No encontré movimientos con “${text}” en este período.`);

  const s = summarize(matches);
  const expenseCount = matches.filter((m) => m.type === 'egreso').length;
  const parts = [
    s.expense > 0 ? `${money(s.expense)} en egresos` : '',
    s.income > 0 ? `${money(s.income)} en ingresos` : '',
  ].filter(Boolean);
  return {
    headline: `Llevas ${parts.join(' y ')} con “${text}” (${plural(matches.length, 'movimiento', 'movimientos')}).`,
    detail: expenseCount > 1 ? `En promedio, ${money(s.expense / expenseCount)} por egreso.` : undefined,
    stats: [],
    rowsTitle: recentTitle(matches.length),
    rows: orderMovements(matches, 'recent').slice(0, ANSWER_MAX_ROWS).map((m) => movementRow(m)),
    link: { search: text, from: range.from, to: range.to },
  };
}

function trendAnswer(movements: readonly Movement[], months: number, today: string): QuickAnswer {
  const series = monthlySeries(movements, today, months);
  const hasData = (p: { income: number; expense: number }) => p.income > 0 || p.expense > 0;
  if (!series.some(hasData)) return empty(`No hay movimientos en los últimos ${months} meses.`);

  // El mes en curso va incompleto: se deja fuera del promedio si hay meses cerrados con datos
  const closed = series.slice(0, -1).filter(hasData);
  const basis = closed.length ? closed : series.filter(hasData);
  const avg = (pick: (p: (typeof series)[number]) => number) => basis.reduce((sum, p) => sum + pick(p), 0) / basis.length;
  const income = avg((p) => p.income);
  const expense = avg((p) => p.expense);
  const net = income - expense;

  const details: string[] = [];
  if (basis.length > 1) {
    const best = basis.reduce((x, y) => (y.net > x.net ? y : x));
    const worst = basis.reduce((x, y) => (y.net < x.net ? y : x));
    details.push(
      `Tu mejor mes fue ${monthLabel(best.key, true)} (${signedMoney(best.net)}) ` +
        `y el más apretado ${monthLabel(worst.key, true)} (${signedMoney(worst.net)}).`,
    );
  }
  if (closed.length) details.push(`El promedio no incluye ${monthLabel(series[series.length - 1].key, true)} porque sigue en curso.`);
  // Un mes cerrado sin movimientos se toma como "no registrado", no como gasto cero; se dice para que el promedio no confunda
  const skipped = series.length - 1 - closed.length;
  if (closed.length && skipped > 0) {
    details.push(
      skipped === 1
        ? 'Tampoco cuenta 1 mes sin movimientos registrados.'
        : `Tampoco cuentan ${skipped} meses sin movimientos registrados.`,
    );
  }

  return {
    headline:
      `En promedio ingresas ${money(income)} y gastas ${money(expense)} al mes: ` +
      (net >= 0 ? `te quedan ${money(net)}.` : `te faltan ${money(-net)}.`),
    detail: details.join(' ') || undefined,
    stats: [
      { label: 'Ingreso promedio', value: money(income), tone: 'income' },
      { label: 'Egreso promedio', value: money(expense), tone: 'expense' },
      { label: 'Saldo promedio', value: money(net), tone: 'neutral', negative: net < 0 },
    ],
    rowsTitle: 'Mes a mes',
    rows: [...series].reverse().map((p) => ({
      label: capitalize(monthLabel(p.key, true)),
      detail: `+${money(p.income)} · −${money(p.expense)}`,
      value: signedMoney(p.net),
      tone: p.net >= 0 ? 'income' : 'expense',
    })),
  };
}

function budgetAnswer(
  movements: readonly Movement[],
  budgets: readonly Budget[],
  month: string,
  today: string,
): QuickAnswer {
  if (!budgets.length) return empty('Aún no tienes presupuestos. Defínelos en la sección Presupuestos para ver cómo vas.');

  const o = budgetOverview(budgets, movements, month, today);
  const label = monthLabel(month, true);
  const over = o.lines.filter((l) => l.level === 'over');
  const warning = o.lines.filter((l) => l.level === 'warning');
  const inProgress = o.day !== null;

  let headline: string;
  if (o.totalRemaining < 0) headline = `Excediste tu presupuesto total de ${label} por ${money(-o.totalRemaining)}.`;
  else if (over.length) {
    headline =
      `Vas dentro del total, pero te pasaste en ${plural(over.length, 'categoría', 'categorías')}: ` +
      `${over.map((l) => l.category).join(', ')}.`;
  } else {
    headline =
      `${inProgress ? 'Llevas' : 'Gastaste'} ${money(o.totalSpent)} de ${money(o.totalLimit)}` +
      `${inProgress ? `: te quedan ${money(o.totalRemaining)}` : ' y te sobraron ' + money(o.totalRemaining)}.`;
  }

  const details: string[] = [];
  if (inProgress) {
    details.push(
      `Va el ${formatPercent(o.elapsed)} del mes y llevas el ${formatPercent(o.totalLimit ? o.totalSpent / o.totalLimit : 0)} del presupuesto.`,
    );
  }
  if (warning.length) details.push(`Cerca del límite: ${warning.map((l) => l.category).join(', ')}.`);
  if (o.unbudgetedTotal > 0) details.push(`Además gastaste ${money(o.unbudgetedTotal)} en categorías sin presupuesto.`);

  const range = monthRange(month);
  return {
    headline,
    detail: details.join(' ') || undefined,
    stats: [
      { label: 'Presupuesto', value: money(o.totalLimit), tone: 'neutral' },
      { label: 'Gastado', value: money(o.totalSpent), tone: 'expense' },
      {
        label: o.totalRemaining < 0 ? 'Excedido' : 'Disponible',
        value: money(Math.abs(o.totalRemaining)),
        tone: 'neutral',
        negative: o.totalRemaining < 0,
      },
    ],
    rowsTitle: 'Por categoría',
    rows: o.lines.map((l) => ({
      label: l.category,
      detail: `${money(l.spent)} de ${money(l.limit)}`,
      value: l.remaining < 0 ? `−${money(-l.remaining)}` : `Quedan ${money(l.remaining)}`,
      tone: l.level === 'over' ? 'expense' : 'neutral',
      percent: Math.min(l.ratio, 1) * 100,
    })),
    link: { type: 'egreso', from: range.from, to: range.to },
  };
}

function recurringAnswer(movements: readonly Movement[], recurring: readonly RecurringPayment[], today: string): QuickAnswer {
  if (!recurring.length) {
    return empty('Aún no registras pagos recurrentes. Agrégalos en Pagos recurrentes; ahí también verás los que detectamos en tus movimientos.');
  }
  const upcoming = upcomingPayments(recurring, movements, today, 30);
  const totals = recurringTotals(recurring, movements, today);
  const overdue = upcoming.filter((o) => o.status === 'vencido');
  const pending = upcoming.filter((o) => o.status === 'pendiente');
  const sum = upcoming.reduce((s, o) => s + o.payment.amount, 0);

  let headline: string;
  if (!upcoming.length) headline = 'No tienes pagos fijos pendientes en los próximos 30 días.';
  else if (overdue.length) {
    headline =
      `Tienes ${plural(overdue.length, 'pago vencido', 'pagos vencidos')}` +
      (pending.length ? ` y ${pending.length} por venir` : '') +
      `: ${money(sum)} en total.`;
  } else {
    const [next] = pending;
    headline =
      `En los próximos 30 días vienen ${plural(pending.length, 'pago', 'pagos')} por ${money(sum)}; ` +
      `el siguiente es ${next.payment.name} el ${formatDate(next.due, 'short')}.`;
  }

  return {
    headline,
    detail:
      `Tus pagos fijos suman ${money(totals.monthly)} al mes` +
      (totals.subscriptionsCount
        ? `, de los cuales ${money(totals.subscriptionsMonthly)} corresponden a ${plural(totals.subscriptionsCount, 'suscripción', 'suscripciones')}.`
        : '.'),
    stats: [
      { label: 'Comprometido al mes', value: money(totals.monthly), tone: 'expense' },
      { label: 'Suscripciones', value: money(totals.subscriptionsMonthly), tone: 'neutral' },
      { label: 'Falta este mes', value: money(totals.pendingThisMonth), tone: 'neutral' },
    ],
    rowsTitle: upcoming.length ? 'Próximos 30 días' : undefined,
    rows: upcoming.map((o) => ({
      label: o.payment.name,
      detail: `${formatDate(o.due, 'short')} · ${o.status === 'vencido' ? 'vencido' : o.daysLeft === 0 ? 'hoy' : `en ${o.daysLeft} días`}`,
      value: money(o.payment.amount),
      tone: o.status === 'vencido' ? 'expense' : 'neutral',
    })),
  };
}

function movementRow(m: Movement, showCategory = true): AnswerRow {
  const label = m.description || m.category;
  return {
    label,
    detail: showCategory && m.description ? `${formatDate(m.date, 'short')} · ${m.category}` : formatDate(m.date, 'short'),
    value: `${m.type === 'ingreso' ? '+' : '−'}${money(m.amount)}`,
    tone: m.type === 'ingreso' ? 'income' : 'expense',
  };
}

function categoryTotals(movements: readonly Movement[]): Map<string, number> {
  return new Map(byCategory(movements, 'egreso').map((s) => [s.category, s.total]));
}

function empty(headline: string): QuickAnswer {
  return { headline, stats: [], rows: [] };
}

function recentTitle(total: number): string {
  return total > ANSWER_MAX_ROWS ? `Los ${ANSWER_MAX_ROWS} más recientes de ${total}` : 'Movimientos';
}

const money = (value: number) => formatCurrency(value);
/** "+$1,000.00" / "−$1,000.00", con el signo de menos tipográfico que usan las listas de la app. */
const signedMoney = (value: number) => (value < 0 ? `−${money(-value)}` : formatCurrency(value, { signed: true }));
const percent = (value: number) => formatPercent(value / 100);
const pad = (n: number) => String(n).padStart(2, '0');

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
