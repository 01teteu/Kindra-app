import prisma from '../db.js';
import type { Prisma } from '@prisma/client';
import { calculateAndSaveNutritionGoal, checkAndConsolidateNutriHistory } from './nutrition.service.js';
import { ProfileInput } from '../schemas/profile.schema.js';

export async function getCatalogOptions() {
  const allergies = await prisma.allergy.findMany({
    where: { isCustom: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isCustom: true },
  });
  
  const limitations = await prisma.physicalLimitation.findMany({
    where: { isCustom: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isCustom: true },
  });

  return { allergies, limitations };
}

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
const isMalformedUUID = (str: string) =>
  /^[^\s-]{8}-[^\s-]{4}-[^\s-]{4}-[^\s-]{4}-[^\s-]{12}$/.test(str) && !isUUID(str);

const normalizeString = (str: string) => {
  const s = str.trim().toLowerCase();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const NO_LIMITATION_ID = '09ab1d62-180a-4ba4-8b1e-836065ddab42';
const isNoLimitation = (item: string) =>
  item.toLowerCase() === NO_LIMITATION_ID || normalizeString(item) === 'Nenhuma';

async function effectiveLimitations(items: string[], officialOptionExists: () => Promise<boolean>) {
  if (!items.some(isNoLimitation)) return items;
  if (items.length !== 1) {
    throw new ProfileUpdateError(400, '“Nenhuma” não pode ser combinada com outras limitações físicas.');
  }
  if (!(await officialOptionExists())) throw new Error('Opção oficial “Nenhuma” indisponível.');
  return [];
}

async function resolveAllergyIds(tx: Prisma.TransactionClient, userId: string, items: string[]) {
  const ids: string[] = [];
  for (const item of items) {
    if (isMalformedUUID(item)) throw new ProfileUpdateError(400, 'Opção de alergia inválida ou indisponível.');
    const name = normalizeString(item);
    const option = isUUID(item)
      ? await tx.allergy.findFirst({
          where: { id: item, OR: [{ isCustom: false, ownerId: null }, { isCustom: true, ownerId: userId }] },
          select: { id: true },
        })
      : (await tx.allergy.findFirst({
          where: { name, isCustom: false, ownerId: null },
          select: { id: true },
        })) ?? await tx.allergy.upsert({
          where: { ownerId_name: { ownerId: userId, name } },
          update: { name },
          create: { name, isCustom: true, ownerId: userId },
          select: { id: true },
        });
    if (!option) throw new ProfileUpdateError(400, 'Opção de alergia inválida ou indisponível.');
    ids.push(option.id);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ProfileUpdateError(400, 'Há opções repetidas entre as restrições informadas.');
  }
  return ids;
}

async function resolveLimitationIds(tx: Prisma.TransactionClient, userId: string, items: string[]) {
  const ids: string[] = [];
  for (const item of items) {
    if (isMalformedUUID(item)) throw new ProfileUpdateError(400, 'Opção de limitação inválida ou indisponível.');
    const name = normalizeString(item);
    const option = isUUID(item)
      ? await tx.physicalLimitation.findFirst({
          where: { id: item, OR: [{ isCustom: false, ownerId: null }, { isCustom: true, ownerId: userId }] },
          select: { id: true },
        })
      : (await tx.physicalLimitation.findFirst({
          where: { name, isCustom: false, ownerId: null },
          select: { id: true },
        })) ?? await tx.physicalLimitation.upsert({
          where: { ownerId_name: { ownerId: userId, name } },
          update: { name },
          create: { name, isCustom: true, ownerId: userId },
          select: { id: true },
        });
    if (!option) throw new ProfileUpdateError(400, 'Opção de limitação inválida ou indisponível.');
    ids.push(option.id);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ProfileUpdateError(400, 'Há opções repetidas entre as restrições informadas.');
  }
  return ids;
}

export async function createProfile(userId: string, data: ProfileInput, isRetry = false): Promise<any> {
  try {
    return await prisma.$transaction(async tx => {
      const limitations = await effectiveLimitations(data.limitations, async () => {
        const option = await tx.physicalLimitation.findUnique({ where: { id: NO_LIMITATION_ID } });
        return option?.name === 'Nenhuma' && option.isCustom === false && option.ownerId === null;
      });
      if (await tx.profile.findUnique({ where: { userId }, select: { id: true } })) {
        throw new Error('PROFILE_ALREADY_EXISTS');
      }
      const allergyIds = await resolveAllergyIds(tx, userId, data.allergies);
      const limitationIds = await resolveLimitationIds(tx, userId, limitations);
      return tx.profile.create({
        data: {
          userId,
          firstName: data.firstName,
          lastName: data.lastName,
          birthDate: new Date(data.birthDate),
          biologicalSex: data.biologicalSex,
          weightKg: data.weightKg,
          heightCm: data.heightCm,
          activityLevel: data.activityLevel,
          goal: data.goal,
          isPCD: data.isPCD,
          allergies: { create: allergyIds.map(allergyId => ({ allergyId })) },
          physicalLimitations: { create: limitationIds.map(physicalLimitationId => ({ physicalLimitationId })) },
        },
        include: {
          allergies: { include: { allergy: { select: { id: true, name: true, isCustom: true } } } },
          physicalLimitations: { include: { physicalLimitation: { select: { id: true, name: true, isCustom: true } } } },
        },
      });
    }, { timeout: 30000 });
  } catch (err: any) {
    // P2002: Unique constraint failed
    // A concurrent profile creation may have won the unique userId constraint.
    if (err.code === 'P2002' && !isRetry) {
      return createProfile(userId, data, true);
    }
    throw err;
  }
}

// Explicit DTO: no account fields, tokens or unrelated user data are returned.
const editableProfileSelect = {
  firstName: true, lastName: true, birthDate: true, biologicalSex: true,
  weightKg: true, heightCm: true, activityLevel: true, goal: true, isPCD: true,
  allergies: { select: { allergy: { select: { id: true, name: true } } } },
  physicalLimitations: { select: { physicalLimitation: { select: { id: true, name: true } } } },
} as const;

export class ProfileUpdateError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function getEditableProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: editableProfileSelect });
  if (!profile) throw new ProfileUpdateError(404, 'Perfil não encontrado. Conclua o cadastro inicial.');
  return profile;
}

