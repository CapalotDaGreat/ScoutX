import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCareerMoments } from '../../src/features/career-story/services/careerMoments.ts';
import { buildFootballStory, buildYearInReviewSnapshot } from '../../src/features/career-story/services/yearInReview.ts';
import { buildTrialReplay } from '../../src/features/career-story/services/trialReplay.ts';
import { addPlayerToRoster, createCoachObservation, emptyCoachRoster } from '../../src/features/coach-mode/services/coachRoster.ts';
import { formatFreshness, latestDate } from '../../src/components/evidence/freshness.ts';
import { isDiscoverableVerifiedLevel } from '../../src/features/verification-system/services/discoverableVerified.ts';

describe('career moments and year in review', () => {
  test('emits only recorded artefacts and never invents a year story', () => {
    const moments = buildCareerMoments({
      matches: [{ id: 'm1', date: '2026-03-01', opponent: 'Ajax', result: 'W 1-0', goals: 1 }],
      trials: [{ id: 't1', status: 'completed', scheduledDate: '2026-04-01', club: 'Ajax' }],
    });
    assert.equal(moments.length, 2);
    const emptyYear = buildYearInReviewSnapshot('p1', 2025, moments, { goals: null, assists: null });
    assert.equal(emptyYear.narrative.text.includes('Not enough'), true);
    assert.equal(emptyYear.narrative.label, 'generated_from_records');
    const story = buildFootballStory('p1', moments);
    assert.equal(story.label, 'generated_from_records');
    assert.ok(story.paragraphs[0]?.includes('Ajax'));
  });
});

describe('trial replay', () => {
  test('replays stored history only', () => {
    const replay = buildTrialReplay({
      id: 't1',
      playerId: 'p1',
      scoutId: 's1',
      history: [{ id: 'h1', action: 'created', timestamp: '2026-01-01', note: 'invite' }],
    });
    assert.equal(replay.steps.length, 1);
    assert.equal(replay.steps[0]?.note, 'invite');
  });
});

describe('coach roster and observations', () => {
  test('does not add a player twice and ignores empty observations', () => {
    const roster = addPlayerToRoster(emptyCoachRoster('c1', 't0'), 'p1', 't1');
    assert.equal(addPlayerToRoster(roster, 'p1', 't2').players.length, 1);
    assert.equal(createCoachObservation('c1', 'p1', '   ', null), null);
    assert.equal(createCoachObservation('c1', 'p1', 'Hold the line', 'm1', 't3')?.provenance, 'coach_provided');
  });
});

describe('freshness', () => {
  test('unknown stays unknown and days are computed from a real timestamp', () => {
    assert.equal(formatFreshness({ updatedAt: null, sampleSize: null }).known, false);
    const freshness = formatFreshness({
      updatedAt: '2026-10-01T00:00:00.000Z',
      sampleSize: 5,
      nowMs: Date.parse('2026-10-06T00:00:00.000Z'),
    });
    assert.equal(freshness.daysAgo, 5);
    assert.equal(freshness.sampleSize, 5);
  });

  test('latest date ignores missing and invalid dates instead of inventing one', () => {
    assert.equal(latestDate([]), null);
    assert.equal(latestDate([null, undefined, 'not a date']), null);
    assert.equal(latestDate(['2026-09-01', null, '2026-10-02', '2026-01-05']), '2026-10-02');
  });
});

describe('discoverable verification', () => {
  test('only identity-verified counts — basic and none stay unverified', () => {
    assert.equal(isDiscoverableVerifiedLevel('verified'), true);
    assert.equal(isDiscoverableVerifiedLevel('basic'), false);
    assert.equal(isDiscoverableVerifiedLevel('none'), false);
  });
});
