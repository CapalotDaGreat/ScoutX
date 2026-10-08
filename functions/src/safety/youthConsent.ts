import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { accountDeletionDeps } from '../appleAuth';
import { assertDeletionAuthorized, runAccountDeletion } from '../dataRights/deletion';
import { createCallableOptions } from '../callableOptions';
import {
  canChangeAgeBand,
  GUARDIAN_CONSENT_VERSION,
  isAgeBand,
  isYouthScope,
  YOUTH_SCOPES,
  type YouthScope,
} from './policy';
import {
  createGuardianToken,
  GUARDIAN_LINK_TTL_MS,
  GUARDIAN_REVOKE_TTL_MS,
  hashGuardianEmail,
  hashToken,
  isPlausibleEmail,
  maskEmail,
  verifyGuardianToken,
  type GuardianTokenPayload,
} from './guardianToken';
import { guardianEmail, guardianLinkBaseUrl, loadSafetyState, queueMail } from './userSafety';

const guardianLinkSecret = defineSecret('GUARDIAN_LINK_SECRET');

const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** HMAC key for guardian links; anything shorter than 32 characters is treated as not configured. */
const MIN_LINK_SECRET_LENGTH = 32;

function linkSecret(): string {
  const value = guardianLinkSecret.value();
  if (value && value.length >= MIN_LINK_SECRET_LENGTH) return value;
  if (process.env.FUNCTIONS_EMULATOR === 'true') return 'scoutx-emulator-only-guardian-secret';
  if (value) logger.error('GUARDIAN_LINK_SECRET is too short; guardian links are disabled');
  throw new HttpsError('failed-precondition', 'Guardian links are not configured.');
}

/**
 * Applies `update` only if `field` still holds this link's hash, inside a transaction, so two
 * simultaneous uses of one link cannot both succeed.
 */
async function updateIfLinkUnused(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  field: string,
  tokenHash: string,
  update: Record<string, unknown>,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get(field) !== tokenHash) {
      throw new HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
    }
    tx.update(ref, update);
  });
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

function guardianLink(token: string): string {
  return `${guardianLinkBaseUrl()}/guardian/?t=${encodeURIComponent(token)}`;
}

function sanitizeFirstName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().split(/\s+/)[0] ?? '' : '';
  const cleaned = name.replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 40);
  return cleaned || 'A young player';
}

/**
 * Records the caller's age band. Bands can only become stricter; loosening goes through
 * support. Under-13 accounts are not allowed, so the account is deleted immediately.
 */
export const setAgeBand = onCall(createCallableOptions(), async (request) => {
  const uid = requireUid(request.auth?.uid);
  const ageBand = (request.data as { ageBand?: unknown } | null)?.ageBand;
  if (!isAgeBand(ageBand)) {
    throw new HttpsError('invalid-argument', 'ageBand must be under13, 13-17 or 18plus.');
  }
  const db = getFirestore();
  const existing = await loadSafetyState(uid, db);
  if (!canChangeAgeBand(existing?.ageBand ?? null, ageBand)) {
    throw new HttpsError('failed-precondition', 'Your age group can only be changed by PitchProof support.');
  }

  if (ageBand === 'under13') {
    // Choosing an age band for the first time is part of sign-up. Tightening an existing band to
    // under-13 deletes an established account, so it needs the same recent sign-in as deletion.
    if (existing?.ageBand) await assertDeletionAuthorized(db, uid, request.auth?.token);
    const outcome = await runAccountDeletion(db, uid, accountDeletionDeps);
    if (outcome.status === 'failed') {
      throw new HttpsError('aborted', "We couldn't complete account deletion. Please try again.", { reason: 'deletion_incomplete' });
    }
    return { ageBand, deleted: true };
  }

  const now = new Date().toISOString();
  if (existing?.ageBand === ageBand) {
    return { ageBand, deleted: false };
  }
  await db.collection('userSafety').doc(uid).set({
    ageBand,
    guardianStatus: ageBand === '18plus' ? 'not_required' : 'required',
    scopes: [],
    consentId: null,
    consentExpiresAt: null,
    consentVersion: null,
    guardianEmailMasked: null,
    ageBandSetAt: now,
    updatedAt: now,
  });
  return { ageBand, deleted: false };
});

