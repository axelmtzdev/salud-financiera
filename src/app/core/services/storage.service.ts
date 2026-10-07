import { Injectable, signal } from '@angular/core';
import { RETENTION_YEARS } from '../../shared/models/categories';
import { AppData, createEmptyData } from '../../shared/models/finance.models';
import { purgeOldMovements, sanitizeAppData } from '../../shared/utils/data-integrity.utils';

export const DATA_KEY = 'salud-financiera.data';
const CORRUPT_BACKUP_KEY = 'salud-financiera.corrupt-backup';

export interface LoadReport {
  /** Movimientos con más de 2 años eliminados automáticamente */
  purged: number;
  /** Registros inválidos descartados */
  discarded: number;
  /** El JSON guardado no se pudo leer y se respaldó aparte */
  corrupted: boolean;
}

/**
 * Única fuente de verdad del estado persistido. Mantiene el `AppData` en un signal
 * y lo serializa a localStorage en cada cambio.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly _loadReport = signal<LoadReport>({ purged: 0, discarded: 0, corrupted: false });
  readonly loadReport = this._loadReport.asReadonly();

  private readonly _state = signal<AppData>(this.readFromDisk());
  readonly state = this._state.asReadonly();

  constructor() {
    // Sincroniza cambios hechos en otra pestaña
    window.addEventListener('storage', (event) => {
      if (event.key === DATA_KEY) this._state.set(this.readFromDisk());
    });
  }

  /** Aplica un cambio inmutable y lo persiste. Devuelve false si localStorage rechazó la escritura (p. ej. cuota llena). */
  update(mutator: (current: AppData) => AppData): boolean {
    const next = mutator(this._state());
    if (!this.write(next)) return false;
    this._state.set(next);
    return true;
  }

  /** Devuelve el reporte de carga una sola vez (para avisar al usuario sin repetirlo en cada login). */
  consumeLoadReport(): LoadReport {
    const report = this._loadReport();
    this._loadReport.set({ purged: 0, discarded: 0, corrupted: false });
    return report;
  }

  reset(): void {
    try {
      localStorage.removeItem(DATA_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    this._state.set(createEmptyData());
  }

  /** Bytes aproximados que ocupa la app en localStorage (UTF-16). */
  usageBytes(): number {
    try {
      return (localStorage.getItem(DATA_KEY)?.length ?? 0) * 2;
    } catch {
      return 0;
    }
  }

  private write(data: AppData): boolean {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  private readFromDisk(): AppData {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(DATA_KEY);
    } catch {
      return createEmptyData();
    }
    if (!raw) return createEmptyData();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      } catch {
        /* sin espacio para el respaldo */
      }
      this._loadReport.set({ purged: 0, discarded: 0, corrupted: true });
      return createEmptyData();
    }

    const { data, discarded } = sanitizeAppData(parsed);
    const { kept, removed } = purgeOldMovements(data.movements, RETENTION_YEARS);
    const clean: AppData = { ...data, movements: kept };
    if (discarded > 0 || removed > 0) this.write(clean);
    this._loadReport.set({ purged: removed, discarded, corrupted: false });
    return clean;
  }
}
