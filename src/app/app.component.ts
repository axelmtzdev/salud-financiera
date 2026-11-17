import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiService } from './core/services/api.service';
import { AuthService } from './core/services/auth.service';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { ThemeService } from './core/services/theme.service';
import { LoadingBarComponent } from './shared/components/loading-bar/loading-bar.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LucideDynamicIcon, ToastContainerComponent, ConfirmDialogComponent, LoadingBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-loading-bar />
    @if (auth.restoring()) {
      <div class="arranque" role="status" aria-live="polite">
        <div class="arranque__marca">
          <span class="arranque__anillo" aria-hidden="true"></span>
          <span class="arranque__logo"><svg lucideIcon="wallet" [size]="24" aria-hidden="true"></svg></span>
        </div>
        <strong>Salud Financiera</strong>
        <span class="arranque__texto">{{ api.waking() ? 'El servidor está despertando; puede tardar hasta un minuto…' : 'Cargando tus finanzas…' }}</span>
        <!-- Esqueleto de lo que viene: saldo y tres indicadores -->
        <div class="arranque__esqueleto" aria-hidden="true">
          <span class="esqueleto arranque__bloque--alto"></span>
          <div class="arranque__fila">
            <span class="esqueleto"></span>
            <span class="esqueleto"></span>
            <span class="esqueleto"></span>
          </div>
        </div>
      </div>
    }
    <router-outlet />
    <app-toast-container />
    <app-confirm-dialog />
  `,
  styles: `
    .arranque {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px;
      text-align: center;
      background:
        radial-gradient(60% 50% at 50% 30%, color-mix(in oklab, var(--serie-1) 10%, transparent), transparent 70%),
        var(--background);
    }
    .arranque strong { margin-top: 10px; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
    .arranque__texto { font-size: 13px; color: var(--muted-foreground); min-height: 20px; }
    .arranque__marca { position: relative; display: grid; place-items: center; width: 76px; height: 76px; }
    .arranque__logo {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 14px;
      color: var(--primary-foreground);
      background: var(--degradado-primario);
      box-shadow: var(--sombra-primario);
    }
    /* Anillo de colores que gira alrededor del logo */
    .arranque__anillo {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(from 0deg, var(--serie-1), var(--serie-2), var(--serie-3), var(--serie-5), transparent 75%);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      animation: girar 1s linear infinite;
    }
    .arranque__esqueleto { display: flex; flex-direction: column; gap: 10px; width: min(420px, 100%); margin-top: 24px; opacity: 0.8; }
    .arranque__bloque--alto { height: 96px; border-radius: var(--radius-xl); }
    .arranque__fila { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .arranque__fila .esqueleto { height: 64px; border-radius: var(--radius-lg, var(--radius)); }
    @media (prefers-reduced-motion: reduce) { .arranque__anillo { animation-duration: 3s; } }
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly api = inject(ApiService);

  constructor() {
    // Aplica el tema guardado desde el arranque (también en login y registro)
    inject(ThemeService);
  }
}
