import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact: boolean;
}

/** Menú lateral en escritorio (desde 1024px); barra inferior fija en teléfono y tablet. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Secciones">
      <span class="etiqueta nav-title">Menú</span>
      @for (item of items; track item.path) {
        <a
          class="nav-item"
          [routerLink]="item.path"
          routerLinkActive="is-activo"
          [routerLinkActiveOptions]="{ exact: item.exact }"
          ariaCurrentWhenActive="page"
        >
          <svg [lucideIcon]="item.icon" [size]="16" aria-hidden="true"></svg>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    nav {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 30;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
      background: var(--surface-elevada);
      border-top: 1px solid var(--border-suave);
      box-shadow: 0 -8px 20px -14px rgba(31, 18, 32, 0.35);
    }
    .nav-title { display: none; }
    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 44px;
      padding: 4px;
      border-radius: var(--radius);
      font-size: 11px;
      font-weight: 500;
      color: var(--texto-medio);
      text-decoration: none;
      transition: color var(--duracion-color), background-color var(--duracion-color);
    }
    .nav-item.is-activo {
      color: var(--texto-activo);
      font-weight: 600;
      background: var(--degradado-item-activo);
      box-shadow: var(--sombra-item-activo);
    }

    @media (min-width: 1024px) {
      nav {
        position: sticky;
        top: var(--header-h);
        inset: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        height: calc(100dvh - var(--header-h));
        padding: 20px 12px;
        background: var(--sidebar);
        border-top: 0;
        border-right: 1px solid var(--border-suave);
        box-shadow: none;
      }
      .nav-title { display: block; padding: 0 10px 8px; }
      .nav-item {
        flex-direction: row;
        justify-content: flex-start;
        gap: 10px;
        min-height: 0;
        padding: 8px 10px;
        border-radius: var(--radius-md);
        font-size: 14px;
        color: var(--muted-foreground);
        box-shadow: none;
      }
      .nav-item:hover:not(.is-activo) {
        background: color-mix(in oklab, var(--sidebar-accent) 50%, transparent);
        color: var(--foreground);
      }
      .nav-item.is-activo {
        font-weight: 500;
        background: var(--sidebar-accent);
        color: var(--sidebar-accent-foreground);
        box-shadow: none;
      }
      .nav-item.is-activo svg { color: var(--primary); }
    }
    @media (min-width: 1024px) { :host-context(.dark) .nav-item.is-activo svg { color: var(--texto-activo); } }
  `,
})
export class SidebarComponent {
  protected readonly items: NavItem[] = [
    { path: '/movimientos', label: 'Movimientos', icon: 'list', exact: true },
    { path: '/movimientos/nuevo', label: 'Registrar', icon: 'plus', exact: true },
    { path: '/analisis', label: 'Análisis', icon: 'chart-column', exact: false },
    { path: '/ajustes', label: 'Ajustes', icon: 'settings', exact: false },
  ];
}
