import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../../core/services/finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { CardComponent } from '../../../shared/components/card/card.component';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';
import {
  CATEGORY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MOVEMENT_TYPE_LABEL,
  RETENTION_YEARS,
} from '../../../shared/models/categories';
import { MovementInput, MovementType } from '../../../shared/models/finance.models';
import { addYears, todayIso } from '../../../shared/utils/date.utils';
import { formatCurrency } from '../../../shared/utils/format.utils';
import { FinanceValidators } from '../../../shared/validators/finance.validators';

const MAX_AMOUNT = 999_999_999;

@Component({
  selector: 'app-movement-form',
  imports: [ReactiveFormsModule, RouterLink, CardComponent, LucideDynamicIcon, AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movement-form.component.html',
  styleUrl: './movement-form.component.scss',
})
export class MovementFormComponent implements OnInit {
  /** Parámetro de ruta `:id` (solo en edición). */
  readonly id = input<string>();

  private readonly finance = inject(FinanceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly categoryMax = CATEGORY_MAX_LENGTH;
  protected readonly descriptionMax = DESCRIPTION_MAX_LENGTH;
  protected readonly minDate = addYears(todayIso(), -RETENTION_YEARS);
  protected readonly maxDate = addYears(todayIso(), 1);

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly justSaved = signal(false);
  protected readonly addingCategory = signal(false);
  protected readonly categoryError = signal<string | null>(null);
  /** Categoría original del movimiento editado, por si ya no existe en la lista. */
  private readonly legacyCategory = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    type: new FormControl<MovementType>('egreso', { nonNullable: true }),
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_AMOUNT),
      FinanceValidators.maxDecimals(2),
    ]),
    category: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl(todayIso(), {
      nonNullable: true,
      validators: [
        Validators.required,
        FinanceValidators.isoDate,
        FinanceValidators.dateBetween(
          () => this.minDate,
          () => this.maxDate,
        ),
      ],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(DESCRIPTION_MAX_LENGTH)] }),
  });

  protected readonly newCategory = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(CATEGORY_MAX_LENGTH)],
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  protected readonly descriptionLength = toSignal(this.form.controls.description.valueChanges, { initialValue: '' });

  protected readonly categoryOptions = computed(() => {
    const list = this.finance.categories()[this.type()];
    const legacy = this.legacyCategory();
    return legacy && !list.includes(legacy) ? [...list, legacy] : list;
  });

  constructor() {
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const { category } = this.form.controls;
      if (category.value && !this.categoryOptions().includes(category.value)) category.setValue('');
      this.cancelCategory();
    });
  }

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const movement = this.finance.getById(id);
    if (!movement) {
      this.toast.error('El movimiento no existe o fue eliminado.');
      this.router.navigate(['/movimientos']);
      return;
    }
    this.legacyCategory.set(movement.category);
    this.form.setValue({
      type: movement.type,
      amount: movement.amount,
      category: movement.category,
      date: movement.date,
      description: movement.description,
    });
  }

  protected setType(type: MovementType): void {
    this.form.controls.type.setValue(type);
  }

  protected error(name: 'amount' | 'category' | 'date' | 'description'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) return null;
    const e = control.errors;
    if (e['required']) {
      return { amount: 'Ingresa un monto.', category: 'Selecciona una categoría.', date: 'Selecciona una fecha.', description: '' }[name];
    }
    if (e['min']) return 'El monto debe ser mayor a cero.';
    if (e['max']) return `El monto máximo es ${formatCurrency(MAX_AMOUNT)}.`;
    if (e['maxDecimals']) return 'Usa máximo 2 decimales.';
    if (e['isoDate']) return 'Fecha no válida.';
    if (e['minDate']) return `Solo se guardan movimientos de los últimos ${RETENTION_YEARS} años.`;
    if (e['maxDate']) return 'La fecha no puede ser mayor a un año en el futuro.';
    if (e['maxlength']) return `Máximo ${DESCRIPTION_MAX_LENGTH} caracteres.`;
    return 'Valor no válido.';
  }

  protected startCategory(): void {
    this.newCategory.reset('');
    this.categoryError.set(null);
    this.addingCategory.set(true);
  }

  protected cancelCategory(): void {
    this.addingCategory.set(false);
    this.categoryError.set(null);
  }

  protected saveCategory(): void {
    if (this.newCategory.invalid) {
      this.newCategory.markAsTouched();
      this.categoryError.set(
        this.newCategory.hasError('maxlength') ? `Máximo ${CATEGORY_MAX_LENGTH} caracteres.` : 'Escribe un nombre.',
      );
      return;
    }
    const result = this.finance.addCategory(this.type(), this.newCategory.value);
    if (!result.ok) {
      this.categoryError.set(result.error);
      return;
    }
    this.form.controls.category.setValue(result.name);
    this.form.controls.category.markAsTouched();
    this.addingCategory.set(false);
    this.toast.success(`Categoría "${result.name}" creada`);
  }

  protected submit(addAnother = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Faltan datos. Revisa los campos marcados en rojo.');
      return;
    }
    const value = this.form.getRawValue();
    const input: MovementInput = { ...value, amount: value.amount ?? 0 };
    const label = `${this.typeLabel[input.type]} de ${formatCurrency(input.amount)}`;
    const id = this.id();

    if (id) {
      if (!this.finance.update(id, input)) {
        this.toast.error('No se pudo actualizar el movimiento.');
        return;
      }
      this.toast.success(`${label} actualizado`);
      this.router.navigate(['/movimientos', id]);
      return;
    }

    if (!this.finance.add(input)) {
      this.toast.error('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.');
      return;
    }
    this.toast.success(`${label} registrado`);

    if (addAnother) {
      // Conserva tipo, categoría y fecha para capturas en serie
      this.form.reset({ type: input.type, amount: null, category: input.category, date: input.date, description: '' });
      this.justSaved.set(true);
      setTimeout(() => this.justSaved.set(false), 1600);
    } else {
      this.router.navigate(['/movimientos']);
    }
  }
}
