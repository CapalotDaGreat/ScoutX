"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiInsight = exports.INSIGHT_SYSTEM_RULES = void 0;
exports.buildInsightPrompt = buildInsightPrompt;
exports.validateInsightPayload = validateInsightPayload;
exports.sanitizeInsightPayload = sanitizeInsightPayload;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const openRouter_1 = require("./ai/openRouter");
const outputValidator_1 = require("./ai/outputValidator");
const promptBuilder_1 = require("./ai/promptBuilder");
const providerConfig_1 = require("./ai/providerConfig");
const consentGate_1 = require("./ai/consentGate");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
/**
 * Insight types the coach can produce. The server owns the prompt and the schema; the
 * client only sends the structured context it wants reasoned over.
 */
const INSIGHT_TYPES = [
    'performance_summary',
    'improvement_suggestions',
    'training_recommendations',
    'potential_analysis',
    'career_progression_summary',
    'video_summary',
    'gps_summary',
];
const MAX_CONTEXT_BYTES = 32 * 1024;
const INSIGHT_PURPOSE = {
    performance_summary: 'Summarise recent performance strictly from the logged match data.',
    improvement_suggestions: 'Identify improvement areas grounded in the provided statistics.',
    training_recommendations: 'Suggest training drills that address weaknesses visible in the data.',
    potential_analysis: 'Describe development trajectory only where the data supports it.',
    career_progression_summary: 'Summarise the career journey entries provided.',
    video_summary: 'Summarise the provided video metadata (titles, categories, descriptions).',
    gps_summary: 'Summarise the provided GPS session metrics.',
};
const INSIGHT_SCHEMA = {
    performance_summary: `{
  "type": "performance_summary",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "highlights": [{ "label": "string", "value": "string", "trend": "up" | "down" | "neutral" }],
  "narrative": "string"
}`,
    improvement_suggestions: `{
  "type": "improvement_suggestions",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "focusAreas": ["string"],
  "suggestions": [{ "id": "string", "title": "string", "description": "string", "priority": "low" | "medium" | "high", "category": "string" }]
}`,
    training_recommendations: `{
  "type": "training_recommendations",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "weeklyFocus": "string",
  "drills": [{ "id": "string", "title": "string", "description": "string", "priority": "low" | "medium" | "high", "category": "string" }]
}`,
    potential_analysis: `{
  "type": "potential_analysis",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "growthAreas": ["string"],
  "trajectory": "rising" | "stable" | "plateauing" | null,
  "scoutNotes": "string"
}`,
    career_progression_summary: `{
  "type": "career_progression_summary",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "milestones": [{ "title": "string", "period": "string", "significance": "string" }],
  "nextSteps": ["string"]
}`,
    video_summary: `{
  "type": "video_summary",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "keyMoments": [{ "timestamp": "mm:ss or null", "description": "string" }],
  "strengthsShown": ["string"],
  "areasToImprove": ["string"]
}`,
    gps_summary: `{
  "type": "gps_summary",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "movementProfile": "string",
  "metrics": [{ "label": "string", "value": "string", "trend": "up" | "down" | "neutral" }],
  "tacticalInsights": ["string"]
}`,
};
/** Fields that must exist (and be of the right JSON type) for a response to be accepted. */
const REQUIRED_FIELDS = {
    performance_summary: { summary: 'string', highlights: 'array', narrative: 'string' },
    improvement_suggestions: { summary: 'string', focusAreas: 'array', suggestions: 'array' },
    training_recommendations: { summary: 'string', drills: 'array' },
    potential_analysis: { summary: 'string', growthAreas: 'array', scoutNotes: 'string' },
    career_progression_summary: { summary: 'string', milestones: 'array', nextSteps: 'array' },
    video_summary: { summary: 'string', keyMoments: 'array', strengthsShown: 'array', areasToImprove: 'array' },
    gps_summary: { summary: 'string', movementProfile: 'string', metrics: 'array', tacticalInsights: 'array' },
};
function isInsightType(value) {
    return typeof value === 'string' && INSIGHT_TYPES.includes(value);
}
exports.INSIGHT_SYSTEM_RULES = [
    'You are PitchProof AI, a football development analyst.',
    'Hard rules:',
    '- Use only the data in USER_METADATA. Do not invent events, statistics, timestamps, ratings or achievements.',
    '- Never give a numeric player rating, potential score or ranking.',
    '- If a value is not supported by the data, return null for numbers and omit list items rather than guessing.',
    '- When data is sparse, set confidence to "low" and say so in the summary.',
    '- Never include links or contact details.',
];
function buildInsightPrompt(insightType, context) {
    return (0, promptBuilder_1.buildPrompt)({
        system: exports.INSIGHT_SYSTEM_RULES,
        trusted: [`Insight type: ${insightType}`, `Purpose: ${INSIGHT_PURPOSE[insightType]}`],
        userMetadata: context,
        output: ['Return exactly this JSON schema:', INSIGHT_SCHEMA[insightType]],
    });
}
/**
 * Rejects responses that do not match the requested insight type or are missing required
 * fields. The client parser applies the finer-grained, nullable field handling.
 */
