import { Injectable, computed, inject, signal } from '@angular/core';
import { AppData, createEmptyData } from '../../shared/models/finance.models';
import { sanitizeAppData } from '../../shared/utils/data-integrity.utils';
import { DataChanges, countRecords, diffAppData, isEmptyChanges, mergeAppData } from '../../shared/utils/sync.utils';
import { ApiError, ApiService } from './api.service';
import { ToastService } from './toast.service';

const CACHE_PREFIX = 'salud-financiera.cache.';
/** Datos de la versión anterior, que solo vivían en el navegador. */
export const LEGACY_DATA_KEY = 'salud-financiera.data';
/** Al subirlos o descartarlos se conservan aquí como respaldo. */
const LEGACY_BACKUP_KEY = 'salud-financiera.data.respaldo';
/** Al volver a la pestaña se recarga del servidor si pasó este tiempo (cambios hechos en otro dispositivo). */
const REFRESH_AFTER_MS = 60_000;

interface QueuedChange {
  changes: DataChanges;
  /** Estado resultante; pasa a ser el confirmado cuando el servidor acepta el cambio */
  next: AppData;
}

/**
 * Única fuente de verdad del estado. El servidor tiene la última palabra; aquí se guarda una copia
 * en caché para abrir al instante. Los cambios se aplican en pantalla de inmediato y se envían en
 * orden; si uno falla, se regresa al último estado que confirmó el servidor.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  private readonly _state = signal<AppData>(createEmptyData());
  readonly state = this._state.asReadonly();

  private readonly queue = signal<QueuedChange[]>([]);
  /** Hay cambios que el servidor aún no confirma. */
  readonly saving = computed(() => this.queue().length > 0);

  private readonly legacy = signal<AppData | null>(readLegacy());
  /** Datos de la versión anterior pendientes de subir o descartar. */
  readonly legacyData = this.legacy.asReadonly();

  private userId: string | null = null;
  private confirmed: AppData = createEmptyData();
  private flushing: Promise<boolean> | null = null;
  private lastRefresh = 0;

  constructor() {
    // Otra pestaña guardó cambios confirmados
    window.addEventListener('storage', (event) => {
      if (!this.userId || event.key !== this.cacheKey() || !event.newValue || this.queue().length) return;
      const data = parseData(event.newValue);
      if (data) this.setConfirmed(data, false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastRefresh > REFRESH_AFTER_MS) {
        this.refresh().catch(() => undefined);
      }
    });
    window.addEventListener('beforeunload', (event) => {
      if (this.queue().length) event.preventDefault();
    });
  }

  /** Empieza a trabajar con los datos de un usuario. Devuelve true si había una copia en caché. */
  open(userId: string): boolean {
    this.userId = userId;
    this.queue.set([]);
    let cached: AppData | null = null;
    try {
      cached = parseData(localStorage.getItem(this.cacheKey()));
    } catch {
      /* almacenamiento no disponible */
    }
    this.confirmed = cached ?? createEmptyData();
    this._state.set(this.confirmed);
    return cached !== null;
  }

  /** Descarga del servidor la versión vigente (espera a que se envíen los cambios pendientes). */
  async refresh(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    await this.flush();
    const { data, purged } = await this.api.get<{ data: unknown; purged: number }>('/api/data');
    // Si cambió el usuario o hubo cambios mientras se descargaba, esta versión ya no sirve
    if (userId !== this.userId || this.queue().length) return;
    this.lastRefresh = Date.now();
    this.setConfirmed(sanitizeAppData(data).data, true);
    if (purged > 0) this.toast.show(`Se eliminaron ${purged} movimientos con más de 2 años de antigüedad.`);
  }

  /** Cierra la sesión de datos y borra la caché de este dispositivo. */
  close(): void {
    try {
      if (this.userId) localStorage.removeItem(this.cacheKey());
    } catch {
      /* almacenamiento no disponible */
    }
    this.userId = null;
    this.queue.set([]);
    this.confirmed = createEmptyData();
    this._state.set(this.confirmed);
  }

  /**
   * Aplica un cambio inmutable en pantalla y lo envía al servidor en segundo plano.
   * Devuelve false si no hay sesión; si el servidor lo rechaza después, se revierte y se avisa.
   */
  update(mutator: (current: AppData) => AppData): boolean {
    if (!this.userId) return false;
    const prev = this._state();
    const next = mutator(prev);
    const changes = diffAppData(prev, next);
    this._state.set(next);
    if (isEmptyChanges(changes)) return true;
    this.queue.update((q) => [...q, { changes, next }]);
    void this.flush();
    return true;
  }

  /** Espera a que el servidor confirme los cambios en cola. false si alguno falló (ya se revirtió). */
  flush(): Promise<boolean> {
    this.flushing ??= this.drain().finally(() => (this.flushing = null));
    return this.flushing;
  }

  /** Sube a la cuenta los datos de la versión anterior (sin duplicar lo que ya exista). */
  async importLegacy(): Promise<boolean> {
    const legacy = this.legacy();
    if (!legacy || !this.update((current) => mergeAppData(current, legacy))) return false;
    const ok = await this.flush();
    if (ok) this.archiveLegacy();
    return ok;
  }

  /** Deja de ofrecer los datos de la versión anterior; se conservan como respaldo en el navegador. */
  archiveLegacy(): void {
    try {
      const raw = localStorage.getItem(LEGACY_DATA_KEY);
      if (raw) localStorage.setItem(LEGACY_BACKUP_KEY, raw);
      localStorage.removeItem(LEGACY_DATA_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    this.legacy.set(null);
  }

  private async drain(): Promise<boolean> {
    const userId = this.userId;
    while (this.queue().length && userId === this.userId) {
      const item = this.queue()[0];
      try {
        await this.api.post('/api/data/changes', item.changes);
      } catch (err) {
        if (userId !== this.userId) return false;
        // Los cambios siguientes se calcularon sobre este, así que también se descartan
        this.queue.set([]);
        this._state.set(this.confirmed);
        // El "Guardado" que ya se mostró dejó de ser cierto
        this.toast.dismissType('success');
        if (!(err instanceof ApiError && err.status === 401)) {
          this.toast.error(`No se guardó el cambio. ${err instanceof Error ? err.message : ''}`.trim());
        }
        return false;
      }
      if (userId !== this.userId) return false;
      this.queue.update((q) => q.slice(1));
      this.confirmed = item.next;
      this.writeCache(item.next);
    }
    return true;
  }

  private setConfirmed(data: AppData, persist: boolean): void {
    this.confirmed = data;
    this._state.set(data);
    if (persist) this.writeCache(data);
  }

  private writeCache(data: AppData): void {
    try {
      localStorage.setItem(this.cacheKey(), JSON.stringify(data));
    } catch {
      /* sin caché: la próxima vez se descarga completo */
    }
  }

  private cacheKey(): string {
    return `${CACHE_PREFIX}${this.userId}`;
  }
}

function parseData(raw: string | null): AppData | null {
  if (!raw) return null;
  try {
    return sanitizeAppData(JSON.parse(raw)).data;
  } catch {
    return null;
  }
}

function readLegacy(): AppData | null {
  try {
    const data = parseData(localStorage.getItem(LEGACY_DATA_KEY));
    const hasCategories = !!data && data.categories.ingreso.length + data.categories.egreso.length > 0;
    return data && (countRecords(data) > 0 || hasCategories) ? data : null;
  } catch {
    return null;
  }
}
