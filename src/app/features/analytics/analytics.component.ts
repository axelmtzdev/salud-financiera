import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FinanceService } from '../../core/services/finance.service';
import { UiStateService } from '../../core/services/ui-state.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import {
  buildInsights,
  byCategory,
  chartEndDate,
  filterByRange,
  monthlySeries,
  summarize,
  toSlices,
} from '../../shared/utils/analytics.utils';
import { todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, formatPercent } from '../../shared/utils/format.utils';
import { PERIOD_OPTIONS, PeriodPreset, resolvePeriod } from '../../shared/utils/period.utils';
import { BarChartComponent } from './charts/bar-chart.component';
import { LineChartComponent } from './charts/line-chart.component';
import { PieChartComponent } from './charts/pie-chart.component';
import { CategoryBreakdownComponent } from './category-breakdown/category-breakdown.component';
import { InsightsComponent } from './insights/insights.component';

@Component({
  selector: 'app-analytics',
  imports: [
    CardComponent,
    StatTileComponent,
    DateFormatPipe,
    PieChartComponent,
    BarChartComponent,
    LineChartComponent,
    CategoryBreakdownComponent,
    InsightsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analytics.component.html',
  styles: `
    .period { display: flex; flex-direction: column; gap: 10px; }
    .period-custom { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; animation: mov-entrar var(--duracion-entrar) var(--ease-entrada) backwards; }
    .period-custom .field { flex: 1 1 150px; max-width: 220px; }
    .period-range { margin: 0; font-size: 12px; color: var(--texto-tenue); }
    .charts { display: grid; gap: 16px; }
    .two-col { display: grid; gap: 16px; }
    @media (min-width: 1024px) {
      .two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
      .charts { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 20px; }
      .charts .wide { grid-column: 1 / -1; }
    }
  `,
})
export class AnalyticsComponent {
  private readonly finance = inject(FinanceService);
  private readonly ui = inject(UiStateService);

  protected readonly options = PERIOD_OPTIONS;
  protected readonly preset = this.ui.period;
  private readonly today = todayIso();

  protected readonly range = computed(() => resolvePeriod(this.preset(), this.ui.customRange(), this.today));
  protected readonly customFrom = computed(() => this.range().from);
  protected readonly customTo = computed(() => this.range().to);

  private readonly inRange = computed(() => filterByRange(this.finance.movements(), this.range()));
  protected readonly summary = computed(() => summarize(this.inRange()));
  protected readonly expenseStats = computed(() => byCategory(this.inRange(), 'egreso'));
  protected readonly incomeStats = computed(() => byCategory(this.inRange(), 'ingreso'));
  protected readonly slices = computed(() => toSlices(this.expenseStats(), this.finance.categoryColors().egreso));
  protected readonly series = computed(() =>
    monthlySeries(this.finance.movements(), chartEndDate(this.range(), this.today), 6),
  );
  protected readonly insights = computed(() => buildInsights(this.finance.movements(), this.range(), this.today));

  protected readonly savings = computed(() => {
    const rate = this.summary().savingsRate;
    return rate === null ? '—' : formatPercent(rate, 1);
  });

  protected setPreset(preset: PeriodPreset): void {
    if (preset === 'custom' && !this.ui.customRange()) {
      // Arranca el rango personalizado con el rango actualmente visible
      this.ui.customRange.set(this.range());
    }
    this.preset.set(preset);
  }

  protected setCustom(edge: 'from' | 'to', value: string): void {
    if (!value) return;
    this.ui.customRange.set({ ...this.range(), [edge]: value });
  }

  protected fmt(value: number): string {
    return formatCurrency(value);
  }
}
