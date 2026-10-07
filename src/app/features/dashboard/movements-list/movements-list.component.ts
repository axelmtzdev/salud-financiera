import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../../core/services/confirm.service';
import { FinanceService } from '../../../core/services/finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { EMPTY_FILTERS, MovementFilters, UiStateService } from '../../../core/services/ui-state.service';
import { MOVEMENT_TYPE_LABEL } from '../../../shared/models/categories';
import { Movement } from '../../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { summarize } from '../../../shared/utils/analytics.utils';
import { formatCurrency } from '../../../shared/utils/format.utils';
import { normalizeText } from '../../../shared/utils/text.utils';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-movements-list',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movements-list.component.html',
  styleUrl: './movements-list.component.scss',
})
export class MovementsListComponent {
  protected readonly finance = inject(FinanceService);
  private readonly ui = inject(UiStateService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly filters = this.ui.filters;
  protected readonly page = signal(1);
  protected readonly showFilters = signal(false);

  protected readonly hasMovements = computed(() => this.finance.movements().length > 0);

  protected readonly categoryOptions = computed(() => {
    const { type } = this.filters();
    const cats = this.finance.filterableCategories();
    if (type !== 'all') return cats[type];
    return [...new Set([...cats.ingreso, ...cats.egreso])].sort((a, b) => a.localeCompare(b, 'es'));
  });

  protected readonly rangeInvalid = computed(() => {
    const { from, to } = this.filters();
    return !!from && !!to && from > to;
  });

  protected readonly filtered = computed(() => {
    const f = this.filters();
    const query = normalizeText(f.search);
    return this.finance.movements().filter(
      (m) =>
        (f.type === 'all' || m.type === f.type) &&
        (f.category === 'all' || m.category === f.category) &&
        (!f.from || m.date >= f.from) &&
        (!f.to || m.date <= f.to) &&
        (!query || normalizeText(m.description).includes(query)),
    );
  });

  protected readonly visible = computed(() => this.filtered().slice(0, this.page() * PAGE_SIZE));
  protected readonly totals = computed(() => summarize(this.filtered()));

  protected readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return (Object.keys(EMPTY_FILTERS) as (keyof MovementFilters)[]).filter((k) => f[k] !== EMPTY_FILTERS[k]).length;
  });

  protected setFilter<K extends keyof MovementFilters>(key: K, value: MovementFilters[K]): void {
    this.filters.update((current) => {
      const next = { ...current, [key]: value };
      if (key === 'type' && next.type !== 'all' && next.category !== 'all') {
        if (!this.finance.filterableCategories()[next.type].includes(next.category)) next.category = 'all';
      }
      return next;
    });
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
  }

  protected loadMore(): void {
    this.page.update((p) => p + 1);
  }

  protected loadSample(): void {
    const count = this.finance.loadSampleData();
    if (count) this.toast.success(`Se cargaron ${count} movimientos de ejemplo.`);
    else this.toast.error('No se pudieron cargar los datos de ejemplo.');
  }

  protected async remove(movement: Movement): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar movimiento',
      message: `¿Eliminar el ${this.typeLabel[movement.type].toLowerCase()} de ${formatCurrency(movement.amount)} en ${movement.category}?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const removed = this.finance.remove(movement.id);
    if (!removed) {
      this.toast.error('No se pudo eliminar el movimiento.');
      return;
    }
    this.toast.success('Movimiento eliminado', { label: 'Deshacer', run: () => this.finance.restore(removed) });
  }
}
