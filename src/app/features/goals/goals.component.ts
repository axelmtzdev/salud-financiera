import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../core/services/confirm.service';
import { FinanceService } from '../../core/services/finance.service';
import { GoalsService } from '../../core/services/goals.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { ACCOUNT_ICON, ACCOUNT_LABEL, ACCOUNT_SHORT_LABEL } from '../../shared/models/categories';
import { ACCOUNT_KINDS, AccountKind, GoalContribution } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { addYears, monthDiff, monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, round2 } from '../../shared/utils/format.utils';
import { GoalProgress, GoalStatus } from '../../shared/utils/goals.utils';
import { FinanceValidators } from '../../shared/validators/finance.validators';

const MAX_AMOUNT = 999_999_999;
const HISTORY_SHOWN = 5;

type PanelMode = 'abonar' | 'retirar' | 'completar' | 'historial';

const STATUS_LABEL: Record<GoalStatus, string> = {
  'en-curso': 'En curso',
  alcanzada: 'Alcanzada',
  vencida: 'Fecha vencida',
  completada: 'Completada',
};

/** Metas de ahorro: precio, fecha opcional, abonos que apartan dinero y barra de progreso. */
@Component({
  selector: 'app-goals',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, LucideDynamicIcon, CardComponent, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goals.component.html',
  styleUrl: './goals.component.scss',
})
export class GoalsComponent {
  protected readonly goals = inject(GoalsService);
  private readonly finance = inject(FinanceService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly accountLabel = ACCOUNT_LABEL;
  protected readonly accountShort = ACCOUNT_SHORT_LABEL;
  protected readonly accountIcon = ACCOUNT_ICON;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly historyShown = HISTORY_SHOWN;
  protected readonly today = todayIso();
  protected readonly minDate = addYears(this.today, -2);
  protected readonly maxTargetDate = addYears(this.today, 30);
  protected readonly expenseCategories = computed(() => this.finance.categories().egreso);

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly amountValidators = [Validators.required, Validators.min(0.01), Validators.max(MAX_AMOUNT), FinanceValidators.maxDecimals(2)];

  // ---------- Crear / editar ----------

  /** null = cerrado; '' = nueva meta; id = editando esa meta */
  protected readonly editing = signal<string | null>(null);
  protected readonly goalForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(40), FinanceValidators.notBlank]],
    target: new FormControl<number | null>(null, this.amountValidators),
    targetDate: [''],
  });
  private readonly goalValue = toSignal(this.goalForm.valueChanges, { initialValue: this.goalForm.getRawValue() });
  /** Vista previa del ahorro mensual mientras se captura la meta. */
  protected readonly monthlyPreview = computed(() => {
    const { target, targetDate } = this.goalValue();
    if (!target || target <= 0 || !targetDate || targetDate < this.today) return null;
    const months = Math.max(1, monthDiff(monthKey(this.today), monthKey(targetDate)) + 1);
    return { monthly: round2(target / months), months };
  });

  // ---------- Abonos, retiros y completar ----------

  protected readonly panel = signal<{ goalId: string; mode: PanelMode } | null>(null);
  protected readonly moveForm = this.fb.group({
    amount: new FormControl<number | null>(null, this.amountValidators),
    account: new FormControl<AccountKind>('banco', { nonNullable: true }),
    date: [this.today, [Validators.required, FinanceValidators.isoDate]],
  });
  protected readonly moveAccount = toSignal(this.moveForm.controls.account.valueChanges, { initialValue: 'banco' as AccountKind });
  protected readonly moveError = signal<string | null>(null);

  protected readonly completeForm = this.fb.group({
    register: [true],
    category: ['', [Validators.required]],
    amount: new FormControl<number | null>(null, this.amountValidators),
    account: new FormControl<AccountKind>('banco', { nonNullable: true }),
  });
  protected readonly registerPurchase = toSignal(this.completeForm.controls.register.valueChanges, { initialValue: true });
  protected readonly completeAccount = toSignal(this.completeForm.controls.account.valueChanges, { initialValue: 'banco' as AccountKind });

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected monthName(date: string): string {
    return monthLabel(monthKey(date), true);
  }

  protected startCreate(): void {
    this.goalForm.reset({ name: '', target: null, targetDate: '' });
    this.editing.set('');
  }

  protected startEdit(p: GoalProgress): void {
    this.goalForm.reset({ name: p.goal.name, target: p.goal.target, targetDate: p.goal.targetDate ?? '' });
    this.panel.set(null);
    this.editing.set(p.goal.id);
  }

  protected saveGoal(): void {
    const { targetDate } = this.goalForm.controls;
    const dateInvalid = !!targetDate.value && (targetDate.value < this.today || targetDate.value > this.maxTargetDate);
    if (this.goalForm.invalid || dateInvalid) {
      this.goalForm.markAllAsTouched();
      return;
    }
    const { name, target, targetDate: date } = this.goalForm.getRawValue();
    const input = { name, target: target ?? 0, targetDate: date || null };
    const id = this.editing();
    if (id) {
      if (!this.goals.updateGoal(id, input)) return this.toast.error('No se pudo guardar la meta.');
      this.toast.success('Meta actualizada');
    } else {
      if (!this.goals.addGoal(input)) return this.toast.error('No se pudo crear la meta.');
      this.toast.success(`Meta "${name.trim()}" creada`);
    }
    this.editing.set(null);
  }

  protected targetDateError(): string | null {
    const control = this.goalForm.controls.targetDate;
    if (!control.touched || !control.value) return null;
    if (control.value < this.today) return 'La fecha objetivo debe ser de hoy en adelante.';
    if (control.value > this.maxTargetDate) return 'Elige una fecha más cercana.';
    return null;
  }

  protected open(p: GoalProgress, mode: PanelMode): void {
    const current = this.panel();
    if (current?.goalId === p.goal.id && current.mode === mode) {
      this.panel.set(null);
      return;
    }
    this.editing.set(null);
    this.moveError.set(null);
    // Para retirar se propone la cuenta donde hay más apartado; para abonar, la que tiene más libre
    const free = this.goals.free();
    const account: AccountKind =
      mode === 'abonar'
        ? free && free.efectivo > free.banco ? 'efectivo' : 'banco'
        : p.byAccount.efectivo > p.byAccount.banco ? 'efectivo' : 'banco';
    this.moveForm.reset({ amount: mode === 'abonar' && p.monthly ? p.monthly : null, account, date: this.today });
    if (mode === 'completar') {
      this.completeForm.reset({ register: true, category: '', amount: p.saved || p.goal.target, account });
    }
    this.panel.set({ goalId: p.goal.id, mode });
  }

  protected isOpen(p: GoalProgress, mode: PanelMode): boolean {
    const current = this.panel();
    return current?.goalId === p.goal.id && current.mode === mode;
  }

  /** Libre en la cuenta elegida para abonar (null sin saldo inicial). */
  protected freeIn(account: AccountKind): number | null {
    return this.goals.free()?.[account] ?? null;
  }

  protected saveMove(p: GoalProgress, mode: 'abonar' | 'retirar'): void {
    this.moveError.set(null);
    const { date } = this.moveForm.controls;
    if (this.moveForm.invalid || date.value < this.minDate || date.value > this.today) {
      this.moveForm.markAllAsTouched();
      if (this.moveForm.valid) this.moveError.set('La fecha no puede ser futura ni de hace más de 2 años.');
      return;
    }
    const { amount, account } = this.moveForm.getRawValue();
    const value = amount ?? 0;
    if (mode === 'retirar' && value > p.byAccount[account]) {
      this.moveError.set(`En ${this.accountLabel[account]} solo tienes ${formatCurrency(p.byAccount[account])} apartados para esta meta.`);
      return;
    }
    const free = this.freeIn(account);
    if (mode === 'abonar' && free !== null && value > free) {
      this.moveError.set(`En ${this.accountLabel[account]} tienes ${formatCurrency(Math.max(0, free))} libres.`);
      return;
    }
    const saved = this.goals.contribute(p.goal.id, account, mode === 'abonar' ? value : -value, date.value);
    if (!saved) return this.toast.error('No se pudo guardar.');
    this.panel.set(null);
    const reached = mode === 'abonar' && value >= p.remaining && p.remaining > 0;
    this.toast.success(
      reached
        ? `¡Alcanzaste tu meta "${p.goal.name}"!`
        : mode === 'abonar'
          ? `Apartaste ${formatCurrency(value)} para "${p.goal.name}"`
          : `Regresaste ${formatCurrency(value)} a tu disponible`,
    );
  }

  protected complete(p: GoalProgress): void {
    const { register, category, amount, account } = this.completeForm.getRawValue();
    if (register && this.completeForm.invalid) {
      this.completeForm.markAllAsTouched();
      return;
    }
    const purchase = register ? { category, account, amount: amount ?? 0 } : null;
    if (!this.goals.complete(p.goal.id, purchase)) return this.toast.error('No se pudo completar la meta.');
    this.panel.set(null);
    this.toast.success(
      purchase ? `Meta cumplida. Registramos la compra de ${formatCurrency(purchase.amount)}.` : `Meta "${p.goal.name}" cumplida`,
    );
  }

  protected reopen(p: GoalProgress): void {
    if (this.goals.reopen(p.goal.id)) this.toast.success(`"${p.goal.name}" volvió a tus metas activas`);
  }

  protected async remove(p: GoalProgress): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar meta',
      message: p.saved && !p.goal.completedAt
        ? `Se eliminará "${p.goal.name}" con sus abonos; los ${formatCurrency(p.saved)} apartados vuelven a estar libres.`
        : `¿Eliminar la meta "${p.goal.name}"?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const removed = this.goals.removeGoal(p.goal.id);
    if (removed) this.toast.success('Meta eliminada', { label: 'Deshacer', run: () => this.goals.restoreGoal(removed) });
  }

  protected history(goalId: string): GoalContribution[] {
    return this.goals.contributionsOf(goalId);
  }

  protected removeContribution(c: GoalContribution): void {
    const removed = this.goals.removeContribution(c.id);
    if (removed) this.toast.success(c.amount > 0 ? 'Abono eliminado' : 'Retiro eliminado', { label: 'Deshacer', run: () => this.goals.restoreContribution(removed) });
  }
}
