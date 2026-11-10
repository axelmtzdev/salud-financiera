import { Injectable, computed, inject } from '@angular/core';
import { PlannedExpense } from '../../shared/models/finance.models';
import { todayIso } from '../../shared/utils/date.utils';
import { round2 } from '../../shared/utils/format.utils';
import { uuid } from '../../shared/utils/id.utils';
import { Projection, projectBalance } from '../../shared/utils/projection.utils';
import { collapseSpaces } from '../../shared/utils/text.utils';
import { GoalsService } from './goals.service';
import { StorageService } from './storage.service';

export type PlannedInput = Pick<PlannedExpense, 'description' | 'category' | 'amount' | 'date'>;

/** Gastos planeados y proyección del saldo libre a futuro. */
@Injectable({ providedIn: 'root' })
export class ProjectionService {
  private readonly storage = inject(StorageService);
  private readonly goals = inject(GoalsService);

  /** Los que aún no pasan, del más próximo al más lejano. */
  readonly upcomingPlanned = computed(() => {
    const today = todayIso();
    return this.storage
      .state()
      .planned.filter((p) => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  /** Sin saldo inicial no hay de dónde partir: se proyecta desde 0 (solo el flujo). */
  readonly hasStart = computed(() => this.goals.free() !== null);

  project(horizon: number): Projection {
    const { movements, recurring, planned, goals, contributions } = this.storage.state();
    return projectBalance({
      today: todayIso(),
      start: this.goals.free()?.total ?? 0,
      horizon,
      movements,
      recurring,
      planned,
      goals,
      contributions,
    });
  }

  addPlanned(input: PlannedInput): PlannedExpense | null {
    const item: PlannedExpense = {
      description: collapseSpaces(input.description),
      category: input.category,
      amount: round2(input.amount),
      date: input.date,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    return this.storage.update((data) => ({ ...data, planned: [...data.planned, item] })) ? item : null;
  }

  removePlanned(id: string): PlannedExpense | null {
    const existing = this.storage.state().planned.find((p) => p.id === id);
    if (!existing) return null;
    const ok = this.storage.update((data) => ({ ...data, planned: data.planned.filter((p) => p.id !== id) }));
    return ok ? existing : null;
  }

  restorePlanned(item: PlannedExpense): boolean {
    if (this.storage.state().planned.some((p) => p.id === item.id)) return false;
    return this.storage.update((data) => ({ ...data, planned: [...data.planned, item] }));
  }
}
