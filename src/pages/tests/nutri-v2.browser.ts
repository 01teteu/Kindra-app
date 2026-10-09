import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const outputDir = '/tmp/kindra-nutri-v2';
mkdirSync(outputDir, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-nutri-v2-'));
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
const requests: string[] = [];
const today = new Date().toISOString();
const meals = [{ id: 'meal-1', name: 'BREAKFAST', loggedAt: today, entries: [{ id: 'entry-1', amountGrams: 150, food: { id: 'food-1', name: 'Aveia', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 } }] }];
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'nutri-v2-fixtures', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      requests.push(`${req.method} ${req.url}`);
      res.setHeader('Content-Type', 'application/json');
      let data: unknown = [];
      if (req.url.startsWith('/api/nutrition/goals/current')) data = { id: 'goal-1', userId: 'user-1', targetKcal: 2200, targetProteinG: 140, targetCarbsG: 260, targetFatG: 70, targetWaterMl: 2400 };
      else if (req.url.startsWith('/api/nutrition/history/consolidate')) data = { currentStreak: 5, history: [] };
      else if (req.url.startsWith('/api/meals?')) data = meals;
      else if (req.url.startsWith('/api/foods')) data = [];
      else if (req.url.startsWith('/api/nutrition/water?')) data = [];
      else if (req.url.startsWith('/api/nutrition/weight')) data = [];
      res.end(JSON.stringify(data));
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
  const runtimeErrors: string[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
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
  async function capture(name: string, width: number, height: number) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(180);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${name}: horizontal overflow`);
    const metrics = await send('Page.getLayoutMetrics');
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
    writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${url}nutri` });
  await wait("!!document.querySelector('#panel-diario')");
  await evaluate("document.querySelector('#panel-diario button')?.click()");
  await wait("!!document.querySelector('.nutri-records-link')");
  assert.equal(await evaluate("document.querySelector('.nutri-energy-value strong')?.textContent"), '2.050');
  assert.equal(await evaluate("document.querySelector('.nutri-records-link p')?.textContent?.includes('1 alimento registrado hoje')"), true);
  assert.ok(requests.some(value => value.startsWith('POST /api/nutrition/history/consolidate')));
  await capture('desktop', 1440, 900); await capture('mobile-360', 360, 800); await capture('mobile-390', 390, 844); await capture('mobile-430', 430, 900);
  await evaluate("document.querySelector('.nutri-records-link')?.click()");
  await wait("location.pathname === '/nutri/registros' && !!document.querySelector('.nutrition-meal-card')");
  assert.equal(await evaluate("document.body.innerText.includes('Aveia')"), true);
  await capture('records-mobile', 390, 844);
  await evaluate("document.querySelector('.nutrition-meal-add')?.click()");
  await wait("!!document.querySelector('[aria-label=\"Adicionar alimento\"]')");
  await evaluate("document.querySelector('[aria-label=\"Fechar busca de alimentos\"]')?.click()");
  await evaluate("document.querySelector('.nutri-back-link')?.click()");
  await wait("location.pathname === '/nutri' && !!document.querySelector('#tab-hidratacao')");
  await evaluate("document.querySelector('#tab-hidratacao')?.click()");
  await wait("!!document.querySelector('#panel-hidratacao')");
  await evaluate("document.querySelector('#panel-hidratacao button')?.click()");
  await wait("!!document.querySelector('.nutrition-water-card')");
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS Nutri V2 browser: totals, records navigation, hydration tab, responsive widths; screenshots ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
