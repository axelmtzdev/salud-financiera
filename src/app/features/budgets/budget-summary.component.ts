import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { BudgetService } from '../../core/services/budget.service';
import { FinanceService } from '../../core/services/finance.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { formatPercent } from '../../shared/utils/format.utils';

const MAX_LINES = 3;

/** Resumen del presupuesto del mes para la pantalla principal. */
@Component({
  selector: 'app-budget-summary',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (budgets.hasBudgets()) {
      @let o = budgets.current();
      <section class="tarjeta" aria-labelledby="presupuesto-titulo">
        <header class="cabecera">
          <div>
            <h2 id="presupuesto-titulo">Presupuesto del mes</h2>
            <p class="pc-num">
              @if (o.totalRemaining >= 0) {
                Quedan <strong>{{ o.totalRemaining | currencyFormat }}</strong> de {{ o.totalLimit | currencyFormat }}
              } @else {
                <strong class="text-expense">Excedido por {{ -o.totalRemaining | currencyFormat }}</strong> de {{ o.totalLimit | currencyFormat }}
              }
            </p>
          </div>
          <a class="enlace" routerLink="/presupuestos">Ver todo <svg lucideIcon="arrow-right" [size]="12" aria-hidden="true"></svg></a>
        </header>

        <div class="barra barra--{{ o.totalLevel }}" role="progressbar" [attr.aria-valuenow]="o.totalSpent" [attr.aria-valuemax]="o.totalLimit" aria-label="Gastado del presupuesto total">
          <span class="barra__relleno" [style.width.%]="ratioWidth(o.totalSpent, o.totalLimit)"></span>
          @if (o.elapsed < 1) {
            <span class="barra__ritmo" [style.left.%]="o.elapsed * 100" title="Lo esperado a la fecha"></span>
          }
        </div>

        <ul>
          @for (line of top(); track line.category) {
            <li>
              <span class="cat"><span class="punto" [style.background]="finance.colorOf('egreso', line.category)"></span>{{ line.category }}</span>
              <span class="mini barra--{{ line.level }}"><span class="barra__relleno" [style.width.%]="ratioWidth(line.spent, line.limit)"></span></span>
              <span class="pct pc-num" [class.text-expense]="line.level === 'over'" [class.aviso]="line.level === 'warning'">{{ percent(line.ratio) }}</span>
            </li>
          }
        </ul>
      </section>
    } @else if (finance.movements().length) {
      <a class="invitacion" routerLink="/presupuestos">
        <span class="invitacion__icono"><svg lucideIcon="target" [size]="15" aria-hidden="true"></svg></span>
        <span class="invitacion__texto">
          <strong>Ponle tope a tus gastos</strong>
          <span>Define un presupuesto por categoría; te sugerimos montos con tus últimos meses.</span>
        </span>
        <svg lucideIcon="arrow-right" [size]="14" aria-hidden="true"></svg>
      </a>
    }
  `,
  styles: `
    /* Sin caja propia: si no hay nada que mostrar no deja hueco en la columna de la página */
    :host { display: contents; }
    .tarjeta {
      display: flex; flex-direction: column; gap: 12px;
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
    .cabecera strong { color: var(--foreground); font-weight: 600; }
    .cabecera strong.text-expense { color: var(--egreso-texto); }
    .enlace {
      display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
      font-size: 11px; font-weight: 600; color: var(--enlace-activo); text-decoration: none;
    }
    .enlace:hover { text-decoration: underline; text-underline-offset: 4px; }
    .barra, .mini {
      --tono: var(--primary);
      position: relative; display: block; border-radius: var(--radius-full); background: var(--muted);
    }
    .barra { height: 10px; box-shadow: var(--sombra-campo-reposo); }
    .mini { height: 6px; }
    .barra--warning { --tono: var(--warning); }
    .barra--over { --tono: var(--danger); }
    .barra__relleno { display: block; height: 100%; border-radius: var(--radius-full); background: var(--tono); transition: width 0.5s var(--ease-entrada); }
    .barra__ritmo {
      position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px;
      border-radius: 1px; background: var(--foreground); opacity: 0.45;
    }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(60px, 1.2fr) 44px; align-items: center; gap: 10px; font-size: 12px; }
    .cat { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .pct { text-align: right; color: var(--texto-tenue); font-weight: 600; }
    .pct.aviso { color: var(--warning-texto); }
    .invitacion {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; border-radius: var(--radius);
      border: 1px dashed color-mix(in oklab, var(--border) 90%, transparent);
      background: var(--surface-elevada);
      color: var(--foreground); text-decoration: none;
      transition: box-shadow var(--duracion-color);
    }
    .invitacion:hover { box-shadow: var(--sombra-halo-hover); }
    .invitacion__icono {
      display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0;
      border-radius: var(--radius-full); color: var(--texto-activo); background: var(--accent);
    }
    .invitacion__texto { display: flex; flex-direction: column; flex: 1; gap: 2px; font-size: 12px; color: var(--muted-foreground); }
    .invitacion__texto strong { font-size: 13px; color: var(--foreground); font-weight: 600; }
  `,
})
export class BudgetSummaryComponent {
  protected readonly budgets = inject(BudgetService);
  protected readonly finance = inject(FinanceService);

  /** Las categorías más comprometidas. */
  protected readonly top = computed(() => this.budgets.current().lines.slice(0, MAX_LINES));

  protected ratioWidth(spent: number, limit: number): number {
    return limit > 0 ? Math.min(spent / limit, 1) * 100 : 0;
  }

  protected percent(ratio: number): string {
    return formatPercent(ratio);
  }
}
