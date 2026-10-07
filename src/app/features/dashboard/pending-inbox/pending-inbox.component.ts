import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../../core/services/finance.service';
import { InboxService } from '../../../core/services/inbox.service';
import { ToastService } from '../../../core/services/toast.service';
import { PendingMovement } from '../../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../../shared/pipes/currency-format.pipe';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { formatCurrency } from '../../../shared/utils/format.utils';

/** Cargos recibidos por el atajo del iPhone, pendientes de elegir categoría. */
@Component({
  selector: 'app-pending-inbox',
  imports: [LucideDynamicIcon, CurrencyFormatPipe, DateFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="tarjeta" aria-labelledby="bandeja-titulo">
        <header class="cabecera">
          <span class="cabecera__icono"><svg lucideIcon="inbox" [size]="15" aria-hidden="true"></svg></span>
          <div class="cabecera__texto">
            <h2 id="bandeja-titulo">Cargos por confirmar <span class="contador pc-num">{{ items().length }}</span></h2>
            <p>Llegaron desde tu iPhone. Elige la categoría y confírmalos.</p>
          </div>
          @if (readyCount() > 1) {
            <button type="button" class="pc-boton boton-elevado" (click)="confirmReady()">
              <svg lucideIcon="check" [size]="14" [strokeWidth]="2.5" aria-hidden="true"></svg> Confirmar {{ readyCount() }} con categoría
            </button>
          }
        </header>

        <ul>
          @for (item of items(); track item.id) {
            <li class="cargo mov-entrar">
              <div class="cargo__datos">
                <strong class="cargo__comercio">{{ item.merchant || 'Sin comercio' }}</strong>
                <span class="cargo__detalle pc-num">
                  {{ item.date | dateFormat: 'short' }}@if (item.card) { · {{ item.card }} }
                </span>
              </div>
              <strong class="cargo__monto amount" [class.text-expense]="item.type === 'egreso'" [class.text-income]="item.type === 'ingreso'">
                {{ item.type === 'ingreso' ? '+' : '−' }}{{ item.amount | currencyFormat }}
              </strong>
              <div class="cargo__acciones">
                <label class="sr-only" [for]="'cat-' + item.id">Categoría</label>
                <select
                  class="input"
                  [id]="'cat-' + item.id"
                  [value]="categoryOf(item)"
                  (change)="setCategory(item.id, $any($event.target).value)"
                >
                  <option value="">Elige categoría…</option>
                  @for (c of finance.categories()[item.type]; track c) {
                    <option [value]="c" [selected]="c === categoryOf(item)">{{ c }}</option>
                  }
                </select>
                @if (item.merchant) {
                  <label class="recordar">
                    <input type="checkbox" [checked]="rememberOf(item.id)" (change)="setRemember(item.id, $any($event.target).checked)" />
                    Recordar para este comercio
                  </label>
                }
                <div class="botones">
                  <button type="button" class="icon-btn icon-btn--danger" (click)="discard(item)" title="Descartar" aria-label="Descartar cargo">
                    <svg lucideIcon="trash-2" [size]="15" aria-hidden="true"></svg>
                  </button>
                  <button type="button" class="pc-boton boton-elevado" [disabled]="!categoryOf(item)" (click)="confirm(item)">
                    <svg lucideIcon="check" [size]="14" [strokeWidth]="2.5" aria-hidden="true"></svg> Confirmar
                  </button>
                </div>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    /* Sin caja propia: si no hay cargos no deja hueco en la columna de la página */
    :host { display: contents; }
    .tarjeta {
      background: var(--surface-elevada);
      border: 1px solid color-mix(in oklab, var(--warning) 35%, transparent);
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
    }
    .cabecera {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 14px 16px; border-bottom: 1px solid var(--border-suave);
    }
    @media (min-width: 640px) { .cabecera { padding: 16px 24px; } }
    .cabecera__icono {
      display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0;
      border-radius: var(--radius-full); color: var(--warning-texto);
      background: color-mix(in oklab, var(--warning) 15%, transparent);
    }
    .cabecera__texto { flex: 1; min-width: 200px; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.025em; display: flex; align-items: center; gap: 8px; }
    .cabecera p { margin: 2px 0 0; font-size: 12px; color: var(--texto-tenue); }
    .contador {
      display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px;
      border-radius: var(--radius-full); font-size: 11px; color: var(--primary-foreground); background: var(--primary);
    }
    ul { list-style: none; margin: 0; padding: 0; }
    .cargo {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'datos monto' 'acciones acciones';
      gap: 10px 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--divisor-tenue);
    }
    .cargo:last-child { border-bottom: 0; }
    @media (min-width: 640px) { .cargo { padding: 14px 24px; } }
    @media (min-width: 1024px) {
      .cargo { grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1.4fr); grid-template-areas: 'datos monto acciones'; align-items: center; }
    }
    .cargo__datos { grid-area: datos; display: flex; flex-direction: column; min-width: 0; }
    .cargo__comercio { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cargo__detalle { font-size: 11px; color: var(--texto-tenue); }
    .cargo__monto { grid-area: monto; text-align: right; font-size: 14px; }
    .cargo__acciones { grid-area: acciones; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .cargo__acciones select { flex: 1 1 160px; width: auto; }
    .recordar { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--texto-medio); cursor: pointer; }
    .recordar input { accent-color: var(--primary); }
    .botones { display: flex; gap: 4px; margin-left: auto; }
  `,
})
export class PendingInboxComponent {
  protected readonly finance = inject(FinanceService);
  private readonly inbox = inject(InboxService);
  private readonly toast = inject(ToastService);

  protected readonly items = this.inbox.pending;
  /** Elecciones del usuario por cargo; si no hay, se usa la sugerencia de las reglas. */
  private readonly chosen = signal<Record<string, string>>({});
  private readonly remember = signal<Record<string, boolean>>({});

  protected readonly readyCount = computed(() => this.items().filter((i) => this.categoryOf(i)).length);

  protected categoryOf(item: PendingMovement): string {
    return this.chosen()[item.id] ?? this.inbox.suggest(item) ?? '';
  }

  protected rememberOf(id: string): boolean {
    return this.remember()[id] ?? true;
  }

  protected setCategory(id: string, category: string): void {
    this.chosen.update((c) => ({ ...c, [id]: category }));
  }

  protected setRemember(id: string, value: boolean): void {
    this.remember.update((r) => ({ ...r, [id]: value }));
  }

  protected confirm(item: PendingMovement): void {
    const category = this.categoryOf(item);
    if (!category) return;
    if (this.inbox.confirm(item.id, category, this.rememberOf(item.id))) {
      this.toast.success(`${formatCurrency(item.amount)} registrado en ${category}`);
    } else {
      this.toast.error('No se pudo registrar el cargo.');
    }
  }

  protected confirmReady(): void {
    let done = 0;
    for (const item of this.items()) {
      const category = this.categoryOf(item);
      if (category && this.inbox.confirm(item.id, category, this.rememberOf(item.id))) done++;
    }
    this.toast.success(`${done} ${done === 1 ? 'cargo registrado' : 'cargos registrados'}`);
  }

  protected discard(item: PendingMovement): void {
    const removed = this.inbox.discard(item.id);
    if (removed) this.toast.success('Cargo descartado', { label: 'Deshacer', run: () => this.inbox.restore(removed) });
  }
}
