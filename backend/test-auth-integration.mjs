import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes, scryptSync } from 'node:crypto';
import { installAuth } from './dist/auth.js';
import { db } from './dist/db.js';
const password = randomBytes(24).toString('hex');
const salt = randomBytes(16).toString('hex');
Object.assign(process.env, { AUTH_ENABLED: 'true', AUTH_USERNAME: 'test-reviewer', AUTH_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`, PUBLIC_ORIGIN: 'https://review.example.test' });
const servers = [];
try {
  for (let i = 0; i < 2; i++) {
    const app = express();
    await installAuth(app);
    app.all('/graphql', (_, res) => res.json({ ok: true }));
    app.get('/media/test.mp4', (_, res) => res.send('test-media'));
    servers.push(await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }));
  }
  const bases = servers.map(s => `http://127.0.0.1:${s.address().port}`);
  const headers = { Origin: process.env.PUBLIC_ORIGIN, 'Content-Type': 'application/json' };
  const login = (pwd, extra = {}) => fetch(`${bases[0]}/auth/login`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ username: 'test-reviewer', password: pwd }) });
  for (const base of bases) {
    assert.equal((await fetch(`${base}/graphql`)).status, 401);
    assert.equal((await fetch(`${base}/media/test.mp4`)).status, 401);
  }
  assert.equal((await login(password, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await login('incorrect')).status, 401);
  const response = await login(password);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(attribute));
  const session = cookie.split(';')[0];
  for (const base of bases) {
    assert.equal((await fetch(`${base}/auth/session`, { headers: { Cookie: session } })).status, 200);
    assert.equal((await fetch(`${base}/media/test.mp4`, { headers: { Cookie: session } })).status, 200);
    assert.equal((await fetch(`${base}/graphql`, { method: 'POST', headers: { Cookie: session, ...headers }, body: '{}' })).status, 200);
    assert.equal((await fetch(`${base}/graphql`, { method: 'POST', headers: { Cookie: session }, body: '{}' })).status, 403);
  }
  assert.equal((await fetch(`${bases[1]}/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: session } })).status, 204);
  assert.equal((await fetch(`${bases[0]}/auth/session`, { headers: { Cookie: session } })).status, 401);
  for (let i = 0; i < 10; i++) await login('incorrect');
  assert.equal((await login(password)).status, 429);
  console.log('PASS two-instance shared sessions, anonymous denial, password, origin, cookie flags, logout and throttle');
} finally {
  await Promise.all(servers.map(s => new Promise(resolve => { s.close(resolve); s.closeAllConnections(); })));
  await db.end();
}
