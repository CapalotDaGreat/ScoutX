"use strict";
/**
 * Technique star assessment (EA FC style, 1–5) derived from sampled still frames.
 * A star rating is only kept when the player confirmed their identity and the model cited
 * enough known frames. Everything else stays unknown instead of guessed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_TECHNIQUE_FRAMES = exports.TECHNIQUE_DIMENSIONS = void 0;
exports.parseSelfReportedStars = parseSelfReportedStars;
exports.normalizeTechniqueAssessment = normalizeTechniqueAssessment;
exports.TECHNIQUE_DIMENSIONS = [
    'weakFoot',
    'skillMoves',
    'firstTouch',
    'passing',
    'dribbling',
    'shooting',
];
exports.MIN_TECHNIQUE_FRAMES = 2;
function toStars(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 5 ? rounded : null;
}
function text(value, max = 400) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function parseSelfReportedStars(identity) {
    const record = identity && typeof identity === 'object' && !Array.isArray(identity)
        ? identity
        : {};
    const foot = record.strongFoot;
    return {
        strongFoot: foot === 'left' || foot === 'right' || foot === 'both' ? foot : null,
        weakFoot: toStars(record.weakFootRating),
        skillMoves: toStars(record.skillMovesRating),
    };
}
function normalizeTechniqueAssessment(raw, knownFrameIds, identityConfirmed, selfReported) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const ratings = exports.TECHNIQUE_DIMENSIONS.map((dimension) => {
        const entry = source[dimension];
        const row = entry && typeof entry === 'object' && !Array.isArray(entry)
            ? entry
            : {};
        const frameIds = Array.isArray(row.frameIds)
            ? [...new Set(row.frameIds.filter((id) => typeof id === 'string' && knownFrameIds.has(id)))]
            : [];
        if (!identityConfirmed) {
            return {
                dimension,
                stars: null,
                status: 'identity_unconfirmed',
                summary: '',
                tip: null,
                frameIds: [],
                confidence: 'Insufficient',
            };
        }
        const stars = frameIds.length >= exports.MIN_TECHNIQUE_FRAMES ? toStars(row.stars) : null;
        const tip = text(row.tip, 240);
        return {
            dimension,
            stars,
            status: stars === null ? 'insufficient_evidence' : 'rated',
            summary: frameIds.length > 0 ? text(row.summary) : '',
            tip: frameIds.length > 0 && tip ? tip : null,
            frameIds,
            confidence: stars === null ? 'Insufficient' : 'Limited',
        };
    });
    const ratedCount = ratings.filter((rating) => rating.stars !== null).length;
    return {
        scale: 'stars_1_5',
        basis: 'sampled_frames',
        ratings,
        ratedCount,
        overallSummary: identityConfirmed && ratedCount > 0 ? text(source.overallSummary, 600) : '',
        selfReported,
    };
}
//# sourceMappingURL=technique.js.map