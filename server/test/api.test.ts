import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Db, createDb, migrate } from '../src/db.js';

const today = new Date().toISOString().slice(0, 10);

let db: Db;
let app: FastifyInstance;

before(async () => {
  db = await createDb(undefined);
  await migrate(db);
  await migrate(db); // idempotente
  app = await buildApp({ db, corsOrigins: ['https://mi-app.netlify.app'], sessionDays: 60 });
});

after(async () => {
  await app.close();
  await db.close();
});

let ip = 0;
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: object, remoteAddress = '127.0.0.1') =>
  app.inject({ method, url, payload, remoteAddress, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function register(email: string, password = 'contraseña-segura') {
  const res = await call('POST', '/api/auth/register', undefined, { name: '  Ana   López ', email, password }, `10.0.0.${++ip}`);
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as { token: string; user: { id: string; name: string; email: string } };
}

describe('auth', () => {
  it('registra con correo normalizado y no permite duplicados', async () => {
    const { token, user } = await register('  Ana@Correo.MX ');
    assert.equal(user.email, 'ana@correo.mx');
    assert.equal(user.name, 'Ana López');
    assert.ok(token.length > 30);

    const dup = await call('POST', '/api/auth/register', undefined, { name: 'Otra', email: 'ana@correo.mx', password: '12345678' });
    assert.equal(dup.statusCode, 409);

    const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', ['ana@correo.mx']);
    assert.match(rows[0].password_hash, /^scrypt\$/);
  });

  it('rechaza datos inválidos', async () => {
    for (const body of [
      { name: 'X', email: 'no-es-correo', password: '12345678' },
      { name: 'X', email: 'x@y.mx', password: 'corta' },
      { name: '   ', email: 'x@y.mx', password: '12345678' },
    ]) {
      const res = await call('POST', '/api/auth/register', undefined, body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.json().message, 'Revisa los datos enviados.');
    }
  });

  it('inicia sesión, valida el token y cierra sesión', async () => {
    await register('beto@correo.mx', 'mi-clave-123');
    const bad = await call('POST', '/api/auth/login', undefined, { email: 'beto@correo.mx', password: 'otra-clave' });
    assert.equal(bad.statusCode, 401);
    const unknown = await call('POST', '/api/auth/login', undefined, { email: 'nadie@correo.mx', password: 'otra-clave' });
    assert.equal(unknown.json().message, bad.json().message);

    const ok = await call('POST', '/api/auth/login', undefined, { email: 'BETO@correo.mx', password: 'mi-clave-123' });
    assert.equal(ok.statusCode, 200);
    const { token } = ok.json();

    assert.equal((await call('GET', '/api/auth/me', token)).json().user.email, 'beto@correo.mx');
    assert.equal((await call('GET', '/api/auth/me')).statusCode, 401);
    assert.equal((await call('GET', '/api/auth/me', 'token-falso')).statusCode, 401);

    assert.equal((await call('POST', '/api/auth/logout', token)).statusCode, 204);
    assert.equal((await call('GET', '/api/auth/me', token)).statusCode, 401);
  });

  it('limita los intentos de inicio de sesión', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await call('POST', '/api/auth/login', undefined, { email: 'x@limite.mx', password: 'x' })).statusCode;
    }
    assert.equal(last, 429);
  });
});

describe('cuenta', () => {
  it('cambia nombre y contraseña cerrando las otras sesiones', async () => {
    const { token } = await register('carla@correo.mx', 'clave-original');
    const other = (await call('POST', '/api/auth/login', undefined, { email: 'carla@correo.mx', password: 'clave-original' })).json().token;

    assert.equal((await call('PATCH', '/api/account', token, { name: 'Carla' })).json().user.name, 'Carla');

    const wrong = await call('POST', '/api/account/password', token, { currentPassword: 'equivocada', newPassword: 'clave-nueva-1' });
    assert.equal(wrong.statusCode, 403);
    const ok = await call('POST', '/api/account/password', token, { currentPassword: 'clave-original', newPassword: 'clave-nueva-1' });
    assert.equal(ok.statusCode, 204);

    assert.equal((await call('GET', '/api/auth/me', token)).statusCode, 200);
    assert.equal((await call('GET', '/api/auth/me', other)).statusCode, 401);
  });

  it('elimina la cuenta con todos sus datos', async () => {
    const { token, user } = await register('dani@correo.mx', 'clave-dani-1');
    await call('POST', '/api/data/changes', token, {
      upsert: { movements: [{ id: 'm1', type: 'egreso', category: 'Vivienda', amount: 100, date: today }] },
      remove: {},
    });
    assert.equal((await call('DELETE', '/api/account', token, { password: 'mala' })).statusCode, 403);
    assert.equal((await call('DELETE', '/api/account', token, { password: 'clave-dani-1' })).statusCode, 204);
    const { rows } = await db.query('SELECT 1 FROM movements WHERE user_id = $1', [user.id]);
    assert.equal(rows.length, 0);
    assert.equal((await call('GET', '/api/auth/me', token)).statusCode, 401);
  });
});

