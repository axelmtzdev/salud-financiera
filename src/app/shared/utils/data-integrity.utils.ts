import { CATEGORY_MAX_LENGTH, DEFAULT_CATEGORIES, DESCRIPTION_MAX_LENGTH } from '../models/categories';
import {
  AppData,
  CustomCategories,
  MerchantRule,
  Movement,
  MOVEMENT_TYPES,
  MovementType,
  PendingMovement,
  UserProfile,
  createEmptyData,
} from '../models/finance.models';
import { addYears, isValidIsoDate, todayIso } from './date.utils';
import { round2 } from './format.utils';
import { uuid } from './id.utils';
import { collapseSpaces, normalizeText } from './text.utils';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const MAX_AMOUNT = 1_000_000_000;

export interface SanitizeResult {
  data: AppData;
  /** Movimientos descartados por estar corruptos o duplicados */
  discarded: number;
}

/** Valida y repara datos de origen no confiable (localStorage o un respaldo importado). */
export function sanitizeAppData(raw: unknown): SanitizeResult {
  if (!isRecord(raw)) return { data: createEmptyData(), discarded: 0 };

  const seen = new Set<string>();
  const movements: Movement[] = [];
  let discarded = 0;
  for (const item of Array.isArray(raw['movements']) ? raw['movements'] : []) {
    const movement = sanitizeMovement(item);
    if (!movement || seen.has(movement.id)) {
      discarded++;
      continue;
    }
    seen.add(movement.id);
    movements.push(movement);
  }

  return {
    data: {
      version: 1,
      user: sanitizeUser(raw['user']),
      movements,
      categories: sanitizeCategories(raw['categories']),
      pending: sanitizeList(raw['pending'], sanitizePending).slice(-MAX_PENDING),
      rules: sanitizeList(raw['rules'], sanitizeRule),
    },
    discarded,
  };
}

export const MAX_PENDING = 200;

function sanitizeList<T>(raw: unknown, sanitize: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitize).filter((item): item is T => item !== null);
}

export function sanitizePending(raw: unknown): PendingMovement | null {
  if (!isRecord(raw)) return null;
  const { id, type, amount, merchant, card, date, receivedAt } = raw;
  if (!MOVEMENT_TYPES.includes(type as MovementType)) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  if (!isValidIsoDate(date)) return null;
  return {
    id: nonEmptyString(id) ? id : uuid(),
    type: type as MovementType,
    amount: round2(amount),
    merchant: typeof merchant === 'string' ? collapseSpaces(merchant).slice(0, 80) : '',
    card: typeof card === 'string' ? collapseSpaces(card).slice(0, 40) : '',
    date,
    receivedAt:
      typeof receivedAt === 'string' && !Number.isNaN(Date.parse(receivedAt)) ? receivedAt : new Date().toISOString(),
  };
}

function sanitizeRule(raw: unknown): MerchantRule | null {
  if (!isRecord(raw)) return null;
  const { pattern, label, type, category } = raw;
  if (!nonEmptyString(pattern) || !nonEmptyString(category)) return null;
  if (!MOVEMENT_TYPES.includes(type as MovementType)) return null;
  return {
    pattern: normalizeText(pattern).slice(0, 80),
    label: nonEmptyString(label) ? collapseSpaces(label).slice(0, 80) : pattern,
    type: type as MovementType,
    category: collapseSpaces(category).slice(0, 40),
  };
}

export function sanitizeMovement(raw: unknown): Movement | null {
  if (!isRecord(raw)) return null;
  const { type, amount, category, date, description, id, createdAt } = raw;

  if (!MOVEMENT_TYPES.includes(type as MovementType)) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  if (!nonEmptyString(category)) return null;
  if (!isValidIsoDate(date)) return null;

  return {
    id: nonEmptyString(id) ? id : uuid(),
    type: type as MovementType,
    category: collapseSpaces(category).slice(0, 40),
    amount: round2(amount),
    date,
    description: typeof description === 'string' ? collapseSpaces(description).slice(0, DESCRIPTION_MAX_LENGTH) : '',
    createdAt:
      typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)) ? createdAt : new Date().toISOString(),
  };
}

function sanitizeUser(raw: unknown): UserProfile | null {
  if (!isRecord(raw)) return null;
  const { name, secretQuestion, secretAnswer, salt } = raw;
  if (![name, secretQuestion, secretAnswer, salt].every(nonEmptyString)) return null;
  return {
    name: (name as string).trim(),
    secretQuestion: (secretQuestion as string).trim(),
    secretAnswer: secretAnswer as string,
    salt: salt as string,
  };
}

function sanitizeCategories(raw: unknown): CustomCategories {
  const result: CustomCategories = { ingreso: [], egreso: [] };
  if (!isRecord(raw)) return result;
  for (const type of MOVEMENT_TYPES) {
    const list = raw[type];
    if (!Array.isArray(list)) continue;
    const taken = new Set(DEFAULT_CATEGORIES[type].map(normalizeText));
    for (const item of list) {
      if (!nonEmptyString(item)) continue;
      const name = collapseSpaces(item).slice(0, CATEGORY_MAX_LENGTH);
      const key = normalizeText(name);
      if (taken.has(key)) continue;
      taken.add(key);
      result[type].push(name);
    }
  }
  return result;
}

/** Elimina movimientos con más de `years` años de antigüedad. */
export function purgeOldMovements(
  movements: readonly Movement[],
  years: number,
  today = todayIso(),
): { kept: Movement[]; removed: number } {
  const cutoff = addYears(today, -years);
  const kept = movements.filter((m) => m.date >= cutoff);
  return { kept, removed: movements.length - kept.length };
}
