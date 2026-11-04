const STASH_KEY = 'salud-financiera.registro-rapido';
/** Un cargo guardado sin sesión se registra si el usuario inicia sesión dentro de este tiempo. */
const STASH_TTL_MS = 30 * 60 * 1000;

/** Guarda el fragmento de un cargo que llegó sin sesión iniciada. */
export function stashQuickAdd(fragment: string): void {
  try {
    localStorage.setItem(STASH_KEY, JSON.stringify({ fragment, at: Date.now() }));
  } catch {
    /* sin almacenamiento: el cargo se pierde */
  }
}

/** Devuelve (y borra) el cargo pendiente, si sigue vigente. */
export function takeStashedQuickAdd(): string | null {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    localStorage.removeItem(STASH_KEY);
    const stash = JSON.parse(raw ?? 'null');
    return stash && typeof stash.fragment === 'string' && Date.now() - stash.at < STASH_TTL_MS ? stash.fragment : null;
  } catch {
    return null;
  }
}

/** Adónde ir después de iniciar sesión: al registro rápido si hay un cargo esperando (ahí se toma). */
export function afterLoginTarget(): string {
  try {
    return localStorage.getItem(STASH_KEY) ? '/registro-rapido' : '/';
  } catch {
    return '/';
  }
}
