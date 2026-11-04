import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

type ScryptParams = { N: number; r: number; p: number; maxmem: number };
const scrypt = (password: string, salt: Buffer, keylen: number, params: ScryptParams) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, params, (err, key) => (err ? reject(err) : resolve(key))),
  );

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

/** Formato: `scrypt$N$r$p$salt$hash` (base64). Guardar los parámetros permite endurecerlos después sin invalidar contraseñas. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(key, expected);
}

/** Hash para comparar en un login con correo inexistente: así tarda lo mismo y no revela qué correos existen. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** En la base solo se guarda el hash: una copia filtrada de la tabla no sirve para iniciar sesión. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
