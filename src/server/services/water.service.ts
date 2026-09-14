import prisma from '../db.js';
import { getDayBounds } from '../utils/timezone.js';

export async function removeWaterLog(userId: string, id: string, referenceDate: string, timezoneOffset: number) {
  const { startOfDayUTC, endOfDayUTC } = getDayBounds(referenceDate, timezoneOffset);
  const day = new Date(`${referenceDate}T00:00:00Z`);

  // Ownership, day and consolidation checks belong to the mutation itself.
  // Never subtract a client-supplied amount or modify NutritionGoal.
  const result = await prisma.waterIntakeLog.deleteMany({
    where: {
      id,
      userId,
      loggedAt: { gte: startOfDayUTC, lte: endOfDayUTC },
      user: {
        is: {
          OR: [{ lastActiveDay: null }, { lastActiveDay: { lte: day } }],
          nutritionHistory: { none: { date: { gte: day } } },
        },
      },
    },
  });
  return result.count === 1;
}
