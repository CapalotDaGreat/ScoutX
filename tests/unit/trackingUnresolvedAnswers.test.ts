/**
 * 2026-11-14: identity answers the worker could not apply reach the app as `unresolvedAnswers`, so the owner can
 * answer again instead of an answer silently attaching to the nearer of two overlapping players.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MAX_UNRESOLVED_ANSWERS, parseTrackingReport, parseUnresolvedAnswers } from '../../functions/src/analysis/trackingV3.ts';

type Raw = { report: Record<string, unknown>; timeline: { states: string[]; times: number[] } };
const raw = (): Raw => JSON.parse(readFileSync(new URL('../fixtures/tracking40-img4809-auto.json', import.meta.url), 'utf8')) as Raw;

test('applied answers and malformed entries are dropped; the rest are sorted by time', () => {
  assert.deepEqual(parseUnresolvedAnswers([
    { t: 30, status: 'ambiguous' }, { t: 10, status: 'applied' }, { t: 12, status: 'no_player' },
    { t: -1, status: 'ambiguous' }, { t: 5, status: 'weird' }, { t: 9999, status: 'excluded' }, 'x', null,
  ], 600), [{ t: 12, status: 'no_player' }, { t: 30, status: 'ambiguous' }]);
});

test('the list is bounded', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ t: i, status: 'ambiguous' }));
  assert.equal(parseUnresolvedAnswers(many, 600).length, MAX_UNRESOLVED_ANSWERS);
});

test('a real worker report carries unresolved answers through server validation, and an old report has none', () => {
  const input = raw();
  const old = parseTrackingReport(input.report, input.timeline);
  assert.ok(old);
  assert.deepEqual(old.unresolvedAnswers, []);
  const withAnswers = parseTrackingReport({ ...input.report, anchorResolution: [{ t: 100, status: 'ambiguous' }, { t: 120, status: 'applied' }] },
    input.timeline);
  assert.ok(withAnswers);
  assert.deepEqual(withAnswers.unresolvedAnswers, [{ t: 100, status: 'ambiguous' }]);
});
