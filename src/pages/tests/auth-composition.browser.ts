import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const outputDir = '/tmp/kindra-auth-composition';
mkdirSync(outputDir, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-auth-composition-'));
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'auth-composition-fixtures', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/auth/me') { res.statusCode = 401; res.end('{}'); return; }
      res.end('{}');
    });
  },
}], server: { host: '127.0.0.1', port: 0, watch: null }, appType: 'spa' });

try {
  await vite.listen();
  const url = vite.resolvedUrls!.local[0];
  assert.ok(existsSync(binary), `Chromium ausente: ${binary}`);
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk; });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) { if (browser.exitCode !== null) throw new Error(stderr.slice(-500)); await delay(100); }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; assert.ok(endpoint);
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find((target: { type: string }) => target.type === 'page').webSocketDebuggerUrl); await once(socket, 'open');
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
  });
  function send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${method}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 150; i++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error(`Timeout ${expression}`);
  }
  await send('Runtime.enable'); await send('Page.enable');
  for (const page of ['login', 'register'] as const) {
    await send('Page.navigate', { url: `${url}${page}` });
    await wait(`!!document.querySelector('.${page}-guardian img') && !!document.querySelector('.${page}-form')`);
    for (const [width, height] of [[360, 740], [390, 844], [430, 900], [1280, 900], [1600, 900]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await delay(180);
      const geometry = await evaluate<{ overflow: boolean; guardian: { left: number; right: number; bottom: number }; intro: { left: number; right: number }; formTop: number }>(`(() => {
        const guardian = document.querySelector('.${page}-guardian').getBoundingClientRect();
        const intro = document.querySelector('.${page}-intro').getBoundingClientRect();
        const form = document.querySelector('.${page}-form').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          guardian: { left: guardian.left, right: guardian.right, bottom: guardian.bottom },
          intro: { left: intro.left, right: intro.right }, formTop: form.top };
      })()`);
      assert.equal(geometry.overflow, false, `${page} ${width}: horizontal overflow`);
      assert.ok(geometry.guardian.left >= geometry.intro.right - 2, `${page} ${width}: Guardian cobre o título`);
      if (width < 600) assert.ok(geometry.guardian.bottom <= geometry.formTop + 2, `${page} ${width}: Guardian cobre o formulário`);
      const metrics = await send('Page.getLayoutMetrics');
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
      writeFileSync(path.join(outputDir, `${page}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
  console.log(`PASS Auth composition: Login/Register 360/390/430/laptop/desktop without guardian overlap or horizontal overflow; screenshots ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
