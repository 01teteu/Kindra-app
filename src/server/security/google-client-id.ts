const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** Never allow Google ID-token verification without a single explicit audience. */
export function resolveGoogleClientId(environment: NodeJS.ProcessEnv = process.env): string | null {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const prefix = clientId?.endsWith(GOOGLE_CLIENT_ID_SUFFIX)
    ? clientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)
    : '';
  const valid = !!prefix && /^[A-Za-z0-9_-]+$/.test(prefix) &&
    !/^(seu|your|example|placeholder|replace|changeme)(?:-|_|$)/i.test(prefix);

  if (valid) return clientId!;
  if (environment.NODE_ENV === 'production') {
    throw new Error('GOOGLE_CLIENT_ID deve conter um único Google OAuth Web Client ID válido.');
  }
  return null;
}
