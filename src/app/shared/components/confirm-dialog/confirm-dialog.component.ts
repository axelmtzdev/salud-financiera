import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../../core/services/confirm.service';

/**
 * Renderiza las solicitudes de `ConfirmService` con un `<dialog>` nativo (foco atrapado y Esc incluidos).
 * Escritorio: fundido con zoom al 95 %. Teléfono: hoja que sube desde abajo.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog (cancel)="$event.preventDefault(); confirm.close(false)" (click)="onBackdrop($event)">
      @if (confirm.request(); as request) {
        <div class="content">
          <div class="body">
            <span class="icon" [class.icon--danger]="request.danger">
              <svg [lucideIcon]="request.danger ? 'triangle-alert' : 'info'" [size]="20" [strokeWidth]="1.75" aria-hidden="true"></svg>
            </span>
            <div>
              <h2>{{ request.title }}</h2>
              <p>{{ request.message }}</p>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="pc-boton boton-elevado" (click)="confirm.close(false)">
              {{ request.cancelText ?? 'Cancelar' }}
            </button>
            <button
              type="button"
              class="pc-boton"
              [class.pc-btn--destructive]="request.danger"
              [class.boton-primario-elevado]="!request.danger"
              (click)="confirm.close(true)"
              autofocus
            >
              {{ request.confirmText ?? 'Confirmar' }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog {
      width: min(440px, calc(100vw - 32px));
      padding: 0;
      border: 0;
      border-radius: var(--radius-xl);
      background: var(--surface-elevada);
      color: var(--foreground);
      box-shadow: var(--sombra-modal);
    }
    :host-context(.dark) dialog { border: 1px solid var(--border); }
    dialog[open] { animation: entrar-modal 150ms var(--ease-entrada); }
    dialog::backdrop { background: rgb(8 13 20 / 0.5); }
    .content { padding: 20px; }
    .body { display: flex; gap: 14px; }
    .icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      color: var(--muted-foreground);
      background: var(--accent);
      flex-shrink: 0;
    }
    .icon--danger { color: var(--egreso-texto); background: var(--danger-suave); }
    h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; letter-spacing: -0.025em; }
    p { margin: 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.6; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    @keyframes entrar-modal { from { opacity: 0; transform: scale(0.95); } }
    @keyframes entrar-hoja { from { opacity: 0; transform: translateY(24px); } }

    @media (max-width: 639px) {
      dialog {
        width: 100vw;
        max-width: 100vw;
        margin: auto 0 0;
        border-radius: 16px 16px 0 0;
      }
      dialog[open] { animation: entrar-hoja 200ms var(--ease-entrada); }
      .content { padding: 20px 16px calc(20px + env(safe-area-inset-bottom)); }
      .actions .pc-boton { flex: 1; height: 44px; }
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Tras renderizar, para que el botón con autofocus ya exista al abrir el modal
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      if (this.confirm.request()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.confirm.close(false);
  }
}
