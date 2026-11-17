import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

/** Si la respuesta llega antes de esto, la barra no aparece (evita parpadeos). */
const SHOW_AFTER_MS = 200;

/** Barra de progreso en la parte superior mientras la app espera al servidor. */
@Component({
  selector: 'app-loading-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="barra-carga" [class.activa]="visible()" role="progressbar" aria-label="Cargando" [attr.aria-hidden]="!visible()">
      <span></span>
    </div>
  `,
  styles: `
    .barra-carga {
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 100;
      height: 3px;
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      transition: opacity 240ms ease;
    }
    .barra-carga.activa { opacity: 1; }
    span {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      border-radius: 0 3px 3px 0;
      background: linear-gradient(90deg, var(--serie-1), var(--serie-2), var(--serie-3), var(--serie-5));
      box-shadow: 0 0 10px color-mix(in oklab, var(--serie-1) 60%, transparent);
      animation: avanzar 1.1s var(--ease-entrada) infinite;
    }
    @keyframes avanzar {
      from { transform: translateX(-100%); }
      to { transform: translateX(260%); }
    }
    @media (prefers-reduced-motion: reduce) {
      span { width: 100%; animation: none; opacity: 0.7; }
    }
  `,
})
export class LoadingBarComponent {
  protected readonly visible = signal(false);

  constructor() {
    const api = inject(ApiService);
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const busy = api.busy();
      clearTimeout(timer);
      if (busy) timer = setTimeout(() => this.visible.set(true), SHOW_AFTER_MS);
      else this.visible.set(false);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
