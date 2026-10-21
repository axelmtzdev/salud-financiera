import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { NAV_GROUPS, PRIMARY_ACTION } from '../../../core/layout/nav.config';
import { InboxService } from '../../../core/services/inbox.service';

/** Menú lateral de escritorio (desde 1024px): acción principal arriba y secciones agrupadas. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Secciones">
      <a
        class="pc-boton boton-elevado pc-boton--bloque registrar"
        [routerLink]="action.path"
        routerLinkActive="is-activo"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <svg [lucideIcon]="action.icon" [size]="14" aria-hidden="true"></svg> {{ action.label }}
      </a>

      @for (group of groups; track group.label) {
        <span class="etiqueta grupo">{{ group.label }}</span>
        @for (item of group.links; track item.path) {
          <a
            class="nav-item"
            [routerLink]="item.path"
            routerLinkActive="is-activo"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            ariaCurrentWhenActive="page"
          >
            <svg [lucideIcon]="item.icon" [size]="16" aria-hidden="true"></svg>
            <span>{{ item.label }}</span>
            @if (item.pendingBadge && pending() > 0) {
              <span class="badge pc-num" [attr.aria-label]="pending() + ' cargos por confirmar'">{{ pending() }}</span>
            }
          </a>
        }
      }
    </nav>
  `,
  styles: `
    :host { display: none; }
    @media (min-width: 1024px) { :host { display: block; } }
    nav {
      position: sticky;
      top: var(--header-h);
      display: flex;
      flex-direction: column;
      gap: 2px;
      height: calc(100dvh - var(--header-h));
      padding: 20px 12px;
      overflow-y: auto;
      background: var(--sidebar);
      border-right: 1px solid var(--border-suave);
    }
    .registrar { margin-bottom: 8px; height: 36px; font-size: 13px; }
    .registrar.is-activo { border-color: color-mix(in oklab, var(--ring) 60%, var(--border)); color: var(--texto-activo); }
    .grupo { display: block; padding: 14px 10px 6px; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 500;
      color: var(--muted-foreground);
      text-decoration: none;
      transition: color var(--duracion-color), background-color var(--duracion-color);
    }
    .nav-item:hover:not(.is-activo) {
      background: color-mix(in oklab, var(--sidebar-accent) 50%, transparent);
      color: var(--foreground);
    }
    .nav-item.is-activo { background: var(--sidebar-accent); color: var(--sidebar-accent-foreground); }
    .nav-item.is-activo svg { color: var(--primary); }
    :host-context(.dark) .nav-item.is-activo svg { color: var(--texto-activo); }
    .badge {
      margin-left: auto;
      min-width: 18px; height: 18px; padding: 0 5px; display: grid; place-items: center;
      border-radius: var(--radius-full); font-size: 10px; font-weight: 600;
      color: var(--primary-foreground); background: var(--warning-texto);
    }
  `,
})
export class SidebarComponent {
  protected readonly pending = inject(InboxService).count;
  protected readonly groups = NAV_GROUPS;
  protected readonly action = PRIMARY_ACTION;
}
