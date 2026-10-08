"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_ALLOWLIST = exports.PROVIDER_PRIVACY = void 0;
exports.resolveModel = resolveModel;
exports.resolveBaseUrl = resolveBaseUrl;
exports.isFootageProcessingApproved = isFootageProcessingApproved;
exports.buildChatBody = buildChatBody;
/**
 * Central OpenRouter configuration. Every request carries the provider privacy policy so
 * OpenRouter only routes to endpoints that do not collect or retain prompts. If no such
 * endpoint is available for a model, the request fails instead of falling back.
 */
exports.PROVIDER_PRIVACY = { data_collection: 'deny', zdr: true };
/** Models vetted for PitchProof use. Env overrides outside this list are ignored. */
exports.MODEL_ALLOWLIST = {
    text: ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001'],
    vision: ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001'],
};
const DEFAULT_MODEL = {
    text: 'google/gemini-2.0-flash-001',
    vision: 'google/gemini-2.0-flash-001',
};
const ENV_KEYS = {
    text: ['OPENROUTER_MODEL'],
    vision: ['OPENROUTER_VISION_MODEL', 'OPENROUTER_MODEL'],
};
/** Extra allowlisted ids for local emulator tests only; ignored in deployed functions. */
function testAllowlist() {
    return isEmulated(process.env) ? (process.env.OPENROUTER_TEST_MODELS ?? '').split(',').map((id) => id.trim()).filter(Boolean) : [];
}
function resolveModel(purpose, env = process.env) {
    const allowed = [...exports.MODEL_ALLOWLIST[purpose], ...testAllowlist()];
    for (const key of ENV_KEYS[purpose]) {
        const candidate = env[key]?.trim();
        if (candidate && allowed.includes(candidate))
            return candidate;
    }
    return DEFAULT_MODEL[purpose];
}
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
function isEmulated(env) {
    return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}
/** The API key travels to this URL, so deployed functions only accept HTTPS overrides. */
function resolveBaseUrl(env = process.env) {
    const override = env.OPENROUTER_BASE_URL?.trim();
    if (!override)
        return DEFAULT_BASE_URL;
    return override.startsWith('https://') || isEmulated(env) ? override : DEFAULT_BASE_URL;
}
/**
 * Match footage (frames of players, often minors) is only sent to the AI provider after the
 * operator has completed the provider privacy review and set `AI_FOOTAGE_PROCESSING_APPROVED=true`.
 * Until then deployed functions refuse footage analysis (AI_PRIVACY_CONFIGURATION_REQUIRED).
 */
function isFootageProcessingApproved(env = process.env) {
    return env.AI_FOOTAGE_PROCESSING_APPROVED?.trim() === 'true' || isEmulated(env);
}
function buildChatBody(model, messages, temperature = 0.2) {
    return {
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature,
        provider: { ...exports.PROVIDER_PRIVACY },
    };
}
//# sourceMappingURL=providerConfig.js.map