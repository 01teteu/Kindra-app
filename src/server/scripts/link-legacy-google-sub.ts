/** Explicit, local-only maintenance for Google users created before googleSub existed.
 * Dry-run: node --import tsx src/server/scripts/link-legacy-google-sub.ts --user-id <UUID> < token.txt
 * Write:   repeat with --confirm-user-id <same UUID>. The ID token is read only from stdin.
 * An operator must independently confirm the target account: matching email alone is not proof.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../db.js';
import { verifyGoogleIdentity } from '../security/google-id-token.js';

function requireLocalPostgres() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? '');
  } catch {
    throw new Error('LOCAL_DATABASE_REQUIRED');
  }
  if (process.env.NODE_ENV === 'production' ||
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('LOCAL_DATABASE_REQUIRED');
  }
}

export async function linkLegacyGoogleSub(targetUserId: string, credential: string, confirm = false) {
  requireLocalPostgres();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    throw new Error('LEGACY_LINK_REJECTED');
  }
  const identity = await verifyGoogleIdentity(credential, 5 * 60);
  try {
    return await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { email: true, provider: true, password: true, emailVerified: true, googleSub: true },
      });
      const subjectOwner = await tx.user.findUnique({
        where: { googleSub: identity.sub }, select: { id: true },
      });
      if (!target || target.provider !== 'GOOGLE' || target.password !== null ||
          !target.emailVerified || target.googleSub !== null ||
          target.email !== identity.email || subjectOwner) {
        throw new Error('LEGACY_LINK_REJECTED');
      }
      if (!confirm) return 'dry_run' as const;
      const changed = await tx.user.updateMany({
        where: {
          id: targetUserId, provider: 'GOOGLE', password: null,
          emailVerified: true, googleSub: null, email: identity.email,
        },
        data: { googleSub: identity.sub },
      });
      if (changed.count !== 1) throw new Error('LEGACY_LINK_REJECTED');
      return 'linked' as const;
    });
  } catch {
    throw new Error('LEGACY_LINK_REJECTED');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const userIndex = args.indexOf('--user-id');
  const confirmIndex = args.indexOf('--confirm-user-id');
  const targetUserId = userIndex >= 0 ? args[userIndex + 1] : undefined;
  const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;
  try {
    requireLocalPostgres();
    if (!targetUserId || (confirmation !== undefined && confirmation !== targetUserId) ||
        (confirmation === undefined ? args.length !== 2 : args.length !== 4) || process.stdin.isTTY) {
      throw new Error('LEGACY_LINK_REJECTED');
    }
    const credential = readFileSync(0, 'utf8').trim();
    const result = await linkLegacyGoogleSub(targetUserId, credential, confirmation !== undefined);
    console.log(result === 'dry_run' ? 'Dry-run aprovado; nenhum vínculo gravado.' : 'Vínculo local gravado.');
  } catch {
    console.error('Vínculo recusado. Confirme banco local, usuário, token recente e argumentos.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
