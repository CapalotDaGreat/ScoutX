/**
 * Cross-consumer safety trace: an analysis whose identity is ambiguous must not become attributed
 * output anywhere downstream (moments, highlights, coaching, development numbers, the review hero).
 * Starts from real recorded worker output (IMG_4809, images removed) and goes through the real server parser,
 * exactly as the app receives it. Nothing here changes a threshold or a default.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';
import type { TrackingDoc, TrackingReport } from '../../src/features/match-analysis/services/trackingPresentation.ts';
import { buildCoachInsights } from '../../src/features/match-review/services/coach.ts';
import { observationFrom } from '../../src/features/match-review/services/development.ts';
import { HIGHLIGHT_PRESETS, selectHighlights } from '../../src/features/match-review/services/highlights.ts';
import { buildMomentsView } from '../../src/features/match-review/services/moments.ts';
import { buildMatchReview } from '../../src/features/match-review/services/review.ts';

type RawMoment = { identityState: string; candidate?: boolean };
type Raw = { report: { moments?: RawMoment[] } & Record<string, unknown>; timeline: { states: string[]; times: number[] } };

function raw(): Raw {
  return JSON.parse(readFileSync(new URL('../fixtures/tracking40-img4809-auto.json', import.meta.url), 'utf8')) as Raw;
}

function parse(input: Raw): TrackingReport {
  const report = parseTrackingReport(input.report, input.timeline);
  assert.ok(report, 'the worker output passes server validation');
  return report as unknown as TrackingReport;
}

const doc = (report: TrackingReport): TrackingDoc => ({ report, version: 1, stale: false, scope: 'full' });

function attributedOutputs(report: TrackingReport) {
  const view = buildMomentsView(report);
  const cards = [...view.moments, ...view.needsReview];
  const highlights = HIGHLIGHT_PRESETS.flatMap((preset) => selectHighlights(cards, preset));
  const coaching = buildCoachInsights(report, { position: 'winger' }).filter((i) => i.kind === 'strength' || i.kind === 'improve');
  const observation = observationFrom('job', '2026-09-27', doc(report));
  const review = buildMatchReview(doc(report), 'simple', { position: 'winger' });
  return { view, highlights, coaching, observation, review };
}

test('the unmodified recording is the control: it does produce identity-backed moments', () => {
  const report = parse(raw());
  const out = attributedOutputs(report);
  assert.ok(out.view.moments.length + out.view.needsReview.length > 0);
});

test('a report claiming an ambiguous-identity moment is refused whole by the server parser', () => {
  // The parser does not drop such a moment and keep the rest: it refuses the report, so nothing derived from it is stored.
  const input = raw();
  const moments = input.report.moments ?? [];
  assert.ok(moments.length > 1);
  moments[0].identityState = 'AMBIGUOUS';
  assert.equal(parseTrackingReport(input.report, input.timeline), null);
});

test('no moments survive identity checks: no consumer attributes anything', () => {
  // What the app receives when the worker found no identity-backed moment (all were ambiguous or off camera).
  const input = raw();
  input.report.moments = [];
  const report = parse(input);
  const out = attributedOutputs(report);
  assert.equal(out.view.moments.length, 0);
  assert.equal(out.view.needsReview.length, 0);
  assert.equal(out.highlights.length, 0, 'no highlight, in any preset');
  assert.equal(out.coaching.length, 0, 'no strength or improvement claim');
  assert.ok(out.observation);
  assert.equal(out.observation.confirmedActions, 0);
  assert.equal(out.observation.passAttempts, 0);
  assert.equal(out.observation.completedPasses, 0);
  assert.ok(out.review);
  assert.equal(out.review.hero.confirmedMoments, 0);
  assert.equal(out.review.hero.tone, 'none');
  assert.equal(out.review.best.length, 0);
  assert.equal(out.review.well.length, 0);
  assert.equal(out.review.improve.length, 0);
});

test('likely-only identity stays "needs review": never confirmed, never an automatic highlight or coaching claim', () => {
  const input = raw();
  for (const moment of input.report.moments ?? []) moment.identityState = 'LIKELY_VISIBLE';
  const report = parse(input);
  const out = attributedOutputs(report);
  assert.equal(out.view.moments.length, 0, 'nothing is shown as confirmed');
  assert.ok(out.view.needsReview.length > 0 && out.view.needsReview.every((m) => m.askIdentity));
  assert.equal(out.highlights.filter((clip) => out.view.needsReview.some((m) => m.id === clip.momentId)).length, 0);
  assert.equal(out.coaching.length, 0);
  assert.equal(out.observation?.confirmedActions, 0);
  assert.equal(out.review?.hero.confirmedMoments, 0);
});
