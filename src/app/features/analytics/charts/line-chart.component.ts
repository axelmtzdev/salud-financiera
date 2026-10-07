import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MonthlyPoint } from '../../../shared/models/finance.models';
import { formatCurrency } from '../../../shared/utils/format.utils';
import { hostWidth, niceTicks } from './chart-utils';

const HEIGHT = 220;
const M = { top: 22, right: 16, bottom: 26, left: 60 };

/** Tendencia del saldo neto mensual con línea de cero, crosshair y tooltip. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chart.scss',
  template: `
    @if (hasData()) {
      <svg
        [attr.width]="width()"
        [attr.height]="height"
        role="img"
        [attr.aria-label]="ariaLabel()"
        (mousemove)="onMove($event)"
        (mouseleave)="active.set(null)"
      >
        <defs>
          <linearGradient id="net-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.16" />
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
          </linearGradient>
        </defs>

        @for (t of geo().ticks; track t.value) {
          <line [attr.class]="t.value === 0 ? 'zero-line' : 'grid-line'" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="axis-label" [attr.x]="m.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }

        <path [attr.d]="geo().area" fill="url(#net-area)" />
        <path [attr.d]="geo().line" class="line" />

        @if (active() !== null) {
          <line class="crosshair" [attr.x1]="geo().pts[active()!].x" [attr.x2]="geo().pts[active()!].x" [attr.y1]="m.top" [attr.y2]="height - m.bottom" />
        }

        @for (p of geo().pts; track p.key; let i = $index; let last = $last) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="active() === i ? 6 : 4" class="marker" [class.negative]="p.net < 0" />
          <text class="axis-label" [attr.x]="p.x" [attr.y]="height - 6" text-anchor="middle">{{ p.label }}</text>
          @if (last && active() === null) {
            <text class="direct-label" [attr.x]="p.x" [attr.y]="p.y - 12" text-anchor="end">{{ fmt(p.net) }}</text>
          }
        }
      </svg>

      @if (tooltip(); as tip) {
        <div class="tooltip" [style.left.px]="tip.x" [style.top.px]="tip.y">
          <div class="tooltip__title">{{ tip.label }}</div>
          <div class="tooltip__row"><span>Saldo neto</span><span>{{ fmt(tip.net) }}</span></div>
          <div class="tooltip__row"><span>Ingresos</span><span>{{ fmt(tip.income) }}</span></div>
          <div class="tooltip__row"><span>Egresos</span><span>{{ fmt(tip.expense) }}</span></div>
        </div>
      }
    } @else {
      <div class="empty">Sin movimientos en los últimos 6 meses</div>
    }
  `,
  styles: `
    .line { fill: none; stroke: var(--primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .marker { fill: var(--primary); stroke: var(--surface-elevada); stroke-width: 2; transition: r 0.1s; }
    .marker.negative { fill: var(--egreso-relleno); }
    .crosshair { stroke: var(--texto-tenue); stroke-width: 1; stroke-dasharray: 3 3; }
    .direct-label { fill: var(--foreground); font-size: 12px; font-weight: 600; font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
    svg { cursor: crosshair; }
  `,
})
export class LineChartComponent {
  readonly points = input.required<MonthlyPoint[]>();

  protected readonly m = M;
  protected readonly height = HEIGHT;
  protected readonly width = hostWidth();
  protected readonly active = signal<number | null>(null);

  protected readonly hasData = computed(() => this.points().some((p) => p.income > 0 || p.expense > 0));

  protected readonly geo = computed(() => {
    const points = this.points();
    const width = this.width();
    const nets = points.map((p) => p.net);
    const ticks = niceTicks(Math.min(0, ...nets), Math.max(0, ...nets, 1), 4);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const step = points.length > 1 ? innerW / (points.length - 1) : 0;
    const x = (i: number) => M.left + (points.length > 1 ? i * step : innerW / 2);
    const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    const pts = points.map((p, i) => ({ ...p, x: x(i), y: y(p.net) }));
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
    const zeroY = y(0);
    const area = pts.length ? `${line}L${pts[pts.length - 1].x},${zeroY}L${pts[0].x},${zeroY}Z` : '';

    return {
      ticks: ticks.map((value) => ({ value, y: y(value), label: formatCurrency(value, { compact: true }) })),
      pts,
      line,
      area,
      step,
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) return null;
    const p = this.geo().pts[i];
    return { ...p, x: Math.min(Math.max(p.x, 90), this.width() - 90), y: Math.max(p.y, 80) };
  });

  protected readonly ariaLabel = computed(
    () => 'Saldo neto por mes: ' + this.points().map((p) => `${p.label} ${formatCurrency(p.net)}`).join(', '),
  );

  protected onMove(event: MouseEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const x = event.clientX - svg.getBoundingClientRect().left;
    const { pts } = this.geo();
    let nearest = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].x - x) < Math.abs(pts[nearest].x - x)) nearest = i;
    }
    this.active.set(nearest);
  }

  protected fmt(value: number): string {
    return formatCurrency(value);
  }
}
