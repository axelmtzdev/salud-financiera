import { Injectable, computed, inject } from '@angular/core';
import { todayIso } from '../../shared/utils/date.utils';
import { Projection, projectBalance } from '../../shared/utils/projection.utils';
import { GoalsService } from './goals.service';
import { StorageService } from './storage.service';

/** Proyección del saldo libre a futuro. Los pagos (incluidos los únicos) vienen de la sección Pagos. */
@Injectable({ providedIn: 'root' })
export class ProjectionService {
  private readonly storage = inject(StorageService);
  private readonly goals = inject(GoalsService);

  /** Sin saldo inicial no hay de dónde partir: se proyecta desde 0 (solo el flujo). */
  readonly hasStart = computed(() => this.goals.free() !== null);

  project(horizon: number): Projection {
    const { movements, recurring, goals, contributions } = this.storage.state();
    return projectBalance({
      today: todayIso(),
      start: this.goals.free()?.total ?? 0,
      horizon,
      movements,
      recurring,
      goals,
      contributions,
    });
  }
}
