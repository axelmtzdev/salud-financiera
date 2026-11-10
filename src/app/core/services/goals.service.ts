import { Injectable, computed, inject } from '@angular/core';
import { AccountKind, Goal, GoalContribution } from '../../shared/models/finance.models';
import { todayIso } from '../../shared/utils/date.utils';
import { round2 } from '../../shared/utils/format.utils';
import { goalProgress, reservedByAccount } from '../../shared/utils/goals.utils';
import { uuid } from '../../shared/utils/id.utils';
import { collapseSpaces } from '../../shared/utils/text.utils';
import { AccountsService } from './accounts.service';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

export type GoalInput = Pick<Goal, 'name' | 'target' | 'targetDate'>;

/** Lo necesario para deshacer la eliminación de una meta. */
export interface RemovedGoal {
  goal: Goal;
  contributions: GoalContribution[];
}

export interface GoalPurchase {
  category: string;
  account: AccountKind;
  amount: number;
}

/** Metas con abonos que apartan dinero de las cuentas. */
@Injectable({ providedIn: 'root' })
export class GoalsService {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceService);
  private readonly accounts = inject(AccountsService);

  /** Activas primero (las más próximas a su fecha arriba), luego las completadas. */
  readonly progress = computed(() => {
    const { goals, contributions } = this.storage.state();
    const today = todayIso();
    return goals
      .map((g) => goalProgress(g, contributions, today))
      .sort(
        (a, b) =>
          Number(!!a.goal.completedAt) - Number(!!b.goal.completedAt) ||
          (a.goal.completedAt && b.goal.completedAt ? b.goal.completedAt.localeCompare(a.goal.completedAt) : 0) ||
          (a.goal.targetDate ?? '9999').localeCompare(b.goal.targetDate ?? '9999') ||
          a.goal.createdAt.localeCompare(b.goal.createdAt),
      );
  });
  readonly active = computed(() => this.progress().filter((p) => !p.goal.completedAt));
  readonly completed = computed(() => this.progress().filter((p) => !!p.goal.completedAt));

  /** Apartado para metas activas, por cuenta. */
  readonly reserved = computed(() => {
    const { goals, contributions } = this.storage.state();
    return reservedByAccount(goals, contributions);
  });
  readonly reservedTotal = computed(() => round2(this.reserved().efectivo + this.reserved().banco));

  /** Lo que queda libre en cada cuenta (saldo − apartado). null sin saldo inicial. */
  readonly free = computed(() => {
    const balances = this.accounts.balances();
    if (!balances) return null;
    const reserved = this.reserved();
    return {
      efectivo: round2(balances.efectivo.balance - reserved.efectivo),
      banco: round2(balances.banco.balance - reserved.banco),
      total: round2(balances.total - this.reservedTotal()),
    };
  });

  contributionsOf(goalId: string): GoalContribution[] {
    return this.storage
      .state()
      .contributions.filter((c) => c.goalId === goalId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  addGoal(input: GoalInput): Goal | null {
    const goal: Goal = { ...this.clean(input), id: uuid(), createdAt: new Date().toISOString(), completedAt: null };
    return this.storage.update((data) => ({ ...data, goals: [...data.goals, goal] })) ? goal : null;
  }

  updateGoal(id: string, input: GoalInput): boolean {
    return this.storage.update((data) => ({
      ...data,
      goals: data.goals.map((g) => (g.id === id ? { ...g, ...this.clean(input) } : g)),
    }));
  }

  /** Elimina la meta con sus abonos: lo apartado vuelve a estar libre. */
  removeGoal(id: string): RemovedGoal | null {
    const { goals, contributions } = this.storage.state();
    const goal = goals.find((g) => g.id === id);
    if (!goal) return null;
    const removed = { goal, contributions: contributions.filter((c) => c.goalId === id) };
    const ok = this.storage.update((data) => ({
      ...data,
      goals: data.goals.filter((g) => g.id !== id),
      contributions: data.contributions.filter((c) => c.goalId !== id),
    }));
    return ok ? removed : null;
  }

  restoreGoal({ goal, contributions }: RemovedGoal): boolean {
    if (this.storage.state().goals.some((g) => g.id === goal.id)) return false;
    return this.storage.update((data) => ({
      ...data,
      goals: [...data.goals, goal],
      contributions: [...data.contributions, ...contributions],
    }));
  }

  /** Abono (monto positivo) o retiro (negativo) desde una cuenta. */
  contribute(goalId: string, account: AccountKind, amount: number, date: string): GoalContribution | null {
    const contribution: GoalContribution = {
      id: uuid(),
      goalId,
      account,
      amount: round2(amount),
      date,
      createdAt: new Date().toISOString(),
    };
    const ok = this.storage.update((data) => ({ ...data, contributions: [...data.contributions, contribution] }));
    return ok ? contribution : null;
  }

  removeContribution(id: string): GoalContribution | null {
    const existing = this.storage.state().contributions.find((c) => c.id === id);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, contributions: data.contributions.filter((c) => c.id !== id) }));
    return ok ? existing : null;
  }

  restoreContribution(contribution: GoalContribution): boolean {
    if (this.storage.state().contributions.some((c) => c.id === contribution.id)) return false;
    return this.storage.update((data) => ({ ...data, contributions: [...data.contributions, contribution] }));
  }

  /**
   * Marca la meta como cumplida: lo apartado se libera. Con `purchase` registra además el egreso
   * de la compra, así el dinero sale de la cuenta.
   */
  complete(goalId: string, purchase: GoalPurchase | null): boolean {
    const goal = this.storage.state().goals.find((g) => g.id === goalId);
    if (!goal) return false;
    if (purchase) {
      const movement = this.finance.add({
        type: 'egreso',
        category: purchase.category,
        amount: purchase.amount,
        date: todayIso(),
        description: goal.name,
        account: purchase.account,
      });
      if (!movement) return false;
    }
    const completedAt = new Date().toISOString();
    return this.storage.update((data) => ({
      ...data,
      goals: data.goals.map((g) => (g.id === goalId ? { ...g, completedAt } : g)),
    }));
  }

  reopen(goalId: string): boolean {
    return this.storage.update((data) => ({
      ...data,
      goals: data.goals.map((g) => (g.id === goalId ? { ...g, completedAt: null } : g)),
    }));
  }

  private clean(input: GoalInput): GoalInput {
    return { name: collapseSpaces(input.name), target: round2(input.target), targetDate: input.targetDate || null };
  }
}
