/**
 * Coaching evidence audit on a REAL worker report (2026-11-14 experiment E5).
 *
 *   node --import ./tests/unit/support/register.mjs workers/football-cv/bench/coach_eval.ts <report.json> <timeline.json> <gt.json> <out.json>
 *
 * Goes through the real server parser (parseTrackingReport) and the app's deterministic coach (buildCoachInsights), then
 * checks every strength/improvement against the developer labels: each cited moment is classified by the labelled
 * player under the moment's own claim box at the moment's labelled frames (target, other player, unlabelled). A coaching
 * statement about another player, or one with no checkable support, is reported, not hidden. Scope: one development
 * recording, interval labels only; moments outside the labelled intervals are "unverifiable", not "correct".
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { parseTrackingReport } from '../../../functions/src/analysis/trackingV3.ts';
import type { TrackingReport } from '../../../src/features/match-analysis/services/trackingPresentation.ts';
import { buildCoachInsights } from '../../../src/features/match-review/services/coach.ts';
import { buildMomentsView } from '../../../src/features/match-review/services/moments.ts';

type Box = [number, number, number, number];
type Gt = { times: Record<string, number>; frames: Record<string, Array<{ box: Box; label: string }>>; intervals: Array<[number, number]> };

const [reportPath, timelinePath, gtPath, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8')) as { states: string[]; times: number[]; boxes: Box[]; present: boolean[] };
const gt = JSON.parse(readFileSync(gtPath, 'utf8')) as Gt;
const report = parseTrackingReport(raw, { states: timeline.states, times: timeline.times }) as unknown as TrackingReport | null;
if (!report) {
  console.error('parseTrackingReport rejected the worker report');
  process.exit(2);
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]); const y1 = Math.max(a[1], b[1]); const x2 = Math.min(a[2], b[2]); const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return u > 0 ? inter / u : 0;
}

const labelAt = new Map<number, Array<{ box: Box; label: string }>>();
for (const [k, boxes] of Object.entries(gt.frames)) labelAt.set(Math.round(gt.times[k] * 10), boxes);
const inLabelledInterval = (t: number) => gt.intervals.some(([a, b]) => t >= a && t <= b);

/** Who the timeline's claim box is, per labelled frame inside [start, end]. */
function support(start: number, end: number): { target: number; other: number; unsure: number; unlabelled: number; unmatched: number } {
  const s = { target: 0, other: 0, unsure: 0, unlabelled: 0, unmatched: 0 };
  timeline.times.forEach((t, i) => {
    if (t < start || t > end || !timeline.present[i]) return;
    const labels = labelAt.get(Math.round(t * 10));
    if (!labels) { s.unlabelled += 1; return; }
    const best = labels.reduce<{ l: string; v: number } | null>((acc, l) => {
      const v = iou(timeline.boxes[i], l.box);
      return !acc || v > acc.v ? { l: l.label, v } : acc;
    }, null);
    if (!best || best.v < 0.5) s.unmatched += 1;
    else if (best.l === 'T') s.target += 1;
    else if (best.l === 'N') s.other += 1;
    else s.unsure += 1;
  });
  return s;
}

const view = buildMomentsView(report);
const byId = new Map([...view.moments, ...view.needsReview].map((m) => [m.id, m]));
const momentRaw = new Map((report.moments ?? []).map((m) => [m.id, m]));
const insights = buildCoachInsights(report, { position: report.target.position ?? 'unknown' });
const rows = insights.map((ins) => {
  const cited = ins.momentIds.map((id) => {
    const m = momentRaw.get(id);
    const card = byId.get(id);
    if (!m) return { id, missing: true };
    return { id, kind: m.kind, identityState: m.identityState, evidenceLabel: card?.evidence ?? null, start: m.start, end: m.end,
      labelledInterval: inLabelledInterval(m.start) || inLabelledInterval(m.end), labelSupport: support(m.start, m.end) };
  });
  const checked = cited.filter((c) => 'labelSupport' in c && c.labelledInterval);
  const wrongPlayer = checked.filter((c) => 'labelSupport' in c && c.labelSupport.other > 0 && c.labelSupport.target === 0).length;
  return { id: ins.id, kind: ins.kind, topic: ins.topic, tier: ins.tier, evidence: ins.evidence, params: ins.params,
    drill: ins.drill?.id ?? null, citedMoments: cited, checkableMoments: checked.length, momentsOnAnotherPlayer: wrongPlayer };
});
const out = {
  schema: 'pitchproof.coach-eval.v1', report: reportPath, insights: rows,
  summary: {
    insights: rows.length,
    strengthsOrImprovements: rows.filter((r) => r.kind === 'strength' || r.kind === 'improve').length,
    withCheckableMoments: rows.filter((r) => r.checkableMoments > 0).length,
    citingAnotherPlayer: rows.filter((r) => r.momentsOnAnotherPlayer > 0).length,
  },
  scope: 'One development recording; interval labels; moments outside labelled intervals are unverifiable, not correct.',
};
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary));
for (const r of rows) console.log(r.kind, r.id, 'tier', r.tier, 'cited', r.citedMoments.length, 'checkable', r.checkableMoments, 'otherPlayer', r.momentsOnAnotherPlayer);
