import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import type { CreatePlanInput } from '../schemas/weekly-training.schema.js';
import type { TrainingWeekday } from '../../shared/weeklyTraining.js';
import type { StarterTrainingInput } from '../../shared/starterTraining.js';
import { generateStarterTrainingPlan, StarterTrainingError } from '../domain/starter-training.js';

export class WeeklyTrainingError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}
const planSelect = {
  id: true, name: true, source: true, isActive: true,
  days: { orderBy: { dayOfWeek: 'asc' }, select: {
    id: true, dayOfWeek: true, routineId: true,
    routine: { select: { id: true, name: true, _count: { select: { exercises: true } } } },
  } },
} satisfies Prisma.WeeklyTrainingPlanSelect;
type PlanRow = Prisma.WeeklyTrainingPlanGetPayload<{ select: typeof planSelect }>;
const response = (plan: PlanRow) => ({ ...plan, days: plan.days.map(day => ({ ...day,
  routine: { id: day.routine.id, name: day.routine.name, exerciseCount: day.routine._count.exercises },
})) });

// Same Serializable + bounded retry pattern as workout session mutations.
// The partial unique index remains the final guard even for direct SQL writes.
async function transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(error.code === 'P2034' || error.code === 'P2002' ||
          (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) throw error;
      if (attempt >= 2) throw new WeeklyTrainingError(409, 'Plano alterado simultaneamente. Tente novamente.');
    }
  }
}
async function requirePlan(tx: Prisma.TransactionClient, userId: string, planId: string) {
  const plan = await tx.weeklyTrainingPlan.findFirst({ where: { id: planId, userId }, select: planSelect });
  if (!plan) throw new WeeklyTrainingError(404, 'Plano não encontrado.');
  return plan;
}
async function requireRoutines(tx: Prisma.TransactionClient, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (await tx.routine.count({ where: { id: { in: unique }, userId } }) !== unique.length)
    throw new WeeklyTrainingError(404, 'Rotina não encontrada.');
}
export async function listPlans(userId: string) {
  return (await prisma.weeklyTrainingPlan.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: planSelect })).map(response);
}
export async function getPlan(userId: string, planId: string) { return response(await requirePlan(prisma, userId, planId)); }
export async function getActivePlan(userId: string) {
  const plan = await prisma.weeklyTrainingPlan.findFirst({ where: { userId, isActive: true }, select: planSelect });
  return plan ? response(plan) : null;
}
export function createPlan(userId: string, input: CreatePlanInput) {
  return transaction(async tx => {
    await requireRoutines(tx, userId, (input.days ?? []).map(day => day.routineId));
    const active = await tx.weeklyTrainingPlan.findFirst({ where: { userId, isActive: true }, select: { id: true } });
    return response(await tx.weeklyTrainingPlan.create({ data: {
      userId, name: input.name, source: input.source, isActive: !active,
      days: { create: input.days ?? [] },
    }, select: planSelect }));
  });
}
export function generatePlan(userId: string, input: StarterTrainingInput) {
  return transaction(async tx => {
    const profile = await tx.profile.findUnique({ where: { userId }, select: { physicalLimitations: { select: { physicalLimitationId: true } } } });
    if (!profile) throw new WeeklyTrainingError(409, 'Conclua seu perfil antes de criar uma base inicial.');
    if (profile.physicalLimitations.length) throw new WeeklyTrainingError(422,
      'A geração de base inicial ainda não adapta exercícios às limitações físicas cadastradas no seu perfil. Você pode montar sua semana manualmente.');
    const catalog = await tx.exercise.findMany({ where: {
      isActive: true, measurementType: 'WEIGHT_REPS', equipment: { in: input.equipment },
      OR: [{ origin: 'GLOBAL', userId: null }, { origin: 'CUSTOM', userId }],
    }, select: { id: true, slug: true, origin: true, primaryMuscle: true, movementPattern: true,
      equipment: true, laterality: true, measurementType: true } });
    let structure;
    try { structure = generateStarterTrainingPlan(input, catalog); }
    catch (error) {
      if (error instanceof StarterTrainingError) throw new WeeklyTrainingError(422, error.message);
      throw error;
    }
    // Match routine creation's shared row locks. Catalog deactivation/edits
    // racing this transaction must serialize before or after generation.
    const ids = [...new Set(structure.routines.flatMap(routine => routine.exercises.map(ex => ex.exerciseId)))].sort();
    await tx.$queryRaw`SELECT id FROM exercises WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`;
    const routines = [];
    for (const routine of structure.routines) {
      routines.push(await tx.routine.create({ data: { userId, name: routine.name,
        exercises: { create: routine.exercises } }, select: { id: true } }));
    }
    const active = await tx.weeklyTrainingPlan.findFirst({ where: { userId, isActive: true }, select: { id: true } });
    return response(await tx.weeklyTrainingPlan.create({ data: {
      userId, name: structure.name, source: 'GENERATED', isActive: !active,
      days: { create: structure.days.map(day => ({ dayOfWeek: day.dayOfWeek, routineId: routines[day.routineIndex].id })) },
    }, select: planSelect }));
  });
}
export function renamePlan(userId: string, planId: string, name: string) {
  return transaction(async tx => {
    await requirePlan(tx, userId, planId);
    return response(await tx.weeklyTrainingPlan.update({ where: { id: planId }, data: { name }, select: planSelect }));
  });
}
export function activatePlan(userId: string, planId: string) {
  return transaction(async tx => {
    await requirePlan(tx, userId, planId);
    await tx.weeklyTrainingPlan.updateMany({ where: { userId, isActive: true, id: { not: planId } }, data: { isActive: false } });
    return response(await tx.weeklyTrainingPlan.update({ where: { id: planId }, data: { isActive: true }, select: planSelect }));
  });
}
export function setDay(userId: string, planId: string, dayOfWeek: TrainingWeekday, routineId: string) {
  return transaction(async tx => {
    await requirePlan(tx, userId, planId);
    await requireRoutines(tx, userId, [routineId]);
    await tx.weeklyTrainingDay.upsert({ where: { planId_dayOfWeek: { planId, dayOfWeek } },
      create: { planId, dayOfWeek, routineId }, update: { routineId } });
    await tx.weeklyTrainingPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } });
    return response(await requirePlan(tx, userId, planId));
  });
}
export function removeDay(userId: string, planId: string, dayOfWeek: TrainingWeekday) {
  return transaction(async tx => {
    await requirePlan(tx, userId, planId);
    await tx.weeklyTrainingDay.deleteMany({ where: { planId, dayOfWeek } });
    await tx.weeklyTrainingPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } });
    return response(await requirePlan(tx, userId, planId));
  });
}
