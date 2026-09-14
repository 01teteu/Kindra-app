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
    const profileIds = new Map<string, string>();
    for (const row of source.profiles) {
      const { met, source: citation, ...base } = row;
      const data = { ...base, metLight: met.LIGHT, metModerate: met.MODERATE, metVigorous: met.VIGOROUS, sourceName: citation.name, sourceMode: citation.mode, sourceNote: citation.note };
      const existing = await tx.energyProfile.findUnique({ where: { slug: row.slug } });
      if (!existing) {
        const created = await tx.energyProfile.create({ data });
        profileIds.set(row.slug, created.id); summary.profiles.created++;
      } else {
        if (changed(existing, data)) { await tx.energyProfile.update({ where: { id: existing.id }, data }); summary.profiles.updated++; }
        else summary.profiles.unchanged++;
        profileIds.set(row.slug, existing.id);
      }
    }
    for (const row of source.exercises) {
      const { media, ...fields } = row;
      const data = { ...fields, ...media, origin: 'GLOBAL' as const, userId: null };
      const existing = await tx.exercise.findFirst({ where: { origin: 'GLOBAL', userId: null, slug: row.slug } });
      if (!existing) { await tx.exercise.create({ data }); summary.exercises.created++; }
      else if (changed(existing, data)) { await tx.exercise.update({ where: { id: existing.id }, data }); summary.exercises.updated++; }
      else summary.exercises.unchanged++;
    }
    function profileId(slug: string): string {
      const id = profileIds.get(slug);
      if (!id) throw new CatalogValidationError(`EnergyProfile não resolvido: ${slug}`);
      return id;
    }
    for (const row of source.cardio) {
      const { media, supportedMetrics: m, energyProfileSlug, ...fields } = row;
      const data = { ...fields, ...media, energyProfileId: profileId(energyProfileSlug), supportsDuration: m.duration, supportsDistance: m.distance, supportsPace: m.pace, supportsSpeed: m.speed, supportsHeartRate: m.heartRate, supportsIncline: m.incline, supportsResistance: m.resistance, supportsReps: m.reps };
      const existing = await tx.cardioActivity.findUnique({ where: { slug: row.slug } });
      if (!existing) { await tx.cardioActivity.create({ data }); summary.cardio.created++; }
      else if (changed(existing, data)) { await tx.cardioActivity.update({ where: { id: existing.id }, data }); summary.cardio.updated++; }
      else summary.cardio.unchanged++;
    }
    for (const row of source.sports) {
      const { media, supportedMetrics: m, energyProfileSlug, ...fields } = row;
      const data = { ...fields, ...media, energyProfileId: profileId(energyProfileSlug), supportsDuration: m.duration, supportsDistance: m.distance, supportsHeartRate: m.heartRate, supportsRounds: m.rounds, supportsScore: m.score };
      const existing = await tx.sport.findUnique({ where: { slug: row.slug } });
      if (!existing) { await tx.sport.create({ data }); summary.sports.created++; }
      else if (changed(existing, data)) { await tx.sport.update({ where: { id: existing.id }, data }); summary.sports.updated++; }
      else summary.sports.unchanged++;
    }
    summary.exercises.archived = (await tx.exercise.updateMany({ where: { origin: 'GLOBAL', userId: null, isActive: true, slug: { notIn: source.exercises.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.cardio.archived = (await tx.cardioActivity.updateMany({ where: { isActive: true, slug: { notIn: source.cardio.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.sports.archived = (await tx.sport.updateMany({ where: { isActive: true, slug: { notIn: source.sports.map(x => x.slug) } }, data: { isActive: false } })).count;
    summary.profiles.archived = (await tx.energyProfile.updateMany({ where: { isActive: true, slug: { notIn: source.profiles.map(x => x.slug) } }, data: { isActive: false } })).count;
    return summary;
  }, { timeout: 60000, maxWait: 60000 });
}
