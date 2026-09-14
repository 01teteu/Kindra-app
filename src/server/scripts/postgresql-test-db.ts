import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Every run owns a newly created schema in the existing local PostgreSQL.
// Never reset public, reuse a supplied schema, or run db push.
export async function createTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Os testes exigem DATABASE_URL do PostgreSQL local.');
  }
  const schema = `kindra_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const cleanup = async () => {
    try {
      // Container restart invalidates idle pooled connections as well.
      await admin.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  };
  try {
    runPrisma(['migrate', 'deploy']);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { schema, cleanup };
}

export function runPrisma(args: string[]) {
  try {
    return execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
      env: { ...process.env, PATH: `${path.resolve('node_modules/.bin')}${path.delimiter}${process.env.PATH}` },
      encoding: 'utf8', stdio: 'pipe',
    });
  } catch {
    // Child errors may contain connection strings. Do not forward them.
    throw new Error(`Falha no Prisma: ${args.slice(0, 2).join(' ')} (detalhes de conexão ocultados).`);
  }
}
