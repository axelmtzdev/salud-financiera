import { Injectable, computed, inject } from '@angular/core';
import { Budget } from '../../shared/models/finance.models';
import { BudgetLine, BudgetSuggestion, budgetLineFor, budgetOverview, suggestBudgets } from '../../shared/utils/budget.utils';
import { monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, formatPercent, round2 } from '../../shared/utils/format.utils';
import { normalizeText } from '../../shared/utils/text.utils';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

const MAX_BUDGET = 999_999_999;

export type BudgetResult = { ok: true } | { ok: false; error: string };

/** Topes mensuales por categoría de egreso. */
@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceService);

  readonly budgets = computed(() => this.storage.state().budgets);
  readonly hasBudgets = computed(() => this.budgets().length > 0);

  /** Estado del mes en curso. */
  readonly current = computed(() => this.overview(monthKey(todayIso())));

  overview(month: string) {
    return budgetOverview(this.budgets(), this.finance.movements(), month);
  }

  lineFor(category: string, date: string): BudgetLine | null {
    return budgetLineFor(this.budgets(), this.finance.movements(), category, monthKey(date));
  }

  /** Frase para el aviso al registrar un egreso; null si la categoría no tiene presupuesto. */
  noteFor(category: string, date: string): { text: string; alert: boolean } | null {
    const line = this.lineFor(category, date);
    if (!line) return null;
    const month = monthKey(date) === monthKey(todayIso()) ? 'este mes' : `en ${monthLabel(monthKey(date), true)}`;
    switch (line.level) {
      case 'over':
        return { text: `Excediste tu presupuesto de ${category} por ${formatCurrency(-line.remaining)} ${month}.`, alert: true };
      case 'warning':
        return {
          text: `Llevas el ${formatPercent(line.ratio)} de tu presupuesto de ${category}: quedan ${formatCurrency(line.remaining)}.`,
          alert: true,
        };
      default:
        return { text: `Quedan ${formatCurrency(line.remaining)} de tu presupuesto de ${category}.`, alert: false };
    }
  }

  suggestions(): BudgetSuggestion[] {
    return suggestBudgets(this.budgets(), this.finance.movements());
  }

  /** Crea o actualiza el tope de una categoría. */
  set(category: string, amount: number): BudgetResult {
    if (!category) return { ok: false, error: 'Elige una categoría.' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'El monto debe ser mayor a cero.' };
    if (amount > MAX_BUDGET) return { ok: false, error: 'El monto es demasiado grande.' };
    const key = normalizeText(category);
    const budget: Budget = { category, amount: round2(amount) };
    const ok = this.storage.update((data) => {
      const exists = data.budgets.some((b) => normalizeText(b.category) === key);
      return {
        ...data,
        budgets: exists
          ? data.budgets.map((b) => (normalizeText(b.category) === key ? budget : b))
          : [...data.budgets, budget],
      };
    });
    return ok ? { ok: true } : { ok: false, error: 'No se pudo guardar el presupuesto.' };
  }

  /** Agrega varios topes a la vez (sugerencias); no reemplaza los existentes. */
  addMany(items: readonly Budget[]): number {
    const taken = new Set(this.budgets().map((b) => normalizeText(b.category)));
    const fresh = items.filter((b) => b.amount > 0 && !taken.has(normalizeText(b.category)));
    if (!fresh.length) return 0;
    const ok = this.storage.update((data) => ({ ...data, budgets: [...data.budgets, ...fresh] }));
    return ok ? fresh.length : 0;
  }

  remove(category: string): Budget | null {
    const existing = this.budgets().find((b) => b.category === category);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, budgets: data.budgets.filter((b) => b.category !== category) }));
    return ok ? existing : null;
  }

  /** Reinserta un tope eliminado (deshacer). */
  restore(budget: Budget): boolean {
    return this.addMany([budget]) === 1;
  }
}
