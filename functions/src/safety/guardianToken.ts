import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** `confirm` is the second email of the under-13 parental consent. */
export type GuardianTokenPurpose = 'consent' | 'confirm' | 'revoke' | 'trial';

export type GuardianTokenPayload = {
  /** Consent record id, or trial invitation id for purpose 'trial'. */
  ref: string;
  purpose: GuardianTokenPurpose;
  /** Expiry, epoch ms. */
  exp: number;
  nonce: string;
};

export const GUARDIAN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GUARDIAN_REVOKE_TTL_MS = 400 * 24 * 60 * 60 * 1000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createGuardianToken(
  secret: string,
  payload: Omit<GuardianTokenPayload, 'nonce'>,
): string {
  const body = base64url(JSON.stringify({ ...payload, nonce: randomBytes(16).toString('base64url') }));
  return `${body}.${sign(secret, body)}`;
}

/** Returns the payload only for an untampered, unexpired token of the expected purpose. */
export function verifyGuardianToken(
  secret: string,
  token: unknown,
  purposes: readonly GuardianTokenPurpose[],
  now = Date.now(),
): GuardianTokenPayload | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<GuardianTokenPayload>;
    if (
      typeof payload.ref !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.nonce !== 'string' ||
      !purposes.includes(payload.purpose as GuardianTokenPurpose) ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload as GuardianTokenPayload;
  } catch {
    return null;
  }
}

/** Only this hash is stored, so a database read never yields a usable link. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashGuardianEmail(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`guardian-email:${email.trim().toLowerCase()}`).digest('hex');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

export function isPlausibleEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(value.trim())
  );
}
