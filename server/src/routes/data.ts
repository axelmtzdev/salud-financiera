import { FastifyInstance } from 'fastify';
import { RETENTION_YEARS } from '../../../src/app/shared/models/categories';
import { AppData, CustomCategories, Movement } from '../../../src/app/shared/models/finance.models';
import { rollOpeningForward } from '../../../src/app/shared/utils/accounts.utils';
import { sanitizeAppData, sanitizeOpening } from '../../../src/app/shared/utils/data-integrity.utils';
import { addYears, todayIso } from '../../../src/app/shared/utils/date.utils';
import { COLLECTIONS, Collection, DataChanges, itemKey } from '../../../src/app/shared/utils/sync.utils';
import type { Db, Queryable } from '../db.js';

/** Colecciones que se guardan como documentos en `user_items`. */
const ITEM_COLLECTIONS = COLLECTIONS.filter((c): c is Exclude<Collection, 'movements'> => c !== 'movements');

const changesSchema = {
  type: 'object',
  required: ['upsert', 'remove'],
  additionalProperties: false,
  properties: {
    upsert: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(COLLECTIONS.map((c) => [c, { type: 'array', maxItems: 20_000 }])),
    },
    remove: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        COLLECTIONS.map((c) => [c, { type: 'array', maxItems: 20_000, items: { type: 'string', maxLength: 200 } }]),
      ),
    },
    categories: { type: 'object' },
    recurringIgnored: { type: 'array', maxItems: 1_000 },
    opening: { type: ['object', 'null'] },
  },
} as const;

