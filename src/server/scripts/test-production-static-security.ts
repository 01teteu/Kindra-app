/** SEC-08: the real production server must expose only the Vite browser build. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(existsSync('dist/index.html'), 'Frontend de produção ausente; execute npm run build.');
assert.ok(existsSync('server-dist/server.cjs'), 'Bundle privado ausente; execute npm run build.');
assert.ok(existsSync('server-dist/server.cjs.map'), 'Sourcemap privado ausente; execute npm run build.');
assert.equal(existsSync('dist/server.cjs'), false);
assert.equal(existsSync('dist/server.cjs.map'), false);
assert.deepEqual(readdirSync('dist').filter(name => name.startsWith('server.')), []);

let server: ChildProcess | undefined;
try {
  const authCodeSecret = randomBytes(32).toString('base64');
  const jwtSecret = randomBytes(32).toString('base64');
  async function expectRejectedEnvironment(overrides: NodeJS.ProcessEnv, expected: RegExp) {
    const rejected = spawn(process.execPath, ['server-dist/server.cjs'], {
      env: { ...process.env, NODE_ENV: 'production',
        BREVO_API_KEY: 'xkeysib-static-security-test-only',
        EMAIL_FROM: 'Kindra <no-reply@mail.kindrafit.com>', APP_URL: 'https://kindra.example.test',
        ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let rejectedOutput = '';
    rejected.stdout!.on('data', chunk => { rejectedOutput += chunk.toString(); });
    rejected.stderr!.on('data', chunk => { rejectedOutput += chunk.toString(); });
    const [rejectedCode] = await once(rejected, 'exit');
    assert.notEqual(rejectedCode, 0);
    assert.match(rejectedOutput, expected);
  }

  await expectRejectedEnvironment(
    { JWT_SECRET: jwtSecret, AUTH_CODE_HMAC_SECRET: '' },
    /AUTH_CODE_HMAC_SECRET é obrigatório em produção/,
  );

  async function expectRejectedJwtSecret(jwtSecret: string, expected: RegExp) {
    const env: NodeJS.ProcessEnv = {
      AUTH_CODE_HMAC_SECRET: authCodeSecret,
      JWT_SECRET: jwtSecret,
    };
    await expectRejectedEnvironment(env, expected);
  }

  await expectRejectedJwtSecret('', /JWT_SECRET é obrigatório em produção/);
  await expectRejectedJwtSecret('change_me', /JWT_SECRET inválido em produção/);
  await expectRejectedJwtSecret('not valid base64!', /JWT_SECRET deve ser Base64 válido/);
  await expectRejectedJwtSecret(Buffer.alloc(16, 1).toString('base64'), /JWT_SECRET deve ser Base64 válido com pelo menos 32 bytes/);

  server = spawn(process.execPath, ['server-dist/server.cjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: jwtSecret,
      COOKIE_SECRET: process.env.COOKIE_SECRET || 'sec08-test-cookie-secret-with-sufficient-length',
      AUTH_CODE_HMAC_SECRET: authCodeSecret,
      BREVO_API_KEY: 'xkeysib-static-security-test-only',
      EMAIL_FROM: 'Kindra <no-reply@mail.kindrafit.com>', APP_URL: 'https://kindra.example.test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout!.on('data', chunk => { output += chunk.toString(); });
  server.stderr!.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100 && !output.includes('Servidor rodando'); attempt++) {
    if (server.exitCode !== null) throw new Error('Servidor de produção encerrou durante a inicialização.');
    await delay(100);
  }
  assert.match(output, /Servidor rodando/);

  const request = (pathname: string, accept = '*/*') => fetch(`http://127.0.0.1:3000${pathname}`, { headers: { accept } });
  const home = await request('/', 'text/html');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type') ?? '', /text\/html/);
  const html = await home.text();
  const assetPath = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  assert.ok(assetPath, 'index.html não referencia um asset público versionado.');
  assert.equal((await request(assetPath)).status, 200);

  for (const route of ['/workout/progress', '/nutri', '/routines/example-id/edit']) {
    const response = await request(route, 'text/html,application/xhtml+xml');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }

  for (const pathname of [
    '/server.cjs', '/server.cjs.map', '/server-dist/server.cjs', '/server-dist/server.cjs.map',
    '/src/server/server.ts', '/package.json', '/.env', '/assets/missing.js', '/unknown-page', '/api/unknown',
  ]) {
    const response = await request(pathname, 'text/html,*/*');
    assert.equal(response.status, 404, `${pathname} deve retornar 404`);
    assert.doesNotMatch(await response.text(), /<div id="root"><\/div>/, `${pathname} não pode receber o fallback React`);
  }

  console.log('PASS SEC-08: somente frontend público; bundle/map privados; assets e rotas React preservados; internos e API desconhecida = 404.');
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
}
