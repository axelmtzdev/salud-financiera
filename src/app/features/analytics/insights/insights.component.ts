import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { Insight } from '../../../shared/models/finance.models';

const LEVEL_LABEL: Record<Insight['level'], string> = {
  danger: 'Alerta',
  warning: 'Atención',
  info: 'Sugerencia',
  success: 'Bien',
};

/** Recomendaciones en bandas. Cada nivel lleva ícono y palabra, nunca solo color. */
@Component({
  selector: 'app-insights',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul [class.single]="insights().length === 1">
      @for (insight of insights(); track insight.id; let i = $index) {
        <li class="banda banda--{{ insight.level }} mov-entrar" [style.animation-delay.ms]="i * 40">
          <span class="banda__icono">
            <svg [lucideIcon]="insight.icon" [size]="15" aria-hidden="true"></svg>
          </span>
          <div class="banda__texto">
            <div class="banda__head">
              <strong>{{ insight.title }}</strong>
              <span class="nivel">{{ labels[insight.level] }}</span>
            </div>
            <p>{{ insight.message }}</p>
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    @media (min-width: 900px) { ul:not(.single) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .banda {
      --tono: var(--info);
      --tono-texto: var(--info);
      display: flex;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius);
      border: 1px solid color-mix(in oklab, var(--tono) 25%, transparent);
      background: color-mix(in oklab, var(--tono) 6%, var(--surface-elevada));
    }
    .banda--danger { --tono: var(--danger); --tono-texto: var(--egreso-texto); }
    .banda--warning { --tono: var(--warning); --tono-texto: var(--warning-texto); }
    .banda--success { --tono: var(--success); --tono-texto: var(--ingreso-texto); }
    .banda--info { --tono: var(--primary); --tono-texto: var(--texto-activo); }
    .banda__icono {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: var(--radius-full);
      color: var(--tono-texto);
      background: color-mix(in oklab, var(--tono) 14%, transparent);
      flex-shrink: 0;
    }
    .banda__texto { min-width: 0; flex: 1; }
    .banda__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .banda__head strong { font-size: 13px; font-weight: 600; }
    .nivel {
      font-size: 10px;
      font-weight: 600;
      line-height: 1.5;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--tono-texto);
    }
    p { margin: 2px 0 0; font-size: 12px; line-height: 1.625; color: var(--muted-foreground); }
  `,
})
export class InsightsComponent {
  readonly insights = input.required<Insight[]>();
  protected readonly labels = LEVEL_LABEL;
}
