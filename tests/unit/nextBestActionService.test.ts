import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayPlan } from '../../src/features/today/services/nextBestActionService.ts';
import type { TodayAnalysisJob, TodayInput } from '../../src/features/today/types.ts';

const NOW = new Date('2026-10-06T12:00:00Z');

function input(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    now: NOW,
    matches: [],
    analyses: [],
    analysesLoaded: true,
    trials: [],
    videos: [],
    passportSteps: [],
    reviewedAnalysisIds: [],
    matchDraft: null,
    goals: [],
    trainingSessions: [],
    recentlyCompletedTypes: [],
    ...overrides,
  };
}

function job(overrides: Partial<TodayAnalysisJob>): TodayAnalysisJob {
  return {
    id: 'job-1',
    status: 'complete',
    createdAt: '2026-10-05T10:00:00Z',
    completedAt: '2026-10-05T11:00:00Z',
    opponent: 'FC Example',
    matchDate: '2026-10-04',
    hasReport: true,
    retryable: false,
    ...overrides,
  };
}

const recentMatch = { id: 'm1', date: '2026-10-04', opponent: 'FC Example' };

describe('buildTodayPlan', () => {
  test('a brand-new player is asked to log their first match', () => {
    const plan = buildTodayPlan(input());
    assert.equal(plan.primary?.type, 'log_first_match');
    assert.deepEqual(plan.continueItems, []);
  });

  test('an up-to-date player with nothing pending gets no invented action', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        goals: [{ id: 'g1', title: 'Pressing', status: 'active', updatedAt: '2026-10-05T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' }],
        trainingSessions: [{ id: 'tr1', date: '2026-10-06', type: 'individual' }],
      }),
    );
    assert.equal(plan.primary, null);
    assert.deepEqual(plan.secondary, []);
  });

  test('a pending trial invitation outranks everything else', () => {
    const plan = buildTodayPlan(
      input({
        trials: [{ id: 't1', club: 'FC Zurich', status: 'pending', scheduledDate: '2026-10-20' }],
        analyses: [job({ status: 'failed', retryable: true, hasReport: false })],
      }),
    );
    assert.equal(plan.primary?.type, 'respond_trial');
    assert.equal(plan.primary?.params.club, 'FC Zurich');
    assert.equal(plan.secondary[0]?.type, 'retry_analysis');
  });

  test('a retryable failed analysis is both an action and a continue item', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({ status: 'failed', retryable: true, hasReport: false })],
      }),
    );
    assert.equal(plan.primary?.type, 'retry_analysis');
    assert.equal(plan.primary?.entityId, 'job-1');
    assert.ok(plan.continueItems.some((item) => item.kind === 'failed_analysis'));
  });

  test('failed analyses that cannot be retried are not offered as retries', () => {
    const plan = buildTodayPlan(
      input({ matches: [recentMatch], analyses: [job({ status: 'failed', retryable: false, hasReport: false })] }),
    );
    assert.notEqual(plan.primary?.type, 'retry_analysis');
  });

  test('an unopened completed analysis asks for review; a reviewed one does not', () => {
    const fresh = buildTodayPlan(input({ matches: [recentMatch], analyses: [job({})] }));
    assert.equal(fresh.primary?.type, 'review_coaching');
    const reviewed = buildTodayPlan(
      input({ matches: [recentMatch], analyses: [job({})], reviewedAnalysisIds: ['job-1'] }),
    );
    assert.notEqual(reviewed.primary?.type, 'review_coaching');
  });

  test('a recent match without analysis suggests analyzing that match', () => {
    const plan = buildTodayPlan(input({ matches: [recentMatch] }));
    assert.equal(plan.primary?.type, 'analyze_match');
    assert.equal(plan.primary?.params.opponent, 'FC Example');
  });

  test('when analyses failed to load, no analysis-based action is guessed', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analysesLoaded: false,
        goals: [{ id: 'g1', title: 'Pressing', status: 'active', updatedAt: '2026-10-05T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' }],
        trainingSessions: [{ id: 'tr1', date: '2026-10-06', type: 'individual' }],
      }),
    );
    assert.equal(plan.primary, null);
  });

  test('a stale match history asks to log the latest match with the real gap', () => {
    const plan = buildTodayPlan(
      input({ matches: [{ id: 'm0', date: '2026-09-20', opponent: 'Old FC' }] }),
    );
    assert.equal(plan.primary?.type, 'log_match');
    assert.equal(plan.primary?.params.days, 16);
  });

  test('an upcoming accepted trial within a week asks for preparation', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        trials: [{ id: 't2', club: 'FC Basel', status: 'accepted', scheduledDate: '2026-10-09T09:00:00Z' }],
      }),
    );
    assert.equal(plan.primary?.type, 'prepare_trial');
    assert.equal(plan.primary?.params.days, 3);
  });

  test('drafts and failed uploads show up under Continue', () => {
    const plan = buildTodayPlan(
      input({
        matchDraft: { savedAt: '2026-10-06T10:00:00Z', opponent: 'Rivals' },
        videos: [{ id: 'v2', title: 'Skill move', uploadStatus: 'failed' }],
      }),
    );
    assert.equal(plan.continueItems[0]?.kind, 'match_draft');
    assert.ok(plan.continueItems.some((item) => item.kind === 'failed_upload'));
  });

  test('passport setup is suggested with real progress once a match exists', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        passportSteps: [
          { id: 'log_first_match', title: 'Log your first match', complete: true },
          { id: 'claim_username', title: 'Claim your link', complete: false },
        ],
        goals: [{ id: 'g1', title: 'Pressing', status: 'active', updatedAt: '2026-10-05T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' }],
        trainingSessions: [{ id: 'tr1', date: '2026-10-06', type: 'individual' }],
      }),
    );
    assert.equal(plan.primary?.type, 'improve_passport');
    assert.equal(plan.primary?.params.done, 1);
    assert.equal(plan.primary?.params.total, 2);
  });

  test('at most two secondary actions are returned', () => {
    const plan = buildTodayPlan(
      input({
        trials: [{ id: 't1', club: 'A', status: 'pending', scheduledDate: '2026-10-20' }],
        analyses: [
          job({ id: 'f', status: 'failed', retryable: true, hasReport: false }),
          job({ id: 'c' }),
        ],
        matches: [{ id: 'm0', date: '2026-09-01', opponent: 'X' }],
      }),
    );
    assert.ok(plan.secondary.length <= 2);
  });

  test('a player with matches but no goal is asked to set one', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
      }),
    );
    assert.equal(plan.primary?.type, 'set_goal');
  });

  test('loop prevention: a recently completed set_goal is not suggested again', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        recentlyCompletedTypes: ['set_goal'],
      }),
    );
    assert.notEqual(plan.primary?.type, 'set_goal');
  });

  test('a revisit goal is offered for review', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        goals: [{ id: 'g-old', title: 'First touch', status: 'revisit', updatedAt: '2026-09-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' }],
        trainingSessions: [{ id: 'tr1', date: '2026-10-06', type: 'individual' }],
      }),
    );
    assert.equal(plan.primary?.type, 'review_goal');
    assert.equal(plan.primary?.params.title, 'First touch');
  });

  test('training is suggested for an open goal when nothing was logged recently', () => {
    const plan = buildTodayPlan(
      input({
        matches: [recentMatch],
        analyses: [job({})],
        reviewedAnalysisIds: ['job-1'],
        videos: [{ id: 'v1', title: 'Goal', uploadStatus: 'ready' }],
        goals: [{ id: 'g1', title: 'Pressing', status: 'active', updatedAt: '2026-10-05T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' }],
      }),
    );
    assert.equal(plan.primary?.type, 'log_training');
  });
});
