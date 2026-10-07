import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tarjeta elevada: superficie despegada del fondo por sombra, sin borde visible en claro.
 * Proyecta `[card-actions]` en la cabecera y el resto en el cuerpo.
 */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tarjeta-elevada', '[class.tarjeta--flush]': 'flush()' },
  template: `
    @if (title() || subtitle()) {
      <header class="tarjeta-cabecera">
        <div class="tarjeta-cabecera__texto">
          @if (title()) {
            <h2 class="tarjeta-titulo">{{ title() }}</h2>
          }
          @if (subtitle()) {
            <p class="tarjeta-detalle">{{ subtitle() }}</p>
          }
        </div>
        <ng-content select="[card-actions]" />
      </header>
    }
    <div class="tarjeta-cuerpo">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    :host-context(.dark) { border-color: var(--border); }
    .tarjeta-cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-suave);
    }
    @media (min-width: 640px) { .tarjeta-cabecera { padding: 16px 24px; } }
    .tarjeta-cabecera__texto { min-width: 0; }
    .tarjeta-titulo {
      margin: 0;
      font-size: 15px;
      line-height: 1.5;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .tarjeta-detalle {
      margin: 2px 0 0;
      font-size: 12px;
      line-height: 1.625;
      color: var(--texto-tenue);
    }
    .tarjeta-cuerpo { padding: 20px; }
    :host(.tarjeta--flush) .tarjeta-cuerpo { padding: 0; }
  `,
})
export class CardComponent {
  readonly title = input<string>();
  readonly subtitle = input<string>();
  /** Sin padding en el cuerpo (tablas y listas que llegan al borde). */
  readonly flush = input(false);
}
