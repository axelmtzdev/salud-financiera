import { CurrencyFormatPipe } from './currency-format.pipe';
import { DateFormatPipe } from './date-format.pipe';

describe('CurrencyFormatPipe', () => {
  const pipe = new CurrencyFormatPipe();

  it('formatea en pesos mexicanos', () => {
    expect(pipe.transform(1234.5)).toBe('$1,234.50');
    expect(pipe.transform(null)).toBe('$0.00');
    expect(pipe.transform(10, { signed: true })).toBe('+$10.00');
  });
});

describe('DateFormatPipe', () => {
  const pipe = new DateFormatPipe();

  it('interpreta YYYY-MM-DD en hora local (sin desfase de un día)', () => {
    expect(pipe.transform('2026-01-01', 'short')).toBe('01/01/2026');
    expect(pipe.transform('2026-03-05', 'medium')).toContain('5');
    expect(pipe.transform('2026-03-05', 'medium')).toContain('mar');
  });

  it('devuelve cadena vacía con valores inválidos', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('no-es-fecha')).toBe('');
  });
});
