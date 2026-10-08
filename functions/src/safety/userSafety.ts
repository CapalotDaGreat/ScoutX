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
  'confirming',
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

export type GuardianEmailKind =
  | 'consent'
  | 'confirmation'
  | 'trial'
  | 'contact'
  | 'child_consent'
  | 'child_confirm'
  | 'child_confirmation'
  | 'child_closed';

/** Days an under-13 account may wait for parental consent before it is deleted. */
export const CHILD_CONSENT_WAIT_DAYS = 14;

export function guardianEmail(kind: GuardianEmailKind, input: {
  firstName: string;
  link?: string;
  club?: string;
}): { subject: string; text: string; html: string } {
  const name = input.firstName;
  const paragraphs: string[] = [];
  let subject = '';
  if (kind === 'child_consent') {
    subject = `${name} needs your permission to use PitchProof`;
    paragraphs.push(
      `${name} started creating a PitchProof account, a football development app, and named you as their parent or legal guardian. Because ${name} is under 13, the account cannot be used until you give permission.`,
      'Accounts for children under 13 are private. Nobody else can see the profile, find it in search or contact your child. There is no public Passport, no scout contact, no trial invitations, no sharing of videos and no advertising.',
      `With your permission ${name} can log matches and training, track goals and keep videos in a private library. AI analysis of uploaded clips is only switched on if you allow it separately.`,
      'So far we have stored only your email address, your child\'s first name and the sign-in details of the account, so that we can ask you. If you do not give permission within 14 days, the account and this information are deleted.',
      `Read the details and decide here: ${input.link ?? ''}`,
      'After you sign the form we send a second email to this address. Your permission only takes effect when you confirm it from that email.',
      'If you do not know this child, ignore this email and the account will be deleted. Questions: support@pitchproof.online',
      'Privacy Policy: https://pitchproof.online/legal/privacy-policy/',
    );
  } else if (kind === 'child_confirm') {
    subject = `Confirm your permission for ${name}'s PitchProof account`;
    paragraphs.push(
      `You signed the parental consent form for ${name}'s private PitchProof account. Please confirm it was you.`,
      `Confirm here: ${input.link ?? ''}`,
      'This link works once and expires in 7 days. If you did not sign the form, do nothing: the account stays locked and is deleted after 14 days.',
    );
  } else if (kind === 'child_confirmation') {
    subject = `${name}'s private PitchProof account is active`;
    paragraphs.push(
      `Thank you. ${name}'s PitchProof account is now active in private mode.`,
      'You can review what we hold, ask for a copy, change your choice about AI analysis or delete the account at any time. Withdrawing consent deletes the account and its data.',
      `Keep this email. Manage or withdraw your consent here: ${input.link ?? ''}`,
      'Questions or requests: support@pitchproof.online.',
    );
  } else if (kind === 'child_closed') {
    subject = `${name}'s PitchProof account has been deleted`;
    paragraphs.push(
      `As you requested, ${name}'s PitchProof account and its data are being deleted.`,
      'Some records may be kept for a limited time where the law requires it, as described in our Data Retention Policy. Questions: support@pitchproof.online.',
    );
  } else if (kind === 'consent') {
    subject = `${name} asked you to approve their PitchProof account`;
    paragraphs.push(
      `${name} wants to use PitchProof, a football development app, and named you as their parent or guardian.`,
      'Because they are under 18, their account stays limited until you review it. You decide separately whether their profile can be public, whether scouts can find or contact them, whether videos can be shared, and whether AI analysis may be used. Nothing is allowed until you choose it, and you can change or withdraw your decision at any time.',
      `Review and decide: ${input.link ?? ''}`,
      'This link works once and expires in 7 days. If you do not know this person, ignore this email and nothing will happen.',
    );
  } else if (kind === 'confirmation') {
    subject = `Your decision for ${name}'s PitchProof account`;
    paragraphs.push(
      `Your decision for ${name}'s PitchProof account has been saved.`,
      `Keep this email. You can review, change or withdraw your consent at any time here: ${input.link ?? ''}`,
    );
  } else if (kind === 'trial') {
    subject = `${name} was invited to a football trial`;
    paragraphs.push(
      `${name} received a trial invitation through PitchProof${input.club ? ` from ${input.club}` : ''}.`,
      'They can only accept it after you approve. Review the details and decide here:',
      input.link ?? '',
      'This link works once and expires in 7 days. PitchProof does not verify clubs or scouts beyond the checks shown in the app. Never pay for a trial.',
    );
  } else {
    subject = `A scout contacted ${name} on PitchProof`;
    paragraphs.push(
      `A scout sent ${name} a request through PitchProof. You are receiving this because you approved scout contact for their account.`,
      'Messages stay inside PitchProof. If anything seems wrong, you can withdraw scout contact using the link in your consent confirmation email.',
    );
  }
  paragraphs.push('PitchProof is provided by CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland.');
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
