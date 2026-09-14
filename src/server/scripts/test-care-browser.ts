// Uses the existing Chromium binary and native CDP/WebSocket; no browser dependency.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import { createTestDatabase, runPrisma } from './postgresql-test-db.js';
import { loadCareCatalogs } from '../../../prisma/care-seed.js';

const binary = process.env.CARE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
assert.ok(existsSync(binary), 'Defina CARE_TEST_CHROMIUM para um Chromium instalado.');
assert.ok(existsSync('dist/index.html'), 'Execute npm run build antes do teste.');
const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { profileRoutes } = await import('../routes/profile.routes.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
let failure: 'empty' | 'http' | null = null;
let optionsRequests = 0;
// Only fault injection is simulated; successful responses always use real routes/database.
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/api/profile/options') {
    optionsRequests++;
    if (failure === 'http') return reply.status(503).send({ error: 'Falha simulada de opções' });
    if (failure === 'empty') return reply.send({ allergies: [], limitations: [] });
  }
});
await app.register(profileRoutes, { prefix: '/api/profile' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(serveStatic, { root: path.resolve('dist') });
app.setNotFoundHandler((req, reply) => reply.sendFile('index.html'));
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-care-browser-'));
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
try {
  runPrisma(['db', 'seed']);
  const user = await db.user.create({ data: { email: 'care-browser@example.test', emailVerified: true } });
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const token = app.jwt.sign({ id: user.id, scope: 'session' });
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${browserProfile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk.toString(); });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) {
    if (browser.exitCode !== null) throw new Error(`Chromium não iniciou: ${stderr.slice(0, 800)}`);
    await delay(100);
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  assert.ok(endpoint, 'Chromium sem endpoint CDP.');
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
  });
  function send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket!.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression: string) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + response.exceptionDetails.exception?.description);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timeout no navegador: ${expression}; texto=${await evaluate('document.body.innerText')}`);
  }
  async function click(text: string) {
    const lookup = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
    await wait(`Boolean(${lookup}) && !(${lookup}).disabled`);
    await evaluate(`(${lookup}).click()`);
  }
  async function fill(selector: string, value: string) {
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  }
  async function reachCare() {
    await fill('input[placeholder="Seu nome"]', 'Marina');
    await fill('input[placeholder="Seu sobrenome"]', 'Teste');
    await click('Continuar');
    await fill('input[type="date"]', '1995-01-01');
    await click('Feminino');
    await fill('input[placeholder="Ex: 75.5"]', '65');
    await fill('input[placeholder="Ex: 175"]', '168');
    await click('Continuar');
    await wait(`document.body.innerText.includes('Seu objetivo principal')`);
    await evaluate(`(() => { for(const title of ['Seu objetivo principal','Sua rotina de exercícios']) { const legend=[...document.querySelectorAll('legend')].find(e=>e.textContent===title); legend.parentElement.querySelector('button').click(); } })()`);
    await click('Continuar');
    await wait(`document.body.innerText.includes('Alergias alimentares')`);
  }
  const source = loadCareCatalogs();
  async function assertGroups() {
    await wait(`!document.body.innerText.includes('Não foi possível obter as opções deste grupo.') && document.body.innerText.includes('Alergias alimentares')`);
    const groups = await evaluate(`['Alergias alimentares','Limitações físicas'].map(title => { const legend=[...document.querySelectorAll('legend')].find(e=>e.textContent===title); return [...legend.parentElement.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(name=>name!=='Outras'); })`);
    assert.deepEqual(groups[0].sort(), source.allergies.map(x => x.name).sort());
    assert.deepEqual(groups[1].sort(), source.limitations.map(x => x.name).sort());
  }
  await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${url}/onboarding` });
  await reachCare(); await assertGroups();
  console.log('PASS navegador real: três primeiras etapas funcionam; Seus cuidados exibe 8 alergias e 9 limitações iguais à API/PostgreSQL.');
  await send('Page.reload'); await reachCare(); await assertGroups();
  console.log('PASS refresh: nova consulta real e ambos os grupos preenchidos.');

  failure = 'empty'; await send('Page.reload'); await reachCare();
  await wait(`document.querySelectorAll('[role="alert"]').length === 2`);
  const beforeRetry = optionsRequests; failure = null;
  await click('Tentar novamente'); await assertGroups();
  assert.ok(optionsRequests > beforeRetry);
  console.log('PASS retry dos grupos após arrays vazios simulados: clique refaz request e recupera ambos os catálogos reais.');
  failure = 'http'; await send('Page.reload');
  await wait(`document.body.innerText.includes('Falha simulada de opções')`);
  const beforeHttpRetry = optionsRequests; failure = null;
  await click('Tentar novamente'); await reachCare(); await assertGroups();
  assert.ok(optionsRequests > beforeHttpRetry);
  console.log('PASS retry após HTTP 503 simulado: erro permanece visível e recuperação usa endpoint real.');
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('docs/onboarding-care/seus-cuidados.png', Buffer.from(screenshot.data, 'base64'));
  await send('Network.clearBrowserCookies'); await send('Page.reload');
  await wait(`location.pathname === '/login'`);
  console.log('PASS refresh sem sessão redireciona para login; nenhuma regra de autenticação alterada.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { const stopped = once(browser, 'exit'); browser.kill('SIGTERM'); await stopped; }
  rmSync(browserProfile, { recursive: true, force: true });
  await app.close(); await db.$disconnect(); await database.cleanup();
}
