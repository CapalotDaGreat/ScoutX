import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCareerFirsts,
  buildSeasonSummaries,
  buildYearInReview,
  compareSeasons,
  seasonOf,
  type CareerRecords,
} from '../../src/features/career-story/services/careerSeasons.ts';

const empty: CareerRecords = { matches: [], journey: [], trials: [], goals: [], reels: [], clips: [], verifications: [] };

const m = (id: string, date: string, extra: Partial<CareerRecords['matches'][number]> = {}) => ({
  id,
  date,
  opponent: `Opp ${id}`,
  position: 'CM',
  minutes: 90,
  goals: 0,
  assists: 0,
  ...extra,
});

const records: CareerRecords = {
  ...empty,
  matches: [
    m('a1', '2024-09-01'),
    m('a2', '2024-10-01', { goals: 1 }),
    m('a3', '2024-11-01'),
    m('b1', '2025-08-20', { minutes: 60, goals: 1, assists: 1 }),
    m('b2', '2025-09-20', { position: 'CAM', goals: 2 }),
    m('b3', '2025-10-20', { position: 'CAM', assists: 2 }),
  ],
  journey: [
    { id: 'j1', type: 'club_transfer', title: 'Joined FC Aarau', organization: 'FC Aarau', date: '2025-07-15' },
    { id: 'j2', type: 'achievement', title: 'Cup', date: '2025-05-01' },
  ],
  trials: [
    { id: 't0', club: 'Declined FC', status: 'declined', scheduledDate: '2025-01-01' },
    { id: 't1', club: 'FC Basel', status: 'completed', scheduledDate: '2025-11-01' },
  ],
  goals: [
    { id: 'g1', title: 'Weak foot', status: 'achieved', createdAt: '2025-08-01', achievedAt: '2025-10-01', timeframeEnd: null },
    { id: 'g2', title: 'Scanning', status: 'active', createdAt: '2025-09-01', achievedAt: null, timeframeEnd: '2026-03-01' },
  ],
  reels: [{ id: 'r1', title: 'Scout reel', createdAt: '2025-12-01' }],
  clips: [{ id: 'c1', title: 'Goal', date: '2025-09-20' }],
  verifications: [
    { id: 'v1', status: 'approved', evidence: 'U17 cap', updatedAt: '2025-09-05' },
    { id: 'v2', status: 'pending', evidence: 'Other', updatedAt: '2025-09-06' },
  ],
};

describe('career firsts', () => {
  test('dated from the underlying records, never from evaluation time', () => {
    const firsts = buildCareerFirsts(records);
    const byKind = (kind: string) => firsts.filter((item) => item.kind === kind);
    assert.equal(byKind('first_match')[0].date, '2024-09-01');
    assert.equal(byKind('first_goal')[0].sourceId, 'a2');
    assert.equal(byKind('first_assist')[0].sourceId, 'b1');
    assert.equal(byKind('first_trial')[0].sourceId, 't1');
    assert.equal(byKind('verified_achievement').length, 1);
    assert.equal(byKind('goal_achieved')[0].date, '2025-10-01');
    assert.equal(byKind('first_reel')[0].sourceId, 'r1');
    assert.deepEqual(
      byKind('position_change').map((item) => [item.previous, item.subject]),
      [['CM', 'CAM']],
    );
    assert.equal(byKind('club_change')[0].subject, 'FC Aarau');
  });

  test('no records means no firsts', () => {
    assert.deepEqual(buildCareerFirsts(empty), []);
  });
});

describe('season summaries', () => {
  test('group records by European season', () => {
    assert.equal(seasonOf('2025-07-01'), '2025/26');
    const seasons = buildSeasonSummaries(records);
    assert.deepEqual(seasons.map((item) => item.season), ['2025/26', '2024/25']);
    const current = seasons[0];
    assert.equal(current.matches, 3);
    assert.equal(current.goals, 3);
    assert.equal(current.assists, 3);
    assert.deepEqual(current.positions, [
      { position: 'CAM', matches: 2 },
      { position: 'CM', matches: 1 },
    ]);
    assert.deepEqual(current.clubs, ['FC Aarau']);
    assert.equal(current.trials, 1);
    assert.equal(current.goalsAchieved, 1);
    assert.equal(current.bestMatch?.id, 'b1');
    assert.equal(seasons[1].trials, 1);
  });

  test('comparison needs three matches in each season', () => {
    const [current, previous] = buildSeasonSummaries(records);
    const comparison = compareSeasons(current, previous);
    assert.equal(comparison.sufficient, true);
    assert.deepEqual(
      comparison.metrics.find((item) => item.key === 'goalsPerMatch'),
      { key: 'goalsPerMatch', current: 1, previous: 0.33, delta: 0.67 },
    );
    const thin = buildSeasonSummaries({ ...records, matches: records.matches.slice(0, 4) });
    assert.equal(compareSeasons(thin[0], thin[1]).sufficient, false);
  });
});

describe('year in review', () => {
  test('improvement only from sufficient samples, challenge from an active goal', () => {
    const seasons = buildSeasonSummaries(records);
    const review = buildYearInReview(seasons, '2025/26', records);
    assert.ok(review);
    assert.equal(review.biggestImprovement?.key, 'goalsPerMatch');
    assert.deepEqual(review.nextChallenge, { kind: 'goal', title: 'Scanning' });
    assert.deepEqual(review.roleChanges.map((item) => item.kind).sort(), ['club_change', 'position_change']);

    const oldest = buildYearInReview(seasons, '2024/25', { goals: [] });
    assert.equal(oldest?.biggestImprovement, null);
    assert.deepEqual(oldest?.nextChallenge, { kind: 'upload_clip' });
    assert.equal(buildYearInReview(seasons, '2019/20', records), null);
  });
});
