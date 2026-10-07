"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDIA_LIMITS = void 0;
exports.hasVideoMagicBytes = hasVideoMagicBytes;
exports.parseFrameRate = parseFrameRate;
exports.parseProbeJson = parseProbeJson;
exports.evaluateProbe = evaluateProbe;
const model_1 = require("./model");
/** Server-side media limits checked against ffprobe output, not client claims. */
exports.MEDIA_LIMITS = {
    minDurationSec: 1,
    maxDurationSec: model_1.UPLOAD_LIMITS.maxDurationSec,
    minShortSide: 90,
    maxLongSide: 7680,
    maxShortSide: 4320,
    minFps: 1,
    maxFps: 240,
    maxBitRate: 200_000_000,
    maxStreams: 8,
    maxVideoStreams: 2,
    videoCodecs: ['h264', 'hevc'],
    audioCodecs: ['aac', 'alac', 'mp3', 'ac3', 'eac3', 'opus', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'],
};
/** ISO BMFF / QuickTime atoms that can open an MP4 or MOV file (bytes 4–7). */
const LEADING_ATOMS = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'];
function hasVideoMagicBytes(head) {
    if (head.length < 8)
        return false;
    const atom = String.fromCharCode(head[4], head[5], head[6], head[7]);
    return LEADING_ATOMS.includes(atom);
}
const num = (value) => {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
};
/** Parses ffprobe rates like "30000/1001". */
function parseFrameRate(value) {
    if (typeof value !== 'string')
        return num(value);
    const [n, d] = value.split('/').map(Number);
    if (!Number.isFinite(n))
        return null;
    if (d === undefined)
        return n;
    return Number.isFinite(d) && d > 0 ? n / d : null;
}
function parseProbeJson(raw) {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        return null;
    }
}
function majorBrand(format) {
    const tags = format.tags;
    return typeof tags?.major_brand === 'string' ? tags.major_brand.trim() : '';
}
function evaluateProbe(probe, expectedSizeBytes) {
    if (!probe?.format || !Array.isArray(probe.streams))
        return { ok: false, reason: 'probe_failed' };
    const formatName = typeof probe.format.format_name === 'string' ? probe.format.format_name : '';
    if (!formatName.split(',').some((name) => name === 'mov' || name === 'mp4')) {
        return { ok: false, reason: 'unsupported_container' };
    }
    const streams = probe.streams;
    if (streams.length > exports.MEDIA_LIMITS.maxStreams)
        return { ok: false, reason: 'too_many_streams' };
    const videos = streams.filter((stream) => stream.codec_type === 'video'
        && stream.disposition?.attached_pic !== 1);
    if (videos.length === 0)
        return { ok: false, reason: 'no_video_stream' };
    if (videos.length > exports.MEDIA_LIMITS.maxVideoStreams)
        return { ok: false, reason: 'too_many_streams' };
    const video = videos[0];
    const videoCodec = String(video.codec_name ?? '');
    if (!exports.MEDIA_LIMITS.videoCodecs.includes(videoCodec)) {
        return { ok: false, reason: 'unsupported_codec' };
    }
    const audio = streams.find((stream) => stream.codec_type === 'audio');
    const audioCodec = audio ? String(audio.codec_name ?? '') : null;
    if (audioCodec !== null && !exports.MEDIA_LIMITS.audioCodecs.includes(audioCodec)) {
        return { ok: false, reason: 'unsupported_codec' };
    }
    const durationSec = num(probe.format.duration) ?? num(video.duration);
    if (durationSec === null || durationSec < exports.MEDIA_LIMITS.minDurationSec)
        return { ok: false, reason: 'too_short' };
    if (durationSec > exports.MEDIA_LIMITS.maxDurationSec)
        return { ok: false, reason: 'too_long' };
    const width = num(video.width) ?? 0;
    const height = num(video.height) ?? 0;
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    if (shortSide < exports.MEDIA_LIMITS.minShortSide || longSide > exports.MEDIA_LIMITS.maxLongSide || shortSide > exports.MEDIA_LIMITS.maxShortSide) {
        return { ok: false, reason: 'resolution' };
    }
    const fps = parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate);
    if (fps === null || fps < exports.MEDIA_LIMITS.minFps || fps > exports.MEDIA_LIMITS.maxFps)
        return { ok: false, reason: 'frame_rate' };
    const bitRate = num(probe.format.bit_rate);
    if (bitRate !== null && bitRate > exports.MEDIA_LIMITS.maxBitRate)
        return { ok: false, reason: 'bitrate' };
    const sizeBytes = num(probe.format.size);
    if (sizeBytes !== null && sizeBytes !== expectedSizeBytes)
        return { ok: false, reason: 'size_mismatch' };
    return {
        ok: true,
        summary: {
            container: majorBrand(probe.format) === 'qt' ? 'mov' : 'mp4',
            videoCodec,
            audioCodec,
            width,
            height,
            fps: Math.round(fps * 100) / 100,
            durationSec: Math.round(durationSec * 10) / 10,
            bitRate,
            sizeBytes: sizeBytes ?? expectedSizeBytes,
            streamCount: streams.length,
        },
    };
}
//# sourceMappingURL=probe.js.map