describe('datos', () => {
  it('guarda cambios, los aísla por usuario y los devuelve validados', async () => {
    const ana = await register('eva@correo.mx');
    const otro = await register('fer@correo.mx');

    const res = await call('POST', '/api/data/changes', ana.token, {
      upsert: {
        movements: [
          { id: 'm1', type: 'egreso', category: ' Vivienda ', amount: 12000.005, date: today, description: 'Renta', createdAt: '2026-01-01T10:00:00.000Z' },
          { id: 'm2', type: 'ingreso', category: 'Salario', amount: 30000, date: today, description: '' },
          { id: 'malo', type: 'egreso', category: 'X', amount: -5, date: today },
        ],
        budgets: [{ category: 'Alimentación', amount: 4000 }],
        rules: [{ pattern: 'OXXO', label: 'OXXO', type: 'egreso', category: 'Alimentación' }],
      },
      remove: {},
      categories: { ingreso: ['Bonos'], egreso: [] },
    });
    assert.equal(res.statusCode, 204, res.body);

    const { data, purged } = (await call('GET', '/api/data', ana.token)).json();
    assert.equal(purged, 0);
    assert.deepEqual(
      data.movements.map((m: { id: string; amount: number; category: string }) => [m.id, m.amount, m.category]).sort(),
      [['m1', 12000.01, 'Vivienda'], ['m2', 30000, 'Salario']],
    );
    assert.equal(data.movements.find((m: { id: string }) => m.id === 'm1').createdAt, '2026-01-01T10:00:00.000Z');
    assert.deepEqual(data.budgets, [{ category: 'Alimentación', amount: 4000 }]);
    assert.equal(data.rules[0].pattern, 'oxxo');
    assert.deepEqual(data.categories, { ingreso: ['Bonos'], egreso: [] });

    const ajeno = (await call('GET', '/api/data', otro.token)).json().data;
    assert.equal(ajeno.movements.length, 0);
    assert.equal(ajeno.budgets.length, 0);

    // Otro usuario con el mismo id de movimiento no pisa el de Ana
    await call('POST', '/api/data/changes', otro.token, {
      upsert: { movements: [{ id: 'm1', type: 'egreso', category: 'Otro', amount: 1, date: today }] },
      remove: {},
    });
    const deAna = (await call('GET', '/api/data', ana.token)).json().data;
    assert.equal(deAna.movements.find((m: { id: string }) => m.id === 'm1').amount, 12000.01);
  });

  it('actualiza, elimina y borra movimientos de más de 2 años', async () => {
    const { token } = await register('gabo@correo.mx');
    await call('POST', '/api/data/changes', token, {
      upsert: {
        movements: [
          { id: 'a', type: 'egreso', category: 'Vivienda', amount: 10, date: today },
          { id: 'b', type: 'egreso', category: 'Vivienda', amount: 20, date: today },
          { id: 'viejo', type: 'egreso', category: 'Vivienda', amount: 30, date: '2020-01-01' },
        ],
        budgets: [{ category: 'Vivienda', amount: 100 }],
      },
      remove: {},
    });
    await call('POST', '/api/data/changes', token, {
      upsert: { movements: [{ id: 'a', type: 'egreso', category: 'Vivienda', amount: 15, date: today }] },
      remove: { movements: ['b'], budgets: ['vivienda'] },
    });
    const { data, purged } = (await call('GET', '/api/data', token)).json();
    assert.equal(purged, 1);
    assert.deepEqual(data.movements.map((m: { id: string; amount: number }) => [m.id, m.amount]), [['a', 15]]);
    assert.deepEqual(data.budgets, []);
  });

  it('exige sesión, rechaza formatos inválidos e ignora colecciones desconocidas', async () => {
    assert.equal((await call('GET', '/api/data')).statusCode, 401);
    const { token } = await register('hugo@correo.mx');
    assert.equal((await call('POST', '/api/data/changes', token, { upsert: { movements: 'x' }, remove: {} })).statusCode, 400);
    assert.equal((await call('POST', '/api/data/changes', token, { upsert: {} })).statusCode, 400);
    assert.equal((await call('POST', '/api/data/changes', token, { upsert: { usuarios: [{}] }, remove: {} })).statusCode, 204);
  });
});

describe('CORS', () => {
  it('solo permite el origen configurado', async () => {
    const allowed = await app.inject({ method: 'OPTIONS', url: '/api/data', headers: { origin: 'https://mi-app.netlify.app', 'access-control-request-method': 'GET' } });
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://mi-app.netlify.app');
    const denied = await app.inject({ method: 'OPTIONS', url: '/api/data', headers: { origin: 'https://otro.com', 'access-control-request-method': 'GET' } });
    assert.notEqual(denied.headers['access-control-allow-origin'], 'https://otro.com');
  });
});
