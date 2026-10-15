import { Pipe, PipeTransform } from '@angular/core';
import { DateFormatStyle, formatDate } from '../utils/format.utils';

export type { DateFormatStyle } from '../utils/format.utils';

/**
 * Formatea fechas YYYY-MM-DD (interpretadas en hora local) o timestamps ISO.
 * Uso: `{{ m.date | dateFormat }}`, `{{ m.date | dateFormat: 'long' }}`
 */
@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(value: string | null | undefined, style: DateFormatStyle = 'medium'): string {
    return formatDate(value, style);
  }
}
