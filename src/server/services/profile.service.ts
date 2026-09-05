import prisma from '../db.js';
import { ProfileInput } from '../schemas/profile.schema.js';

export async function getCatalogOptions() {
  const allergies = await prisma.allergy.findMany({
    orderBy: { name: 'asc' },
  });
  
  const limitations = await prisma.physicalLimitation.findMany({
    orderBy: { name: 'asc' },
  });

  return { allergies, limitations };
}

export async function createProfile(userId: string, data: ProfileInput) {
  const existingProfile = await prisma.profile.findUnique({
    where: { userId },
  });

  if (existingProfile) {
    throw new Error('PROFILE_ALREADY_EXISTS');
  }

  const profile = await prisma.profile.create({
    data: {
      userId,
      firstName: data.firstName,
      lastName: data.lastName,
      birthDate: new Date(data.birthDate),
      weightKg: data.weightKg,
      heightCm: data.heightCm,
      activityLevel: data.activityLevel,
      goal: data.goal,
      isPCD: data.isPCD,
      allergies: {
        create: data.allergies.map(allergyId => ({
          allergy: { connect: { id: allergyId } }
        }))
      },
      physicalLimitations: {
        create: data.limitations.map(limitId => ({
          physicalLimitation: { connect: { id: limitId } }
        }))
      }
    },
    include: {
      allergies: { include: { allergy: true } },
      physicalLimitations: { include: { physicalLimitation: true } },
    }
  });

  return profile;
}
