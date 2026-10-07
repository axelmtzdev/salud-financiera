import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { InboxService } from '../../../core/services/inbox.service';
import { ToastService } from '../../../core/services/toast.service';
import { CardComponent } from '../../../shared/components/card/card.component';
import { MOVEMENT_TYPE_LABEL } from '../../../shared/models/categories';
import { MerchantRule } from '../../../shared/models/finance.models';
import { quickAddTemplate } from '../../../shared/utils/quick-add.utils';

/** Configuración del registro rápido desde Atajos del iPhone y reglas por comercio. */
@Component({
  selector: 'app-quick-add-settings',
  imports: [RouterLink, LucideDynamicIcon, CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card title="Registro rápido desde iPhone" subtitle="Cada pago con Apple Pay llega a tu bandeja para confirmarlo">
      <div class="bloque">
        <span class="field-label">URL para el atajo</span>
        <div class="plantilla">
          <code class="pc-mono">{{ template }}</code>
          <button type="button" class="pc-boton boton-elevado" (click)="copy()">Copiar</button>
        </div>
        <p class="field-hint">
          Sustituye <span class="pc-mono">[Importe]</span>, <span class="pc-mono">[Comercio]</span> y
          <span class="pc-mono">[Tarjeta]</span> por las variables del atajo. <span class="pc-mono">tarjeta</span> es opcional.
        </p>
      </div>

      <ol class="pasos">
        <li>En la app Atajos abre <strong>Automatización</strong> → <strong>Nueva automatización</strong> → <strong>Cartera</strong>.</li>
        <li>Elige tus tarjetas y marca <strong>Ejecutar inmediatamente</strong>.</li>
        <li>Agrega la acción <strong>Codificar URL</strong> con el comercio de la entrada del atajo (para espacios y acentos).</li>
        <li>Agrega <strong>URL</strong> con la plantilla de arriba y pon las variables en su lugar.</li>
        <li>Termina con <strong>Abrir URL</strong>. Debe abrir el mismo navegador donde usas la app.</li>
      </ol>

      <a class="pc-boton boton-elevado" routerLink="/registro-rapido" fragment="monto=1.00&comercio=Prueba de atajo&tarjeta=Prueba">
        <svg lucideIcon="upload" [size]="14" aria-hidden="true"></svg> Enviar cargo de prueba ($1.00)
      </a>

      <div class="bloque reglas">
        <span class="field-label">Categorías por comercio</span>
        @if (inbox.rules().length) {
          <ul>
            @for (rule of inbox.rules(); track rule.type + rule.pattern) {
              <li>
                <span class="regla__comercio">{{ rule.label }}</span>
                <span class="regla__flecha" aria-hidden="true">→</span>
                <span class="regla__categoria">{{ rule.category }}</span>
                <span class="regla__tipo">{{ typeLabel[rule.type] }}</span>
                <button type="button" class="icon-btn icon-btn--danger" (click)="remove(rule)" [attr.aria-label]="'Eliminar regla de ' + rule.label" title="Eliminar regla">
                  <svg lucideIcon="x" [size]="14" aria-hidden="true"></svg>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="field-hint">
            Aún no hay reglas. Al confirmar un cargo con "Recordar para este comercio", la próxima vez su categoría se sugiere sola.
          </p>
        }
      </div>
    </app-card>
  `,
  styles: `
    .bloque { display: flex; flex-direction: column; gap: 6px; }
    .plantilla { display: flex; gap: 8px; align-items: stretch; }
    code {
      flex: 1; min-width: 0; padding: 8px 10px; font-size: 11px; line-height: 1.5;
      border-radius: var(--radius-md); background: var(--background); border: 1px solid var(--border);
      box-shadow: var(--sombra-campo-reposo); overflow-wrap: anywhere;
    }
    .pasos { margin: 16px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 1.7; color: var(--texto-medio); }
    .reglas { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-suave); }
    .reglas ul { list-style: none; margin: 0; padding: 0; }
    .reglas li {
      display: flex; align-items: center; gap: 8px; padding: 6px 0;
      border-bottom: 1px solid var(--divisor-tenue); font-size: 13px;
    }
    .reglas li:last-child { border-bottom: 0; }
    .regla__comercio { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .regla__flecha { color: var(--texto-tenue); }
    .regla__categoria { flex: 1; min-width: 0; }
    .regla__tipo { font-size: 11px; color: var(--texto-tenue); }
  `,
})
export class QuickAddSettingsComponent {
  protected readonly inbox = inject(InboxService);
  private readonly toast = inject(ToastService);

  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly template = quickAddTemplate(window.location.origin);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.template);
      this.toast.success('URL copiada');
    } catch {
      this.toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
    }
  }

  protected remove(rule: MerchantRule): void {
    if (this.inbox.removeRule(rule)) this.toast.success(`Regla de "${rule.label}" eliminada`);
  }
}
