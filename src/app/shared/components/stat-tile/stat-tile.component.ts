import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatTone = 'income' | 'expense' | 'neutral';

/** Tarjeta de indicador (KpiCard): rótulo, valor grande y una línea de ayuda. */
@Component({
  selector: 'app-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tarjeta-elevada' },
  template: `
    <div class="kpi__head">
      @if (tone() !== 'neutral') {
        <span class="punto" [class.punto--income]="tone() === 'income'" [class.punto--expense]="tone() === 'expense'"></span>
      }
      <span class="etiqueta">{{ label() }}</span>
    </div>
    <strong class="kpi__valor pc-num" [class.text-expense]="negative()">{{ value() }}</strong>
    @if (hint()) {
      <p class="kpi__ayuda">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      padding: 20px;
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    :host-context(.dark) { border-color: var(--border); }
    .kpi__head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
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
      .kpi__valor { font-size: 18px; line-height: 26px; }
      .kpi__ayuda { font-size: 11px; }
    }
  `,
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly tone = input<StatTone>('neutral');
  readonly hint = input<string>();
  /** Pinta el valor en el tono de egreso (saldo negativo). */
  readonly negative = input(false);
}
