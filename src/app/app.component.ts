import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiService } from './core/services/api.service';
import { AuthService } from './core/services/auth.service';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { ThemeService } from './core/services/theme.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LucideDynamicIcon, ToastContainerComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.restoring()) {
      <div class="arranque" role="status">
        <span class="arranque__logo"><svg lucideIcon="wallet" [size]="22" aria-hidden="true"></svg></span>
        <span>{{ api.waking() ? 'El servidor está despertando; puede tardar hasta un minuto…' : 'Cargando tus finanzas…' }}</span>
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
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px;
      text-align: center;
      font-size: 13px;
      color: var(--muted-foreground);
      background: var(--background);
    }
    .arranque__logo {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: var(--radius);
      color: var(--primary-foreground);
      background: var(--degradado-primario);
      box-shadow: var(--sombra-primario);
      animation: latido 1.4s ease-in-out infinite;
    }
    @keyframes latido { 50% { transform: scale(0.92); opacity: 0.8; } }
    @media (prefers-reduced-motion: reduce) { .arranque__logo { animation: none; } }
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
