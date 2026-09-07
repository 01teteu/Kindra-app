import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const exercises = [
  { name: 'Supino Reto', targetMuscle: 'Peito', equipment: 'Barra' },
  { name: 'Supino Inclinado', targetMuscle: 'Peito', equipment: 'Halter' },
  { name: 'Crucifixo Máquina', targetMuscle: 'Peito', equipment: 'Máquina' },
  { name: 'Puxada Frontal', targetMuscle: 'Costas', equipment: 'Máquina' },
  { name: 'Remada Curvada', targetMuscle: 'Costas', equipment: 'Barra' },
  { name: 'Agachamento Livre', targetMuscle: 'Pernas', equipment: 'Barra' },
  { name: 'Leg Press', targetMuscle: 'Pernas', equipment: 'Máquina' },
  { name: 'Cadeira Extensora', targetMuscle: 'Pernas', equipment: 'Máquina' },
  { name: 'Mesa Flexora', targetMuscle: 'Pernas', equipment: 'Máquina' },
  { name: 'Desenvolvimento', targetMuscle: 'Ombros', equipment: 'Halter' },
  { name: 'Elevação Lateral', targetMuscle: 'Ombros', equipment: 'Halter' },
  { name: 'Rosca Direta', targetMuscle: 'Bíceps', equipment: 'Barra' },
  { name: 'Rosca Martelo', targetMuscle: 'Bíceps', equipment: 'Halter' },
  { name: 'Tríceps Polia', targetMuscle: 'Tríceps', equipment: 'Cabo' },
  { name: 'Tríceps Testa', targetMuscle: 'Tríceps', equipment: 'Barra EZ' },
  { name: 'Panturrilha em Pé', targetMuscle: 'Panturrilha', equipment: 'Máquina' },
];

async function main() {
  console.log('Iniciando seed de exercícios...');
  
  // Limpa tudo caso a gente queira rodar de novo
  await prisma.exercise.deleteMany({ where: { isCustom: false } });

  let count = 0;
  for (const ex of exercises) {
    await prisma.exercise.create({
      data: {
        name: ex.name,
        targetMuscle: ex.targetMuscle,
        equipment: ex.equipment,
        isCustom: false
      }
    });
    count++;
  }

  console.log(`Seed completo! Foram adicionados ${count} exercícios ao catálogo.`);
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
