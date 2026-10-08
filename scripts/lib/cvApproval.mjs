// Verifies the computer-vision worker approval record against the evaluation evidence it cites.
// Used by scripts/cv-approval.mjs (which compiles the result into Cloud Functions) and by the
// release gate. Nothing here trusts a claimed result: hashes bind the record to the report, the
// manifest and the thresholds, and every summary metric and gate verdict is recomputed from the
// per-video raw counts with the same formulas as workers/football-cv/eval/evaluate.py.
//
// Limit: a fully fabricated but internally consistent dataset cannot be detected offline. The
// controls for that are the footage hashes in the manifest (an independent reviewer can re-run
// eval.predict + eval.evaluate on the same files) and the named review recorded outside the repo.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APPROVAL_PATH = 'docs/video/evaluation/approval.json';
export const THRESHOLDS_PATH = 'workers/football-cv/eval/thresholds.json';
export const GENERATED_PATH = 'functions/src/analysis/cvApproval.generated.ts';
const EVIDENCE_DIR = 'docs/video/evaluation/';
const DIFFICULTY_TAGS = ['occlusion', 'camera_movement', 'low_light', 'similar_kits', 'identical_numbers', 'substitution', 'off_camera_periods', 're_entry'];
const EPSILON = 1e-9;

export function sha256Normalized(buffer) {
  return createHash('sha256').update(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

export function aggregate(videos) {
  const sum = (key, field, subset = videos) => subset.reduce((total, video) => total + Number(video[key][field]), 0);
  const pred = sum('visible', 'predSec');
  const shared = sum('visible', 'overlapSec');
  const runs = videos.flatMap((video) => video.identity.correctRunsSec);
  const analysed = sum('coverage', 'analysedSec');
  const eventVideos = videos.filter((video) => video.events.stage === 'complete');
  const tp = sum('events', 'truePositive', eventVideos);
  const hasEvents = eventVideos.length > 0;
  return {
    videos: videos.length,
    annotators: new Set(videos.map((video) => video.annotator).filter(Boolean)).size,
    visiblePrecision: ratio(shared, pred),
    visibleRecall: ratio(shared, sum('visible', 'trueSec')),
    likelyOffCameraPrecision: ratio(sum('offCamera', 'onPitchOverlapSec'), sum('offCamera', 'predSec')),
    falseConfirmRate: ratio(pred - shared, pred),
    identityAccuracy: ratio(sum('identity', 'correct'), sum('identity', 'claimed')),
    identityKeyframes: sum('identity', 'keyframes'),
    switchesPer10Min: ratio(sum('identity', 'switches'), analysed / 600),
    meanCorrectRunSec: runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : null,
    coverage: ratio(analysed, sum('coverage', 'durationSec')),
    reliability: ratio(sum('reliability', 'segmentsOk'), sum('reliability', 'segments')),
    eventStage: hasEvents && eventVideos.length === videos.length ? 'complete' : 'not_implemented',
    eventPrecision: hasEvents ? ratio(tp, sum('events', 'predicted', eventVideos)) : null,
    eventRecall: hasEvents ? ratio(tp, sum('events', 'actual', eventVideos)) : null,
    meanTimestampErrorSec: hasEvents ? ratio(sum('events', 'timestampErrorSumSec', eventVideos), tp) : null,
  };
}

function scoreAll(summary, metrics) {
  return Object.entries(metrics ?? {}).map(([name, rule]) => {
    const value = summary?.[name];
    if (value === null || value === undefined) return { name, pass: false, reason: 'not measured' };
    return { name, pass: 'min' in rule ? value >= rule.min : value <= rule.max };
  });
}

/** Same verdict as evaluate.check(); returns the list of reasons it fails. */
export function gateProblems(videos, thresholds, { events = false } = {}) {
  const summary = aggregate(videos);
  const problems = [];
  if (summary.videos < (thresholds.minimumVideos ?? 0)) problems.push(`only ${summary.videos} videos`);
  if (summary.annotators < (thresholds.minimumAnnotators ?? 0)) problems.push(`only ${summary.annotators} annotators`);
  const scored = scoreAll(summary, thresholds.metrics);
  if (scored.length === 0) problems.push('no metrics defined');
  for (const result of scored) if (!result.pass) problems.push(`${result.name}: ${result.reason ?? 'below threshold'}`);
  for (const [tag, minimum] of Object.entries(thresholds.requiredSlices ?? {})) {
    const subset = videos.filter((video) => video.difficulty.includes(tag));
    if (subset.length < minimum) {
      problems.push(`slice ${tag}: ${subset.length}/${minimum} videos`);
      continue;
    }
    const sliceRules = Object.fromEntries((thresholds.sliceMetrics ?? []).filter((m) => thresholds.metrics?.[m]).map((m) => [m, thresholds.metrics[m]]));
    for (const result of scoreAll(aggregate(subset), sliceRules)) if (!result.pass) problems.push(`slice ${tag}: ${result.name} below threshold`);
  }
  if (events) {
    if (summary.eventStage !== 'complete') problems.push('event approval requested but the event stage is not implemented');
    const eventScores = scoreAll(summary, thresholds.eventMetrics);
    if (eventScores.length === 0) problems.push('no event metrics defined');
    for (const result of eventScores) if (!result.pass) problems.push(`${result.name}: ${result.reason ?? 'below threshold'}`);
  }
  return { summary, problems };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function sameJson(a, b) {
  const sort = (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]))
      : value;
  return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
}

function evidencePath(root, value, label, problems) {
  if (typeof value !== 'string' || !value.startsWith(EVIDENCE_DIR) || value.includes('..')) {
    problems.push(`${label} must be a file under ${EVIDENCE_DIR}`);
    return null;
  }
  const full = join(root, value);
  if (!existsSync(full)) {
    problems.push(`${label} ${value} does not exist`);
    return null;
  }
  return full;
}

/**
 * state: 'absent'   no approval record (the expected state until a real evaluation exists)
 *        'invalid'  a record exists but does not hold up; the worker must stay off
 *        'approved' every check passed; `runtime` is what gets compiled into Cloud Functions
 */
export function verifyCvApproval(root, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const approvalFile = join(root, APPROVAL_PATH);
  if (!existsSync(approvalFile)) return { state: 'absent', problems: ['no approval record'], runtime: null };
  const problems = [];
  let record;
  try {
    record = JSON.parse(readFileSync(approvalFile, 'utf8'));
  } catch {
    return { state: 'invalid', problems: ['approval record is not valid JSON'], runtime: null };
  }

  if (record.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (typeof record.workerVersion !== 'string' || !record.workerVersion) problems.push('workerVersion missing');
  const models = record.models && typeof record.models === 'object' ? record.models : {};
  if (Object.keys(models).length === 0 || Object.values(models).some((v) => typeof v !== 'string' || !v)) problems.push('models must pin every model version');
  for (const field of ['evaluatedAt', 'approvedAt']) {
    if (!ISO_DATE.test(record[field] ?? '')) problems.push(`${field} must be YYYY-MM-DD`);
  }
  if (record.evaluatedAt > record.approvedAt) problems.push('approved before it was evaluated');
  if (record.approvedAt > today) problems.push('approvedAt is in the future');
  if (typeof record.approver?.role !== 'string' || !record.approver.role.trim()) problems.push('approver.role missing');
  if (!ISO_DATE.test(record.securityReview?.completedAt ?? '') || typeof record.securityReview?.reference !== 'string' || !record.securityReview.reference.trim()) {
    problems.push('securityReview.completedAt / reference missing');
  }
  if (record.scope?.identityAndAvailability !== true) problems.push('scope.identityAndAvailability must be true');
  const eventsApproved = record.scope?.events === true;
  for (const field of ['reportSha256', 'manifestSha256', 'thresholdsSha256']) {
    if (!HEX64.test(record[field] ?? '')) problems.push(`${field} must be a SHA-256`);
  }

  const reportFile = evidencePath(root, record.reportPath, 'reportPath', problems);
  const manifestFile = evidencePath(root, record.manifestPath, 'manifestPath', problems);
  const thresholdsRaw = readFileSync(join(root, THRESHOLDS_PATH));
  const thresholds = JSON.parse(thresholdsRaw.toString('utf8'));
  if (sha256Normalized(thresholdsRaw) !== record.thresholdsSha256) problems.push('thresholds changed since the approval');
  if (thresholds.status !== 'approved') problems.push(`thresholds are "${thresholds.status}", not approved by the product owner`);

  let report = null;
  let manifest = null;
  if (reportFile) {
    const raw = readFileSync(reportFile);
    if (sha256Normalized(raw) !== record.reportSha256) problems.push('evaluation report does not match reportSha256');
    try {
      report = JSON.parse(raw.toString('utf8'));
    } catch {
      problems.push('evaluation report is not valid JSON');
    }
  }
  if (manifestFile) {
    const raw = readFileSync(manifestFile);
    if (sha256Normalized(raw) !== record.manifestSha256) problems.push('dataset manifest does not match manifestSha256');
    try {
      manifest = JSON.parse(raw.toString('utf8'));
    } catch {
      problems.push('dataset manifest is not valid JSON');
    }
  }

  if (report) {
    const provenance = report.provenance ?? {};
    if (provenance.workerVersion !== record.workerVersion) problems.push('report was produced by a different worker version');
    if (!sameJson(provenance.models ?? {}, models)) problems.push('report was produced with different model versions');
    if (provenance.manifestSha256 !== record.manifestSha256) problems.push('report was computed on a different manifest');
    if (provenance.thresholdsSha256 !== record.thresholdsSha256) problems.push('report was scored against different thresholds');
    const videos = Array.isArray(report.videos) ? report.videos : [];
    if (manifest) {
      const listed = new Set((manifest.videos ?? []).map((video) => video.videoId));
      const scored = new Set(videos.map((video) => video.videoId));
      if (listed.size !== scored.size || [...listed].some((id) => !scored.has(id))) problems.push('report and manifest cover different videos');
      for (const video of manifest.videos ?? []) {
        if (!HEX64.test(video.footageSha256 ?? '')) problems.push(`${video.videoId}: footage hash missing`);
        if (video.consent !== 'documented') problems.push(`${video.videoId}: recording permission not documented`);
      }
    }
    for (const video of videos) {
      if (!Array.isArray(video.difficulty) || video.difficulty.some((tag) => !DIFFICULTY_TAGS.includes(tag))) problems.push(`${video.videoId}: unknown difficulty tag`);
    }
    try {
      const { summary, problems: gate } = gateProblems(videos, thresholds, { events: eventsApproved });
      problems.push(...gate);
      for (const [name, value] of Object.entries(summary)) {
        const claimed = report.summary?.[name];
        const differs = typeof value === 'number' && typeof claimed === 'number' ? Math.abs(value - claimed) > EPSILON : value !== claimed;
        if (differs) problems.push(`summary ${name} does not match the per-video data`);
      }
    } catch {
      problems.push('per-video data is malformed');
    }
  }

  if (problems.length > 0) return { state: 'invalid', problems, runtime: null };
  return {
    state: 'approved',
    problems: [],
    runtime: { workerVersion: record.workerVersion, models, eventsApproved, reportSha256: record.reportSha256 },
  };
}

export function generatedModule(runtime) {
  const value = runtime
    ? JSON.stringify({ workerVersion: runtime.workerVersion, models: runtime.models, eventsApproved: runtime.eventsApproved, reportSha256: runtime.reportSha256 }, null, 2)
    : 'null';
  return `// Generated by \`node scripts/cv-approval.mjs --write\` from docs/video/evaluation/approval.json.
// Do not edit: the release gate regenerates this file and fails if it differs.
export type CvApproval = {
  workerVersion: string;
  models: Readonly<Record<string, string>>;
  eventsApproved: boolean;
  reportSha256: string;
};

export const APPROVED_CV_WORKER: CvApproval | null = ${value};
`;
}
