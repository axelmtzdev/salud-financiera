import { Injectable, computed, inject } from '@angular/core';
import { OpeningBalance, Transfer } from '../../shared/models/finance.models';
import { accountBalances } from '../../shared/utils/accounts.utils';
import { todayIso } from '../../shared/utils/date.utils';
import { round2 } from '../../shared/utils/format.utils';
import { uuid } from '../../shared/utils/id.utils';
import { collapseSpaces } from '../../shared/utils/text.utils';
import { StorageService } from './storage.service';

export type TransferInput = Omit<Transfer, 'id' | 'createdAt'>;

/** Saldo inicial, traspasos y saldo disponible de efectivo y tarjeta/transferencia. */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly storage = inject(StorageService);

  readonly opening = computed(() => this.storage.state().opening);

  /** Más recientes primero. */
  readonly transfers = computed(() =>
    [...this.storage.state().transfers].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );

  /** Saldo al día de hoy (los movimientos con fecha futura aún no cuentan). null sin saldo inicial. */
  readonly balances = computed(() => {
    const { opening, movements, transfers } = this.storage.state();
    return accountBalances(opening, movements, transfers, todayIso());
  });

  /** Movimientos anteriores al saldo inicial: no cuentan en el saldo. */
  readonly movementsBeforeOpening = computed(() => {
    const opening = this.opening();
    return opening ? this.storage.state().movements.filter((m) => m.date < opening.date).length : 0;
  });

  setOpening(opening: OpeningBalance): boolean {
    const clean: OpeningBalance = { date: opening.date, efectivo: round2(opening.efectivo), banco: round2(opening.banco) };
    return this.storage.update((data) => ({ ...data, opening: clean }));
  }

  addTransfer(input: TransferInput): Transfer | null {
    const transfer: Transfer = {
      ...input,
      amount: round2(input.amount),
      description: collapseSpaces(input.description),
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    const ok = this.storage.update((data) => ({ ...data, transfers: [...data.transfers, transfer] }));
    return ok ? transfer : null;
  }

  removeTransfer(id: string): Transfer | null {
    const existing = this.storage.state().transfers.find((t) => t.id === id);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, transfers: data.transfers.filter((t) => t.id !== id) }));
    return ok ? existing : null;
  }

  /** Reinserta un traspaso eliminado (deshacer). */
  restoreTransfer(transfer: Transfer): boolean {
    if (this.storage.state().transfers.some((t) => t.id === transfer.id)) return false;
    return this.storage.update((data) => ({ ...data, transfers: [...data.transfers, transfer] }));
  }
}
