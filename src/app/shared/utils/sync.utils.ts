import { AppData, CustomCategories, MOVEMENT_TYPES, OpeningBalance } from '../models/finance.models';
import { normalizeText } from './text.utils';

/**
 * Sincronización con el servidor. Lo comparten el frontend (calcula qué cambió) y el backend
 * (aplica los cambios), así ambos identifican cada registro con la misma clave.
 */
export const COLLECTIONS = ['movements', 'pending', 'recurring', 'rules', 'budgets', 'transfers'] as const;
export type Collection = (typeof COLLECTIONS)[number];
export type ItemOf<C extends Collection> = AppData[C][number];

/** Cambios entre dos estados: registros nuevos o modificados, claves eliminadas y listas que se reemplazan completas. */
export interface DataChanges {
  upsert: { [C in Collection]?: AppData[C] };
  remove: { [C in Collection]?: string[] };
  categories?: CustomCategories;
  recurringIgnored?: string[];
  /** null = se quitó el saldo inicial */
  opening?: OpeningBalance | null;
}

/** Clave única de un registro dentro de su colección. */
export function itemKey<C extends Collection>(collection: C, item: ItemOf<C>): string {
  switch (collection) {
    case 'rules': {
      const rule = item as ItemOf<'rules'>;
      return `${rule.type}:${rule.pattern}`;
    }
    case 'budgets':
      return normalizeText((item as ItemOf<'budgets'>).category);
    default:
      return (item as ItemOf<'movements'>).id;
  }
}

/**
 * Qué cambió de `prev` a `next`. Los estados son inmutables, así que un registro con la misma
 * referencia no cambió; uno con referencia distinta se reenvía completo.
 */
export function diffAppData(prev: AppData, next: AppData): DataChanges {
  const changes: DataChanges = { upsert: {}, remove: {} };
  for (const collection of COLLECTIONS) {
    if (prev[collection] === next[collection]) continue;
    const before = new Map<string, unknown>(prev[collection].map((item) => [itemKey(collection, item), item]));
    const nextKeys = new Set<string>();
    const upserts: unknown[] = [];
    for (const item of next[collection]) {
      const key = itemKey(collection, item);
      nextKeys.add(key);
      if (before.get(key) !== item) upserts.push(item);
    }
    const removed = [...before.keys()].filter((key) => !nextKeys.has(key));
    if (upserts.length) (changes.upsert as Record<string, unknown[]>)[collection] = upserts;
    if (removed.length) changes.remove[collection] = removed;
  }
  if (prev.categories !== next.categories) changes.categories = next.categories;
  if (prev.recurringIgnored !== next.recurringIgnored) changes.recurringIgnored = next.recurringIgnored;
  if (prev.opening !== next.opening) changes.opening = next.opening;
  return changes;
}

export function isEmptyChanges(changes: DataChanges): boolean {
  return (
    Object.keys(changes.upsert).length === 0 &&
    Object.keys(changes.remove).length === 0 &&
    changes.categories === undefined &&
    changes.recurringIgnored === undefined &&
    changes.opening === undefined
  );
}

/** Agrega a `base` lo que solo existe en `extra` (p. ej. los datos que vivían en el navegador). Si ambos lo tienen, gana `base`. */
export function mergeAppData(base: AppData, extra: AppData): AppData {
  const merged: AppData = { ...base };
  for (const collection of COLLECTIONS) {
    const keys = new Set(base[collection].map((item) => itemKey(collection, item)));
    const added = extra[collection].filter((item) => !keys.has(itemKey(collection, item)));
    if (added.length) (merged as unknown as Record<string, unknown[]>)[collection] = [...base[collection], ...added];
  }

  const categories = { ...base.categories };
  for (const type of MOVEMENT_TYPES) {
    const taken = new Set(base.categories[type].map(normalizeText));
    const added = extra.categories[type].filter((c) => !taken.has(normalizeText(c)));
    if (added.length) categories[type] = [...base.categories[type], ...added];
  }
  if (categories.ingreso !== base.categories.ingreso || categories.egreso !== base.categories.egreso) {
    merged.categories = categories;
  }

  const ignored = extra.recurringIgnored.filter((k) => !base.recurringIgnored.includes(k));
  if (ignored.length) merged.recurringIgnored = [...base.recurringIgnored, ...ignored];
  if (!base.opening && extra.opening) merged.opening = extra.opening;
  return merged;
}

/** Cuántos registros tiene un respaldo o los datos de un navegador (para describirlos al usuario). */
export function countRecords(data: AppData): number {
  return COLLECTIONS.reduce((total, c) => total + data[c].length, 0);
}
