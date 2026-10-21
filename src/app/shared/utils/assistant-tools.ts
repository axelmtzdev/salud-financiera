import { availableCategories } from '../models/categories';
import { AppData, DateRange, InsightLevel, MOVEMENT_TYPES, MovementType } from '../models/finance.models';
import {
  MovementOrder,
  buildInsights,
  byCategory,
  filterByRange,
  monthlySeries,
  orderMovements,
  queryMovements,
  summarize,
} from './analytics.utils';
import { budgetOverview } from './budget.utils';
import { currentOccurrence, detectRecurring, priceChange, recurringTotals, upcomingPayments } from './recurring.utils';
import { isValidIsoDate, monthKey, monthLabel, todayIso } from './date.utils';
import { APP_CURRENCY, round2 } from './format.utils';

/**
 * Herramientas de solo lectura para el asistente con IA. No dependen de ningún proveedor:
 * cada adaptador (Claude, Ollama, …) traduce `ASSISTANT_TOOLS` a su formato y llama a
 * `runAssistantTool` con lo que pida el modelo. Los cálculos los hacen las utilidades de
 * análisis, así las cifras que ve el modelo son las mismas que muestra la app.
 */

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const SERIES_DEFAULT_MONTHS = 6;
export const SERIES_MAX_MONTHS = 24;
export const PENDING_MAX_ITEMS = 50;

// Subconjunto de JSON Schema que aceptan tanto Claude (incluido `strict: true`) como las APIs
// estilo OpenAI/Ollama. Los límites numéricos se describen en el texto y se aplican en código.
export type ToolProperty =
  | { type: 'string'; description: string; enum?: readonly string[]; format?: 'date' }
  | { type: 'number' | 'integer'; description: string };

export interface ToolParameters {
  type: 'object';
  properties: Readonly<Record<string, ToolProperty>>;
  required: readonly string[];
  additionalProperties: false;
}

export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

type ToolArgs = Readonly<Record<string, string | number | undefined>>;

interface ToolContext {
  data: AppData;
  today: string;
}

interface ToolSpec extends AssistantToolDefinition {
  run(args: ToolArgs, ctx: ToolContext): unknown;
}

const date = (description: string): ToolProperty => ({ type: 'string', format: 'date', description });
const movementType = (description: string): ToolProperty => ({ type: 'string', enum: MOVEMENT_TYPES, description });
const params = (properties: Record<string, ToolProperty>, required: string[] = []): ToolParameters => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const rangeParams = {
  desde: date('Primer día del período, inclusive (YYYY-MM-DD).'),
  hasta: date('Último día del período, inclusive (YYYY-MM-DD).'),
};

const INSIGHT_LEVEL_LABEL: Record<InsightLevel, string> = {
  danger: 'alerta',
  warning: 'advertencia',
  info: 'informativo',
  success: 'positivo',
};

const BUDGET_LEVEL_LABEL = { ok: 'en_rango', warning: 'cerca_del_limite', over: 'excedido' } as const;

const SEARCH_ORDER = {
  recientes: 'recent',
  antiguos: 'oldest',
  mayor_monto: 'largest',
  menor_monto: 'smallest',
} as const satisfies Record<string, MovementOrder>;
type SearchOrder = keyof typeof SEARCH_ORDER;
const SEARCH_ORDERS = Object.keys(SEARCH_ORDER) as SearchOrder[];

