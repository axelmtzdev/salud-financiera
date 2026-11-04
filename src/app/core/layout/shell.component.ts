import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { ConfirmService } from '../services/confirm.service';
import { StorageService } from '../services/storage.service';
import { ToastService } from '../services/toast.service';

const LEGACY_LATER_KEY = 'salud-financiera.subir-despues';

/** Layout de la zona privada: header + navegación + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, HeaderComponent, SidebarComponent, BottomNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header [userName]="auth.userName()" (logout)="logout()" />
    <div class="shell">
      <app-sidebar />
      <main class="shell__main">
        <router-outlet />
      </main>
    </div>
    <app-bottom-nav />
  `,
  styles: `
    :host { display: block; min-height: 100dvh; }
    .shell { display: block; }
    .shell__main {
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
      padding: 20px 16px calc(88px + env(safe-area-inset-bottom));
      min-width: 0;
    }
    @media (min-width: 1024px) {
      .shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); }
      .shell__main { padding: 28px 32px 48px; }
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly storage = inject(StorageService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  constructor() {
    afterNextRender(() => this.offerLegacyData());
  }

  /** Una vez por sesión del navegador ofrece subir los datos que la versión anterior guardaba localmente. */
  private async offerLegacyData(): Promise<void> {
    const legacy = this.storage.legacyData();
    if (!legacy || sessionStorage.getItem(LEGACY_LATER_KEY)) return;
    const count = legacy.movements.length;
    const ok = await this.confirm.ask({
      title: 'Datos guardados en este navegador',
      message: `Encontramos ${count === 1 ? '1 movimiento' : `${count} movimientos`} y tus ajustes de la versión anterior, que solo vivían en este navegador. ¿Quieres subirlos a tu cuenta para verlos en todos tus dispositivos? No se duplica lo que ya tengas.`,
      confirmText: 'Subir a mi cuenta',
      cancelText: 'Ahora no',
    });
    if (!ok) {
      sessionStorage.setItem(LEGACY_LATER_KEY, '1');
      this.toast.show('Puedes subirlos después desde Ajustes.');
      return;
    }
    if (await this.storage.importLegacy()) this.toast.success('Tus datos se subieron a tu cuenta');
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
