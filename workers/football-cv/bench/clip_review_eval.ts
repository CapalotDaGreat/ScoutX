/**
 * CLIP-EXP-1 replay: runs the experimental clip-review contract on a saved worker report + frame timeline and checks
 * every produced item against the labels (all labelled frames in the clip must be the target). Local data only.
 *   node --import ./tests/unit/support/register.mjs workers/football-cv/bench/clip_review_eval.ts <result.json> <timeline.json> <gt.json> <line> <taps.json|-> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildClipReviewExperimental, type OwnerAnswer } from '../../../src/features/match-review/services/clipReviewExperimental.ts';

type Box = [number, number, number, number];
const [reportPath, tlPath, gtPath, line, tapsPath, outPath] = process.argv.slice(2);
const r = JSON.parse(readFileSync(reportPath, 'utf8'));
const tl = JSON.parse(readFileSync(tlPath, 'utf8')) as { times: number[]; states: string[]; present: boolean[]; boxes: Box[] };
const gt = JSON.parse(readFileSync(gtPath, 'utf8')) as { times: Record<string, number>; frames: Record<string, Array<{ box: Box; label: string }>> };
const taps: OwnerAnswer[] = tapsPath === '-' ? [] : (JSON.parse(readFileSync(tapsPath, 'utf8')) as number[][]).map((t) => ({ t: t[0], answer: 'is_me' }));
const iou = (a: Box, b: Box) => {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])); const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - w * h; return u > 0 ? (w * h) / u : 0;
};
const labelAt = new Map<number, Array<{ box: Box; label: string }>>();
for (const [k, v] of Object.entries(gt.frames)) labelAt.set(Math.round(gt.times[k] * 10), v);
function support(a: number, b: number) {
  const s = { target: 0, other: 0, unsure: 0, unmatched: 0, unlabelled: 0 };
  tl.times.forEach((t, i) => {
    if (t < a || t > b || !tl.present[i]) return;
    const L = labelAt.get(Math.round(t * 10)); if (!L) { s.unlabelled += 1; return; }
    const best = L.reduce<{ l: string; v: number } | null>((acc, l) => { const v = iou(tl.boxes[i], l.box); return !acc || v > acc.v ? { l: l.label, v } : acc; }, null);
    if (!best || best.v < 0.5) s.unmatched += 1; else if (best.l === 'T') s.target += 1; else if (best.l === 'N') s.other += 1; else s.unsure += 1;
  });
  return s;
}
const review = await buildClipReviewExperimental({ sequences: r.offball?.sequences ?? [], timeline: tl, recordingSec: r.coverage.recordingSec,
  line: line as 'attack', answers: taps, answersFingerprint: 'replay' });
const out = { schema: 'pitchproof.clip-review-eval.v1', report: reportPath, line,
  items: review.items.map((it) => ({ ...it, labelSupport: support(it.clip.start, it.clip.end) })),
  insufficient: review.insufficient.map((x) => ({ ...x, labelSupport: support(x.clip.start, x.clip.end) })) };
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ items: out.items.map((i) => [i.clip, i.kind, i.identitySource, i.labelSupport]), insufficient: out.insufficient.map((i) => [i.clip, i.reason, i.labelSupport]) }));
