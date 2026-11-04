import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Account } from '../../shared/models/finance.models';
import { ApiError, ApiService } from './api.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';

const ACCOUNT_KEY = 'salud-financiera.account';

interface SessionResponse {
  token: string;
  user: Account;
}

/**
 * Sesión con correo y contraseña. El token vive en localStorage (la sesión sobrevive a cerrar el
 * navegador) y el servidor lo invalida al cerrar sesión, cambiar la contraseña o tras 60 días sin uso.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly _user = signal<Account | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly userName = computed(() => this._user()?.name ?? '');

  /** Restaurando la sesión guardada sin caché: hay que esperar al servidor. */
  readonly restoring = signal(true);
  private readonly ready: Promise<void>;

  constructor() {
    this.api.onUnauthorized = () => this.expire();
    this.ready = this.restore().finally(() => this.restoring.set(false));
  }

  /** Se resuelve cuando ya se sabe si hay sesión (los guards esperan esto). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  async register(name: string, email: string, password: string): Promise<void> {
    await this.startSession(await this.api.post<SessionResponse>('/api/auth/register', { name, email: email.trim(), password }));
  }

  async login(email: string, password: string): Promise<void> {
    await this.startSession(await this.api.post<SessionResponse>('/api/auth/login', { email: email.trim(), password }));
  }

  logout(): void {
    // Se avisa al servidor sin esperar: aunque falle, en este dispositivo la sesión termina
    if (this.api.hasToken()) this.api.post('/api/auth/logout').catch(() => undefined);
    this.clearLocal();
  }

  async updateName(name: string): Promise<void> {
    const { user } = await this.api.patch<{ user: Account }>('/api/account', { name });
    this.setUser(user);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.post('/api/account/password', { currentPassword, newPassword });
  }

  async deleteAccount(password: string): Promise<void> {
    await this.api.delete('/api/account', { password });
    this.clearLocal();
  }

  private async restore(): Promise<void> {
    if (!this.api.hasToken()) return;
    const cached = readAccount();
    if (cached && this.storage.open(cached.id)) {
      // Con caché se entra al instante y se actualiza en segundo plano
      this._user.set(cached);
      this.revalidate();
      return;
    }
    try {
      const { user } = await this.api.get<{ user: Account }>('/api/auth/me');
      this.storage.open(user.id);
      await this.storage.refresh();
      this.setUser(user);
    } catch {
      // 401: onUnauthorized ya limpió. Sin conexión: se muestra el login y el token se conserva
      if (this._user() === null) this.storage.close();
    }
  }

  private revalidate(): void {
    this.api
      .get<{ user: Account }>('/api/auth/me')
      .then(({ user }) => {
        this.setUser(user);
        return this.storage.refresh();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 0) {
          this.toast.show('Sin conexión con el servidor: ves tu última información guardada.');
        }
      });
  }

  private async startSession({ token, user }: SessionResponse): Promise<void> {
    this.api.setToken(token);
    this.storage.open(user.id);
    try {
      await this.storage.refresh();
    } catch (err) {
      this.clearLocal();
      throw err;
    }
    this.setUser(user);
  }

  /** El servidor rechazó el token: expiró, se cerró sesión en otro lado o se cambió la contraseña. */
  private expire(): void {
    if (!this._user()) {
      this.clearLocal();
      return;
    }
    this.clearLocal();
    this.toast.show('Tu sesión terminó. Vuelve a iniciar sesión.');
    this.router.navigate(['/login']);
  }

  private clearLocal(): void {
    this.api.setToken(null);
    this.storage.close();
    this._user.set(null);
    try {
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private setUser(user: Account): void {
    this._user.set(user);
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
    } catch {
      /* se volverá a pedir al servidor */
    }
  }
}

function readAccount(): Account | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null');
    return raw && typeof raw.id === 'string' && typeof raw.name === 'string' && typeof raw.email === 'string'
      ? { id: raw.id, name: raw.name, email: raw.email }
      : null;
  } catch {
    return null;
  }
}
