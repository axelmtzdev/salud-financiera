import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { FinanceService } from '../../core/services/finance.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { buildInsights, filterByRange, summarize } from '../../shared/utils/analytics.utils';
import { monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, formatPercent } from '../../shared/utils/format.utils';
import { resolvePeriod } from '../../shared/utils/period.utils';
import { InsightsComponent } from '../analytics/insights/insights.component';
import { MovementsListComponent } from './movements-list/movements-list.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, LucideDynamicIcon, CardComponent, StatTileComponent, InsightsComponent, MovementsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Movimientos · {{ monthName }}</span>
          <h1 class="page-title">Hola, {{ auth.userName() }}</h1>
          <p class="page-subtitle">Así va tu mes. Registra cada ingreso y egreso para que el análisis sea preciso.</p>
        </div>
        <div class="page-actions">
          <a class="pc-boton boton-primario-elevado" routerLink="/movimientos/nuevo">
            <svg lucideIcon="plus" [size]="14" aria-hidden="true"></svg> Nuevo movimiento
          </a>
        </div>
      </header>

      <section class="stats-grid" aria-label="Resumen del mes">
        <app-stat-tile label="Ingresos del mes" [value]="fmt(summary().income)" tone="income" />
        <app-stat-tile label="Egresos del mes" [value]="fmt(summary().expense)" tone="expense" />
        <app-stat-tile label="Saldo neto" [value]="fmt(summary().net)" [negative]="summary().net < 0" hint="Ingresos − egresos" />
        <app-stat-tile label="Ahorro" [value]="savings()" hint="Saldo neto / ingresos" />
      </section>

      @if (insight(); as tip) {
        <div class="tip">
          <app-insights [insights]="[tip]" />
          <a class="tip__link" routerLink="/analisis">Ver análisis <svg lucideIcon="arrow-right" [size]="12" aria-hidden="true"></svg></a>
        </div>
      }

      <app-card title="Movimientos" subtitle="Los más recientes primero" [flush]="true">
        <app-movements-list />
      </app-card>
    </div>
  `,
  styles: `
    .tip { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .tip app-insights { align-self: stretch; }
    .tip__link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--enlace-activo);
      text-decoration: none;
    }
    .tip__link:hover { text-decoration: underline; text-underline-offset: 4px; }
  `,
})
export class DashboardComponent {
  protected readonly auth = inject(AuthService);
  private readonly finance = inject(FinanceService);

  private readonly today = todayIso();
  private readonly range = resolvePeriod('this-month', null, this.today);
  protected readonly monthName = monthLabel(monthKey(this.today), true);

  protected readonly summary = computed(() => summarize(filterByRange(this.finance.movements(), this.range)));
  protected readonly savings = computed(() => {
    const rate = this.summary().savingsRate;
    return rate === null ? '—' : formatPercent(rate);
  });

  /** La recomendación más relevante del mes (solo si hay datos). */
  protected readonly insight = computed(() => {
    const [first] = buildInsights(this.finance.movements(), this.range, this.today);
    return first && first.id !== 'empty' ? first : null;
  });

  protected fmt(value: number): string {
    return formatCurrency(value);
  }
}
