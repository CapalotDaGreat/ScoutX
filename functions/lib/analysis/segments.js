"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTION = exports.SEGMENT_SEC = void 0;
exports.planSegments = planSegments;
exports.selectExpression = selectExpression;
exports.extractionArgs = extractionArgs;
exports.parseShowinfoTimes = parseShowinfoTimes;
exports.frameIndexFor = frameIndexFor;
exports.pickFramesForModel = pickFramesForModel;
exports.segmentsSettled = segmentsSettled;
/** Full matches are processed in 10-minute segments, one Cloud Task each. */
exports.SEGMENT_SEC = 600;
exports.EXTRACTION = {
    /** Scene-change score that counts as a cut or a big camera move. */
    sceneThreshold: 0.3,
    /** Never pick two frames closer than this. */
    minSpacingSec: 8,
    /** Force a frame after this long without a scene change (static cameras). */
    forcedEverySec: 60,
    capPerSegment: 12,
    width: 640,
    /** Frames sent to the vision model per analysis, spread evenly over the match. */
    maxModelFrames: 18,
};
function planSegments(durationSec, segmentSec = exports.SEGMENT_SEC) {
    const total = Math.max(0, Math.floor(durationSec));
    const plans = [];
    for (let start = 0, index = 0; start < total; start += segmentSec, index += 1) {
        plans.push({ index, startSec: start, endSec: Math.min(total, start + segmentSec) });
    }
    return plans;
}
/**
 * ffmpeg select expression: the first frame, then frames that are both at least
 * `minSpacingSec` after the previous pick and either a scene change or `forcedEverySec` later.
 */
function selectExpression(config = exports.EXTRACTION) {
    const since = 't-prev_selected_t';
    return `isnan(prev_selected_t)+gte(${since},${config.minSpacingSec})*(gt(scene,${config.sceneThreshold})+gte(${since},${config.forcedEverySec}))`;
}
/** Argument array for one segment; no shell is involved. */
function extractionArgs(params) {
    const config = params.config ?? exports.EXTRACTION;
    return [
        '-hide_banner',
        '-loglevel', 'info',
        '-protocol_whitelist', 'http,https,tcp,tls',
        ...(params.headers ? ['-headers', params.headers] : []),
        '-ss', String(params.startSec),
        '-t', String(params.durationSec),
        '-i', params.sourceUrl,
        '-an',
        '-vf', `select='${selectExpression(config)}',showinfo,scale=${config.width}:-2`,
        '-vsync', 'vfr',
        '-frames:v', String(config.capPerSegment),
        '-q:v', '5',
        params.outputPattern,
    ];
}
/** Timestamps (seconds from segment start) of selected frames, from showinfo output. */
function parseShowinfoTimes(stderr) {
    const times = [];
    for (const line of stderr.split('\n')) {
        if (!line.includes('Parsed_showinfo'))
            continue;
        const match = /pts_time:\s*([0-9.]+)/.exec(line);
        if (match)
            times.push(Number(match[1]));
    }
    return times;
}
function frameIndexFor(segmentIndex, position) {
    return segmentIndex * 100 + position;
}
/** Evenly spaced subset by time, keeping the first and last frame. */
function pickFramesForModel(frames, max = exports.EXTRACTION.maxModelFrames) {
    const sorted = [...frames].sort((a, b) => a.timestampSec - b.timestampSec);
    if (sorted.length <= max)
        return sorted;
    if (max <= 1)
        return sorted.slice(0, max);
    const picked = new Set();
    for (let i = 0; i < max; i += 1)
        picked.add(Math.round((i * (sorted.length - 1)) / (max - 1)));
    return [...picked].sort((a, b) => a - b).map((index) => sorted[index]);
}
function segmentsSettled(segments) {
    return segments.length > 0 && segments.every((segment) => segment.state === 'complete' || segment.state === 'failed');
}
//# sourceMappingURL=segments.js.map