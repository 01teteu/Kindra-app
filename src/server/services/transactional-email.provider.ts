export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type EmailConfig = {
  apiKey: string;
  sender: { name: string; email: string };
  appUrl: string;
};

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_TIMEOUT_MS = 8_000;

function parseSender(value: string | undefined) {
  const match = value?.trim().match(/^([^<>\r\n]+?)\s*<([^<>\s@\r\n]+@[^<>\s@\r\n]+)>$/);
  if (!match || !match[1].trim() || !/^[^\s.]+(?:[^\s]*[^\s.])?\.[A-Za-z]{2,}$/.test(match[2].split('@')[1])) {
    throw new Error('EMAIL_FROM_INVALID');
  }
  return { name: match[1].trim(), email: match[2] };
}

function parseAppUrl(value: string | undefined, production: boolean) {
  let url: URL;
  try {
    url = new URL(value || (production ? '' : 'http://localhost:3000'));
  } catch {
    throw new Error('APP_URL_INVALID');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (production ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) ||
      (production && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('APP_URL_INVALID');
  }
  return url.origin;
}

/** Called at startup in production and again when sending; no mock fallback exists. */
export function resolveTransactionalEmailConfig(environment: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  const production = environment.NODE_ENV === 'production';
  if (!production) return null;
  const apiKey = environment.BREVO_API_KEY?.trim();
  if (!apiKey || apiKey.length < 20 || /^(your|replace|placeholder|example|changeme|seu)[-_\s]/i.test(apiKey)) {
    throw new Error('BREVO_API_KEY_INVALID');
  }
  return { apiKey, sender: parseSender(environment.EMAIL_FROM), appUrl: parseAppUrl(environment.APP_URL, true) };
}

export function getEmailAppUrl(environment: NodeJS.ProcessEnv = process.env) {
  return resolveTransactionalEmailConfig(environment)?.appUrl ??
    parseAppUrl(environment.APP_URL ?? environment.FRONTEND_URL, false);
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<void> {
  const config = resolveTransactionalEmailConfig();
  if (!config) {
    // Development/test mock. Codes are exposed only by an explicit local opt-in
    // in email.service.ts; the provider itself never logs message contents.
    return;
  }
  try {
    const response = await globalThis.fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: config.sender,
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_FAILED');
  } catch {
    // Never pass through Brevo response bodies, headers, request data or fetch errors.
    throw new Error('EMAIL_PROVIDER_FAILED');
  }
}
