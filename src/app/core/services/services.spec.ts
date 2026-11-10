import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../../shared/models/finance.models';
import { DataChanges } from '../../shared/utils/sync.utils';
import { AccountsService } from './accounts.service';
import { ApiError, ApiService } from './api.service';
import { AuthService } from './auth.service';
import { FinanceService } from './finance.service';
import { LEGACY_DATA_KEY, StorageService } from './storage.service';

const today = new Date().toISOString().slice(0, 10);
const ACCOUNT: Account = { id: 'u1', name: 'Ana', email: 'ana@correo.mx' };

/** Backend en memoria: responde como la API real y permite simular fallas. */
class FakeApi {
  token: string | null = null;
  readonly hasToken = () => this.token !== null;
  readonly waking = () => false;
  onUnauthorized: (() => void) | null = null;
  serverData: Record<string, unknown> = { movements: [] };
  sent: DataChanges[] = [];
  failNext = false;

  setToken(token: string | null) {
    this.token = token;
  }

  async get(path: string) {
    if (path === '/api/data') return { data: this.serverData, purged: 0 };
    if (path === '/api/auth/me') return { user: ACCOUNT };
    throw new Error(path);
  }

  async post(path: string, body: unknown) {
    if (path === '/api/auth/login') {
      const { password } = body as { password: string };
      if (password !== 'clave-correcta') throw new ApiError(401, 'Correo o contraseña incorrectos.');
      return { token: 't1', user: ACCOUNT };
    }
    if (path === '/api/data/changes') {
      if (this.failNext) {
        this.failNext = false;
        throw new ApiError(0, 'No hay conexión con el servidor.');
      }
      this.sent.push(body as DataChanges);
      return undefined;
    }
    return undefined;
  }
}