export const requestGuardianConsent = onCall(
  createCallableOptions({ secrets: [guardianLinkSecret] }),
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const data = (request.data ?? {}) as { guardianEmail?: unknown; playerFirstName?: unknown };
    if (!isPlausibleEmail(data.guardianEmail)) {
      throw new HttpsError('invalid-argument', 'Enter a valid email address for your parent or guardian.');
    }
    const email = data.guardianEmail.trim();
    const authEmail = request.auth?.token.email;
    if (typeof authEmail === 'string' && authEmail.toLowerCase() === email.toLowerCase()) {
      throw new HttpsError('invalid-argument', "Use your parent's or guardian's email, not your own.");
    }
    const db = getFirestore();
    const state = await loadSafetyState(uid, db);
    if (state?.ageBand !== '13-17') {
      throw new HttpsError('failed-precondition', 'Guardian approval is only needed for players aged 13 to 17.');
    }

    const secret = linkSecret();
    const contactRef = db.collection('guardianContacts').doc(uid);
    const contact = (await contactRef.get()).data() ?? {};
    const recent = (Array.isArray(contact.requestTimes) ? contact.requestTimes : [])
      .filter((value): value is number => typeof value === 'number' && value > Date.now() - DAY_MS);
    if (recent.length >= MAX_REQUESTS_PER_DAY) {
      throw new HttpsError('resource-exhausted', 'Too many guardian emails today. Try again tomorrow.');
    }

    const consentRef = db.collection('youthConsents').doc();
    const token = createGuardianToken(secret, {
      ref: consentRef.id,
      purpose: 'consent',
      exp: Date.now() + GUARDIAN_LINK_TTL_MS,
    });
    const firstName = sanitizeFirstName(data.playerFirstName);
    const now = new Date().toISOString();

    const pending = await db.collection('youthConsents').where('uid', '==', uid).where('status', '==', 'pending').get();
    const batch = db.batch();
    for (const doc of pending.docs) {
      batch.update(doc.ref, { status: 'superseded', tokenHash: null, updatedAt: now });
    }
    batch.set(consentRef, {
      uid,
      guardianEmailHash: hashGuardianEmail(secret, email),
      status: 'pending',
      version: GUARDIAN_CONSENT_VERSION,
      requestedScopes: YOUTH_SCOPES,
      scopes: [],
      tokenHash: hashToken(token),
      revokeTokenHash: null,
      linkExpiresAt: new Date(Date.now() + GUARDIAN_LINK_TTL_MS).toISOString(),
      grantedAt: null,
      revokedAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      audit: [{ event: 'requested', at: now }],
    });
    batch.set(contactRef, {
      email,
      emailHash: hashGuardianEmail(secret, email),
      firstName,
      requestTimes: [...recent, Date.now()],
      updatedAt: now,
    });
    batch.set(
      db.collection('userSafety').doc(uid),
      { guardianStatus: 'pending', consentId: consentRef.id, guardianEmailMasked: maskEmail(email), updatedAt: now },
      { merge: true },
    );
    await batch.commit();
    await queueMail(db, { to: email, uid, purpose: 'guardian_consent', ...guardianEmail('consent', { firstName, link: guardianLink(token) }) });
    return { status: 'pending', guardianEmailMasked: maskEmail(email) };
  },
);

type ResolvedToken =
  | { kind: 'consent' | 'revoke'; payload: GuardianTokenPayload; tokenHash: string; consent: FirebaseFirestore.DocumentSnapshot }
  | { kind: 'trial'; payload: GuardianTokenPayload; tokenHash: string; trial: FirebaseFirestore.DocumentSnapshot };

