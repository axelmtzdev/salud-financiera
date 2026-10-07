import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyFormatOptions, formatCurrency } from '../utils/format.utils';

/**
 * Formatea montos en pesos mexicanos.
 * Uso: `{{ monto | currencyFormat }}`, `{{ monto | currencyFormat: { compact: true } }}`
 */
@Pipe({ name: 'currencyFormat' })
export class CurrencyFormatPipe implements PipeTransform {
  transform(value: number | null | undefined, options: CurrencyFormatOptions = {}): string {
    return formatCurrency(value ?? 0, options);
  }
}
