#!/usr/bin/env node
/**
 * Local stand-in for the GPU tracking worker (contract v3), for the pilot rollback rehearsal only.
 * Listens on 127.0.0.1 only. Never contacts anything except the Storage emulator URL it is handed.
 *
 *   POST /v3/tracking:{extract,discover,resolve}   worker routes (behaviour per job, see /_ctl)
 *   POST /_ctl/plan   {jobId, route, action: 'ok'|'hold'|'fail'|'wrong_version'|'wrong_models', times?}
 *   POST /_ctl/release {jobId, route}               releases every held request of that job/route
 *   POST /_ctl/release-all                          releases every held request (staging stop procedure)
 *   FAKE_WORKER_HOLD_MAX_MS                         a held request is released after this long anyway (default: never)
 *   GET  /_ctl/log                                  every request received, in order
 *   GET  /_ctl/waiting?jobId=&route=                number of requests currently held
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_WORKER_PORT ?? process.env.PORT ?? 8790);
const VERSION = process.env.FAKE_WORKER_VERSION ?? 'football-cv/0.7.0-reh';
const MODELS = JSON.parse(process.env.FAKE_WORKER_MODELS ?? '{"detector":"yolox-reh","ocr":"parseq-reh"}');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

const plans = new Map(); // `${jobId}|${route}` -> [{action, times}]
const held = new Map(); // key -> [resolveFn]
const log = [];

function report(jobId) {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.0.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 60, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 60, nonMatchSec: 0, offPitchSec: 0, matchSec: 60, unobservedSec: 0, analysedSec: 60,
      confirmedVisibleSec: 10, likelyVisibleSec: 10, ambiguousSec: 10, notIdentifiedSec: 30 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 10 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'too little', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 0, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [],
    reviewQuestions: [{ t: 12.3, box: [1, 2, 30, 90], affectedSec: 20, currentlyTarget: false, score: 0.5, imageJpegBase64: JPEG }],
    referenceImageJpegBase64: JPEG,
    analysedRange: { startSec: 0, endSec: 60, parts: 1 },
    // R4: the worker CLAIMS a measured whole-match observation on 300 s confirmed; the server must check the timeline.
    offball: { status: 'measured', confirmedSec: 300, minConfirmedSec: 60, measuredSec: 240,
      nearestOpponentBodyHeights: { median: 2.2, p25: 1.1, p75: 3.4 }, nearestTeammateBodyHeights: { median: 2.9 },
      freeShare: 0.3, tightShare: 0.1, freeEpisodes: [{ start: 12, end: 15 }], tightEpisodes: [] },
    moments: [{ id: 'm_1', kind: 'spell', kinds: ['spell'], start: 11, end: 18, clipStart: 10, clipEnd: 19, identityState: 'CONFIRMED_VISIBLE',
      candidate: false, indicator: [[11, 0.4, 0.3, 0.05, 0.2], [12, 0.41, 0.3, 0.05, 0.2]], imageJpegBase64: JPEG }],
    rehearsalJob: jobId,
  };
}

/**
 * R4 timelines (uploaded identity samples). Default: 1 sample/s, 10 s CONFIRMED. p4_* jobs: 20 samples/s
 * (the server clamps its step to >= 50 ms), so exact boundary values are representable inside the 60 s recording.
 */
function timelineFor(jobId) {
  const C = 'CONFIRMED_VISIBLE';
  const seq = (t0, n, state = C, step = 0.05) => Array.from({ length: n }, (_, i) => [Math.round((t0 + i * step) * 1000) / 1000, state]);
  const pick = {
    p4_below: () => seq(0, 1190),                                   // 59.5 s
    p4_exact: () => seq(0, 1200),                                   // 60.0 s
    p4_above: () => seq(0, 1210),                                   // 60.5 s (last sample at 60.45 s, inside the 0.5 s tolerance)
    p4_overlap: () => [...seq(0, 700), ...seq(0, 700)],             // the same 35 s uploaded twice -> 35 s
    p4_gap: () => [...seq(0, 500), ...seq(35, 500)],                // 25 s + 25 s around a 10 s hole -> 50 s
    p4_likely: () => [...seq(0, 1000), ...seq(30, 600, 'LIKELY_VISIBLE')], // 30 s confirmed + likely/conflicting samples
  }[jobId.replace(/_[a-z0-9]{4}$/, '')];
  if (pick) {
    const rows = pick();
    return { times: rows.map((r) => r[0]), states: rows.map((r) => r[1]) };
  }
  const times = Array.from({ length: 61 }, (_, i) => i);
  const states = times.map((t) => (t >= 10 && t < 20 ? C : t >= 20 && t < 30 ? 'LIKELY_VISIBLE' : 'UNKNOWN'));
  return { times, states };
}

