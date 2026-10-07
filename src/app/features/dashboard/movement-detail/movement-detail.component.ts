import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ConfirmService } from '../../../core/services/confirm.service';
import { FinanceService } from '../../../core/services/finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { MOVEMENT_TYPE_LABEL } from '../../../shared/models/categories';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { monthKey, monthLabel } from '../../../shared/utils/date.utils';
import { formatCurrency, formatPercent } from '../../../shared/utils/format.utils';

@Component({
  selector: 'app-movement-detail',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <a class="back" routerLink="/movimientos"><svg lucideIcon="arrow-left" [size]="14" aria-hidden="true"></svg> Movimientos</a>
          <h1 class="page-title">Detalle del movimiento</h1>
        </div>
      </header>

      @if (movement(); as m) {
        <section class="detalle tarjeta">
          <div class="hero">
            <span class="pill" [class.pill--ingreso]="m.type === 'ingreso'" [class.pill--egreso]="m.type === 'egreso'">
              <span class="punto"></span>{{ typeLabel[m.type] }}
            </span>
            <strong class="hero__amount pc-num" [class.text-income]="m.type === 'ingreso'" [class.text-expense]="m.type === 'egreso'">
              {{ m.type === 'ingreso' ? '+' : '−' }}{{ m.amount | currencyFormat }}
            </strong>
            <span class="hero__date pc-num">{{ m.date | dateFormat: 'short' }}</span>
          </div>

          <dl class="datos">
            <div>
              <dt class="etiqueta">Categoría</dt>
              <dd><span class="punto" [style.background]="finance.colorOf(m.type, m.category)"></span>{{ m.category }}</dd>
            </div>
            <div>
              <dt class="etiqueta">Registrado</dt>
              <dd class="pc-num">{{ m.createdAt | dateFormat: 'short' }}</dd>
            </div>
            <div class="ancho">
              <dt class="etiqueta">Descripción</dt>
              <dd [class.text-muted]="!m.description">{{ m.description || '—' }}</dd>
            </div>
            @if (context(); as ctx) {
              <div class="ancho">
                <dt class="etiqueta">En contexto</dt>
                <dd class="contexto">{{ ctx }}</dd>
              </div>
            }
          </dl>

          <footer class="pie">
            <button type="button" class="pc-boton boton-elevado boton-peligro" (click)="remove()">
              <svg lucideIcon="trash-2" [size]="14" aria-hidden="true"></svg> Eliminar
            </button>
            <a class="pc-boton boton-primario-elevado" [routerLink]="['/movimientos', m.id, 'editar']">
              <svg lucideIcon="pencil" [size]="14" aria-hidden="true"></svg> Editar
            </a>
          </footer>
        </section>
      } @else {
        <div class="tarjeta">
          <div class="empty-state">
            <span class="empty-state__icon"><svg lucideIcon="search-x" [size]="20" [strokeWidth]="1.75" aria-hidden="true"></svg></span>
            <h3>No encontramos ese movimiento</h3>
            <p>Es posible que se haya eliminado. Vuelve a la lista para buscarlo.</p>
            <div class="empty-state__actions">
              <a class="pc-boton boton-elevado" routerLink="/movimientos">Ver movimientos</a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .page { max-width: 640px; }
    .back {
      display: inline-flex; align-items: center; gap: 4px; margin-bottom: 8px;
      font-size: 12px; font-weight: 600; text-decoration: none; color: var(--texto-tenue);
    }
    .back:hover { color: var(--texto-activo); }
    .tarjeta {
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    :host-context(.dark) .tarjeta { border-color: var(--border); }
    .hero {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 28px 20px 24px;
      border-bottom: 1px solid var(--border-suave);
    }
    .hero__amount { font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.025em; }
    .hero__date { font-size: 12px; color: var(--texto-tenue); }
    .datos {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px;
      margin: 0; padding: 20px;
    }
    .datos .ancho { grid-column: 1 / -1; }
    dd {
      display: flex; align-items: center; gap: 8px;
      margin: 2px 0 0; font-size: 13px; font-weight: 500; overflow-wrap: anywhere;
    }
    .contexto { font-size: 12px; font-weight: 400; line-height: 1.625; color: var(--muted-foreground); }
    .pie {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--divisor-tenue);
      background: var(--pie-tarjeta);
      border-radius: 0 0 var(--radius-xl) var(--radius-xl);
    }
    @media (max-width: 519px) { .pie .pc-boton { flex: 1; height: 44px; } }
  `,
})
export class MovementDetailComponent {
  readonly id = input.required<string>();

  protected readonly finance = inject(FinanceService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;

  protected readonly movement = computed(() => this.finance.movements().find((m) => m.id === this.id()));

  /** Peso del movimiento dentro de su categoría en ese mes. */
  protected readonly context = computed(() => {
    const m = this.movement();
    if (!m) return null;
    const key = monthKey(m.date);
    const sameMonth = this.finance.movements().filter((x) => x.type === m.type && monthKey(x.date) === key);
    const categoryTotal = sameMonth.filter((x) => x.category === m.category).reduce((sum, x) => sum + x.amount, 0);
    const typeTotal = sameMonth.reduce((sum, x) => sum + x.amount, 0);
    const kind = m.type === 'egreso' ? 'egresos' : 'ingresos';
    return (
      `${m.category} suma ${formatCurrency(categoryTotal)} en ${monthLabel(key, true)} ` +
      `(${formatPercent(typeTotal ? categoryTotal / typeTotal : 0)} de tus ${kind} del mes).`
    );
  });

  protected async remove(): Promise<void> {
    const m = this.movement();
    if (!m) return;
    const ok = await this.confirm.ask({
      title: 'Eliminar movimiento',
      message: `¿Eliminar este ${this.typeLabel[m.type].toLowerCase()} de ${formatCurrency(m.amount)}?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const removed = this.finance.remove(m.id);
    if (!removed) {
      this.toast.error('No se pudo eliminar el movimiento.');
      return;
    }
    this.toast.success('Movimiento eliminado', { label: 'Deshacer', run: () => this.finance.restore(removed) });
    this.router.navigate(['/movimientos']);
  }
}
