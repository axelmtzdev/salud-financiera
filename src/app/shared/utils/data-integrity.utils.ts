import { CATEGORY_MAX_LENGTH, DEFAULT_CATEGORIES, DESCRIPTION_MAX_LENGTH } from '../models/categories';
import {
  ACCOUNT_KINDS,
  AccountKind,
  AppData,
  Budget,
  CustomCategories,
  MerchantRule,
  Movement,
  MOVEMENT_TYPES,
  MovementType,
  PendingMovement,
  OpeningBalance,
  RecurringPayment,
  Transfer,
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

/** Valida y repara datos de origen no confiable (servidor, caché, un respaldo importado o lo que manda el cliente). */
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
      movements,
      categories: sanitizeCategories(raw['categories']),
      pending: sanitizeList(raw['pending'], sanitizePending).slice(-MAX_PENDING),
      rules: sanitizeList(raw['rules'], sanitizeRule),
      budgets: sanitizeBudgets(raw['budgets']),
      recurring: sanitizeList(raw['recurring'], sanitizeRecurring),
      recurringIgnored: Array.isArray(raw['recurringIgnored'])
        ? [...new Set(raw['recurringIgnored'].filter(nonEmptyString).map((k) => normalizeText(k).slice(0, 80)))]
        : [],
      transfers: sanitizeList(raw['transfers'], sanitizeTransfer),
      opening: sanitizeOpening(raw['opening']),
    },
    discarded,
  };
}

const isAccount = (value: unknown): value is AccountKind => ACCOUNT_KINDS.includes(value as AccountKind);
const validTimestamp = (value: unknown): string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString();

export function sanitizeTransfer(raw: unknown): Transfer | null {
  if (!isRecord(raw)) return null;
  const { id, from, to, amount, date, description, createdAt } = raw;
  if (!isAccount(from) || !isAccount(to) || from === to) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  if (!isValidIsoDate(date)) return null;
  return {
    id: nonEmptyString(id) ? id : uuid(),
    from,
    to,
    amount: round2(amount),
    date,
    description: typeof description === 'string' ? collapseSpaces(description).slice(0, DESCRIPTION_MAX_LENGTH) : '',
    createdAt: validTimestamp(createdAt),
  };
}

/**
 * Saldo inicial con fecha válida. Puede ser negativo: al recorrerlo hacia adelante (ver
 * `rollOpeningForward`) una cuenta con más gastos registrados que dinero queda en negativo.
 */
export function sanitizeOpening(raw: unknown): OpeningBalance | null {
  if (!isRecord(raw) || !isValidIsoDate(raw['date'])) return null;
  const amount = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT ? round2(value) : null;
  const efectivo = amount(raw['efectivo']);
  const banco = amount(raw['banco']);
  if (efectivo === null || banco === null) return null;
  return { date: raw['date'] as string, efectivo, banco };
}

export function sanitizeRecurring(raw: unknown): RecurringPayment | null {
  if (!isRecord(raw)) return null;
  const { id, name, category, amount, frequency, day, month, match, subscription, createdAt } = raw;
  if (!nonEmptyString(name) || !nonEmptyString(category)) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  if (frequency !== 'mensual' && frequency !== 'anual') return null;
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31) return null;
  const validMonth = Number.isInteger(month) && (month as number) >= 1 && (month as number) <= 12;
  if (frequency === 'anual' && !validMonth) return null;
  const cleanName = collapseSpaces(name).slice(0, 60);
  return {
    id: nonEmptyString(id) ? id : uuid(),
    name: cleanName,
    category: collapseSpaces(category).slice(0, 40),
    amount: round2(amount),
    frequency,
    day: day as number,
    month: frequency === 'anual' ? (month as number) : null,
    match: normalizeText(nonEmptyString(match) ? match : cleanName).slice(0, 60),
    subscription: subscription === true,
    createdAt:
      typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)) ? createdAt : new Date().toISOString(),
  };
}

/** Un presupuesto por categoría (sin distinguir mayúsculas ni acentos); el primero gana. */
export function sanitizeBudgets(raw: unknown): Budget[] {
  const seen = new Set<string>();
  const result: Budget[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item)) continue;
    const { category, amount } = item;
    if (!nonEmptyString(category)) continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;
    const name = collapseSpaces(category).slice(0, 40);
    const key = normalizeText(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ category: name, amount: round2(amount) });
  }
  return result;
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

export function sanitizeRule(raw: unknown): MerchantRule | null {
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
  const { type, amount, category, date, description, id, account, createdAt } = raw;

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
    // Los movimientos anteriores a las formas de pago se consideran de tarjeta/transferencia
    account: isAccount(account) ? account : 'banco',
    createdAt: validTimestamp(createdAt),
  };
}

export function sanitizeCategories(raw: unknown): CustomCategories {
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
