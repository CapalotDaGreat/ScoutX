import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Server-side abuse limits for expensive or enumerable callables.
 * Counters live in `callableRateLimits/{uid}_{action}_{bucket}` and are client-inaccessible.
 */
export type RateLimitWindow = 'hour' | 'day';

export type RateLimitPolicy = {
  action: string;
  max: number;
  window: RateLimitWindow;
};

function bucketKey(window: RateLimitWindow, now = new Date()): string {
  const iso = now.toISOString();
  if (window === 'day') {
    return iso.slice(0, 10);
  }
  return iso.slice(0, 13);
}

export function rateLimitDocId(uid: string, action: string, window: RateLimitWindow, now = new Date()): string {
  return `${uid}_${action}_${bucketKey(window, now)}`;
}

/**
 * Increments the caller's counter for `policy.action` and refuses when the window max is exceeded.
 * Fail-closed: a missing uid is the caller's problem (call after auth checks).
 */
export async function assertCallableRateLimit(uid: string, policy: RateLimitPolicy): Promise<void> {
  if (!uid || !policy.action || policy.max < 1) {
    throw new HttpsError('failed-precondition', 'Rate limit is misconfigured.');
  }

  const db = getFirestore();
  const ref = db.collection('callableRateLimits').doc(rateLimitDocId(uid, policy.action, policy.window));
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const count = (snap.get('count') as number | undefined) ?? 0;
    if (count >= policy.max) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.', {
        reason: 'rate_limited',
        action: policy.action,
      });
    }
    transaction.set(
      ref,
      {
        uid,
        action: policy.action,
        window: policy.window,
        bucket: bucketKey(policy.window),
        count: count + 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}

/** Discovery search is scrapable; keep pages cheap but bound enumeration. */
export const DISCOVERY_SEARCH_LIMIT: RateLimitPolicy = { action: 'discovery_search', max: 60, window: 'hour' };

/** Signed playback URLs are short-lived; still bound minting per account. */
export const MEDIA_PLAYBACK_LIMIT: RateLimitPolicy = { action: 'media_playback', max: 120, window: 'hour' };

/** Local ask-this-match is cheap but unbounded loops waste Functions time. */
export const ASK_THIS_MATCH_LIMIT: RateLimitPolicy = { action: 'ask_this_match', max: 40, window: 'hour' };

/** 5.0 clip explanations send footage frames to a provider: few per day, cached per moment. */
export const VIDEO_REASONING_LIMIT: RateLimitPolicy = { action: 'video_reasoning', max: 20, window: 'day' };

/** Text AI coaching is metered by quota elsewhere; this bounds burst spend. */
export const AI_INSIGHT_LIMIT: RateLimitPolicy = { action: 'ai_insight', max: 30, window: 'hour' };

/** View counters should not be a free write amplifier. */
export const DISCOVERY_VIEW_LIMIT: RateLimitPolicy = { action: 'discovery_view', max: 200, window: 'hour' };

/** Video link inspection performs outbound DNS/HEAD requests: bounded per user. */
export const VIDEO_SOURCE_INSPECT_LIMIT: RateLimitPolicy = { action: 'video_source_inspect', max: 30, window: 'hour' };

/** Starting a server-side link import downloads up to the plan's byte limit: tightly bounded. */
export const LINK_IMPORT_START_LIMIT: RateLimitPolicy = { action: 'link_import_start', max: 10, window: 'day' };
