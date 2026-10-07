import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MonthlyPoint } from '../../../shared/models/finance.models';
import { formatCurrency } from '../../../shared/utils/format.utils';
import { hostWidth, niceTicks, roundedBar } from './chart-utils';

const HEIGHT = 240;
const M = { top: 12, right: 8, bottom: 26, left: 60 };

/** Barras agrupadas ingresos vs egresos por mes. Egresos llevan textura para no depender solo del color. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chart.scss',
  template: `
    <ul class="legend">
      <li><span class="swatch income"></span>Ingresos</li>
      <li><span class="swatch expense"></span>Egresos</li>
    </ul>
    @if (hasData()) {
      <svg [attr.width]="width()" [attr.height]="height" role="img" [attr.aria-label]="ariaLabel()">
        <defs>
          <pattern id="expense-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" class="expense-fill" />
            <line x1="0" y1="0" x2="0" y2="6" class="hatch-line" />
          </pattern>
        </defs>

        @for (t of geometry().ticks; track t.value) {
          <line class="grid-line" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="axis-label" [attr.x]="m.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }

        @for (b of geometry().bars; track b.key; let i = $index) {
          @if (active() === i) {
            <rect class="hover-band" [attr.x]="b.bandX" [attr.y]="m.top" [attr.width]="b.bandW" [attr.height]="innerH" rx="6" />
          }
          <path [attr.d]="b.incomePath" class="bar-income" />
          <path [attr.d]="b.expensePath" fill="url(#expense-hatch)" class="bar-expense" />
          <text class="axis-label" [attr.x]="b.cx" [attr.y]="height - 6" text-anchor="middle">{{ b.label }}</text>
          <rect
            class="hit"
            [attr.x]="b.bandX"
            [attr.y]="0"
            [attr.width]="b.bandW"
            [attr.height]="height"
            (mouseenter)="active.set(i)"
            (mouseleave)="active.set(null)"
          />
        }
      </svg>

      @if (tooltip(); as tip) {
        <div class="tooltip" [style.left.px]="tip.x" [style.top.px]="tip.y + legendOffset">
          <div class="tooltip__title">{{ tip.label }}</div>
          <div class="tooltip__row"><span class="swatch income"></span><span>Ingresos</span><span>{{ fmt(tip.income) }}</span></div>
          <div class="tooltip__row"><span class="swatch expense"></span><span>Egresos</span><span>{{ fmt(tip.expense) }}</span></div>
          <div class="tooltip__row"><span class="swatch"></span><span>Saldo</span><span>{{ fmt(tip.net) }}</span></div>
        </div>
      }
    } @else {
      <div class="empty">Sin movimientos en los últimos 6 meses</div>
    }
  `,
  styles: `
    .swatch.income { background: var(--ingreso-relleno); }
    .swatch.expense {
      background: repeating-linear-gradient(45deg, var(--egreso-relleno) 0 3px, color-mix(in oklab, var(--egreso-relleno) 55%, white) 3px 5px);
    }
    .bar-income { fill: var(--ingreso-relleno); }
    .expense-fill { fill: var(--egreso-relleno); }
    .hatch-line { stroke: rgb(255 255 255 / 0.45); stroke-width: 2; }
  `,
})
export class BarChartComponent {
  readonly points = input.required<MonthlyPoint[]>();

  protected readonly m = M;
  protected readonly height = HEIGHT;
  protected readonly innerH = HEIGHT - M.top - M.bottom;
  /** Alto aproximado de la leyenda sobre el SVG, para posicionar el tooltip. */
  protected readonly legendOffset = 30;
  protected readonly width = hostWidth();
  protected readonly active = signal<number | null>(null);

  protected readonly hasData = computed(() => this.points().some((p) => p.income > 0 || p.expense > 0));

  protected readonly geometry = computed(() => {
    const points = this.points();
    const width = this.width();
    const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)));
    const ticks = niceTicks(0, max, 4);
    const top = ticks[ticks.length - 1];
    const innerW = width - M.left - M.right;
    const y = (v: number) => M.top + this.innerH - (v / top) * this.innerH;
    const base = y(0);
    const bandW = innerW / points.length;
    const barW = Math.max(4, Math.min(22, (bandW * 0.56) / 2));
    const gap = 2;

    return {
      ticks: ticks.map((value) => ({ value, y: y(value), label: formatCurrency(value, { compact: true }) })),
      bars: points.map((p, i) => {
        const bandX = M.left + i * bandW;
        const cx = bandX + bandW / 2;
        return {
          key: p.key,
          label: p.label,
          bandX,
          bandW,
          cx,
          incomePath: roundedBar(cx - gap / 2 - barW, base, barW, y(p.income)),
          expensePath: roundedBar(cx + gap / 2, base, barW, y(p.expense)),
          tipY: y(Math.max(p.income, p.expense)),
        };
      }),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) return null;
    const bar = this.geometry().bars[i];
    const point = this.points()[i];
    const x = Math.min(Math.max(bar.cx, 90), this.width() - 90);
    return { ...point, x, y: Math.max(bar.tipY, 70) };
  });

  protected readonly ariaLabel = computed(
    () =>
      'Ingresos vs egresos por mes: ' +
      this.points()
        .map((p) => `${p.label}: ingresos ${formatCurrency(p.income)}, egresos ${formatCurrency(p.expense)}`)
        .join('; '),
  );

  protected fmt(value: number): string {
    return formatCurrency(value);
  }
}
