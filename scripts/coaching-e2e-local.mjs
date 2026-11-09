/**
 * Local coaching path exercise (not a live authenticated device pass).
 * Uses real worker fixtures + production TS helpers. Writes numeric/text evidence only.
 *
 *   node scripts/coaching-e2e-local.mjs
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, '..', 'ScoutX', '.local', '_tmp_coaching_e2e');
mkdirSync(outDir, { recursive: true });

const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { parseTrackingReport } = await load('functions/src/analysis/trackingV3.ts');
const { buildCoachInsights } = await load('src/features/match-review/services/coach.ts');
const { buildMatchReview } = await load('src/features/match-review/services/review.ts');
const { buildMomentsView } = await load('src/features/match-review/services/moments.ts');
const { coachingMomentsFromSynthesis } = await load('functions/src/analysis/segmentReview.ts');
const { buildStructuredCoaching } = await load('src/features/match-analysis/services/analysisIntelligence.ts');

function fixture(name) {
  const raw = JSON.parse(readFileSync(path.join(root, `tests/fixtures/tracking40-img4809-${name}.json`), 'utf8'));
  const report = parseTrackingReport(raw.report, raw.timeline);
  assert.ok(report, `fixture ${name} must parse`);
  return report;
}

const results = {
  schema: 'pitchproof.coaching-e2e-local.v1',
  mode: 'fixture_replay_not_live_auth',
  productionApproval: false,
  cases: [],
};

function record(id, ok, detail) {
  results.cases.push({ id, ok, ...detail });
  if (!ok) throw new Error(`${id}: ${detail.reason || JSON.stringify(detail)}`);
}

// 1) Insufficient identity / coverage → limitations, no invented strengths
{
  const report = fixture('auto');
  const insights = buildCoachInsights(report, { position: 'winger' });
  const nonLimit = insights.filter((i) => i.kind !== 'limitation');
  record('insufficient_identity_limitations_only', nonLimit.length === 0, {
    insightKinds: insights.map((i) => i.kind),
    topics: insights.map((i) => i.topic),
    confirmedVisibleSec: report.coverage.confirmedVisibleSec,
    contacts: report.ball.contacts,
    contactsConfirmedIdentity: report.ball.contactsConfirmedIdentity ?? null,
  });
}

// 2) Likely-only contacts must not open involvement_improve (0584c1c gate)
{
  const base = fixture('auto');
  const low = {
    ...base,
    coverage: { ...base.coverage, confirmedVisibleSec: 400, analysedSec: 1000 },
    moments: [],
    events: [],
    ball: { ...base.ball, contacts: 4, contactsConfirmedIdentity: 0 },
  };
  const blocked = buildCoachInsights(low, { position: 'winger' }).some((i) => i.id === 'involvement_improve');
  const allowed = buildCoachInsights(
    { ...low, ball: { ...low.ball, contactsConfirmedIdentity: 2 } },
    { position: 'winger' },
  ).some((i) => i.id === 'involvement_improve');
  record('involvement_requires_confirmed_contact', !blocked && allowed, { blocked, allowed });
}

// 3) Confirmed pass evidence can yield constructive coaching with drill
{
  const base = fixture('auto');
  const rich = {
    ...base,
    coverage: { ...base.coverage, confirmedVisibleSec: 400 },
    ball: { ...base.ball, contacts: 6, contactsConfirmedIdentity: 4 },
    events: [{ type: 'contact', start: 100, end: 101, identityState: 'CONFIRMED_VISIBLE' }],
    moments: [
      {
        id: 'm_960', kind: 'pass_attempt', kinds: ['pass_attempt', 'contact'], start: 100, end: 102,
        clipStart: 96, clipEnd: 104, identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'completed',
        indicator: [[100, 0.1, 0.1, 0.05, 0.1]],
      },
      {
        id: 'm_1960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 200, end: 202,
        clipStart: 196, clipEnd: 204, identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'completed',
        indicator: [[200, 0.1, 0.1, 0.05, 0.1]],
      },
      {
        id: 'm_2960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 300, end: 302,
        clipStart: 296, clipEnd: 304, identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'incomplete',
        indicator: [],
      },
      {
        id: 'm_3460', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 350, end: 352,
        clipStart: 346, clipEnd: 354, identityState: 'CONFIRMED_VISIBLE', candidate: false, outcome: 'incomplete',
        indicator: [],
      },
      {
        id: 'm_3960', kind: 'pass_attempt', kinds: ['pass_attempt'], start: 400, end: 402,
        clipStart: 396, clipEnd: 404, identityState: 'LIKELY_VISIBLE', candidate: false, outcome: 'incomplete',
        indicator: [],
      },
    ],
  };
  const insights = buildCoachInsights(rich, { position: 'centre midfield' });
  const improve = insights.find((i) => i.topic === 'passing_accuracy');
  const view = buildMomentsView(rich);
  record('confirmed_passing_improve_has_drill_and_citations', Boolean(improve?.drill && improve.momentIds?.length), {
    improve,
    likelyMomentExcluded: !insights.some((i) => i.momentIds?.includes('m_3960')),
    estimatedMoments: view.moments.filter((m) => m.evidence === 'estimated').map((m) => m.id),
    confirmedMoments: view.moments.filter((m) => m.evidence === 'confirmed').map((m) => m.id),
  });
}

// 4) Synthesis → moments: needs cited observation + drill + success criterion
{
  const observations = [
    { id: 'obs1', timestampSec: 42, label: 'first touch', detail: 'Took a heavy first touch under pressure', confidence: 'medium' },
  ];
  const good = coachingMomentsFromSynthesis({
    opportunities: [{
      title: 'Cleaner first touch',
      why: 'Keeps possession in midfield',
      drill: 'Receive and turn, 2x8 minutes',
      successCriterion: 'Complete 8/10 receives facing forward in the next match',
      observationIds: ['obs1'],
    }],
    improvements: [{ text: 'Cushion the ball into space away from pressure', observationIds: ['obs1'] }],
    strengths: [],
    headline: '',
    coachingNotes: '',
    decisionMoments: [],
  }, observations);
  const bad = coachingMomentsFromSynthesis({
    opportunities: [{
      title: 'Be better',
      why: '',
      drill: '',
      successCriterion: '',
      observationIds: ['obs1'],
    }],
    improvements: [],
    strengths: [],
    headline: '',
    coachingNotes: '',
    decisionMoments: [],
  }, observations);
  const structured = buildStructuredCoaching(good, [], []);
  record('synthesis_requires_citation_drill_criterion', good.length === 1 && bad.length === 0 && structured.length >= 1, {
    goodMoment: good[0],
    structuredCount: structured.length,
    structuredSample: structured[0] ?? null,
  });
}

// 5) Match review scout view omits coaching; player view keeps limitations honest
{
  const report = fixture('auto');
  const doc = { report, version: 1, stale: false, scope: 'full' };
  const player = buildMatchReview(doc, 'simple');
  const scout = buildMatchReview(doc, 'scout');
  record('scout_view_without_player_coaching_surface',
    Boolean(player) && Boolean(scout) && (scout.well?.length ?? 0) + (scout.improve?.length ?? 0) === 0,
    {
      playerSections: player?.sections ?? null,
      scoutSections: scout?.sections ?? null,
      scoutWell: scout?.well?.length ?? 0,
      scoutImprove: scout?.improve?.length ?? 0,
      scoutLimitations: scout?.limitations?.length ?? 0,
      note: 'Object-graph verification from production helpers; no Expo UI snapshot and no live Firebase auth.',
    });
}

writeFileSync(path.join(outDir, 'coaching_e2e_results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ status: 'ok', out: path.join(outDir, 'coaching_e2e_results.json'), cases: results.cases.length }, null, 2));
