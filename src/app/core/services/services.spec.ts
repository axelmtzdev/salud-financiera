import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { FinanceService } from './finance.service';
import { DATA_KEY } from './storage.service';

describe('Servicios', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterAll(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('AuthService', () => {
    it('configura el usuario sin guardar la respuesta en texto plano', () => {
      const auth = TestBed.inject(AuthService);
      expect(auth.isConfigured()).toBeFalse();
      auth.setup({ name: 'Ana', secretQuestion: '¿Película favorita?', secretAnswer: 'Matrix' });
      expect(auth.isAuthenticated()).toBeTrue();
      expect(localStorage.getItem(DATA_KEY)).not.toContain('Matrix');
    });

    it('valida la respuesta sin distinguir mayúsculas, acentos ni espacios', () => {
      const auth = TestBed.inject(AuthService);
      auth.setup({ name: 'Ana', secretQuestion: '¿Película?', secretAnswer: 'El Laberinto del Fauno' });
      auth.logout();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(auth.login('otra')).toBeFalse();
      expect(auth.login('  el   laberinto del FAUNO ')).toBeTrue();
      expect(auth.isAuthenticated()).toBeTrue();
    });
  });

  describe('FinanceService', () => {
    it('agrega, actualiza, elimina y restaura movimientos persistiendo en localStorage', () => {
      const finance = TestBed.inject(FinanceService);
      const m = finance.add({ type: 'egreso', category: 'Vivienda', amount: 100.005, date: '2026-10-01', description: '  Renta  ' });
      expect(m).not.toBeNull();
      expect(finance.movements()[0].amount).toBe(100.01);
      expect(finance.movements()[0].description).toBe('Renta');

      expect(finance.update(m!.id, { ...m!, amount: 50 })).toBeTrue();
      expect(finance.getById(m!.id)?.amount).toBe(50);
      expect(JSON.parse(localStorage.getItem(DATA_KEY)!).movements.length).toBe(1);

      const removed = finance.remove(m!.id);
      expect(finance.movements().length).toBe(0);
      finance.restore(removed!);
      expect(finance.movements().length).toBe(1);
    });

    it('valida categorías personalizadas', () => {
      const finance = TestBed.inject(FinanceService);
      expect(finance.addCategory('egreso', 'Mascotas').ok).toBeTrue();
      expect(finance.addCategory('egreso', 'mascotas').ok).toBeFalse();
      expect(finance.addCategory('egreso', 'vivienda').ok).toBeFalse();
      expect(finance.addCategory('egreso', 'x'.repeat(21)).ok).toBeFalse();
      expect(finance.categories().egreso).toContain('Mascotas');
      expect(finance.categories().ingreso).not.toContain('Mascotas');
    });

    it('importa un respaldo descartando registros inválidos', () => {
      const finance = TestBed.inject(FinanceService);
      const today = new Date().toISOString().slice(0, 10);
      const result = finance.importJson(
        JSON.stringify({
          movements: [
            { id: '1', type: 'ingreso', category: 'Salario', amount: 10, date: today },
            { id: '2', type: 'ingreso', category: 'Salario', amount: 'mucho', date: today },
          ],
          categories: { ingreso: ['Bonos'], egreso: [] },
        }),
      );
      expect(result).toEqual({ ok: true, count: 1 });
      expect(finance.categories().ingreso).toContain('Bonos');
      expect(finance.importJson('{malo').ok).toBeFalse();
    });
  });
});
