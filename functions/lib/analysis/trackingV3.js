"use strict";
/**
 * Player tracking v3: server-side contract, validation and owner callables.
 *
 * The GPU worker (workers/football-cv, scoutx_tracker) returns a `pitchproof.tracking.v3` report.
 * Functions re-validates it here - shape, bounds and the numerical invariants - and persists a
 * TARGET-ONLY view at matchAnalysisJobs/{jobId}/tracking/current. Other players' tracklets, number
 * reads and exclusion lists never reach Firestore.
 *
 * Identity corrections ("yes / not me / unsure / skip") are stored per job in
 * tracking/feedback, mark the current report stale (dependent stats are invalidated immediately)
 * and are used only for this match. They are never used as model-training data.
 *
 * Nothing here enables the worker: calling it still requires the existing approval gates
 * (cvWorkerStatus() === 'available') plus TRACKING_V3_ENABLED=true.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSWERS = exports.MAX_CLIP_SEC = exports.MAX_MOMENTS = exports.MOMENT_KINDS = exports.IDENTITY_STATES = exports.TRACKING_COLLECTION = exports.TRACKING_SCHEMA = void 0;
exports.decodeReviewImage = decodeReviewImage;
exports.reviewImagePath = reviewImagePath;
exports.trackingInvariantViolations = trackingInvariantViolations;
exports.parseTrackingReport = parseTrackingReport;
exports.parseMoments = parseMoments;
exports.encodeStateStrip = encodeStateStrip;
exports.emptyFeedback = emptyFeedback;
exports.applyAnswer = applyAnswer;
exports.answerTarget = answerTarget;
exports.undoLast = undoLast;
exports.workerFeedback = workerFeedback;
exports.validPeriods = validPeriods;
exports.trackingV3Enabled = trackingV3Enabled;
exports.TRACKING_SCHEMA = 'pitchproof.tracking.v3';
exports.TRACKING_COLLECTION = 'tracking';
exports.IDENTITY_STATES = [
    'CONFIRMED_VISIBLE', 'LIKELY_VISIBLE', 'AMBIGUOUS', 'OFF_CAMERA', 'CONFIRMED_OFF_PITCH', 'NON_MATCH_PERIOD', 'UNKNOWN',
];
const EVENT_TYPES = ['contact', 'carry', 'pass_attempt', 'duel_candidate', 'tackle_candidate'];
exports.MOMENT_KINDS = ['contact', 'carry', 'pass_attempt', 'duel_candidate', 'tackle_candidate', 'spell'];
exports.MAX_MOMENTS = 80;
exports.MAX_CLIP_SEC = 20;
/** Decodes the worker's small review-card JPEGs (bounded size, JPEG magic bytes checked). */
function decodeReviewImage(b64) {
    if (typeof b64 !== 'string' || b64.length === 0 || b64.length > 200_000 || !/^[A-Za-z0-9+/=]+$/.test(b64))
        return null;
    const buf = Buffer.from(b64, 'base64');
    return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? buf : null;
}
function reviewImagePath(uid, jobId, name) {
    return `profiles/${uid}/matchFootage/${jobId}/tracking/${name.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nonNeg = (v) => isNum(v) && v >= 0;
const EPS = 0.6;
function asRecord(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}
/** Numerical invariants the report must satisfy (mirrors scoutx_tracker/invariants.py). */
function trackingInvariantViolations(r) {
    const v = [];
    const c = r.coverage;
    if (Math.abs(c.nonMatchSec + c.offPitchSec + c.matchSec - c.recordingSec) > EPS)
        v.push('coverage_partition');
    if (Math.abs(c.unobservedSec + c.analysedSec - c.matchSec) > EPS)
        v.push('coverage_match');
    if (Math.abs(c.confirmedVisibleSec + c.likelyVisibleSec + c.ambiguousSec + c.notIdentifiedSec - c.analysedSec) > EPS) {
        v.push('coverage_states');
    }
    const peak = r.physical.values.peakSpeed?.value ?? null;
    for (const run of [...r.physical.sprints, ...r.physical.highSpeedRuns]) {
        if (peak !== null && run.peakKmh > peak + 0.05)
            v.push('peak_inconsistent');
        if (run.start < 0 || run.end < run.start || run.end > c.recordingSec + EPS)
            v.push('run_bounds');
    }
    if ((r.physical.values.sprintCount?.value ?? r.physical.sprints.length) !== r.physical.sprints.length)
        v.push('sprint_count');
    if (r.physical.productionVisible && r.physical.status !== 'calibrated')
        v.push('uncalibrated_visible');
    for (const e of r.events) {
        if (e.start < 0 || e.end < e.start || e.end > c.recordingSec + EPS)
            v.push('event_bounds');
        if (e.outcome === 'completed' && e.outcomeEvidence !== 'verified')
            v.push('unverified_completed_pass');
    }
    if (r.ball.completedPasses + r.ball.incompletePasses + r.ball.unknownOutcomePasses !== r.ball.passAttempts)
        v.push('pass_partition');
    return [...new Set(v)];
}
function parseRuns(raw) {
    if (!Array.isArray(raw) || raw.length > 500)
        return null;
    const out = [];
    for (const item of raw) {
        const r = asRecord(item);
        if (!r || !nonNeg(r.start) || !nonNeg(r.end) || !nonNeg(r.durationSec) || !nonNeg(r.peakKmh) || !nonNeg(r.distanceM))
            return null;
        out.push({ start: r.start, end: r.end, durationSec: r.durationSec, peakKmh: r.peakKmh, distanceM: r.distanceM });
    }
    return out;
}
/**
 * Builds the target-only persisted report from the worker's raw v3 output. Returns null for
 * anything malformed or internally inconsistent - an inconsistent report is never shown.
 */
function parseTrackingReport(raw, timeline) {
    const r = asRecord(raw);
    if (!r || r.schema !== exports.TRACKING_SCHEMA)
        return null;
    const cov = asRecord(r.coverage);
    const keys = ['recordingSec', 'nonMatchSec', 'offPitchSec', 'matchSec', 'unobservedSec',
        'analysedSec', 'confirmedVisibleSec', 'likelyVisibleSec', 'ambiguousSec', 'notIdentifiedSec'];
    if (!cov || !keys.every((k) => nonNeg(cov[k])))
        return null;
    const coverage = Object.fromEntries(keys.map((k) => [k, cov[k]]));
    const target = asRecord(r.target);
    const phys = asRecord(r.physical);
    const ball = asRecord(r.ball);
    const ident = asRecord(r.identity);
    const tl = asRecord(r.timeline);
    if (!target || !phys || !ball || !ident || !tl || !Array.isArray(tl.periods))
        return null;
    const periods = [];
    for (const p of tl.periods) {
        const pr = asRecord(p);
        if (!pr || !nonNeg(pr.start) || !nonNeg(pr.end) || pr.end < pr.start
            || !['play', 'non_play', 'unobserved'].includes(String(pr.kind)))
            return null;
        periods.push({ start: pr.start, end: pr.end, kind: pr.kind,
            label: String(pr.label).slice(0, 40), source: pr.source === 'user' ? 'user' : 'detected' });
    }
    const statesRaw = asRecord(ident.statesSec) ?? {};
    const statesSec = {};
    for (const s of exports.IDENTITY_STATES)
        if (nonNeg(statesRaw[s]))
            statesSec[s] = statesRaw[s];
    const valuesRaw = asRecord(phys.values) ?? {};
    const values = {};
    for (const [k, item] of Object.entries(valuesRaw)) {
        const m = asRecord(item);
        if (!m)
            return null;
        const provenance = String(m.provenance);
        if (!['calibrated', 'estimate_experimental', 'unavailable'].includes(provenance))
            return null;
        if (m.value !== null && !isNum(m.value))
            return null;
        values[k] = { value: m.value, unit: String(m.unit).slice(0, 12), provenance,
            method: String(m.method ?? '').slice(0, 300), ...(m.note ? { note: String(m.note).slice(0, 200) } : {}) };
    }
    const sprints = parseRuns(phys.sprints);
    const highSpeedRuns = parseRuns(phys.highSpeedRuns);
    const thresholds = asRecord(phys.thresholds);
    if (!sprints || !highSpeedRuns || !thresholds || !nonNeg(thresholds.sprint_kmh) || !nonNeg(thresholds.hsr_kmh))
        return null;
    const status = String(phys.status);
    if (!['calibrated', 'experimental', 'unavailable'].includes(status))
        return null;
    const events = [];
    if (!Array.isArray(r.events) || r.events.length > 2000)
        return null;
    for (const item of r.events) {
        const e = asRecord(item);
        if (!e || !EVENT_TYPES.includes(String(e.type)) || !nonNeg(e.start) || !nonNeg(e.end)
            || !exports.IDENTITY_STATES.includes(e.identityState) || !isNum(e.confidence))
            return null;
        // Only events on the target's claimed frames are kept.
        if (!['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE'].includes(String(e.identityState)))
            continue;
        events.push({
            type: e.type, start: e.start, end: e.end,
            identityState: e.identityState,
            ...(e.outcome ? { outcome: (['completed', 'incomplete'].includes(String(e.outcome)) ? e.outcome : 'unknown') } : {}),
            ...(e.outcomeEvidence ? { outcomeEvidence: String(e.outcomeEvidence).slice(0, 60) } : {}),
            evidenceTimes: Array.isArray(e.evidenceTimes) ? e.evidenceTimes.filter(nonNeg).slice(0, 8) : [],
            confidence: Math.max(0, Math.min(1, e.confidence)),
            ...(String(e.type).endsWith('_candidate') ? { candidate: true } : {}),
        });
    }
    const counts = (k) => (nonNeg(ball[k]) ? Math.floor(ball[k]) : 0);
    const questions = [];
    for (const item of Array.isArray(r.reviewQuestions) ? r.reviewQuestions.slice(0, 12) : []) {
        const q = asRecord(item);
        const box = q?.box;
        if (!q || !nonNeg(q.t) || !Array.isArray(box) || box.length !== 4 || !box.every(nonNeg) || !nonNeg(q.affectedSec))
            return null;
        questions.push({ id: `q_${Math.round(q.t * 10)}_${Math.round(box[0])}`, t: q.t,
            box: box, affectedSec: q.affectedSec,
            currentlyTarget: q.currentlyTarget === true, score: isNum(q.score) ? q.score : 0, imagePath: null });
    }
    const moments = parseMoments(r.moments, coverage.recordingSec);
    if (!moments)
        return null;
    const range = asRecord(r.analysedRange);
    const analysedRange = range && nonNeg(range.startSec) && nonNeg(range.endSec) && nonNeg(range.parts)
        && range.endSec >= range.startSec
        ? { startSec: range.startSec, endSec: range.endSec, parts: Math.floor(range.parts) }
        : { startSec: 0, endSec: coverage.recordingSec, parts: 0 };
    const heatRaw = asRecord(r.heatmap);
    const report = {
        schema: exports.TRACKING_SCHEMA,
        engineVersion: String(asRecord(r.engine)?.version ?? 'unknown').slice(0, 40),
        target: { number: target.number ? String(target.number).slice(0, 3) : null, kit: String(target.kit ?? '').slice(0, 40),
            kit2: String(target.kit2 ?? '').slice(0, 40), position: String(target.position ?? 'unknown').slice(0, 30) },
        coverage, periods, statesSec,
        stateStrip: timeline ? encodeStateStrip(timeline.times, timeline.states) : [],
        physical: { status: status,
            productionVisible: phys.productionVisible === true && status === 'calibrated',
            reason: phys.reason ? String(phys.reason).slice(0, 300) : null, values, sprints, highSpeedRuns,
            thresholds: { sprint_kmh: thresholds.sprint_kmh, hsr_kmh: thresholds.hsr_kmh } },
        ball: { contacts: counts('contacts'), carries: counts('carries'), passAttempts: counts('passAttempts'),
            completedPasses: counts('completedPasses'), incompletePasses: counts('incompletePasses'),
            unknownOutcomePasses: counts('unknownOutcomePasses'), contactsConfirmedIdentity: counts('contactsConfirmedIdentity'),
            duelCandidates: counts('duelCandidates'), tackleCandidates: counts('tackleCandidates'), provenance: 'model_estimate_unvalidated' },
        events,
        moments,
        analysedRange,
        videoSize: (() => {
            const v = asRecord(r.videoSize);
            return v && isNum(v.width) && isNum(v.height) && v.width > 0 && v.height > 0 && v.width <= 8192 && v.height <= 8192
                ? { width: v.width, height: v.height } : null;
        })(),
        reviewQuestions: questions,
        identity: { numberSightings: nonNeg(ident.numberSightings) ? ident.numberSightings : 0,
            confirmedByUser: nonNeg(ident.confirmedByUser) ? ident.confirmedByUser : 0 },
        heatmap: heatRaw && heatRaw.status === 'observed_only' ? { status: 'observed_only' }
            : { status: 'unavailable', reason: String(heatRaw?.reason ?? 'No validated pitch calibration for this recording.').slice(0, 200) },
    };
    return trackingInvariantViolations(report).length === 0 ? report : null;
}
/**
 * Validates the worker's moments. Anything not on claimed target frames, outside the recording,
 * longer than MAX_CLIP_SEC or of an unknown kind invalidates the whole report (never shown).
 */
function parseMoments(raw, recordingSec) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw) || raw.length > exports.MAX_MOMENTS)
        return null;
    const out = [];
    const ids = new Set();
    for (const item of raw) {
        const m = asRecord(item);
        if (!m || typeof m.id !== 'string' || !/^m_[0-9]{1,6}$/.test(m.id) || ids.has(m.id))
            return null;
        if (!exports.MOMENT_KINDS.includes(m.kind))
            return null;
        if (!['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE'].includes(String(m.identityState)))
            return null;
        if (![m.start, m.end, m.clipStart, m.clipEnd].every(nonNeg))
            return null;
        const [start, end, c0, c1] = [m.start, m.end, m.clipStart, m.clipEnd];
        if (end < start || c1 < c0 || c1 - c0 > exports.MAX_CLIP_SEC + 0.01 || (recordingSec > 0 && c1 > recordingSec + 0.5))
            return null;
        const kinds = Array.isArray(m.kinds) ? m.kinds.filter((k) => exports.MOMENT_KINDS.includes(k)) : [];
        const candidate = m.candidate === true;
        // A candidate flag must agree with the kind: duel/tackle candidates are never presented as actions.
        if (candidate !== String(m.kind).endsWith('_candidate'))
            return null;
        const indicator = [];
        for (const p of Array.isArray(m.indicator) ? m.indicator.slice(0, 60) : []) {
            if (!Array.isArray(p) || p.length !== 5 || !p.every(isNum))
                return null;
            const [t, x, y, w, h] = p;
            if (t < c0 - 0.01 || t > c1 + 0.01 || [x, y, w, h].some((v) => v < -0.05 || v > 1.05))
                return null;
            indicator.push([t, x, y, w, h]);
        }
        ids.add(m.id);
        out.push({ id: m.id, kind: m.kind, kinds: kinds.length ? kinds : [m.kind], start, end,
            clipStart: c0, clipEnd: c1, identityState: m.identityState, candidate,
            ...(m.outcome ? { outcome: (['completed', 'incomplete'].includes(String(m.outcome)) ? m.outcome : 'unknown') } : {}),
            indicator, imagePath: null });
    }
    return out.sort((a, b) => a.clipStart - b.clipStart);
}
/** Per-second majority state, run-length encoded: [startSec, endSec, state]. */
function encodeStateStrip(times, states) {
    const out = [];
    if (times.length !== states.length || times.length === 0)
        return out;
    let sec = Math.floor(times[0]);
    let bucket = {};
    const flush = () => {
        const entries = Object.entries(bucket);
        if (!entries.length)
            return;
        const best = entries.sort((a, b) => b[1] - a[1])[0][0];
        const last = out[out.length - 1];
        if (last && last[2] === best && last[1] === sec)
            last[1] = sec + 1;
        else
            out.push([sec, sec + 1, best]);
    };
    for (let i = 0; i < times.length; i += 1) {
        const s = Math.floor(times[i]);
        if (s !== sec) {
            flush();
            bucket = {};
            sec = s;
        }
        const st = exports.IDENTITY_STATES.includes(states[i]) ? states[i] : 'UNKNOWN';
        bucket[st] = (bucket[st] ?? 0) + 1;
    }
    flush();
    return out;
}
// ---------------------------------------------------------------------------- feedback model
exports.ANSWERS = ['yes', 'not_me', 'unsure', 'skip'];
function emptyFeedback() {
    return { entries: [], periods: {}, offPitch: [] };
}
/** Applies one answer idempotently. Returns null if the question is unknown. */
function applyAnswer(feedback, report, questionId, answer, operationId, now) {
    if (feedback.entries.some((e) => e.operationId === operationId))
        return feedback;
    const target = answerTarget(report, questionId);
    if (!target)
        return null;
    const entries = feedback.entries.filter((e) => e.questionId !== questionId);
    return { ...feedback, entries: [...entries, { questionId, answer, t: target.t, point: target.point, operationId, at: now }].slice(-500) };
}
/**
 * Where an identity answer points: a review question's box, or - "Is this you?" asked while
 * watching a moment - the moment's target indicator sample nearest the middle of the action.
 * The answer is per-match feedback only (never training data).
 */
function answerTarget(report, id) {
    const q = report.reviewQuestions.find((item) => item.id === id);
    if (q)
        return { t: q.t, point: [(q.box[0] + q.box[2]) / 2, (q.box[1] + q.box[3]) / 2] };
    const m = (report.moments ?? []).find((item) => item.id === id);
    if (!m || !report.videoSize || m.indicator.length === 0)
        return null;
    const mid = (m.start + m.end) / 2;
    const s = m.indicator.reduce((best, p) => (Math.abs(p[0] - mid) < Math.abs(best[0] - mid) ? p : best));
    const { width, height } = report.videoSize;
    return { t: s[0], point: [(s[1] + s[3] / 2) * width, (s[2] + s[4] / 2) * height] };
}
function undoLast(feedback) {
    return { ...feedback, entries: feedback.entries.slice(0, -1) };
}
/** Feedback in the worker's format: yes/no points; unsure and skip carry no identity evidence. */
function workerFeedback(feedback) {
    const pt = (e) => [e.t, e.point[0], e.point[1]];
    return {
        yes: feedback.entries.filter((e) => e.answer === 'yes').map(pt),
        no: feedback.entries.filter((e) => e.answer === 'not_me').map(pt),
        periods: feedback.periods,
        offPitch: feedback.offPitch,
        // Unsure/skip carry no identity evidence; they only stop the same player being asked again.
        asked: feedback.entries.filter((e) => e.answer === 'unsure' || e.answer === 'skip').map(pt),
    };
}
function validPeriods(p, durationSec) {
    const vals = [p.kickoff, p.halftimeStart, p.secondHalfStart, p.fulltime];
    if (!vals.every((x) => x === undefined || (nonNeg(x) && x <= durationSec)))
        return false;
    const ordered = vals.filter((x) => x !== undefined);
    for (let i = 1; i < ordered.length; i += 1)
        if (ordered[i] <= ordered[i - 1])
            return false;
    return (p.halftimeStart === undefined) === (p.secondHalfStart === undefined);
}
function trackingV3Enabled(env = process.env) {
    return env.TRACKING_V3_ENABLED?.trim() === 'true';
}
//# sourceMappingURL=trackingV3.js.map