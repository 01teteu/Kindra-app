import prisma from '../db.js';
import { checkAndConsolidateNutriHistory } from '../services/nutrition.service.js';

async function runTest() {
  console.log('--- 🧪 Iniciando Teste de Regras de Ofensiva (Streak) ---\n');
  
  // 1. Criar usuário fake com streak pré-existente
  const user = await prisma.user.create({
    data: {
      email: 'teste-regras@kindra.app',
      provider: 'LOCAL',
      currentStreak: 5,
      longestStreak: 5
    }
  });
  console.log(`👤 Usuário criado com Streak inicial = 5`);

  // 2. Criar Meta Diária (Target)
  await prisma.nutritionGoal.create({
    data: {
      userId: user.id,
      targetKcal: 2000,
      targetProteinG: 100, // Meta = 100g (Piso 85% = 85g)
      targetCarbsG: 200,   // Meta = 200g (±10% = 180g a 220g)
      targetFatG: 60,      // Meta = 60g  (±10% = 54g a 66g)
      targetWaterMl: 2000,
    }
  });
  console.log('🎯 Meta diária: 2000 Kcal | 100g Prot | 200g Carb | 60g Gord | 2000ml Água');

  // 3. Criar Alimento "Cenário Específico"
  const food = await prisma.food.create({
    data: {
      name: 'Refeição Planejada Teste',
      kcal: 2400,    // 20% acima da meta (VAI FALHAR O TETO)
      proteinG: 90,  // 10% abaixo da meta (VAI PASSAR, pois o piso é 15%)
      carbsG: 200,   // Em cima da meta (VAI PASSAR)
      fatG: 60,      // Em cima da meta (VAI PASSAR)
    }
  });

  // 4. Forjar o "Passado" (Ontem)
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveDay: new Date('2026-09-07T00:00:00Z') }
  });

  // 5. Inserir Refeição e Água (Ontem)
  await prisma.meal.create({
    data: {
      userId: user.id,
      name: 'LUNCH',
      loggedAt: new Date('2026-09-07T12:00:00Z'),
      entries: {
        create: [{ foodId: food.id, amountGrams: 100 }] // 1x o valor cadastrado
      }
    }
  });
  
  await prisma.waterIntakeLog.create({
    data: {
      userId: user.id,
      amountMl: 2000, // Bateu a água
      loggedAt: new Date('2026-09-07T12:00:00Z')
    }
  });

  console.log('\n⚙️ Simulando Login HOJE (08/09/2026) -> Rodando gatilho do Streak...');
  const todayRef = '2026-09-08';
  const timezoneOffset = 180; 
  
  await checkAndConsolidateNutriHistory(user.id, todayRef, timezoneOffset);

  // 8. Buscar o Usuário para ver se o Streak subiu ou quebrou
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  
  const history = await prisma.historyUserNutri.findFirst({
    where: { userId: user.id, date: new Date('2026-09-07T00:00:00Z') }
  });

  console.log('\n--- 🎯 RESULTADO DAS REGRAS (BOOLEANOS) ---');
  console.log(`Água (Passou?):     ${history?.waterGoalAchieved ? '✅' : '❌'}`);
  console.log(`Proteína (Passou?): ${history?.proteinGoalAchieved ? '✅ (Piso funcionou!)' : '❌'}`);
  console.log(`Carbos (Passou?):   ${history?.carbsGoalAchieved ? '✅' : '❌'}`);
  console.log(`Gordura (Passou?):  ${history?.fatGoalAchieved ? '✅' : '❌'}`);
  console.log(`Kcal (Passou?):     ${history?.kcalGoalAchieved ? '✅' : '❌ (Falhou no Teto de 10%!)'}`);

  console.log('\n--- 🔥 RESULTADO FINAL DO STREAK ---');
  console.log(`Streak Original: 5`);
  console.log(`Streak Atual:    ${updatedUser?.currentStreak} -> ${updatedUser?.currentStreak === 0 ? '✅ (Quebrou corretamente!)' : '❌ (Não deveria ter aumentado)'}`);

  // Limpeza
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.food.delete({ where: { id: food.id } });
}

runTest().catch(console.error);
