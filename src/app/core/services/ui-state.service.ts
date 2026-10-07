import { Injectable, signal } from '@angular/core';
import { DateRange, MovementType } from '../../shared/models/finance.models';
import { PeriodPreset } from '../../shared/utils/period.utils';

export interface MovementFilters {
  type: 'all' | MovementType;
  category: string;
  from: string;
  to: string;
  search: string;
}

export const EMPTY_FILTERS: MovementFilters = { type: 'all', category: 'all', from: '', to: '', search: '' };

/** Estado de UI que conviene conservar al navegar entre secciones (filtros y período de análisis). */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  readonly filters = signal<MovementFilters>({ ...EMPTY_FILTERS });
  readonly period = signal<PeriodPreset>('this-month');
  readonly customRange = signal<DateRange | null>(null);
}
