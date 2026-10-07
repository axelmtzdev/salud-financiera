import { Pipe, PipeTransform } from '@angular/core';
import { isValidIsoDate, parseIsoDate } from '../utils/date.utils';
import { APP_LOCALE } from '../utils/format.utils';

export type DateFormatStyle = 'short' | 'medium' | 'long';

const FORMATTERS: Record<DateFormatStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }),
  medium: new Intl.DateTimeFormat(APP_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  long: new Intl.DateTimeFormat(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
};

/**
 * Formatea fechas YYYY-MM-DD (interpretadas en hora local) o timestamps ISO.
 * Uso: `{{ m.date | dateFormat }}`, `{{ m.date | dateFormat: 'long' }}`
 */
@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(value: string | null | undefined, style: DateFormatStyle = 'medium'): string {
    if (!value) return '';
    const date = isValidIsoDate(value) ? parseIsoDate(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : FORMATTERS[style].format(date).replace('.', '');
  }
}
