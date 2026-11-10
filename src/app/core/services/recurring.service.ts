import { Injectable, computed, inject } from '@angular/core';
import { Movement, PaymentKind, RecurringFrequency, RecurringPayment } from '../../shared/models/finance.models';
import { isValidIsoDate, monthKey, todayIso } from '../../shared/utils/date.utils';
import { round2 } from '../../shared/utils/format.utils';
import { uuid } from '../../shared/utils/id.utils';
import {
  DetectedPayment,
  Occurrence,
  currentOccurrence,
  detectRecurring,
  installmentProgress,
  priceChange,
  recurringTotals,
  upcomingPayments,
} from '../../shared/utils/recurring.utils';
import { collapseSpaces, normalizeText } from '../../shared/utils/text.utils';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

const MAX_AMOUNT = 999_999_999;

export interface RecurringInput {
  kind: PaymentKind;
  name: string;
  category: string;
  amount: number;
  frequency: RecurringFrequency;
  day: number;
  month: number | null;
  /** Texto para reconocerlo; si va vacío se usa el nombre */
  match: string;
  subscription: boolean;
  /** plazos */
  installments: number | null;
  startMonth: string | null;
  /** unico */
  date: string | null;
}

const MAX_INSTALLMENTS = 360;

export type RecurringResult = { ok: true; payment: RecurringPayment } | { ok: false; error: string };

