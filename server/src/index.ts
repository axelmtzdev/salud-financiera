import { buildApp } from './app.js';
import { createDb, migrate } from './db.js';

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'];
const corsOrigins = (process.env['CORS_ORIGIN'] ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (!databaseUrl && process.env['NODE_ENV'] === 'production') {
  console.error('Falta DATABASE_URL (la cadena de conexión de Neon).');
  process.exit(1);
}

// Sin DATABASE_URL se usa PGlite con los datos en server/.data (solo desarrollo)
const db = await createDb(databaseUrl, databaseUrl ? undefined : './.data');
await migrate(db);

const app = await buildApp({
  db,
  corsOrigins,
  sessionDays: Number(process.env['SESSION_DAYS'] ?? 60),
  logger: true,
});

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port, host: '0.0.0.0' });
