import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { MORE_GROUPS, PRIMARY_ACTION, TAB_LINKS, isInMore } from '../../../core/layout/nav.config';
import { AuthService } from '../../../core/services/auth.service';
import { InboxService } from '../../../core/services/inbox.service';

/**
 * Barra inferior del teléfono y tablet (abajo de 1024px): 3 secciones, la acción principal al
 * centro y "Más", que abre una hoja con el resto de las secciones agrupadas.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Secciones">
      @for (tab of tabs; track tab.path; let i = $index) {
        @if (i === 2) {
          <a
            class="tab tab--accion"
            [routerLink]="action.path"
            routerLinkActive="is-activo"
            [routerLinkActiveOptions]="{ exact: true }"
            ariaCurrentWhenActive="page"
          >
            <span class="accion__circulo"><svg [lucideIcon]="action.icon" [size]="22" [strokeWidth]="2.5" aria-hidden="true"></svg></span>
            <span class="label">{{ action.label }}</span>
          </a>
        }
        <a
          class="tab"
          [routerLink]="tab.path"
          routerLinkActive="is-activo"
          [routerLinkActiveOptions]="{ exact: tab.exact }"
          ariaCurrentWhenActive="page"
        >
          <svg [lucideIcon]="tab.icon" [size]="20" aria-hidden="true"></svg>
          <span class="label">{{ tab.tabLabel ?? tab.label }}</span>
          @if (tab.pendingBadge && pending() > 0) {
            <span class="badge pc-num" [attr.aria-label]="pending() + ' cargos por confirmar'">{{ pending() }}</span>
          }
        </a>
      }
      <button
        type="button"
        class="tab"
        [class.is-activo]="moreActive()"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="open.set(true)"
      >
        <svg lucideIcon="menu" [size]="20" aria-hidden="true"></svg>
        <span class="label">Más</span>
      </button>
    </nav>

    <dialog #sheet class="hoja" aria-labelledby="hoja-titulo" (cancel)="$event.preventDefault(); open.set(false)" (click)="onBackdrop($event)">
      @if (open()) {
        <div class="hoja__contenido">
          <span class="hoja__asa" aria-hidden="true"></span>
          <header class="hoja__cabecera">
            <h2 id="hoja-titulo">Más</h2>
            <button type="button" class="icon-btn" (click)="open.set(false)" aria-label="Cerrar" title="Cerrar">
              <svg lucideIcon="x" [size]="16" aria-hidden="true"></svg>
            </button>
          </header>

          @for (group of groups; track group.label) {
            <section class="grupo">
              <span class="etiqueta">{{ group.label }}</span>
              @for (item of group.links; track item.path) {
                <a
                  class="fila"
                  [routerLink]="item.path"
                  routerLinkActive="item-menu-activo"
                  [routerLinkActiveOptions]="{ exact: item.exact }"
                  ariaCurrentWhenActive="page"
                  (click)="open.set(false)"
                >
                  <svg [lucideIcon]="item.icon" [size]="18" aria-hidden="true"></svg>
                  <span>{{ item.label }}</span>
                  <svg class="fila__flecha" lucideIcon="chevron-right" [size]="16" aria-hidden="true"></svg>
                </a>
              }
            </section>
          }

          <section class="grupo">
            <button type="button" class="fila fila--salir" (click)="logout()">
              <svg lucideIcon="log-out" [size]="18" aria-hidden="true"></svg>
              <span>Cerrar sesión</span>
            </button>
          </section>
        </div>
      }
    </dialog>
  `,
  styles: `
    :host { display: block; }
    @media (min-width: 1024px) { :host { display: none; } }

    nav {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 30;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      align-items: end;
      gap: 2px;
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
      background: var(--surface-elevada);
      border-top: 1px solid var(--border-suave);
      box-shadow: 0 -8px 20px -14px rgba(31, 18, 32, 0.35);
    }
    .tab {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 48px;
      padding: 4px 0;
      border: 0;
      border-radius: var(--radius);
      background: none;
      font: inherit;
      font-size: 11px;
      font-weight: 500;
      color: var(--texto-medio);
      text-decoration: none;
      cursor: pointer;
      transition: color var(--duracion-color), background-color var(--duracion-color);
    }
    .tab.is-activo:not(.tab--accion) {
      color: var(--texto-activo);
      font-weight: 600;
      background: var(--degradado-item-activo);
      box-shadow: var(--sombra-item-activo);
    }
    .tab:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ring); }
    .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Acción principal: círculo con el degradado primario que sobresale de la barra */
    .tab--accion { padding-top: 0; }
    .accion__circulo {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      margin-top: -22px;
      border-radius: var(--radius-full);
      color: var(--primary-foreground);
      background: var(--degradado-primario);
      box-shadow: var(--sombra-primario), 0 0 0 4px var(--surface-elevada);
      transition: transform var(--duracion-soltar) var(--ease-resorte), box-shadow 200ms ease-out;
    }
    .tab--accion:active .accion__circulo {
      transform: translateY(1px) scale(var(--escala-presion));
      box-shadow: var(--sombra-primario-presionado), 0 0 0 4px var(--surface-elevada);
      transition: transform var(--duracion-oprimir) ease-out;
    }
    .tab--accion.is-activo { color: var(--texto-activo); font-weight: 600; }

    .badge {
      position: absolute; top: 2px; left: calc(50% + 6px);
      min-width: 16px; height: 16px; padding: 0 4px; display: grid; place-items: center;
      border-radius: var(--radius-full); font-size: 10px; font-weight: 600;
      color: var(--primary-foreground); background: var(--warning-texto);
    }

    /* ---------- Hoja "Más" ---------- */
    .hoja {
      width: 100vw;
      max-width: 520px;
      margin: auto auto 0;
      padding: 0;
      border: 0;
      border-radius: 16px 16px 0 0;
      background: var(--surface-elevada);
      color: var(--foreground);
      box-shadow: var(--sombra-modal);
    }
    :host-context(.dark) .hoja { border: 1px solid var(--border); border-bottom: 0; }
    .hoja[open] { animation: entrar-hoja 200ms var(--ease-entrada); }
    .hoja::backdrop { background: rgb(8 13 20 / 0.5); }
    @keyframes entrar-hoja { from { opacity: 0; transform: translateY(24px); } }
    .hoja__contenido { padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); }
    .hoja__asa {
      display: block; width: 36px; height: 4px; margin: 0 auto 8px;
      border-radius: var(--radius-full); background: var(--border);
    }
    .hoja__cabecera { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.025em; }
    .grupo { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--divisor-tenue); }
    .grupo:first-of-type { border-top: 0; }
    .grupo .etiqueta { padding: 0 12px 4px; }
    .fila {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius);
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      color: var(--texto-medio);
      text-decoration: none;
      text-align: left;
      cursor: pointer;
    }
    .fila:hover { background: var(--accent); }
    .fila.item-menu-activo {
      color: var(--texto-activo);
      font-weight: 600;
      background: var(--degradado-item-activo);
      box-shadow: var(--sombra-item-activo);
    }
    .fila__flecha { margin-left: auto; color: var(--texto-tenue); }
    .fila--salir { color: var(--egreso-texto); }
  `,
})
export class BottomNavComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  protected readonly tabs = TAB_LINKS;
  protected readonly action = PRIMARY_ACTION;
  protected readonly groups = MORE_GROUPS;
  protected readonly pending = inject(InboxService).count;
  protected readonly open = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly moreActive = computed(() => this.open() || isInMore(this.url()));

  constructor() {
    effect(() => {
      const dialog = this.sheet().nativeElement;
      if (this.open() && !dialog.open) dialog.showModal();
      else if (!this.open() && dialog.open) dialog.close();
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.sheet().nativeElement) this.open.set(false);
  }

  protected logout(): void {
    this.open.set(false);
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
