import prisma from '../db.js';
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
