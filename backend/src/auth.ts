import express from 'express';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';
const derive = promisify(scrypt);
const cookie = '__Host-assessment_session';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function authConfig(env = process.env) {
  if (env.AUTH_ENABLED === undefined || env.AUTH_ENABLED === 'false') return null;
  if (env.AUTH_ENABLED !== 'true') throw new Error('AUTH_ENABLED must be true or false');
  const { AUTH_USERNAME: username, AUTH_PASSWORD_HASH: hash, PUBLIC_ORIGIN: origin } = env;
  if (!username || !hash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) || !origin) throw new Error('Incomplete authentication configuration');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin');
  return { username, hash, origin };
}
function token(req: any) {
  const values = (req.headers.cookie || '').split(';').map((s: string) => s.trim()).filter((s: string) => s.startsWith(`${cookie}=`));
  const value = values.length === 1 ? values[0].slice(cookie.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
export async function installAuth(http: any) {
  const config = authConfig();
  if (!config) {
    http.get('/auth/session', (_: any, res: any) => res.set('Cache-Control', 'no-store').json({ enabled: false }));
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(725010)');
    await client.query(`CREATE TABLE IF NOT EXISTS reviewer_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS reviewer_attempts (key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL)`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  const guard = (handler: any) => async (req: any, res: any, next: any) => {
    try { await handler(req, res, next); } catch { res.status(503).json({ error: 'Authentication unavailable' }); }
  };
  http.use('/auth', (_: any, res: any, next: any) => { res.set('Cache-Control', 'no-store'); next(); });
  const origin = (req: any, res: any, next: any) => req.get('Origin') === config.origin ? next() : res.sendStatus(403);
  http.post('/auth/login', origin, express.json({ limit: '2kb' }), guard(async (req: any, res: any) => {
    await db.query('DELETE FROM reviewer_sessions WHERE expires_at <= now()');
    await db.query('DELETE FROM reviewer_attempts WHERE expires_at <= now()');
    // ponytail: global demo throttle also bounds proxy-address buckets; use trusted per-client limits for larger deployments.
    for (const [key, limit] of [['global', 30], [digest(req.socket.remoteAddress || 'unknown'), 10]] as const) {
      const result = await db.query(`INSERT INTO reviewer_attempts(key,attempts,expires_at) VALUES($1,1,now()+interval '1 minute')
        ON CONFLICT(key) DO UPDATE SET attempts=reviewer_attempts.attempts+1 RETURNING attempts`, [key]);
      if (result.rows[0].attempts > limit) { res.set('Retry-After', '60').sendStatus(429); return; }
    }
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256) { res.sendStatus(400); return; }
    const [salt, expected] = config.hash.split(':');
    const actual = await derive(password, salt, 64) as Buffer;
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || username !== config.username) { res.status(401).json({ error: 'Invalid username or password' }); return; }
    const value = randomBytes(32).toString('hex');
    await db.query("INSERT INTO reviewer_sessions VALUES($1,now()+interval '8 hours')", [digest(value)]);
    res.cookie(cookie, value, { ...cookieOptions, maxAge: 8 * 3600 * 1000 }).json({ authenticated: true });
  }));
  const requireSession = guard(async (req: any, res: any, next: any) => {
    const value = token(req);
    if (!value || !(await db.query('SELECT 1 FROM reviewer_sessions WHERE token_hash=$1 AND expires_at>now()', [digest(value)])).rowCount) { res.sendStatus(401); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== config.origin) { res.sendStatus(403); return; }
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  http.get('/auth/session', requireSession, (_: any, res: any) => res.json({ enabled: true, authenticated: true }));
  http.post('/auth/logout', origin, requireSession, guard(async (req: any, res: any) => {
    await db.query('DELETE FROM reviewer_sessions WHERE token_hash=$1', [digest(token(req))]);
    res.clearCookie(cookie, cookieOptions).sendStatus(204);
  }));
  http.use(['/graphql', '/media'], requireSession);
}
