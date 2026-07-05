"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiInsight = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firebase_functions_1 = require("firebase-functions");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
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
exports.generateAiInsight = (0, https_1.onCall)({
    secrets: [openRouterApiKey],
    timeoutSeconds: 60,
    cors: true,
}, async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    const data = request.data;
    if (!data ||
        typeof data.insightType !== 'string' ||
        typeof data.systemPrompt !== 'string' ||
        typeof data.userPrompt !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Missing AI insight request payload.');
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
                { role: 'system', content: data.systemPrompt },
                { role: 'user', content: data.userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
        }),
    });
    const payload = (await response.json());
    if (!response.ok) {
        firebase_functions_1.logger.error('OpenRouter request failed', { status: response.status, payload });
        throw new https_1.HttpsError('internal', payload.error?.message ?? `OpenRouter request failed (${response.status}).`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
        throw new https_1.HttpsError('internal', 'OpenRouter returned an empty response.');
    }
    try {
        return {
            insightType: data.insightType,
            payload: extractJsonFromModelText(content),
            generatedAt: new Date().toISOString(),
        };
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to parse AI JSON response', { error, content });
        throw new https_1.HttpsError('internal', 'AI response could not be parsed.');
    }
});
//# sourceMappingURL=aiCoach.js.map