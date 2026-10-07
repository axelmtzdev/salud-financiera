import { Injectable, computed, inject } from '@angular/core';
import {
  CATEGORY_MAX_LENGTH,
  DEFAULT_CATEGORIES,
  OTHER_CATEGORY_COLOR,
  RETENTION_YEARS,
} from '../../shared/models/categories';
import { AppData, Movement, MovementInput, MovementType } from '../../shared/models/finance.models';
import { categoryColorMap, sortMovements } from '../../shared/utils/analytics.utils';
import { purgeOldMovements, sanitizeAppData } from '../../shared/utils/data-integrity.utils';
import { round2 } from '../../shared/utils/format.utils';
import { uuid } from '../../shared/utils/id.utils';
import { generateSampleMovements } from '../../shared/utils/sample-data';
import { collapseSpaces, normalizeText } from '../../shared/utils/text.utils';
import { StorageService } from './storage.service';

export type CategoryResult = { ok: true; name: string } | { ok: false; error: string };
export type ImportResult = { ok: true; count: number } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly storage = inject(StorageService);

  /** Todos los movimientos, más recientes primero. */
  readonly movements = computed(() => sortMovements(this.storage.state().movements));
  readonly customCategories = computed(() => this.storage.state().categories);

  /** Predefinidas + personalizadas, por tipo. */
  readonly categories = computed<Record<MovementType, string[]>>(() => {
    const custom = this.customCategories();
    return {
      ingreso: [...DEFAULT_CATEGORIES.ingreso, ...custom.ingreso],
      egreso: [...DEFAULT_CATEGORIES.egreso, ...custom.egreso],
    };
  });

  /** Categorías disponibles para filtrar: incluye las usadas por movimientos aunque ya se hayan borrado. */
  readonly filterableCategories = computed<Record<MovementType, string[]>>(() => {
    const result = { ingreso: [...this.categories().ingreso], egreso: [...this.categories().egreso] };
    for (const m of this.movements()) {
      if (!result[m.type].includes(m.category)) result[m.type].push(m.category);
    }
    return result;
  });

  /** Color estable por categoría (ver `categoryColorMap`). */
  readonly categoryColors = computed(() => categoryColorMap(this.movements()));

  colorOf(type: MovementType, category: string): string {
    return this.categoryColors()[type].get(category) ?? OTHER_CATEGORY_COLOR;
  }

  getById(id: string): Movement | undefined {
    return this.storage.state().movements.find((m) => m.id === id);
  }

  add(input: MovementInput): Movement | null {
    const movement: Movement = { ...this.clean(input), id: uuid(), createdAt: new Date().toISOString() };
    const ok = this.storage.update((data) => ({ ...data, movements: [...data.movements, movement] }));
    return ok ? movement : null;
  }

  update(id: string, input: MovementInput): boolean {
    if (!this.getById(id)) return false;
    return this.storage.update((data) => ({
      ...data,
      movements: data.movements.map((m) => (m.id === id ? { ...m, ...this.clean(input) } : m)),
    }));
  }

  remove(id: string): Movement | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, movements: data.movements.filter((m) => m.id !== id) }));
    return ok ? existing : null;
  }

  /** Reinserta un movimiento eliminado (deshacer). */
  restore(movement: Movement): boolean {
    if (this.getById(movement.id)) return false;
    return this.storage.update((data) => ({ ...data, movements: [...data.movements, movement] }));
  }

  addCategory(type: MovementType, rawName: string): CategoryResult {
    const name = collapseSpaces(rawName);
    if (!name) return { ok: false, error: 'Escribe un nombre para la categoría.' };
    if (name.length > CATEGORY_MAX_LENGTH) {
      return { ok: false, error: `Máximo ${CATEGORY_MAX_LENGTH} caracteres.` };
    }
    const key = normalizeText(name);
    const existing = this.categories()[type].find((c) => normalizeText(c) === key);
    if (existing) return { ok: false, error: `Ya existe la categoría "${existing}".` };

    const ok = this.storage.update((data) => ({
      ...data,
      categories: { ...data.categories, [type]: [...data.categories[type], name] },
    }));
    return ok ? { ok: true, name } : { ok: false, error: 'No se pudo guardar la categoría.' };
  }

  /** Elimina una categoría personalizada. Los movimientos que la usan la conservan como texto. */
  removeCategory(type: MovementType, name: string): boolean {
    return this.storage.update((data) => ({
      ...data,
      categories: { ...data.categories, [type]: data.categories[type].filter((c) => c !== name) },
    }));
  }

  countByCategory(type: MovementType, name: string): number {
    return this.storage.state().movements.filter((m) => m.type === type && m.category === name).length;
  }

  loadSampleData(): number {
    const sample = generateSampleMovements().map<Movement>((input, i) => ({
      ...this.clean(input),
      id: uuid(),
      createdAt: new Date(Date.now() + i).toISOString(),
    }));
    const ok = this.storage.update((data) => ({ ...data, movements: [...data.movements, ...sample] }));
    return ok ? sample.length : 0;
  }

  exportJson(): string {
    const { movements, categories, rules } = this.storage.state();
    return JSON.stringify({ app: 'salud-financiera', exportedAt: new Date().toISOString(), movements, categories, rules }, null, 2);
  }

  /** Reemplaza movimientos, categorías y reglas con un respaldo JSON. El usuario y la bandeja actuales se conservan. */
  importJson(text: string): ImportResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'El archivo no es un JSON válido.' };
    }
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>)['movements'])) {
      return { ok: false, error: 'El archivo no contiene movimientos.' };
    }
    const { data } = sanitizeAppData(parsed);
    const { kept } = purgeOldMovements(data.movements, RETENTION_YEARS);
    const hasRules = Array.isArray((parsed as Record<string, unknown>)['rules']);
    const ok = this.storage.update((current: AppData) => ({
      ...current,
      movements: kept,
      categories: data.categories,
      rules: hasRules ? data.rules : current.rules,
    }));
    return ok ? { ok: true, count: kept.length } : { ok: false, error: 'No hay espacio suficiente en el navegador.' };
  }

  clearMovements(): boolean {
    return this.storage.update((data) => ({ ...data, movements: [] }));
  }

  private clean(input: MovementInput): MovementInput {
    return {
      type: input.type,
      category: collapseSpaces(input.category),
      amount: round2(input.amount),
      date: input.date,
      description: collapseSpaces(input.description ?? ''),
    };
  }
}
