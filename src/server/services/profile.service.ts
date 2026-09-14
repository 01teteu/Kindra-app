import prisma from '../db.js';
import { calculateAndSaveNutritionGoal, checkAndConsolidateNutriHistory } from './nutrition.service.js';
import { ProfileInput } from '../schemas/profile.schema.js';

export async function getCatalogOptions() {
  const allergies = await prisma.allergy.findMany({
    where: { isCustom: false },
    orderBy: { name: 'asc' },
  });
  
  const limitations = await prisma.physicalLimitation.findMany({
    where: { isCustom: false },
    orderBy: { name: 'asc' },
  });

  return { allergies, limitations };
}

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const normalizeString = (str: string) => {
  const s = str.trim().toLowerCase();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export async function createProfile(userId: string, data: ProfileInput, isRetry = false): Promise<any> {
  const existingProfile = await prisma.profile.findUnique({
    where: { userId },
  });

  if (existingProfile) {
    throw new Error('PROFILE_ALREADY_EXISTS');
  }

  try {
    const profile = await prisma.profile.create({
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
        allergies: {
          create: data.allergies.map(item => {
            if (isUUID(item)) {
              return { allergy: { connect: { id: item } } };
            }
            const finalString = normalizeString(item);
            return {
              allergy: {
                connectOrCreate: {
                  where: { name: finalString },
                  create: { name: finalString, isCustom: true }
                }
              }
            };
          })
        },
        physicalLimitations: {
          create: data.limitations.map(item => {
            if (isUUID(item)) {
              return { physicalLimitation: { connect: { id: item } } };
            }
            const finalString = normalizeString(item);
            return {
              physicalLimitation: {
                connectOrCreate: {
                  where: { name: finalString },
                  create: { name: finalString, isCustom: true }
                }
              }
            };
          })
        }
      },
      include: {
        allergies: { include: { allergy: true } },
        physicalLimitations: { include: { physicalLimitation: true } },
      }
    });

    return profile;
  } catch (err: any) {
    // P2002: Unique constraint failed
    // Race condition na hora do connectOrCreate das alergias/limitacoes
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

export async function updateProfile(userId: string, data: ProfileInput, referenceDate: string, timezoneOffset: number) {
  return prisma.$transaction(async tx => {
    const existing = await tx.profile.findUnique({
      where: { userId }, include: { allergies: true, physicalLimitations: true },
    });
    if (!existing) throw new ProfileUpdateError(404, 'Perfil não encontrado. Conclua o cadastro inicial.');

    // UUIDs may reference official options or the authenticated user's current
    // options. Text retains the exact same normalization/catalog reuse as POST.
    const allergyIds: string[] = [];
    for (const item of data.allergies) {
      const option = isUUID(item)
        ? await tx.allergy.findFirst({ where: { id: item, OR: [{ isCustom: false }, { profiles: { some: { profileId: existing.id } } }] } })
        : await tx.allergy.upsert({ where: { name: normalizeString(item) }, update: {}, create: { name: normalizeString(item), isCustom: true } });
      if (!option) throw new ProfileUpdateError(400, 'Opção de alergia inválida ou indisponível.');
      allergyIds.push(option.id);
    }
    const limitationIds: string[] = [];
    for (const item of data.limitations) {
      const option = isUUID(item)
        ? await tx.physicalLimitation.findFirst({ where: { id: item, OR: [{ isCustom: false }, { profiles: { some: { profileId: existing.id } } }] } })
        : await tx.physicalLimitation.upsert({ where: { name: normalizeString(item) }, update: {}, create: { name: normalizeString(item), isCustom: true } });
      if (!option) throw new ProfileUpdateError(400, 'Opção de limitação inválida ou indisponível.');
      limitationIds.push(option.id);
    }
    if (new Set(allergyIds).size !== allergyIds.length || new Set(limitationIds).size !== limitationIds.length) {
      throw new ProfileUpdateError(400, 'Há opções repetidas entre as restrições informadas.');
    }

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
}
