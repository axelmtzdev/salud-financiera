import { Injectable, computed, inject } from '@angular/core';
import { MerchantRule, Movement, MovementType, PendingMovement } from '../../shared/models/finance.models';
import { MAX_PENDING } from '../../shared/utils/data-integrity.utils';
import { uuid } from '../../shared/utils/id.utils';
import { QuickAddInput, isDuplicate, matchRule } from '../../shared/utils/quick-add.utils';
import { collapseSpaces, normalizeText } from '../../shared/utils/text.utils';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

export type ReceiveResult = { status: 'added'; pending: PendingMovement } | { status: 'duplicate' } | { status: 'error' };

/** Bandeja de cargos recibidos por registro rápido y reglas de categoría por comercio. */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceService);

  /** Más recientes primero. */
  readonly pending = computed(() =>
    [...this.storage.state().pending].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
  );
  readonly count = computed(() => this.storage.state().pending.length);
  readonly rules = computed(() =>
    [...this.storage.state().rules].sort((a, b) => a.label.localeCompare(b.label, 'es')),
  );

  receive(input: QuickAddInput): ReceiveResult {
    if (isDuplicate(this.storage.state().pending, input)) return { status: 'duplicate' };
    const pending: PendingMovement = { ...input, id: uuid(), receivedAt: new Date().toISOString() };
    const ok = this.storage.update((data) => ({
      ...data,
      pending: [...data.pending, pending].slice(-MAX_PENDING),
    }));
    return ok ? { status: 'added', pending } : { status: 'error' };
  }

  /** Categoría sugerida por las reglas, solo si sigue existiendo. */
  suggest(item: PendingMovement): string | null {
    const rule = matchRule(this.storage.state().rules, item.merchant, item.type);
    return rule && this.finance.categories()[item.type].includes(rule.category) ? rule.category : null;
  }

  /** Convierte el cargo en movimiento y, si se pide, recuerda la categoría para ese comercio. */
  confirm(id: string, category: string, remember: boolean): Movement | null {
    const item = this.storage.state().pending.find((p) => p.id === id);
    if (!item) return null;
    const description = [item.merchant, item.card].filter(Boolean).join(' · ');
    const movement = this.finance.add({ type: item.type, amount: item.amount, category, date: item.date, description });
    if (!movement) return null;
    this.storage.update((data) => ({
      ...data,
      pending: data.pending.filter((p) => p.id !== id),
      rules: remember && item.merchant ? this.withRule(data.rules, item.merchant, item.type, category) : data.rules,
    }));
    return movement;
  }

  discard(id: string): PendingMovement | null {
    const item = this.storage.state().pending.find((p) => p.id === id);
    if (!item) return null;
    const ok = this.storage.update((data) => ({ ...data, pending: data.pending.filter((p) => p.id !== id) }));
    return ok ? item : null;
  }

  /** Reinserta un cargo descartado (deshacer). */
  restore(item: PendingMovement): boolean {
    if (this.storage.state().pending.some((p) => p.id === item.id)) return false;
    return this.storage.update((data) => ({ ...data, pending: [...data.pending, item] }));
  }

  setRule(merchant: string, type: MovementType, category: string): boolean {
    if (!normalizeText(merchant) || !category) return false;
    return this.storage.update((data) => ({ ...data, rules: this.withRule(data.rules, merchant, type, category) }));
  }

  removeRule(rule: MerchantRule): boolean {
    return this.storage.update((data) => ({
      ...data,
      rules: data.rules.filter((r) => !(r.pattern === rule.pattern && r.type === rule.type)),
    }));
  }

  private withRule(rules: MerchantRule[], merchant: string, type: MovementType, category: string): MerchantRule[] {
    const pattern = normalizeText(merchant);
    const rest = rules.filter((r) => !(r.pattern === pattern && r.type === type));
    return [...rest, { pattern, label: collapseSpaces(merchant), type, category }];
  }
}
