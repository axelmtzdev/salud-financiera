import { Injectable, computed, inject } from '@angular/core';
import { Movement, RecurringFrequency, RecurringPayment } from '../../shared/models/finance.models';
import { todayIso } from '../../shared/utils/date.utils';
import { round2 } from '../../shared/utils/format.utils';
import { uuid } from '../../shared/utils/id.utils';
import {
  DetectedPayment,
  currentOccurrence,
  detectRecurring,
  priceChange,
  recurringTotals,
  upcomingPayments,
} from '../../shared/utils/recurring.utils';
import { collapseSpaces, normalizeText } from '../../shared/utils/text.utils';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

const MAX_AMOUNT = 999_999_999;

export interface RecurringInput {
  name: string;
  category: string;
  amount: number;
  frequency: RecurringFrequency;
  day: number;
  month: number | null;
  /** Texto para reconocerlo; si va vacío se usa el nombre */
  match: string;
  subscription: boolean;
}

export type RecurringResult = { ok: true; payment: RecurringPayment } | { ok: false; error: string };

/** Pagos fijos y suscripciones: registro, estado del ciclo y detección en el historial. */
@Injectable({ providedIn: 'root' })
export class RecurringService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceService);
  private readonly today = todayIso();

  readonly list = computed(() =>
    [...this.storage.state().recurring].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'es')),
  );
  readonly hasAny = computed(() => this.list().length > 0);

  /** Cada pago con su vencimiento actual. */
  readonly rows = computed(() =>
    this.list().map((payment) => ({ payment, occurrence: currentOccurrence(payment, this.finance.movements(), this.today) })),
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
    if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) return { ok: false, error: 'El día debe estar entre 1 y 31.' };
    if (input.frequency === 'anual' && !(input.month && input.month >= 1 && input.month <= 12)) {
      return { ok: false, error: 'Elige el mes del pago anual.' };
    }
    const match = normalizeText(input.match) || normalizeText(name);
    if (match.length < 3) return { ok: false, error: 'El texto para reconocerlo debe tener al menos 3 letras.' };

    const existing = id ? this.storage.state().recurring.find((r) => r.id === id) : undefined;
    const payment: RecurringPayment = {
      id: existing?.id ?? uuid(),
      name: name.slice(0, 60),
      category: input.category,
      amount: round2(input.amount),
      frequency: input.frequency,
      day: input.day,
      month: input.frequency === 'anual' ? input.month : null,
      match: match.slice(0, 60),
      subscription: input.subscription,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
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
      name: d.name,
      category: d.category,
      amount: d.amount,
      frequency: 'mensual',
      day: d.day,
      month: null,
      match: d.key,
      subscription: d.subscription,
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

  /** Registra el egreso del pago con fecha de hoy; la descripción lleva el nombre para que se reconozca. */
  markPaid(payment: RecurringPayment): Movement | null {
    return this.finance.add({
      type: 'egreso',
      category: payment.category,
      amount: payment.amount,
      date: this.today,
      description: payment.name,
    });
  }
}
