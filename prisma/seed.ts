import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TACO database seed...');

  // 1. Load local JSON file
  const tacoFilePath = path.join(process.cwd(), 'prisma', 'seed-data', 'taco.json');
  if (!fs.existsSync(tacoFilePath)) {
    throw new Error('Local TACO database not found. Please ensure prisma/seed-data/taco.json exists.');
  }

  const fileData = fs.readFileSync(tacoFilePath, 'utf-8');
  const foods = JSON.parse(fileData);

  let successCount = 0;
  let skippedCount = 0;
  const skippedItems: string[] = [];
  const sampleItems: any[] = [];

  // Helper to parse macros
  const parseMacro = (val: any): number | null => {
    if (val === 'NA') return null; // We cannot assume 0 for Not Available
    if (val === 'Tr' || val === '') return 0; // Traces or empty string are safe to assume 0
    if (typeof val === 'number') return val;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  for (const item of foods) {
    if (!item.description) continue;

    const kcal = parseMacro(item.energy_kcal);
    const protein = parseMacro(item.protein_g);
    const carbs = parseMacro(item.carbohydrate_g);
    const fat = parseMacro(item.lipid_g);

    // 2. Differentiate "Tr" from "NA" (Approach A: Skip if any core macro is NA)
    // If any core macronutrient is explicitly "NA", we skip the food to avoid 
    // saving misleading "0s" in the database for unknown data.
    if (kcal === null || protein === null || carbs === null || fat === null) {
      skippedCount++;
      if (skippedItems.length < 5) {
        skippedItems.push(`${item.description} (Missing core macros)`);
      }
      continue;
    }

    // Normalizing name (lowercase + trim)
    const normalizedName = item.description.trim().toLowerCase();

    // 3. Upsert into database
    const food = await prisma.food.upsert({
      where: { name: normalizedName },
      update: {
        kcal,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
      },
      create: {
        name: normalizedName,
        isCustom: false,
        kcal,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
      }
    });

    successCount++;

    if (sampleItems.length < 5) {
      sampleItems.push({
        id: food.id,
        name: food.name,
        kcal: food.kcal,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
      });
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log(`📊 Successfully inserted/updated: ${successCount} items`);
  console.log(`⚠️ Skipped (Missing/NA data): ${skippedCount} items`);
  
  if (skippedCount > 0) {
    console.log(`\n📝 Sample of skipped items:`);
    skippedItems.forEach(i => console.log(`   - ${i}`));
  }

  console.log(`\n🍽️ Sample of inserted foods:`);
  console.table(sampleItems);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
