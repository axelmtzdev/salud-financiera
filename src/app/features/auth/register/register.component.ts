import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';
import { FinanceValidators } from '../../../shared/validators/finance.validators';
import { afterLoginTarget } from '../../quick-add/quick-add-stash';

export const PASSWORD_MIN_LENGTH = 8;

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, LucideDynamicIcon, AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-layout.scss',
  template: `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="auth-logo"><svg lucideIcon="wallet" [size]="18" aria-hidden="true"></svg></span>
        <span>Salud Financiera</span>
      </div>

      <span class="eyebrow">Crear cuenta</span>
      <h1>Empieza a ordenar tus finanzas</h1>
      <p class="lead">Tu información se guarda en tu cuenta y la ves en todos tus dispositivos.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label class="field-label" for="name">¿Cómo te llamas?</label>
          <input id="name" class="input" formControlName="name" maxlength="30" autocomplete="given-name" appAutofocus />
          @if (showError('name')) {
            <span class="field-error">Escribe tu nombre (máx. 30 caracteres).</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="email">Correo</label>
          <input id="email" class="input" type="email" formControlName="email" maxlength="254" autocomplete="email" inputmode="email" (input)="error.set(null)" />
          @if (showError('email')) {
            <span class="field-error">Escribe un correo válido.</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="password">Contraseña</label>
          <input id="password" class="input" type="password" formControlName="password" maxlength="200" autocomplete="new-password" />
          @if (showError('password')) {
            <span class="field-error">Usa al menos {{ minLength }} caracteres.</span>
          } @else {
            <span class="field-hint">Mínimo {{ minLength }} caracteres. Una frase fácil de recordar funciona bien.</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="confirmPassword">Confirma tu contraseña</label>
          <input id="confirmPassword" class="input" type="password" formControlName="confirmPassword" maxlength="200" autocomplete="new-password" />
          @if (showError('confirmPassword')) {
            <span class="field-error">Las contraseñas no coinciden.</span>
          }
        </div>

        @if (error(); as message) {
          <span class="field-error" role="alert">{{ message }}</span>
        }

        <button type="submit" class="pc-boton pc-boton--grande pc-boton--bloque boton-primario-elevado" [disabled]="sending()">
          <svg lucideIcon="lock" [size]="16" aria-hidden="true"></svg> {{ sending() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
        @if (sending() && api.waking()) {
          <p class="waking" role="status">El servidor está despertando; la primera vez puede tardar hasta un minuto.</p>
        }
      </form>

      <p class="auth-footer">¿Ya tienes cuenta? <a class="link-btn" routerLink="/login">Inicia sesión</a></p>
    </section>
  `,
})
export class RegisterComponent {
  protected readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly minLength = PASSWORD_MIN_LENGTH;
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(30), FinanceValidators.notBlank]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    confirmPassword: ['', [Validators.required, FinanceValidators.sameAs('password')]],
  });

  constructor() {
    const { password, confirmPassword } = this.form.controls;
    password.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => confirmPassword.updateValueAndValidity());
  }

  protected showError(name: 'name' | 'email' | 'password' | 'confirmPassword'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.sending.set(true);
    try {
      await this.auth.register(name.trim(), email, password);
      this.toast.success(`Listo, ${this.auth.userName()}. Tu cuenta quedó creada.`);
      this.router.navigateByUrl(afterLoginTarget());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      this.sending.set(false);
    }
  }
}
