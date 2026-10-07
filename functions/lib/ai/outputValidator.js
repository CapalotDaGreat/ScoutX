"use strict";
/**
 * Validation applied to every model output before it is stored or returned: JSON object
 * only, bounded text, no links, no echoed instructions or prompt sections, references to
 * frames and timestamps that actually exist.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractJsonObject = extractJsonObject;
exports.hasInstructionEcho = hasInstructionEcho;
exports.cleanModelText = cleanModelText;
exports.cleanTextList = cleanTextList;
exports.cleanModelPayload = cleanModelPayload;
exports.oneOf = oneOf;
exports.timestampWithin = timestampWithin;
exports.knownFrameIds = knownFrameIds;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\[[^\]]*\]\([^)]*\)/gi;
const INSTRUCTION_ECHO = [
    /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)/i,
    /system prompt/i,
    /USER_METADATA/,
    /###\s*(?:TRUSTED|OUTPUT|SYSTEM)/i,
    /\bas an ai (?:language )?model\b/i,
    /\byou are now\b/i,
];
function extractJsonObject(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const parsed = JSON.parse(fenced?.[1]?.trim() ?? trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI response was not a JSON object.');
    }
    return parsed;
}
function hasInstructionEcho(text) {
    return INSTRUCTION_ECHO.some((pattern) => pattern.test(text));
}
/** Bounded plain text; empty when the value is not text or echoes instructions. */
function cleanModelText(value, maxLength = 600) {
    if (typeof value !== 'string')
        return '';
    const text = value.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim();
    if (!text || hasInstructionEcho(text))
        return '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
function cleanTextList(value, maxItems = 6, maxLength = 200) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => cleanModelText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}
/** Recursively cleans every string in a model payload; caps arrays and depth. */
function cleanModelPayload(value, depth = 0) {
    if (depth > 5)
        return null;
    if (typeof value === 'string')
        return cleanModelText(value, 1200);
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean' || value === null)
        return value;
    if (Array.isArray(value))
        return value.slice(0, 20).map((item) => cleanModelPayload(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .slice(0, 40)
            .map(([key, item]) => [key, cleanModelPayload(item, depth + 1)]));
    }
    return null;
}
function oneOf(value, allowed, fallback) {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
function timestampWithin(value, durationSec) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        return null;
    const rounded = Math.round(value);
    return durationSec > 0 && rounded > durationSec ? null : rounded;
}
function knownFrameIds(value, known, max = 8) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter((id) => typeof id === 'string' && known.has(id)))].slice(0, max);
}
//# sourceMappingURL=outputValidator.js.map