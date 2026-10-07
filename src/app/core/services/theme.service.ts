import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'system' | 'dark';

export const THEME_KEY = 'salud-financiera.tema';

/** Tema claro / oscuro / del sistema. Aplica la clase `.dark` en `<html>` y recuerda la elección. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.read());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    this.media.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media.removeEventListener('change', onChange));

    effect(() => {
      const pref = this.preference();
      const dark = pref === 'dark' || (pref === 'system' && this.systemDark());
      document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem(THEME_KEY, pref);
      } catch {
        /* almacenamiento no disponible */
      }
    });
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
  }

  private read(): ThemePreference {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
