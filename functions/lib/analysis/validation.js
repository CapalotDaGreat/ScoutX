"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeObservations = normalizeObservations;
/**
 * Observations must cite a known frame id. Anything else is dropped, not guessed.
 */
function normalizeObservations(raw, knownFrameIds, durationSec) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const row = item;
        const frameId = typeof row.frameId === 'string' ? row.frameId : '';
        if (!knownFrameIds.has(frameId)) {
            continue;
        }
        const timestampSec = typeof row.timestampSec === 'number' && Number.isFinite(row.timestampSec)
            ? Math.max(0, Math.round(row.timestampSec))
            : null;
        if (timestampSec === null || (durationSec > 0 && timestampSec > durationSec)) {
            continue;
        }
        const kind = row.kind === 'inference' || row.kind === 'unknown' ? row.kind : 'observation';
        out.push({
            frameId,
            timestampSec,
            label: typeof row.label === 'string' ? row.label : 'Observation',
            detail: typeof row.detail === 'string' ? row.detail : '',
            kind,
        });
    }
    return out;
}
//# sourceMappingURL=validation.js.map