function nextAction(jobId, route) {
  const list = plans.get(`${jobId}|${route}`) ?? [];
  while (list.length && list[0].times === 0) list.shift();
  if (!list.length) return 'ok';
  const step = list[0];
  if (step.times !== undefined) step.times -= 1;
  return step.action;
}

async function readSource(url) {
  // Proves the worker reads the job's own source from the local Storage emulator (bytes only counted).
  const local = typeof url === 'string' && (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:'));
  // Staging (Cloud Run): only the job's own signed Storage URL may be read (FAKE_WORKER_ALLOW_GCS=1).
  const gcs = process.env.FAKE_WORKER_ALLOW_GCS === '1' && typeof url === 'string' && url.startsWith('https://storage.googleapis.com/');
  if (!local && !gcs) return { ok: false, bytes: 0, url: typeof url === 'string' ? url.split('?')[0] : null };
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
    const b = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, bytes: b.length };
  } catch (e) {
    return { ok: false, bytes: 0, error: String(e) };
  }
}

function body(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/_ctl/log') return send(res, 200, log);
  if (req.method === 'GET' && url.pathname === '/_ctl/waiting') {
    return send(res, 200, { waiting: (held.get(`${url.searchParams.get('jobId')}|${url.searchParams.get('route')}`) ?? []).length });
  }
  const b = await body(req);
  if (url.pathname === '/_ctl/plan') {
    const key = `${b.jobId}|${b.route}`;
    plans.set(key, [...(plans.get(key) ?? []), { action: b.action, times: b.times }]);
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/_ctl/release-all') {
    let n = 0;
    for (const [k, fns] of held) { held.set(k, []); for (const f of fns) { f(); n += 1; } }
    return send(res, 200, { released: n });
  }
  if (url.pathname === '/_ctl/release') {
    const key = `${b.jobId}|${b.route}`;
    const fns = held.get(key) ?? [];
    held.set(key, []);
    for (const f of fns) f();
    return send(res, 200, { released: fns.length });
  }
  const m = /^\/v3\/tracking:(extract|discover|resolve)$/.exec(url.pathname);
  if (req.method !== 'POST' || !m) return send(res, 404, { error: 'not found' });
  const route = m[1];
  const jobId = String(b.jobId ?? '');
  const action = nextAction(jobId, route);
  const entry = { at: new Date().toISOString(), route, jobId, action, segmentIndex: b.segmentIndex ?? null, chunkIndex: b.chunkIndex ?? null,
    feedbackEntries: Array.isArray(b.feedback?.entries) ? b.feedback.entries.length : null, privacy: b.privacy ?? null };
  log.push(entry);
  if (route !== 'resolve') entry.source = await readSource(b.source?.url);
  if (action === 'hold') {
    await new Promise((resolve) => {
      const key = `${jobId}|${route}`;
      held.set(key, [...(held.get(key) ?? []), resolve]);
      // Bounded hold (staging): a forgotten release cannot keep a task function running until its timeout.
      const cap = Number(process.env.FAKE_WORKER_HOLD_MAX_MS ?? 0);
      if (cap > 0) setTimeout(() => { held.set(key, (held.get(key) ?? []).filter((f) => f !== resolve)); entry.autoReleased = true; resolve(); }, cap).unref?.();
    });
    entry.releasedAt = new Date().toISOString();
  }
  if (action === 'fail') return send(res, 500, { error: 'rehearsal failure' });
  if (route === 'extract') return send(res, 200, { status: 'complete', processingSec: 1.5 });
  if (route === 'discover') {
    return send(res, 200, { status: 'complete', processingSec: 1, moments: [{ id: 'd_1', kind: 'sighting', evidence: 'number_read',
      identityState: 'CONFIRMED_VISIBLE', number: '20', readFrames: 2, start: (b.startSec ?? 0) + 1, clipStart: b.startSec ?? 0,
      clipEnd: (b.startSec ?? 0) + 4, indicator: [[(b.startSec ?? 0) + 1, 0.5, 0.4, 0.05, 0.2]], imageJpegBase64: JPEG }] });
  }
  const models = action === 'wrong_models' ? { ...MODELS, detector: 'unapproved' } : MODELS;
  const workerVersion = action === 'wrong_version' ? `${VERSION}-unapproved` : VERSION;
  const { times, states } = timelineFor(jobId);
  return send(res, 200, { report: report(jobId), timeline: { times, states }, workerVersion, models });
}).listen(PORT, process.env.FAKE_WORKER_HOST ?? '127.0.0.1', () => console.log(`fake worker on ${process.env.FAKE_WORKER_HOST ?? '127.0.0.1'}:${PORT} version ${VERSION}`));