/** Pagos fijos, créditos a plazos, montos variables y pagos únicos: registro, estado y detección en el historial. */
@Injectable({ providedIn: 'root' })
export class RecurringService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceService);
  private readonly today = todayIso();

  /** Los que se repiten por día de vencimiento; los únicos al final, por fecha. */
  readonly list = computed(() =>
    [...this.storage.state().recurring].sort(
      (a, b) =>
        Number(a.kind === 'unico') - Number(b.kind === 'unico') ||
        (a.kind === 'unico' && b.kind === 'unico' ? a.date!.localeCompare(b.date!) : a.day - b.day) ||
        a.name.localeCompare(b.name, 'es'),
    ),
  );
  readonly hasAny = computed(() => this.list().length > 0);

  /** Cada pago con su vencimiento actual y, si es a plazos, su avance. */
  readonly rows = computed(() =>
    this.list().map((payment) => ({
      payment,
      occurrence: currentOccurrence(payment, this.finance.movements(), this.today),
      progress: installmentProgress(payment, this.finance.movements()),
    })),
  );
  readonly upcoming = computed(() => upcomingPayments(this.list(), this.finance.movements(), this.today, 30));
  readonly totals = computed(() => recurringTotals(this.list(), this.finance.movements(), this.today));
  readonly priceChanges = computed(() =>
    this.list()
      .map((r) => priceChange(r, this.finance.movements(), this.today))
      .filter((c) => c !== null),
  );
  readonly detected = computed(() =>
    detectRecurring(this.finance.movements(), this.list(), this.storage.state().recurringIgnored, this.today),
  );

  save(input: RecurringInput, id?: string): RecurringResult {
    const name = collapseSpaces(input.name);
    if (!name) return { ok: false, error: 'Escribe un nombre.' };
    if (!input.category) return { ok: false, error: 'Elige una categoría.' };
    if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'El monto debe ser mayor a cero.' };
    if (input.amount > MAX_AMOUNT) return { ok: false, error: 'El monto es demasiado grande.' };
    const { kind } = input;
    if (kind === 'unico') {
      if (!input.date || !isValidIsoDate(input.date)) return { ok: false, error: 'Elige la fecha del pago.' };
    } else if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) {
      return { ok: false, error: 'El día debe estar entre 1 y 31.' };
    }
    if (kind === 'fijo' && input.frequency === 'anual' && !(input.month && input.month >= 1 && input.month <= 12)) {
      return { ok: false, error: 'Elige el mes del pago anual.' };
    }
    if (kind === 'plazos') {
      if (!Number.isInteger(input.installments) || input.installments! < 1 || input.installments! > MAX_INSTALLMENTS) {
        return { ok: false, error: `El número de pagos debe estar entre 1 y ${MAX_INSTALLMENTS}.` };
      }
      if (!input.startMonth || !/^\d{4}-\d{2}$/.test(input.startMonth)) return { ok: false, error: 'Elige el mes del primer pago.' };
    }
    const match = normalizeText(input.match) || normalizeText(name);
    if (match.length < 3) return { ok: false, error: 'El texto para reconocerlo debe tener al menos 3 letras.' };

    const existing = id ? this.storage.state().recurring.find((r) => r.id === id) : undefined;
    const frequency: RecurringFrequency = kind === 'fijo' ? input.frequency : 'mensual';
    const payment: RecurringPayment = {
      id: existing?.id ?? uuid(),
      name: name.slice(0, 60),
      category: input.category,
      amount: round2(input.amount),
      frequency,
      day: kind === 'unico' ? Number(input.date!.slice(8)) : input.day,
      month: frequency === 'anual' ? input.month : null,
      match: match.slice(0, 60),
      subscription: kind === 'fijo' && input.subscription,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      kind,
      installments: kind === 'plazos' ? input.installments : null,
      startMonth: kind === 'plazos' ? input.startMonth : null,
      date: kind === 'unico' ? input.date : null,
      // Los montos ya capturados de un variable se conservan al editarlo
      amounts: kind === 'variable' && existing?.kind === 'variable' ? existing.amounts : {},
      paidDues: existing?.paidDues ?? [],
    };
    const ok = this.storage.update((data) => ({
      ...data,
      recurring: existing ? data.recurring.map((r) => (r.id === payment.id ? payment : r)) : [...data.recurring, payment],
    }));
    return ok ? { ok: true, payment } : { ok: false, error: 'No se pudo guardar el pago.' };
  }

  /** Registra un pago detectado con lo que se vio en el historial. */
  addDetected(d: DetectedPayment): RecurringResult {
    return this.save({
      kind: 'fijo',
      name: d.name,
      category: d.category,
      amount: d.amount,
      frequency: 'mensual',
      day: d.day,
      month: null,
      match: d.key,
      subscription: d.subscription,
      installments: null,
      startMonth: null,
      date: null,
    });
  }

  ignore(key: string): boolean {
    return this.storage.update((data) => ({
      ...data,
      recurringIgnored: [...new Set([...data.recurringIgnored, normalizeText(key)])],
    }));
  }

  /** Vuelve a mostrar las detecciones descartadas. */
  clearIgnored(): boolean {
    return this.storage.update((data) => ({ ...data, recurringIgnored: [] }));
  }

  readonly ignoredCount = computed(() => this.storage.state().recurringIgnored.length);

  updateAmount(id: string, amount: number): boolean {
    return this.storage.update((data) => ({
      ...data,
      recurring: data.recurring.map((r) => (r.id === id ? { ...r, amount: round2(amount) } : r)),
    }));
  }

  /** Monto real de un mes en un pago variable (ej. el del estado de cuenta de la tarjeta). */
  setMonthAmount(id: string, month: string, amount: number): boolean {
    return this.storage.update((data) => ({
      ...data,
      recurring: data.recurring.map((r) => (r.id === id ? { ...r, amounts: { ...r.amounts, [month]: round2(amount) } } : r)),
    }));
  }

  remove(id: string): RecurringPayment | null {
    const existing = this.storage.state().recurring.find((r) => r.id === id);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, recurring: data.recurring.filter((r) => r.id !== id) }));
    return ok ? existing : null;
  }

  restore(payment: RecurringPayment): boolean {
    if (this.storage.state().recurring.some((r) => r.id === payment.id)) return false;
    return this.storage.update((data) => ({ ...data, recurring: [...data.recurring, payment] }));
  }

  /**
   * Registra el egreso de un vencimiento con fecha de hoy y marca ese vencimiento como pagado (así
   * cuenta aunque se adelante el pago). En los variables, el monto pagado queda como el de ese mes.
   */
  markPaid(o: Occurrence): Movement | null {
    const movement = this.finance.add({
      type: 'egreso',
      category: o.payment.category,
      amount: o.amount,
      date: this.today,
      description: o.payment.name,
      account: 'banco',
    });
    if (!movement) return null;
    const month = monthKey(o.due);
    this.storage.update((data) => ({
      ...data,
      recurring: data.recurring.map((r) =>
        r.id === o.payment.id
          ? {
              ...r,
              paidDues: [...new Set([...r.paidDues, o.due])].sort(),
              amounts: r.kind === 'variable' ? { ...r.amounts, [month]: o.amount } : r.amounts,
            }
          : r,
      ),
    }));
    return movement;
  }

  /** Deshace "Marcar pagado": borra el egreso y la marca del vencimiento. */
  undoPaid(o: Occurrence, movement: Movement): void {
    this.finance.remove(movement.id);
    this.storage.update((data) => ({
      ...data,
      recurring: data.recurring.map((r) => (r.id === o.payment.id ? { ...r, paidDues: r.paidDues.filter((d) => d !== o.due) } : r)),
    }));
  }
}
