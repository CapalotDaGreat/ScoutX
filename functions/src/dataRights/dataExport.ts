import { getFirestore, Timestamp, type DocumentSnapshot, type Firestore, type Query } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { createCallableOptions } from '../callableOptions';
import { FOOTBALL_SOURCES_COLLECTION } from '../footballSources/core';
import { taskQueueName } from '../region';
import { DAY_MS, RETENTION, addDays } from './retention';
import { logSafeError } from '../logging/redact';

export const EXPORT_COLLECTION = 'dataExports';
/** Sign-in must be this recent to export (the archive contains everything about the account). */
export const EXPORT_RECENT_AUTH_SEC = 10 * 60;
export const EXPORT_COOLDOWN_MS = DAY_MS;
const MAX_DOCS_PER_SECTION = 2000;

export type ExportStatus = 'queued' | 'building' | 'ready' | 'failed' | 'expired';

export interface ExportQueue {
  enqueue(exportId: string): Promise<void>;
}

const cloudTasksExportQueue: ExportQueue = {
  async enqueue(exportId) {
    await getFunctions().taskQueue(taskQueueName('buildDataExport')).enqueue({ exportId }, { dispatchDeadlineSeconds: 1800 });
  },
};

let exportQueue: ExportQueue = cloudTasksExportQueue;

export function setExportQueue(queue: ExportQueue): void {
  exportQueue = queue;
}

/** Keys that would describe a real-world position. Movement data is pitch-relative and must never carry them. */
const LOCATION_KEYS = new Set(['lat', 'lng', 'lon', 'latitude', 'longitude', 'coords', 'coordinates', 'location', 'geo', 'geopoint', 'altitude']);

/** Firestore values to plain JSON: timestamps become ISO strings, location keys are dropped. */
export function toPlain(value: unknown, dropLocation = false): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toPlain(item, dropLocation));
  if (value && typeof value === 'object') {
    if (typeof (value as { latitude?: unknown }).latitude === 'number' && dropLocation) return null;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (dropLocation && LOCATION_KEYS.has(key.toLowerCase())) continue;
      out[key] = toPlain(inner, dropLocation);
    }
    return out;
  }
  return value;
}

function docJson(snap: DocumentSnapshot, dropLocation = false): Record<string, unknown> | null {
  if (!snap.exists) return null;
  return { ...(toPlain(snap.data(), dropLocation) as Record<string, unknown>), id: snap.id };
}

async function many(query: Query, dropLocation = false): Promise<Record<string, unknown>[]> {
  const snap = await query.limit(MAX_DOCS_PER_SECTION).get();
  return snap.docs.map((doc) => docJson(doc, dropLocation) ?? {});
}

/** Paths of the user's own media, turned into time-limited links where the platform can sign them. */
async function mediaLinks(uid: string, paths: string[], expiresAt: string): Promise<{ path: string; url: string | null }[]> {
  const bucket = getStorage().bucket();
  const own = [...new Set(paths)].filter((path) => path.startsWith(`profiles/${uid}/`)).slice(0, 500);
  return Promise.all(
    own.map(async (path) => {
      try {
        const [url] = await bucket.file(path).getSignedUrl({ action: 'read', expires: Date.parse(expiresAt) });
        return { path, url };
      } catch {
        return { path, url: null };
      }
    }),
  );
}

function storagePathsIn(items: Record<string, unknown>[]): string[] {
  const keys = ['storagePath', 'videoStoragePath', 'thumbnailPath', 'coverPath'];
  return items.flatMap((item) => keys.map((key) => item[key]).filter((value): value is string => typeof value === 'string'));
}

