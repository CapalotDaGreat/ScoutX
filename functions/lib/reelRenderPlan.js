"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RENDER_DEADLINE_MS = exports.REEL_MAX_SEGMENTS = exports.REEL_MAX_SEC = void 0;
exports.outputSize = outputSize;
exports.buildSrt = buildSrt;
exports.buildRenderPlan = buildRenderPlan;
exports.segmentArgs = segmentArgs;
exports.concatArgs = concatArgs;
exports.coverArgs = coverArgs;
exports.isMissingAudio = isMissingAudio;
exports.classifyFfmpegError = classifyFfmpegError;
exports.REEL_MAX_SEC = 90;
exports.REEL_MAX_SEGMENTS = 20;
exports.RENDER_DEADLINE_MS = 480_000;
/** Output frame size; the short side is capped at 1080 px. */
function outputSize(aspect) {
    if (aspect === '16:9')
        return { width: 1920, height: 1080 };
    if (aspect === '1:1')
        return { width: 1080, height: 1080 };
    return { width: 1080, height: 1920 };
}
function round3(value) {
    return Math.round(value * 1000) / 1000;
}
function srtTime(totalSec) {
    const ms = Math.round(totalSec * 1000);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const rest = ms % 1000;
    const pad = (value, size = 2) => String(value).padStart(size, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}
/** Captions become a soft subtitle track, so no font files are needed on the server. */
function buildSrt(segments) {
    let cursor = 0;
    const cues = [];
    for (const segment of segments) {
        const text = segment.caption.replace(/\s+/g, ' ').trim();
        if (text) {
            cues.push(`${cues.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + segment.durationSec)}\n${text}\n`);
        }
        cursor += segment.durationSec;
    }
    return cues.length > 0 ? cues.join('\n') : null;
}
/**
 * Validates a reel against its media sources before any download or encode. A clip outside
 * its source duration is invalid; a source duration of 0 means unknown and is not checked.
 */
function buildRenderPlan(reel, sources) {
    if (reel.segments.length === 0)
        return { ok: false, code: 'no_segments' };
    if (reel.segments.length > exports.REEL_MAX_SEGMENTS)
        return { ok: false, code: 'too_long' };
    const segments = [];
    let totalSec = 0;
    for (const [index, segment] of reel.segments.entries()) {
        const source = sources.get(segment.mediaId) ?? null;
        if (!source)
            return { ok: false, code: 'missing_source', segmentIndex: index };
        const valid = Number.isFinite(segment.inSec) &&
            Number.isFinite(segment.outSec) &&
            segment.inSec >= 0 &&
            segment.outSec > segment.inSec &&
            (source.durationSec <= 0 || segment.outSec <= source.durationSec + 0.5);
        if (!valid)
            return { ok: false, code: 'invalid_clip', segmentIndex: index };
        const durationSec = round3(segment.outSec - segment.inSec);
        totalSec += durationSec;
        segments.push({
            index,
            mediaId: segment.mediaId,
            storagePath: source.storagePath,
            startSec: round3(segment.inSec),
            durationSec,
            caption: (segment.caption ?? '').slice(0, 120),
        });
    }
    if (totalSec > exports.REEL_MAX_SEC + 0.5)
        return { ok: false, code: 'too_long' };
    const coverIndex = Math.max(0, segments.findIndex((segment) => segment.mediaId === reel.coverMediaId));
    return {
        ok: true,
        plan: { ...outputSize(reel.aspectRatio), segments, totalSec: round3(totalSec), coverIndex, srt: buildSrt(segments) },
    };
}
/** One normalised segment: same size, frame rate and codecs so the concat demuxer can copy. */
function segmentArgs(input, output, segment, size, withAudio) {
    const video = `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`;
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(segment.startSec), '-t', String(segment.durationSec), '-i', input];
    if (withAudio) {
        args.push('-map', '0:v:0', '-map', '0:a:0');
    }
    else {
        args.push('-f', 'lavfi', '-t', String(segment.durationSec), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0');
    }
    args.push('-vf', video, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', output);
    return args;
}
function concatArgs(listFile, srtFile, output) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile];
    if (srtFile)
        args.push('-i', srtFile, '-map', '0:v', '-map', '0:a', '-map', '1:s', '-c:s', 'mov_text');
    args.push('-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', output);
    return args;
}
function coverArgs(input, atSec, output) {
    return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-q:v', '3', output];
}
function isMissingAudio(stderr) {
    return /matches no streams/i.test(stderr);
}
function classifyFfmpegError(stderr) {
    if (/Invalid data found|moov atom not found|could not find codec|Decoder \S+ not found|Unknown decoder|unsupported codec/i.test(stderr)) {
        return 'unsupported_codec';
    }
    if (/No such file or directory/i.test(stderr))
        return 'missing_source';
    return 'render_failed';
}
//# sourceMappingURL=reelRenderPlan.js.map