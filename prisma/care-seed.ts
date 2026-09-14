import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export class CareCatalogError extends Error {}
const optionSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).refine(name => name.trim() === name, 'Nome com espaços externos'),
  isCustom: z.literal(false),
});
const catalogsSchema = z.strictObject({
  allergies: z.array(optionSchema).length(8),
  limitations: z.array(optionSchema).length(9),
});
export type CareCatalogs = z.infer<typeof catalogsSchema>;

export function validateCareCatalogs(input: unknown): CareCatalogs {
  const parsed = catalogsSchema.safeParse(input);
  if (!parsed.success) throw new CareCatalogError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  for (const [group, rows] of Object.entries(parsed.data)) {
    if (new Set(rows.map(row => row.id)).size !== rows.length || new Set(rows.map(row => row.name)).size !== rows.length) {
      throw new CareCatalogError(`${group}: IDs ou nomes duplicados no catálogo oficial.`);
    }
  }
  return parsed.data;
}

export function loadCareCatalogs(directory = path.resolve('prisma/seed-data')): CareCatalogs {
  function read(file: string): unknown {
    try { return JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); }
    catch { throw new CareCatalogError(`${file}: arquivo ausente ou JSON inválido.`); }
  }
  return validateCareCatalogs({ allergies: read('allergies.json'), limitations: read('physical-limitations.json') });
}

export async function seedCareCatalogs(prisma: PrismaClient, input: unknown) {
  const catalogs = validateCareCatalogs(input);
  return prisma.$transaction(async tx => {
    // Serialize this seed and concurrent profile-created options while inspecting
    // both unique keys. Locks are released together on commit or rollback.
    await tx.$executeRaw`LOCK TABLE allergies, physical_limitations IN SHARE ROW EXCLUSIVE MODE`;
    const summary = { allergies: { inserted: 0, preserved: 0 }, limitations: { inserted: 0, preserved: 0 } };
    const groups = [
      { name: 'allergies' as const, rows: catalogs.allergies, existing: await tx.allergy.findMany(), create: (data: CareCatalogs['allergies'][number]) => tx.allergy.create({ data }) },
      { name: 'limitations' as const, rows: catalogs.limitations, existing: await tx.physicalLimitation.findMany(), create: (data: CareCatalogs['limitations'][number]) => tx.physicalLimitation.create({ data }) },
    ];
    // Preflight both groups before inserting either. Never promote a custom row,
    // silently accept a different official identity or rewrite an existing ID.
    for (const group of groups) {
      for (const row of group.rows) {
        const collisions = group.existing.filter(item => item.id === row.id || item.name === row.name);
        if (collisions.some(item => item.id !== row.id || item.name !== row.name || item.isCustom)) {
          throw new CareCatalogError(`${group.name}: colisão incompatível com o registro oficial ${row.id}. Nenhum registro de cuidados foi alterado.`);
        }
      }
    }
    for (const group of groups) {
      for (const row of group.rows) {
        if (group.existing.some(item => item.id === row.id)) summary[group.name].preserved++;
        else { await group.create(row); summary[group.name].inserted++; }
      }
    }
    return summary;
  }, { timeout: 30000, maxWait: 30000 });
}
