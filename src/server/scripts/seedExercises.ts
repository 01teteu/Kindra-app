// Legacy command retained as a safe entry point to the single global source.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadActivityCatalogs, CatalogValidationError } from '../../../prisma/activity-validation.js';
import { seedActivityCatalogs } from '../../../prisma/activity-seed.js';

const prisma = new PrismaClient();
try {
  console.log(JSON.stringify(await seedActivityCatalogs(prisma, loadActivityCatalogs()), null, 2));
} catch (error) {
  console.error(error instanceof CatalogValidationError ? error.message : 'Falha na sincronização dos catálogos; transação revertida.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
