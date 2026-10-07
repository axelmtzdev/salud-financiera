import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidIsoDate } from '../utils/date.utils';
import { normalizeText } from '../utils/text.utils';

export const FinanceValidators = {
  /** Máximo de decimales permitidos en un número. */
  maxDecimals(decimals: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === '' || value === undefined) return null;
      const [, fraction = ''] = String(value).split('.');
      return fraction.length > decimals ? { maxDecimals: { decimals } } : null;
    };
  },

  isoDate(control: AbstractControl): ValidationErrors | null {
    return !control.value || isValidIsoDate(control.value) ? null : { isoDate: true };
  },

  /** Fecha (YYYY-MM-DD) dentro de un rango calculado al momento de validar. */
  dateBetween(min: () => string, max: () => string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value as string;
      if (!value || !isValidIsoDate(value)) return null;
      if (value < min()) return { minDate: { min: min() } };
      if (value > max()) return { maxDate: { max: max() } };
      return null;
    };
  },

  /** Igual a otro control del mismo grupo, comparando de forma tolerante (mayúsculas/acentos). */
  matches(otherControlName: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const other = control.parent?.get(otherControlName);
      if (!other || !control.value) return null;
      return normalizeText(control.value) === normalizeText(other.value ?? '') ? null : { mismatch: true };
    };
  },

  /** Rechaza valores compuestos solo por espacios. */
  notBlank(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    return typeof value === 'string' && value.length > 0 && value.trim().length === 0 ? { blank: true } : null;
  },
};
