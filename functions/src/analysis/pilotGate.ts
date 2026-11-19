import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { cvApproval } from './cvConfig';

/**
 * Pilot gate for full-match tracking (2026-11-19). Fail-closed runtime control that sits on top of
 * TRACKING_V3_ENABLED and the CV worker approval:
 *
 *   opsConfig/trackingPilot  { enabled: true, allowlist: [uid, ...], workerVersion: '<approved>', holdReports?: boolean }
 *
 * - Missing or malformed document, enabled !== true, owner not listed, or a worker version different from the
 *   compiled approval: the job is not started, no worker call is made, and nothing is published.
 * - Read at run time by every task (not an environment variable), so flipping `enabled` to false is a kill switch
 *   that also reaches in-flight jobs: queued tasks stop, and a worker result that returns after the stop is
 *   discarded inside the publishing transaction.
 * - holdReports (default true): a finished report is written to the owner-unreadable `pilotHeld/current` instead of
 *   `tracking/current`, and no completion notification is sent, until a reviewer releases it with
 *   releaseHeldReport(). withholdPublishedReport() moves an already published report back under hold. Owner
 *   corrections (tracking/feedback) are never touched.
 * - The document is server-only (firestore.rules has no client read or write for opsConfig).
 * Test seam: TRACKING_PILOT_GATE=off is honoured only under the emulators, never in a deployed function.
 */
export const PILOT_COLLECTION = 'opsConfig';
export const PILOT_DOC = 'trackingPilot';
export const HELD_COLLECTION = 'pilotHeld';

export type PilotConfig = { enabled: boolean; allowlist: string[]; workerVersion: string; holdReports: boolean };
export type PilotDecision = 'allowed' | 'missing_config' | 'pilot_off' | 'not_allowlisted' | 'version_mismatch';

function isEmulated(env: NodeJS.ProcessEnv): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}

export function pilotGateBypassed(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEmulated(env) && env.TRACKING_PILOT_GATE?.trim() === 'off';
}

export function parsePilotConfig(raw: unknown): PilotConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.enabled !== 'boolean' || !Array.isArray(r.allowlist) || typeof r.workerVersion !== 'string') return null;
  if (!r.allowlist.every((u) => typeof u === 'string' && u.length > 0)) return null;
  if (r.holdReports !== undefined && typeof r.holdReports !== 'boolean') return null;
  return { enabled: r.enabled, allowlist: r.allowlist as string[], workerVersion: r.workerVersion,
    holdReports: r.holdReports !== false };
}

export function decidePilot(cfg: PilotConfig | null, uid: string, env: NodeJS.ProcessEnv = process.env): PilotDecision {
  if (pilotGateBypassed(env)) return 'allowed';
  if (!cfg) return 'missing_config';
  if (cfg.enabled !== true) return 'pilot_off';
  if (!cfg.allowlist.includes(uid)) return 'not_allowlisted';
  const approval = cvApproval(env);
  if (!approval || cfg.workerVersion !== approval.workerVersion) return 'version_mismatch';
  return 'allowed';
}

function pilotRef(db: Firestore) {
  return db.collection(PILOT_COLLECTION).doc(PILOT_DOC);
}

export async function readPilot(db: Firestore, tx?: Transaction): Promise<PilotConfig | null> {
  const snap = tx ? await tx.get(pilotRef(db)) : await pilotRef(db).get();
  return snap.exists ? parsePilotConfig(snap.data()) : null;
}

export async function pilotDecision(db: Firestore, uid: string, env: NodeJS.ProcessEnv = process.env,
  tx?: Transaction): Promise<{ decision: PilotDecision; hold: boolean }> {
  if (pilotGateBypassed(env)) return { decision: 'allowed', hold: false };
  const cfg = await readPilot(db, tx);
  return { decision: decidePilot(cfg, uid, env), hold: cfg?.holdReports !== false };
}

/** Reviewer action: publish a held report to the owner (no notification is sent here). */
export async function releaseHeldReport(db: Firestore, matchCollection: string, trackingCollection: string, jobId: string,
  reviewer: string, now: () => Date = () => new Date()): Promise<'released' | 'nothing_held'> {
  const job = db.collection(matchCollection).doc(jobId);
  const held = job.collection(HELD_COLLECTION).doc('current');
  const current = job.collection(trackingCollection).doc('current');
  return db.runTransaction(async (tx) => {
    const h = await tx.get(held);
    const cur = await tx.get(current);
    if (!h.exists || !h.get('report')) return 'nothing_held' as const;
    const at = now().toISOString();
    tx.set(current, { ...h.data(), version: ((cur.get('version') as number | undefined) ?? 0) + 1, releasedAt: at,
      releasedBy: reviewer });
    tx.set(held, { report: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
    return 'released' as const;
  });
}

/** Containment: take an already published report away from the owner and keep it under hold with a reason. */
export async function withholdPublishedReport(db: Firestore, matchCollection: string, trackingCollection: string,
  jobId: string, reason: string, now: () => Date = () => new Date()): Promise<'withheld' | 'nothing_published'> {
  const job = db.collection(matchCollection).doc(jobId);
  const held = job.collection(HELD_COLLECTION).doc('current');
  const current = job.collection(trackingCollection).doc('current');
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(current);
    if (!cur.exists || !cur.get('report')) return 'nothing_published' as const;
    const at = now().toISOString();
    tx.set(held, { ...cur.data(), withheldAt: at, withheldReason: reason });
    tx.set(current, { report: null, version: ((cur.get('version') as number | undefined) ?? 0) + 1, stale: true,
      pendingReason: 'withheld_for_review', feedbackRevision: cur.get('feedbackRevision') ?? 0, updatedAt: at });
    return 'withheld' as const;
  });
}