const TOOLS: readonly ToolSpec[] = [
  {
    name: 'obtener_resumen',
    description:
      'Totales de un período: ingresos, egresos, saldo neto, tasa de ahorro y número de movimientos. ' +
      'Úsala para preguntas como "¿cuánto gasté este mes?" o "¿cuánto ahorré en el año?". ' +
      'Para comparar períodos, llámala una vez por período.',
    parameters: params(rangeParams, ['desde', 'hasta']),
    run: (args, { data }) => {
      const range = toRange(args);
      const s = summarize(filterByRange(data.movements, range));
      return {
        periodo: range,
        moneda: APP_CURRENCY,
        ingresos: s.income,
        egresos: s.expense,
        saldo: s.net,
        tasaAhorroPorcentaje: s.savingsRate === null ? null : round1(s.savingsRate * 100),
        movimientos: s.count,
      };
    },
  },
  {
    name: 'desglose_por_categoria',
    description:
      'Total, porcentaje y número de movimientos por categoría para un tipo (ingreso o egreso) en un período, ' +
      'de mayor a menor. Úsala para "¿en qué gasto más?" o "¿cuánto se fue en Alimentación?".',
    parameters: params(
      {
        tipo: movementType('Tipo de movimiento a desglosar.'),
        ...rangeParams,
        limite: { type: 'integer', description: 'Máximo de categorías a devolver (opcional; por defecto todas).' },
      },
      ['tipo', 'desde', 'hasta'],
    ),
    run: (args, { data }) => {
      const range = toRange(args);
      const stats = byCategory(filterByRange(data.movements, range), args['tipo'] as MovementType);
      const limit = args['limite'] === undefined ? stats.length : clamp(args['limite'] as number, 1, stats.length);
      return {
        periodo: range,
        tipo: args['tipo'],
        moneda: APP_CURRENCY,
        total: round2(stats.reduce((sum, s) => sum + s.total, 0)),
        categorias: stats.slice(0, limit).map((s) => ({
          categoria: s.category,
          total: s.total,
          porcentaje: round1(s.percent),
          movimientos: s.count,
        })),
        categoriasOmitidas: Math.max(stats.length - limit, 0),
      };
    },
  },
  {
    name: 'serie_mensual',
    description:
      'Ingresos, egresos y saldo de cada mes calendario, terminando en el mes de "hasta". ' +
      'Úsala para tendencias o para comparar meses entre sí.',
    parameters: params({
      hasta: date('Cualquier día del último mes de la serie (YYYY-MM-DD). Por defecto, hoy.'),
      meses: {
        type: 'integer',
        description: `Cantidad de meses, de 1 a ${SERIES_MAX_MONTHS}. Por defecto ${SERIES_DEFAULT_MONTHS}.`,
      },
    }),
    run: (args, { data, today }) => {
      const end = (args['hasta'] as string | undefined) ?? today;
      const count = clamp((args['meses'] as number | undefined) ?? SERIES_DEFAULT_MONTHS, 1, SERIES_MAX_MONTHS);
      return {
        moneda: APP_CURRENCY,
        meses: monthlySeries(data.movements, end, count).map((p) => ({
          mes: p.key,
          etiqueta: monthLabel(p.key, true),
          ingresos: p.income,
          egresos: p.expense,
          saldo: p.net,
        })),
      };
    },
  },
  {
    name: 'buscar_movimientos',
    description:
      'Lista movimientos individuales con filtros opcionales y la suma de todos los que coinciden ' +
      '(aunque la lista se recorte). Úsala para "¿cuándo pagué la renta?", "mis gastos más grandes" ' +
      'o "¿cuánto he gastado en Uber?". La búsqueda de texto ignora mayúsculas y acentos.',
    parameters: params({
      tipo: movementType('Filtra por tipo.'),
      categoria: { type: 'string', description: 'Nombre exacto de la categoría (ver listar_categorias).' },
      desde: date('Fecha mínima, inclusive (YYYY-MM-DD).'),
      hasta: date('Fecha máxima, inclusive (YYYY-MM-DD).'),
      texto: { type: 'string', description: 'Texto a buscar en la descripción (para categorías usa "categoria").' },
      montoMin: { type: 'number', description: 'Monto mínimo, inclusive.' },
      montoMax: { type: 'number', description: 'Monto máximo, inclusive.' },
      orden: { type: 'string', enum: SEARCH_ORDERS, description: 'Orden de la lista. Por defecto "recientes".' },
      limite: {
        type: 'integer',
        description: `Máximo de movimientos a devolver, de 1 a ${SEARCH_MAX_LIMIT}. Por defecto ${SEARCH_DEFAULT_LIMIT}.`,
      },
    }),
    run: (args, { data }) => {
      const [from, to] = ordered(args['desde'] as string | undefined, args['hasta'] as string | undefined);
      const [minAmount, maxAmount] = ordered(args['montoMin'] as number | undefined, args['montoMax'] as number | undefined);
      const matches = queryMovements(data.movements, {
        type: args['tipo'] as MovementType | undefined,
        category: args['categoria'] as string | undefined,
        text: args['texto'] as string | undefined,
        from,
        to,
        minAmount,
        maxAmount,
      });
      const limit = clamp((args['limite'] as number | undefined) ?? SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
      const totals = summarize(matches);
      return {
        moneda: APP_CURRENCY,
        coincidencias: matches.length,
        sumaIngresos: totals.income,
        sumaEgresos: totals.expense,
        movimientos: orderMovements(matches, SEARCH_ORDER[(args['orden'] as SearchOrder | undefined) ?? 'recientes'])
          .slice(0, limit)
          .map((m) => ({ fecha: m.date, tipo: m.type, categoria: m.category, monto: m.amount, descripcion: m.description })),
        recortado: matches.length > limit,
      };
    },
  },
  {
    name: 'obtener_recomendaciones',
    description:
      'Las recomendaciones automáticas que la app muestra en Análisis para un período ' +
      '(nivel de gasto, ahorro, categoría principal, comparativa con el mes anterior y proyección a 12 meses).',
    parameters: params(rangeParams, ['desde', 'hasta']),
    run: (args, { data, today }) => {
      const range = toRange(args);
      return {
        periodo: range,
        recomendaciones: buildInsights(data.movements, range, today).map((i) => ({
          nivel: INSIGHT_LEVEL_LABEL[i.level],
          titulo: i.title,
          mensaje: i.message,
        })),
      };
    },
  },
  {
    name: 'listar_categorias',
    description:
      'Categorías disponibles por tipo: predefinidas, personalizadas y las que aún usan movimientos antiguos. ' +
      'Úsala para usar el nombre exacto de una categoría en otras herramientas.',
    parameters: params({}),
    run: (_args, { data }) => availableCategories(data.categories, data.movements),
  },
  {
    name: 'estado_presupuesto',
    description:
      'Presupuesto mensual por categoría de egreso: tope, gastado, disponible y nivel (en_rango, cerca_del_limite, ' +
      'excedido), más el gasto en categorías sin presupuesto. En el mes en curso incluye cuánto del mes ha pasado y ' +
      'una proyección al cierre. Úsala para "¿cómo voy con mi presupuesto?" o "¿en qué me estoy pasando?".',
    parameters: params({
      fecha: date('Cualquier día del mes a revisar (YYYY-MM-DD). Por defecto, hoy.'),
    }),
    run: (args, { data, today }) => {
      const month = monthKey((args['fecha'] as string | undefined) ?? today);
      const o = budgetOverview(data.budgets, data.movements, month, today);
      return {
        mes: month,
        etiqueta: monthLabel(month, true),
        moneda: APP_CURRENCY,
        tienePresupuestos: data.budgets.length > 0,
        presupuestoTotal: o.totalLimit,
        gastadoTotal: o.totalSpent,
        disponibleTotal: o.totalRemaining,
        avanceDelMesPorcentaje: round1(o.elapsed * 100),
        categorias: o.lines.map((l) => ({
          categoria: l.category,
          tope: l.limit,
          gastado: l.spent,
          disponible: l.remaining,
          usadoPorcentaje: round1(l.ratio * 100),
          nivel: BUDGET_LEVEL_LABEL[l.level],
          proyeccionAlCierre: l.projected,
        })),
        sinPresupuesto: o.unbudgeted.map((s) => ({ categoria: s.category, gastado: s.total })),
      };
    },
  },
  {
    name: 'pagos_recurrentes',
    description:
      'Pagos fijos y suscripciones registrados: monto, frecuencia, estado del vencimiento actual (pagado, pendiente, ' +
      'vencido), los que vencen en los próximos 30 días, el compromiso mensual y cambios de precio detectados. ' +
      'También lista los egresos que parecen recurrentes y aún no están registrados. Úsala para "¿qué pagos vienen?", ' +
      '"¿cuánto gasto en suscripciones?" o "¿ya pagué la renta?".',
    parameters: params({}),
    run: (_args, { data, today }) => {
      const totals = recurringTotals(data.recurring, data.movements, today);
      return {
        moneda: APP_CURRENCY,
        compromisoMensual: totals.monthly,
        suscripcionesMensual: totals.subscriptionsMonthly,
        faltaPagarEsteMes: totals.pendingThisMonth,
        pagos: data.recurring.map((r) => {
          const o = currentOccurrence(r, data.movements, today);
          return {
            nombre: r.name,
            categoria: r.category,
            monto: r.amount,
            frecuencia: r.frequency,
            dia: r.day,
            mes: r.month,
            suscripcion: r.subscription,
            vencimientoActual: o ? { fecha: o.due, estado: o.status } : null,
          };
        }),
        proximos30Dias: upcomingPayments(data.recurring, data.movements, today, 30).map((o) => ({
          nombre: o.payment.name,
          fecha: o.due,
          estado: o.status,
          monto: o.payment.amount,
        })),
        cambiosDePrecio: data.recurring
          .map((r) => priceChange(r, data.movements, today))
          .filter((c) => c !== null)
          .map((c) => ({ nombre: c.payment.name, antes: c.from, ahora: c.to, fecha: c.date })),
        detectadosSinRegistrar: detectRecurring(data.movements, data.recurring, data.recurringIgnored, today).map((d) => ({
          nombre: d.name,
          monto: d.amount,
          dia: d.day,
          meses: d.months,
        })),
      };
    },
  },
  {
    name: 'pendientes_por_confirmar',
    description:
      'Cargos recibidos por registro rápido (atajo del iPhone) que todavía no se confirman. ' +
      'No cuentan en los totales hasta que el usuario los confirma.',
    parameters: params({}),
    run: (_args, { data }) => ({
      moneda: APP_CURRENCY,
      total: data.pending.length,
      pendientes: data.pending.slice(0, PENDING_MAX_ITEMS).map((p) => ({
        fecha: p.date,
        tipo: p.type,
        monto: p.amount,
        comercio: p.merchant,
        tarjeta: p.card,
      })),
      recortado: data.pending.length > PENDING_MAX_ITEMS,
    }),
  },
];

/** Definiciones que se envían al modelo. */
export const ASSISTANT_TOOLS: readonly AssistantToolDefinition[] = TOOLS.map(({ name, description, parameters }) => ({
  name,
  description,
  parameters,
}));

/**
 * Valida la entrada que generó el modelo y ejecuta la herramienta sobre los datos locales.
 * Nunca lanza: los errores vuelven como `{ ok: false }` para devolverlos al modelo y que corrija.
 */
export function runAssistantTool(name: string, input: unknown, data: AppData, today = todayIso()): ToolResult {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `No existe la herramienta "${name}".` };

  const parsed = validateArgs(tool.parameters, input ?? {});
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, result: tool.run(parsed.args, { data, today }) };
  } catch {
    return { ok: false, error: `La herramienta "${name}" falló al procesar los datos.` };
  }
}

