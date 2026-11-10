import pg from 'pg';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Postgres en Neon cuando hay `DATABASE_URL`; sin ella, PGlite (Postgres en WebAssembly) para
 * desarrollo y pruebas sin instalar nada. `dataDir` vacío = en memoria.
 */
export async function createDb(databaseUrl: string | undefined, dataDir?: string): Promise<Db> {
  if (databaseUrl) return createPgDb(databaseUrl);
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(dataDir);
  return {
    query: (sql, params) => lite.query(sql, params) as never,
    transaction: (fn) => lite.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) as never })),
    close: () => lite.close(),
  };
}

function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  // Neon cierra conexiones inactivas; sin este listener el error tumbaría el proceso
  pool.on('error', (err) => console.error('Conexión a Postgres cerrada', err.message));
  return {
    query: (sql, params) => pool.query(sql, params) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (sql, params) => client.query(sql, params) as never });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Migraciones en orden; cada una corre una sola vez dentro de una transacción. Solo se agregan al final. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    categories jsonb NOT NULL DEFAULT '{"ingreso":[],"egreso":[]}',
    recurring_ignored jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX sessions_user_idx ON sessions(user_id);

  CREATE TABLE movements (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id text NOT NULL,
    type text NOT NULL CHECK (type IN ('ingreso', 'egreso')),
    category text NOT NULL,
    amount numeric(14, 2) NOT NULL CHECK (amount > 0),
    date date NOT NULL,
    description text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX movements_user_date_idx ON movements(user_id, date DESC);

  -- Colecciones pequeñas (bandeja, pagos recurrentes, reglas, presupuestos) como documentos JSON
  CREATE TABLE user_items (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    key text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, key)
  );
  `,
  // Forma de pago (los movimientos existentes quedan como tarjeta/transferencia) y saldo inicial
  `
  ALTER TABLE movements ADD COLUMN account text NOT NULL DEFAULT 'banco' CHECK (account IN ('efectivo', 'banco'));
  ALTER TABLE users ADD COLUMN opening jsonb;
  `,
  // Los gastos planeados (de Proyección) pasan a ser pagos únicos en la sección Pagos
  `
  INSERT INTO user_items (user_id, kind, key, data)
  SELECT user_id, 'recurring', key, jsonb_build_object(
      'id', data->>'id', 'name', data->>'description', 'category', data->>'category',
      'amount', (data->>'amount')::numeric, 'frequency', 'mensual',
      'day', extract(day from (data->>'date')::date)::int, 'month', null,
      'match', lower(data->>'description'), 'subscription', false, 'createdAt', data->>'createdAt',
      'kind', 'unico', 'date', data->>'date', 'installments', null, 'startMonth', null, 'amounts', '{}'::jsonb)
    FROM user_items WHERE kind = 'planned'
  ON CONFLICT (user_id, kind, key) DO NOTHING;
  DELETE FROM user_items WHERE kind = 'planned';
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => Number(r.version)));
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (applied.has(version)) continue;
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(sql)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
  }
}

/** PGlite no acepta varias sentencias en una consulta con parámetros; se ejecutan una por una. */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
