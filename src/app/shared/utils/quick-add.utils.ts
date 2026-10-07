import { MerchantRule, MOVEMENT_TYPES, MovementType, PendingMovement } from '../models/finance.models';
import { addYears, isValidIsoDate, todayIso } from './date.utils';
import { round2 } from './format.utils';
import { collapseSpaces, normalizeText } from './text.utils';

const MAX_AMOUNT = 999_999_999;
/** Ventana para descartar el mismo cargo recibido dos veces (doble ejecución del atajo, recarga). */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export type QuickAddInput = Omit<PendingMovement, 'id' | 'receivedAt'>;
export type QuickAddResult = { ok: true; value: QuickAddInput } | { ok: false; error: string };

/**
 * Convierte el monto que manda el atajo en número. Acepta símbolos y separadores locales:
 * "$1,234.50", "MX$ 152.5", "1.234,50", "152,50", "-80".
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // El separador que aparece al final es el decimal
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // Solo comas: decimal si hay una y le siguen 1-2 dígitos ("152,50"); si no, son miles ("1,234")
    const decimals = s.length - lastComma - 1;
    s = s.split(',').length === 2 && decimals > 0 && decimals <= 2 ? s.replace(',', '.') : s.split(',').join('');
  } else if (lastDot >= 0 && s.split('.').length > 2) {
    // Varios puntos: separadores de miles ("1.234.567")
    s = s.split('.').join('');
  }
  const value = Number(s);
  return Number.isFinite(value) ? round2(value) : null;
}

/**
 * Lee los datos del fragmento de la URL (`#monto=…&comercio=…&tarjeta=…&tipo=…&fecha=…`).
 * Se usa el fragmento y no la query (`?`) porque el navegador nunca lo envía al servidor.
 */
export function parseQuickAdd(fragment: string, today = todayIso()): QuickAddResult {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const get = (...keys: string[]) => keys.map((k) => params.get(k)).find((v) => v !== null)?.trim() ?? '';

  const rawAmount = get('monto', 'importe', 'amount');
  if (!rawAmount) return { ok: false, error: 'No llegó el monto del cargo.' };
  const amount = parseAmount(rawAmount);
  if (amount === null || amount <= 0) return { ok: false, error: `El monto "${rawAmount}" no es válido.` };
  if (amount > MAX_AMOUNT) return { ok: false, error: 'El monto es demasiado grande.' };

  const rawType = normalizeText(get('tipo', 'type'));
  const type: MovementType = MOVEMENT_TYPES.includes(rawType as MovementType) ? (rawType as MovementType) : 'egreso';

  const rawDate = get('fecha', 'date');
  let date = today;
  if (rawDate) {
    if (!isValidIsoDate(rawDate)) return { ok: false, error: `La fecha "${rawDate}" debe tener formato AAAA-MM-DD.` };
    if (rawDate < addYears(today, -2) || rawDate > addYears(today, 1)) {
      return { ok: false, error: 'La fecha está fuera del rango permitido.' };
    }
    date = rawDate;
  }

  return {
    ok: true,
    value: {
      type,
      amount,
      merchant: collapseSpaces(get('comercio', 'merchant')).slice(0, 80),
      card: collapseSpaces(get('tarjeta', 'card')).slice(0, 40),
      date,
    },
  };
}

/** Regla más específica (patrón más largo) cuyo texto aparece en el comercio. */
export function matchRule(rules: readonly MerchantRule[], merchant: string, type: MovementType): MerchantRule | undefined {
  const name = normalizeText(merchant);
  if (!name) return undefined;
  return rules
    .filter((r) => r.type === type && name.includes(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

/** ¿Ya se recibió este mismo cargo hace menos de 2 minutos? */
export function isDuplicate(pending: readonly PendingMovement[], input: QuickAddInput, now = Date.now()): boolean {
  const merchant = normalizeText(input.merchant);
  return pending.some(
    (p) =>
      p.amount === input.amount &&
      p.type === input.type &&
      normalizeText(p.merchant) === merchant &&
      now - Date.parse(p.receivedAt) < DUPLICATE_WINDOW_MS,
  );
}

/** Plantilla de URL para el atajo, con marcadores donde van las variables. */
export function quickAddTemplate(origin: string): string {
  return `${origin}/registro-rapido#monto=[Importe]&comercio=[Comercio]&tarjeta=[Tarjeta]`;
}
