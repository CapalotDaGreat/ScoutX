import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  getUserSafetyPolicy,
  isAgeBand,
  type GuardianStatus,
  type SafetyPolicy,
  type SafetyState,
} from './policy';

const GUARDIAN_STATUSES: readonly GuardianStatus[] = [
  'not_required',
  'required',
  'pending',
  'approved',
  'declined',
  'revoked',
  'expired',
];

export function parseSafetyState(data: Record<string, unknown> | undefined): SafetyState | null {
  if (!data || !isAgeBand(data.ageBand)) return null;
  return {
    ageBand: data.ageBand,
    guardianStatus: GUARDIAN_STATUSES.includes(data.guardianStatus as GuardianStatus)
      ? (data.guardianStatus as GuardianStatus)
      : data.ageBand === '18plus'
        ? 'not_required'
        : 'required',
    scopes: Array.isArray(data.scopes) ? data.scopes.filter((item): item is string => typeof item === 'string') : [],
    consentExpiresAt: typeof data.consentExpiresAt === 'string' ? data.consentExpiresAt : null,
  };
}

export async function loadSafetyState(uid: string, db: Firestore = getFirestore()): Promise<SafetyState | null> {
  const snapshot = await db.collection('userSafety').doc(uid).get();
  return parseSafetyState(snapshot.data());
}

/**
 * Policy for a user other than the caller (e.g. the player a scout is contacting). Accounts
 * that never set an age band predate the age gate; they are treated as adults until they do,
 * because the app blocks them on next launch until a band is chosen.
 */
export async function loadSafetyPolicy(uid: string, db: Firestore = getFirestore()): Promise<SafetyPolicy> {
  const state = await loadSafetyState(uid, db);
  return getUserSafetyPolicy(state ?? { ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null });
}

export function guardianLinkBaseUrl(): string {
  const configured = process.env.GUARDIAN_LINK_BASE_URL?.trim();
  return configured && /^https?:\/\//.test(configured) ? configured.replace(/\/$/, '') : 'https://pitchproof.online';
}

/** Queues an email through the Firebase Trigger Email extension's `mail` collection. */
export async function queueMail(
  db: Firestore,
  input: { to: string; subject: string; text: string; html: string; uid: string; purpose: string },
): Promise<void> {
  await db.collection('mail').add({
    to: [input.to],
    message: { subject: input.subject, text: input.text, html: input.html },
    scoutxUid: input.uid,
    purpose: input.purpose,
    createdAt: new Date().toISOString(),
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function guardianEmail(kind: 'consent' | 'confirmation' | 'trial' | 'contact', input: {
  firstName: string;
  link?: string;
  club?: string;
}): { subject: string; text: string; html: string } {
  const name = input.firstName;
  const paragraphs: string[] = [];
  let subject = '';
  if (kind === 'consent') {
    subject = `${name} asked you to approve their ScoutX account`;
    paragraphs.push(
      `${name} wants to use ScoutX, a football development app, and named you as their parent or guardian.`,
      'Because they are under 18, their account stays limited until you review it. You decide separately whether their profile can be public, whether scouts can find or contact them, whether videos can be shared, and whether AI analysis may be used. Nothing is allowed until you choose it, and you can change or withdraw your decision at any time.',
      `Review and decide: ${input.link ?? ''}`,
      'This link works once and expires in 7 days. If you do not know this person, ignore this email and nothing will happen.',
    );
  } else if (kind === 'confirmation') {
    subject = `Your decision for ${name}'s ScoutX account`;
    paragraphs.push(
      `Your decision for ${name}'s ScoutX account has been saved.`,
      `Keep this email. You can review, change or withdraw your consent at any time here: ${input.link ?? ''}`,
    );
  } else if (kind === 'trial') {
    subject = `${name} was invited to a football trial`;
    paragraphs.push(
      `${name} received a trial invitation through ScoutX${input.club ? ` from ${input.club}` : ''}.`,
      'They can only accept it after you approve. Review the details and decide here:',
      input.link ?? '',
      'This link works once and expires in 7 days. ScoutX does not verify clubs or scouts beyond the checks shown in the app. Never pay for a trial.',
    );
  } else {
    subject = `A scout contacted ${name} on ScoutX`;
    paragraphs.push(
      `A scout sent ${name} a request through ScoutX. You are receiving this because you approved scout contact for their account.`,
      'Messages stay inside ScoutX. If anything seems wrong, you can withdraw scout contact using the link in your consent confirmation email.',
    );
  }
  paragraphs.push('ScoutX is provided by CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland.');
  return {
    subject,
    text: paragraphs.join('\n\n'),
    html: paragraphs
      .map((paragraph) =>
        paragraph.startsWith('http')
          ? `<p><a href="${escapeHtml(paragraph)}">${escapeHtml(paragraph)}</a></p>`
          : `<p>${escapeHtml(paragraph).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`,
      )
      .join(''),
  };
}
