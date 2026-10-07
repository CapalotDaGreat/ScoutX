import type { DiscoverablePlayer } from '@/features/scout-discovery/types';
import type { BriefMatch } from '@/features/scout-intelligence/services/briefMatch';
import type { PipelineStage, WatchlistEvent } from '@/features/scout-intelligence/types';

const OUTDATED_DAYS = 90;
const DAYS_MS = 24 * 60 * 60 * 1000;

function evidenceAgeDays(lastEvidenceAt: string | null, nowMs: number): number | null {
  if (!lastEvidenceAt) return null;
  const at = Date.parse(lastEvidenceAt);
  return Number.isNaN(at) ? null : Math.max(0, Math.floor((nowMs - at) / DAYS_MS));
}
const MIN_SAMPLE = 3;

export type WhyNotCode =
  | 'insufficient_evidence'
  | 'outdated_evidence'
  | 'no_evidence_date'
  | 'role_mismatch'
  | 'brief_misses'
  | 'missing_video'
  | 'not_verified'
  | 'small_sample';

export type WhyNotReason = { code: WhyNotCode; count?: number; days?: number };

const COVERAGE_KEYS = ['technical', 'tactical', 'physical', 'consistency', 'video'] as const;

/**
 * Honest reasons a scout might hold back on a player. Built only from recorded fields;
 * unknown facts are listed as missing evidence, never as negatives about the player.
 */
export function explainWhyNotThisPlayer(
  player: DiscoverablePlayer,
  brief: BriefMatch | null,
  nowMs: number = Date.now(),
): WhyNotReason[] {
  const reasons: WhyNotReason[] = [];
  const solid = COVERAGE_KEYS.filter((key) => {
    const state = player.evidenceCoverage[key];
    return state === 'strong' || state === 'moderate';
  }).length;
  if (solid === 0) reasons.push({ code: 'insufficient_evidence' });

  const age = evidenceAgeDays(player.lastEvidenceAt, nowMs);
  if (age === null) reasons.push({ code: 'no_evidence_date' });
  else if (age > OUTDATED_DAYS) reasons.push({ code: 'outdated_evidence', days: age });

  if (brief) {
    const roleMiss = brief.criteria.some(
      (item) => (item.id === 'position' || item.id === 'role') && item.result === 'not_met',
    );
    if (roleMiss) reasons.push({ code: 'role_mismatch' });
    const otherMisses = brief.criteria.filter(
      (item) => item.result === 'not_met' && item.id !== 'position' && item.id !== 'role',
    ).length;
    if (otherMisses > 0) reasons.push({ code: 'brief_misses', count: otherMisses });
  }

  if (!player.hasHighlightVideos) reasons.push({ code: 'missing_video' });
  if (!player.verified && player.verificationLevel !== 'verified') reasons.push({ code: 'not_verified' });
  if (player.matchCount < MIN_SAMPLE) reasons.push({ code: 'small_sample', count: player.matchCount });
  return reasons;
}

export type ShortlistNextAction =
  | 'request_evidence'
  | 'review_new_evidence'
  | 'contact'
  | 'invite_trial'
  | 'prepare_trial'
  | 'evaluate'
  | 'follow_up';

export type ShortlistIntelligence = {
  strongest: { dimension: (typeof COVERAGE_KEYS)[number]; state: 'strong' | 'moderate' } | null;
  biggestUncertainty:
    | { kind: 'coverage'; dimension: (typeof COVERAGE_KEYS)[number] }
    | { kind: 'brief_unknown'; count: number }
    | null;
  changesSinceReview: number;
  briefFit: { met: number; total: number } | null;
  nextAction: ShortlistNextAction;
};

/** One-glance decision card for a player the scout has saved. */
export function buildShortlistIntelligence(input: {
  player: DiscoverablePlayer;
  stage: PipelineStage;
  lastReviewedAt: string | null;
  brief: BriefMatch | null;
  events: readonly WatchlistEvent[];
}): ShortlistIntelligence {
  const { player, stage, lastReviewedAt, brief, events } = input;
  const strongestKey =
    COVERAGE_KEYS.find((key) => player.evidenceCoverage[key] === 'strong') ??
    COVERAGE_KEYS.find((key) => player.evidenceCoverage[key] === 'moderate') ??
    null;
  const strongest = strongestKey
    ? { dimension: strongestKey, state: player.evidenceCoverage[strongestKey] as 'strong' | 'moderate' }
    : null;

  const weakKey = COVERAGE_KEYS.find((key) => player.evidenceCoverage[key] === 'insufficient') ?? null;
  const briefUnknown = brief?.unknown ?? 0;
  const biggestUncertainty: ShortlistIntelligence['biggestUncertainty'] =
    briefUnknown > 0
      ? { kind: 'brief_unknown', count: briefUnknown }
      : weakKey
        ? { kind: 'coverage', dimension: weakKey }
        : null;

  const changesSinceReview = events.filter(
    (event) =>
      event.playerId === player.id &&
      event.type === 'new_evidence' &&
      (lastReviewedAt === null || event.createdAt > lastReviewedAt),
  ).length;

  let nextAction: ShortlistNextAction;
  if (changesSinceReview > 0) nextAction = 'review_new_evidence';
  else if (!strongest) nextAction = 'request_evidence';
  else if (stage === 'discovered' || stage === 'shortlisted') nextAction = 'contact';
  else if (stage === 'contacted') nextAction = 'invite_trial';
  else if (stage === 'invited' || stage === 'trial') nextAction = 'prepare_trial';
  else if (stage === 'evaluated') nextAction = 'follow_up';
  else nextAction = 'evaluate';

  return {
    strongest,
    biggestUncertainty,
    changesSinceReview,
    briefFit: brief ? { met: brief.met, total: brief.criteria.length } : null,
    nextAction,
  };
}

