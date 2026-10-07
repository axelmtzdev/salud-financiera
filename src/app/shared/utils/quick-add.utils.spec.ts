import { MerchantRule, PendingMovement } from '../models/finance.models';
import { isDuplicate, matchRule, parseAmount, parseQuickAdd } from './quick-add.utils';

describe('quick-add.utils', () => {
  describe('parseAmount', () => {
    it('acepta símbolos y separadores locales', () => {
      expect(parseAmount('152.50')).toBe(152.5);
      expect(parseAmount('$1,234.50')).toBe(1234.5);
      expect(parseAmount('MX$ 1,234.5')).toBe(1234.5);
      expect(parseAmount('1.234,50')).toBe(1234.5);
      expect(parseAmount('152,50')).toBe(152.5);
      expect(parseAmount('1,234')).toBe(1234);
      expect(parseAmount('1.234.567')).toBe(1234567);
      expect(parseAmount('-80')).toBe(80);
    });

    it('devuelve null sin dígitos', () => {
      expect(parseAmount('')).toBeNull();
      expect(parseAmount('abc')).toBeNull();
    });
  });

  describe('parseQuickAdd', () => {
    const today = '2026-10-07';

    it('lee monto, comercio y tarjeta del fragmento', () => {
      const r = parseQuickAdd('#monto=%24152.50&comercio=Caf%C3%A9%20Central&tarjeta=BBVA', today);
      expect(r).toEqual({
        ok: true,
        value: { type: 'egreso', amount: 152.5, merchant: 'Café Central', card: 'BBVA', date: today },
      });
    });

    it('permite tipo y fecha opcionales', () => {
      const r = parseQuickAdd('monto=500&tipo=Ingreso&fecha=2026-10-01', today);
      expect(r.ok && r.value.type).toBe('ingreso');
      expect(r.ok && r.value.date).toBe('2026-10-01');
    });

    it('rechaza datos inválidos', () => {
      expect(parseQuickAdd('#comercio=OXXO', today).ok).toBeFalse();
      expect(parseQuickAdd('#monto=0', today).ok).toBeFalse();
      expect(parseQuickAdd('#monto=10&fecha=07/10/2026', today).ok).toBeFalse();
      expect(parseQuickAdd('#monto=10&fecha=2020-01-01', today).ok).toBeFalse();
    });
  });

  it('elige la regla más específica que coincide con el comercio', () => {
    const rules: MerchantRule[] = [
      { pattern: 'oxxo', label: 'OXXO', type: 'egreso', category: 'Alimentación' },
      { pattern: 'oxxo gas', label: 'OXXO Gas', type: 'egreso', category: 'Transporte' },
    ];
    expect(matchRule(rules, 'OXXO GAS SUC 123', 'egreso')?.category).toBe('Transporte');
    expect(matchRule(rules, 'Oxxo Reforma', 'egreso')?.category).toBe('Alimentación');
    expect(matchRule(rules, 'Oxxo Reforma', 'ingreso')).toBeUndefined();
    expect(matchRule(rules, '', 'egreso')).toBeUndefined();
  });

  it('detecta el mismo cargo recibido dos veces en poco tiempo', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    const pending: PendingMovement[] = [
      { id: '1', type: 'egreso', amount: 50, merchant: 'Café', card: '', date: '2026-10-07', receivedAt: '2026-10-07T11:59:30Z' },
    ];
    const input = { type: 'egreso' as const, amount: 50, merchant: 'cafe', card: '', date: '2026-10-07' };
    expect(isDuplicate(pending, input, now)).toBeTrue();
    expect(isDuplicate(pending, { ...input, amount: 51 }, now)).toBeFalse();
    expect(isDuplicate(pending, input, now + 5 * 60 * 1000)).toBeFalse();
  });
});
