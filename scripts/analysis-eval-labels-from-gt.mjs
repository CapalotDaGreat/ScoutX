#!/usr/bin/env node
// Derives report-level visible intervals from the existing per-frame developer ground truth
// workers/football-cv/bench/results/5.1/gt_img4809_intervals.json (T = target, N = other player, ? = unsure).
//   node scripts/analysis-eval-labels-from-gt.mjs [gt.json] > docs/video/evaluation/img4809-dev.labels.json
// A frame is VISIBLE when any box is T. These annotations cover selected player boxes, not every player
// in the frame: N means that box is another player, never that the target is absent. All other frames
// stay unlabelled. Single developer annotator, repeatedly used for development: development split only.
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? new URL('../workers/football-cv/bench/results/5.1/gt_img4809_intervals.json', import.meta.url);
const gt = JSON.parse(readFileSync(path, 'utf8'));
const GAP = 0.15; // 10 fps labels
const classify = (boxes) => {
  const l = boxes.map((b) => b.label);
  if (l.includes('T')) return 'visible';
  return null;
};
const times = Object.keys(gt.frames).map((k) => ({ t: Number(gt.times[k]), c: classify(gt.frames[k]) })).sort((a, b) => a.t - b.t);
const merge = (kind) => {
  const out = [];
  for (const { t, c } of times) {
    if (c !== kind) continue;
    const last = out[out.length - 1];
    if (last && t - last[1] <= GAP) last[1] = t; else out.push([t, t]);
  }
  return out.map(([a, b]) => [Math.round(a * 100) / 100, Math.round((b + 0.1) * 100) / 100]);
};
const labels = {
  clipId: 'img4809-dev', split: 'development',
  // Source recording hash from docs/video/local-review-and-frozen-holdout-2026-10-25.md; the labels were drawn on the 10 fps proxy of it.
  sourceSha256: '6450a5bbcbddd593447b30b531c4e8925640e944ff9a776533179b5a3cdaaaaf',
  synthetic: false, reviewers: ['developer-single-annotator'], blinded: false, eventsLabelled: false,
  visibleIntervals: merge('visible'), absentIntervals: [], events: [],
  tags: ['developer_labels', 'nine_30s_windows', 'orange_pieces_over_50px', 'label_times_unshifted', 'presence_only_partial_box_annotations'],
  note: gt.note,
};
process.stdout.write(`${JSON.stringify(labels, null, 1)}\n`);
