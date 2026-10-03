import { randomBytes } from 'node:crypto';

const MINIMUM_KEY_BYTES = 32;
const PLACEHOLDERS = new Set([
  'change_me',
  'replace_me',
  'placeholder',
  'your_secret',
  'seu_segredo',
]);

function decodeProductionSecret(value: string) {
  if (value !== value.trim() || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < MINIMUM_KEY_BYTES || decoded.toString('base64') !== value) return null;
  return decoded;
}

export function resolveJwtSecret(
  configuredSecret: string | undefined,
  nodeEnvironment: string | undefined,
  ephemeralSecret: () => string = () => randomBytes(MINIMUM_KEY_BYTES).toString('base64'),
) {
  if (nodeEnvironment !== 'production') return configuredSecret || ephemeralSecret();

  if (!configuredSecret) throw new Error('JWT_SECRET é obrigatório em produção.');
  if (PLACEHOLDERS.has(configuredSecret.toLowerCase())) throw new Error('JWT_SECRET inválido em produção.');
  if (!decodeProductionSecret(configuredSecret)) {
    throw new Error('JWT_SECRET deve ser Base64 válido com pelo menos 32 bytes em produção.');
  }

  return configuredSecret;
}
