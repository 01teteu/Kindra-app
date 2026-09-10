import prisma from '../db.js';
import { checkAndConsolidateNutriHistory } from '../services/nutrition.service.js';
import { getDayBounds } from '../utils/timezone.js';
import crypto from 'crypto';

async function runTest() {
  const email = `test-history-loop-${crypto.randomUUID()}@example.com`;
  console.log(`Creating test user: ${email}`);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: 'password123',
      currentStreak: 0,
      longestStreak: 0
    }
  });

  // Create Profile and Goal
  await prisma.profile.create({
    data: {
      userId: user.id,
      firstName: 'Test',
      lastName: 'History',
      birthDate: new Date('1990-01-01T00:00:00Z'),
      weightKg: 70,
      heightCm: 175,
      activityLevel: 'Moderado',
      goal: 'Manutenção',
      biologicalSex: 'MALE'
    }
  });

  await prisma.nutritionGoal.create({
    data: {
      userId: user.id,
      targetKcal: 2000,
      targetProteinG: 150,
      targetCarbsG: 200,
      targetFatG: 50,
      targetWaterMl: 2000
    }
  });

  // Create a Custom Food
  const food = await prisma.food.create({
    data: {
      name: 'Test Food',
      isCustom: true,
      userId: user.id,
      kcal: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 50
    }
  });

  // Setup timezone (e.g. UTC)
  const timezoneOffset = 0;

  // Let's set the current time to "today" (Day 3)
  const todayStr = '2026-09-09'; 
  const yesterdayStr = '2026-09-08'; // Day 2 (we will log meals here)
  const dayBeforeStr = '2026-09-07'; // Day 1 (lastActiveDay)

  const day1Date = new Date(`${dayBeforeStr}T00:00:00Z`);

  // 1. Usuário ativo há 3 dias atrás (`lastActiveDay` = dia 1)
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveDay: day1Date }
  });

  console.log('Setup: lastActiveDay set to Day 1:', day1Date.toISOString());

  // 2. Refeição e água registradas no dia 2 ("ontem" em relação ao teste)
  const { startOfDayUTC: yesterdayStart } = getDayBounds(yesterdayStr, timezoneOffset);
  
  // create meal exactly on day 2
  const meal = await prisma.meal.create({
    data: {
      userId: user.id,
      name: 'LUNCH',
      loggedAt: yesterdayStart
    }
  });

  await prisma.mealEntry.create({
    data: {
      mealId: meal.id,
      foodId: food.id,
      amountGrams: 100 // 1 multiplier
    }
  });

  await prisma.waterIntakeLog.create({
    data: {
      userId: user.id,
      amountMl: 2000,
      loggedAt: yesterdayStart
    }
  });

  console.log('Setup: Logged meal and water on Day 2:', yesterdayStart.toISOString());

  // 3. Usuário abre o app no dia 3 (hoje), disparando o gatilho lazy
  console.log('Triggering checkAndConsolidateNutriHistory for Day 3:', todayStr);
  await checkAndConsolidateNutriHistory(user.id, todayStr, timezoneOffset);

  // 4. Confirme
  const history = await prisma.historyUserNutri.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' }
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { lastActiveDay: true, currentStreak: true }
  });

  console.log('\n--- Test Results ---');
  console.log('Total History Records created:', history.length);
  history.forEach(h => {
    console.log(`\nHistory for Date: ${h.date.toISOString()}`);
    console.log(`  Water Ingested: ${h.waterIngestedMl} / ${h.targetWaterMl} (Achieved: ${h.waterGoalAchieved})`);
    console.log(`  Kcal Consumed: ${h.consumedKcal} / ${h.targetKcal} (Achieved: ${h.kcalGoalAchieved})`);
    console.log(`  Meals Logged: ${h.mealsLogged}`);
    const allAchieved = h.waterGoalAchieved && h.kcalGoalAchieved && h.proteinGoalAchieved && h.carbsGoalAchieved && h.fatGoalAchieved;
    console.log(`  All Goals Achieved (Streak valid): ${allAchieved}`);
  });

  console.log(`\nUser lastActiveDay updated to: ${updatedUser?.lastActiveDay?.toISOString()}`);
  console.log(`User currentStreak: ${updatedUser?.currentStreak}`);

  console.log('\nCleaning up...');
  await prisma.user.delete({ where: { id: user.id } });
}

runTest().catch(console.error).finally(() => prisma.$disconnect());