function validateInsightPayload(insightType, payload) {
    if (payload.type !== insightType) {
        return `Response type "${String(payload.type)}" does not match requested "${insightType}".`;
    }
    for (const [field, kind] of Object.entries(REQUIRED_FIELDS[insightType])) {
        const value = payload[field];
        if (kind === 'string' && (typeof value !== 'string' || value.trim().length === 0)) {
            return `Missing required text field "${field}".`;
        }
        if (kind === 'array' && !Array.isArray(value)) {
            return `Missing required list field "${field}".`;
        }
    }
    return null;
}
/** Strips links, instruction echoes and any numeric rating fields from a model payload. */
function sanitizeInsightPayload(payload) {
    const cleaned = (0, outputValidator_1.cleanModelPayload)(payload);
    delete cleaned.currentRating;
    delete cleaned.potentialRating;
    delete cleaned.rating;
    if (!['low', 'medium', 'high'].includes(String(cleaned.confidence)))
        cleaned.confidence = 'low';
    return cleaned;
}
function parseContext(value) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'contextJson is required.');
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_CONTEXT_BYTES) {
        throw new https_1.HttpsError('invalid-argument', 'contextJson exceeds the allowed size.');
    }
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new https_1.HttpsError('invalid-argument', 'contextJson must be valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new https_1.HttpsError('invalid-argument', 'contextJson must be a JSON object.');
    }
    const player = parsed.player;
    if (!player || typeof player.playerId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'contextJson.player.playerId is required.');
    }
    return { context: parsed, playerId: player.playerId };
}
exports.generateAiInsight = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({
    secrets: [openRouterApiKey],
    timeoutSeconds: 60,
}), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    const data = (request.data ?? {});
    if (!isInsightType(data.insightType)) {
        throw new https_1.HttpsError('invalid-argument', 'Unknown insight type.');
    }
    const insightType = data.insightType;
    const { context, playerId: contextPlayerId } = parseContext(data.contextJson);
    // Players may only reason over their own data; recruiter roles may analyse others.
    const role = typeof request.auth?.token.role === 'string' ? request.auth.token.role : null;
    const isRecruiter = role === 'scout' || role === 'coach' || role === 'club' || role === 'admin';
    if (contextPlayerId !== uid && !isRecruiter) {
        throw new https_1.HttpsError('permission-denied', 'You can only generate insights for your own profile.');
    }
    await (0, consentGate_1.assertAiConsent)([uid, contextPlayerId]);
    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    }
    const model = (0, providerConfig_1.resolveModel)('text');
    const prompt = buildInsightPrompt(insightType, context);
    const result = await (0, openRouter_1.callChat)({
        apiKey,
        model,
        title: 'PitchProof',
        messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
        ],
    });
    if (!result.ok) {
        if (result.kind === 'upstream') {
            throw new https_1.HttpsError('unavailable', 'The AI coach is temporarily unavailable. Please try again.');
        }
        throw new https_1.HttpsError('internal', 'The AI coach returned an empty response.');
    }
    let parsed;
    try {
        parsed = sanitizeInsightPayload((0, outputValidator_1.extractJsonObject)(result.content));
    }
    catch {
        firebase_functions_1.logger.warn('AI insight response was not a JSON object', { insightType });
        throw new https_1.HttpsError('internal', 'The AI coach response could not be read.');
    }
    const problem = validateInsightPayload(insightType, parsed);
    if (problem) {
        firebase_functions_1.logger.warn('AI insight payload rejected', { insightType, problem });
        throw new https_1.HttpsError('internal', 'The AI coach response was incomplete. Please try again.');
    }
    return {
        insightType,
        payload: parsed,
        generatedAt: new Date().toISOString(),
        model,
    };
});
//# sourceMappingURL=aiCoach.js.map