import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial data...');

  const allergies = [
    'Nenhuma',
    'Lactose',
    'Glúten',
    'Frutos do mar',
    'Amendoim',
    'Ovo',
    'Soja',
    'Nozes',
  ];

  for (const name of allergies) {
    await prisma.allergy.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const limitations = [
    'Nenhuma',
    'Lesão no joelho',
    'Lesão no ombro',
    'Hérnia de disco',
    'Asma',
    'Hipertensão',
    'Diabetes',
    'Problemas articulares',
    'Mobilidade reduzida',
  ];

  for (const name of limitations) {
    await prisma.physicalLimitation.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
