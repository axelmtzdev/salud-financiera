import { FastifyInstance, FastifyRequest } from 'fastify';
import type { AccountRow } from '../app.js';
import type { Queryable } from '../db.js';
import { DUMMY_HASH, hashPassword, hashToken, newSessionToken, verifyPassword } from '../security.js';

/** Los espacios alrededor se aceptan y se quitan al normalizar. */
export const EMAIL_PATTERN = '^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$';
export const PASSWORD_SCHEMA = { type: 'string', minLength: 8, maxLength: 200 } as const;
export const NAME_SCHEMA = { type: 'string', minLength: 1, maxLength: 30, pattern: '\\S' } as const;

/** 10 intentos por minuto e IP: suficiente para equivocarse, insuficiente para adivinar contraseñas. */
const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim();

export async function createSession(db: Queryable, request: FastifyRequest, userId: string, days: number): Promise<string> {
  const token = newSessionToken();
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [userId, hashToken(token), (request.headers['user-agent'] ?? '').slice(0, 200), days],
  );
  return token;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; email: string; password: string } }>(
    '/register',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          additionalProperties: false,
          properties: {
            name: NAME_SCHEMA,
            email: { type: 'string', maxLength: 254, pattern: EMAIL_PATTERN },
            password: PASSWORD_SCHEMA,
          },
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const name = cleanName(request.body.name);
      const passwordHash = await hashPassword(request.body.password);
      const { rows } = await app.db.query<AccountRow>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING RETURNING id, name, email`,
        [email, name, passwordHash],
      );
      if (!rows[0]) return reply.code(409).send({ message: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
      const token = await createSession(app.db, request, rows[0].id, app.config.sessionDays);
      return reply.code(201).send({ token, user: rows[0] });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/login',
    {
      config: AUTH_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: { email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      const { rows } = await app.db.query<AccountRow & { password_hash: string }>(
        'SELECT id, name, email, password_hash FROM users WHERE email = $1',
        [normalizeEmail(request.body.email)],
      );
      const user = rows[0];
      const valid = await verifyPassword(request.body.password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !valid) return reply.code(401).send({ message: 'Correo o contraseña incorrectos.' });
      const token = await createSession(app.db, request, user.id, app.config.sessionDays);
      return { token, user: { id: user.id, name: user.name, email: user.email } };
    },
  );

  app.post('/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await app.db.query('DELETE FROM sessions WHERE id = $1', [request.sessionId]);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => ({ user: request.account }));
}