async function resolveToken(db: Firestore, token: unknown): Promise<ResolvedToken> {
  const payload = verifyGuardianToken(linkSecret(), token, ['consent', 'revoke', 'trial']);
  if (!payload || typeof token !== 'string') {
    throw new HttpsError('permission-denied', 'This link is invalid or has expired.');
  }
  const tokenHash = hashToken(token);
  if (payload.purpose === 'trial') {
    const trial = await db.collection('trialInvitations').doc(payload.ref).get();
    if (!trial.exists || trial.get('guardianTokenHash') !== tokenHash) {
      throw new HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
    }
    return { kind: 'trial', payload, tokenHash, trial };
  }
  const consent = await db.collection('youthConsents').doc(payload.ref).get();
  const field = payload.purpose === 'consent' ? 'tokenHash' : 'revokeTokenHash';
  if (!consent.exists || consent.get(field) !== tokenHash) {
    throw new HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
  }
  return { kind: payload.purpose, payload, tokenHash, consent };
}

/** Hosting page calls this without an account; the signed token is the only credential. */
const publicGuardianOptions = createCallableOptions({ secrets: [guardianLinkSecret], enforceAppCheck: false });

export const getGuardianConsentRequest = onCall(publicGuardianOptions, async (request) => {
  const db = getFirestore();
  const resolved = await resolveToken(db, (request.data as { token?: unknown } | null)?.token);
  if (resolved.kind === 'trial') {
    const trial = resolved.trial.data() ?? {};
    const contact = (await db.collection('guardianContacts').doc(String(trial.playerId)).get()).data() ?? {};
    return {
      purpose: 'trial',
      playerFirstName: typeof contact.firstName === 'string' ? contact.firstName : 'Your child',
      trial: {
        club: typeof trial.club === 'string' ? trial.club : '',
        date: typeof trial.scheduledDate === 'string' ? trial.scheduledDate : '',
        location: typeof trial.location === 'string' ? trial.location : '',
        scoutName: typeof trial.scoutName === 'string' ? trial.scoutName : '',
      },
      guardianApproval: trial.guardianApproval ?? 'pending',
    };
  }
  const consent = resolved.consent.data() ?? {};
  const contact = (await db.collection('guardianContacts').doc(String(consent.uid)).get()).data() ?? {};
  return {
    purpose: resolved.kind,
    playerFirstName: typeof contact.firstName === 'string' ? contact.firstName : 'Your child',
    status: consent.status,
    version: consent.version,
    scopes: YOUTH_SCOPES,
    grantedScopes: Array.isArray(consent.scopes) ? consent.scopes : [],
  };
});

