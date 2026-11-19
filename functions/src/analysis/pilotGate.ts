import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { cvApproval } from './cvConfig';

/**
 * Pilot gate for full-match tracking (2026-11-19). Fail-closed runtime control that sits on top of
 * TRACKING_V3_ENABLED and the CV worker approval:
 *
 *   opsConfig/trackingPilot  { enabled: true, allowlist: [uid, ...], workerVersion: '<approved>', holdReports?: boolean,
 *                              enabledAt: '<ISO time of this enable>' }
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
 * - enabledAt (required while enabled) starts an authorisation epoch (2026-11-19 rehearsal): a job records
 *   pilotAuthorizedAt when it is started (or re-authorised by an operator), and every task refuses work whose
 *   authorisation predates the current enable ('stale_authorization'). A delivery queued before a stop can therefore
 *   never run as if it were new work after the pilot is enabled again; the owner restarts, or an operator reprocesses.
 * - Discovery sightings follow the same hold as reports (pilotHeld/discovery) and the same in-transaction stop.
 * - A withheld (contained) report cannot be released as is; it must be reprocessed under a current authorisation.
 * - The document is server-only (firestore.rules has no client read or write for opsConfig).
 * Test seam: TRACKING_PILOT_GATE=off is honoured only under the emulators, never in a deployed function.
 */
export const PILOT_COLLECTION = 'opsConfig';
export const PILOT_DOC = 'trackingPilot';
export const HELD_COLLECTION = 'pilotHeld';

export type PilotConfig = { enabled: boolean; allowlist: string[]; workerVersion: string; holdReports: boolean;
  enabledAt: string | null };
export type PilotDecision = 'allowed' | 'missing_config' | 'pilot_off' | 'not_allowlisted' | 'version_mismatch'
  | 'stale_authorization';

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
  const enabledAt = typeof r.enabledAt === 'string' && !Number.isNaN(Date.parse(r.enabledAt)) ? r.enabledAt : null;
  // An enable without its epoch is malformed: fail closed rather than authorise every earlier delivery.
  if (r.enabled === true && !enabledAt) return null;
  return { enabled: r.enabled, allowlist: r.allowlist as string[], workerVersion: r.workerVersion,
    holdReports: r.holdReports !== false, enabledAt };
}

/**
 * `run` is passed by tasks that continue an already started job: its pilotAuthorizedAt must not predate the
 * current enable. Starting a job (no `run`) is authorised by the current enable itself.
 */
export function decidePilot(cfg: PilotConfig | null, uid: string, env: NodeJS.ProcessEnv = process.env,
  run?: { authorizedAt: string | null | undefined }): PilotDecision {
  if (pilotGateBypassed(env)) return 'allowed';
  if (!cfg) return 'missing_config';
  if (cfg.enabled !== true) return 'pilot_off';
  if (!cfg.allowlist.includes(uid)) return 'not_allowlisted';
  const approval = cvApproval(env);
  if (!approval || cfg.workerVersion !== approval.workerVersion) return 'version_mismatch';
  if (run && (!run.authorizedAt || !cfg.enabledAt || Date.parse(run.authorizedAt) < Date.parse(cfg.enabledAt))) return 'stale_authorization';
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
  tx?: Transaction, run?: { authorizedAt: string | null | undefined }): Promise<{ decision: PilotDecision; hold: boolean }> {
  if (pilotGateBypassed(env)) return { decision: 'allowed', hold: false };
  const cfg = await readPilot(db, tx);
  return { decision: decidePilot(cfg, uid, env, run), hold: cfg?.holdReports !== false };
}

