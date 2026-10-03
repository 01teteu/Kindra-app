import { isIP } from 'node:net';

/** Trust only explicitly configured proxy addresses, never arbitrary forwarding headers. */
export function resolveTrustedProxies(value: string | undefined): false | string[] {
  if (value === undefined) return false;

  const entries = value.split(',').map(entry => entry.trim());
  if (entries.some(entry => !entry || entry.includes('%'))) {
    throw new Error('TRUSTED_PROXIES deve conter somente IPs/CIDRs válidos separados por vírgula.');
  }

  for (const entry of entries) {
    const parts = entry.split('/');
    const family = isIP(parts[0]);
    if (!family || parts.length > 2 || (parts.length === 2 &&
      (!/^[1-9]\d*$/.test(parts[1]) || Number(parts[1]) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXIES deve conter somente IPs/CIDRs válidos separados por vírgula.');
    }
  }

  return entries;
}
