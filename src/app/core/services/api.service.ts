import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'salud-financiera.token';
/** Tras este tiempo sin respuesta se avisa que el servidor puede estar despertando (plan gratuito de Render). */
const SLOW_MS = 4000;
const TIMEOUT_MS = 90_000;

export class ApiError extends Error {
  /** 0 = no hubo respuesta (sin internet o servidor caído) */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Cliente HTTP del backend: agrega el token de sesión y traduce los errores a mensajes para el usuario. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly token = signal<string | null>(readToken());
  readonly hasToken = computed(() => this.token() !== null);

  private readonly slowRequests = signal(0);
  /** Hay una petición tardando: probablemente el servidor estaba dormido. */
  readonly waking = computed(() => this.slowRequests() > 0);

  /** Se llama cuando el servidor rechaza la sesión (expiró o se cerró desde otro dispositivo). */
  onUnauthorized: (() => void) | null = null;

  setToken(token: string | null): void {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* la sesión vivirá solo en memoria */
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T = void>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T = void>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // El token se lee antes del primer await: un logout posterior no afecta a esta petición
    const token = this.token();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let slow = false;
    const timer = setTimeout(() => {
      slow = true;
      this.slowRequests.update((n) => n + 1);
    }, SLOW_MS);

    let response: Response;
    try {
      response = await fetch(`${environment.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      clearTimeout(timer);
      if (slow) this.slowRequests.update((n) => n - 1);
    }

    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      if (response.status === 401 && token && token === this.token()) this.onUnauthorized?.();
      throw new ApiError(response.status, payload?.message ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
    return payload as T;
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
