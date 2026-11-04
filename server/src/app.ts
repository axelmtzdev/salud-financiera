import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db.js';
import { accountRoutes } from './routes/account.js';
import { authRoutes } from './routes/auth.js';
import { dataRoutes } from './routes/data.js';
import { hashToken } from './security.js';

export interface AppConfig {
  db: Db;
  /** Orígenes permitidos (la URL de Netlify). Vacío = cualquier localhost, para desarrollo. */
  corsOrigins: string[];
  sessionDays: number;
  logger?: boolean;
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    account: AccountRow | null;
    sessionId: string | null;
  }
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  // Render está detrás de un proxy: trustProxy da la IP real para el límite de intentos
  const app = Fastify({
    logger: config.logger ?? false,
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
    // Sin coerción: un tipo incorrecto se rechaza en lugar de convertirse ("x" → ["x"])
    ajv: { customOptions: { coerceTypes: false, removeAdditional: true } },
  });

  app.decorate('db', config.db);
  app.decorate('config', config);
  app.decorateRequest('account', null);
  app.decorateRequest('sessionId', null);

  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  });
  await app.register(rateLimit, { global: false });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return reply.code(401).send({ message: 'Inicia sesión para continuar.' });

    const { rows } = await app.db.query<AccountRow & { session_id: string; stale: boolean }>(
      `SELECT s.id AS session_id, u.id, u.name, u.email, s.last_used_at < now() - interval '1 day' AS stale
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) return reply.code(401).send({ message: 'Tu sesión expiró. Vuelve a iniciar sesión.' });

    // Sesión deslizante: se extiende una vez al día mientras se use
    if (row.stale) {
      await app.db.query(
        `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`,
        [row.session_id, config.sessionDays],
      );
    }
    request.account = { id: row.id, name: row.name, email: row.email };
    request.sessionId = row.session_id;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) return reply.code(400).send({ message: 'Revisa los datos enviados.' });
    if (error.statusCode === 429) return reply.code(429).send({ message: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' });
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ message: error.message });
    request.log.error(error);
    return reply.code(500).send({ message: 'Ocurrió un error en el servidor.' });
  });

  app.get('/health', async () => {
    await app.db.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(dataRoutes, { prefix: '/api/data' });
  return app;
}
