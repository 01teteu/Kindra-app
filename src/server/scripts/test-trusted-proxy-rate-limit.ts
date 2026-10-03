import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { resolveTrustedProxies } from '../security/trusted-proxies.js';

assert.equal(resolveTrustedProxies(undefined), false);
assert.deepEqual(resolveTrustedProxies('127.0.0.1/32, 2001:db8::1'), ['127.0.0.1/32', '2001:db8::1']);
for (const invalid of ['', ' ', '*', 'true', 'localhost', '127.0.0.1,', '127.0.0.1/33',
  '127.0.0.1/0', '::/0', '127.0.0.1/-1', '192.0.2.1/24/1', 'fe80::1%eth0']) {
  assert.throws(() => resolveTrustedProxies(invalid), /TRUSTED_PROXIES/, invalid);
}

async function appWithProxy(value: string | undefined) {
  const app = Fastify({ trustProxy: resolveTrustedProxies(value) });
  await app.register(rateLimit, { max: 2, timeWindow: '1 minute' });
  app.get('/identity', request => ({ ip: request.ip }));
  return app;
}

const direct = await appWithProxy(undefined);
try {
  const send = (forwardedFor: string) => direct.inject({
    method: 'GET', url: '/identity', remoteAddress: '203.0.113.10',
    headers: { 'x-forwarded-for': forwardedFor },
  });
  assert.equal((await send('198.51.100.1')).json().ip, '203.0.113.10');
  assert.equal((await send('198.51.100.2')).json().ip, '203.0.113.10');
  assert.equal((await send('198.51.100.3')).statusCode, 429);
  assert.equal((await send('198.51.100.4')).statusCode, 429);
} finally { await direct.close(); }

const proxied = await appWithProxy('127.0.0.1/32');
try {
  const send = (remoteAddress: string, forwardedFor: string) => proxied.inject({
    method: 'GET', url: '/identity', remoteAddress,
    headers: { 'x-forwarded-for': forwardedFor },
  });
  assert.equal((await send('127.0.0.1', '198.51.100.10')).json().ip, '198.51.100.10');
  assert.equal((await send('127.0.0.1', '198.51.100.10')).json().ip, '198.51.100.10');
  assert.equal((await send('127.0.0.1', '198.51.100.10')).statusCode, 429);
  assert.equal((await send('127.0.0.1', '198.51.100.11')).json().ip, '198.51.100.11');
  assert.equal((await send('203.0.113.20', '198.51.100.12')).json().ip, '203.0.113.20');
  assert.equal((await send('203.0.113.20', '198.51.100.13')).json().ip, '203.0.113.20');
  assert.equal((await send('203.0.113.20', '198.51.100.14')).statusCode, 429);
} finally { await proxied.close(); }

const startup = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
  env: {
    ...process.env, NODE_ENV: 'production', TRUSTED_PROXIES: 'not-an-ip',
    JWT_SECRET: randomBytes(32).toString('base64'),
    AUTH_CODE_HMAC_SECRET: randomBytes(32).toString('base64'),
    BREVO_API_KEY: 'xkeysib-proxy-test-only', EMAIL_FROM: 'Kindra <no-reply@mail.kindrafit.com>',
    APP_URL: 'https://kindra.example.test',
  },
  encoding: 'utf8', timeout: 15000,
});
assert.notEqual(startup.status, 0);
assert.match(startup.stderr, /TRUSTED_PROXIES/);

console.log('PASS AUD-02: proxy desabilitado por padrão, configuração validada e rate limit vinculado ao IP confiável.');
