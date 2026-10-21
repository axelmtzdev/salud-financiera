import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../core/services/finance.service';
import { RecurringService } from '../../core/services/recurring.service';
import { ToastService } from '../../core/services/toast.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { formatCurrency } from '../../shared/utils/format.utils';
import { Occurrence } from '../../shared/utils/recurring.utils';

/** Días hacia adelante que se muestran en Movimientos. */
const HORIZON_DAYS = 7;
const MAX_ROWS = 3;

/** Pagos fijos que vencen esta semana (o que se quedaron sin pagar), en la pantalla principal. */
@Component({
  selector: 'app-upcoming-summary',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (soon().length) {
      <section class="tarjeta" aria-labelledby="proximos-titulo">
        <header class="cabecera">
          <div>
            <h2 id="proximos-titulo">Próximos pagos</h2>
            <p class="pc-num">{{ total() | currencyFormat }} en los próximos {{ horizon }} días</p>
          </div>
          <a class="enlace" routerLink="/pagos">Ver todos <svg lucideIcon="arrow-right" [size]="12" aria-hidden="true"></svg></a>
        </header>
        <ul>
          @for (o of soon().slice(0, maxRows); track o.payment.id + o.due) {
            <li>
              <span class="nombre">{{ o.payment.name }}</span>
              <span class="cuando pc-num" [class.vencido]="o.status === 'vencido'">
                {{ o.due | dateFormat: 'short' }} · {{ when(o) }}
              </span>
              <span class="amount pc-num">{{ o.payment.amount | currencyFormat }}</span>
              <button type="button" class="icon-btn" (click)="markPaid(o)" title="Marcar pagado" [attr.aria-label]="'Marcar pagado ' + o.payment.name">
                <svg lucideIcon="check" [size]="15" [strokeWidth]="2.5" aria-hidden="true"></svg>
              </button>
            </li>
          }
        </ul>
        @if (soon().length > maxRows) {
          <a class="mas" routerLink="/pagos">y {{ soon().length - maxRows }} más</a>
        }
      </section>
    }
  `,
  styles: `
    /* Sin caja propia: si no hay pagos próximos no deja hueco en la columna de la página */
    :host { display: contents; }
    .tarjeta {
      display: flex; flex-direction: column; gap: 10px;
      padding: 16px 20px;
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    :host-context(.dark) .tarjeta { border-color: var(--border); }
    .cabecera { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.025em; }
    .cabecera p { margin: 2px 0 0; font-size: 12px; color: var(--texto-tenue); }
    .enlace, .mas {
      display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
      font-size: 11px; font-weight: 600; color: var(--enlace-activo); text-decoration: none;
    }
    .enlace:hover, .mas:hover { text-decoration: underline; text-underline-offset: 4px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li {
      display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 12px;
      padding: 6px 0; border-bottom: 1px solid var(--divisor-tenue); font-size: 13px;
    }
    li:last-child { border-bottom: 0; }
    .nombre { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cuando { font-size: 11px; color: var(--texto-tenue); }
    .cuando.vencido { color: var(--egreso-texto); font-weight: 600; }
    @media (max-width: 479px) {
      li { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: 'nombre monto check' 'cuando cuando check'; row-gap: 0; }
      .nombre { grid-area: nombre; }
      .cuando { grid-area: cuando; }
      .amount { grid-area: monto; }
      .icon-btn { grid-area: check; }
    }
  `,
})
export class UpcomingSummaryComponent {
  private readonly recurring = inject(RecurringService);
  private readonly finance = inject(FinanceService);
  private readonly toast = inject(ToastService);

  protected readonly horizon = HORIZON_DAYS;
  protected readonly maxRows = MAX_ROWS;
  protected readonly soon = computed(() => this.recurring.upcoming().filter((o) => o.daysLeft <= HORIZON_DAYS));
  protected readonly total = computed(() => this.soon().reduce((sum, o) => sum + o.payment.amount, 0));

  protected when(o: Occurrence): string {
    if (o.daysLeft < 0) return 'vencido';
    if (o.daysLeft === 0) return 'hoy';
    if (o.daysLeft === 1) return 'mañana';
    return `en ${o.daysLeft} días`;
  }

  protected markPaid(o: Occurrence): void {
    const movement = this.recurring.markPaid(o.payment);
    if (!movement) {
      this.toast.error('No se pudo registrar el pago.');
      return;
    }
    this.toast.success(`${o.payment.name}: egreso de ${formatCurrency(o.payment.amount)} registrado`, {
      label: 'Deshacer',
      run: () => this.finance.remove(movement.id),
    });
  }
}
