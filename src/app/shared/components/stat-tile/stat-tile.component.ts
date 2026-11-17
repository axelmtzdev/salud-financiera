import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { CountUpDirective } from '../../directives/count-up.directive';

export type StatTone = 'income' | 'expense' | 'neutral';

/**
 * Tarjeta de indicador (KpiCard): rótulo, valor grande y una línea de ayuda. Con `icon` muestra un
 * ícono en el color del tono; con `amount` el valor se anima al cambiar (en lugar de `value`).
 */
@Component({
  selector: 'app-stat-tile',
  imports: [LucideDynamicIcon, CountUpDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tarjeta-elevada', '[attr.data-tono]': 'tone()' },
  template: `
    <div class="kpi__head">
      @if (tone() !== 'neutral' && !icon()) {
        <span class="punto" [class.punto--income]="tone() === 'income'" [class.punto--expense]="tone() === 'expense'"></span>
      }
      <span class="etiqueta">{{ label() }}</span>
      @if (icon(); as name) {
        <span class="icono-color kpi__icono"><svg [lucideIcon]="name" [size]="15" aria-hidden="true"></svg></span>
      }
    </div>
    @if (amount() !== undefined) {
      <strong class="kpi__valor pc-num" [class.text-expense]="negative()" [appCountUp]="amount()!" [countFormat]="amountFormat()"></strong>
    } @else {
      <strong class="kpi__valor pc-num" [class.text-expense]="negative()">{{ value() }}</strong>
    }
    @if (hint()) {
      <p class="kpi__ayuda">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      --tono: var(--primary);
      display: block;
      min-width: 0;
      padding: 20px;
      /* Un brillo del color del indicador en la esquina */
      background:
        radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--tono) 9%, transparent), transparent 60%),
        var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    :host([data-tono='income']) { --tono: var(--success); }
    :host([data-tono='expense']) { --tono: var(--danger); }
    :host-context(.dark) { border-color: var(--border); }
    .kpi__head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; min-height: 30px; }
    .kpi__icono { --c: var(--tono); margin-left: auto; }
    :host(:hover) .kpi__icono { transform: scale(1.08) rotate(-4deg); }
    .punto--income { background: var(--success); }
    .punto--expense { background: var(--danger); }
    .kpi__valor {
      display: block;
      font-size: 30px;
      line-height: 36px;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--foreground);
      overflow-wrap: anywhere;
    }
    .kpi__ayuda { margin: 8px 0 0; font-size: 12px; line-height: 1.625; color: var(--muted-foreground); }
    @media (max-width: 1279px) { .kpi__valor { font-size: 24px; line-height: 32px; } }
    @media (max-width: 480px) {
      :host { padding: 14px; }
      .kpi__icono { width: 26px; height: 26px; }
      .kpi__valor { font-size: 18px; line-height: 26px; }
      .kpi__ayuda { font-size: 11px; }
    }
  `,
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input<string>('');
  /** Valor numérico animado; si se da, reemplaza a `value` */
  readonly amount = input<number>();
  readonly amountFormat = input<'currency' | 'percent'>('currency');
  /** Nombre de ícono Lucide */
  readonly icon = input<string>();
  readonly tone = input<StatTone>('neutral');
  readonly hint = input<string>();
  /** Pinta el valor en el tono de egreso (saldo negativo). */
  readonly negative = input(false);
}
