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
const oatmeal = { id: 'food-1', name: 'Aveia', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 };
const longFood = { id: 'food-2', name: 'Abadejo, filé, congelado, assado com ervas e acompanhamento caseiro', kcal: 125, proteinG: 23, carbsG: 2, fatG: 3 };
let meals = [{ id: 'meal-1', name: 'BREAKFAST', loggedAt: today, entries: [{ id: 'entry-1', amountGrams: 150, food: oatmeal }] }];
let waterLogs: { id: string; amountMl: number; loggedAt: string }[] = [];
let hydrationHistory: object[] = [];
let failMeals = false;
let mealResponseDelayMs = 0;
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'nutri-v2-fixtures', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      requests.push(`${req.method} ${req.url}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/meals/entries/') && req.method === 'DELETE') {
        const entryId = req.url.split('/').pop();
        meals = meals.map(meal => ({ ...meal, entries: meal.entries.filter(entry => entry.id !== entryId) }));
        res.end('{}'); return;
      }
      if (req.url.startsWith('/api/meals/entries') && req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { category: string; amountGrams: number };
        meals = meals.map(meal => meal.name === body.category ? { ...meal, entries: [...meal.entries, { id: 'entry-added', amountGrams: body.amountGrams, food: oatmeal }] } : meal);
        res.end('{}'); return;
      }
      if (req.url.startsWith('/api/nutrition/water/') && req.method === 'DELETE') {
        const id = req.url.split('/')[4].split('?')[0];
        waterLogs = waterLogs.filter(log => log.id !== id);
        res.end('{}'); return;
      }
      if (req.url === '/api/nutrition/water' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { amountMl: number };
        const log = { id: `water-${waterLogs.length + 1}`, amountMl: body.amountMl, loggedAt: today };
        waterLogs = [log, ...waterLogs];
        res.end(JSON.stringify(log)); return;
      }
      let data: unknown = [];
      if (req.url.startsWith('/api/nutrition/goals/current')) data = { id: 'goal-1', userId: 'user-1', targetKcal: 2200, targetProteinG: 140, targetCarbsG: 260, targetFatG: 70, targetWaterMl: 2400 };
      else if (req.url.startsWith('/api/nutrition/history/consolidate')) data = { currentStreak: 5, history: hydrationHistory };
      else if (req.url.startsWith('/api/meals?')) {
        if (mealResponseDelayMs) await delay(mealResponseDelayMs);
        if (failMeals) { res.statusCode = 500; res.end('{}'); return; }
        data = meals;
      }
      else if (req.url.startsWith('/api/foods')) data = [oatmeal];
      else if (req.url.startsWith('/api/nutrition/water?')) data = waterLogs;
      else if (req.url.startsWith('/api/nutrition/weight')) data = [{ id: 'weight-1', weightKg: 75.5, loggedAt: today }];
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
    await evaluate('window.scrollTo(0, 0)');
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
  await capture('desktop', 1440, 900); await capture('mobile-360', 360, 800); await capture('mobile-390', 390, 844);
  assert.equal(await evaluate("document.querySelector('.nutrition-goal-card').getBoundingClientRect().height < 300"), true, 'Hero compacto em 390px');
  assert.equal(await evaluate("document.querySelector('.streak-card').getBoundingClientRect().height < 90"), true, 'Ofensiva secundária em 390px');
  assert.equal(await evaluate("document.querySelector('.nutri-records-link').getBoundingClientRect().height < 190"), true, 'CTA compacto em 390px');
  assert.equal(await evaluate("Math.abs(document.querySelector('.nutrition-settings-card').getBoundingClientRect().top - document.querySelector('.nutrition-weight-card').getBoundingClientRect().top) < 2"), true, 'Utilitários lado a lado em 390px');
  assert.equal(await evaluate("document.querySelector('.nutrition-weight-card .metric-number')?.textContent?.trim()"), '75.5');
  await capture('mobile-430', 430, 900);
  meals = [
    { id: 'meal-1', name: 'BREAKFAST', loggedAt: today, entries: [{ id: 'entry-1', amountGrams: 150, food: oatmeal }, { id: 'entry-long', amountGrams: 200, food: longFood }] },
    { id: 'meal-2', name: 'LUNCH', loggedAt: today, entries: [{ id: 'entry-3', amountGrams: 120, food: longFood }] },
  ];
  await evaluate("document.querySelector('.nutri-records-link')?.click()");
  await wait("location.pathname === '/nutri/registros' && !!document.querySelector('.nutrition-meal-card')");
  assert.equal(await evaluate("document.body.innerText.includes('Aveia')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-meal-card.is-filled').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-meal-card.is-empty').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-meal-entry-icon').length"), 3);
  assert.equal(await evaluate("document.body.innerText.includes('Abadejo, filé, congelado, assado com ervas e acompanhamento caseiro')"), true);
  await capture('records-mobile-360', 360, 800);
  await capture('records-mobile', 390, 844);
  await capture('records-mobile-430', 430, 900);
  await capture('records-desktop', 1440, 900);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("(() => { const button = document.querySelector('.nutrition-meal-add'); button?.focus(); return document.activeElement === button && button.matches(':focus-visible'); })()"), true, 'Foco visível no botão de adicionar');
  await evaluate("document.querySelector('.nutrition-meal-add')?.click()");
  await wait("!!document.querySelector('[aria-label=\"Adicionar alimento\"]')");
  await wait("!!document.querySelector('.food-search-result')");
  await evaluate("document.querySelector('.food-search-result')?.click()");
  await wait("!!document.querySelector('.food-search-footer button')");
  await evaluate("document.querySelector('.food-search-footer button')?.click()");
  await wait("document.querySelectorAll('.nutrition-meal-entry').length === 4");
  assert.ok(requests.some(value => value.startsWith('POST /api/meals/entries')));
  await evaluate("document.querySelector('.nutrition-meal-entry .nutrition-meal-remove')?.click()");
  await wait("!!document.querySelector('.nutrition-meal-remove.is-confirming')");
  await evaluate("document.querySelector('.nutrition-meal-remove.is-confirming')?.click()");
  await wait("document.querySelectorAll('.nutrition-meal-entry').length === 3");
  assert.ok(requests.some(value => value.startsWith('DELETE /api/meals/entries/entry-1')));
  meals = [];
  mealResponseDelayMs = 1500;
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.nutrition-meals-loading[role=status]')");
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-meal-loading-row').length"), 4);
  await capture('records-loading-mobile', 390, 844);
  await wait("document.querySelectorAll('.nutrition-meal-card.is-empty').length === 4");
  mealResponseDelayMs = 0;
  await capture('records-empty-mobile', 390, 844);
  failMeals = true;
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('.nutri-records-page [role=alert]')");
  failMeals = false;
  await evaluate("document.querySelector('.nutri-back-link')?.click()");
  await wait("location.pathname === '/nutri' && !!document.querySelector('#tab-hidratacao')");
  await evaluate("document.querySelector('#tab-hidratacao')?.click()");
  await wait("!!document.querySelector('#panel-hidratacao')");
  await evaluate("document.querySelector('#panel-hidratacao button')?.click()");
  await wait("!!document.querySelector('.nutrition-water-card')");
  assert.equal(await evaluate("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.trim()"), '0 ml');
  assert.equal(await evaluate("document.querySelector('.nutrition-water-goal strong')?.textContent"), '0%');
  assert.equal(await evaluate("document.querySelector('.nutrition-history-empty h4')?.textContent"), 'Nenhum registro');
  await capture('hydration-empty-360', 360, 720);
  await capture('hydration-empty-390', 390, 844);
  await capture('hydration-empty-430', 430, 900);
  await capture('hydration-empty-desktop', 1440, 900);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.nutrition-water-guardian')).animationName"), 'none');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await evaluate("document.querySelectorAll('.nutrition-water-quick')[0]?.click()");
  await wait("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.includes('250')");
  await evaluate("document.querySelectorAll('.nutrition-water-quick')[1]?.click()");
  await wait("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.includes('750')");
  await evaluate("document.querySelector('.nutrition-water-input')?.focus()");
  await send('Input.insertText', { text: '1650' });
  assert.equal(await evaluate("document.querySelector('.nutrition-water-input')?.value"), '1650');
  assert.equal(await evaluate("document.querySelector('.nutrition-water-custom-submit')?.disabled"), false);
  await evaluate("document.querySelector('.nutrition-water-custom-submit')?.click()");
  await wait("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.includes('2.400')");
  assert.equal(await evaluate("document.querySelector('.nutrition-water-goal strong')?.textContent"), '100%');
  await capture('hydration-goal-390', 390, 844);
  await evaluate("document.querySelector('.nutrition-water-input')?.focus()");
  await send('Input.insertText', { text: '100' });
  await evaluate("document.querySelector('.nutrition-water-custom-submit')?.click()");
  await wait("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.includes('2.500')");
  assert.equal(await evaluate("document.querySelector('.nutrition-water-goal strong')?.textContent"), '100%');
  await capture('hydration-over-goal-390', 390, 844);
  await evaluate("document.querySelector('[aria-label^=\"Remover 100 ml\"]')?.click()");
  await wait("!!document.querySelector('.nutrition-water-log.is-confirming')");
  await evaluate("document.querySelector('.nutrition-water-log.is-confirming [id^=\"water-confirm-\"] button:last-child')?.click()");
  await wait("document.querySelector('.nutrition-water-metrics > strong')?.textContent?.includes('2.400')");
  assert.ok(requests.some(value => value.startsWith('DELETE /api/nutrition/water/')));
  hydrationHistory = [
    { id: 'day-1', date: '2026-10-08', waterIngestedMl: 3220, targetWaterMl: 2400, consumedKcal: 2180, consumedProteinG: 120, consumedCarbsG: 280, waterGoalAchieved: true, kcalGoalAchieved: true, proteinGoalAchieved: true, carbsGoalAchieved: true, fatGoalAchieved: true },
    { id: 'day-2', date: '2026-10-07', waterIngestedMl: 1890, targetWaterMl: 2400, consumedKcal: 1950, consumedProteinG: 110, consumedCarbsG: 220, waterGoalAchieved: false, kcalGoalAchieved: false, proteinGoalAchieved: false, carbsGoalAchieved: false, fatGoalAchieved: false },
  ];
  await send('Page.reload', { ignoreCache: true });
  await wait("!!document.querySelector('#tab-hidratacao')");
  await evaluate("document.querySelector('#tab-hidratacao')?.click()");
  await wait("!!document.querySelector('.nutrition-history-day')");
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-history-day').length"), 2);
  assert.equal(await evaluate("document.querySelector('.nutrition-history-day .nutrition-history-status')?.textContent"), 'Perfeito');
  assert.equal(await evaluate("document.querySelectorAll('.nutrition-history-day')[1]?.textContent?.includes('Incompleto')"), true);
  assert.equal(await evaluate("document.querySelector('.nutrition-history-day')?.textContent?.includes('proteínas')"), true);
  await capture('hydration-history-390', 390, 720);
  await capture('hydration-history-desktop', 1440, 900);
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS Nutri V2 browser: totals, records, hydration 0/goal/exceeded, add/remove, history, responsive widths, reduced motion; screenshots ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
