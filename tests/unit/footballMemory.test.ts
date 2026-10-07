import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerMemoryQuestion,
  buildMemoryIndex,
  parseMemoryQuery,
  searchMemory,
  seasonFor,
  type MemorySources,
} from '../../src/features/football-memory/services/footballMemory.ts';

const match = (
  id: string,
  overrides: Partial<NonNullable<MemorySources['matches']>[number]> = {},
): NonNullable<MemorySources['matches']>[number] => ({
  id,
  date: '2025-10-01',
  opponent: 'FC Basel',
  competition: 'U19 League',
  result: 'W 2-1',
  position: 'CB',
  minutes: 90,
  goals: 0,
  assists: 0,
  cleanSheet: false,
  tackles: null,
  ...overrides,
});

const index = buildMemoryIndex({
  matches: [
    match('m1', { tackles: 4, cleanSheet: true }),
    match('m2', { date: '2026-02-10', opponent: 'Young Boys', tackles: 7, goals: 1 }),
    match('m3', { date: '2024-11-03', opponent: 'FC Basel', position: 'ST', goals: 2, assists: 1 }),
  ],
  trials: [{ id: 't1', club: 'FC Zürich', status: 'accepted', scheduledDate: '2026-03-01' }],
  reels: [{ id: 'r1', title: 'Scout reel', preset: 'scout', createdAt: '2026-01-01' }],
  analyses: [
    { id: 'a1', status: 'complete', match: { opponent: 'Young Boys', competition: 'U19', date: '2026-02-10' }, createdAt: '2026-02-11' },
    { id: 'a2', status: 'failed', match: { opponent: 'Servette', competition: 'U19', date: '2026-02-12' }, createdAt: '2026-02-13' },
  ],
});

describe('memory index', () => {
  test('season labels follow the European calendar', () => {
    assert.equal(seasonFor('2025-09-01'), '2025/26');
    assert.equal(seasonFor('2026-03-01'), '2025/26');
    assert.equal(seasonFor(''), null);
  });

  test('indexes only completed analyses and keeps unrecorded tackles null', () => {
    assert.equal(index.filter((item) => item.kind === 'analysis').length, 1);
    assert.equal(index.find((item) => item.id === 'match-m3')?.match?.tackles, null);
    assert.equal(index[0].date, '2026-03-01');
  });
});

describe('query parser', () => {
  test('opponent, season, stat and count intent', () => {
    const query = parseMemoryQuery('How many goals against FC Basel in 2024/25?');
    assert.equal(query.intent, 'count');
    assert.equal(query.stat, 'goals');
    assert.equal(query.opponent, 'fc basel');
    assert.equal(query.season, '2024/25');
    assert.deepEqual(query.kinds, ['match']);
    assert.deepEqual(query.terms, []);
  });

  test('best defensive with an uppercase position code', () => {
    const query = parseMemoryQuery('best defensive game as CB');
    assert.equal(query.intent, 'best_defensive');
    assert.deepEqual(query.positions, ['CB']);
  });

  test('German and Spanish phrasing', () => {
    const de = parseMemoryQuery('Wie viele Tore gegen Young Boys');
    assert.equal(de.intent, 'count');
    assert.equal(de.stat, 'goals');
    assert.equal(de.opponent, 'young boys');
    const es = parseMemoryQuery('último análisis');
    assert.equal(es.intent, 'latest');
    assert.deepEqual(es.kinds, ['analysis']);
  });

  test('every locale example question parses to its intent', () => {
    for (const locale of ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt']) {
      const common = JSON.parse(readFileSync(`src/i18n/locales/${locale}/common.json`, 'utf8')) as {
        memory: { examples: { bestDefensive: string; goalsSeason: string; latestAnalysis: string } };
      };
      const { bestDefensive, goalsSeason, latestAnalysis } = common.memory.examples;
      assert.equal(parseMemoryQuery(bestDefensive).intent, 'best_defensive', `${locale}: ${bestDefensive}`);
      const goals = parseMemoryQuery(goalsSeason);
      assert.equal(goals.intent, 'count', `${locale}: ${goalsSeason}`);
      assert.equal(goals.stat, 'goals', `${locale}: ${goalsSeason}`);
      assert.equal(goals.season, '2025/26', `${locale}: ${goalsSeason}`);
      const latest = parseMemoryQuery(latestAnalysis);
      assert.equal(latest.intent, 'latest', `${locale}: ${latestAnalysis}`);
      assert.deepEqual(latest.kinds, ['analysis'], `${locale}: ${latestAnalysis}`);
    }
  });

  test('a bare year filters by calendar year', () => {
    assert.equal(parseMemoryQuery('trials 2026').year, 2026);
  });
});

describe('grounded answers', () => {
  test('counts goals from recorded matches only, with links', () => {
    const answer = answerMemoryQuestion(parseMemoryQuery('how many goals against FC Basel'), index);
    assert.equal(answer.status, 'answered');
    if (answer.status === 'answered' && answer.kind === 'count_stat') {
      assert.equal(answer.total, 2);
      assert.equal(answer.matches, 2);
      assert.deepEqual(answer.links.map((item) => item.id), ['match-m3']);
    } else {
      assert.fail('expected count_stat');
    }
  });

  test('best defensive needs a recorded tackle sample', () => {
    const answer = answerMemoryQuestion(parseMemoryQuery('best defensive match'), index);
    assert.equal(answer.status, 'answered');
    if (answer.status === 'answered' && answer.kind === 'best_defensive') {
      assert.equal(answer.record.id, 'match-m2');
      assert.equal(answer.tackles, 7);
      assert.equal(answer.sample, 2);
    }
    const thin = buildMemoryIndex({ matches: [match('x', { tackles: 3 })] });
    assert.equal(answerMemoryQuestion(parseMemoryQuery('best defensive match'), thin).status, 'insufficient');
  });

  test('unknown opponent is insufficient, never zero', () => {
    const answer = answerMemoryQuestion(parseMemoryQuery('how many goals against Servette'), index);
    assert.equal(answer.status, 'insufficient');
  });

  test('best attacking without any goal or assist is insufficient', () => {
    const quiet = buildMemoryIndex({ matches: [match('q1'), match('q2')] });
    assert.equal(answerMemoryQuestion(parseMemoryQuery('best attacking game'), quiet).status, 'insufficient');
  });

  test('latest analysis links to the analysis report', () => {
    const answer = answerMemoryQuestion(parseMemoryQuery('latest analysis'), index);
    assert.equal(answer.status, 'answered');
    if (answer.status === 'answered' && answer.kind === 'latest') {
      assert.deepEqual(answer.record.link, { route: 'analysis', entityId: 'a1' });
    }
  });

  test('free text searches titles and clubs', () => {
    assert.deepEqual(
      searchMemory(parseMemoryQuery('zürich'), index).map((item) => item.id),
      ['trial-t1'],
    );
  });
});
