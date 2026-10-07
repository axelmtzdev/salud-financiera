import { DateRange } from '../models/finance.models';
import { isValidIsoDate, monthDiff, monthKey, parseIsoDate, toIsoDate, todayIso } from './date.utils';

export type PeriodPreset = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'this-year' | 'custom';

export const PERIOD_OPTIONS: readonly { value: PeriodPreset; label: string }[] = [
  { value: 'this-month', label: 'Este mes' },
  { value: 'last-month', label: 'Último mes' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'last-6-months', label: 'Últimos 6 meses' },
  { value: 'this-year', label: 'Este año' },
  { value: 'custom', label: 'Personalizado' },
];

const range = (from: Date, to: Date): DateRange => ({ from: toIsoDate(from), to: toIsoDate(to) });

/** Traduce un preset a un rango de fechas concreto (inclusive). Los presets de N meses incluyen el mes en curso. */
export function resolvePeriod(preset: PeriodPreset, custom: DateRange | null = null, today = todayIso()): DateRange {
  const t = parseIsoDate(today);
  const y = t.getFullYear();
  const m = t.getMonth();

  switch (preset) {
    case 'this-month':
      return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'last-month':
      return range(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'last-3-months':
      return range(new Date(y, m - 2, 1), new Date(y, m + 1, 0));
    case 'last-6-months':
      return range(new Date(y, m - 5, 1), new Date(y, m + 1, 0));
    case 'this-year':
      return range(new Date(y, 0, 1), new Date(y, 11, 31));
    case 'custom':
      if (!custom || !isValidIsoDate(custom.from) || !isValidIsoDate(custom.to)) {
        return resolvePeriod('this-month', null, today);
      }
      return custom.from <= custom.to ? { ...custom } : { from: custom.to, to: custom.from };
  }
}

export function isInRange(date: string, r: DateRange): boolean {
  return date >= r.from && date <= r.to;
}

/** Último día del rango que ya ocurrió (o el fin del rango si éste es totalmente pasado o futuro). */
export function effectiveEnd(r: DateRange, today = todayIso()): string {
  return r.from <= today && r.to > today ? today : r.to;
}

/** Meses calendario transcurridos dentro del rango (mínimo 1), para promediar sin contar meses futuros. */
export function monthsElapsed(r: DateRange, today = todayIso()): number {
  return Math.max(1, monthDiff(monthKey(r.from), monthKey(effectiveEnd(r, today))) + 1);
}
