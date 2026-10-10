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

const outputDir = '/tmp/kindra-workout-v2';
mkdirSync(outputDir, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-workout-v2-'));
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const plansByUser = new Map<string, any[]>();
const requests: { path: string; body?: any }[] = [];
const routines = [
  { id: 'routine-1', name: 'Treino de força A', exerciseCount: 5 },
  { id: 'routine-2', name: 'Rotina de membros inferiores com nome extenso', exerciseCount: 6 },
  { id: 'routine-3', name: 'Mobilidade', exerciseCount: 0 },
];
let currentUserId = 'user-a';
let browserToday = 'MONDAY';
let failPlans = false;
let plansDelayMs = 0;
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;

const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'workout-v2-fixtures', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/auth/me') { res.end(JSON.stringify({ id: currentUserId, hasProfile: true })); return; }
      if (req.url === '/api/workouts/plans' && req.method === 'GET') {
        if (plansDelayMs) await delay(plansDelayMs);
        if (failPlans) { res.statusCode = 503; res.end(JSON.stringify({ error: 'Falha simulada.' })); return; }
        res.end(JSON.stringify(plansByUser.get(currentUserId) ?? [])); return;
      }
      if (req.url === '/api/workouts/routines?summary=true') { res.end(JSON.stringify(routines)); return; }
      if (req.method === 'POST' && (req.url === '/api/workouts/plans' || req.url === '/api/workouts/plans/generate')) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString());
        requests.push({ path: req.url, body });
        const generated = req.url.endsWith('/generate');
        const plan = { id: `plan-${currentUserId}`, name: generated ? 'Base inicial' : body.name, source: generated ? 'GENERATED' : 'CUSTOM', isActive: true,
          days: generated ? [{ id: 'day-1', dayOfWeek: browserToday, routineId: routines[0].id, routine: routines[0] },
            { id: 'day-2', dayOfWeek: 'MONDAY', routineId: routines[1].id, routine: routines[1] }] : [] };
        plansByUser.set(currentUserId, [plan]);
        res.end(JSON.stringify(plan)); return;
      }
      res.statusCode = 404; res.end('{}');
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
  async function click(selector: string) { await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`); }
  async function capture(name: string, width: number, height: number) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(160);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${name}: horizontal overflow`);
    const layout = await send('Page.getLayoutMetrics');
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: layout.cssContentSize.height, scale: 1 } });
    writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Fortaleza' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `${url}workout` });
  await wait("!!document.querySelector('.weekly-welcome') && !!document.querySelector('.weekly-empty')");
  browserToday = await evaluate("['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()]");
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 1);
  await capture('welcome-first-390', 390, 844);
  await click('.weekly-welcome-top button');
  await wait("!document.querySelector('dialog[open]')");
  assert.equal(await evaluate("localStorage.getItem('kindra:workout-welcome:v1:user-a')"), null);
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-welcome') && !!document.querySelector('dialog[open]')");
  await click('.weekly-welcome-later');
  assert.equal(await evaluate("localStorage.getItem('kindra:workout-welcome:v1:user-a')"), null);
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-welcome-choices button') && !!document.querySelector('dialog[open]')");
  await click('.weekly-welcome-choices button:nth-child(2)');
  await wait("!!document.querySelector('.weekly-editor input[aria-label=\"Nome do plano\"]') && !!document.querySelector('dialog[open]')");
  assert.equal(await evaluate("localStorage.getItem('kindra:workout-welcome:v1:user-a')"), 'seen');
  await evaluate("document.querySelector('.weekly-editor input')?.focus()");
  await send('Input.insertText', { text: 'Minha semana' });
  await click('.weekly-editor button[type="submit"]');
  await wait("!!document.querySelector('.weekly-plan-select') && !document.querySelector('dialog[open]')");
  assert.deepEqual(requests.at(-1), { path: '/api/workouts/plans', body: { name: 'Minha semana', source: 'CUSTOM' } });
  assert.equal(await evaluate("document.querySelector('.weekly-today h2')?.textContent"), 'Hoje é descanso');
  await capture('rest-390', 390, 844);
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-plan-select')");
  assert.equal(await evaluate("!!document.querySelector('dialog[open]')"), false, 'Escolha manual persistida');

  currentUserId = 'user-b';
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-welcome-choices button') && !!document.querySelector('dialog[open]')");
  await click('.weekly-welcome-choices button:first-child');
  await wait("!!document.querySelector('.weekly-editor select[aria-label=\"Dias por semana\"]') && !!document.querySelector('dialog[open]')");
  assert.equal(await evaluate("localStorage.getItem('kindra:workout-welcome:v1:user-b')"), 'seen');
  await evaluate("(() => { const el = document.querySelector('.weekly-editor select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '3'); el.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await click('.weekly-equipment input');
  await click('.weekly-editor button[type="submit"]');
  await wait("!!document.querySelector('.weekly-today h2') && document.querySelector('.weekly-today h2').textContent.includes('Treino de força A')");
  assert.deepEqual(requests.at(-1), { path: '/api/workouts/plans/generate', body: { trainingDaysPerWeek: 3, equipment: ['MACHINE'] } });
  assert.equal(await evaluate("document.querySelectorAll('.weekly-day').length"), 7);
  assert.equal(await evaluate("document.querySelectorAll('.weekly-routine-row').length"), 3);
  assert.equal(await evaluate("document.querySelector('.weekly-today-detail')?.textContent?.includes('5 exercícios')"), true);
  assert.equal(await evaluate("document.querySelector('.weekly-guardian')?.complete"), true);
  await capture('active-360', 360, 720);
  await capture('active-390', 390, 844);
  await capture('active-430', 430, 900);
  await capture('active-laptop', 1280, 800);
  await capture('active-desktop', 1600, 900);
  await click('.weekly-new-plan');
  await wait("!!document.querySelector('.weekly-editor input[aria-label=\"Nome do plano\"]') && !!document.querySelector('dialog[open]')");
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-day[data-weekday=\"MONDAY\"]')");
  await click('.weekly-day[data-weekday="MONDAY"]');
  await wait("!!document.querySelector('.weekly-editor') && !!document.querySelector('dialog[open]')");
  async function checkNavigation(selector: string, destination: string) {
    await send('Page.navigate', { url: `${url}workout` });
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await click(selector);
    await wait(`location.pathname === ${JSON.stringify(destination)}`);
  }
  await checkNavigation('.weekly-new-routine', '/routines/new');
  await checkNavigation('.weekly-routine-row:first-child .weekly-routine', '/workout/live');
  assert.equal(await evaluate("location.search"), '?routineId=routine-1');
  await checkNavigation('.weekly-routine-row:first-child button[aria-label^="Editar"]', '/routines/routine-1/edit');
  await checkNavigation('.weekly-free button', '/workout/live');
  await checkNavigation('.weekly-catalog', '/workout/exercises');
  await checkNavigation('.weekly-evolution-entry', '/workout/progress');
  await send('Page.navigate', { url: `${url}workout` });
  await wait("!!document.querySelector('.weekly-guardian')");
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.weekly-guardian')).animationName"), 'none');
  assert.equal(await evaluate("[...document.querySelectorAll('.weekly-page button')].filter(el => el.getBoundingClientRect().height > 0).every(el => el.getBoundingClientRect().height >= 44)"), true);
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-today h2')");
  assert.equal(await evaluate("!!document.querySelector('dialog[open]')"), false, 'Escolha automática persistida');
  plansDelayMs = 300;
  await send('Page.reload', { ignoreCache: true });
  await wait("document.body.textContent.includes('Carregando sua semana')");
  plansDelayMs = 0;
  await wait("!!document.querySelector('.weekly-today h2')");
  failPlans = true;
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.weekly-error[role=alert]')");
  failPlans = false;
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS Workout V2 browser: first-use, close/later, manual/generate payloads, per-user storage, rest/active, 7 days, plans/routines/secondary routes, loading/error, responsive widths, reduced motion; screenshots ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
