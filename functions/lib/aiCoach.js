"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiInsight = void 0;
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildUserPrompt = buildUserPrompt;
exports.validateInsightPayload = validateInsightPayload;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
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
  "currentRating": number | null,
  "potentialRating": number | null,
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
function buildSystemPrompt(insightType) {
    return [
        'You are ScoutX AI, a professional football performance analyst.',
        'Respond ONLY with a single JSON object. No markdown fences, no commentary.',
        `Insight type: ${insightType}`,
        `Purpose: ${INSIGHT_PURPOSE[insightType]}`,
        'Hard rules:',
        '- Use only the data in the provided context. Do not invent events, statistics, timestamps, ratings or achievements.',
        '- If a value is not supported by the data, return null for numbers and omit list items rather than guessing.',
        '- When data is sparse, set confidence to "low" and say so in the summary.',
        'Required JSON schema:',
        INSIGHT_SCHEMA[insightType],
    ].join('\n\n');
}
function buildUserPrompt(insightType, contextJson) {
    return [
        `Generate a ${insightType.replace(/_/g, ' ')} for the player using this structured context:`,
        contextJson,
    ].join('\n\n');
}
function extractJsonFromModelText(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI response was not a JSON object.');
    }
    return parsed;
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
function validateContextJson(value) {
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
    return JSON.stringify(parsed);
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
    const contextJson = validateContextJson(data.contextJson);
    // Players may only reason over their own data; recruiter roles may analyse others.
    const contextPlayerId = JSON.parse(contextJson).player.playerId;
    const role = typeof request.auth?.token.role === 'string' ? request.auth.token.role : null;
    const isRecruiter = role === 'scout' || role === 'coach' || role === 'club' || role === 'admin';
    if (contextPlayerId !== uid && !isRecruiter) {
        throw new https_1.HttpsError('permission-denied', 'You can only generate insights for your own profile.');
    }
    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    }
    const model = process.env.OPENROUTER_MODEL?.trim() || 'google/gemma-2-9b-it:free';
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://scoutx.app',
            'X-Title': 'ScoutX',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: buildSystemPrompt(insightType) },
                { role: 'user', content: buildUserPrompt(insightType, contextJson) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
        }),
    });
    const payload = (await response.json());
    if (!response.ok) {
        firebase_functions_1.logger.error('OpenRouter request failed', { status: response.status, payload });
        throw new https_1.HttpsError('unavailable', 'The AI coach is temporarily unavailable. Please try again.');
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
        throw new https_1.HttpsError('internal', 'The AI coach returned an empty response.');
    }
    let parsed;
    try {
        parsed = extractJsonFromModelText(content);
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to parse AI JSON response', { error, content });
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