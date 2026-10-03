import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-email-ui-'));
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let releaseRequest: (() => void) | undefined;
let registerRequests = 0;
let verificationResends = 0;
let forgotRequests = 0;
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'email-flow-fixtures', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/auth/me') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }
      if (req.url === '/api/users/register') {
        registerRequests++;
        void new Promise<void>(resolve => { releaseRequest = resolve; }).then(() => {
          res.statusCode = 202;
          res.end(JSON.stringify({ message: 'Se este endereço puder ser cadastrado, enviaremos instruções para continuar.' }));
        });
        return;
      }
      if (req.url === '/api/auth/forgot-password') {
        forgotRequests++;
        res.end(JSON.stringify({ message: 'Se houver uma conta elegível, enviaremos instruções.' }));
        return;
      }
      if (req.url === '/api/auth/verify-email/send') {
        verificationResends++;
        res.end(JSON.stringify({ message: 'Se este endereço puder ser verificado, enviaremos instruções.' }));
        return;
      }
      res.end('{}');
    });
  },
}], server: { host: '127.0.0.1', port: 0, watch: null }, appType: 'spa' });

try {
  await vite.listen();
  assert.ok(existsSync(binary), `Chromium ausente: ${binary}`);
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk; });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) {
    if (browser.exitCode !== null) throw new Error(stderr.slice(-500));
    await delay(100);
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  assert.ok(endpoint);
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find((target: { type: string }) => target.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map<number, (value: any) => void>();
  const runtimeErrors: string[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); handler(message); }
  });
  function send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${method}`)); }, 15000);
      pending.set(id, message => { clearTimeout(timeout); message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result); });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    let response;
    try { response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); }
    catch (error) { throw new Error(`${String(error)} while evaluating ${expression.slice(0, 120)}`); }
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error(`Timeout ${expression}`);
  }
  const base = vite.resolvedUrls!.local[0];
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `${base}register` });
  await wait("document.querySelector('input[type=email]') && document.body.innerText.includes('Cadastrar')");
  await evaluate(`(() => {
    const input = document.querySelector('input[type=email]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'teste@example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('input[type=checkbox]').click();
  })()`);
  await wait("!document.querySelector('button[type=submit]').disabled");
  await evaluate("document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit();");
  await wait("document.querySelector('button[type=submit]').disabled");
  assert.equal(registerRequests, 1, 'Cadastro não envia duas requisições simultâneas');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Cadastro sem overflow em 390 px');
  releaseRequest?.();
  await wait("location.pathname === '/verify-email'");
  await wait("document.body.innerText.includes('Confira seu e-mail')");
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Verificação sem overflow em 390 px');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Reenviar código')).click(); [...document.querySelectorAll('button')].find(button => button.textContent.includes('Reenviar código'))?.click();");
  await wait("document.body.innerText.includes('Reenviar em')");
  assert.equal(verificationResends, 1, 'Reenvio de verificação não duplica requisições');
  await send('Page.navigate', { url: `${base}forgot-password` });
  await wait("!!document.querySelector('input[type=email]')");
  await evaluate(`(() => {
    const input = document.querySelector('input[type=email]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'teste@example.com');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit();");
  await wait("document.body.innerText.includes('Etapa 2 de 3')");
  assert.equal(forgotRequests, 1, 'Recuperação não envia duas requisições simultâneas');
  assert.ok(await evaluate("document.body.innerText.includes('Pedir outro código em')"), 'Cooldown de reenvio visível');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Recuperação sem overflow em 390 px');
  for (const width of [1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `Recuperação sem overflow em ${width} px`);
  }
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS email browser: cadastro/verificação/recuperação sem envio duplo, loading, cooldown e larguras 390/1024/1440 px');
} finally {
  releaseRequest?.();
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close();
  rmSync(profile, { recursive: true, force: true });
}