const MOVEMENT_COLUMNS = `id, type, category, amount, to_char(date, 'YYYY-MM-DD') AS date, description, account,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;

type MovementRow = Omit<Movement, 'amount'> & { amount: string | number };
const toMovement = (m: MovementRow) => ({ ...m, amount: Number(m.amount) });

export async function dataRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const userId = request.account!.id;
    const purged = await purgeOldData(app.db, userId);
    return { data: await loadData(app.db, userId), purged };
  });

  app.post<{ Body: DataChanges }>('/changes', { schema: { body: changesSchema } }, async (request, reply) => {
    await app.db.transaction((tx) => applyChanges(tx, request.account!.id, request.body));
    return reply.code(204).send();
  });
}

/**
 * Se conservan 2 años de movimientos y traspasos. Si el saldo inicial es anterior, primero se lleva
 * a la fecha de corte con el efecto de lo que se borra, para que el saldo de las cuentas no cambie.
 */
export async function purgeOldData(db: Db, userId: string, today = todayIso()): Promise<number> {
  const cutoff = addYears(today, -RETENTION_YEARS);
  return db.transaction(async (tx) => {
    const user = await tx.query<{ opening: unknown }>('SELECT opening FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const opening = sanitizeOpening(user.rows[0]?.opening);
    if (opening && opening.date < cutoff) {
      const [movements, transfers] = await Promise.all([
        tx.query<MovementRow>(`SELECT ${MOVEMENT_COLUMNS} FROM movements WHERE user_id = $1 AND date >= $2 AND date < $3`, [
          userId,
          opening.date,
          cutoff,
        ]),
        tx.query<{ data: unknown }>(
          `SELECT data FROM user_items WHERE user_id = $1 AND kind = 'transfers' AND data->>'date' < $2`,
          [userId, cutoff],
        ),
      ]);
      const old = sanitizeAppData({ movements: movements.rows.map(toMovement), transfers: transfers.rows.map((r) => r.data) }).data;
      const rolled = rollOpeningForward(opening, old.movements, old.transfers, cutoff);
      await tx.query('UPDATE users SET opening = $2::jsonb WHERE id = $1', [userId, JSON.stringify(rolled)]);
    }
    await tx.query(`DELETE FROM user_items WHERE user_id = $1 AND kind = 'transfers' AND data->>'date' < $2`, [userId, cutoff]);
    const { rows } = await tx.query<{ count: string | number }>(
      `WITH deleted AS (DELETE FROM movements WHERE user_id = $1 AND date < $2 RETURNING 1) SELECT count(*) AS count FROM deleted`,
      [userId, cutoff],
    );
    return Number(rows[0]?.count ?? 0);
  });
}

export async function loadData(db: Queryable, userId: string): Promise<AppData> {
  const [movements, items, user] = await Promise.all([
    db.query<MovementRow>(`SELECT ${MOVEMENT_COLUMNS} FROM movements WHERE user_id = $1`, [userId]),
    db.query<{ kind: string; data: unknown }>('SELECT kind, data FROM user_items WHERE user_id = $1 ORDER BY updated_at, key', [userId]),
    db.query<{ categories: unknown; recurring_ignored: unknown; opening: unknown }>(
      'SELECT categories, recurring_ignored, opening FROM users WHERE id = $1',
      [userId],
    ),
  ]);

  const raw: Record<string, unknown> = {
    movements: movements.rows.map(toMovement),
    categories: user.rows[0]?.categories,
    recurringIgnored: user.rows[0]?.recurring_ignored,
    opening: user.rows[0]?.opening,
  };
  for (const kind of ITEM_COLLECTIONS) raw[kind] = items.rows.filter((r) => r.kind === kind).map((r) => r.data);
  return sanitizeAppData(raw).data;
}

/** Aplica los cambios ya validados con las mismas reglas que usa el frontend al leer datos. */
export async function applyChanges(db: Queryable, userId: string, changes: DataChanges): Promise<void> {
  const clean = sanitizeAppData({
    ...changes.upsert,
    categories: changes.categories,
    recurringIgnored: changes.recurringIgnored,
    opening: changes.opening,
  }).data;

  const removedMovements = changes.remove.movements ?? [];
  if (removedMovements.length) {
    await db.query('DELETE FROM movements WHERE user_id = $1 AND id = ANY($2::text[])', [userId, removedMovements]);
  }
  for (const kind of ITEM_COLLECTIONS) {
    const keys = changes.remove[kind] ?? [];
    if (keys.length) {
      await db.query('DELETE FROM user_items WHERE user_id = $1 AND kind = $2 AND key = ANY($3::text[])', [userId, kind, keys]);
    }
  }

  if (clean.movements.length) {
    await db.query(
      `INSERT INTO movements (user_id, id, type, category, amount, date, description, account, created_at)
       SELECT $1, m.id, m.type, m.category, m.amount, m.date, m.description, m.account, m."createdAt"
         FROM jsonb_to_recordset($2::jsonb)
           AS m(id text, type text, category text, amount numeric, date date, description text, account text, "createdAt" timestamptz)
       ON CONFLICT (user_id, id) DO UPDATE SET
         type = EXCLUDED.type, category = EXCLUDED.category, amount = EXCLUDED.amount,
         date = EXCLUDED.date, description = EXCLUDED.description, account = EXCLUDED.account, updated_at = now()`,
      [userId, JSON.stringify(clean.movements)],
    );
  }
  for (const kind of ITEM_COLLECTIONS) {
    // Solo se tocan las colecciones que venían en el cambio (sanitize devuelve [] para las demás)
    if (!changes.upsert[kind]?.length || !clean[kind].length) continue;
    const rows = clean[kind].map((item) => ({ key: itemKey(kind, item), data: item }));
    await db.query(
      `INSERT INTO user_items (user_id, kind, key, data)
       SELECT $1, $2, i.key, i.data FROM jsonb_to_recordset($3::jsonb) AS i(key text, data jsonb)
       ON CONFLICT (user_id, kind, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [userId, kind, JSON.stringify(rows)],
    );
  }

  if (changes.categories !== undefined) {
    await db.query('UPDATE users SET categories = $2::jsonb WHERE id = $1', [userId, JSON.stringify(clean.categories satisfies CustomCategories)]);
  }
  if (changes.opening !== undefined) {
    // Un saldo inicial inválido se guarda como "sin saldo inicial"
    await db.query('UPDATE users SET opening = $2::jsonb WHERE id = $1', [userId, JSON.stringify(clean.opening)]);
  }
  if (changes.recurringIgnored !== undefined) {
    await db.query('UPDATE users SET recurring_ignored = $2::jsonb WHERE id = $1', [userId, JSON.stringify(clean.recurringIgnored)]);
  }
}