export type WatchlistFilter = 'all' | 'match' | 'video' | 'pipeline' | 'trial' | 'removed';

export function filterWatchlistEvents(
  events: readonly WatchlistEvent[],
  filter: WatchlistFilter,
): WatchlistEvent[] {
  switch (filter) {
    case 'all':
      return [...events];
    case 'match':
    case 'video':
      return events.filter((event) => event.type === 'new_evidence' && event.changes.includes(filter));
    case 'pipeline':
      return events.filter((event) => event.type === 'added' || event.type === 'stage_changed');
    case 'trial':
      return events.filter(
        (event) => event.type === 'stage_changed' && (event.toStage === 'invited' || event.toStage === 'trial'),
      );
    case 'removed':
      return events.filter((event) => event.type === 'removed');
  }
}

export type ScoutAttentionItem =
  | { kind: 'fulfilled_request'; id: string; playerId: string; at: string }
  | { kind: 'upcoming_trial'; id: string; playerId: string; playerName: string; at: string }
  | { kind: 'watchlist_change'; id: string; playerId: string; at: string }
  | { kind: 'brief_match'; id: string; playerId: string; playerName: string; briefName: string; at: string };

const TRIAL_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scout Home "requires attention": things that need a decision now, not metrics. Ordered by
 * urgency: answered requests, imminent trials, new evidence, then fresh brief fits.
 */
export function buildScoutAttention(
  input: {
    fulfilledRequests: ReadonlyArray<{ id: string; playerId: string; updatedAt: string }>;
    trials: ReadonlyArray<{ id: string; playerId: string; playerName: string; status: string; scheduledDate: string }>;
    events: readonly WatchlistEvent[];
    briefFits: ReadonlyArray<{ playerId: string; playerName: string; briefName: string; updatedAt: string }>;
    seenAt: string | null;
  },
  nowMs: number = Date.now(),
): ScoutAttentionItem[] {
  const isNew = (at: string) => input.seenAt === null || at > input.seenAt;
  const items: ScoutAttentionItem[] = [];

  for (const request of input.fulfilledRequests) {
    if (isNew(request.updatedAt)) {
      items.push({ kind: 'fulfilled_request', id: request.id, playerId: request.playerId, at: request.updatedAt });
    }
  }
  for (const trial of input.trials) {
    const at = Date.parse(trial.scheduledDate);
    const upcoming =
      (trial.status === 'accepted' || trial.status === 'rescheduled') &&
      !Number.isNaN(at) &&
      at >= nowMs - DAY_MS &&
      at <= nowMs + TRIAL_WINDOW_DAYS * DAY_MS;
    if (upcoming) {
      items.push({
        kind: 'upcoming_trial',
        id: trial.id,
        playerId: trial.playerId,
        playerName: trial.playerName,
        at: trial.scheduledDate,
      });
    }
  }
  for (const event of input.events) {
    if (event.type === 'new_evidence' && isNew(event.createdAt)) {
      items.push({ kind: 'watchlist_change', id: event.id, playerId: event.playerId, at: event.createdAt });
    }
  }
  for (const fit of input.briefFits) {
    if (isNew(fit.updatedAt)) {
      items.push({
        kind: 'brief_match',
        id: `brief-${fit.playerId}`,
        playerId: fit.playerId,
        playerName: fit.playerName,
        briefName: fit.briefName,
        at: fit.updatedAt,
      });
    }
  }

  const order: Record<ScoutAttentionItem['kind'], number> = {
    fulfilled_request: 0,
    upcoming_trial: 1,
    watchlist_change: 2,
    brief_match: 3,
  };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || b.at.localeCompare(a.at));
}

export type ScoutFirstSessionStepId =
  | 'save_brief'
  | 'view_player'
  | 'shortlist_player'
  | 'request_evidence'
  | 'invite_trial';

export type ScoutFirstSessionStep = { id: ScoutFirstSessionStepId; done: boolean };

/** First-session checklist, derived from what the scout has actually done. */
export function buildScoutFirstSession(input: {
  ownBriefCount: number;
  viewedCount: number;
  shortlistCount: number;
  requestCount: number;
  trialCount: number;
}): ScoutFirstSessionStep[] {
  return [
    { id: 'save_brief', done: input.ownBriefCount > 0 },
    { id: 'view_player', done: input.viewedCount > 0 },
    { id: 'shortlist_player', done: input.shortlistCount > 0 },
    { id: 'request_evidence', done: input.requestCount > 0 },
    { id: 'invite_trial', done: input.trialCount > 0 },
  ];
}