export async function buildExportArchive(db: Firestore, uid: string, linkExpiresAt: string, now: Date = new Date()) {
  const player = db.collection('players').doc(uid);
  const [
    user, profile, safety, consent, consentItems, passport, summary, slugs,
    matches, goals, training, evidence, identity, reflections, playerMedia,
    analyses, observationsAbout, observationsBy, movement, reels, reelExports,
    reportsBy, briefsBy, watchlistBy, requestsBy, trialsSent, trialsReceived, requestsReceived,
    workspace, workspaceEntries, activities, entitlement, usagePeriods, privacyRequests, reportsFiled, appeals,
    footballSources,
  ] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('profiles').doc(uid).get(),
    db.collection('userSafety').doc(uid).get(),
    db.collection('consentRecords').doc(uid).get(),
    many(db.collection('consentRecords').doc(uid).collection('items')),
    db.collection('publicPassports').doc(uid).get(),
    db.collection('passportSummaries').doc(uid).get(),
    many(db.collection('portfolioSlugs').where('playerId', '==', uid)),
    many(player.collection('matches')),
    many(player.collection('developmentGoals')),
    many(player.collection('trainingSessions')),
    many(player.collection('evidenceItems')),
    many(player.collection('identitySnapshots')),
    many(player.collection('trialReflections')),
    many(player.collection('media')),
    many(db.collection('matchAnalysisJobs').where('playerId', '==', uid)),
    many(db.collection('coachObservations').where('playerId', '==', uid)),
    many(db.collection('coachObservations').where('coachId', '==', uid)),
    many(db.collection('gpsSessions').where('playerId', '==', uid), true),
    many(db.collection('reels').where('ownerId', '==', uid)),
    many(db.collection('reelExports').where('ownerId', '==', uid)),
    many(db.collection('scoutingReports').where('scoutId', '==', uid)),
    many(db.collection('scoutBriefs').where('scoutId', '==', uid)),
    many(db.collection('watchlistEvents').where('scoutId', '==', uid)),
    many(db.collection('evidenceRequests').where('scoutId', '==', uid)),
    many(db.collection('trialInvitations').where('scoutId', '==', uid)),
    many(db.collection('trialInvitations').where('playerId', '==', uid)),
    many(db.collection('evidenceRequests').where('playerId', '==', uid)),
    db.collection('recruitmentWorkspaces').doc(uid).get(),
    many(db.collection('recruitmentWorkspaces').doc(uid).collection('entries')),
    many(db.collection('activities').where('recipientId', '==', uid)),
    db.collection('entitlements').doc(uid).get(),
    many(db.collection('usageLedger').doc(uid).collection('periods')),
    many(db.collection('privacyRequests').where('uid', '==', uid)),
    many(db.collection('contentReports').where('reporterId', '==', uid)),
    many(db.collection('appeals').where('ownerId', '==', uid)),
    many(player.collection(FOOTBALL_SOURCES_COLLECTION)),
  ]);

  const media = [...playerMedia, ...analyses, ...reelExports];
  const analysisFeedback = (
    await Promise.all(
      analyses
        .map((analysis) => analysis.id)
        .filter((id): id is string => typeof id === 'string')
        .map((id) => many(db.collection('matchAnalysisJobs').doc(id).collection('corrections'))),
    )
  ).flat();
  const analysisIdentityCoordination = (
    await Promise.all(analyses
      .map((analysis) => analysis.id)
      .filter((id): id is string => typeof id === 'string')
      .map((id) => many(db.collection('matchAnalysisJobs').doc(id).collection('identityCoordination'))))
  ).flat();
  return {
    format: 'scoutx-data-export',
    formatVersion: 1,
    generatedAt: now.toISOString(),
    accountId: uid,
    notes: [
      'This archive contains the personal data PitchProof holds about your account in machine-readable JSON.',
      'Movement sessions are positions on the pitch relative to the pitch only; PitchProof does not record where you are.',
      `Media links stop working on ${linkExpiresAt}. Where a link is null, open the file in the PitchProof app.`,
      'Scouts\u2019 private notes about you are their own records and are not included; requests and invitations sent to you are.',
    ],
    sections: {
      account: { user: docJson(user), profile: docJson(profile) },
      safety: safety.exists ? { ageBand: safety.get('ageBand') ?? null, guardianStatus: safety.get('guardianStatus') ?? null, scopes: safety.get('scopes') ?? [] } : null,
      consents: { summary: docJson(consent), history: consentItems },
      passport: { public: docJson(passport), summary: docJson(summary), slugs },
      matches,
      externalFootballSources: footballSources,
      development: { goals, training, evidence, identitySnapshots: identity, trialReflections: reflections },
      analyses,
      analysisFeedback,
      analysisIdentityCoordination,
      coaching: { aboutYou: observationsAbout, writtenByYou: observationsBy },
      movementSessions: movement,
      media: { items: playerMedia, reels, reelExports, downloadLinks: await mediaLinks(uid, storagePathsIn(media), linkExpiresAt) },
      scouting: { reports: reportsBy, briefs: briefsBy, watchlist: watchlistBy, evidenceRequests: requestsBy, trialInvitations: trialsSent, workspace: docJson(workspace), workspaceEntries },
      received: { trialInvitations: trialsReceived, evidenceRequests: requestsReceived, activities },
      subscription: { entitlement: docJson(entitlement), usagePeriods },
      privacyRequests,
      safetyReports: { filed: reportsFiled, appeals },
    },
  };
}

