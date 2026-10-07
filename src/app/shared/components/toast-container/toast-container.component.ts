import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { Toast, ToastService } from '../../../core/services/toast.service';

const ICON_BY_TYPE: Record<Toast['type'], string> = { success: 'circle-check', error: 'triangle-alert', info: 'info' };

/** Avisos flotantes: superficie elevada con ícono del estado; el texto dice qué pasó. */
@Component({
  selector: 'app-toast-container',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.type }}" role="status">
          <span class="toast__icon"><svg [lucideIcon]="icons[toast.type]" [size]="15" aria-hidden="true"></svg></span>
          <span class="toast__message">{{ toast.message }}</span>
          @if (toast.action; as action) {
            <button type="button" class="pc-boton boton-elevado toast__action" (click)="run(toast)">{{ action.label }}</button>
          }
          <button type="button" class="icon-btn toast__close" (click)="toasts.dismiss(toast.id)" aria-label="Cerrar aviso" title="Cerrar">
            <svg lucideIcon="x" [size]="14" aria-hidden="true"></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      z-index: 100;
      left: 50%;
      bottom: calc(76px + env(safe-area-inset-bottom));
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }
    @media (min-width: 1024px) {
      .stack { left: auto; right: 24px; bottom: 24px; transform: none; }
    }
    .toast {
      --tono: var(--info);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 8px 10px 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border-suave);
      background: var(--surface-elevada);
      color: var(--foreground);
      box-shadow: var(--sombra-elevada);
      pointer-events: auto;
      animation: mov-entrar var(--duracion-entrar) var(--ease-entrada) backwards;
    }
    .toast--success { --tono: var(--success); }
    .toast--error { --tono: var(--danger); }
    .toast__icon {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-full);
      color: var(--tono);
      background: color-mix(in oklab, var(--tono) 12%, transparent);
      flex-shrink: 0;
    }
    .toast__message { flex: 1; font-size: 13px; font-weight: 500; }
    .toast__action { height: 28px; }
    .toast__close { width: 28px; height: 28px; }
  `,
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
  protected readonly icons = ICON_BY_TYPE;

  protected run(toast: Toast): void {
    toast.action?.run();
    this.toasts.dismiss(toast.id);
  }
}
