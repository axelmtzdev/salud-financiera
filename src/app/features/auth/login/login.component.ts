import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';
import { afterLoginTarget } from '../../quick-add/quick-add-stash';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, LucideDynamicIcon, AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-layout.scss',
  template: `
    <section class="auth-card" [class.shake]="shake()" (animationend)="$event.target === $event.currentTarget && shake.set(false)">
      <div class="auth-brand">
        <span class="auth-logo"><svg lucideIcon="wallet" [size]="18" aria-hidden="true"></svg></span>
        <span>Salud Financiera</span>
      </div>

      <span class="eyebrow">Iniciar sesión</span>
      <h1>Hola de nuevo</h1>
      <p class="lead">Entra con tu correo para ver tus finanzas en cualquier dispositivo.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label class="field-label" for="email">Correo</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" appAutofocus (input)="error.set(null)" />
          @if (showError('email')) {
            <span class="field-error">Escribe tu correo.</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="password">Contraseña</label>
          <div class="input-group">
            <input
              id="password"
              class="input"
              [type]="reveal() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              (input)="error.set(null)"
            />
            <button
              type="button"
              class="icon-btn input-suffix-btn"
              (click)="reveal.set(!reveal())"
              [attr.aria-label]="reveal() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              [title]="reveal() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            >
              <svg [lucideIcon]="reveal() ? 'eye-off' : 'eye'" [size]="16" aria-hidden="true"></svg>
            </button>
          </div>
          @if (showError('password')) {
            <span class="field-error">Escribe tu contraseña.</span>
          }
        </div>

        @if (error(); as message) {
          <span class="field-error" role="alert">{{ message }}</span>
        }

        <button type="submit" class="pc-boton pc-boton--grande pc-boton--bloque boton-primario-elevado" [disabled]="sending()">
          {{ sending() ? 'Entrando…' : 'Entrar' }}
        </button>
        @if (sending() && api.waking()) {
          <p class="waking" role="status">El servidor está despertando; la primera vez puede tardar hasta un minuto.</p>
        }
      </form>

      <p class="auth-footer">¿No tienes cuenta? <a class="link-btn" routerLink="/registro">Crear cuenta</a></p>
    </section>
  `,
})
export class LoginComponent {
  protected readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly shake = signal(false);
  protected readonly reveal = signal(false);
  protected readonly sending = signal(false);

  protected showError(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.sending.set(true);
    try {
      await this.auth.login(email, password);
      this.router.navigateByUrl(afterLoginTarget());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      this.shake.set(true);
    } finally {
      this.sending.set(false);
    }
  }
}
