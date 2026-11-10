import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { AccountsService } from '../../core/services/accounts.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { ACCOUNT_ICON, ACCOUNT_LABEL, ACCOUNT_SHORT_LABEL, DESCRIPTION_MAX_LENGTH, RETENTION_YEARS } from '../../shared/models/categories';
import { ACCOUNT_KINDS, AccountKind, Transfer } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { addYears, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency } from '../../shared/utils/format.utils';
import { FinanceValidators } from '../../shared/validators/finance.validators';

const MAX_AMOUNT = 999_999_999;
const TRANSFERS_SHOWN = 20;

/** Las dos direcciones posibles de un traspaso, con su nombre cotidiano. */
const DIRECTIONS = [
  { from: 'banco', to: 'efectivo', label: 'Retiro', hint: 'Sacaste efectivo del cajero' },
  { from: 'efectivo', to: 'banco', label: 'Depósito', hint: 'Depositaste efectivo en tu cuenta' },
] as const satisfies readonly { from: AccountKind; to: AccountKind; label: string; hint: string }[];

/** Saldo disponible por cuenta, saldo inicial y traspasos entre efectivo y tarjeta/transferencia. */
@Component({
  selector: 'app-accounts',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CardComponent, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent {
  protected readonly accounts = inject(AccountsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly label = ACCOUNT_LABEL;
  protected readonly shortLabel = ACCOUNT_SHORT_LABEL;
  protected readonly icon = ACCOUNT_ICON;
  protected readonly directions = DIRECTIONS;
  protected readonly abs = Math.abs;
  protected readonly descriptionMax = DESCRIPTION_MAX_LENGTH;
  protected readonly today = todayIso();
  protected readonly minDate = addYears(this.today, -RETENTION_YEARS);
  protected readonly maxTransferDate = addYears(this.today, 1);

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly amount = (required: boolean) => [
    ...(required ? [Validators.required, Validators.min(0.01)] : [Validators.required, Validators.min(0)]),
    Validators.max(MAX_AMOUNT),
    FinanceValidators.maxDecimals(2),
  ];

  protected readonly openingForm = this.fb.group({
    date: [this.accounts.opening()?.date ?? this.today, [Validators.required, FinanceValidators.isoDate]],
    efectivo: new FormControl<number | null>(this.accounts.opening()?.efectivo ?? null, this.amount(false)),
    banco: new FormControl<number | null>(this.accounts.opening()?.banco ?? null, this.amount(false)),
  });
  /** El formulario se abre solo si aún no hay saldo inicial. */
  protected readonly editingOpening = signal(this.accounts.opening() === null);

  protected readonly transferForm = this.fb.group({
    direction: [0],
    amount: new FormControl<number | null>(null, this.amount(true)),
    date: [this.today, [Validators.required, FinanceValidators.isoDate]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]],
  });
  protected readonly direction = toSignal(this.transferForm.controls.direction.valueChanges, { initialValue: 0 });

  protected readonly showAll = signal(false);
  protected readonly visibleTransfers = computed(() =>
    this.showAll() ? this.accounts.transfers() : this.accounts.transfers().slice(0, TRANSFERS_SHOWN),
  );

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected editOpening(): void {
    const opening = this.accounts.opening();
    this.openingForm.reset({ date: opening?.date ?? this.today, efectivo: opening?.efectivo ?? null, banco: opening?.banco ?? null });
    this.editingOpening.set(true);
  }

  protected saveOpening(): void {
    const { date } = this.openingForm.controls;
    if (this.openingForm.invalid || date.value < this.minDate || date.value > this.today) {
      this.openingForm.markAllAsTouched();
      return;
    }
    const value = this.openingForm.getRawValue();
    const ok = this.accounts.setOpening({ date: value.date, efectivo: value.efectivo ?? 0, banco: value.banco ?? 0 });
    if (!ok) {
      this.toast.error('No se pudo guardar el saldo inicial.');
      return;
    }
    this.editingOpening.set(false);
    this.toast.success('Saldo inicial guardado');
  }

  protected openingDateError(): string | null {
    const control = this.openingForm.controls.date;
    if (!control.touched) return null;
    if (control.invalid) return 'Elige una fecha.';
    if (control.value > this.today) return 'La fecha no puede ser futura.';
    if (control.value < this.minDate) return `Solo se guardan movimientos de los últimos ${RETENTION_YEARS} años.`;
    return null;
  }

  protected setDirection(index: number): void {
    this.transferForm.controls.direction.setValue(index);
  }

  protected addTransfer(): void {
    const { date } = this.transferForm.controls;
    if (this.transferForm.invalid || date.value < this.minDate || date.value > this.maxTransferDate) {
      this.transferForm.markAllAsTouched();
      return;
    }
    const value = this.transferForm.getRawValue();
    const { from, to, label } = DIRECTIONS[value.direction];
    const transfer = this.accounts.addTransfer({ from, to, amount: value.amount ?? 0, date: value.date, description: value.description });
    if (!transfer) {
      this.toast.error('No se pudo registrar el traspaso.');
      return;
    }
    this.transferForm.reset({ direction: value.direction, amount: null, date: value.date, description: '' });
    this.toast.success(`${label} de ${formatCurrency(transfer.amount)} registrado`);
  }

  protected transferLabel(transfer: Transfer): string {
    return DIRECTIONS.find((d) => d.from === transfer.from)?.label ?? 'Traspaso';
  }

  protected async removeTransfer(transfer: Transfer): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar traspaso',
      message: `¿Eliminar el ${this.transferLabel(transfer).toLowerCase()} de ${formatCurrency(transfer.amount)}? Los saldos de tus cuentas se ajustarán.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const removed = this.accounts.removeTransfer(transfer.id);
    if (removed) this.toast.success('Traspaso eliminado', { label: 'Deshacer', run: () => this.accounts.restoreTransfer(removed) });
  }
}
