import prisma from '../db.js';
import { getDayBounds } from '../utils/timezone.js';

/**
 * Gatilho "Lazy" de Consolidação Diária (Fechamento de Caixa / Streaks).
 * Verifica se a data de referência atual é superior à última ativação.
 */
export async function checkAndConsolidateNutriHistory(userId: string, referenceDate: string, timezoneOffset: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActiveDay: true, currentStreak: true, longestStreak: true }
  });

  if (!user) return;

  const currentAbstractDate = new Date(`${referenceDate}T00:00:00Z`);

  // Se for o primeiro acesso de todos (sem lastActiveDay), apenas seta para hoje e encerra
  if (!user.lastActiveDay) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveDay: currentAbstractDate }
    });
    return;
  }

  const lastActiveAbstractDate = new Date(user.lastActiveDay);

  // Se já está no dia de hoje, não tem o que consolidar. Retorna.
  if (currentAbstractDate.getTime() === lastActiveAbstractDate.getTime()) {
    return;
  }

  if (currentAbstractDate.getTime() < lastActiveAbstractDate.getTime()) {
    return; // Passado, não faz nada
  }

  // Descobrir quantos dias se passaram absolutos (ignorando fuso)
  const daysDiff = Math.round((currentAbstractDate.getTime() - lastActiveAbstractDate.getTime()) / (1000 * 60 * 60 * 24));
  let newCurrentStreak = user.currentStreak;
  let newLongestStreak = user.longestStreak;

  // Busca a Meta Atual do usuário (usaremos como retrato da meta dos dias que passaram)
  const currentGoal = await prisma.nutritionGoal.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  const targetWater = currentGoal?.targetWaterMl || 0;
  const targetKcal = currentGoal?.targetKcal || 0;

  // --- Processar o(s) dia(s) que ficaram para trás ---
  // Vamos processar especificamente o último dia que ele abriu (lastActive)
  
  // Calcula as bordas reais do lastActive baseado no fuso horário do usuário
  const lastActiveRefStr = lastActiveAbstractDate.toISOString().split('T')[0];
  const { startOfDayUTC: lastActiveStart, endOfDayUTC: lastActiveEnd } = getDayBounds(lastActiveRefStr, timezoneOffset);

  // 1. Somar toda a água registrada no dia 'lastActive'
  const waterLogs = await prisma.waterIntakeLog.aggregate({
    where: {
      userId,
      loggedAt: {
        gte: lastActiveStart,
        lte: lastActiveEnd
      }
    },
    _sum: { amountMl: true }
  });

  const waterIngested = waterLogs._sum.amountMl || 0;
  const waterGoalAchieved = waterIngested >= targetWater && targetWater > 0;

  // 2. Gravar o Histórico do dia 'lastActive'
  await prisma.historyUserNutri.upsert({
    where: {
      userId_date: { userId, date: lastActiveAbstractDate }
    },
    update: {}, // se já existe, não mexe (medida de segurança)
    create: {
      userId,
      date: lastActiveAbstractDate,
      waterIngestedMl: waterIngested,
      targetWaterMl: targetWater,
      consumedKcal: 0, // Mock: Será implementado no diário alimentar
      targetKcal: targetKcal,
      mealsLogged: 0,  // Mock: Será implementado no diário alimentar
      waterGoalAchieved
    }
  });

  // 3. Lógica de Streak
  if (daysDiff === 1) {
    // Abriu no dia seguinte exato. Se bateu a meta, aumenta o combo.
    if (waterGoalAchieved) {
      newCurrentStreak += 1;
      if (newCurrentStreak > newLongestStreak) newLongestStreak = newCurrentStreak;
    } else {
      newCurrentStreak = 0; // Quebrou o combo
    }
  } else if (daysDiff > 1) {
    // O usuário sumiu por 1 dia ou mais (gap). O combo reseta obrigatoriamente.
    newCurrentStreak = 0;
  }

  // 4. Limpeza (Zerar a água antiga) e Salvar Novo Status
  
  // Limpar a água antiga exige limpar os dados usando a borda de hoje 
  // do fuso do usuário, não de UTC!
  const { startOfDayUTC: currentStart } = getDayBounds(referenceDate, timezoneOffset);

  await prisma.$transaction([
    // Apaga os logs de água antigos (tudo antes de hoje local do cliente)
    prisma.waterIntakeLog.deleteMany({
      where: { userId, loggedAt: { lt: currentStart } }
    }),
    // Atualiza o perfil do usuário
    prisma.user.update({
      where: { id: userId },
      data: {
        lastActiveDay: currentAbstractDate,
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak
      }
    })
  ]);
}

/**
 * Recalcula a meta nutricional do usuário baseando-se no perfil (Profile)
 * e usando a fórmula Mifflin-St Jeor.
 */
export async function calculateAndSaveNutritionGoal(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  
  if (!profile) {
    throw new Error('Perfil não encontrado');
  }

  if (!profile.biologicalSex) {
    throw new Error('Sexo biológico ausente');
  }

  // 1. Calcular Idade
  let age = 30; // fallback se nulo
  if (profile.birthDate) {
    const birth = new Date(profile.birthDate);
    const diff = Date.now() - birth.getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  // 2. TMB (Mifflin-St Jeor)
  let bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * age);
  
  if (profile.biologicalSex === 'MALE') {
    bmr += 5;
  } else if (profile.biologicalSex === 'FEMALE') {
    bmr -= 161; 
  }

  // 3. Fator de Atividade (TDEE)
  let multiplier = 1.2; // Sedentario
  switch (profile.activityLevel) {
    case 'Leve': multiplier = 1.375; break;
    case 'Moderado': multiplier = 1.55; break;
    case 'Intenso': multiplier = 1.725; break;
  }
  const tdee = bmr * multiplier;

  // 4. Modificador de Objetivo e Macros
  let targetKcal = tdee;
  let proteinPerKg = 1.6;

  if (profile.goal === 'Emagrecimento') {
    targetKcal -= 500; // Déficit conservador
    proteinPerKg = 2.0; // Proteger massa magra
  } else if (profile.goal === 'Hipertrofia') {
    targetKcal += 300; // Superávit leve
    proteinPerKg = 2.0;
  }

  const targetProteinG = profile.weightKg * proteinPerKg;
  const targetFatG = profile.weightKg * 1.0; // 1g de gordura por kg
  
  const proteinKcal = targetProteinG * 4;
  const fatKcal = targetFatG * 9;
  const remainingKcal = targetKcal - proteinKcal - fatKcal;
  const targetCarbsG = Math.max(0, remainingKcal / 4);

  // 5. Água: 35ml por kg de peso
  const targetWaterMl = profile.weightKg * 35;

  // 6. Salvar e retornar nova meta
  const newGoal = await prisma.nutritionGoal.create({
    data: {
      userId,
      targetKcal: Math.round(targetKcal),
      targetProteinG: Math.round(targetProteinG),
      targetFatG: Math.round(targetFatG),
      targetCarbsG: Math.round(targetCarbsG),
      targetWaterMl: Math.round(targetWaterMl)
    }
  });

  return newGoal;
}