export async function processDataExport(db: Firestore, exportId: string, now: Date = new Date()): Promise<ExportStatus> {
  const ref = db.collection(EXPORT_COLLECTION).doc(exportId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'queued') return null;
    tx.update(ref, { status: 'building', startedAt: now.toISOString(), updatedAt: now.toISOString() });
    return String(snap.get('uid'));
  });
  if (!claimed) return ((await ref.get()).get('status') as ExportStatus | undefined) ?? 'failed';

  const expiresAt = addDays(now, RETENTION.exportDays);
  try {
    const archive = await buildExportArchive(db, claimed, expiresAt, now);
    const body = Buffer.from(JSON.stringify(archive, null, 2), 'utf8');
    const storagePath = `exports/${claimed}/${exportId}/scoutx-data-export.json`;
    const file = getStorage().bucket().file(storagePath);
    await file.save(body, { contentType: 'application/json', resumable: false });
    let downloadUrl: string | null = null;
    try {
      [downloadUrl] = await file.getSignedUrl({ action: 'read', expires: Date.parse(expiresAt) });
    } catch {
      // Without signing permission the owner downloads through Storage rules instead.
    }
    await ref.update({
      status: 'ready',
      storagePath,
      downloadUrl,
      sizeBytes: body.length,
      expiresAt,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return 'ready';
  } catch (error) {
    logger.error('Data export failed', { exportId, ...logSafeError(error) });
    await ref.update({ status: 'failed', updatedAt: new Date().toISOString() });
    return 'failed';
  }
}

export const requestDataExport = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const authTime = Number((request.auth?.token as { auth_time?: unknown } | undefined)?.auth_time ?? 0);
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > EXPORT_RECENT_AUTH_SEC) {
    throw new HttpsError('failed-precondition', 'Please sign in again to download your data.', { reason: 'recent_login_required' });
  }
  const db = getFirestore();
  const recent = await db.collection(EXPORT_COLLECTION).where('uid', '==', uid).limit(50).get();
  const cutoff = new Date(Date.now() - EXPORT_COOLDOWN_MS).toISOString();
  const active = recent.docs.find((doc) => {
    const status = String(doc.get('status'));
    return status === 'queued' || status === 'building' || (status === 'ready' && String(doc.get('requestedAt')) > cutoff);
  });
  if (active) return { exportId: active.id, status: String(active.get('status')), reused: true };

  const now = new Date().toISOString();
  const ref = db.collection(EXPORT_COLLECTION).doc();
  await ref.set({ id: ref.id, uid, status: 'queued', requestedAt: now, updatedAt: now, expiresAt: null, downloadUrl: null, storagePath: null });
  try {
    await exportQueue.enqueue(ref.id);
  } catch (error) {
    logger.error('Could not queue data export', { ...logSafeError(error) });
    await ref.update({ status: 'failed', updatedAt: new Date().toISOString() });
    throw new HttpsError('unavailable', 'Your export could not be started. Please try again later.', { reason: 'queue_unavailable' });
  }
  return { exportId: ref.id, status: 'queued', reused: false };
});

export const buildDataExport = onTaskDispatched(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 5 }, timeoutSeconds: 1800, memory: '1GiB' },
  async (request) => {
    const exportId = (request.data as { exportId?: unknown } | null)?.exportId;
    if (typeof exportId !== 'string' || !exportId) return;
    await processDataExport(getFirestore(), exportId);
  },
);
