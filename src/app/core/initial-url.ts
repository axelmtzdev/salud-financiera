/**
 * El fragmento (#…) tal como llegó al abrir la app. El router lo reescribe decodificado antes de crear
 * los componentes, y un "%26" (&) dentro del comercio partiría los parámetros del registro rápido.
 * main.ts importa este archivo primero para capturarlo antes del arranque.
 */
const initial = { path: window.location.pathname, hash: window.location.hash };

/** Devuelve el fragmento original una sola vez, si la app se abrió directamente en `path`. */
export function takeInitialHash(path: string): string {
  if (initial.path !== path || !initial.hash) return '';
  const hash = initial.hash;
  initial.hash = '';
  return hash;
}
