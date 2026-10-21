/** Estructura del menú: una sola fuente para el menú lateral (escritorio) y la barra inferior (teléfono). */

export interface NavLink {
  path: string;
  label: string;
  /** Etiqueta en la barra inferior del teléfono, si debe ser más corta */
  tabLabel?: string;
  /** Nombre de ícono Lucide */
  icon: string;
  exact: boolean;
  /** Muestra el contador de cargos por confirmar */
  pendingBadge?: boolean;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

/** La acción principal: va aparte de las secciones (botón central en el teléfono, botón arriba del menú en escritorio). */
export const PRIMARY_ACTION = { path: '/movimientos/nuevo', label: 'Registrar', icon: 'plus' } as const;

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Principal',
    links: [
      { path: '/movimientos', label: 'Movimientos', tabLabel: 'Inicio', icon: 'list', exact: true, pendingBadge: true },
      { path: '/presupuestos', label: 'Presupuestos', tabLabel: 'Presupuesto', icon: 'target', exact: false },
      { path: '/analisis', label: 'Análisis', icon: 'chart-column', exact: false },
    ],
  },
  {
    // Aquí entrarán también tarjetas y MSI, y metas
    label: 'Planear',
    links: [{ path: '/pagos', label: 'Pagos recurrentes', icon: 'repeat', exact: false }],
  },
  {
    label: 'Herramientas',
    links: [{ path: '/preguntas', label: 'Preguntas', icon: 'message-circle-question-mark', exact: false }],
  },
  {
    label: 'Cuenta',
    links: [{ path: '/ajustes', label: 'Ajustes', icon: 'settings', exact: false }],
  },
];

/**
 * Secciones fijas en la barra inferior del teléfono (máximo 4 + el botón central; las guías piden
 * no pasar de 5 lugares). El resto vive en la hoja "Más".
 */
export const TAB_PATHS: readonly string[] = ['/movimientos', '/presupuestos', '/analisis'];

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

export const TAB_LINKS: readonly NavLink[] = TAB_PATHS.map((path) => ALL_LINKS.find((l) => l.path === path)!);

/** Grupos de la hoja "Más": lo que no está en la barra inferior. */
export const MORE_GROUPS: readonly NavGroup[] = NAV_GROUPS.map((g) => ({
  label: g.label,
  links: g.links.filter((l) => !TAB_PATHS.includes(l.path)),
})).filter((g) => g.links.length > 0);

/** ¿La URL actual pertenece a una sección de la hoja "Más"? (para marcar "Más" como activo) */
export function isInMore(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return MORE_GROUPS.some((g) => g.links.some((l) => path === l.path || path.startsWith(`${l.path}/`)));
}
