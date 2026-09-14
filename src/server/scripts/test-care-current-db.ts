// Verifies the configured local database without creating test users or records.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { loadCareCatalogs } from '../../../prisma/care-seed.js';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['postgresql:', 'postgres:'].includes(url.protocol) &&
  ['localhost', '127.0.0.1'].includes(url.hostname), 'Exige PostgreSQL local.');
const db = new PrismaClient();
const { default: routeDb } = await import('../db.js');
const { profileRoutes } = await import('../routes/profile.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(profileRoutes, { prefix: '/api/profile' });
const source = loadCareCatalogs();

async function snapshot() {
  const hashes: Record<string, string> = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    const key = model.name[0].toLowerCase() + model.name.slice(1);
    const delegate = (db as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[key];
    const rows = (await delegate.findMany()).map(row => JSON.stringify(row)).sort();
    hashes[model.name] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  return hashes;
}

try {
  // Stop before running the main seed if the recovered catalogs differ.
  assert.deepEqual(await db.allergy.findMany({ where: { isCustom: false }, orderBy: { name: 'asc' } }), source.allergies);
  assert.deepEqual(await db.physicalLimitation.findMany({ where: { isCustom: false }, orderBy: { name: 'asc' } }), source.limitations);
  const customCounts = {
    allergies: await db.allergy.count({ where: { isCustom: true } }),
    limitations: await db.physicalLimitation.count({ where: { isCustom: true } }),
  };
  const before = await snapshot();
  for (let execution = 1; execution <= 2; execution++) {
    const output = execFileSync('npx', ['prisma', 'db', 'seed'], { encoding: 'utf8', stdio: 'pipe' });
    const summary = output.split('\n').find(line => line.startsWith('Catálogos de cuidados:'));
    assert.ok(summary, 'Seed deve registrar resumo dos cuidados.');
    assert.deepEqual(JSON.parse(summary.slice('Catálogos de cuidados:'.length)), {
      allergies: { inserted: 0, preserved: 8 }, limitations: { inserted: 0, preserved: 9 },
    });
    assert.deepEqual(await snapshot(), before, 'Seed alterou registros persistidos.');
    console.log(`PASS npx prisma db seed, revalidação ${execution}, exit 0; ${summary}`);
  }
  console.log(`PASS ${Object.keys(before).length} modelos sem alterações de dados, IDs ou timestamps; customizados preservados: ${JSON.stringify(customCounts)}.`);
  const user = await db.user.findFirst({ where: { emailVerified: true }, select: { id: true } });
  assert.ok(user, 'Exige usuário verificado existente para validar sessão sem criar dados.');
  const response = await app.inject({ url: '/api/profile/options', headers: {
    authorization: `Bearer ${app.jwt.sign({ id: user.id, scope: 'session' })}`,
  } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), source);
  assert.equal((await app.inject({ url: '/api/profile/options' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/profile/options', headers: {
    authorization: `Bearer ${app.jwt.sign({ id: user.id, scope: 'pending_verification' })}`,
  } })).statusCode, 403);
  writeFileSync('docs/onboarding-care/profile-options-response.json', JSON.stringify(response.json(), null, 2) + '\n');
  console.log('PASS rota real com PostgreSQL principal: sessão 200 com 8 alergias e 9 limitações; anônimo 401; pending_verification 403.');
} catch (error) {
  // Assertion snapshots and child errors can contain private persisted data.
  console.error('FAIL validação do banco atual:', error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Falha de execução; detalhes privados omitidos.');
  process.exitCode = 1;
} finally {
  await app.close();
  await db.$disconnect();
  await routeDb.$disconnect();
}
