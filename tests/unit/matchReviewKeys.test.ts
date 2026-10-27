import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DRILLS } from '../../src/features/match-review/services/coach.ts';
import { HIGHLIGHT_PRESETS } from '../../src/features/match-review/services/highlights.ts';
import { JOURNEY_STAGES } from '../../src/features/match-review/services/journey.ts';

/** Keys the match review composes at runtime (template keys the compiler cannot check). */
test('every composed match-review key exists in the English locale', () => {
  const en = JSON.parse(readFileSync(new URL('../../src/i18n/locales/en/matchAnalysis.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const has = (key: string) => {
    let cur: unknown = en;
    for (const part of key.split('.')) {
      if (!cur || typeof cur !== 'object') return false;
      cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === 'string' || (cur !== null && typeof cur === 'object' && 'other' in (cur as object));
  };
  const hasPlural = (key: string) => has(`${key}_one`) && has(`${key}_other`);
  const keys: string[] = [];
  const insightPairs = ['involvement.strength', 'involvement.improve', 'passing.strength', 'passing_accuracy.improve', 'carrying.strength',
    'identity.limitation', 'ball_visibility.limitation', 'physical.limitation'];
  for (const p of insightPairs) for (const part of ['what', 'why', 'do']) keys.push(`review.coach.${p}.${part}`);
  for (const d of DRILLS) keys.push(`review.drill.${d.id}.name`, `review.drill.${d.id}.how`);
  for (const topic of ['involvement', 'carrying', 'passing', 'passing_accuracy', 'identity', 'ball_visibility', 'physical']) keys.push(`review.topic.${topic}`);
  for (const tip of ['wider_view', 'follow_play', 'bold_numbers', 'record_whole_match', 'steady_camera']) keys.push(`review.tip.${tip}`);
  for (const s of JOURNEY_STAGES) keys.push(`review.workspace.stage.${s}`);
  for (const s of ['done', 'active', 'pending', 'blocked']) keys.push(`review.workspace.status.${s}`);
  for (const k of ['consent_required', 'source_missing', 'worker_unavailable', 'interrupted', 'cancelled']) {
    keys.push(`review.problem.${k}.title`, `review.problem.${k}.body`, `review.problem.${k}.action`);
  }
  for (const p of HIGHLIGHT_PRESETS) keys.push(`review.highlights.preset.${p}`);
  for (const r of ['no_confirmed_moments', 'no_measured_actions', 'defensive_not_validated', 'not_goalkeeper']) keys.push(`review.highlights.unavailable.${r}`);
  for (const k of ['contact', 'carry', 'pass_attempt', 'duel_candidate', 'tackle_candidate', 'spell']) keys.push(`review.moments.kind.${k}`);
  for (const c of ['on_ball', 'passing', 'duels', 'on_camera']) keys.push(`review.moments.category.${c}`);
  for (const e of ['confirmed', 'estimated', 'needs_review', 'not_measurable']) keys.push(`review.moments.evidence.${e}`);
  for (const o of ['completed', 'incomplete', 'unknown']) keys.push(`review.moments.outcome.${o}`);
  for (const intent of ['best_moment', 'moments', 'passing', 'distance', 'speed', 'heatmap', 'goals', 'improve', 'well', 'identity', 'review', 'compare', 'unknown']) {
    keys.push(`review.ask.q.${intent}`);
  }
  for (const a of ['noReport', 'distanceUncalibrated', 'speedUncalibrated', 'physicalMissing', 'distance', 'speed', 'heatmapObserved',
    'heatmapUnavailable', 'goalsNotMeasured', 'compareSeeDevelopment', 'noPasses', 'passes', 'improve', 'noImprove', 'well', 'noStrength',
    'identity', 'review', 'reviewNone', 'best', 'noMoments', 'moments', 'unknown']) keys.push(`review.ask.a.${a}`);
  for (const s of ['confirmed', 'likely', 'not_seen', 'no_play']) keys.push(`review.story.${s}`);
  for (const v of ['simple', 'detailed', 'scout']) keys.push(`review.view.${v}`);
  for (const h of ['strong', 'limited', 'none']) keys.push(`review.hero.${h}`);
  for (const r of ['partial_report', 'engine_changed', 'low_confirmed_coverage']) keys.push(`review.development.excluded.${r}`);
  const missing = keys.filter((k) => !has(k));
  assert.deepEqual(missing, []);
  for (const k of ['review.hero.confirmedMoments', 'review.hero.reviewMoments', 'review.highlights.summary', 'review.story.moments']) {
    assert.ok(hasPlural(k), k);
  }
  // Every answer key the Ask service can return is listed above.
  const askSource = readFileSync(new URL('../../src/features/match-review/services/ask.ts', import.meta.url), 'utf8');
  for (const m of askSource.matchAll(/key: '([A-Za-z]+)'/g)) assert.ok(has(`review.ask.a.${m[1]}`), m[1]);
  const keySource = readFileSync(new URL('../../src/features/match-review/services/ask.ts', import.meta.url), 'utf8');
  for (const m of keySource.matchAll(/'(distance|speed)'/g)) assert.ok(has(`review.ask.a.${m[1]}`));
});
