import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { StorageService } from '../../../core/services/storage.service';
import { ToastService } from '../../../core/services/toast.service';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, LucideDynamicIcon, AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-layout.scss',
  template: `
    <section class="auth-card" [class.shake]="shake()" (animationend)="$event.target === $event.currentTarget && shake.set(false)">
      <div class="auth-brand">
        <span class="auth-logo"><svg lucideIcon="wallet" [size]="18" aria-hidden="true"></svg></span>
        <span>Salud Financiera</span>
      </div>

      <span class="eyebrow">Iniciar sesión</span>
      <h1>Hola de nuevo, {{ auth.userName() }}</h1>
      <p class="lead">Responde tu pregunta secreta para continuar.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="question">
          <svg lucideIcon="lock" [size]="15" aria-hidden="true"></svg>
          <span>{{ auth.secretQuestion() }}</span>
        </div>

        <div class="field">
          <label class="field-label" for="answer">Tu respuesta</label>
          <div class="input-group">
            <input
              id="answer"
              class="input"
              [type]="reveal() ? 'text' : 'password'"
              formControlName="answer"
              autocomplete="current-password"
              appAutofocus
              (input)="error.set(false)"
            />
            <button
              type="button"
              class="icon-btn input-suffix-btn"
              (click)="reveal.set(!reveal())"
              [attr.aria-label]="reveal() ? 'Ocultar respuesta' : 'Mostrar respuesta'"
              [title]="reveal() ? 'Ocultar respuesta' : 'Mostrar respuesta'"
            >
              <svg [lucideIcon]="reveal() ? 'eye-off' : 'eye'" [size]="16" aria-hidden="true"></svg>
            </button>
          </div>
          @if (error()) {
            <span class="field-error" role="alert">Esa no es la respuesta. Revisa y vuelve a intentarlo.</span>
          }
        </div>

        <button type="submit" class="pc-boton pc-boton--grande pc-boton--bloque boton-primario-elevado">Entrar</button>
      </form>

      <p class="auth-footer">
        <button type="button" class="link-btn" (click)="forgot()">¿Olvidaste tu respuesta?</button>
      </p>
    </section>
  `,
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  protected readonly form = new FormGroup({ answer: new FormControl('', { nonNullable: true }) });
  protected readonly error = signal(false);
  protected readonly shake = signal(false);
  protected readonly reveal = signal(false);

  protected submit(): void {
    if (this.auth.login(this.form.controls.answer.value)) {
      this.router.navigate(['/']);
      return;
    }
    this.error.set(true);
    this.shake.set(true);
  }

  protected async forgot(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Restablecer la aplicación',
      message:
        'Tus datos solo viven en este navegador, así que para recuperar el acceso hay que borrar todo (usuario, movimientos y categorías) y empezar de nuevo. No se puede deshacer.',
      confirmText: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    this.storage.reset();
    this.auth.logout();
    this.toast.show('Se borraron los datos. Configura un nuevo acceso.');
    this.router.navigate(['/bienvenida']);
  }
}