export const respondGuardianConsent = onCall(publicGuardianOptions, async (request) => {
  const db = getFirestore();
  const data = (request.data ?? {}) as {
    token?: unknown;
    decision?: unknown;
    scopes?: unknown;
    confirmGuardian?: unknown;
  };
  const resolved = await resolveToken(db, data.token);
  const decision = data.decision;
  const now = new Date().toISOString();

  if (resolved.kind === 'trial') {
    if (decision !== 'approve' && decision !== 'decline') {
      throw new HttpsError('invalid-argument', 'Choose approve or decline.');
    }
    const trial = resolved.trial.data() ?? {};
    const update: Record<string, unknown> = {
      guardianApproval: decision === 'approve' ? 'approved' : 'declined',
      guardianDecidedAt: now,
      guardianTokenHash: null,
    };
    if (decision === 'decline' && trial.status === 'pending') {
      update.status = 'declined';
      update.history = FieldValue.arrayUnion({
        id: `guardian-${now}`,
        action: 'declined',
        actorId: 'guardian',
        actorName: 'Guardian',
        actorRole: 'player',
        timestamp: now,
        note: 'Declined by parent or guardian',
      });
      update.updatedAt = now;
    }
    await updateIfLinkUnused(db, resolved.trial.ref, 'guardianTokenHash', resolved.tokenHash, update);
    return { ok: true, guardianApproval: update.guardianApproval };
  }

  const consent = resolved.consent.data() ?? {};
  const uid = String(consent.uid);
  const safetyRef = db.collection('userSafety').doc(uid);

  if (decision === 'revoke') {
    if (resolved.kind !== 'revoke') throw new HttpsError('invalid-argument', 'Use the link from your confirmation email.');
    await updateIfLinkUnused(db, resolved.consent.ref, 'revokeTokenHash', resolved.tokenHash, {
      status: 'revoked',
      scopes: [],
      revokedAt: now,
      revokeTokenHash: null,
      updatedAt: now,
      audit: FieldValue.arrayUnion({ event: 'revoked_by_guardian', at: now }),
    });
    await safetyRef.set({ guardianStatus: 'revoked', scopes: [], consentExpiresAt: null, updatedAt: now }, { merge: true });
    return { ok: true, status: 'revoked' };
  }

  if (decision === 'decline') {
    if (resolved.kind !== 'consent') throw new HttpsError('invalid-argument', 'Use revoke to withdraw consent.');
    await updateIfLinkUnused(db, resolved.consent.ref, 'tokenHash', resolved.tokenHash, {
      status: 'declined',
      tokenHash: null,
      updatedAt: now,
      audit: FieldValue.arrayUnion({ event: 'declined', at: now }),
    });
    await safetyRef.set({ guardianStatus: 'declined', scopes: [], updatedAt: now }, { merge: true });
    return { ok: true, status: 'declined' };
  }

  if (decision !== 'approve') throw new HttpsError('invalid-argument', 'Unknown decision.');
  if (data.confirmGuardian !== true) {
    throw new HttpsError('invalid-argument', 'Confirm that you are the parent or legal guardian.');
  }
  const scopes: YouthScope[] = Array.isArray(data.scopes) ? [...new Set(data.scopes.filter(isYouthScope))] : [];
  const expiresAt = new Date(Date.now() + CONSENT_VALIDITY_MS).toISOString();
  const revokeToken = createGuardianToken(linkSecret(), {
    ref: resolved.consent.id,
    purpose: 'revoke',
    exp: Date.now() + GUARDIAN_REVOKE_TTL_MS,
  });
  const linkField = resolved.kind === 'consent' ? 'tokenHash' : 'revokeTokenHash';
  await updateIfLinkUnused(db, resolved.consent.ref, linkField, resolved.tokenHash, {
    status: 'approved',
    scopes,
    tokenHash: null,
    revokeTokenHash: hashToken(revokeToken),
    grantedAt: consent.grantedAt ?? now,
    expiresAt,
    updatedAt: now,
    audit: FieldValue.arrayUnion({ event: resolved.kind === 'consent' ? 'approved' : 'scopes_updated', at: now, scopes }),
  });
  await safetyRef.set(
    {
      guardianStatus: 'approved',
      scopes,
      consentId: resolved.consent.id,
      consentVersion: consent.version ?? GUARDIAN_CONSENT_VERSION,
      consentExpiresAt: expiresAt,
      updatedAt: now,
    },
    { merge: true },
  );
  const contact = (await db.collection('guardianContacts').doc(uid).get()).data() ?? {};
  if (typeof contact.email === 'string') {
    await queueMail(db, {
      to: contact.email,
      uid,
      purpose: 'guardian_confirmation',
      ...guardianEmail('confirmation', {
        firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child',
        link: guardianLink(revokeToken),
      }),
    });
  }
  return { ok: true, status: 'approved', scopes };
});

/** The player can withdraw guardian consent themselves; youth features stop immediately. */
export const revokeGuardianConsent = onCall(createCallableOptions(), async (request) => {
  const uid = requireUid(request.auth?.uid);
  const db = getFirestore();
  const now = new Date().toISOString();
  const consents = await db.collection('youthConsents').where('uid', '==', uid).where('status', 'in', ['approved', 'pending']).get();
  const batch = db.batch();
  for (const doc of consents.docs) {
    batch.update(doc.ref, {
      status: 'revoked',
      scopes: [],
      tokenHash: null,
      revokeTokenHash: null,
      revokedAt: now,
      updatedAt: now,
      audit: FieldValue.arrayUnion({ event: 'revoked_by_player', at: now }),
    });
  }
  batch.set(db.collection('userSafety').doc(uid), { guardianStatus: 'revoked', scopes: [], consentExpiresAt: null, updatedAt: now }, { merge: true });
  await batch.commit();
  return { status: 'revoked' };
});

