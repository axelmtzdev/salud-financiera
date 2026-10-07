import { monthsElapsed, resolvePeriod } from './period.utils';

describe('resolvePeriod', () => {
  const today = '2026-03-15';

  it('calcula los presets relativos a hoy', () => {
    expect(resolvePeriod('this-month', null, today)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(resolvePeriod('last-month', null, today)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod('last-3-months', null, today)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(resolvePeriod('last-6-months', null, today)).toEqual({ from: '2025-10-01', to: '2026-03-31' });
    expect(resolvePeriod('this-year', null, today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('ordena un rango personalizado invertido y cae a "este mes" si es inválido', () => {
    expect(resolvePeriod('custom', { from: '2026-02-10', to: '2026-01-05' }, today)).toEqual({
      from: '2026-01-05',
      to: '2026-02-10',
    });
    expect(resolvePeriod('custom', { from: 'x', to: '2026-01-05' }, today).from).toBe('2026-03-01');
  });

  it('cuenta solo los meses transcurridos', () => {
    expect(monthsElapsed({ from: '2026-01-01', to: '2026-12-31' }, today)).toBe(3);
    expect(monthsElapsed({ from: '2026-03-01', to: '2026-03-31' }, today)).toBe(1);
  });
});
