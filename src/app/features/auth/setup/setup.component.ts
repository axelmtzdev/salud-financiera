import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';
import { FinanceValidators } from '../../../shared/validators/finance.validators';

export const SUGGESTED_QUESTIONS = [
  '¿Cuál es tu película favorita?',
  '¿Cómo se llamaba tu primera mascota?',
  '¿En qué ciudad naciste?',
  '¿Cuál es tu comida favorita?',
  '¿Cómo se llamaba tu escuela primaria?',
];

const CUSTOM = '__custom__';

@Component({
  selector: 'app-setup',
  imports: [ReactiveFormsModule, LucideDynamicIcon, AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-layout.scss',
  template: `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="auth-logo"><svg lucideIcon="wallet" [size]="18" aria-hidden="true"></svg></span>
        <span>Salud Financiera</span>
      </div>

      <span class="eyebrow">Configuración inicial</span>
      <h1>Crea tu acceso</h1>
      <p class="lead">Tus datos se guardan solo en este navegador. Nadie más los ve.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label class="field-label" for="name">¿Cómo te llamas?</label>
          <input id="name" class="input" formControlName="name" maxlength="30" autocomplete="given-name" appAutofocus />
          @if (showError('name')) {
            <span class="field-error">Escribe tu nombre (máx. 30 caracteres).</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="question">Pregunta secreta</label>
          <select id="question" class="input" formControlName="questionChoice">
            @for (q of questions; track q) {
              <option [value]="q">{{ q }}</option>
            }
            <option [value]="custom">Escribir mi propia pregunta…</option>
          </select>
        </div>

        @if (questionChoice() === custom) {
          <div class="field">
            <label class="field-label" for="customQuestion">Tu pregunta</label>
            <input id="customQuestion" class="input" formControlName="customQuestion" maxlength="100" appAutofocus />
            @if (showError('customQuestion')) {
              <span class="field-error">Escribe una pregunta (máx. 100 caracteres).</span>
            }
          </div>
        }

        <div class="field">
          <label class="field-label" for="answer">Respuesta</label>
          <input id="answer" class="input" type="password" formControlName="answer" maxlength="60" autocomplete="new-password" />
          @if (showError('answer')) {
            <span class="field-error">La respuesta debe tener al menos 2 caracteres.</span>
          } @else {
            <span class="field-hint">No importan mayúsculas, acentos ni espacios de más.</span>
          }
        </div>

        <div class="field">
          <label class="field-label" for="confirmAnswer">Confirma tu respuesta</label>
          <input id="confirmAnswer" class="input" type="password" formControlName="confirmAnswer" maxlength="60" autocomplete="new-password" />
          @if (showError('confirmAnswer')) {
            <span class="field-error">Las respuestas no coinciden.</span>
          }
        </div>

        <button type="submit" class="pc-boton pc-boton--grande pc-boton--bloque boton-primario-elevado" [disabled]="saving()">
          <svg lucideIcon="lock" [size]="16" aria-hidden="true"></svg> {{ saving() ? 'Guardando…' : 'Crear acceso' }}
        </button>
      </form>
    </section>
  `,
})
export class SetupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly questions = SUGGESTED_QUESTIONS;
  protected readonly custom = CUSTOM;
  protected readonly saving = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(30), FinanceValidators.notBlank]],
    questionChoice: [SUGGESTED_QUESTIONS[0]],
    customQuestion: ['', [Validators.maxLength(100)]],
    answer: ['', [Validators.required, Validators.minLength(2), FinanceValidators.notBlank]],
    confirmAnswer: ['', [Validators.required, FinanceValidators.matches('answer')]],
  });

  protected readonly questionChoice = toSignal(this.form.controls.questionChoice.valueChanges, {
    initialValue: this.form.controls.questionChoice.value,
  });

  constructor() {
    const { questionChoice, customQuestion, answer, confirmAnswer } = this.form.controls;
    questionChoice.valueChanges.pipe(takeUntilDestroyed()).subscribe((choice) => {
      customQuestion.setValidators(
        choice === CUSTOM ? [Validators.required, Validators.maxLength(100), FinanceValidators.notBlank] : [],
      );
      customQuestion.updateValueAndValidity();
    });
    answer.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => confirmAnswer.updateValueAndValidity());
  }

  protected showError(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, questionChoice, customQuestion, answer } = this.form.getRawValue();
    this.saving.set(true);
    const ok = this.auth.setup({
      name,
      secretQuestion: questionChoice === CUSTOM ? customQuestion : questionChoice,
      secretAnswer: answer,
    });
    this.saving.set(false);
    if (!ok) {
      this.toast.error('No se pudo guardar. Revisa que el navegador permita guardar datos de este sitio.');
      return;
    }
    this.toast.success(`Listo, ${name.trim()}. Tu acceso quedó configurado.`);
    this.router.navigate(['/']);
  }
}
