import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../core/services/finance.service';
import { GoalsService } from '../../core/services/goals.service';
import { RecurringService } from '../../core/services/recurring.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { CoverageLevel, monthCoverage } from '../../shared/utils/recurring.utils';

const LEVEL_LABEL: Record<CoverageLevel, string> = { cubierto: 'Cubierto', justo: 'Justo', riesgo: 'En riesgo' };

/** Pagos comprometidos del mes contra el saldo libre, en la pantalla principal. */
@Component({
  selector: 'app-coverage-summary',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (coverage(); as c) {
      <section class="cobertura" [attr.data-nivel]="c.pending > 0 ? c.level : 'cubierto'" aria-labelledby="cobertura-titulo">
        <header class="cabecera">
          <div>
            <h2 id="cobertura-titulo">Pagos de {{ monthName }}</h2>
            <p class="pc-num">
              {{ c.total | currencyFormat }} comprometidos
              @if (c.paid > 0) {
                · ya pagaste {{ c.paid | currencyFormat }}
              }
            </p>
          </div>
          @if (c.level && c.pending > 0) {
            <span class="pill" [class.pill--ingreso]="c.level === 'cubierto'" [class.pill--egreso]="c.level === 'riesgo'" [class.pill--aviso]="c.level === 'justo'">
              <span class="punto"></span>{{ levelLabel[c.level] }}
            </span>
          }
        </header>

        @if (c.pending === 0) {
          <p class="mensaje"><svg lucideIcon="circle-check" [size]="15" aria-hidden="true"></svg> Ya cubriste todos tus pagos del mes.</p>
        } @else {
          <div class="cifras pc-num">
            <div>
              <span class="etiqueta">Por pagar</span>
              <strong>{{ c.pending | currencyFormat }}</strong>
              <span class="ayuda">{{ c.pendingCount === 1 ? '1 pago' : c.pendingCount + ' pagos' }}</span>
            </div>
            @if (c.free !== null && c.after !== null) {
              <div>
                <span class="etiqueta">Libre hoy</span>
                <strong [class.text-expense]="c.free < 0">{{ c.free | currencyFormat }}</strong>
                <span class="ayuda">Saldo − apartado para metas</span>
              </div>
              <div>
                <span class="etiqueta">{{ c.after < 0 ? 'Te faltan' : 'Te quedarían' }}</span>
                <strong [class.text-expense]="c.after < 0">{{ (c.after < 0 ? -c.after : c.after) | currencyFormat }}</strong>
                <span class="ayuda">Después de pagar</span>
              </div>
            }
          </div>

          @if (c.free !== null) {
            <div class="barra" role="img" [attr.aria-label]="'Lo que falta pagar equivale al ' + usedPercent() + ' % de tu saldo libre'">
              <span [style.width.%]="usedPercent()"></span>
            </div>
          }

          <p class="mensaje">
            @switch (c.level) {
              @case ('riesgo') {
                <svg lucideIcon="triangle-alert" [size]="15" aria-hidden="true"></svg>
                Tu saldo libre no alcanza para lo que falta pagar este mes. Espera un ingreso, usa lo apartado o mueve algún pago.
              }
              @case ('justo') {
                <svg lucideIcon="triangle-alert" [size]="15" aria-hidden="true"></svg>
                Alcanza, pero te quedaría poco margen para el resto del mes.
              }
              @case ('cubierto') {
                <svg lucideIcon="circle-check" [size]="15" aria-hidden="true"></svg>
                Tu saldo libre cubre lo que falta pagar.
              }
              @default {
                <svg lucideIcon="info" [size]="15" aria-hidden="true"></svg>
                <span>Captura tu saldo inicial en <a routerLink="/cuentas">Cuentas</a> para saber si te alcanza.</span>
              }
            }
          </p>
          <p class="nota">No incluye ingresos que aún no te llegan este mes. <a routerLink="/pagos">Ver pagos</a></p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .cobertura {
      --nivel: var(--success);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-left: 3px solid var(--nivel);
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    .cobertura[data-nivel='justo'] { --nivel: var(--warning); }
    .cobertura[data-nivel='riesgo'] { --nivel: var(--danger); }
    :host-context(.dark) .cobertura { border-color: var(--border); border-left-color: var(--nivel); }
    .cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .cabecera p { margin: 2px 0 0; font-size: 12px; color: var(--texto-tenue); }
    .pill--aviso { background: var(--warning-suave); color: var(--warning-texto); border-color: color-mix(in oklab, var(--warning) 20%, transparent); }
    .pill--aviso .punto { background: var(--warning); }
    .cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
    .cifras div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .cifras strong { font-size: 20px; line-height: 26px; font-weight: 600; letter-spacing: -0.02em; }
    .ayuda { font-size: 11px; color: var(--texto-tenue); }
    .barra { height: 8px; border-radius: var(--radius-full); background: var(--muted); overflow: hidden; }
    .barra span { display: block; height: 100%; border-radius: inherit; background: var(--nivel); }
    .mensaje { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13px; line-height: 1.5; }
    .mensaje svg { flex-shrink: 0; margin-top: 2px; color: var(--nivel); }
    .mensaje a, .nota a { color: var(--enlace-activo); font-weight: 600; }
    .nota { margin: 0; font-size: 11px; color: var(--texto-tenue); }
  `,
})
export class CoverageSummaryComponent {
  private readonly recurring = inject(RecurringService);
  private readonly finance = inject(FinanceService);
  private readonly goals = inject(GoalsService);

  private readonly today = todayIso();
  protected readonly monthName = monthLabel(monthKey(this.today), true).split(' de ')[0];
  protected readonly levelLabel = LEVEL_LABEL;

  /** null si no hay pagos este mes: la tarjeta no se muestra. */
  protected readonly coverage = computed(() => {
    const c = monthCoverage(this.recurring.list(), this.finance.movements(), this.goals.free()?.total ?? null, this.today);
    return c.count > 0 ? c : null;
  });

  /** Qué parte del saldo libre se iría en lo pendiente (100 si no alcanza). */
  protected readonly usedPercent = computed(() => {
    const c = this.coverage();
    if (!c || c.free === null) return 0;
    return c.free <= 0 ? 100 : Math.round(Math.min(100, (c.pending / c.free) * 100));
  });
}