/** Operator: re-authorise an existing job under the current enable (used before verified reprocessing). */
export async function authorizeRun(db: Firestore, matchCollection: string, trackingCollection: string, jobId: string,
  now: () => Date = () => new Date(), env: NodeJS.ProcessEnv = process.env): Promise<'authorized' | 'no_progress' | PilotDecision> {
  const job = db.collection(matchCollection).doc(jobId);
  const progress = job.collection(trackingCollection).doc('progress');
  return db.runTransaction(async (tx) => {
    const j = await tx.get(job);
    const p = await tx.get(progress);
    if (!j.exists || !p.exists) return 'no_progress' as const;
    // Enabled and allowlisted; the worker version is checked again by every task that does the work.
    if (!pilotGateBypassed(env)) {
      const cfg = await readPilot(db, tx);
      if (!cfg) return 'missing_config' as const;
      if (!cfg.enabled) return 'pilot_off' as const;
      if (!cfg.allowlist.includes(String(j.get('playerId')))) return 'not_allowlisted' as const;
    }
    const at = now().toISOString();
    tx.set(progress, { pilotAuthorizedAt: at, outcome: null, blocked: null, resolving: null, updatedAt: at }, { merge: true });
    return 'authorized' as const;
  });
}

/** Reviewer action: publish a held report to the owner (no notification is sent here). */
export async function releaseHeldReport(db: Firestore, matchCollection: string, trackingCollection: string, jobId: string,
  reviewer: string, now: () => Date = () => new Date()): Promise<'released' | 'nothing_held' | 'withheld_requires_reprocess'> {
  const job = db.collection(matchCollection).doc(jobId);
  const held = job.collection(HELD_COLLECTION).doc('current');
  const current = job.collection(trackingCollection).doc('current');
  const heldDiscovery = job.collection(HELD_COLLECTION).doc('discovery');
  const discovery = job.collection(trackingCollection).doc('discovery');
  return db.runTransaction(async (tx) => {
    const h = await tx.get(held);
    const cur = await tx.get(current);
    const hd = await tx.get(heldDiscovery);
    if (!h.exists || !h.get('report')) {
      if (!hd.exists || !hd.get('moments')) return 'nothing_held' as const;
    } else if (h.get('withheldAt')) {
      // A contained report goes back to the owner only through reprocessing under a current authorisation.
      return 'withheld_requires_reprocess' as const;
    }
    const at = now().toISOString();
    if (h.exists && h.get('report')) {
      tx.set(current, { ...h.data(), version: ((cur.get('version') as number | undefined) ?? 0) + 1, releasedAt: at,
        releasedBy: reviewer });
      tx.set(held, { report: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
    }
    if (hd.exists && hd.get('moments') && !hd.get('withheldAt')) {
      tx.set(discovery, { moments: hd.get('moments'), generation: hd.get('generation') ?? null, updatedAt: at, releasedAt: at });
      tx.set(heldDiscovery, { moments: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
    }
    return 'released' as const;
  });
}

/** Containment: take an already published report away from the owner and keep it under hold with a reason. */
export async function withholdPublishedReport(db: Firestore, matchCollection: string, trackingCollection: string,
  jobId: string, reason: string, now: () => Date = () => new Date()): Promise<'withheld' | 'nothing_published'> {
  const job = db.collection(matchCollection).doc(jobId);
  const held = job.collection(HELD_COLLECTION).doc('current');
  const current = job.collection(trackingCollection).doc('current');
  const discovery = job.collection(trackingCollection).doc('discovery');
  const heldDiscovery = job.collection(HELD_COLLECTION).doc('discovery');
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(current);
    const disc = await tx.get(discovery);
    if ((!cur.exists || !cur.get('report')) && !(disc.exists && disc.get('moments'))) return 'nothing_published' as const;
    const at = now().toISOString();
    if (disc.exists && disc.get('moments')) {
      tx.set(heldDiscovery, { ...disc.data(), withheldAt: at, withheldReason: reason });
      tx.delete(discovery);
    }
    if (!cur.exists || !cur.get('report')) return 'withheld' as const;
    tx.set(held, { ...cur.data(), withheldAt: at, withheldReason: reason });
    tx.set(current, { report: null, version: ((cur.get('version') as number | undefined) ?? 0) + 1, stale: true,
      pendingReason: 'withheld_for_review', feedbackRevision: cur.get('feedbackRevision') ?? 0, updatedAt: at });
    return 'withheld' as const;
  });
}
