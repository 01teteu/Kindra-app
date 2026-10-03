import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { runPrisma } from './postgresql-test-db.js';
import { loadCareCatalogs, seedCareCatalogs } from '../../../prisma/care-seed.js';
import type { ProfileInput } from '../schemas/profile.schema.js';

const originalUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['postgresql:', 'postgres:'].includes(originalUrl.protocol) ||
    !['localhost', '127.0.0.1'].includes(originalUrl.hostname)) {
  throw new Error('AUD-04 exige PostgreSQL local e schema temporário.');
}
const schema = `kindra_test_${randomUUID().replaceAll('-', '')}`;
const admin = new PrismaClient({ datasources: { db: { url: originalUrl.toString() } } });
const project = mkdtempSync(path.join(tmpdir(), 'kindra-aud04-'));
const temporaryPrisma = path.join(project, 'prisma');
const temporaryMigrations = path.join(temporaryPrisma, 'migrations');
const sourceMigrations = path.resolve('prisma/migrations');
const aud04Migration = '20260930120000_care_item_ownership';
let db: PrismaClient | undefined;
let app: ReturnType<typeof Fastify> | undefined;

const input: ProfileInput = {
  firstName: 'Pessoa', lastName: 'Teste', birthDate: '1990-01-01', biologicalSex: 'FEMALE',
  weightKg: 70, heightCm: 170, activityLevel: 'Moderado', goal: 'Manutencao', isPCD: false,
  allergies: [] as string[], limitations: [] as string[],
};

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const testUrl = new URL(originalUrl);
  testUrl.searchParams.set('schema', schema);
  process.env.DATABASE_URL = testUrl.toString();

  mkdirSync(temporaryMigrations, { recursive: true });
  cpSync(path.resolve('prisma/schema.prisma'), path.join(temporaryPrisma, 'schema.prisma'));
  for (const entry of readdirSync(sourceMigrations)) {
    if (entry === aud04Migration) continue;
    cpSync(path.join(sourceMigrations, entry), path.join(temporaryMigrations, entry), { recursive: true });
  }
  const temporarySchema = path.join(temporaryPrisma, 'schema.prisma');
  // Reconstruct the prior database state in an isolated schema, then apply the
  // new migration to real legacy fixtures. The personal public schema is untouched.
  runPrisma(['migrate', 'deploy', '--schema', temporarySchema]);
  db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  const client = db;
  const users = await Promise.all(['legacy-a', 'legacy-b'].map(label =>
    client.user.create({ data: { email: `${label}@example.test` } })));
  const profiles = await Promise.all(users.map(user => client.profile.create({ data: {
    userId: user.id, firstName: 'Legado', lastName: 'Teste', birthDate: new Date('1990-01-01'),
    weightKg: 70, heightCm: 170, activityLevel: 'Moderado', goal: 'Manutencao',
  } })));
  const legacy = {
    allergy: { one: randomUUID(), shared: randomUUID(), orphan: randomUUID(), official: randomUUID() },
    limitation: { one: randomUUID(), shared: randomUUID(), orphan: randomUUID(), official: randomUUID() },
  };
  for (const [kind, table] of [['allergy', 'allergies'], ['limitation', 'physical_limitations']] as const) {
    const ids = legacy[kind];
    for (const [key, id] of Object.entries(ids)) {
      const name = `${kind} ${key}`;
      await client.$executeRawUnsafe(
        `INSERT INTO ${table} (id, name, "isCustom") VALUES ($1, $2, $3)`,
        id, name, key !== 'official',
      );
    }
  }
  await client.$executeRawUnsafe(
    'INSERT INTO physical_limitations (id, name, "isCustom") VALUES ($1, $2, false)',
    '09ab1d62-180a-4ba4-8b1e-836065ddab42', 'Nenhuma',
  );
  await client.profileAllergy.createMany({ data: [
    { profileId: profiles[0].id, allergyId: legacy.allergy.one },
    { profileId: profiles[0].id, allergyId: legacy.allergy.shared },
    { profileId: profiles[1].id, allergyId: legacy.allergy.shared },
    { profileId: profiles[1].id, allergyId: legacy.allergy.official },
  ] });
  await client.profilePhysicalLimitation.createMany({ data: [
    { profileId: profiles[0].id, physicalLimitationId: legacy.limitation.one },
    { profileId: profiles[0].id, physicalLimitationId: legacy.limitation.shared },
    { profileId: profiles[1].id, physicalLimitationId: legacy.limitation.shared },
    { profileId: profiles[1].id, physicalLimitationId: legacy.limitation.official },
  ] });

  cpSync(path.join(sourceMigrations, aud04Migration), path.join(temporaryMigrations, aud04Migration), { recursive: true });
  runPrisma(['migrate', 'deploy', '--schema', temporarySchema]);
  const visible = async (kind: 'allergy' | 'limitation', profileId: string) => {
    const rows = kind === 'allergy'
      ? await client.profileAllergy.findMany({ where: { profileId }, include: { allergy: true } })
      : await client.profilePhysicalLimitation.findMany({ where: { profileId }, include: { physicalLimitation: true } });
    return rows.map(row => kind === 'allergy'
      ? 'allergy' in row && row.allergy.name
      : 'physicalLimitation' in row && row.physicalLimitation.name).sort();
  };
  for (const kind of ['allergy', 'limitation'] as const) {
    const ids = legacy[kind];
    const one = kind === 'allergy'
      ? await client.allergy.findUniqueOrThrow({ where: { id: ids.one } })
      : await client.physicalLimitation.findUniqueOrThrow({ where: { id: ids.one } });
    assert.equal(one.ownerId, users[0].id);
    const shared = kind === 'allergy'
      ? await client.allergy.findUnique({ where: { id: ids.shared } })
      : await client.physicalLimitation.findUnique({ where: { id: ids.shared } });
    const orphan = kind === 'allergy'
      ? await client.allergy.findUnique({ where: { id: ids.orphan } })
      : await client.physicalLimitation.findUnique({ where: { id: ids.orphan } });
    assert.equal(shared, null);
    assert.equal(orphan, null);
    const copies = kind === 'allergy'
      ? await client.allergy.findMany({ where: { name: `${kind} shared` } })
      : await client.physicalLimitation.findMany({ where: { name: `${kind} shared` } });
    assert.equal(copies.length, 2);
    assert.deepEqual(copies.map(row => row.ownerId).sort(), users.map(user => user.id).sort());
    assert.notEqual(copies[0].id, copies[1].id);
    assert.deepEqual(await visible(kind, profiles[0].id), [`${kind} one`, `${kind} shared`]);
    assert.deepEqual(await visible(kind, profiles[1].id), [`${kind} official`, `${kind} shared`]);
  }
  assert.equal((await client.physicalLimitation.findUniqueOrThrow({
    where: { id: '09ab1d62-180a-4ba4-8b1e-836065ddab42' },
  })).ownerId, null);
  assert.equal(await client.profilePhysicalLimitation.count({
    where: { physicalLimitationId: '09ab1d62-180a-4ba4-8b1e-836065ddab42' },
  }), 0);
  await assert.rejects(client.allergy.create({ data: { name: 'Sem dono', isCustom: true } }));
  await assert.rejects(client.physicalLimitation.create({ data: { name: 'Oficial com dono', isCustom: false, ownerId: users[0].id } }));
  await assert.rejects(client.allergy.create({ data: { name: 'allergy official', isCustom: false } }));
  await seedCareCatalogs(client, loadCareCatalogs());

  const { profileRoutes } = await import('../routes/profile.routes.js');
  app = Fastify();
  await app.register(jwt, { secret: randomUUID() });
  await app.register(profileRoutes, { prefix: '/api/profile' });
  const headers = (id: string) => ({ authorization: `Bearer ${app!.jwt.sign({ id, scope: 'session' })}` });
  const request = (method: 'POST' | 'PUT', id: string, allergies: string[], limitations: string[]) =>
    app!.inject({ method, url: `/api/profile/${method === 'PUT' ? '?referenceDate=' + new Date().toISOString().slice(0, 10) + '&timezoneOffset=0' : ''}`,
      headers: headers(id), payload: { ...input, allergies, limitations } });
  const a = await client.user.create({ data: { email: 'aud04-a@example.test' } });
  const b = await client.user.create({ data: { email: 'aud04-b@example.test' } });
  const rejected = await client.user.create({ data: { email: 'aud04-rejected@example.test' } });
  const ownAllergy = await client.allergy.create({ data: { name: 'Própria A', isCustom: true, ownerId: a.id } });
  const ownLimitation = await client.physicalLimitation.create({ data: { name: 'Própria limitação A', isCustom: true, ownerId: a.id } });
  const foreignAllergy = (await client.allergy.create({
    data: { name: 'Allergy shared', isCustom: true, ownerId: users[1].id },
  })).id;
  const foreignLimitation = (await client.physicalLimitation.findFirstOrThrow({
    where: { name: 'limitation shared', ownerId: users[1].id },
  })).id;
  const missing = randomUUID();
  const foreignCreate = await request('POST', rejected.id, [foreignAllergy], []);
  const missingCreate = await request('POST', rejected.id, [missing], []);
  const malformedCreate = await request('POST', rejected.id, ['zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'], []);
  assert.equal(foreignCreate.statusCode, 400);
  assert.equal(missingCreate.statusCode, 400);
  assert.deepEqual(foreignCreate.json(), missingCreate.json());
  assert.deepEqual(foreignCreate.json(), malformedCreate.json());
  assert.equal((await request('POST', rejected.id, [ownAllergy.id, foreignAllergy], [])).statusCode, 400);
  assert.equal(await client.profile.count({ where: { userId: rejected.id } }), 0);
  assert.equal((await request('POST', rejected.id, ['Rollback temporário', foreignAllergy], [])).statusCode, 400);
  assert.equal(await client.allergy.count({ where: { name: 'Rollback temporário' } }), 0);

  const officialAllergy = (await client.allergy.findFirstOrThrow({ where: { isCustom: false } })).id;
  const officialLimitation = (await client.physicalLimitation.findFirstOrThrow({
    where: { isCustom: false, name: { not: 'Nenhuma' } },
  })).id;
  const createdA = await request('POST', a.id, [ownAllergy.id, officialAllergy, 'allergy shared'], [ownLimitation.id, officialLimitation]);
  assert.equal(createdA.statusCode, 201, createdA.body);
  const createdB = await request('POST', b.id, ['allergy shared'], ['Nenhuma']);
  assert.equal(createdB.statusCode, 201, createdB.body);
  const aShared = await client.allergy.findUniqueOrThrow({ where: { ownerId_name: { ownerId: a.id, name: 'Allergy shared' } } });
  const bShared = await client.allergy.findUniqueOrThrow({ where: { ownerId_name: { ownerId: b.id, name: 'Allergy shared' } } });
  assert.notEqual(aShared.id, bShared.id);
  assert.notEqual(aShared.id, foreignAllergy);
  assert.equal(await client.profilePhysicalLimitation.count({ where: { profile: { userId: b.id } } }), 0);
  assert.equal('ownerId' in createdA.json().profile.allergies[0].allergy, false);
  assert.equal((await request('POST', rejected.id, [officialAllergy, officialAllergy], [])).statusCode, 400);
  assert.equal(await client.profile.count({ where: { userId: rejected.id } }), 0);
  assert.equal((await request('PUT', b.id, [officialAllergy], [officialLimitation])).statusCode, 200);

  const before = await client.profile.findUniqueOrThrow({ where: { userId: a.id },
    include: { allergies: true, physicalLimitations: true } });
  const foreignUpdate = await request('PUT', a.id, [foreignAllergy], [ownLimitation.id]);
  const missingUpdate = await request('PUT', a.id, [missing], [ownLimitation.id]);
  assert.equal(foreignUpdate.statusCode, 400);
  assert.deepEqual(foreignUpdate.json(), missingUpdate.json());
  assert.equal((await request('PUT', a.id, [ownAllergy.id], [foreignLimitation])).statusCode, 400);
  assert.equal((await request('PUT', a.id, ['Outro rollback', foreignAllergy], [])).statusCode, 400);
  assert.equal(await client.allergy.count({ where: { name: 'Outro rollback' } }), 0);
  assert.deepEqual(await client.profile.findUniqueOrThrow({ where: { userId: a.id },
    include: { allergies: true, physicalLimitations: true } }), before);
  assert.equal((await request('PUT', a.id, [ownAllergy.id, officialAllergy, aShared.id], [ownLimitation.id])).statusCode, 200);
  assert.equal((await request('PUT', a.id, [officialAllergy], ['Nenhuma'])).statusCode, 200);
  assert.equal((await request('PUT', a.id, [ownAllergy.id], [ownLimitation.id])).statusCode, 200);
  assert.equal((await request('PUT', a.id, [ownAllergy.id, ownAllergy.id], [])).statusCode, 400);
  assert.equal((await request('PUT', a.id, [], ['Nenhuma', officialLimitation])).statusCode, 400);
  assert.equal((await request('POST', rejected.id, [], ['Nenhuma', officialLimitation])).statusCode, 400);

  const { updateProfile } = await import('../services/profile.service.js');
  const race = await Promise.allSettled([
    updateProfile(a.id, { ...input, allergies: ['Nome de corrida'], limitations: [ownLimitation.id] }, new Date().toISOString().slice(0, 10), 0),
    updateProfile(a.id, { ...input, allergies: ['Nome de corrida'], limitations: [ownLimitation.id] }, new Date().toISOString().slice(0, 10), 0),
  ]);
  assert.deepEqual(race.map(result => result.status), ['fulfilled', 'fulfilled'],
    race.map(result => result.status === 'rejected' ? String(result.reason?.code ?? result.reason?.message) : 'ok').join(', '));
  assert.equal(await client.allergy.count({ where: { ownerId: a.id, name: 'Nome de corrida' } }), 1);
  const bBefore = await client.allergy.count({ where: { ownerId: b.id } });
  await client.user.delete({ where: { id: a.id } });
  assert.equal(await client.allergy.count({ where: { ownerId: a.id } }), 0);
  assert.equal(await client.physicalLimitation.count({ where: { ownerId: a.id } }), 0);
  assert.equal(await client.allergy.count({ where: { ownerId: b.id } }), bBefore);
  console.log('PASS AUD-04: migration A/B/C, ownership, nomes, atomicidade, Nenhuma, constraints, corrida e cascade.');
} finally {
  await app?.close();
  await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  rmSync(project, { recursive: true, force: true });
}
