export type MovementType = 'ingreso' | 'egreso';

export const MOVEMENT_TYPES: readonly MovementType[] = ['ingreso', 'egreso'];

export interface Movement {
  id: string;
  type: MovementType;
  category: string;
  amount: number;
  /** Fecha local en formato YYYY-MM-DD */
  date: string;
  description: string;
  /** ISO timestamp */
  createdAt: string;
}

export type MovementInput = Omit<Movement, 'id' | 'createdAt'>;

export interface UserProfile {
  name: string;
  secretQuestion: string;
  /** Hash SHA-256 (con salt) de la respuesta normalizada; nunca se guarda en texto plano. */
  secretAnswer: string;
  salt: string;
}

export type CustomCategories = Record<MovementType, string[]>;

export interface AppData {
  version: 1;
  user: UserProfile | null;
  movements: Movement[];
  categories: CustomCategories;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  /** net / income; null cuando no hay ingresos */
  savingsRate: number | null;
  count: number;
}

export interface CategoryStat {
  category: string;
  total: number;
  /** Porcentaje (0-100) respecto al total del tipo */
  percent: number;
  count: number;
}

export interface MonthlyPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export type InsightLevel = 'danger' | 'warning' | 'info' | 'success';

export interface Insight {
  id: string;
  level: InsightLevel;
  /** Nombre de ícono Lucide */
  icon: string;
  title: string;
  message: string;
}

export function createEmptyData(): AppData {
  return { version: 1, user: null, movements: [], categories: { ingreso: [], egreso: [] } };
}
