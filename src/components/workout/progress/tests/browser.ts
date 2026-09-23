// Controlled HTTP fixtures exercise the real React application; no database is touched.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { WorkoutProgress, ProgressMetric } from '../../../../shared/workoutProgress';

const outputDir = '/tmp/kindra-progress-redesign';
mkdirSync(outputDir, { recursive: true });
const profile = mkdtempSync(path.join(os.tmpdir(), 'kindra-progress-'));
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let scenario = 'normal';
let requests = 0;
const queries: URLSearchParams[] = [];
const available = (value: number): ProgressMetric => ({ value, status: 'available' });
const missing: ProgressMetric = { value: null, status: 'no_data' };
const incomplete: ProgressMetric = { value: null, status: 'incomplete' };
function fixture(query: URLSearchParams): WorkoutProgress {
  const start = query.get('startDate')!, end = query.get('endDate')!, id = query.get('exerciseId');
  const month = start.slice(0, 7);
  const count = scenario === 'pagination' ? 205 : scenario === 'single' ? 1 : 8;
  const allPoints = Array.from({ length: count }, (_, index) => ({
    sessionId: `session-${index}`, startedAt: `${month}-${String(Math.min(28, index + 1)).padStart(2, '0')}T12:00:00Z`,
    localDate: `${month}-${String(Math.min(28, index + 1)).padStart(2, '0')}`,
    bestEstimatedOneRepMax: scenario === 'no_data' ? missing : scenario === 'incomplete' && index === 3 ? incomplete : scenario === 'trajectory' ? (index === 3 ? missing : available([80, 85, 76, 0, 82, 90, 86, 94][index])) : available((id === '1' ? [80, 85, 90, 92, 96, 100, 104, 106.7] : id === '2' ? [30, 32, 33, 35, 36, 37, 38, 40] : [60, 64, 65, 68, 72, 74, 78, 79.5])[index % 8]),
  }));
  const volume = scenario === 'long' ? available(123456789.1) : scenario === 'zero' ? available(0) : scenario === 'no_data' || scenario === 'empty' ? missing : scenario === 'incomplete' ? incomplete : available(12840);
  return {
    filter: { startDate: start, endDate: end, timeZone: query.get('timeZone')!, startInclusiveUTC: '', endExclusiveUTC: '', exerciseId: id },
    period: {
      sessionCount: scenario === 'empty' ? 0 : 8,
      volume: { ...volume, contributionCount: volume.status === 'incomplete' ? null : volume.status === 'no_data' ? 0 : 32 },
      volumeSeries: scenario === 'empty' ? [] : [2, 5, 8, 12, 16, 20, 24, 27].map((day, index) => ({
        localDate: `${month}-${String(day).padStart(2, '0')}`, sessionCount: 1,
        volume: { ...(scenario === 'zero' ? available(0) : scenario === 'no_data' ? missing : scenario === 'incomplete' && index === 3 ? incomplete : available([1280, 1440, 1320, 1680, 1520, 1840, 1760, 2000][index])), contributionCount: 4 },
      })),
    },
    exercises: scenario === 'empty' ? [] : ['Supino reto com barra', 'Agachamento livre com barra', 'Rosca direta com barra'].map((name, index) => ({
      exerciseId: String(index), name, periodSessionCount: 8,
      periodRecords: { maxWeight: scenario === 'no_data' ? missing : available([60, 80, 30][index]), bestEstimatedOneRepMax: scenario === 'incomplete' ? incomplete : scenario === 'no_data' ? missing : available([79.5, 106.7, 40][index]) },
      allTimeRecords: { maxWeight: scenario === 'no_data' ? missing : available([70, 95, 35][index]), bestEstimatedOneRepMax: scenario === 'incomplete' ? incomplete : scenario === 'no_data' ? missing : available([87.5, 120, 44.3][index]) },
    })),
    progression: id ? { exerciseId: id, points: allPoints.slice(query.has('cursor') ? 200 : 0, query.has('cursor') ? 205 : 200), nextCursor: scenario === 'pagination' && !query.has('cursor') ? 'next' : null } : null,
    dataQuality: { status: scenario === 'incomplete' ? 'incomplete' : 'complete', issues: [] },
  };
}
const vite = await createServer({ configFile: false, plugins: [react(), tailwindcss(), {
  name: 'progress-test-api', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/workouts/progress')) {
        const query = new URL(req.url, 'http://localhost').searchParams; queries.push(query); requests++;
        if (scenario === 'error') { res.statusCode = 500; res.end(JSON.stringify({ error: 'fixture failure' })); return; }
        res.end(JSON.stringify(fixture(query))); return;
      }
      res.end(req.url.includes('/active') ? 'null' : '[]');
    });
  },
}], server: { host: '127.0.0.1', port: 0, watch: null }, appType: 'spa' });
try {
  await vite.listen();
  const url = vite.resolvedUrls!.local[0];
  assert.ok(existsSync(binary), 'Chromium ausente');
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk; });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) { if (browser.exitCode !== null) throw new Error(stderr.slice(-500)); await delay(100); }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; assert.ok(endpoint);
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await once(socket, 'open');
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
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
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
    await send('Page.navigate', { url: `${url}workout/progress` });
    await wait(scenario === 'error' ? "!!document.querySelector('.progress-error')" : "!!document.querySelector('.progress-summary') && !document.body.innerText.includes('Carregando a progressão')");
    await evaluate('document.fonts.ready');
  }
  async function screenshot(name: string, width: number, height: number) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(250);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Horizontal overflow');
    if (scenario === 'normal') {
      const composition = await evaluate<{ resultTop: number; resultBottom: number; filtersTop: number; forceTop: number; recordsTop: number; volumeTop: number; numberSize: number; forceHeight: number; volumeHeight: number }>(`(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return { resultTop: rect('.progress-total').top, resultBottom: rect('.progress-total').bottom,
          filtersTop: rect('.progress-filters').top, forceTop: rect('.progress-exercise-panel').top,
          recordsTop: rect('.progress-records-panel').top, volumeTop: rect('.progress-volume-panel').top,
          numberSize: parseFloat(getComputedStyle(document.querySelector('.progress-total')).fontSize),
          forceHeight: rect('.progress-chart-estimate svg').height, volumeHeight: rect('.progress-chart-volume svg').height };
      })()`);
      assert.ok(composition.resultBottom < composition.filtersTop, 'Personal result precedes period controls');
      assert.ok(composition.forceTop < composition.recordsTop && composition.recordsTop < composition.volumeTop);
      assert.ok(composition.forceHeight > composition.volumeHeight);
      if (width === 390) { assert.ok(composition.resultTop < 400); assert.ok(composition.numberSize >= 46); }
      writeFileSync(path.join(outputDir, `${name}-composition.json`), JSON.stringify(composition, null, 2));
    }
    const metrics = await send('Page.getLayoutMetrics');
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } });
    writeFileSync(path.join(outputDir, name + '.png'), Buffer.from(image.data, 'base64'));
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Fortaleza' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await load();
  assert.ok(queries[0].get('timeZone') === 'America/Fortaleza');
  assert.equal(await evaluate("document.querySelector('.nav-item.is-active').getAttribute('href')"), '/workout');
  await screenshot('desktop', 1440, 1000);
  await screenshot('laptop', 1024, 900);
  await screenshot('mobile', 390, 844);
  scenario = 'trajectory'; await load();
  assert.equal(await evaluate("document.querySelector('.progress-line').getAttribute('d').split('M').length-1"), 2, 'Gap breaks the line');
  assert.equal(await evaluate("document.querySelectorAll('.progress-chart-estimate .progress-point').length"), 7);
  assert.ok(await evaluate("Number(document.querySelectorAll('.progress-chart-estimate .progress-point')[2].getAttribute('cy')) > Number(document.querySelectorAll('.progress-chart-estimate .progress-point')[1].getAttribute('cy'))"), 'Decline remains visible');
  await screenshot('mobile-trajectory', 390, 844);
  scenario = 'single'; await load();
  assert.equal(await evaluate("document.querySelectorAll('.progress-chart-estimate .progress-point').length"), 1);
  assert.ok(await evaluate("!document.querySelector('.progress-line').getAttribute('d').includes('L')"));
  scenario = 'long'; await load(); await screenshot('mobile-long-number', 390, 844);
  scenario = 'normal'; await load();
  const total = await evaluate("document.querySelector('.progress-total').textContent");
  await evaluate("document.querySelector('#progress-exercise').value='1'; document.querySelector('#progress-exercise').dispatchEvent(new Event('change',{bubbles:true}))");
  await wait("document.querySelector('.progress-selected-name')?.textContent.includes('Agachamento') && !document.body.innerText.includes('Carregando a progressão')");
  assert.equal(await evaluate("document.querySelector('.progress-total').textContent"), total);
  const before = requests;
  await evaluate("document.querySelector('.progress-expand').click()");
  assert.equal(await evaluate("document.querySelectorAll('.progress-record-row').length"), 3);
  assert.equal(requests, before);
  await evaluate("document.querySelector('.progress-chart svg').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  assert.ok(await evaluate("document.querySelector('.progress-chart-readout strong') !== null"));
  await evaluate("[...document.querySelectorAll('.progress-presets button')].find(b=>b.textContent==='Personalizado').click()");
  await wait("document.querySelectorAll('input[type=date]').length===2");
  await evaluate("document.querySelector('.progress-custom').requestSubmit()");
  await wait("!!document.querySelector('.progress-summary') && !document.body.innerText.includes('Carregando a progressão')");
  scenario = 'pagination'; await load();
  await wait("document.body.innerText.includes('200 sessões carregadas')");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Carregar mais sessões').click()");
  await wait("document.body.innerText.includes('205 sessões no período')");
  assert.equal(await evaluate("document.querySelectorAll('.progress-exercise-panel tbody tr').length"), 205);
  scenario = 'zero'; await load(); assert.equal(await evaluate("document.querySelector('.progress-total').textContent.trim()"), '0 kg');
  scenario = 'no_data'; await load(); assert.ok(await evaluate("document.body.innerText.includes('Sem dados elegíveis')"));
  assert.equal(await evaluate("document.querySelectorAll('.progress-personal-best[data-status=available]').length"), 0);
  scenario = 'incomplete'; await load(); assert.ok(await evaluate("document.body.innerText.includes('Não foi possível calcular o volume')"));
  await screenshot('mobile-incomplete', 390, 844);
  assert.ok(await evaluate("document.querySelector('.progress-personal-best[data-status=incomplete]') !== null"));
  scenario = 'empty'; await load(); assert.equal(await evaluate("document.querySelector('#progress-exercise').disabled"), true);
  scenario = 'error'; await load(); assert.ok(await evaluate("document.body.innerText.includes('Tentar novamente')"));
  scenario = 'normal'; await evaluate("document.querySelector('.progress-error button').click()");
  await wait("!!document.querySelector('.progress-summary')");
  await evaluate("document.querySelector('.progress-back').click()");
  await wait("!!document.querySelector('a[href=\"/workout/progress\"]')");
  await evaluate("document.querySelector('a[href=\"/workout/progress\"]').click()");
  await wait("!!document.querySelector('.progress-summary')");
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS browser: navigation, filters, selection, pagination, accessibility, states and responsive screenshots: ${outputDir}`);
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite.close(); rmSync(profile, { recursive: true, force: true });
}
