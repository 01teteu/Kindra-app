import { PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { validateActivityCatalogs, CatalogValidationError } from './activity-validation.js';

// Compare only source-managed fields. Never churn timestamps on a no-op run.
function changed(existing: object, data: object): boolean {
  return Object.entries(data).some(([key, value]) => !isDeepStrictEqual(Reflect.get(existing, key), value));
}

export async function seedActivityCatalogs(prisma: PrismaClient, input: unknown) {
  const source = validateActivityCatalogs(input);
  return prisma.$transaction(async tx => {
    // Transaction-scoped lock: independent CLI invocations cannot race the global seed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74123, 4152669)`;
    const summary = {
      profiles: { created: 0, updated: 0, unchanged: 0, archived: 0 },
      exercises: { created: 0, updated: 0, unchanged: 0, archived: 0 },
      cardio: { created: 0, updated: 0, unchanged: 0, archived: 0 },
      sports: { created: 0, updated: 0, unchanged: 0, archived: 0 },
    };
    const existingProfiles = new Map((await tx.energyProfile.findMany({ where: { slug: { in: source.profiles.map(x => x.slug) } } })).map(x => [x.slug, x]));
    const profileIds = new Map([...existingProfiles].map(([slug, profile]) => [slug, profile.id]));
    const profileRows = source.profiles.map(row => {
      const { met, source: citation, ...base } = row;
      const data = { ...base, metLight: met.LIGHT, metModerate: met.MODERATE, metVigorous: met.VIGOROUS, sourceName: citation.name, sourceMode: citation.mode, sourceNote: citation.note };
      return { slug: row.slug, data };
    });
    const newProfiles = profileRows.filter(({ slug }) => !existingProfiles.has(slug)).map(({ data }) => data);
    if (newProfiles.length) {
      summary.profiles.created = (await tx.energyProfile.createMany({ data: newProfiles })).count;
      const created = await tx.energyProfile.findMany({ where: { slug: { in: newProfiles.map(x => x.slug) } }, select: { slug: true, id: true } });
      for (const profile of created) profileIds.set(profile.slug, profile.id);
    }
    for (const { slug, data } of profileRows) {
      const existing = existingProfiles.get(slug);
      if (!existing) continue;
      if (changed(existing, data)) { await tx.energyProfile.update({ where: { id: existing.id }, data }); summary.profiles.updated++; }
      else summary.profiles.unchanged++;
    }
    const existingExercises = new Map((await tx.exercise.findMany({ where: { origin: 'GLOBAL', userId: null, slug: { in: source.exercises.map(x => x.slug) } } })).map(x => [x.slug, x]));
    const exerciseRows = source.exercises.map(row => {
      const { media, ...fields } = row;
      const data = { ...fields, ...media, origin: 'GLOBAL' as const, userId: null };
      return { slug: row.slug, data };
    });
    const newExercises = exerciseRows.filter(({ slug }) => !existingExercises.has(slug)).map(({ data }) => data);
    if (newExercises.length) summary.exercises.created = (await tx.exercise.createMany({ data: newExercises })).count;
    for (const { slug, data } of exerciseRows) {
      const existing = existingExercises.get(slug);
      if (!existing) continue;
      if (changed(existing, data)) { await tx.exercise.update({ where: { id: existing.id }, data }); summary.exercises.updated++; }
      else summary.exercises.unchanged++;
    }
    function profileId(slug: string): string {
      const id = profileIds.get(slug);
      if (!id) throw new CatalogValidationError(`EnergyProfile não resolvido: ${slug}`);
      return id;
    }
    const existingCardio = new Map((await tx.cardioActivity.findMany({ where: { slug: { in: source.cardio.map(x => x.slug) } } })).map(x => [x.slug, x]));
    const cardioRows = source.cardio.map(row => {
      const { media, supportedMetrics: m, energyProfileSlug, ...fields } = row;
      const data = { ...fields, ...media, energyProfileId: profileId(energyProfileSlug), supportsDuration: m.duration, supportsDistance: m.distance, supportsPace: m.pace, supportsSpeed: m.speed, supportsHeartRate: m.heartRate, supportsIncline: m.incline, supportsResistance: m.resistance, supportsReps: m.reps };
      return { slug: row.slug, data };
    });
    const newCardio = cardioRows.filter(({ slug }) => !existingCardio.has(slug)).map(({ data }) => data);
    if (newCardio.length) summary.cardio.created = (await tx.cardioActivity.createMany({ data: newCardio })).count;
    for (const { slug, data } of cardioRows) {
      const existing = existingCardio.get(slug);
      if (!existing) continue;
      if (changed(existing, data)) { await tx.cardioActivity.update({ where: { id: existing.id }, data }); summary.cardio.updated++; }
      else summary.cardio.unchanged++;
    }
    const existingSports = new Map((await tx.sport.findMany({ where: { slug: { in: source.sports.map(x => x.slug) } } })).map(x => [x.slug, x]));
    const sportRows = source.sports.map(row => {
      const { media, supportedMetrics: m, energyProfileSlug, ...fields } = row;
      const data = { ...fields, ...media, energyProfileId: profileId(energyProfileSlug), supportsDuration: m.duration, supportsDistance: m.distance, supportsHeartRate: m.heartRate, supportsRounds: m.rounds, supportsScore: m.score };
      return { slug: row.slug, data };
    });
    const newSports = sportRows.filter(({ slug }) => !existingSports.has(slug)).map(({ data }) => data);
    if (newSports.length) summary.sports.created = (await tx.sport.createMany({ data: newSports })).count;
    for (const { slug, data } of sportRows) {
      const existing = existingSports.get(slug);
      if (!existing) continue;
      if (changed(existing, data)) { await tx.sport.update({ where: { id: existing.id }, data }); summary.sports.updated++; }
      else summary.sports.unchanged++;
    }
    summary.exercises.archived = (await tx.exercise.updateMany({ where: { origin: 'GLOBAL', userId: null, isActive: true, slug: { notIn: source.exercises.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.cardio.archived = (await tx.cardioActivity.updateMany({ where: { isActive: true, slug: { notIn: source.cardio.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.sports.archived = (await tx.sport.updateMany({ where: { isActive: true, slug: { notIn: source.sports.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.profiles.archived = (await tx.energyProfile.updateMany({ where: { isActive: true, slug: { notIn: source.profiles.map(x => x.slug) } }, data: { isActive: false } })).count;
    return summary;
  }, { timeout: 60000, maxWait: 60000 });
}
