import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FinanceService } from './finance.service';
import { InboxService } from './inbox.service';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';

describe('InboxService', () => {
  let inbox: InboxService;
  let finance: FinanceService;
  const cargo = { type: 'egreso' as const, amount: 85.5, merchant: 'OXXO Reforma', card: 'BBVA', date: '2026-10-07' };

  beforeEach(() => {
    localStorage.clear();
    const api = { post: async () => undefined, hasToken: () => true, onUnauthorized: null };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: ApiService, useValue: api }] });
    TestBed.inject(StorageService).open('u1');
    inbox = TestBed.inject(InboxService);
    finance = TestBed.inject(FinanceService);
  });

  afterAll(() => localStorage.clear());

  it('guarda el cargo en la bandeja y descarta el duplicado inmediato', async () => {
    expect(inbox.receive(cargo).status).toBe('added');
    expect(inbox.receive(cargo).status).toBe('duplicate');
    expect(inbox.count()).toBe(1);
    expect(await TestBed.inject(StorageService).flush()).toBeTrue();
    expect(localStorage.getItem('salud-financiera.cache.u1')).toContain('OXXO Reforma');
  });

  it('al confirmar crea el movimiento, lo quita de la bandeja y recuerda la categoría', () => {
    const result = inbox.receive(cargo);
    if (result.status !== 'added') fail('no se agregó');
    else {
      const movement = inbox.confirm(result.pending.id, 'Alimentación', true);
      expect(movement?.description).toBe('OXXO Reforma · BBVA');
      expect(finance.movements().length).toBe(1);
      expect(inbox.count()).toBe(0);
    }

    const next = inbox.receive({ ...cargo, amount: 40, merchant: 'oxxo reforma' });
    expect(next.status === 'added' && inbox.suggest(next.pending)).toBe('Alimentación');
  });

  it('descartar y deshacer', () => {
    const result = inbox.receive(cargo);
    if (result.status !== 'added') return fail('no se agregó');
    const removed = inbox.discard(result.pending.id);
    expect(inbox.count()).toBe(0);
    inbox.restore(removed!);
    expect(inbox.count()).toBe(1);
  });
});
