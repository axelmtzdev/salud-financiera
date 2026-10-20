import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { BudgetService } from '../../core/services/budget.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { FinanceService } from '../../core/services/finance.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { BudgetLine, SUGGESTION_MONTHS } from '../../shared/utils/budget.utils';
import { daysInMonth, lastMonthKeys, monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, formatPercent } from '../../shared/utils/format.utils';
import { normalizeText } from '../../shared/utils/text.utils';

/** Topes mensuales por categoría: cuánto llevas, cuánto te queda y a qué ritmo vas. */
@Component({
  selector: 'app-budgets',
  imports: [LucideDynamicIcon, CardComponent, StatTileComponent, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './budgets.component.html',
  styleUrl: './budgets.component.scss',
})
export class BudgetsComponent {
  protected readonly finance = inject(FinanceService);
  private readonly budgets = inject(BudgetService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly currentMonth = monthKey(todayIso());
  protected readonly monthOptions = lastMonthKeys(this.currentMonth, 12)
    .reverse()
    .map((key) => ({ key, label: capitalize(monthLabel(key, true)) }));
  protected readonly month = signal(this.currentMonth);
  protected readonly isCurrent = computed(() => this.month() === this.currentMonth);

  protected readonly hasBudgets = this.budgets.hasBudgets;
  protected readonly overview = computed(() => this.budgets.overview(this.month()));
  protected readonly suggestions = computed(() => this.budgets.suggestions());
  protected readonly suggestionMonths = SUGGESTION_MONTHS;

  /** Categorías de egreso que aún no tienen tope. */
  protected readonly freeCategories = computed(() => {
    const taken = new Set(this.budgets.budgets().map((b) => normalizeText(b.category)));
    return this.finance.categories().egreso.filter((c) => !taken.has(normalizeText(c)));
  });

  // Alta de un presupuesto
  protected readonly newCategory = signal('');
  protected readonly newAmount = signal('');
  protected readonly newError = signal<string | null>(null);

  // Edición en línea
  protected readonly editing = signal<string | null>(null);
  protected readonly editAmount = signal('');
  protected readonly editError = signal<string | null>(null);

  protected readonly paceHint = computed(() => {
    const o = this.overview();
    if (!this.isCurrent() || o.day === null) return undefined;
    return `Día ${o.day} de ${daysInMonth(o.month)} del mes`;
  });

  protected fmt(value: number): string {
    return formatCurrency(value);
  }

  protected percent(ratio: number): string {
    return formatPercent(ratio);
  }

  /** Ancho de la barra (0-100), sin pasarse del contenedor cuando se excede. */
  protected width(line: BudgetLine): number {
    return Math.min(line.ratio, 1) * 100;
  }

  protected projectionWarning(line: BudgetLine): boolean {
    return line.level !== 'over' && line.projected !== null && line.projected > line.limit;
  }

  protected setMonth(value: string): void {
    this.month.set(value);
  }

  protected add(): void {
    const result = this.budgets.set(this.newCategory(), parseAmount(this.newAmount()));
    if (!result.ok) {
      this.newError.set(result.error);
      return;
    }
    this.toast.success(`Presupuesto de ${this.newCategory()}: ${this.fmt(parseAmount(this.newAmount()))} al mes`);
    this.newCategory.set('');
    this.newAmount.set('');
    this.newError.set(null);
  }

  /** Prepara el alta con una categoría que tuvo gasto y un monto redondeado. */
  protected prefill(category: string, spent: number): void {
    this.newCategory.set(category);
    this.newAmount.set(String(Math.max(100, Math.ceil(spent / 100) * 100)));
    this.newError.set(null);
    document.getElementById('budget-amount')?.focus();
  }

  protected startEdit(line: BudgetLine): void {
    this.editing.set(line.category);
    this.editAmount.set(String(line.limit));
    this.editError.set(null);
  }

  protected saveEdit(category: string): void {
    const result = this.budgets.set(category, parseAmount(this.editAmount()));
    if (!result.ok) {
      this.editError.set(result.error);
      return;
    }
    this.editing.set(null);
    this.toast.success(`Presupuesto de ${category} actualizado`);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.editError.set(null);
  }

  protected remove(category: string): void {
    const removed = this.budgets.remove(category);
    if (removed) {
      this.toast.success(`Presupuesto de ${category} eliminado`, { label: 'Deshacer', run: () => this.budgets.restore(removed) });
    }
  }

  protected async applySuggestions(): Promise<void> {
    const list = this.suggestions();
    if (!list.length) return;
    const total = list.reduce((sum, s) => sum + s.amount, 0);
    const ok = await this.confirm.ask({
      title: 'Crear presupuestos sugeridos',
      message:
        `Se crearán ${list.length} presupuestos por ${this.fmt(total)} al mes, con el promedio de tus últimos ` +
        `${SUGGESTION_MONTHS} meses redondeado a centenas: ` +
        list.map((s) => `${s.category} ${this.fmt(s.amount)}`).join(', ') +
        '. Después puedes ajustar cada uno.',
      confirmText: 'Crear presupuestos',
    });
    if (!ok) return;
    const added = this.budgets.addMany(list.map(({ category, amount }) => ({ category, amount })));
    if (added) this.toast.success(`${added} ${added === 1 ? 'presupuesto creado' : 'presupuestos creados'}`);
  }
}

/** Acepta "5000", "5,000" o "$5,000.50". */
function parseAmount(raw: string): number {
  const value = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? value : NaN;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
