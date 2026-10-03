import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type AuthCodePurpose = 'email-verification' | 'password-reset';

const MINIMUM_KEY_BYTES = 32;
const PLACEHOLDERS = new Set(['change_me', 'replace_me', 'placeholder', 'your_secret', 'seu_segredo']);

function decodeBase64Secret(value: string) {
  if (value !== value.trim() || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.length >= MINIMUM_KEY_BYTES ? decoded : null;
}

export function resolveAuthCodeHmacKey(
  configuredSecret: string | undefined,
  nodeEnvironment: string | undefined,
  ephemeralKey: () => Buffer = () => randomBytes(MINIMUM_KEY_BYTES),
) {
  if (configuredSecret) {
    if (PLACEHOLDERS.has(configuredSecret.toLowerCase())) throw new Error('AUTH_CODE_HMAC_SECRET inválido.');
    const decoded = decodeBase64Secret(configuredSecret);
    if (!decoded) throw new Error('AUTH_CODE_HMAC_SECRET deve ser Base64 válido com pelo menos 32 bytes.');
    return decoded;
  }
  if (nodeEnvironment === 'production') {
    throw new Error('AUTH_CODE_HMAC_SECRET é obrigatório em produção.');
  }
  // Development/test convenience only. A restart intentionally invalidates codes
  // unless every cooperating process receives the same configured secret.
  return ephemeralKey();
}

const hmacKey = resolveAuthCodeHmacKey(process.env.AUTH_CODE_HMAC_SECRET, process.env.NODE_ENV);

export function hashAuthCode(purpose: AuthCodePurpose, code: string) {
  return createHmac('sha256', hmacKey).update(`${purpose}\0${code}`, 'utf8').digest('hex');
}

export function verifyAuthCodeDigest(storedDigest: string, purpose: AuthCodePurpose, code: string) {
  if (!/^[a-f0-9]{64}$/i.test(storedDigest)) return false;
  const stored = Buffer.from(storedDigest, 'hex');
  const expected = Buffer.from(hashAuthCode(purpose, code), 'hex');
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}
