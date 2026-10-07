import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ThemePreference, ThemeService } from '../../../core/services/theme.service';

const THEME_OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Tema claro' },
  { value: 'system', icon: 'monitor', label: 'Tema del sistema' },
  { value: 'dark', icon: 'moon', label: 'Tema oscuro' },
];

@Component({
  selector: 'app-header',
  imports: [RouterLink, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="brand" routerLink="/" aria-label="Ir a movimientos">
      <span class="brand__logo"><svg lucideIcon="wallet" [size]="16" aria-hidden="true"></svg></span>
      <span class="brand__name">Salud Financiera</span>
    </a>

    <div class="actions">
      <div class="theme segmented" role="radiogroup" aria-label="Tema">
        @for (o of themeOptions; track o.value) {
          <button
            type="button"
            role="radio"
            [class.active]="theme.preference() === o.value"
            [attr.aria-checked]="theme.preference() === o.value"
            [attr.aria-label]="o.label"
            [title]="o.label"
            (click)="theme.set(o.value)"
          >
            <svg [lucideIcon]="o.icon" [size]="14" aria-hidden="true"></svg>
          </button>
        }
      </div>

      <span class="user">
        <span class="user__avatar" aria-hidden="true">{{ initial() }}</span>
        <span class="user__name">{{ userName() }}</span>
      </span>

      <button type="button" class="pc-boton pc-btn--ghost" (click)="logout.emit()" title="Cerrar sesión">
        <svg lucideIcon="log-out" [size]="14" aria-hidden="true"></svg>
        <span class="logout-label">Salir</span>
      </button>
    </div>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: var(--header-h);
      padding: 0 16px;
      background: var(--surface-elevada);
      border-bottom: 1px solid var(--border-suave);
    }
    @media (min-width: 1024px) { :host { padding: 0 24px; } }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--foreground);
      text-decoration: none;
      min-width: 0;
    }
    .brand__logo {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: var(--radius);
      color: var(--primary-foreground);
      background: var(--degradado-primario);
      box-shadow: var(--sombra-primario);
    }
    .brand__name { font-size: 15px; font-weight: 600; letter-spacing: -0.025em; white-space: nowrap; }
    .actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .theme { height: auto; }
    .theme button { height: 28px; width: 32px; padding: 0; display: grid; place-items: center; flex: 0 0 auto; }
    .user { display: flex; align-items: center; gap: 8px; min-width: 0; margin-left: 4px; }
    .user__avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-full);
      font-weight: 600;
      font-size: 12px;
      color: var(--texto-activo);
      background: var(--accent);
      flex-shrink: 0;
    }
    .user__name {
      font-weight: 500;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 639px) {
      .user__name, .logout-label { display: none; }
      .brand__name { font-size: 14px; }
    }
    @media (max-width: 379px) {
      .user { display: none; }
    }
  `,
})
export class HeaderComponent {
  readonly userName = input.required<string>();
  readonly logout = output<void>();

  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly initial = computed(() => this.userName().trim().charAt(0).toUpperCase() || '?');
}
