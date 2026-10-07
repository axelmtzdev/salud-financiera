import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { ToastService } from '../services/toast.service';

/** Layout de la zona privada: header + navegación + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header [userName]="auth.userName()" (logout)="logout()" />
    <div class="shell">
      <app-sidebar />
      <main class="shell__main">
        <router-outlet />
      </main>
    </div>
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

  constructor() {
    const { purged, discarded, corrupted } = inject(StorageService).consumeLoadReport();
    const toast = inject(ToastService);
    if (corrupted) toast.error('Los datos guardados estaban dañados; se respaldaron y se inició vacío.');
    else if (purged > 0) toast.show(`Se archivaron ${purged} movimientos con más de 2 años de antigüedad.`);
    else if (discarded > 0) toast.show(`Se descartaron ${discarded} registros inválidos.`);
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
