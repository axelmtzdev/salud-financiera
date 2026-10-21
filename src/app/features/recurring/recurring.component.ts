import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../core/services/confirm.service';
import { FinanceService } from '../../core/services/finance.service';
import { RecurringInput, RecurringService } from '../../core/services/recurring.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { RecurringFrequency, RecurringPayment } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { formatCurrency } from '../../shared/utils/format.utils';
import { DetectedPayment, Occurrence, PriceChange } from '../../shared/utils/recurring.utils';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Pagos fijos y suscripciones: qué viene, qué ya se pagó y cuánto comprometen al mes. */
@Component({
  selector: 'app-recurring',
  imports: [LucideDynamicIcon, CardComponent, StatTileComponent, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurring.component.html',
  styleUrl: './recurring.component.scss',
})
export class RecurringComponent {
  protected readonly recurring = inject(RecurringService);
  protected readonly finance = inject(FinanceService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly months = MONTHS.map((label, i) => ({ value: i + 1, label: capitalize(label) }));
  protected readonly days = Array.from({ length: 31 }, (_, i) => i + 1);

  protected readonly next = computed(() => this.recurring.upcoming().find((o) => o.status === 'pendiente') ?? null);

  // ---------- Formulario ----------
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly category = signal('');
  protected readonly amount = signal('');
  protected readonly frequency = signal<RecurringFrequency>('mensual');
  protected readonly day = signal(1);
  protected readonly month = signal<number>(new Date().getMonth() + 1);
  protected readonly match = signal('');
  protected readonly subscription = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected fmt(value: number): string {
    return formatCurrency(value);
  }

  protected schedule(p: RecurringPayment): string {
    return p.frequency === 'mensual' ? `Cada mes, día ${p.day}` : `Cada año, ${p.day} de ${MONTHS[(p.month ?? 1) - 1]}`;
  }

  protected whenLabel(o: Occurrence): string {
    if (o.status === 'pagado') return 'Pagado';
    if (o.daysLeft < 0) return o.daysLeft === -1 ? 'Venció ayer' : `Venció hace ${-o.daysLeft} días`;
    if (o.daysLeft === 0) return 'Vence hoy';
    if (o.daysLeft === 1) return 'Mañana';
    return `En ${o.daysLeft} días`;
  }

  protected monthShort(iso: string): string {
    return MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3);
  }

  protected openNew(): void {
    this.editingId.set(null);
    this.name.set('');
    this.category.set('');
    this.amount.set('');
    this.frequency.set('mensual');
    this.day.set(new Date().getDate());
    this.month.set(new Date().getMonth() + 1);
    this.match.set('');
    this.subscription.set(false);
    this.formError.set(null);
    this.formOpen.set(true);
    this.scrollToForm();
  }

  protected edit(p: RecurringPayment): void {
    this.editingId.set(p.id);
    this.name.set(p.name);
    this.category.set(p.category);
    this.amount.set(String(p.amount));
    this.frequency.set(p.frequency);
    this.day.set(p.day);
    this.month.set(p.month ?? new Date().getMonth() + 1);
    this.match.set(p.match);
    this.subscription.set(p.subscription);
    this.formError.set(null);
    this.formOpen.set(true);
    this.scrollToForm();
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  protected submit(): void {
    const input: RecurringInput = {
      name: this.name(),
      category: this.category(),
      amount: Number(this.amount().replace(/[^\d.]/g, '')),
      frequency: this.frequency(),
      day: Number(this.day()),
      month: this.frequency() === 'anual' ? Number(this.month()) : null,
      match: this.match(),
      subscription: this.subscription(),
    };
    const result = this.recurring.save(input, this.editingId() ?? undefined);
    if (!result.ok) {
      this.formError.set(result.error);
      return;
    }
    this.toast.success(this.editingId() ? `${result.payment.name} actualizado` : `${result.payment.name} agregado a tus pagos`);
    this.cancelForm();
  }

  // ---------- Acciones ----------

  protected markPaid(o: Occurrence): void {
    const movement = this.recurring.markPaid(o.payment);
    if (!movement) {
      this.toast.error('No se pudo registrar el pago.');
      return;
    }
    this.toast.success(`${o.payment.name}: egreso de ${this.fmt(o.payment.amount)} registrado`, {
      label: 'Deshacer',
      run: () => this.finance.remove(movement.id),
    });
  }

  protected async remove(p: RecurringPayment): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Quitar pago recurrente',
      message: `¿Quitar "${p.name}" de tus pagos? Los egresos que ya registraste no se borran.`,
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    const removed = this.recurring.remove(p.id);
    if (removed) this.toast.success(`${p.name} quitado`, { label: 'Deshacer', run: () => this.recurring.restore(removed) });
  }

  protected applyPrice(change: PriceChange): void {
    if (this.recurring.updateAmount(change.payment.id, change.to)) {
      this.toast.success(`${change.payment.name} ahora es de ${this.fmt(change.to)}`);
    }
  }

  protected addDetected(d: DetectedPayment): void {
    const result = this.recurring.addDetected(d);
    if (result.ok) this.toast.success(`${d.name} agregado a tus pagos`);
    else this.toast.error(result.error);
  }

  protected addAllDetected(): void {
    const list = this.recurring.detected();
    const added = list.filter((d) => this.recurring.addDetected(d).ok).length;
    if (added) this.toast.success(`${added} ${added === 1 ? 'pago agregado' : 'pagos agregados'}`);
  }

  protected ignore(d: DetectedPayment): void {
    if (this.recurring.ignore(d.key)) {
      this.toast.show(`No volveremos a sugerir "${d.name}"`, 'info', { duration: 3500 });
    }
  }

  protected restoreIgnored(): void {
    if (this.recurring.clearIgnored()) this.toast.success('Se volverán a sugerir los pagos descartados');
  }

  private scrollToForm(): void {
    setTimeout(() => {
      const form = document.getElementById('pago-form');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
