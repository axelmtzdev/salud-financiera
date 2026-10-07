import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSlice } from '../../../shared/utils/analytics.utils';
import { formatCurrency, formatPercent } from '../../../shared/utils/format.utils';

const SIZE = 200;
const C = SIZE / 2;
const OUTER = 96;
const INNER = 60;

interface Arc extends ChartSlice {
  path: string;
  share: number;
}

const point = (r: number, angle: number) => `${C + r * Math.cos(angle)},${C + r * Math.sin(angle)}`;

function donutArc(start: number, end: number): string {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-4);
  const stop = start + sweep;
  const large = sweep > Math.PI ? 1 : 0;
  return (
    `M${point(OUTER, start)}A${OUTER},${OUTER} 0 ${large} 1 ${point(OUTER, stop)}` +
    `L${point(INNER, stop)}A${INNER},${INNER} 0 ${large} 0 ${point(INNER, start)}Z`
  );
}

/** Gráfica de dona: el centro funciona como lectura al pasar el cursor por una rebanada o por la leyenda. */
@Component({
  selector: 'app-pie-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chart.scss',
  template: `
    @if (arcs().length) {
      <div class="pie">
        <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" class="donut" role="img" [attr.aria-label]="ariaLabel()">
          @for (arc of arcs(); track arc.label; let i = $index) {
            <path
              [attr.d]="arc.path"
              [style.fill]="arc.color"
              class="slice"
              [class.dim]="active() !== null && active() !== i"
              (mouseenter)="active.set(i)"
              (mouseleave)="active.set(null)"
            >
              <title>{{ arc.label }}: {{ fmt(arc.value) }} ({{ pct(arc.share) }})</title>
            </path>
          }
          <text [attr.x]="center" [attr.y]="center - 8" text-anchor="middle" class="center-label">{{ centerTitle() }}</text>
          <text [attr.x]="center" [attr.y]="center + 14" text-anchor="middle" class="center-value">{{ centerValue() }}</text>
        </svg>

        <ul class="pie-legend">
          @for (arc of arcs(); track arc.label; let i = $index) {
            <li
              [class.dim]="active() !== null && active() !== i"
              (mouseenter)="active.set(i)"
              (mouseleave)="active.set(null)"
            >
              <span class="swatch" [style.background]="arc.color"></span>
              <span class="pie-legend__label">{{ arc.label }}</span>
              <span class="pie-legend__pct">{{ pct(arc.share) }}</span>
            </li>
          }
        </ul>
      </div>
    } @else {
      <div class="empty">{{ emptyText() }}</div>
    }
  `,
  styles: `
    .pie { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px 24px; }
    .donut { width: min(220px, 100%); height: auto; flex-shrink: 0; }
    .slice { stroke: var(--surface-elevada); stroke-width: 2; transition: opacity 0.15s; cursor: pointer; }
    .dim { opacity: 0.35; }
    .center-label { fill: var(--texto-tenue); font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; font-family: var(--font-sans); }
    .center-value { fill: var(--foreground); font-size: 16px; font-weight: 600; letter-spacing: -0.025em; font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
    .pie-legend {
      flex: 1 1 180px;
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
      li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; cursor: default; transition: opacity 0.15s, background-color 0.15s; }
      li:hover { background: var(--accent); }
    }
    .pie-legend__label { flex: 1; color: var(--foreground); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pie-legend__pct { color: var(--texto-tenue); font-variant-numeric: tabular-nums; }
  `,
})
export class PieChartComponent {
  readonly slices = input.required<ChartSlice[]>();
  readonly totalLabel = input('Total');
  readonly emptyText = input('Sin datos en este período');

  protected readonly size = SIZE;
  protected readonly center = C;
  protected readonly active = signal<number | null>(null);

  private readonly total = computed(() => this.slices().reduce((sum, s) => sum + s.value, 0));

  protected readonly arcs = computed<Arc[]>(() => {
    const total = this.total();
    if (total <= 0) return [];
    let angle = -Math.PI / 2;
    return this.slices()
      .filter((s) => s.value > 0)
      .map((s) => {
        const share = s.value / total;
        const start = angle;
        angle += share * Math.PI * 2;
        return { ...s, share, path: donutArc(start, angle) };
      });
  });

  protected readonly centerTitle = computed(() => {
    const i = this.active();
    return i === null ? this.totalLabel() : this.arcs()[i]?.label ?? '';
  });

  protected readonly centerValue = computed(() => {
    const i = this.active();
    if (i === null) return formatCurrency(this.total(), { compact: this.total() >= 1e6 });
    const arc = this.arcs()[i];
    return arc ? `${formatCurrency(arc.value, { compact: arc.value >= 1e6 })}` : '';
  });

  protected readonly ariaLabel = computed(() =>
    this.arcs()
      .map((a) => `${a.label} ${formatPercent(a.share)}`)
      .join(', '),
  );

  protected fmt(value: number): string {
    return formatCurrency(value);
  }

  protected pct(share: number): string {
    return formatPercent(share, share < 0.1 ? 1 : 0);
  }
}
