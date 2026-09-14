import type { CookieSerializeOptions } from '@fastify/cookie';

// Shared by every session issuer and logout; HTTP development includes LAN hosts.
export function sessionCookieOptions(): CookieSerializeOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}
