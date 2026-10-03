import { OAuth2Client } from 'google-auth-library';
import { resolveGoogleClientId } from './google-client-id.js';

const googleClient = new OAuth2Client();

/** The same verified Google identity is used for login and explicit local linking. */
export async function verifyGoogleIdentity(credential: string, maxAgeSeconds?: number) {
  const clientId = resolveGoogleClientId();
  if (!clientId) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED');

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.email !== 'string' || !payload.email || payload.email_verified !== true) {
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
    if (maxAgeSeconds !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.iat !== 'number' || payload.iat > now || now - payload.iat > maxAgeSeconds) {
        throw new Error('INVALID_GOOGLE_TOKEN');
      }
    }
    return { sub: payload.sub, email: payload.email };
  } catch {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }
}
