"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REASONING_KINDS = exports.MAX_FRAMES = exports.MAX_CLIP_SEC = exports.REASONING_PROVIDER = void 0;
exports.reasoningEnabled = reasoningEnabled;
exports.reasoningGate = reasoningGate;
exports.clipWindow = clipWindow;
exports.frameTimes = frameTimes;
exports.clock = clock;
exports.clipFacts = clipFacts;
exports.buildReasoningMessages = buildReasoningMessages;
exports.validateReasoning = validateReasoning;
exports.reasoningCacheId = reasoningCacheId;
const outputValidator_1 = require("../ai/outputValidator");
exports.REASONING_PROVIDER = 'openrouter_zdr';
exports.MAX_CLIP_SEC = 20;
exports.MAX_FRAMES = 6;
exports.REASONING_KINDS = ['explain', 'alternatives'];
function reasoningEnabled(env = process.env) {
    return env.VIDEO_REASONING_ENABLED?.trim() === 'true';
}
/** The order matters: the first failing gate is reported (and nothing is sent). */
function reasoningGate(g) {
    if (!reasoningEnabled(g.env))
        return { ok: false, reason: 'disabled' };
    if (!g.footageApproved)
        return { ok: false, reason: 'footage_not_approved' };
    if (!g.aiConsent)
        return { ok: false, reason: 'ai_consent_required' };
    const vc = g.videoConsent;
    if (!vc || !vc.current || vc.revokedAt !== null || !vc.providers.includes(exports.REASONING_PROVIDER)) {
        return { ok: false, reason: 'provider_not_consented' };
    }
    if (!g.moment || g.moment.identityState !== 'CONFIRMED_VISIBLE' || g.moment.candidate)
        return { ok: false, reason: 'moment_not_confirmed' };
    return { ok: true };
}
/** Clip window around the moment's action, never longer than MAX_CLIP_SEC. */
function clipWindow(m) {
    const len = m.clipEnd - m.clipStart;
    if (len <= exports.MAX_CLIP_SEC)
        return { start: m.clipStart, end: m.clipEnd };
    const mid = (m.start + m.end) / 2;
    const start = Math.max(m.clipStart, Math.min(mid - exports.MAX_CLIP_SEC / 2, m.clipEnd - exports.MAX_CLIP_SEC));
    return { start, end: start + exports.MAX_CLIP_SEC };
}
/** Evenly spaced frame times inside the clip (the worker renders them with the target outlined). */
function frameTimes(clip, n = exports.MAX_FRAMES) {
    const k = Math.max(1, Math.min(exports.MAX_FRAMES, n));
    const step = (clip.end - clip.start) / k;
    return Array.from({ length: k }, (_, i) => Math.round((clip.start + step * (i + 0.5)) * 10) / 10);
}
function clock(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** Facts from the report that hold for this clip (identity and measured off-ball sequence only). */
function clipFacts(report, moment, clip) {
    const facts = [`The outlined player is the selected player${report.target.number ? ` (#${report.target.number})` : ''}; identity is confirmed in this clip.`];
    if (moment.evidence === 'number_read')
        facts.push('The shirt number was read in this clip.');
    for (const q of report.offball?.sequences ?? []) {
        if (q.start < clip.end && q.end > clip.start && (q.kind === 'free' || q.kind === 'tight')) {
            facts.push(q.kind === 'free' ? 'Measured: no opponent was close to the player for most of this sequence (image-plane, not metres).'
                : 'Measured: an opponent was within about one body height of the player for most of this sequence (image-plane, not metres).');
        }
    }
    facts.push('The ball and pitch markings are not tracked reliably in this recording; do not assume where the ball went.');
    return facts;
}
function buildReasoningMessages(ctx, frameImages) {
    const system = [
        'You are a careful football (soccer) video analyst helping a player review ONE short clip of their own match.',
        'You see a few still frames in time order. The selected player is outlined with a yellow box.',
        'Describe only what is visible in the frames. Separate observation (what is visible) from interpretation (football meaning, uncertain).',
        'Never state numbers: no statistics, distances, speeds, percentages, ratings, scores or counts. Do not name other players or their shirt numbers.',
        'Never claim goals, assists, shots on target or pass outcomes unless clearly visible; if the ball is not visible say so.',
        'If the frames do not show enough, set confidence to "unclear" and explain the limitation.',
        'Answer as JSON only: {"observation": string, "interpretation": string, "evidenceFrames": string[], "confidence": "clear"|"partial"|"unclear", "limitations": string[], "suggestion": string}.',
        'evidenceFrames lists frame ids (e.g. "f2") that show the observation. Keep each text under 300 characters.',
    ].join('\n');
    const task = ctx.kind === 'alternatives'
        ? 'Question: what could the outlined player have done differently in this situation? Give at most one realistic option, as an interpretation.'
        : 'Question: explain what the outlined player is doing in this situation and why it may matter.';
    const meta = [
        `Player position (as entered by the player): ${ctx.position || 'unknown'}. Team kit: ${ctx.kit || 'unknown'}.`,
        `Clip: ${clock(ctx.clip.start)}-${clock(ctx.clip.end)}. Frames: ${ctx.frames.map((f) => `${f.id}@${clock(f.t)}`).join(', ')}.`,
        'Known facts (trusted):', ...ctx.facts.map((f) => `- ${f}`),
    ].join('\n');
    return [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: `${meta}\n${task}` },
                ...frameImages.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }))] },
    ];
}
const FORBIDDEN_CLAIMS = /(\bgoals?\b|\bscor(e|ed|es|ing)\b|\bassists?\b|\bxg\b|\bkm\b|kilomet|\bmetres?\b|\bmeters?\b|\bmph\b|km\/h|\bpercent|%|\brating\b|out of (ten|10)|\bstatistic)/i;
/** Digits allowed in output: the target's own number and the frame clock strings. */
function numbersOk(text, allowed) {
    const withoutClocks = text.replace(/\b\d{1,2}:\d{2}\b/g, (m) => (allowed.has(m) ? '' : m)).replace(/\bf\d\b/g, '');
    const nums = withoutClocks.match(/\d+/g) ?? [];
    return nums.every((n) => allowed.has(n));
}
function validateReasoning(raw, ctx) {
    let obj;
    try {
        obj = (0, outputValidator_1.extractJsonObject)(raw);
    }
    catch {
        return { ok: false, reason: 'not_json' };
    }
    const observation = (0, outputValidator_1.cleanModelText)(obj.observation, 400);
    const interpretation = (0, outputValidator_1.cleanModelText)(obj.interpretation, 400);
    const suggestion = (0, outputValidator_1.cleanModelText)(obj.suggestion, 300);
    const limitations = (0, outputValidator_1.cleanTextList)(obj.limitations, 3, 200);
    if (!observation)
        return { ok: false, reason: 'empty_observation' };
    const known = new Map(ctx.frames.map((f) => [f.id, f.t]));
    const evidence = (Array.isArray(obj.evidenceFrames) ? obj.evidenceFrames : [])
        .filter((id) => typeof id === 'string' && known.has(id))
        .slice(0, exports.MAX_FRAMES).map((id) => ({ frameId: id, t: known.get(id) }));
    if (Array.isArray(obj.evidenceFrames) && obj.evidenceFrames.length > 0 && evidence.length < obj.evidenceFrames.length) {
        return { ok: false, reason: 'unknown_frame' };
    }
    let confidence = (0, outputValidator_1.oneOf)(obj.confidence, ['clear', 'partial', 'unclear'], 'unclear');
    if (evidence.length === 0)
        confidence = 'unclear';
    const allowed = new Set([...(ctx.number ? [ctx.number] : []), ...ctx.frames.map((f) => clock(f.t)),
        clock(ctx.clip.start), clock(ctx.clip.end)]);
    for (const text of [observation, interpretation, suggestion, ...limitations]) {
        if (FORBIDDEN_CLAIMS.test(text))
            return { ok: false, reason: 'unsupported_claim' };
        if (!numbersOk(text, allowed))
            return { ok: false, reason: 'unsupported_number' };
    }
    return { ok: true, answer: { observation, interpretation, evidence, confidence, limitations, suggestion } };
}
/** Cache: one answer per (report version, moment, kind) - repeated questions cost nothing. */
function reasoningCacheId(reportVersion, momentId, kind) {
    return `r_${reportVersion}_${momentId.replace(/[^A-Za-z0-9_-]/g, '_')}_${kind}`.slice(0, 120);
}
//# sourceMappingURL=videoReasoning.js.map