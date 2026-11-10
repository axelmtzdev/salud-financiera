import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../core/services/confirm.service';
import { FinanceService } from '../../core/services/finance.service';
import { RecurringInput, RecurringService } from '../../core/services/recurring.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { PaymentKind, RecurringFrequency, RecurringPayment } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { monthKey, monthLabel, shiftMonthKey, todayIso } from '../../shared/utils/date.utils';
import { formatCurrency } from '../../shared/utils/format.utils';
import { DetectedPayment, InstallmentProgress, Occurrence, PriceChange, lastInstallmentMonth } from '../../shared/utils/recurring.utils';

const KINDS: readonly { value: PaymentKind; label: string; hint: string }[] = [
  { value: 'fijo', label: 'Fijo', hint: 'Mismo monto cada mes o cada año: renta, servicios, suscripciones.' },
  { value: 'plazos', label: 'A plazos', hint: 'Un número de pagos iguales: crédito de la moto, meses sin intereses.' },
  { value: 'variable', label: 'Variable', hint: 'Cada mes, con un monto que cambia: el pago de tu tarjeta de crédito.' },
  { value: 'unico', label: 'Único', hint: 'Una sola vez en una fecha: vacaciones, tenencia, inscripción.' },
];

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Pagos fijos, créditos a plazos, montos variables y pagos únicos: qué viene, qué ya se pagó y cuánto comprometen. */
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
  protected readonly kinds = KINDS;
  private readonly today = todayIso();

  protected readonly next = computed(() => this.recurring.upcoming().find((o) => o.status === 'pendiente') ?? null);

  // ---------- Formulario ----------
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly kind = signal<PaymentKind>('fijo');
  protected readonly installments = signal('');
  protected readonly startMonth = signal(monthKey(todayIso()));
  protected readonly date = signal('');
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

  protected kindHint(): string {
    return KINDS.find((k) => k.value === this.kind())!.hint;
  }

  protected schedule(p: RecurringPayment): string {
    switch (p.kind) {
      case 'unico':
        return `Una vez, ${Number(p.date!.slice(8))} de ${MONTHS[Number(p.date!.slice(5, 7)) - 1]} de ${p.date!.slice(0, 4)}`;
      case 'plazos':
        return `Día ${p.day} · ${p.installments} pagos, de ${monthLabel(p.startMonth!)} a ${monthLabel(lastInstallmentMonth(p)!)}`;
      case 'variable':
        return `Cada mes, día ${p.day} · monto variable`;
      default:
        return p.frequency === 'mensual' ? `Cada mes, día ${p.day}` : `Cada año, ${p.day} de ${MONTHS[(p.month ?? 1) - 1]}`;
    }
  }

  /** Lo que se muestra junto al monto: "/mes", "/año", "/pago"… */
  protected period(p: RecurringPayment): string {
    if (p.kind === 'unico') return '';
    if (p.kind === 'plazos') return '/pago';
    if (p.kind === 'variable') return '/mes';
    return p.frequency === 'mensual' ? '/mes' : '/año';
  }

  /** Monto a mostrar en la lista: en los variables, el de este mes. */
  protected rowAmount(row: { payment: RecurringPayment; occurrence: Occurrence | null }): number {
    return row.payment.kind === 'variable' && row.occurrence ? row.occurrence.amount : row.payment.amount;
  }

  protected progressText(p: InstallmentProgress): string {
    return p.finished
      ? `Liquidado: ${p.total} de ${p.total} pagos`
      : `${p.paid} de ${p.total} pagos · faltan ${this.fmt(p.remaining)}`;
  }

  /** Vista previa del último pago mientras se captura un crédito. */
  protected lastMonthPreview(): string | null {
    const n = Number(this.installments());
    if (!Number.isInteger(n) || n < 1 || !this.startMonth()) return null;
    return monthLabel(shiftMonthKey(this.startMonth(), n - 1), true);
  }

  // ---------- Monto del mes (variables) ----------

  protected readonly adjusting = signal<string | null>(null);
  protected readonly adjustValue = signal('');

  protected occurrenceKey(o: Occurrence): string {
    return o.payment.id + o.due;
  }

  protected startAdjust(o: Occurrence): void {
    this.adjustValue.set(String(o.amount));
    this.adjusting.set(this.occurrenceKey(o));
  }

  protected saveAdjust(o: Occurrence): void {
    const amount = Number(this.adjustValue().replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.toast.error('Escribe un monto mayor a cero.');
      return;
    }
    if (this.recurring.setMonthAmount(o.payment.id, monthKey(o.due), amount)) {
      this.toast.success(`${o.payment.name}: ${this.fmt(amount)} en ${monthLabel(monthKey(o.due), true)}`);
    }
    this.adjusting.set(null);
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
    this.kind.set('fijo');
    this.installments.set('');
    this.startMonth.set(monthKey(this.today));
    this.date.set('');
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
    this.kind.set(p.kind);
    this.installments.set(p.installments ? String(p.installments) : '');
    this.startMonth.set(p.startMonth ?? monthKey(this.today));
    this.date.set(p.date ?? '');
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
    const kind = this.kind();
    const input: RecurringInput = {
      kind,
      name: this.name(),
      category: this.category(),
      amount: Number(this.amount().replace(/[^\d.]/g, '')),
      frequency: this.frequency(),
      day: Number(this.day()),
      month: this.frequency() === 'anual' ? Number(this.month()) : null,
      match: this.match(),
      subscription: this.subscription(),
      installments: kind === 'plazos' ? Number(this.installments()) : null,
      startMonth: kind === 'plazos' ? this.startMonth() : null,
      date: kind === 'unico' ? this.date() : null,
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
    const movement = this.recurring.markPaid(o);
    if (!movement) {
      this.toast.error('No se pudo registrar el pago.');
      return;
    }
    this.toast.success(`${o.payment.name}: egreso de ${this.fmt(o.amount)} registrado`, {
      label: 'Deshacer',
      run: () => this.recurring.undoPaid(o, movement),
    });
  }

  protected async remove(p: RecurringPayment): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Quitar pago',
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
