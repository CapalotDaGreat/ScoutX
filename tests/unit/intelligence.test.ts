import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChanges, emptySnapshot, parseSnapshot } from '../../src/features/intelligence/services/changeDetection.ts';
import { goalNextStep } from '../../src/features/intelligence/services/goalNextStep.ts';
import { nextBestEvidence } from '../../src/features/intelligence/services/nextBestEvidence.ts';
import { findEvidenceGaps, normalizePosition } from '../../src/features/intelligence/services/evidenceGaps.ts';
import { buildSnapshot } from '../../src/features/intelligence/services/snapshotBuilder.ts';
import { summarizeGoal } from '../../src/features/development/services/developmentEngine.ts';
import type { DevelopmentGoal } from '../../src/features/development/types.ts';
import type { FootballStateSnapshot } from '../../src/features/intelligence/types.ts';
import type { PlayerMatchStatistics } from '../../src/features/player-statistics/types.ts';

const NOW = new Date('2026-10-06T12:00:00Z');

function match(overrides: Partial<PlayerMatchStatistics>): PlayerMatchStatistics {
  return {
    id: 'm',
    date: '2026-10-01',
    opponent: 'FC',
    competition: 'League',
    result: 'W 1-0',
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    passAccuracy: 80,
    shots: 1,
    tackles: 2,
    yellowCards: 0,
    redCards: 0,
    matchRating: 7,
    notes: '',
    ...overrides,
  };
}

