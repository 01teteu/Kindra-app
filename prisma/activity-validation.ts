import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ExerciseMeasurementType, ExerciseLaterality, CardioMeasurementType, SportMeasurementType, SportEnvironment, SportParticipantMode, EnergyProfileDomain, EnergySourceMode } from '@prisma/client';
import * as vocabulary from './activity-vocabulary.js';

export class CatalogValidationError extends Error {}
const text = z.string().min(1).refine(value => value.trim() === value && value.length > 0, 'Texto vazio ou espaços externos');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const media = z.strictObject({ thumbnailUrl: z.url({ protocol: /^https?$/ }).nullable(), videoUrl: z.url({ protocol: /^https?$/ }).nullable() });
const base = { name: text, slug, aliases: z.array(text), isActive: z.boolean(), media };
const exercise = z.strictObject({
  ...base,
  primaryMuscle: z.enum(vocabulary.exercises_primaryMuscle),
  secondaryMuscles: z.array(z.enum(vocabulary.exercises_secondaryMuscles)),
  muscleRegion: z.enum(vocabulary.exercises_muscleRegion),
  equipment: z.enum(vocabulary.exercises_equipment),
  movementPattern: z.enum(vocabulary.exercises_movementPattern),
  measurementType: z.enum(ExerciseMeasurementType), laterality: z.enum(ExerciseLaterality), instructions: text,
});
const cardio = z.strictObject({
  ...base, category: z.enum(vocabulary.cardio_activities_category), equipment: z.enum(vocabulary.cardio_activities_equipment),
  measurementType: z.enum(CardioMeasurementType), energyProfileSlug: slug, instructions: text,
  supportedMetrics: z.strictObject({ duration: z.boolean(), distance: z.boolean(), pace: z.boolean(), speed: z.boolean(), heartRate: z.boolean(), incline: z.boolean(), resistance: z.boolean(), reps: z.boolean() }),
}).refine(x => x.measurementType === 'DISTANCE_TIME' ? x.supportedMetrics.distance && x.supportedMetrics.duration : x.measurementType === 'TIME' ? x.supportedMetrics.duration : x.supportedMetrics.reps, 'Métricas incompatíveis com measurementType');
const sport = z.strictObject({
  ...base, category: z.enum(vocabulary.sports_category), environment: z.enum(SportEnvironment), participantMode: z.enum(SportParticipantMode),
  measurementType: z.enum(SportMeasurementType), energyProfileSlug: slug, description: text,
  supportedMetrics: z.strictObject({ duration: z.boolean(), distance: z.boolean(), heartRate: z.boolean(), rounds: z.boolean(), score: z.boolean() }),
}).refine(x => x.supportedMetrics.duration && (x.measurementType === 'DISTANCE_TIME' ? x.supportedMetrics.distance : x.measurementType === 'ROUNDS_TIME' ? x.supportedMetrics.rounds : true), 'Métricas incompatíveis com measurementType');
const profile = z.strictObject({
  name: text, slug, domain: z.enum(EnergyProfileDomain), isActive: z.boolean(),
  met: z.strictObject({ LIGHT: z.number().finite().positive(), MODERATE: z.number().finite().positive(), VIGOROUS: z.number().finite().positive() })
    .refine(x => x.LIGHT <= x.MODERATE && x.MODERATE <= x.VIGOROUS, 'MET deve seguir LIGHT <= MODERATE <= VIGOROUS'),
  source: z.strictObject({ name: text, mode: z.enum(EnergySourceMode), note: text }),
});
const catalogSchema = z.strictObject({ exercises: z.array(exercise).nonempty(), cardio: z.array(cardio).nonempty(), sports: z.array(sport).nonempty(), profiles: z.array(profile).nonempty() });
export type ActivityCatalogs = z.infer<typeof catalogSchema>;

export function validateActivityCatalogs(input: unknown): ActivityCatalogs {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) throw new CatalogValidationError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  const data = parsed.data;
  for (const [name, rows] of Object.entries(data)) {
    const slugs = new Set<string>();
    for (const row of rows) {
      if (slugs.has(row.slug)) throw new CatalogValidationError(`${name}: slug duplicado ${row.slug}`);
      slugs.add(row.slug);
    }
  }
  const profiles = new Map(data.profiles.map(row => [row.slug, row]));
  for (const [rows, domain] of [[data.cardio, 'CARDIO'], [data.sports, 'SPORT']] as const) {
    for (const row of rows) {
      const energy = profiles.get(row.energyProfileSlug);
      if (!energy || energy.domain !== domain || (row.isActive && !energy.isActive)) {
        throw new CatalogValidationError(`${row.slug}: EnergyProfile ausente, inativo ou com domínio incompatível`);
      }
    }
  }
  const strength = profiles.get('strength-training');
  if (!strength || strength.domain !== 'STRENGTH') throw new CatalogValidationError('Perfil strength-training ausente ou incompatível');
  return data;
}

export function loadActivityCatalogs(directory = path.resolve('prisma/seed-data')): ActivityCatalogs {
  function read(file: string): unknown {
    try { return JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); }
    catch { throw new CatalogValidationError(`${file}: arquivo ausente ou JSON inválido`); }
  }
  return validateActivityCatalogs({ exercises: read('exercises.json'), cardio: read('cardio-activities.json'), sports: read('sports.json'), profiles: read('energy-profiles.json') });
}
