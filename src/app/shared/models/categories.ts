import { MovementType } from './finance.models';

export const CATEGORY_MAX_LENGTH = 20;
export const DESCRIPTION_MAX_LENGTH = 120;
export const RETENTION_YEARS = 2;

export const DEFAULT_CATEGORIES: Readonly<Record<MovementType, readonly string[]>> = {
  ingreso: ['Salario', 'Freelance/Honorarios', 'Inversiones', 'Otros'],
  egreso: [
    'Vivienda',
    'Transporte',
    'Alimentación',
    'Servicios',
    'Seguros',
    'Entretenimiento',
    'Ropa/Personal',
    'Salud',
    'Deudas',
    'Ahorros',
    'Miscelánea',
  ],
};

/** Categorías de egreso que se consideran necesidades básicas (no se sugiere recortarlas primero). */
export const ESSENTIAL_EXPENSE_CATEGORIES: readonly string[] = [
  'Vivienda',
  'Transporte',
  'Alimentación',
  'Servicios',
  'Seguros',
  'Salud',
  'Deudas',
  'Ahorros',
];

export const MOVEMENT_TYPE_LABEL: Readonly<Record<MovementType, string>> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
};

/**
 * Series de gráficas (tokens `--serie-*` de styles.scss, con valor propio en claro y oscuro).
 * Empiezan por las familias primario, secundario y advertencia de la paleta Finanzas; el orden
 * está validado para daltonismo en pares adyacentes. Se asignan por ranking histórico de cada
 * categoría, así el color sigue a la categoría y no cambia al mover el período.
 * A partir de la 8ª categoría se agrupan en "Otras".
 */
export const CATEGORICAL_PALETTE: readonly string[] = Array.from({ length: 7 }, (_, i) => `var(--serie-${i + 1})`);
export const OTHER_CATEGORY_COLOR = 'var(--otras-relleno)';
export const OTHER_CATEGORY_LABEL = 'Otras';