describe('Servicios', () => {
  let api: FakeApi;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ApiService, useValue: api }],
    });
  });

  afterAll(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  async function loggedIn() {
    const auth = TestBed.inject(AuthService);
    await auth.whenReady();
    await auth.login('ana@correo.mx', 'clave-correcta');
    return auth;
  }

  describe('AuthService', () => {
    it('inicia sesión, carga los datos del servidor y cierra sesión borrando la caché', async () => {
      api.serverData = { movements: [{ id: 'm1', type: 'ingreso', category: 'Salario', amount: 100, date: today }] };
      const auth = await loggedIn();
      expect(auth.isAuthenticated()).toBeTrue();
      expect(auth.userName()).toBe('Ana');
      expect(TestBed.inject(FinanceService).movements().length).toBe(1);
      expect(localStorage.getItem('salud-financiera.cache.u1')).toContain('m1');

      auth.logout();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(api.token).toBeNull();
      expect(localStorage.getItem('salud-financiera.cache.u1')).toBeNull();
      expect(TestBed.inject(FinanceService).movements().length).toBe(0);
    });

    it('rechaza una contraseña incorrecta con el mensaje del servidor', async () => {
      const auth = TestBed.inject(AuthService);
      await expectAsync(auth.login('ana@correo.mx', 'otra')).toBeRejectedWithError('Correo o contraseña incorrectos.');
      expect(auth.isAuthenticated()).toBeFalse();
    });

    it('con token y caché entra de inmediato sin esperar al servidor', async () => {
      api.token = 't1';
      localStorage.setItem('salud-financiera.account', JSON.stringify(ACCOUNT));
      localStorage.setItem('salud-financiera.cache.u1', JSON.stringify({ movements: [{ id: 'c1', type: 'egreso', category: 'Vivienda', amount: 5, date: today }] }));
      const auth = TestBed.inject(AuthService);
      await auth.whenReady();
      expect(auth.isAuthenticated()).toBeTrue();
      expect(TestBed.inject(FinanceService).getById('c1')).toBeDefined();
    });
  });

  describe('StorageService', () => {
    it('sin sesión no acepta cambios', () => {
      expect(TestBed.inject(FinanceService).add({ type: 'egreso', category: 'X', amount: 1, date: today, description: '', account: 'banco' })).toBeNull();
    });

    it('envía solo lo que cambió y revierte si el servidor falla', async () => {
      await loggedIn();
      const finance = TestBed.inject(FinanceService);
      const storage = TestBed.inject(StorageService);

      const m = finance.add({ type: 'egreso', category: 'Vivienda', amount: 100, date: today, description: 'Renta', account: 'banco' })!;
      expect(await storage.flush()).toBeTrue();
      expect(api.sent.at(-1)).toEqual({ upsert: { movements: [m] }, remove: {} });

      api.failNext = true;
      finance.update(m.id, { ...m, amount: 50 });
      expect(finance.getById(m.id)?.amount).toBe(50); // se ve de inmediato
      expect(await storage.flush()).toBeFalse();
      expect(finance.getById(m.id)?.amount).toBe(100); // y se revierte

      finance.remove(m.id);
      await storage.flush();
      expect(api.sent.at(-1)).toEqual({ upsert: {}, remove: { movements: [m.id] } });
    });

    it('sube los datos de la versión anterior sin duplicar y los deja como respaldo', async () => {
      localStorage.setItem(
        LEGACY_DATA_KEY,
        JSON.stringify({
          movements: [
            { id: 'm1', type: 'ingreso', category: 'Salario', amount: 100, date: today },
            { id: 'local', type: 'egreso', category: 'Vivienda', amount: 30, date: today },
          ],
          budgets: [{ category: 'Vivienda', amount: 500 }],
        }),
      );
      api.serverData = { movements: [{ id: 'm1', type: 'ingreso', category: 'Salario', amount: 100, date: today }] };
      await loggedIn();
      const storage = TestBed.inject(StorageService);
      expect(storage.legacyData()?.movements.length).toBe(2);

      expect(await storage.importLegacy()).toBeTrue();
      expect(api.sent.at(-1)?.upsert.movements?.map((m) => m.id)).toEqual(['local']);
      expect(api.sent.at(-1)?.upsert.budgets).toEqual([{ category: 'Vivienda', amount: 500 }]);
      expect(storage.legacyData()).toBeNull();
      expect(localStorage.getItem(LEGACY_DATA_KEY)).toBeNull();
      expect(localStorage.getItem('salud-financiera.data.respaldo')).toContain('local');
    });
  });

  describe('AccountsService', () => {
    it('calcula el saldo con el saldo inicial, los movimientos y los traspasos, y los envía al servidor', async () => {
      await loggedIn();
      const accounts = TestBed.inject(AccountsService);
      const finance = TestBed.inject(FinanceService);
      const storage = TestBed.inject(StorageService);
      expect(accounts.balances()).toBeNull();

      accounts.setOpening({ date: today, efectivo: 200, banco: 1000 });
      finance.add({ type: 'egreso', category: 'Alimentación', amount: 50, date: today, description: '', account: 'efectivo' });
      const transfer = accounts.addTransfer({ from: 'banco', to: 'efectivo', amount: 300, date: today, description: ' Cajero ' })!;
      expect(await storage.flush()).toBeTrue();

      expect(accounts.balances()?.efectivo.balance).toBe(450);
      expect(accounts.balances()?.banco.balance).toBe(700);
      expect(accounts.balances()?.total).toBe(1150);
      expect(transfer.description).toBe('Cajero');
      expect(api.sent.some((c) => c.opening?.banco === 1000)).toBeTrue();
      expect(api.sent.at(-1)?.upsert.transfers).toEqual([transfer]);

      const removed = accounts.removeTransfer(transfer.id)!;
      expect(accounts.balances()?.efectivo.balance).toBe(150);
      accounts.restoreTransfer(removed);
      expect(accounts.balances()?.efectivo.balance).toBe(450);
    });
  });

  describe('FinanceService', () => {
    beforeEach(async () => {
      await loggedIn();
    });

    it('agrega, actualiza, elimina y restaura movimientos', () => {
      const finance = TestBed.inject(FinanceService);
      const m = finance.add({ type: 'egreso', category: 'Vivienda', amount: 100.005, date: today, description: '  Renta  ', account: 'banco' });
      expect(m).not.toBeNull();
      expect(finance.movements()[0].amount).toBe(100.01);
      expect(finance.movements()[0].description).toBe('Renta');

      expect(finance.update(m!.id, { ...m!, amount: 50 })).toBeTrue();
      expect(finance.getById(m!.id)?.amount).toBe(50);

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
