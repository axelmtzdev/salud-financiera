import { Movement, RecurringPayment } from '../models/finance.models';
import {
  addDays,
  daysBetween,
  daysInMonth,
  lastMonthKeys,
  monthKey,
  monthRange,
  parseIsoDate,
  shiftMonthKey,
  todayIso,
} from './date.utils';
import { round2 } from './format.utils';
import { normalizeText } from './text.utils';

/** Un egreso cuenta como el pago de un vencimiento si cae a ± estos días. */
export const MATCH_WINDOW_DAYS = 10;
/** Diferencia de precio a partir de la cual se avisa (5 %). */
const PRICE_CHANGE_RATIO = 0.05;
const PRICE_CHANGE_MIN = 5;

// ---------- Vencimientos ----------

/** Fecha de vencimiento en un mes 'YYYY-MM' (null si un pago anual no toca ese mes). */
export function dueDateIn(rec: Pick<RecurringPayment, 'frequency' | 'day' | 'month'>, month: string): string | null {
  if (rec.frequency === 'anual' && Number(month.slice(5)) !== rec.month) return null;
  const day = Math.min(rec.day, daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Vencimientos entre dos fechas, inclusive. */
export function dueDatesBetween(rec: RecurringPayment, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let key = monthKey(from); key <= monthKey(to); key = shiftMonthKey(key, 1)) {
    const due = dueDateIn(rec, key);
    if (due && due >= from && due <= to) dates.push(due);
  }
  return dates;
}

/** ¿La descripción de un egreso corresponde a este pago? */
export function matchesPayment(rec: RecurringPayment, movement: Movement): boolean {
  if (movement.type !== 'egreso') return false;
  const text = normalizeText(movement.description);
  return !!text && (text.includes(rec.match) || text.includes(normalizeText(rec.name)));
}

/** El egreso que pagó un vencimiento: el más cercano a la fecha dentro de la ventana. */
export function findPayment(rec: RecurringPayment, due: string, movements: readonly Movement[]): Movement | null {
  let best: Movement | null = null;
  for (const m of movements) {
    if (!matchesPayment(rec, m)) continue;
    const distance = Math.abs(daysBetween(due, m.date));
    if (distance > MATCH_WINDOW_DAYS) continue;
    if (!best || distance < Math.abs(daysBetween(due, best.date))) best = m;
  }
  return best;
}

export type OccurrenceStatus = 'pagado' | 'pendiente' | 'vencido';

export interface Occurrence {
  payment: RecurringPayment;
  due: string;
  status: OccurrenceStatus;
  /** Días para el vencimiento (negativo si ya pasó) */
  daysLeft: number;
  /** Egreso con el que se pagó */
  paidWith: Movement | null;
}

function occurrence(rec: RecurringPayment, due: string, movements: readonly Movement[], today: string): Occurrence {
  const paidWith = findPayment(rec, due, movements);
  const status: OccurrenceStatus = paidWith ? 'pagado' : due < today ? 'vencido' : 'pendiente';
  return { payment: rec, due, status, daysLeft: daysBetween(today, due), paidWith };
}

/**
 * El vencimiento que importa hoy: el último que ya pasó (dentro de la ventana de pago) o, si no
 * hay, el siguiente. Si el último ya se pagó y el siguiente está cerca, se muestra el siguiente.
 */
export function currentOccurrence(rec: RecurringPayment, movements: readonly Movement[], today = todayIso()): Occurrence | null {
  const recent = dueDatesBetween(rec, addDays(today, -MATCH_WINDOW_DAYS), today).map((d) => occurrence(rec, d, movements, today));
  const unpaid = recent.find((o) => o.status !== 'pagado');
  if (unpaid) return unpaid;
  const next = dueDatesBetween(rec, addDays(today, 1), addDays(today, 400))[0];
  const upcoming = next ? occurrence(rec, next, movements, today) : null;
  return recent.at(-1) && (!upcoming || upcoming.daysLeft > MATCH_WINDOW_DAYS) ? recent.at(-1)! : upcoming;
}

/** Vencimientos sin pagar de los próximos `days` días, más los vencidos recientes; los vencidos primero. */
export function upcomingPayments(
  list: readonly RecurringPayment[],
  movements: readonly Movement[],
  today = todayIso(),
  days = 30,
): Occurrence[] {
  return list
    .flatMap((rec) =>
      dueDatesBetween(rec, addDays(today, -MATCH_WINDOW_DAYS), addDays(today, days)).map((d) =>
        occurrence(rec, d, movements, today),
      ),
    )
    .filter((o) => o.status !== 'pagado')
    .sort((a, b) => a.due.localeCompare(b.due) || b.payment.amount - a.payment.amount);
}

// ---------- Totales ----------

export interface RecurringTotals {
  /** Compromiso mensual: mensuales + anuales / 12 */
  monthly: number;
  subscriptionsMonthly: number;
  subscriptionsCount: number;
  /** Lo que falta por pagar en el mes en curso */
  pendingThisMonth: number;
}

export function recurringTotals(
  list: readonly RecurringPayment[],
  movements: readonly Movement[],
  today = todayIso(),
): RecurringTotals {
  const perMonth = (r: RecurringPayment) => (r.frequency === 'mensual' ? r.amount : r.amount / 12);
  const subscriptions = list.filter((r) => r.subscription);
  const { from, to } = monthRange(monthKey(today));
  const pendingThisMonth = list
    .flatMap((r) => dueDatesBetween(r, from, to).map((d) => occurrence(r, d, movements, today)))
    .filter((o) => o.status !== 'pagado')
    .reduce((sum, o) => sum + o.payment.amount, 0);
  return {
    monthly: round2(list.reduce((sum, r) => sum + perMonth(r), 0)),
    subscriptionsMonthly: round2(subscriptions.reduce((sum, r) => sum + perMonth(r), 0)),
    subscriptionsCount: subscriptions.length,
    pendingThisMonth: round2(pendingThisMonth),
  };
}

// ---------- Cambios de precio ----------

export interface PriceChange {
  payment: RecurringPayment;
  from: number;
  to: number;
  date: string;
}

/** Compara el último cargo reconocido (últimos 60 días) contra el monto esperado. */
export function priceChange(rec: RecurringPayment, movements: readonly Movement[], today = todayIso()): PriceChange | null {
  const since = addDays(today, -60);
  const last = movements
    .filter((m) => m.date >= since && m.date <= today && matchesPayment(rec, m))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return null;
  const diff = last.amount - rec.amount;
  if (Math.abs(diff) < PRICE_CHANGE_MIN || Math.abs(diff) / rec.amount < PRICE_CHANGE_RATIO) return null;
  return { payment: rec, from: rec.amount, to: last.amount, date: last.date };
}

// ---------- Detección ----------

/** Meses (cerrados + el actual) que se revisan para detectar pagos que se repiten. */
const DETECTION_MONTHS = 6;
/** Un pago fijo no varía más que esto entre su monto menor y el mayor (la luz o el agua sí cambian un poco). */
const MAX_AMOUNT_SPREAD = 1.35;
/**
 * En categorías de gasto variable, algo que se repite cada mes con montos "parecidos" suele ser el súper
 * o la gasolina, no un pago fijo. Ahí solo cuenta si el monto es prácticamente el mismo (una suscripción).
 */
const VARIABLE_CATEGORIES = ['alimentacion', 'transporte', 'entretenimiento', 'ropa/personal', 'miscelanea'];
const MAX_SPREAD_VARIABLE = 1.05;
/** Si no se ha visto en este tiempo, probablemente ya se canceló. */
const MAX_DAYS_SINCE_LAST = 45;

const SUBSCRIPTION_WORDS = [
  'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'amazon', 'apple', 'icloud', 'youtube', 'xbox',
  'playstation', 'nintendo', 'gimnasio', 'gym', 'smart fit', 'chatgpt', 'claude', 'google one', 'microsoft',
  'office', 'adobe', 'canva', 'duolingo', 'crunchyroll', 'paramount', 'vix', 'deezer', 'audible', 'kindle',
];

export function looksLikeSubscription(name: string, category: string): boolean {
  const text = normalizeText(name);
  return category === 'Entretenimiento' || SUBSCRIPTION_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(text));
}