function validateArgs(schema: ToolParameters, input: unknown): { ok: true; args: ToolArgs } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Los parámetros deben ser un objeto.' };
  }
  const args: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    const property = schema.properties[key];
    if (!property) return { ok: false, error: `Parámetro desconocido: "${key}".` };
    // Algunos modelos envían null en los opcionales que no usan
    if (value === null || value === undefined) continue;
    const error = checkProperty(key, property, value);
    if (error) return { ok: false, error };
    args[key] = value as string | number;
  }
  const missing = schema.required.filter((key) => args[key] === undefined);
  if (missing.length) return { ok: false, error: `Faltan parámetros obligatorios: ${missing.join(', ')}.` };
  return { ok: true, args };
}

function checkProperty(key: string, property: ToolProperty, value: unknown): string | null {
  switch (property.type) {
    case 'string':
      if (typeof value !== 'string') return `"${key}" debe ser texto.`;
      if (property.enum && !property.enum.includes(value)) return `"${key}" debe ser uno de: ${property.enum.join(', ')}.`;
      if (property.format === 'date' && !isValidIsoDate(value)) return `"${key}" debe ser una fecha válida YYYY-MM-DD.`;
      return null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `"${key}" debe ser un número.`;
    case 'integer':
      return Number.isInteger(value) ? null : `"${key}" debe ser un número entero.`;
  }
}

/** Rango obligatorio `desde`/`hasta`; si vienen invertidos se intercambian. */
function toRange(args: ToolArgs): DateRange {
  const [from, to] = ordered(args['desde'] as string, args['hasta'] as string);
  return { from: from!, to: to! };
}

/** Intercambia los extremos de un rango (fechas o montos) si vienen invertidos. */
function ordered<T extends string | number>(a: T | undefined, b: T | undefined): [T | undefined, T | undefined] {
  return a !== undefined && b !== undefined && a > b ? [b, a] : [a, b];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
