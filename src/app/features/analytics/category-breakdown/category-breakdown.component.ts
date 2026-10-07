import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FinanceService } from '../../../core/services/finance.service';
import { CategoryStat, MovementType } from '../../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';

/** Tabla Categoría | Total | % | barra, con el top 3 destacado arriba. */
@Component({
  selector: 'app-category-breakdown',
  imports: [CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats().length) {
      <ol class="top3" aria-label="Top 3">
        @for (s of top3(); track s.category; let i = $index) {
          <li class="top3__item">
            <span class="rank pc-mono">{{ i + 1 }}</span>
            <span class="top3__text">
              <span class="etiqueta top3__name">{{ s.category }}</span>
              <strong class="amount">{{ s.total | currencyFormat }}</strong>
            </span>
          </li>
        }
      </ol>

      <table>
        <thead>
          <tr>
            <th scope="col" class="etiqueta">Categoría</th>
            <th scope="col" class="etiqueta num">Total</th>
            <th scope="col" class="etiqueta num">%</th>
            <th scope="col" class="bar-col"><span class="sr-only">Proporción</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of stats(); track s.category) {
            <tr>
              <td>
                <span class="cat">
                  <span class="punto" [style.background]="finance.colorOf(type(), s.category)"></span>
                  <span class="cat__name">{{ s.category }}</span>
                  <span class="cat__count pc-num" [title]="s.count + ' movimientos'">{{ s.count }}</span>
                </span>
              </td>
              <td class="num amount">{{ s.total | currencyFormat }}</td>
              <td class="num pct">{{ s.percent.toFixed(1) }}%</td>
              <td class="bar-col">
                <div class="track">
                  <div class="fill" [class.fill--income]="type() === 'ingreso'" [style.width.%]="(s.total / max()) * 100"></div>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">Sin {{ type() === 'ingreso' ? 'ingresos' : 'egresos' }} en este período.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .top3 {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px;
      margin: 0 0 16px; padding: 0; list-style: none;
    }
    .top3__item {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-width: 0;
      border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border-suave);
    }
    .rank {
      display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0;
      border-radius: var(--radius-full); font-size: 11px;
      color: var(--texto-activo); background: var(--accent);
    }
    .top3__item:first-child .rank { color: var(--primary-foreground); background: var(--primary); }
    .top3__text { display: flex; flex-direction: column; min-width: 0; }
    .top3__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { padding: 0 8px 8px; text-align: left; border-bottom: 1px solid var(--border-suave); }
    td { padding: 9px 8px; border-bottom: 1px solid var(--divisor-tenue); }
    th:first-child, td:first-child { padding-left: 0; }
    th:last-child, td:last-child { padding-right: 0; }
    tr:last-child td { border-bottom: 0; }
    .num { text-align: right; white-space: nowrap; }
    .pct { color: var(--texto-tenue); font-variant-numeric: tabular-nums; }
    .cat { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 500; }
    .cat__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cat__count {
      font-size: 10px; font-weight: 600; color: var(--muted-foreground); background: var(--muted);
      border: 1px solid var(--border); border-radius: var(--radius-full); padding: 0 6px;
    }
    .bar-col { width: 30%; }
    .track { height: 8px; border-radius: var(--radius-full); background: var(--muted); overflow: hidden; }
    .fill {
      height: 100%; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; background: var(--egreso-relleno);
      transition: width 0.5s var(--ease-entrada);
    }
    .fill--income { background: var(--ingreso-relleno); }
    .empty { margin: 0; padding: 24px 0; text-align: center; font-size: 12px; color: var(--texto-tenue); }
    @media (max-width: 520px) { .bar-col { display: none; } }
  `,
})
export class CategoryBreakdownComponent {
  readonly stats = input.required<CategoryStat[]>();
  readonly type = input.required<MovementType>();

  protected readonly finance = inject(FinanceService);
  protected readonly top3 = computed(() => this.stats().slice(0, 3));
  protected readonly max = computed(() => Math.max(1, ...this.stats().map((s) => s.total)));
}