function goal(overrides: Partial<DevelopmentGoal>): DevelopmentGoal {
  return {
    id: 'g1',
    ownerId: 'p1',
    title: 'Win more tackles',
    category: 'technical',
    metricKey: 'tackles',
    positionRelevance: [],
    baseline: null,
    targetValue: 4,
    targetLabel: '',
    timeframeEnd: null,
    status: 'active',
    progress: [],
    linkedMatchIds: [],
    linkedTrainingIds: [],
    evidenceIds: [],
    practiceSuggestions: [],
    reflection: '',
    origin: 'manual',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    achievedAt: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<FootballStateSnapshot>): FootballStateSnapshot {
  return { ...emptySnapshot('2026-10-01T00:00:00Z'), ...overrides };
}

describe('detectChanges', () => {
  test('a first visit has no "since" and reports nothing', () => {
    assert.deepEqual(detectChanges(null, snapshot({ matchIds: ['a', 'b'] })), []);
  });

  test('reports new matches, finished analyses, achieved goals and trial updates', () => {
    const before = snapshot({
      matchIds: ['a'],
      goalStatus: { g1: 'active' },
      trialStatus: { t1: 'pending' },
    });
    const after = snapshot({
      matchIds: ['a', 'b', 'c'],
      completedAnalysisIds: ['job1'],
      goalStatus: { g1: 'achieved' },
      trialStatus: { t1: 'accepted', t2: 'pending' },
    });
    const kinds = detectChanges(before, after).map((change) => change.kind);
    assert.deepEqual(kinds.slice(0, 2).sort(), ['goal_achieved', 'new_trial']);
    assert.ok(kinds.includes('new_matches'));
    assert.ok(kinds.includes('new_analysis'));
    assert.ok(kinds.includes('trial_status'));
    const matches = detectChanges(before, after).find((change) => change.kind === 'new_matches');
    assert.equal(matches?.params.count, 2);
  });

  test('drops trivial coverage moves between thin states but keeps meaningful crossings', () => {
    const before = snapshot({ coverage: { technical: 'insufficient', tactical: 'limited' } });
    const after = snapshot({ coverage: { technical: 'limited', tactical: 'moderate' } });
    const changes = detectChanges(before, after);
    assert.deepEqual(
      changes.map((change) => change.id),
      ['coverage-tactical'],
    );
  });

  test('identical snapshots produce no changes', () => {
    const same = snapshot({ matchIds: ['a'], coverage: { video: 'strong' }, endorsementIds: ['r1'] });
    assert.deepEqual(detectChanges(same, { ...same, takenAt: NOW.toISOString() }), []);
  });

  test('snapshots survive a storage round trip', () => {
    const built = buildSnapshot({
      now: NOW,
      matchIds: ['a'],
      completedAnalysisIds: ['j'],
      goals: [{ id: 'g1', status: 'improving' }],
      videoIds: ['v'],
      trials: [{ id: 't', status: 'pending' }],
      primaryPosition: '  CM ',
      verificationLevel: 'basic',
      coverage: [{ id: 'video', state: 'limited' }],
      endorsementIds: ['r'],
    });
    assert.equal(built.primaryPosition, 'CM');
    assert.deepEqual(parseSnapshot(JSON.parse(JSON.stringify(built))), built);
    assert.equal(parseSnapshot({ matchIds: [] }), null);
  });
});

describe('goalNextStep', () => {
  const context = { trainingSessions: [], hasCoachConnection: false, now: NOW };

  test('asks to record the metric when recent matches skipped it', () => {
    const matches = [match({ id: 'a', tackles: null }), match({ id: 'b', date: '2026-10-03', tackles: null })];
    const step = goalNextStep(summarizeGoal(goal({}), matches, NOW), { ...context, matches });
    assert.equal(step.kind, 'record_metric');
    assert.equal(step.params.matches, 2);
  });

  test('waits for a full window before judging progress', () => {
    const matches = [match({ id: 'a' })];
    const step = goalNextStep(summarizeGoal(goal({}), matches, NOW), { ...context, matches });
    assert.equal(step.kind, 'play_more_matches');
    assert.equal(step.params.have, 1);
  });

  test('flags a missing baseline instead of inventing progress', () => {
    const matches = ['a', 'b', 'c'].map((id, index) => match({ id, date: `2026-09-2${index}` }));
    const step = goalNextStep(summarizeGoal(goal({}), matches, NOW), { ...context, matches });
    assert.equal(step.kind, 'baseline_missing');
  });

  test('suggests changing focus, or asking the coach, when a full window shows no movement', () => {
    const matches = ['a', 'b', 'c'].map((id, index) => match({ id, date: `2026-09-2${index}`, tackles: 2 }));
    const stalled = summarizeGoal(
      goal({ baseline: { value: 2, sampleSize: 3, measuredAt: '2026-09-01' } }),
      matches,
      NOW,
    );
    assert.equal(goalNextStep(stalled, { ...context, matches }).kind, 'shift_focus');
    assert.equal(goalNextStep(stalled, { ...context, matches, hasCoachConnection: true }).kind, 'ask_coach');
  });

  test('asks for proof once a goal is achieved', () => {
    const summary = summarizeGoal(goal({ status: 'achieved', achievedAt: '2026-10-01' }), [], NOW);
    assert.equal(goalNextStep(summary, { ...context, matches: [] }).kind, 'prove_achievement');
  });
});

describe('nextBestEvidence', () => {
  const base = {
    coverage: {},
    completedAnalysisCount: 1,
    videoCount: 1,
    coachEndorsementCount: 1,
    gpsSessionCount: 1,
    now: NOW,
  };
  const fullMatches = ['a', 'b', 'c'].map((id) => match({ id }));

  test('asks for a first match before anything else', () => {
    assert.equal(nextBestEvidence({ ...base, matches: [] })?.kind, 'first_match');
  });

  test('prioritises recency, then video, then analysis', () => {
    const stale = [match({ date: '2026-07-01' })];
    assert.equal(nextBestEvidence({ ...base, matches: stale })?.kind, 'recent_match');
    assert.equal(nextBestEvidence({ ...base, matches: fullMatches, videoCount: 0 })?.kind, 'match_video');
    assert.equal(
      nextBestEvidence({ ...base, matches: fullMatches, completedAnalysisCount: 0 })?.kind,
      'match_analysis',
    );
  });

  test('asks to record missing dimensions and an independent reference', () => {
    const noPassing = fullMatches.map((item) => ({ ...item, passAccuracy: null }));
    assert.equal(nextBestEvidence({ ...base, matches: noPassing })?.kind, 'record_passing');
    assert.equal(
      nextBestEvidence({ ...base, matches: fullMatches, coachEndorsementCount: 0 })?.kind,
      'coach_reference',
    );
  });

  test('returns nothing when the record is complete', () => {
    assert.equal(nextBestEvidence({ ...base, matches: fullMatches }), null);
  });

  test('names the strongest dimension only when it is at least moderate', () => {
    const result = nextBestEvidence({
      ...base,
      matches: [],
      coverage: { technical: 'limited', video: 'strong' },
    });
    assert.equal(result?.strongestDimension, 'video');
    assert.equal(
      nextBestEvidence({ ...base, matches: [], coverage: { technical: 'limited' } })?.strongestDimension,
      null,
    );
  });
});

describe('findEvidenceGaps', () => {
  const identity = {
    preferredPositions: ['CM'],
    preferredPlayingStyle: '',
    weakFootRating: null,
    skillMovesRating: null,
  };

  test('normalises position aliases', () => {
    assert.equal(normalizePosition(' cm '), 'central midfielder');
    assert.equal(normalizePosition('Central Midfielder'), 'central midfielder');
  });

  test('flags a position claim with too few logged matches in that role', () => {
    const matches = [match({ id: 'a', position: 'Central Midfielder' })];
    const gaps = findEvidenceGaps({ identity, matches, coachEndorsementCount: 0 });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].support, 'limited');
    assert.equal(gaps[0].sampleSize, 1);
  });

  test('does not flag a position backed by enough matches', () => {
    const matches = ['a', 'b', 'c'].map((id) => match({ id, position: 'CM' }));
    assert.deepEqual(findEvidenceGaps({ identity, matches, coachEndorsementCount: 0 }), []);
  });

  test('marks star self-ratings as self-reported until a coach endorses', () => {
    const rated = { ...identity, preferredPositions: [], weakFootRating: 4, skillMovesRating: 3 };
    const gaps = findEvidenceGaps({ identity: rated, matches: [], coachEndorsementCount: 0 });
    assert.deepEqual(
      gaps.map((gap) => gap.claimKind),
      ['weak_foot', 'skill_moves'],
    );
    assert.deepEqual(findEvidenceGaps({ identity: rated, matches: [], coachEndorsementCount: 1 }), []);
  });

  test('a style that matches cannot measure is self-reported only', () => {
    const styled = { ...identity, preferredPositions: [], preferredPlayingStyle: 'Physical' };
    const gaps = findEvidenceGaps({ identity: styled, matches: [], coachEndorsementCount: 0 });
    assert.equal(gaps[0].support, 'self_reported_only');
  });
});
