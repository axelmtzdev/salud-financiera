export const APP_LOCALE = 'es-MX';
export const APP_CURRENCY = 'MXN';

const currency = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: APP_CURRENCY });
const currencyCompact = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: APP_CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});

export interface CurrencyFormatOptions {
  compact?: boolean;
  /** Antepone "+" a los valores positivos */
  signed?: boolean;
}

export function formatCurrency(value: number, options: CurrencyFormatOptions = {}): string {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = (options.compact ? currencyCompact : currency).format(safe);
  return options.signed && safe > 0 ? `+${formatted}` : formatted;
}

/** Recibe una proporción (0.25) y devuelve "25%". */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** "a, b y c" */
export function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