export async function updateProfile(userId: string, data: ProfileInput, referenceDate: string, timezoneOffset: number, isRetry = false): Promise<any> {
  try {
    return await prisma.$transaction(async tx => {
    const existing = await tx.profile.findUnique({
      where: { userId }, include: { allergies: true, physicalLimitations: true },
    });
    if (!existing) throw new ProfileUpdateError(404, 'Perfil não encontrado. Conclua o cadastro inicial.');

    const limitations = await effectiveLimitations(data.limitations, async () => {
      const option = await tx.physicalLimitation.findUnique({ where: { id: NO_LIMITATION_ID } });
      return option?.name === 'Nenhuma' && option.isCustom === false && option.ownerId === null;
    });

    const allergyIds = await resolveAllergyIds(tx, userId, data.allergies);
    const limitationIds = await resolveLimitationIds(tx, userId, limitations);

    // Close pending days using the old goal, inside the same transaction.
    await checkAndConsolidateNutriHistory(userId, referenceDate, timezoneOffset, tx);
    await tx.profile.update({
      where: { userId },
      data: {
        firstName: data.firstName, lastName: data.lastName, birthDate: new Date(data.birthDate),
        biologicalSex: data.biologicalSex, weightKg: data.weightKg, heightCm: data.heightCm,
        activityLevel: data.activityLevel, goal: data.goal, isPCD: data.isPCD,
      },
    });
    // Replace only this profile's selected associations; retain catalog records.
    await tx.profileAllergy.deleteMany({ where: { profileId: existing.id, allergyId: { notIn: allergyIds } } });
    await tx.profilePhysicalLimitation.deleteMany({ where: { profileId: existing.id, physicalLimitationId: { notIn: limitationIds } } });
    for (const allergyId of allergyIds) {
      if (!existing.allergies.some(link => link.allergyId === allergyId)) {
        await tx.profileAllergy.create({ data: { profileId: existing.id, allergyId } });
      }
    }
    for (const physicalLimitationId of limitationIds) {
      if (!existing.physicalLimitations.some(link => link.physicalLimitationId === physicalLimitationId)) {
        await tx.profilePhysicalLimitation.create({ data: { profileId: existing.id, physicalLimitationId } });
      }
    }
    const goal = await calculateAndSaveNutritionGoal(userId, tx);
    const targets = [goal.targetKcal, goal.targetProteinG, goal.targetCarbsG, goal.targetFatG, goal.targetWaterMl];
    if (targets.some(value => !Number.isFinite(value) || value < 0) || goal.targetKcal <= 0) {
      throw new ProfileUpdateError(400, 'Essas respostas não produzem metas válidas. Confira nascimento, peso e altura.');
    }
    return {
      profile: await tx.profile.findUniqueOrThrow({ where: { userId }, select: editableProfileSelect }),
      targets: {
        targetKcal: goal.targetKcal, targetProteinG: goal.targetProteinG, targetCarbsG: goal.targetCarbsG,
        targetFatG: goal.targetFatG, targetWaterMl: goal.targetWaterMl,
      },
    };
    }, { timeout: 30000 });
  } catch (error: any) {
    // Prisma may race while creating the same owned name. The failed transaction
    // has rolled back, so retrying once resolves it through the existing row.
    if (error.code === 'P2002' && !isRetry) {
      return updateProfile(userId, data, referenceDate, timezoneOffset, true);
    }
    throw error;
  }
}
