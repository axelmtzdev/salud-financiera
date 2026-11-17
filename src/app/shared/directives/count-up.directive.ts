import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { formatCurrency, formatPercent } from '../utils/format.utils';

const DURATION_MS = 700;

/**
 * Escribe un número formateado y, cuando cambia, lo anima desde el valor anterior (la primera vez
 * desde 0). Con "reducir movimiento" el número cambia sin animación.
 *
 * `<strong [appCountUp]="saldo"></strong>` · `<span [appCountUp]="tasa" countFormat="percent"></span>`
 */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective {
  readonly appCountUp = input.required<number>();
  readonly countFormat = input<'currency' | 'percent'>('currency');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      const format = this.countFormat();
      untracked(() => this.animate(target, format));
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private animate(target: number, format: 'currency' | 'percent'): void {
    cancelAnimationFrame(this.frame);
    const from = this.current;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === target || !Number.isFinite(target)) {
      this.render(target, format);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      this.render(t === 1 ? target : from + (target - from) * eased, format);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number, format: 'currency' | 'percent'): void {
    this.current = value;
    this.el.nativeElement.textContent = format === 'percent' ? formatPercent(value) : formatCurrency(value);
  }
}
