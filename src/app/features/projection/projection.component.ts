import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../core/services/finance.service';
import { ProjectionService } from '../../core/services/projection.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { MonthlyPoint, PlannedExpense } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { addYears, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency, joinSpanish } from '../../shared/utils/format.utils';
import { FinanceValidators } from '../../shared/validators/finance.validators';
import { LineChartComponent } from '../analytics/charts/line-chart.component';

const MAX_AMOUNT = 999_999_999;
const HORIZONS = [3, 6, 12] as const;

/** Saldo libre proyectado mes a mes y gastos planeados. */
@Component({
  selector: 'app-projection',
  imports: [ReactiveFormsModule, RouterLink, LucideDynamicIcon, CardComponent, StatTileComponent, LineChartComponent, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projection.component.html',
  styleUrl: './projection.component.scss',
})
export class ProjectionComponent {
  protected readonly projection = inject(ProjectionService);
  private readonly finance = inject(FinanceService);
  private readonly toast = inject(ToastService);

  protected readonly horizons = HORIZONS;
  protected readonly horizon = signal<number>(6);
  protected readonly today = todayIso();
  protected readonly maxPlannedDate = addYears(this.today, 2);
  protected readonly expenseCategories = computed(() => this.finance.categories().egreso);

  protected readonly result = computed(() => this.projection.project(this.horizon()));
  protected readonly last = computed(() => this.result().months.at(-1)!);

  /** Puntos para la gráfica: la línea es el saldo libre al cierre de cada mes. */
  protected readonly chartPoints = computed<MonthlyPoint[]>(() =>
    this.result().months.map((m) => ({
      key: m.key,
      label: m.label,
      income: m.income,
      expense: m.variable + m.recurring + m.planned + m.goals,
      net: m.balance,
    })),
  );

  protected readonly basisText = computed(() => {
    const { basis } = this.result();
    if (!basis.months.length) return null;
    return joinSpanish(basis.months.map((key) => monthLabel(key, true).split(' de ')[0]));
  });

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly plannedForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(60), FinanceValidators.notBlank]],
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(MAX_AMOUNT), FinanceValidators.maxDecimals(2)]),
    date: ['', [Validators.required, FinanceValidators.isoDate]],
    category: ['', [Validators.required]],
  });
  protected readonly showPlannedForm = signal(false);

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected fmt(value: number): string {
    return formatCurrency(value);
  }

  /** "+$1,200.00" o "−$800.00" */
  protected signed(value: number): string {
    return (value < 0 ? '−' : '+') + formatCurrency(Math.abs(value));
  }

  protected monthName(key: string): string {
    return monthLabel(key, true);
  }

  protected plannedDateError(): string | null {
    const control = this.plannedForm.controls.date;
    if (!control.touched) return null;
    if (control.invalid) return 'Elige una fecha.';
    if (control.value < this.today) return 'Debe ser de hoy en adelante.';
    if (control.value > this.maxPlannedDate) return 'Máximo 2 años hacia adelante.';
    return null;
  }

  protected addPlanned(): void {
    if (this.plannedForm.invalid || this.plannedDateError()) {
      this.plannedForm.markAllAsTouched();
      return;
    }
    const { description, amount, date, category } = this.plannedForm.getRawValue();
    const item = this.projection.addPlanned({ description, amount: amount ?? 0, date, category });
    if (!item) return this.toast.error('No se pudo guardar el gasto planeado.');
    this.plannedForm.reset({ description: '', amount: null, date: '', category: '' });
    this.showPlannedForm.set(false);
    this.toast.success(`"${item.description}" se incluye en la proyección`);
  }

  protected removePlanned(item: PlannedExpense): void {
    const removed = this.projection.removePlanned(item.id);
    if (removed) this.toast.success('Gasto planeado eliminado', { label: 'Deshacer', run: () => this.projection.restorePlanned(removed) });
  }
}
