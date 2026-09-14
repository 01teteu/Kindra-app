import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { loadActivityCatalogs, CatalogValidationError } from './activity-validation.js';
import { seedActivityCatalogs } from './activity-seed.js';
import { loadCareCatalogs, seedCareCatalogs, CareCatalogError } from './care-seed.js';

const prisma = new PrismaClient();
const macroFields = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g'] as const;

type SeedFood = {
  description: string;
} & Record<(typeof macroFields)[number], number>;

// Comparison only: stored names retain Portuguese accents and punctuation.
function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Reviewed equivalents from the supplied expansion. Existing nutrition wins.
// Do not infer equivalence by removing brands, ingredients or preparations.
const equivalentNames: Record<string, string> = {
  "Coxinha de Frango": "Coxinha de frango, frita",
  "Pão de Queijo": "Pão, de queijo, assado",
  "Maionese Tradicional": "Maionese, tradicional com ovos",
  "Biscoito Água e Sal / Cream Cracker": "Biscoito, salgado, cream cracker",
  "Biscoito Maisena": "Biscoito, doce, maisena",
  "Chocolate ao Leite": "Chocolate, ao leite",
  "Chocolate Meio Amargo": "Chocolate, meio amargo",
  "Paçoca de Amendoim": "Paçoca, amendoim",
  "Doce de Leite": "Doce, de leite, cremoso",
  "Leite Condensado": "Leite, condensado",
  "Açaí (Polpa com Xarope de Guaraná)": "Açaí, polpa, com xarope de guaraná e glucose",
  "Água Tônica": "Refrigerante, tipo água tônica",
  "Cerveja Pilsen": "Cerveja, pilsen 2",
  "Tofu (Queijo de Soja)": "Soja, queijo (tofu)",
  "Cuscuz de Milho (Cozido)": "Cuscuz, de milho, cozido com sal",
  "Mel de Abelha": "Mel, de abelha",
  "Pão de Forma Integral": "Pão, trigo, forma, integral",
  "Cereal Matinal (Milho com Açúcar)": "Cereal matinal, milho, açúcar",
  "Strogonoff de Frango (Prato Pronto)": "Estrogonofe de frango",
  "Strogonoff de Carne (Prato Pronto)": "Estrogonofe de carne"
};
const aliases = new Map(Object.entries(equivalentNames)
  .map(([alias, canonical]) => [normalizeName(alias), normalizeName(canonical)]));

function foodKey(name: string): string {
  const key = normalizeName(name);
  return aliases.get(key) ?? key;
}

function validateFood(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['registro deve ser um objeto'];
  }
  const item = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof item.description !== 'string' || !normalizeName(item.description)) {
    errors.push('description vazia ou inválida');
  }
  for (const field of macroFields) {
    const macro = item[field];
    if (typeof macro !== 'number' || !Number.isFinite(macro) || macro < 0) {
      errors.push(`${field} deve ser um número finito >= 0 (recebido: ${JSON.stringify(macro)})`);
    }
  }
  return errors;
}

async function main() {
  // Reject malformed activity sources before any write, including the food seed.
  const activityCatalogs = loadActivityCatalogs();
  const careCatalogs = loadCareCatalogs();
  const tacoFilePath = path.join(process.cwd(), 'prisma', 'seed-data', 'taco.json');
  const data: unknown = JSON.parse(fs.readFileSync(tacoFilePath, 'utf-8'));
  if (!Array.isArray(data)) throw new Error('A base de alimentos deve ser um array JSON.');

  // Validate the entire input before any database write. Legacy invalid records
  // stay in the source and database, but are explicitly excluded from import.
  const groups = new Map<string, SeedFood[]>();
  let invalidCount = 0;
  for (const [index, value] of data.entries()) {
    const errors = validateFood(value);
    if (errors.length) {
      invalidCount++;
      console.warn(`Ignorado registro ${index + 1}: ${errors.join('; ')}`);
      continue;
    }
    const item = value as SeedFood;
    const key = foodKey(item.description);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const candidates = new Map<string, SeedFood>();
  let duplicateCount = 0;
  let conflictCount = 0;
  for (const [key, group] of groups) {
    const first = group[0];
    if (group.some(item => macroFields.some(field => item[field] !== first[field]))) {
      // In particular, the two legacy "Maria mole" records disagree. Neither
      // is chosen arbitrarily; any already persisted record remains untouched.
      conflictCount += group.length;
      console.warn(`Conflito: ${JSON.stringify(first.description)} (${group.length} registros); grupo não importado.`);
      continue;
    }
    duplicateCount += group.length - 1;
    if (group.length > 1) {
      console.log(`Duplicatas equivalentes ignoradas: ${JSON.stringify(first.description)} (${group.length - 1}).`);
    }
    candidates.set(key, first);
  }

  console.log('Catálogos de cuidados:', JSON.stringify(await seedCareCatalogs(prisma, careCatalogs)));

  const result = await prisma.$transaction(async tx => {
    const existing = await tx.food.findMany({
      select: { name: true, isCustom: true, userId: true },
    });
    const existingKeys = new Set(existing.map(food => foodKey(food.name)));
    const customKeys = new Set(existing.filter(food => food.isCustom || food.userId !== null)
      .map(food => foodKey(food.name)));
    let inserted = 0;
    let preserved = 0;
    let customCollisions = 0;

    for (const [key, item] of candidates) {
      if (existingKeys.has(key)) {
        preserved++;
        if (customKeys.has(key)) customCollisions++;
        continue;
      }
      await tx.food.create({
        data: {
          name: item.description.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR'),
          isCustom: false,
          kcal: item.energy_kcal,
          proteinG: item.protein_g,
          carbsG: item.carbohydrate_g,
          fatG: item.lipid_g,
        },
      });
      existingKeys.add(key);
      inserted++;
    }
    return { inserted, preserved, customCollisions };
  }, { timeout: 60000 });

  console.log('Catálogos de atividades:', JSON.stringify(await seedActivityCatalogs(prisma, activityCatalogs), null, 2));

  console.log('Seed de alimentos concluída (somente inserções; nenhuma atualização ou exclusão).');
  console.log(JSON.stringify({
    sourceRecords: data.length,
    validUniqueCandidates: candidates.size,
    invalidSkipped: invalidCount,
    identicalDuplicatesSkipped: duplicateCount,
    conflictingRecordsSkipped: conflictCount,
    ...result,
  }, null, 2));
  if (result.customCollisions) {
    console.warn('Colisões com alimentos de usuários preservadas; nenhum dado privado foi alterado ou publicado.');
  }
}

main()
  .catch((error: unknown) => {
    // Do not print connection details or database records on failure.
    console.error('Seed abortada. Cada domínio usa transação; uma etapa anterior já concluída pode ter sido persistida.');
    console.error(error instanceof CatalogValidationError || error instanceof CareCatalogError ? error.message : error instanceof SyntaxError ? 'JSON inválido.' : 'Verifique o arquivo de entrada e a conexão/configuração do Prisma.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
