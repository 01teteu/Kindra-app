import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import db from '../../../../server/db.js';
import { workoutRoutes } from '../../../../server/routes/workout.routes.js';

// Only this run's users and their dependent data are written/removed. No migrations.
export async function fixture() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Exige PostgreSQL local.');
  const ids: string[] = [];
  const app = Fastify();
  const cleanup = async () => {
    await app.close();
    try { await db.user.deleteMany({ where: { id: { in: ids } } }); }
    finally { await db.$disconnect(); }
  };
  try {
    await app.register(cookie);
    await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
    await app.register(workoutRoutes, { prefix: '/api/workouts' });
    const owner = await db.user.create({ data: { email: `live-${randomUUID()}@example.test`, emailVerified: true } });
    ids.push(owner.id);
    const exercise = await db.exercise.create({ data: {
      origin: 'CUSTOM', userId: owner.id, slug: `live-${randomUUID()}`, name: 'Supino integração Live', primaryMuscle: 'CHEST', equipment: 'BARBELL',
      measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST', movementPattern: 'PUSH',
      laterality: 'BILATERAL', instructions: 'Execute com controle.',
    } });
    const token = app.jwt.sign({ id: owner.id, scope: 'session' });
    return { app, db, owner, exercise, token, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
