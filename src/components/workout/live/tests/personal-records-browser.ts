// One representative browser run against the actual frontend, routes and PostgreSQL.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import middie from '@fastify/middie';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createTestDatabase } from '../../../../server/scripts/postgresql-test-db.js';
const database = await createTestDatabase();
const { fixture } = await import('./fixture');

const { app, db, owner, exercise, token, cleanup } = await fixture();
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-live-api-browser-'));
const outputDir = '/tmp/kindra-pr-browser';
mkdirSync(outputDir, { recursive: true });
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
const dialogs: string[] = [];
const acceptDialogs = true;
try {
  assert.ok(existsSync(binary), 'Chromium ausente');
  let recordRequests = 0;
  app.addHook('onRequest', async req => { if (req.url.endsWith('/personal-records')) recordRequests++; });
  const call = async (path: string, payload?: object, method: 'POST' | 'PATCH' = 'POST') => {
    const result = await app.inject({ method, url: `/api/workouts/sessions${path}`, payload, headers: { authorization: `Bearer ${token}` } });
    assert.ok([200, 201].includes(result.statusCode), result.body); return result.json();
  };
  await app.register(middie);
  vite = await createServer({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: { '@': process.cwd() } },
    server: { middlewareMode: true, hmr: { server: app.server }, watch: null }, appType: 'spa' });
  app.use((req, res, next) => req.url?.startsWith('/api/') ? next() : vite!.middlewares(req, res, next));
  // Historical baseline created entirely through real production routes.
  const historical = await call('', { name: 'Baseline PR' });
  const added = await call(`/${historical.id}/exercises`, { exerciseId: exercise.id });
  const base = `/${historical.id}/exercises/${added.exercises[0].id}/sets`;
  const created = await call(base, { weight: 100, reps: 1 });
  const response = await call(`${base}/${created.exercises[0].sets[0].id}/completion`, { completed: true }, 'PATCH');
  assert.equal(response.achievement, null);
  await call(`/${historical.id}/finish`);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${browserProfile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk.toString(); });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) {
    if (browser.exitCode !== null) throw new Error(`Chromium não iniciou: ${stderr.slice(0, 300)}`);
    await delay(100);
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  assert.ok(endpoint);
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const runtimeErrors: string[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Page.javascriptDialogOpening') { dialogs.push(message.params.message); void send('Page.handleJavaScriptDialog', { accept:acceptDialogs }); }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
  });
  function send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout CDP: ${method}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + response.exceptionDetails.exception?.description);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 120; i++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error(`Timeout navegador: ${expression}`);
  }
  async function click(selector: string) {
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await wait(`!document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await key('Enter');
  }
  async function clickText(text: string) {
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b) throw Error('Botão ausente'); b.focus(); })()`);
    await key('Enter');
  }
  async function fill(selector: string, value: string) {
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function capture(name: string) {
    if (!['desktop-1920','mobile-390'].includes(name)) return;
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${outputDir}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  async function key(key: string, code: string = key) {
    const virtualKey = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === ' ' ? 32 : 9;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const refreshOnly = process.env.PR_BROWSER_CASE === 'refresh';
  if (refreshOnly) {
    const current = await call('', { name: 'Refresh PR' });
    const added = await call(`/${current.id}/exercises`, { exerciseId: exercise.id });
    const base = `/${current.id}/exercises/${added.exercises[0].id}/sets`;
    let reopenId = '';
    for (const weight of [99, 105, 103, 110]) {
      const addedSet = await call(base, { weight, reps: 1 });
      const id = addedSet.exercises[0].sets.at(-1).id;
      await call(`${base}/${id}/completion`, { completed: true }, 'PATCH');
      if (weight === 105) reopenId = id;
    }
    await call(`${base}/${reopenId}/completion`, { completed: false }, 'PATCH');
  }
  await send('Page.navigate', { url: `${url}/workout/live` });
  const goldRows = () => evaluate<number[]>(`[...document.querySelectorAll('.live-set')].flatMap((row,i)=>row.classList.contains('is-pr')?[i+1]:[])`);
  if (!refreshOnly) {
  await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
  await clickText('Iniciar treino');
  await wait(`document.body.innerText.includes('Seu treino ainda não possui exercícios.')`);
  await clickText('Adicionar exercício');
  await wait(`document.querySelectorAll('.exercise-card').length > 0`);
  await fill('[aria-label="Buscar exercício"]', exercise.name);
  await wait(`document.querySelectorAll('.exercise-card').length === 1`);
  await click('.exercise-card'); await clickText('Adicionar (1)');
  await wait(`Boolean(document.querySelector('select[aria-label^="Tipo da nova série"]'))`);
  const saved = () => wait(`!document.body.innerText.includes('Há edições ainda não salvas.') && !document.body.innerText.includes('Salvando…')`);
  for (const [index, weight] of [99, 105, 103, 110].entries()) {
    await clickText('Adicionar série');
    await wait(`document.querySelectorAll('.live-set').length === ${index + 1}`);
    await fill(`[aria-label="Carga de Série ${index + 1} em kg"]`, String(weight)); await key('Enter');
    await saved();
    await fill(`[aria-label="Repetições de Série ${index + 1}"]`, '1'); await key('Enter');
    await saved();
    assert.deepEqual(await goldRows(), index < 2 ? [] : [2]);
    await click(`[aria-label="Concluir Série ${index + 1}"]`);
    await wait(`document.querySelectorAll('.live-set.is-completed').length === ${index + 1}`);
    await saved();
    assert.deepEqual(await goldRows(), index === 0 ? [] : index === 3 ? [2,4] : [2]);
  }
  assert.ok(await evaluate(`document.body.innerText.includes('Novo PR') && document.body.innerText.includes('e1RM 110 kg')`));
  await click('[aria-label="Reabrir Série 2"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 3`);
  await wait(`document.querySelectorAll('.live-pr').length === 2 && document.querySelectorAll('.live-set')[2].classList.contains('is-pr')`);
  assert.deepEqual(await goldRows(), [3,4]);
  }
  await wait(`document.querySelectorAll('.live-set').length === 4 && document.querySelectorAll('.live-pr').length === 2`);
  const beforeRefresh = recordRequests;
  await send('Page.reload');
  await wait(`document.querySelectorAll('.live-set').length === 4 && document.querySelectorAll('.live-pr').length === 2`);
  assert.equal(recordRequests, beforeRefresh + 1);
  assert.deepEqual(await goldRows(), [3,4]);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Concluir Série 2"]').getAttribute('aria-pressed')`), 'false');
  // Compare the entire confirmed row against a neutral row in both token palettes.
  const luminance = (rgb: number[]) => rgb.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a: number[], b: number[]) => { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  for (const theme of ['dark', 'light']) {
    // The app currently aliases dark only; exercise the light tokens without adding a theme switch.
    const css = readFileSync('src/index.css', 'utf8');
    const palette = Object.fromEntries([...css.matchAll(new RegExp(`--color-kindra-${theme}-([a-z0-9]+):\\s*(#[a-fA-F0-9]+);`, 'g'))].map(match => [match[1], match[2]]));
    assert.equal(Object.keys(palette).length, 12);
    await evaluate(`(() => {
      const root=document.querySelector('.workout-live');
      for(const [key,value] of Object.entries(${JSON.stringify(palette)})) root.style.setProperty('--color-kindra-'+key,value);
    })()`);
    await delay(350); // Measure the settled palette, not a transition between themes.
    const colors = await evaluate<any>(`(() => {
      const row=document.querySelector('.live-set.is-pr'), normal=document.querySelector('.live-set:not(.is-pr)');
      const ctx=document.createElement('canvas').getContext('2d');
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
      return { background:rgb(getComputedStyle(row).backgroundColor), ink:rgb(getComputedStyle(row.querySelector('.live-pr')).color),
        input:rgb(getComputedStyle(row.querySelector('input')).color), border:getComputedStyle(row).boxShadow,
        neutral:getComputedStyle(normal).boxShadow, neutralBackground:getComputedStyle(normal).backgroundColor,
        base:rgb(getComputedStyle(document.querySelector('.workout-live')).backgroundColor) };
    })()`);
    assert.ok(colors.border.includes('0px 0px 0px 2px inset'), colors.border);
    assert.equal(colors.neutral, 'none');
    assert.equal(colors.neutralBackground, 'rgba(0, 0, 0, 0)');
    assert.ok(contrast(colors.ink, colors.background) >= 4.5, `${theme}: text contrast`);
    assert.ok(contrast(colors.ink, colors.base) >= 3, `${theme}: border contrast`);
    assert.ok(contrast(colors.input, colors.background) >= 4.5, `${theme}: input contrast ${JSON.stringify(colors)}`);
    console.log(`PASS ${theme}: gold text ${contrast(colors.ink, colors.background).toFixed(2)}:1; inputs ${contrast(colors.input, colors.background).toFixed(2)}:1.`);
  }
  await evaluate(`document.querySelector('.workout-live').removeAttribute('style')`);
  for (const width of [390, 1366, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    assert.equal(await evaluate(`[...document.querySelectorAll('.live-pr')].every(e=>e.scrollWidth<=e.clientWidth)`), true);
    await evaluate(`document.querySelector('[aria-label="Concluir Série 2"]').focus()`);
    assert.equal(await evaluate(`document.activeElement.matches('[aria-label="Concluir Série 2"]')`), true);
    await capture(width === 390 ? 'mobile-390' : width === 1920 ? 'desktop-1920' : 'laptop');
  }
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(dialogs, []);
  console.log(refreshOnly ? 'PASS navegador: refresh com PRs derivados, hidratação única, foco e 390/1366/1920 sem overflow.' : 'PASS navegador real: baseline, 99/105/103/110, PR confirmado, reopen, refresh com PRs derivados, foco e 390/1366/1920 sem overflow.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite?.close(); await cleanup(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
