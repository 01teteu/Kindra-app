import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase, runPrisma } from './postgresql-test-db.js';
import { loadCareCatalogs, seedCareCatalogs, CareCatalogError } from '../../../prisma/care-seed.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { profileRoutes } = await import('../routes/profile.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(profileRoutes, { prefix: '/api/profile' });
const source = loadCareCatalogs();
async function snapshot() {
  return { allergies: await db.allergy.findMany({ orderBy: { id: 'asc' } }), limitations: await db.physicalLimitation.findMany({ orderBy: { id: 'asc' } }) };
}
try {
  const custom = await db.allergy.create({ data: { name: 'Restrição privada de teste', isCustom: true } });
  const customLimitation = await db.physicalLimitation.create({ data: { name: 'Limitação privada de teste', isCustom: true } });
  const unrelatedOfficial = await db.physicalLimitation.create({ data: { name: 'Oficial preexistente de teste', isCustom: false } });
  const before = await snapshot();
  // Collisions in the second group must not partially import the first.
  for (const mutate of [
    (x: typeof source) => { x.limitations[0].id = customLimitation.id; },
    (x: typeof source) => { x.limitations[0].name = customLimitation.name; },
    (x: typeof source) => { x.limitations[0].name = unrelatedOfficial.name; },
    (x: typeof source) => { x.allergies[0].id = custom.id; },
    (x: typeof source) => { x.allergies[1] = x.allergies[0]; },
  ]) {
    const input = structuredClone(source); mutate(input);
    await assert.rejects(seedCareCatalogs(db, input), CareCatalogError);
    assert.deepEqual(await snapshot(), before);
  }
  // Remove only this explicitly synthetic row from the isolated test schema.
  await db.physicalLimitation.delete({ where: { id: unrelatedOfficial.id } });
  console.log('PASS colisões de ID/nome com customizados ou oficiais e duplicatas abortam sem escrita parcial.');
  runPrisma(['db', 'seed']);
  const first = await snapshot();
  runPrisma(['db', 'seed']);
  assert.deepEqual(await snapshot(), first);
  assert.equal(await db.allergy.count({ where: { isCustom: false } }), 8);
  assert.equal(await db.physicalLimitation.count({ where: { isCustom: false } }), 9);
  for (const row of source.allergies) assert.deepEqual(await db.allergy.findUnique({ where: { id: row.id } }), row);
  for (const row of source.limitations) assert.deepEqual(await db.physicalLimitation.findUnique({ where: { id: row.id } }), row);
  assert.deepEqual(await db.allergy.findUnique({ where: { id: custom.id } }), custom);
  assert.deepEqual(await db.physicalLimitation.findUnique({ where: { id: customLimitation.id } }), customLimitation);
  const user = await db.user.create({ data: { email: 'care-options@example.test' } });
  const headers = { authorization: `Bearer ${app.jwt.sign({ id: user.id, scope: 'session' })}` };
  const response = await app.inject({ url: '/api/profile/options', headers });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), source);
  assert.equal((await app.inject({ url: '/api/profile/options' })).statusCode, 401);
  const pending = { authorization: `Bearer ${app.jwt.sign({ id: user.id, scope: 'pending_verification' })}` };
  assert.equal((await app.inject({ url: '/api/profile/options', headers: pending })).statusCode, 403);
  await Promise.all([seedCareCatalogs(db, source), seedCareCatalogs(db, source)]);
  assert.deepEqual(await snapshot(), first);
  console.log('PASS seed completo duas vezes e concorrência: 8 Allergy + 9 PhysicalLimitation, IDs/nomes oficiais e customizados preservados.');
  console.log('PASS GET /api/profile/options: sessão 200 com arrays iguais ao catálogo; anônimo 401; pending_verification 403; customizados não expostos.');
} finally {
  await app.close(); await db.$disconnect(); await database.cleanup();
}
