import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { FinanceService } from '../../core/services/finance.service';
import { EMPTY_FILTERS, UiStateService } from '../../core/services/ui-state.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { DateRange } from '../../shared/models/finance.models';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { lastMonthKeys, monthKey, monthLabel, todayIso } from '../../shared/utils/date.utils';
import { PERIOD_OPTIONS, PeriodPreset, resolvePeriod } from '../../shared/utils/period.utils';
import {
  COUNT_OPTIONS,
  MONTHS_OPTIONS,
  MovementsLink,
  QUICK_QUESTIONS,
  QuestionId,
  answerQuestion,
  capitalize,
} from '../../shared/utils/quick-questions';

/** Preguntas sugeridas con respuestas calculadas al momento (sin IA). */
@Component({
  selector: 'app-quick-questions',
  imports: [CardComponent, DateFormatPipe, LucideDynamicIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-questions.component.html',
  styleUrl: './quick-questions.component.scss',
})
export class QuickQuestionsComponent {
  private readonly finance = inject(FinanceService);
  private readonly ui = inject(UiStateService);
  private readonly router = inject(Router);
  private readonly today = todayIso();

  protected readonly questions = QUICK_QUESTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly countOptions = COUNT_OPTIONS;
  protected readonly monthsOptions = MONTHS_OPTIONS;

  protected readonly hasMovements = computed(() => this.finance.movements().length > 0);

  protected readonly selectedId = signal<QuestionId>('summary');
  protected readonly selected = computed(() => this.questions.find((q) => q.id === this.selectedId())!);

  protected readonly preset = signal<PeriodPreset>('this-month');
  private readonly customRange = signal<DateRange | null>(null);
  protected readonly range = computed(() => resolvePeriod(this.preset(), this.customRange(), this.today));

  /** Por defecto, la categoría de egreso con más gasto histórico. */
  protected readonly categoryOptions = computed(() => {
    const ranked = [...this.finance.categoryColors().egreso.keys()];
    const rest = this.finance.filterableCategories().egreso.filter((c) => !ranked.includes(c));
    return [...ranked, ...rest];
  });
  private readonly chosenCategory = signal('');
  protected readonly category = computed(() => this.chosenCategory() || this.categoryOptions()[0] || '');

  protected readonly monthOptions = lastMonthKeys(monthKey(this.today), 12)
    .reverse()
    .map((key) => ({ key, label: capitalize(monthLabel(key, true)) }));
  protected readonly month = signal(monthKey(this.today));
  protected readonly count = signal(COUNT_OPTIONS[0]);
  protected readonly text = signal('');
  protected readonly months = signal(6);

  protected readonly answer = computed(() =>
    answerQuestion(
      this.selectedId(),
      {
        range: this.range(),
        category: this.category(),
        month: this.month(),
        count: this.count(),
        text: this.text(),
        months: this.months(),
      },
      this.finance.movements(),
      this.today,
    ),
  );

  protected select(id: QuestionId, event: Event): void {
    this.selectedId.set(id);
    // En teléfono las preguntas son un carrusel: la elegida queda completa a la vista. Se alinea al
    // inicio porque es su punto de anclaje (scroll-snap); con 'nearest' el snap la regresaba a su lugar
    (event.currentTarget as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
  }

  protected setPreset(preset: PeriodPreset): void {
    // Arranca el rango personalizado con el rango actualmente visible
    if (preset === 'custom' && !this.customRange()) this.customRange.set(this.range());
    this.preset.set(preset);
  }

  protected setCustom(edge: 'from' | 'to', value: string): void {
    if (!value) return;
    this.customRange.set({ ...this.range(), [edge]: value });
  }

  protected setCategory(value: string): void {
    this.chosenCategory.set(value);
  }

  /** Abre Movimientos con los filtros que corresponden a la respuesta. */
  protected openMovements(link: MovementsLink): void {
    this.ui.filters.set({
      ...EMPTY_FILTERS,
      type: link.type ?? 'all',
      category: link.category ?? 'all',
      from: link.from ?? '',
      to: link.to ?? '',
      search: link.search ?? '',
    });
    this.router.navigate(['/movimientos']);
  }
}