/** Trials for minors wait for guardian co-approval before the player can accept. */
export const onTrialInvitationCreatedGuardian = onDocumentCreated(
  { document: 'trialInvitations/{trialId}', secrets: [guardianLinkSecret] },
  async (event) => {
    const trial = event.data?.data();
    if (!trial || typeof trial.playerId !== 'string') return;
    const db = getFirestore();
    const state = await loadSafetyState(trial.playerId, db);
    if (state?.ageBand !== '13-17' || !event.data) return;
    await requestTrialGuardianApproval(db, event.data.ref, trial, {});
  },
);

/** What a guardian approved; changing any of these needs a new approval. */
export const GUARDIAN_APPROVED_TRIAL_FIELDS = ['club', 'coach', 'location', 'scheduledDate', 'scoutId'] as const;

export function trialDetailsChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return GUARDIAN_APPROVED_TRIAL_FIELDS.some((field) => before[field] !== after[field]);
}

async function requestTrialGuardianApproval(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  trial: FirebaseFirestore.DocumentData,
  extra: Record<string, unknown>,
): Promise<void> {
  const token = createGuardianToken(linkSecret(), { ref: ref.id, purpose: 'trial', exp: Date.now() + GUARDIAN_LINK_TTL_MS });
  await ref.update({ guardianApproval: 'pending', guardianTokenHash: hashToken(token), guardianDecidedAt: null, ...extra });
  const contact = (await db.collection('guardianContacts').doc(String(trial.playerId)).get()).data() ?? {};
  if (typeof contact.email !== 'string') {
    logger.warn('Minor trial without guardian contact', { trialId: ref.id });
    return;
  }
  await queueMail(db, {
    to: contact.email,
    uid: String(trial.playerId),
    purpose: 'guardian_trial',
    ...guardianEmail('trial', {
      firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child',
      club: typeof trial.club === 'string' ? trial.club.slice(0, 80) : undefined,
      link: guardianLink(token),
    }),
  });
}

/**
 * A guardian approves a specific trial (club, coach, place, date, scout). If the scout changes
 * any of that afterwards, the approval no longer applies: it goes back to pending, an accepted
 * trial returns to pending, and the guardian gets a new link.
 */
export const onTrialInvitationUpdatedGuardian = onDocumentUpdated(
  { document: 'trialInvitations/{trialId}', secrets: [guardianLinkSecret] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || !event.data) return;
    if (before.guardianApproval == null || !trialDetailsChanged(before, after)) return;
    if (after.status === 'declined' || after.status === 'cancelled') return;
    const now = new Date().toISOString();
    await requestTrialGuardianApproval(getFirestore(), event.data.after.ref, after, {
      ...(after.status === 'accepted' ? { status: 'pending' } : {}),
      history: FieldValue.arrayUnion({
        id: `guardian-reapproval-${now}`,
        action: 'note_added',
        actorId: 'system',
        actorName: 'PitchProof',
        actorRole: 'system',
        timestamp: now,
        note: 'Trial details changed; waiting for parent or guardian approval again',
      }),
      updatedAt: now,
    });
  },
);

/** Informs the guardian of a minor when a scout contacts them through PitchProof. */
export async function notifyGuardianOfScoutContact(db: Firestore, playerId: string): Promise<void> {
  const contact = (await db.collection('guardianContacts').doc(playerId).get()).data() ?? {};
  if (typeof contact.email !== 'string') return;
  await queueMail(db, {
    to: contact.email,
    uid: playerId,
    purpose: 'guardian_scout_contact',
    ...guardianEmail('contact', { firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child' }),
  });
}
