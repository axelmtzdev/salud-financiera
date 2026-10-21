const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Convierte una fecha a YYYY-MM-DD usando la zona horaria local. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Interpreta YYYY-MM-DD como fecha local (evita el desfase de `new Date('YYYY-MM-DD')`, que usa UTC). */
export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = parseIsoDate(value);
  return (
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() + 1 === Number(match[2]) &&
    date.getDate() === Number(match[3])
  );
}

export function addYears(iso: string, years: number): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear() + years, d.getMonth(), d.getDate()));
}

/** 'YYYY-MM' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Diferencia en meses calendario entre dos claves 'YYYY-MM' (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Últimas `count` claves de mes terminando en `endKey` (orden cronológico). */
export function lastMonthKeys(endKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonthKey(endKey, i - count + 1));
}

const monthShort = new Intl.DateTimeFormat('es-MX', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  if (long) return monthLong.format(date);
  const short = monthShort.format(date).replace('.', '');
  return `${short.charAt(0).toUpperCase()}${short.slice(1)} ${String(y).slice(2)}`;
}

/** Primer y último día (YYYY-MM-DD) del mes 'YYYY-MM'. */
export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: toIsoDate(new Date(y, m, 0)) };
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** Días de `a` a `b` (b - a), ambos YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86_400_000);
}
