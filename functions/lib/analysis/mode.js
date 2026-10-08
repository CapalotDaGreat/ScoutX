"use strict";
/**
 * Analysis modes, shared verbatim by the app and Cloud Functions
 * (functions/src/analysis/mode.ts is a copy). The server re-derives the mode from the
 * duration it measured, so a client cannot push a 90-minute match through the clip path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIPELINE_VERSION = exports.SHORT_CLIP_SAMPLING = exports.MODE_LIMITS = exports.PROCESSING_MODES = exports.CLIP_CONTEXTS = exports.ANALYSIS_INTENTS = exports.ANALYSIS_MODES = void 0;
exports.isAnalysisMode = isAnalysisMode;
exports.isClipContext = isClipContext;
exports.parseIntent = parseIntent;
exports.selectAnalysisMode = selectAnalysisMode;
exports.processingModeFor = processingModeFor;
exports.shortClipSampleTimes = shortClipSampleTimes;
exports.ANALYSIS_MODES = ['SHORT_CLIP', 'MATCH_CLIP', 'FULL_MATCH', 'TRAINING_CLIP'];
exports.ANALYSIS_INTENTS = ['match', 'training'];
/** Optional "what happened" hint for short clips. `auto` lets the model classify. */
exports.CLIP_CONTEXTS = ['auto', 'shot', 'save', 'pass', 'dribble', 'tackle', 'defensive', 'other'];
/**
 * device_frames: the phone samples still frames and only those are uploaded; the video never
 * leaves the device. cloud_video: the video is uploaded for server-side extraction.
 */
exports.PROCESSING_MODES = ['device_frames', 'cloud_video'];
exports.MODE_LIMITS = {
    shortClipMaxSec: 60,
    matchClipMaxSec: 20 * 60,
    maxDurationSec: 150 * 60,
};
/** Dense sampling for short clips: about two frames per second, 8 to 32 frames. */
exports.SHORT_CLIP_SAMPLING = { perSecond: 2, minFrames: 8, maxFrames: 32 };
exports.PIPELINE_VERSION = '2026.10.2';
function isAnalysisMode(value) {
    return typeof value === 'string' && exports.ANALYSIS_MODES.includes(value);
}
function isClipContext(value) {
    return typeof value === 'string' && exports.CLIP_CONTEXTS.includes(value);
}
function parseIntent(value) {
    return value === 'training' ? 'training' : 'match';
}
function selectAnalysisMode(durationSec, intent = 'match') {
    if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > exports.MODE_LIMITS.maxDurationSec)
        return null;
    if (intent === 'training' && durationSec <= exports.MODE_LIMITS.matchClipMaxSec)
        return 'TRAINING_CLIP';
    if (durationSec <= exports.MODE_LIMITS.shortClipMaxSec)
        return 'SHORT_CLIP';
    if (durationSec <= exports.MODE_LIMITS.matchClipMaxSec)
        return 'MATCH_CLIP';
    return 'FULL_MATCH';
}
function processingModeFor(mode, durationSec) {
    if (mode === 'SHORT_CLIP')
        return 'device_frames';
    if (mode === 'TRAINING_CLIP' && durationSec <= exports.MODE_LIMITS.shortClipMaxSec)
        return 'device_frames';
    return 'cloud_video';
}
/** Evenly spaced sample times (seconds) covering the whole clip, first and last frame included. */
function shortClipSampleTimes(durationSec) {
    if (!Number.isFinite(durationSec) || durationSec <= 0)
        return [];
    const count = Math.max(exports.SHORT_CLIP_SAMPLING.minFrames, Math.min(exports.SHORT_CLIP_SAMPLING.maxFrames, Math.round(durationSec * exports.SHORT_CLIP_SAMPLING.perSecond)));
    const end = Math.max(0, durationSec - 0.1);
    const times = [];
    for (let index = 0; index < count; index += 1) {
        times.push(Math.round(((end * index) / (count - 1)) * 10) / 10);
    }
    return [...new Set(times)];
}
//# sourceMappingURL=mode.js.map