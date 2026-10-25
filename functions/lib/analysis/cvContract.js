"use strict";
/**
 * Contract v2 between Cloud Functions and the GPU computer-vision worker
 * (reference implementation: workers/football-cv). One request covers one 10-minute segment.
 * Every response is validated here; anything malformed is discarded, never patched up.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CV_SAMPLE_FPS = exports.CV_CAMERA_VIEWS = exports.CV_EVENT_TYPES = exports.CV_STAGE_STATES = exports.CV_IDENTITY_STATES = exports.CV_AVAILABILITY_STATES = exports.CV_CONTRACT_VERSION = void 0;
exports.targetOnlyCvResult = targetOnlyCvResult;
exports.buildCvRequest = buildCvRequest;
exports.parseCvSegmentResult = parseCvSegmentResult;
exports.hasConfirmedEventCoverage = hasConfirmedEventCoverage;
exports.reportWindowsFromCv = reportWindowsFromCv;
exports.CV_CONTRACT_VERSION = 2;
exports.CV_AVAILABILITY_STATES = [
    'CONFIRMED_VISIBLE',
    'LIKELY_ACTIVE_OFF_CAMERA',
    'CONFIRMED_OFF_PITCH',
    'UNKNOWN',
];
exports.CV_IDENTITY_STATES = ['CONFIRMED_VISIBLE', 'CANDIDATE', 'UNKNOWN'];
exports.CV_STAGE_STATES = ['complete', 'failed', 'unavailable'];
exports.CV_EVENT_TYPES = ['shot', 'pass', 'dribble', 'tackle', 'save', 'duel', 'other'];
exports.CV_CAMERA_VIEWS = ['wide', 'medium', 'close', 'replay', 'non_play', 'unclear'];
exports.CV_SAMPLE_FPS = 2;
/** Candidate descriptions may belong to teammates/opponents; never retain them. */
function targetOnlyCvResult(result) {
    return { ...result, identity: { state: result.identity.state, candidates: [] } };
}
function buildCvRequest(params) {
    const text = (value, max = 40) => (typeof value === 'string' ? value.slice(0, max) : '');
    return {
        contractVersion: exports.CV_CONTRACT_VERSION,
        jobId: params.jobId,
        segmentIndex: params.segment.index,
        startSec: params.segment.startSec,
        endSec: params.segment.endSec,
        source: params.source,
        target: {
            jerseyNumber: text(params.targeting.jerseyNumber, 3),
            kitPrimaryColor: text(params.targeting.kitPrimaryColor),
            kitSecondaryColor: text(params.targeting.kitSecondaryColor),
            teamSide: text(params.targeting.teamSide, 10) || 'unknown',
            position: text(params.targeting.position, 12) || 'unknown',
        },
        sampling: { fps: exports.CV_SAMPLE_FPS },
        privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
    };
}
function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function finite(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function unit(value) {
    const n = finite(value);
    return n !== null && n >= 0 && n <= 1 ? n : null;
}
function within(value, start, end) {
    const n = finite(value);
    return n !== null && n >= start - 0.5 && n <= end + 0.5 ? Math.min(end, Math.max(start, n)) : null;
}
function member(value, allowed) {
    return typeof value === 'string' && allowed.includes(value) ? value : null;
}
/** Returns null for anything that does not match the contract exactly. */
function parseCvSegmentResult(value, expected) {
    if (!isObject(value) || value.contractVersion !== exports.CV_CONTRACT_VERSION)
        return null;
    if (value.segmentIndex !== expected.segmentIndex)
        return null;
    const workerVersion = typeof value.workerVersion === 'string' ? value.workerVersion.slice(0, 40) : '';
    if (!workerVersion)
        return null;
    const models = {};
    for (const [key, model] of Object.entries(isObject(value.models) ? value.models : {}).slice(0, 8)) {
        if (typeof model === 'string' && key.length <= 40)
            models[key] = model.slice(0, 120);
    }
    const { startSec, endSec } = expected;
    if (!Number.isInteger(expected.segmentIndex) || expected.segmentIndex < 0
        || !Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec)
        return null;
    const rawStages = isObject(value.stages) ? value.stages : {};
    const stages = {
        tracking: member(rawStages.tracking, exports.CV_STAGE_STATES) ?? 'unavailable',
        identity: member(rawStages.identity, exports.CV_STAGE_STATES) ?? 'unavailable',
        events: member(rawStages.events, exports.CV_STAGE_STATES) ?? 'unavailable',
        pitch: member(rawStages.pitch, exports.CV_STAGE_STATES) ?? 'unavailable',
    };
    const rawIdentity = isObject(value.identity) ? value.identity : {};
    const candidates = [];
    for (const item of Array.isArray(rawIdentity.candidates) ? rawIdentity.candidates.slice(0, 10) : []) {
        if (!isObject(item))
            continue;
        const firstSec = within(item.firstSec, startSec, endSec);
        const lastSec = within(item.lastSec, startSec, endSec);
        const jerseyConfidence = unit(item.jerseyConfidence);
        const teamMatch = unit(item.teamMatch);
        if (typeof item.trackId !== 'string' || firstSec === null || lastSec === null || lastSec < firstSec)
            continue;
        if (jerseyConfidence === null || teamMatch === null)
            continue;
        candidates.push({
            trackId: item.trackId.slice(0, 40),
            jerseyRead: typeof item.jerseyRead === 'string' && /^[0-9]{1,3}$/.test(item.jerseyRead) ? item.jerseyRead : null,
            jerseyConfidence,
            teamMatch,
            firstSec,
            lastSec,
        });
    }
    const availability = [];
    for (const item of Array.isArray(value.availability) ? value.availability.slice(0, 200) : []) {
        if (!isObject(item))
            continue;
        const start = within(item.startSec, startSec, endSec);
        const end = within(item.endSec, startSec, endSec);
        const state = member(item.state, exports.CV_AVAILABILITY_STATES);
        const confidence = unit(item.confidence);
        if (start === null || end === null || end < start || !state || confidence === null)
            continue;
        availability.push({ startSec: start, endSec: end, state, confidence });
    }
    availability.sort((a, b) => a.startSec - b.startSec);
    for (let i = 1; i < availability.length; i += 1) {
        if (availability[i].startSec < availability[i - 1].endSec)
            return null;
    }
    const rawCoverage = isObject(value.coverage) ? value.coverage : {};
    const segmentLength = endSec - startSec;
    const analysedSec = finite(rawCoverage.analysedSec);
    const targetVisibleSec = finite(rawCoverage.targetVisibleSec);
    const framesDecoded = finite(rawCoverage.framesDecoded);
    if (analysedSec === null || targetVisibleSec === null || framesDecoded === null)
        return null;
    if (analysedSec < 0 || analysedSec > segmentLength + 1 || targetVisibleSec < 0 || targetVisibleSec > analysedSec
        || !Number.isSafeInteger(framesDecoded) || framesDecoded < 0)
        return null;
    const identityState = member(rawIdentity.state, exports.CV_IDENTITY_STATES) ?? 'UNKNOWN';
    const visibleSec = availability.filter((window) => window.state === 'CONFIRMED_VISIBLE')
        .reduce((sum, window) => sum + window.endSec - window.startSec, 0);
    if (Math.abs(visibleSec - targetVisibleSec) > 0.01)
        return null;
    if ((visibleSec > 0 || identityState === 'CONFIRMED_VISIBLE')
        && (stages.tracking !== 'complete' || stages.identity !== 'complete' || identityState !== 'CONFIRMED_VISIBLE'))
        return null;
    if (framesDecoded === 0 && (analysedSec > 0 || targetVisibleSec > 0))
        return null;
    const events = [];
    for (const item of Array.isArray(value.events) ? value.events.slice(0, 100) : []) {
        if (!isObject(item))
            continue;
        const type = member(item.type, exports.CV_EVENT_TYPES);
        const start = within(item.startSec, startSec, endSec);
        const end = within(item.endSec, startSec, endSec);
        const confidence = unit(item.confidence);
        if (!type || start === null || end === null || end <= start || confidence === null)
            continue;
        const frameTimesSec = (Array.isArray(item.frameTimesSec) ? item.frameTimesSec : [])
            .map((time) => within(time, startSec, endSec))
            .filter((time) => time !== null && time >= start && time <= end)
            .slice(0, 8);
        if (frameTimesSec.length === 0)
            continue;
        events.push({ type, startSec: start, endSec: end, confidence, frameTimesSec });
    }
    return {
        contractVersion: exports.CV_CONTRACT_VERSION,
        workerVersion,
        models,
        segmentIndex: expected.segmentIndex,
        stages,
        cameraView: member(value.cameraView, exports.CV_CAMERA_VIEWS) ?? 'unclear',
        identity: { state: identityState, candidates },
        availability,
        coverage: { analysedSec, targetVisibleSec, framesDecoded: Math.round(framesDecoded) },
        events: stages.events === 'complete' ? events : [],
    };
}
/** Strong event claims require continuous confirmed-target evidence for the whole interval. */
function hasConfirmedEventCoverage(result, event) {
    if (result.identity.state !== 'CONFIRMED_VISIBLE' || result.stages.tracking !== 'complete'
        || result.stages.identity !== 'complete' || result.stages.events !== 'complete')
        return false;
    let cursor = event.startSec;
    for (const window of result.availability) {
        if (window.endSec <= cursor)
            continue;
        if (window.startSec > cursor || window.state !== 'CONFIRMED_VISIBLE')
            return false;
        cursor = window.endSec;
        if (cursor >= event.endSec)
            return event.frameTimesSec.length > 0
                && event.frameTimesSec.every((time) => time >= event.startSec && time <= event.endSec);
    }
    return false;
}
/** Lower-case availability windows used by the report; UNKNOWN fills every gap. */
function reportWindowsFromCv(results, durationSec) {
    const windows = results
        .flatMap((result) => result.availability)
        .filter((window) => window.state !== 'UNKNOWN')
        .sort((a, b) => a.startSec - b.startSec);
    const out = [];
    let cursor = 0;
    const push = (startSec, endSec, state, confidence) => {
        out.push({
            id: `avail_${out.length}`,
            startSec,
            endSec,
            state,
            confidence,
            label: state === 'unknown' ? 'Unknown' : state.replace(/_/g, ' '),
            note: state === 'unknown' ? 'The tracker could not place the player here.' : 'From the computer-vision tracker.',
        });
    };
    for (const window of windows) {
        if (window.startSec > cursor)
            push(cursor, window.startSec, 'unknown', 0);
        push(window.startSec, window.endSec, window.state.toLowerCase(), window.confidence);
        cursor = Math.max(cursor, window.endSec);
    }
    if (durationSec > cursor)
        push(cursor, durationSec, 'unknown', 0);
    return out;
}
//# sourceMappingURL=cvContract.js.map