/** Clave para agrupar egresos del mismo pago: la descripción sin el sufijo de tarjeta (" · BBVA"). */
export function paymentKey(description: string): string {
  return normalizeText(description.split(' · ')[0]);
}

export interface DetectedPayment {
  key: string;
  name: string;
  category: string;
  amount: number;
  day: number;
  /** Meses distintos en que apareció */
  months: number;
  lastDate: string;
  subscription: boolean;
}

/**
 * Egresos que se repiten una vez al mes con un monto parecido y que siguen activos.
 * Omite los que ya están registrados como pago recurrente y los que el usuario descartó.
 */
export function detectRecurring(
  movements: readonly Movement[],
  existing: readonly RecurringPayment[],
  ignored: readonly string[],
  today = todayIso(),
): DetectedPayment[] {
  const months = new Set(lastMonthKeys(monthKey(today), DETECTION_MONTHS));
  const groups = new Map<string, Movement[]>();
  for (const m of movements) {
    if (m.type !== 'egreso' || !months.has(monthKey(m.date)) || m.date > today) continue;
    const key = paymentKey(m.description);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  const covered = (key: string) =>
    ignored.includes(key) ||
    existing.some((r) => key.includes(r.match) || r.match.includes(key) || key === normalizeText(r.name));

  const result: DetectedPayment[] = [];
  for (const [key, items] of groups) {
    if (covered(key)) continue;
    const perMonth = new Map<string, number>();
    for (const m of items) perMonth.set(monthKey(m.date), (perMonth.get(monthKey(m.date)) ?? 0) + 1);
    const monthCount = perMonth.size;
    // Una vez al mes en la gran mayoría de los meses (el súper o la gasolina se repiten más)
    const single = [...perMonth.values()].filter((n) => n === 1).length;
    if (single / monthCount < 0.75) continue;

    const amounts = items.map((m) => m.amount).sort((a, b) => a - b);
    const variable = items.some((m) => VARIABLE_CATEGORIES.includes(normalizeText(m.category)));
    if (amounts[amounts.length - 1] / amounts[0] > (variable ? MAX_SPREAD_VARIABLE : MAX_AMOUNT_SPREAD)) continue;

    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    if (daysBetween(last.date, today) > MAX_DAYS_SINCE_LAST) continue;

    // 3 meses o más; con 2, solo si son los dos últimos meses y casi el mismo monto
    const lastTwo = [shiftMonthKey(monthKey(today), -1), monthKey(today)];
    const twoRecent =
      monthCount === 2 && [...perMonth.keys()].every((k) => lastTwo.includes(k)) && amounts[amounts.length - 1] / amounts[0] <= 1.05;
    if (monthCount < 3 && !twoRecent) continue;

    const days = sorted.map((m) => parseIsoDate(m.date).getDate()).sort((a, b) => a - b);
    const name = displayName(sorted.map((m) => m.description.split(' · ')[0].trim()));
    // El monto esperado es el más reciente: si cambió de precio, ese es el vigente
    result.push({
      key,
      name,
      category: last.category,
      amount: last.amount,
      day: days[Math.floor(days.length / 2)],
      months: monthCount,
      lastDate: last.date,
      subscription: looksLikeSubscription(name, last.category),
    });
  }
  return result.sort((a, b) => b.amount - a.amount);
}

/** La forma más usada del nombre; en empate, la que no está toda en mayúsculas (los bancos suelen gritar). */
function displayName(forms: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const f of forms) counts.set(f, (counts.get(f) ?? 0) + 1);
  const shouting = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(shouting(a[0])) - Number(shouting(b[0])))[0][0];
}
