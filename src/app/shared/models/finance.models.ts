export type MovementType = 'ingreso' | 'egreso';

export const MOVEMENT_TYPES: readonly MovementType[] = ['ingreso', 'egreso'];

/** De dónde sale o a dónde entra el dinero. Las tarjetas de crédito no son una cuenta: tendrán su propio módulo. */
export type AccountKind = 'efectivo' | 'banco';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['efectivo', 'banco'];

export interface Movement {
  id: string;
  type: MovementType;
  category: string;
  amount: number;
  /** Fecha local en formato YYYY-MM-DD */
  date: string;
  description: string;
  /** Forma de pago: efectivo o tarjeta de débito/transferencia */
  account: AccountKind;
  /** ISO timestamp */
  createdAt: string;
}

/** Dinero que pasa de una cuenta a otra (retiro de cajero, depósito de efectivo). No es ingreso ni egreso. */
export interface Transfer {
  id: string;
  from: AccountKind;
  to: AccountKind;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  createdAt: string;
}

/** Cuánto había en cada cuenta al cierre del día anterior a `date`; desde ese día cuentan los movimientos. */
export interface OpeningBalance {
  /** YYYY-MM-DD */
  date: string;
  efectivo: number;
  banco: number;
}

/** Algo para lo que se aparta dinero (ej. "Comprar iPhone"). */
export interface Goal {
  id: string;
  name: string;
  /** Precio o monto a reunir */
  target: number;
  /** YYYY-MM-DD opcional: con ella se sugiere cuánto apartar al mes */
  targetDate: string | null;
  createdAt: string;
  /** ISO timestamp; al completarla lo apartado deja de estar reservado */
  completedAt: string | null;
}

/** Dinero que se aparta para una meta (positivo) o se regresa al disponible (negativo). Sigue en su cuenta. */
export interface GoalContribution {
  id: string;
  goalId: string;
  account: AccountKind;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
}

/** Gasto futuro conocido, para la proyección (ej. "Vacaciones", "Tenencia"). */
export interface PlannedExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  createdAt: string;
}

export type MovementInput = Omit<Movement, 'id' | 'createdAt'>;

/** Cuenta del usuario (vive en el servidor). */
export interface Account {
  id: string;
  name: string;
  email: string;
}

export type CustomCategories = Record<MovementType, string[]>;

/** Cargo recibido por registro rápido (p. ej. un atajo del iPhone), pendiente de confirmar. */
export interface PendingMovement {
  id: string;
  type: MovementType;
  amount: number;
  /** Comercio tal como llegó */
  merchant: string;
  /** Tarjeta o cuenta, si se envió */
  card: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO timestamp de recepción */
  receivedAt: string;
}

/** Categoría sugerida para un comercio. */
export interface MerchantRule {
  /** Texto normalizado (sin acentos ni mayúsculas) que debe contener el comercio */
  pattern: string;
  /** Texto tal como lo capturó el usuario */
  label: string;
  type: MovementType;
  category: string;
}

export interface AppData {
  version: 1;
  movements: Movement[];
  categories: CustomCategories;
  /** Bandeja de cargos por confirmar */
  pending: PendingMovement[];
  rules: MerchantRule[];
  /** Tope mensual por categoría de egreso; el mismo monto aplica a cada mes */
  budgets: Budget[];
  /** Pagos fijos y suscripciones */
  recurring: RecurringPayment[];
  /** Claves de pagos detectados que el usuario descartó (para no volver a sugerirlos) */
  recurringIgnored: string[];
  /** Traspasos entre efectivo y tarjeta/transferencia */
  transfers: Transfer[];
  /** Saldo inicial de las cuentas; null mientras el usuario no lo captura */
  opening: OpeningBalance | null;
  goals: Goal[];
  contributions: GoalContribution[];
  /** Gastos futuros para la proyección */
  planned: PlannedExpense[];
}

export type RecurringFrequency = 'mensual' | 'anual';

export interface RecurringPayment {
  id: string;
  name: string;
  /** Categoría de egreso */
  category: string;
  /** Monto esperado */
  amount: number;
  frequency: RecurringFrequency;
  /** Día del mes en que vence (1-31; se ajusta al último día en meses cortos) */
  day: number;
  /** Mes en que vence (1-12); solo para pagos anuales */
  month: number | null;
  /** Texto normalizado que, si aparece en la descripción de un egreso, lo marca como pagado */
  match: string;
  subscription: boolean;
  createdAt: string;
}

export interface Budget {
  /** Nombre exacto de la categoría de egreso */
  category: string;
  /** Tope mensual */
  amount: number;
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
  return { version: 1, movements: [], categories: { ingreso: [], egreso: [] }, pending: [], rules: [], budgets: [], recurring: [], recurringIgnored: [], transfers: [], opening: null, goals: [], contributions: [], planned: [] };
}
