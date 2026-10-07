import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { InboxService } from '../../core/services/inbox.service';
import { MOVEMENT_TYPE_LABEL } from '../../shared/models/categories';
import { PendingMovement } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { parseQuickAdd } from '../../shared/utils/quick-add.utils';

type QuickAddState =
  | { kind: 'added'; item: PendingMovement; suggestion: string | null }
  | { kind: 'duplicate' }
  | { kind: 'invalid'; error: string }
  | { kind: 'no-user' }
  | { kind: 'empty' }
  | { kind: 'error' };

/**
 * Recibe un cargo desde un atajo del iPhone: `/registro-rapido#monto=…&comercio=…&tarjeta=…`.
 * No pide sesión: deja el cargo en la bandeja y se confirma después, ya dentro de la app.
 */
@Component({
  selector: 'app-quick-add',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth/auth-layout.scss',
  template: `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="auth-logo"><svg lucideIcon="wallet" [size]="18" aria-hidden="true"></svg></span>
        <span>Salud Financiera</span>
      </div>

      <span class="eyebrow">Registro rápido</span>
      @switch (state().kind) {
        @case ('added') {
          @if (added(); as s) {
            <h1>Cargo recibido</h1>
            <p class="lead">Quedó en tu bandeja. Confírmalo con su categoría cuando entres a la app.</p>
            <div class="recibo">
              <span class="pill" [class.pill--egreso]="s.item.type === 'egreso'" [class.pill--ingreso]="s.item.type === 'ingreso'">
                <span class="punto"></span>{{ typeLabel[s.item.type] }}
              </span>
              <strong class="recibo__monto pc-num">{{ s.item.amount | currencyFormat }}</strong>
              <span class="recibo__comercio">{{ s.item.merchant || 'Sin comercio' }}</span>
              @if (s.item.card) {
                <span class="recibo__detalle">{{ s.item.card }}</span>
              }
              @if (s.suggestion) {
                <span class="recibo__detalle">Categoría sugerida: <strong>{{ s.suggestion }}</strong></span>
              }
            </div>
          }
        }
        @case ('duplicate') {
          <h1>Ya lo teníamos</h1>
          <p class="lead">Este mismo cargo llegó hace menos de dos minutos, así que no se volvió a guardar.</p>
        }
        @case ('invalid') {
          <h1>No se pudo registrar</h1>
          <p class="lead">{{ invalidError() }} Revisa la URL que arma tu atajo; en Ajustes está la plantilla.</p>
        }
        @case ('no-user') {
          <h1>Esta app no está configurada aquí</h1>
          <p class="lead">
            El atajo abrió un navegador donde no has creado tu acceso. Tus datos viven en el navegador donde usas la app:
            si la agregaste a la pantalla de inicio, el atajo debe abrir esa misma versión. No se guardó nada.
          </p>
        }
        @case ('empty') {
          <h1>Sin datos del cargo</h1>
          <p class="lead">Esta página la abre el atajo del iPhone con el monto y el comercio. En Ajustes está cómo configurarlo.</p>
        }
        @case ('error') {
          <h1>No se pudo guardar</h1>
          <p class="lead">El navegador rechazó el guardado. Revisa que tenga espacio y que permita guardar datos de este sitio.</p>
        }
      }

      <a class="pc-boton pc-boton--grande pc-boton--bloque boton-primario-elevado" routerLink="/movimientos">
        {{ state().kind === 'added' ? 'Revisar bandeja' : 'Abrir la app' }}
      </a>
      @if (state().kind === 'added' && pendingCount() > 1) {
        <p class="auth-footer">Tienes {{ pendingCount() }} cargos por confirmar.</p>
      }
    </section>
  `,
  styles: `
    .recibo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: 20px;
      padding: 20px 16px;
      border-radius: var(--radius);
      background: var(--surface);
      border: 1px solid var(--border-suave);
      text-align: center;
    }
    .recibo__monto { font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.025em; margin-top: 6px; }
    .recibo__comercio { font-size: 14px; font-weight: 600; }
    .recibo__detalle { font-size: 12px; color: var(--texto-tenue); }
    .auth-footer { color: var(--texto-tenue); }
  `,
})
export class QuickAddComponent {
  private readonly inbox = inject(InboxService);
  private readonly auth = inject(AuthService);

  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly state = signal<QuickAddState>(this.process());
  protected readonly pendingCount = this.inbox.count;

  constructor() {
    // Quita los datos de la URL para que recargar la página no registre el cargo otra vez
    const router = inject(Router);
    afterNextRender(() => router.navigate(['/registro-rapido'], { replaceUrl: true }));
  }

  protected added() {
    const s = this.state();
    return s.kind === 'added' ? s : null;
  }

  protected invalidError(): string {
    const s = this.state();
    return s.kind === 'invalid' ? s.error : '';
  }

  private process(): QuickAddState {
    const hash = window.location.hash;
    if (!hash || hash === '#') return { kind: 'empty' };
    if (!this.auth.isConfigured()) return { kind: 'no-user' };

    const parsed = parseQuickAdd(hash);
    if (!parsed.ok) return { kind: 'invalid', error: parsed.error };

    const result = this.inbox.receive(parsed.value);
    if (result.status === 'duplicate') return { kind: 'duplicate' };
    if (result.status === 'error') return { kind: 'error' };
    return { kind: 'added', item: result.pending, suggestion: this.inbox.suggest(result.pending) };
  }
}
