import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from '../callableOptions';
import { isPlausibleEmail } from '../safety/guardianToken';
import { loadSafetyPolicy } from '../safety/userSafety';
import { applyHold } from './holds';
import {
  REVIEW_SLA_HOURS,
  higherPriority,
  holdKey,
  isReportReason,
  isReportTargetType,
  priorityFor,
  shouldAutoRestrict,
  type CasePriority,
  type ReportReason,
  type ReportTargetType,
} from './model';
import { reprojectOwner } from './reproject';
import { writeAuditLog } from './staff';

/** Confirms who owns the reported target, so a reporter cannot point a case at someone else. */
export async function resolveTargetOwner(
  db: Firestore,
  targetType: ReportTargetType,
  targetId: string,
  claimedOwnerId: string,
): Promise<string | null> {
  switch (targetType) {
    case 'user':
    case 'scout':
    case 'passport':
      return (await db.collection('users').doc(targetId).get()).exists ? targetId : null;
    case 'media': {
      const media = await db.collection('players').doc(claimedOwnerId).collection('media').doc(targetId).get();
      return media.exists ? claimedOwnerId : null;
    }
    case 'reel': {
      const reel = await db.collection('reels').doc(targetId).get();
      const owner = reel.get('ownerId');
      return typeof owner === 'string' ? owner : null;
    }
    case 'trial': {
      const trial = await db.collection('trialInvitations').doc(targetId).get();
      const scout = trial.get('scoutId');
      return typeof scout === 'string' ? scout : null;
    }
    case 'evidenceRequest': {
      const request = await db.collection('evidenceRequests').doc(targetId).get();
      const scout = request.get('scoutId');
      return typeof scout === 'string' ? scout : null;
    }
    case 'scoutingReport': {
      const report = await db.collection('scoutingReports').doc(targetId).get();
      const scout = report.get('scoutId');
      return typeof scout === 'string' ? scout : null;
    }
    case 'post':
      return claimedOwnerId || null;
    default:
      return null;
  }
}

type ReportDoc = {
  reporterId?: string;
  targetType?: unknown;
  targetId?: unknown;
  targetOwnerId?: unknown;
  reason?: unknown;
};

