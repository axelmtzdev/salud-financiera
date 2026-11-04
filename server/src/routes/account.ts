import { FastifyInstance } from 'fastify';
import type { AccountRow } from '../app.js';
import { hashPassword, verifyPassword } from '../security.js';
import { NAME_SCHEMA, PASSWORD_SCHEMA, cleanName } from './auth.js';

const SENSITIVE_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  const passwordMatches = async (userId: string, password: string) => {
    const { rows } = await app.db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
    return !!rows[0] && (await verifyPassword(password, rows[0].password_hash));
  };

  app.patch<{ Body: { name: string } }>(
    '/',
    {
      schema: {
        body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: NAME_SCHEMA } },
      },
    },
    async (request) => {
      const { rows } = await app.db.query<AccountRow>(
        'UPDATE users SET name = $2 WHERE id = $1 RETURNING id, name, email',
        [request.account!.id, cleanName(request.body.name)],
      );
      return { user: rows[0] };
    },
  );

  /** Al cambiar la contraseña se cierran las demás sesiones (por si alguien más la conocía). */
  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/password',
    {
      config: SENSITIVE_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: { currentPassword: { type: 'string', maxLength: 200 }, newPassword: PASSWORD_SCHEMA },
        },
      },
    },
    async (request, reply) => {
      const userId = request.account!.id;
      if (!(await passwordMatches(userId, request.body.currentPassword))) {
        return reply.code(403).send({ message: 'La contraseña actual no es correcta.' });
      }
      const passwordHash = await hashPassword(request.body.newPassword);
      await app.db.transaction(async (tx) => {
        await tx.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
        await tx.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, request.sessionId]);
      });
      return reply.code(204).send();
    },
  );

  app.delete<{ Body: { password: string } }>(
    '/',
    {
      config: SENSITIVE_RATE_LIMIT,
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      if (!(await passwordMatches(request.account!.id, request.body.password))) {
        return reply.code(403).send({ message: 'La contraseña no es correcta.' });
      }
      // ON DELETE CASCADE borra sesiones, movimientos y demás registros
      await app.db.query('DELETE FROM users WHERE id = $1', [request.account!.id]);
      return reply.code(204).send();
    },
  );
}
