/**
 * Video Intelligence 5.2 - deferred number reading after a correction.
 *
 * A correction answers within seconds because the worker reads no new shirt-number crops
 * (5.1); it reports how many it deferred (`report.ocrDeferred`). This module decides, from
 * persisted facts only, whether a bounded background follow-up ("refresh") should read them:
 *
 *   - one follow-up chain per feedback revision, at most MAX_ROUNDS rounds;
 *   - a further round only when the previous one made progress (fewer deferred crops) - so a
 *     chain can never loop on the same crops;
 *   - each round reads at most MAX_CROPS crops (worker-enforced);
 *   - a newer answer supersedes the chain (stale); a cancelled analysis stops it;
 *   - a per-user daily quota bounds the total.
 *
 * Dependency-free so the unit suite imports it directly.
 */

export const OCR_FOLLOW_UP_MAX_ROUNDS = 3;
export const OCR_FOLLOW_UP_MAX_CROPS = 400;
/** Per user per day, counted in `callableRateLimits/{uid}_ocr_follow_up_{day}`. */
export const OCR_FOLLOW_UP_DAILY_LIMIT = 60;
export const OCR_FOLLOW_UP_ACTION = 'ocr_follow_up';

export type FollowUpStatus = 'scheduled' | 'running' | 'done' | 'stale' | 'cancelled' | 'limited' | 'failed';
export type OcrFollowUp = {
  revision: number;
  round: number;
  status: FollowUpStatus;
  /** crops deferred when this round was scheduled */
  deferredBefore: number;
  /** crops still deferred after this round ran (null until it ran) */
  deferredAfter: number | null;
  updatedAt: string;
};

export type ResolveScope = 'feedback' | 'preliminary' | 'full' | 'refresh';

/**
 * The follow-up state to store with a just-published report.
 * `prev` = the follow-up stored before; `ranRound` = the round this resolve executed (refresh only).
 */
export function planOcrFollowUp(scope: ResolveScope, revision: number, ocrDeferred: number, prev: OcrFollowUp | null,
  at: string, ranRound: number | null = null, quotaLeft = true): OcrFollowUp | null {
  const deferred = Math.max(0, Math.floor(ocrDeferred || 0));
  if (scope === 'refresh') {
    if (!prev || prev.revision !== revision || ranRound === null || prev.round !== ranRound) return prev;
    const progressed = deferred < prev.deferredBefore;
    if (deferred > 0 && progressed && ranRound < OCR_FOLLOW_UP_MAX_ROUNDS) {
      return { revision, round: ranRound + 1, status: quotaLeft ? 'scheduled' : 'limited', deferredBefore: deferred,
        deferredAfter: null, updatedAt: at };
    }
    return { ...prev, status: 'done', deferredAfter: deferred, updatedAt: at };
  }
  // feedback / orchestrated resolves start a new chain for this revision when crops were deferred
  if (deferred === 0) {
    return prev && prev.revision === revision ? prev : null;
  }
  if (prev && prev.revision === revision && ['scheduled', 'running'].includes(prev.status)) return prev;
  return { revision, round: 1, status: quotaLeft ? 'scheduled' : 'limited', deferredBefore: deferred, deferredAfter: null, updatedAt: at };
}

/** Deterministic Cloud Tasks id: a retried publish never schedules the same round twice. */
export function followUpTaskId(jobId: string, revision: number, round: number): string {
  return `ocr-follow-up-${jobId}-r${revision}-n${round}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 480);
}

/** May the task for (revision, round) run now? Anything else is a duplicate or stale task. */
export function followUpRunnable(stored: OcrFollowUp | null | undefined, revision: number, round: number): boolean {
  return !!stored && stored.revision === revision && stored.round === round && ['scheduled', 'running'].includes(stored.status);
}

/** The app shows "Checking a few additional moments" only while a follow-up is really queued or running. */
export function followUpVisible(f: Pick<OcrFollowUp, 'status'> | null | undefined): boolean {
  return !!f && (f.status === 'scheduled' || f.status === 'running');
}
