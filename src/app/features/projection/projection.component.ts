import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ProjectionService } from '../../core/services/projection.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { MonthlyPoint } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { monthLabel } from '../../shared/utils/date.utils';
import { formatCurrency, joinSpanish } from '../../shared/utils/format.utils';
import { LineChartComponent } from '../analytics/charts/line-chart.component';

const HORIZONS = [3, 6, 12] as const;

/** Saldo libre proyectado mes a mes. */
@Component({
  selector: 'app-projection',
  imports: [RouterLink, LucideDynamicIcon, CardComponent, StatTileComponent, LineChartComponent, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projection.component.html',
  styleUrl: './projection.component.scss',
})
export class ProjectionComponent {
  protected readonly projection = inject(ProjectionService);

  protected readonly horizons = HORIZONS;
  protected readonly horizon = signal<number>(6);

  protected readonly result = computed(() => this.projection.project(this.horizon()));
  protected readonly last = computed(() => this.result().months.at(-1)!);

  /** Puntos para la gráfica: la línea es el saldo libre al cierre de cada mes. */
  protected readonly chartPoints = computed<MonthlyPoint[]>(() =>
    this.result().months.map((m) => ({
      key: m.key,
      label: m.label,
      income: m.income,
      expense: m.variable + m.recurring + m.planned + m.goals,
      net: m.balance,
    })),
  );

  protected readonly basisText = computed(() => {
    const { basis } = this.result();
    if (!basis.months.length) return null;
    return joinSpanish(basis.months.map((key) => monthLabel(key, true).split(' de ')[0]));
  });

  protected fmt(value: number): string {
    return formatCurrency(value);
  }

  /** "+$1,200.00" o "−$800.00" */
  protected signed(value: number): string {
    return (value < 0 ? '−' : '+') + formatCurrency(Math.abs(value));
  }

  protected monthName(key: string): string {
    return monthLabel(key, true);
  }
}