/** Groups reports per target into one open case and applies the automatic protections. */
export async function triageReport(db: Firestore, reportId: string, report: ReportDoc): Promise<string | null> {
  if (!isReportTargetType(report.targetType) || !isReportReason(report.reason) || typeof report.targetId !== 'string') {
    return null;
  }
  const targetType = report.targetType;
  const targetId = report.targetId;
  const reason: ReportReason = report.reason;
  const claimed = typeof report.targetOwnerId === 'string' ? report.targetOwnerId : '';
  const ownerId = await resolveTargetOwner(db, targetType, targetId, claimed);
  const ownerIsMinor = ownerId ? (await loadSafetyPolicy(ownerId, db)).isMinor : false;
  const priority = priorityFor(reason, ownerIsMinor);
  const key = holdKey(targetType, targetId);
  const now = new Date();

  const existing = await db.collection('moderationCases').where('targetKey', '==', key).where('open', '==', true).limit(1).get();
  let caseId: string;
  let casePriority: CasePriority = priority;
  if (!existing.empty) {
    const doc = existing.docs[0];
    caseId = doc.id;
    casePriority = higherPriority(doc.get('priority') as CasePriority, priority);
    await doc.ref.update({
      reportIds: FieldValue.arrayUnion(reportId),
      reasons: FieldValue.arrayUnion(reason),
      reportCount: FieldValue.increment(1),
      priority: casePriority,
      updatedAt: now.toISOString(),
    });
  } else {
    const ref = db.collection('moderationCases').doc();
    caseId = ref.id;
    await ref.set({
      targetType,
      targetId,
      targetKey: key,
      targetOwnerId: ownerId,
      ownerVerified: ownerId !== null,
      ownerIsMinor,
      reasons: [reason],
      reportIds: [reportId],
      reportCount: 1,
      priority,
      state: 'triage',
      open: true,
      decision: null,
      decidedBy: null,
      reviewDueAt: new Date(now.getTime() + REVIEW_SLA_HOURS[priority] * 3600_000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  await db.collection('contentReports').doc(reportId).set({ caseId }, { merge: true });

  if (ownerId && shouldAutoRestrict(targetType, reason)) {
    await applyHold({ targetType, targetId, ownerId, state: 'restricted', caseId }, db);
    await db.collection('moderationCases').doc(caseId).update({ state: 'restricted', autoRestricted: true });
    await writeAuditLog(db, {
      actorId: 'system',
      actorRole: 'system',
      action: 'auto_restrict',
      targetType,
      targetId,
      previousState: null,
      newState: 'restricted',
      reason: `Automatic restriction while a "${reason}" report is reviewed.`,
      caseId,
    });
    await reprojectOwner(ownerId, db).catch((error: unknown) =>
      logger.warn('Reprojection after auto-restrict failed', {
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
  return caseId;
}

export const onContentReportCreated = onDocumentCreated('contentReports/{reportId}', async (event) => {
  const data = event.data?.data() as ReportDoc | undefined;
  if (!data) return;
  try {
    await triageReport(getFirestore(), event.params.reportId, data);
  } catch (error) {
    logger.error('Report triage failed', { message: error instanceof Error ? error.message : 'unknown' });
    throw error;
  }
});

const PUBLIC_REASONS: readonly ReportReason[] = ['appears_in_video', 'minor_in_video', 'privacy', 'copyright', 'safety_concern'];
const PUBLIC_DAILY_LIMIT = 5;

/** Behind the Hosting rewrite the client address is the first x-forwarded-for entry. */
export function clientKey(forwardedFor: string | string[] | undefined, ip: string | undefined): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const client = header?.split(',')[0]?.trim() || ip || 'unknown';
  return createHash('sha256').update(`public-report:${client}`).digest('hex').slice(0, 32);
}

/**
 * No-account report from the Hosting form, for people who appear in a video. Rate-limited per
 * client; the form also carries a honeypot. App Check for the web form is external configuration.
 */
export const submitPublicReport = onCall(createCallableOptions({ enforceAppCheck: false }), async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  if (typeof data.website === 'string' && data.website.length > 0) {
    return { received: true };
  }
  const passport = typeof data.passport === 'string' ? data.passport.trim() : '';
  const slugMatch = /(?:\/player\/)?([a-z0-9][a-z0-9-]{1,40})\/?$/i.exec(passport);
  const reason = data.reason;
  const details = typeof data.details === 'string' ? data.details.trim().slice(0, 1000) : '';
  const relationship = data.relationship === 'self' || data.relationship === 'guardian' ? data.relationship : 'other';
  if (!slugMatch || !isReportReason(reason) || !PUBLIC_REASONS.includes(reason) || details.length < 10) {
    throw new HttpsError('invalid-argument', 'Passport link, reason and a short description are required.');
  }
  const contact = isPlausibleEmail(data.contactEmail) ? data.contactEmail.trim().toLowerCase() : null;

  const db = getFirestore();
  const limitRef = db.collection('publicReportLimits').doc(`${clientKey(request.rawRequest?.headers['x-forwarded-for'], request.rawRequest?.ip)}_${new Date().toISOString().slice(0, 10)}`);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(limitRef);
    const count = (snap.get('count') as number | undefined) ?? 0;
    if (count >= PUBLIC_DAILY_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Too many reports today. Please try again tomorrow.');
    }
    transaction.set(limitRef, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
  });

  const slug = await db.collection('portfolioSlugs').doc(slugMatch[1].toLowerCase()).get();
  const playerId = slug.get('playerId');
  if (typeof playerId !== 'string') {
    throw new HttpsError('not-found', 'We could not find that Passport. Check the link and try again.');
  }
  const reportRef = db.collection('contentReports').doc();
  await reportRef.set({
    reporterId: 'public',
    targetType: 'passport',
    targetId: playerId,
    targetOwnerId: playerId,
    reason,
    details: `[${relationship}] ${details}`,
    source: 'public_form',
    createdAt: new Date().toISOString(),
  });
  if (contact) {
    await db.collection('publicReporterContacts').doc(reportRef.id).set({ email: contact, createdAt: new Date().toISOString() });
  }
  return { received: true };
});
