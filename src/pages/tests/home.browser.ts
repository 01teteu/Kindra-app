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

const outputDir = '/tmp/kindra-home';
mkdirSync(outputDir, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-home-'));
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let scenario: 'normal' | 'no-plan' | 'meals-error' | 'water-error' | 'no-profile' = 'normal';
const requests: string[] = [];
const consolidationMethods: string[] = [];
const today = new Date().toISOString();
const plan = { id: 'plan-1', name: 'Minha semana', source: 'CUSTOM', isActive: true, days: [{ id: 'day-1', dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(), routineId: 'routine-1', routine: { id: 'routine-1', name: 'Força A', exerciseCount: 4 } }] };
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'home-fixtures', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      requests.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      let data: unknown = [];
      if (req.url.startsWith('/api/auth/me')) data = scenario === 'no-profile' ? { hasProfile: false } : { hasProfile: true, profile: { firstName: 'Alex' } };
      else if (req.url.startsWith('/api/auth/logout')) data = {};
      else if (req.url.startsWith('/api/nutrition/goals/current')) data = { id: 'g', targetKcal: 2200, targetProteinG: 140, targetCarbsG: 260, targetFatG: 70, targetWaterMl: 2400 };
      else if (req.url.startsWith('/api/nutrition/history/consolidate')) { consolidationMethods.push(req.method ?? ''); data = { currentStreak: 5, history: [] }; }
      else if (req.url.startsWith('/api/nutrition/history')) data = { currentStreak: 5, history: [] };
      else if (req.url.startsWith('/api/meals?')) {
        if (scenario === 'meals-error') { res.statusCode = 500; res.end(JSON.stringify({ error: 'fixture' })); return; }
        data = [{ id: 'meal', name: 'BREAKFAST', loggedAt: today, entries: [{ id: 'e', amountGrams: 150, food: { id: 'f', name: 'Aveia', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 } }] }];
      } else if (req.url.startsWith('/api/nutrition/water?')) {
        if (scenario === 'water-error') { res.statusCode = 500; res.end(JSON.stringify({ error: 'fixture' })); return; }
        data = [{ id: 'w', amountMl: 500, loggedAt: today }, { id: 'w2', amountMl: 250, loggedAt: today }];
      } else if (req.url.startsWith('/api/workouts/plans/active')) data = scenario === 'no-plan' ? null : plan;
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
  async function load() {
    await send('Page.navigate', { url: `${url}home` });
    await wait("!!document.querySelector('.home-streak') || location.pathname === '/onboarding'");
    await wait("location.pathname === '/onboarding' || document.querySelector('.home-streak-count strong')?.textContent === '5'");
  }
  async function capture(name: string, width: number, height: number) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${name}: horizontal overflow`);
    const metrics = await send('Page.getLayoutMetrics');
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
    writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(image.data, 'base64'));
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Fortaleza' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await load();
  await wait("document.querySelector('.home-plan-message h3')?.textContent === 'Força A'");
  assert.ok(requests.some(url => url.startsWith('/api/nutrition/history/consolidate')), 'Home solicita a consolidação explícita');
  assert.equal(consolidationMethods[0], 'POST');
  assert.equal(await evaluate("document.querySelector('.home-food-kcal strong').textContent"), '150');
  assert.equal(await evaluate("document.querySelector('.home-water-total strong').textContent"), '750');
  assert.equal(await evaluate("document.querySelector('.home-streak-count strong').textContent"), '5');
  await capture('desktop', 1440, 1000); await capture('tablet', 1024, 900); await capture('mobile', 390, 844);
  scenario = 'no-plan'; await load(); await wait("document.body.innerText.includes('Você ainda não tem um plano semanal ativo.')");
  scenario = 'meals-error'; await load(); await wait("document.body.innerText.includes('Não foi possível carregar suas refeições.')");
  assert.ok(await evaluate("document.querySelector('.home-streak-count strong')?.textContent === '5' && document.querySelector('.home-water-total strong')?.textContent === '750'"), 'Falha de refeições isolada');
  scenario = 'water-error'; await load(); await wait("document.body.innerText.includes('Não foi possível carregar sua hidratação.')");
  assert.ok(await evaluate("document.querySelector('.home-food-kcal strong')?.textContent === '150'"), 'Falha de água isolada');
  scenario = 'no-profile'; await load();
  assert.equal(await evaluate('location.pathname'), '/onboarding');
  scenario = 'normal'; await load();
  await evaluate("document.querySelector('[aria-label=\"Sair da conta\"]').click()"); await wait("location.pathname === '/login'");
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS Home browser: auth/onboarding/logout, ordering, section errors, data and responsive widths; screenshots ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
