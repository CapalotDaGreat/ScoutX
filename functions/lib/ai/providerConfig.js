"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_ALLOWLIST = exports.PROVIDER_PRIVACY = void 0;
exports.resolveModel = resolveModel;
exports.resolveBaseUrl = resolveBaseUrl;
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
    const isEmulated = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    return isEmulated ? (process.env.OPENROUTER_TEST_MODELS ?? '').split(',').map((id) => id.trim()).filter(Boolean) : [];
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
function resolveBaseUrl(env = process.env) {
    return env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
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