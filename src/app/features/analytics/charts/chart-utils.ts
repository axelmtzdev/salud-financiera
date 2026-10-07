import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

/** Ticks "redondos" (1, 2, 2.5, 5 × 10^n) que cubren [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) max = min + 1;
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Ancho del host en px, actualizado con ResizeObserver (las gráficas dibujan a tamaño real, sin escalar texto). */
export function hostWidth(fallback = 600): Signal<number> {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const width = signal(fallback);
  const observer = new ResizeObserver(([entry]) => {
    const next = Math.round(entry.contentRect.width);
    if (next > 0) width.set(next);
  });
  afterNextRender(() => observer.observe(element));
  inject(DestroyRef).onDestroy(() => observer.disconnect());
  return width.asReadonly();
}

/** Barra con esquinas superiores (o inferiores, si es negativa) redondeadas y base recta en el eje. */
export function roundedBar(x: number, base: number, width: number, top: number, radius = 4): string {
  const height = Math.abs(base - top);
  if (height < 0.5) return '';
  const r = Math.min(radius, width / 2, height);
  if (top <= base) {
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
  }
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top - r}V${base}Z`;
}
