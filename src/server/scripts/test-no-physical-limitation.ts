import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase } from './postgresql-test-db.js';
import { loadCareCatalogs, seedCareCatalogs } from '../../../prisma/care-seed.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { profileRoutes } = await import('../routes/profile.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(profileRoutes, { prefix: '/api/profile' });

const noneId = '09ab1d62-180a-4ba4-8b1e-836065ddab42';
const migration = readFileSync('prisma/migrations/20260928120000_normalize_no_physical_limitation/migration.sql', 'utf8');
const today = new Date().toISOString().slice(0, 10);
const query = `referenceDate=${today}&timezoneOffset=0`;
const profile = {
  firstName: 'Pessoa', lastName: 'Teste', birthDate: '1990-01-01', biologicalSex: 'FEMALE',
  weightKg: 70, heightCm: 170, activityLevel: 'Moderado', goal: 'Manutencao', isPCD: false,
  allergies: [], limitations: [] as string[],
};

try {
  await seedCareCatalogs(db, loadCareCatalogs());
  const realOne = (await db.physicalLimitation.findFirstOrThrow({ where: { name: 'Asma' } })).id;
  const realTwo = (await db.physicalLimitation.findFirstOrThrow({ where: { name: 'Lesão no joelho' } })).id;
  const createUser = async () => db.user.create({ data: { email: `${randomUUID()}@example.test`, emailVerified: true } });
  const owner = await createUser();
  const other = await createUser();
  const rejected = await createUser();
  const headers = (id: string) => ({ authorization: `Bearer ${app.jwt.sign({ id, scope: 'session' })}` });
  const request = (method: 'POST' | 'PUT' | 'GET', id: string, limitations?: string[]) => app.inject({
    method, url: `/api/profile/${method === 'PUT' ? `?${query}` : ''}`, headers: headers(id),
    ...(limitations ? { payload: { ...profile, limitations } } : {}),
  });
  const ids = async (id: string) => (await db.profile.findUniqueOrThrow({
    where: { userId: id }, select: { physicalLimitations: { select: { physicalLimitationId: true } } },
  })).physicalLimitations.map(link => link.physicalLimitationId).sort();

  assert.equal((await request('POST', owner.id, [noneId])).statusCode, 201);
  assert.deepEqual(await ids(owner.id), []);
  assert.equal((await request('POST', other.id, [realOne, realTwo])).statusCode, 201);
  assert.deepEqual(await ids(other.id), [realOne, realTwo].sort());

  const ambiguousCreate = await request('POST', rejected.id, [noneId, realOne]);
  assert.equal(ambiguousCreate.statusCode, 400);
  assert.match(ambiguousCreate.json().error, /Nenhuma.*combinada/);
  assert.equal(await db.profile.count({ where: { userId: rejected.id } }), 0);

  assert.equal((await request('PUT', owner.id, [realOne])).statusCode, 200);
  assert.deepEqual(await ids(owner.id), [realOne]);
  assert.equal((await request('PUT', owner.id, [noneId])).statusCode, 200);
  assert.deepEqual(await ids(owner.id), []);
  assert.deepEqual(await ids(other.id), [realOne, realTwo].sort());
  const emptyProfile = await request('GET', owner.id);
  assert.equal(emptyProfile.statusCode, 200);
  assert.deepEqual(emptyProfile.json().physicalLimitations, []);

  const ambiguousUpdate = await request('PUT', owner.id, [noneId, realTwo]);
  assert.equal(ambiguousUpdate.statusCode, 400);
  assert.match(ambiguousUpdate.json().error, /Nenhuma.*combinada/);
  assert.deepEqual(await ids(owner.id), []);
  assert.equal((await request('PUT', owner.id, ['Nenhuma'])).statusCode, 200);
  assert.deepEqual(await ids(owner.id), []);

  // Model pre-existing links in the isolated schema, including a mixed legacy row.
  const ownerProfile = await db.profile.findUniqueOrThrow({ where: { userId: owner.id } });
  const otherProfile = await db.profile.findUniqueOrThrow({ where: { userId: other.id } });
  await db.profilePhysicalLimitation.createMany({ data: [
    { profileId: ownerProfile.id, physicalLimitationId: noneId },
    { profileId: otherProfile.id, physicalLimitationId: noneId },
  ] });
  await db.physicalLimitation.update({ where: { id: noneId }, data: { name: 'Nome incompatível' } });
  await assert.rejects(db.$executeRawUnsafe(migration));
  assert.deepEqual(await ids(owner.id), [noneId]);
  await db.physicalLimitation.update({ where: { id: noneId }, data: { name: 'Nenhuma' } });

  await db.$executeRawUnsafe(migration);
  assert.deepEqual(await ids(owner.id), []);
  assert.deepEqual(await ids(other.id), [realOne, realTwo].sort());
  assert.deepEqual(await db.physicalLimitation.findUnique({ where: { id: noneId } }), {
    id: noneId, name: 'Nenhuma', isCustom: false, ownerId: null,
  });
  await db.$executeRawUnsafe(migration);
  assert.deepEqual(await ids(other.id), [realOne, realTwo].sort());
  console.log('PASS Nenhuma: criação/edição, rejeição 400, isolamento, migration defensiva e idempotente.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
