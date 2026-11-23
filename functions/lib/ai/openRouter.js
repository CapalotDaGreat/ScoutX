"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_TIMEOUT_MS = void 0;
exports.parseUsage = parseUsage;
exports.callChat = callChat;
const firebase_functions_1 = require("firebase-functions");
const providerConfig_1 = require("./providerConfig");
/** Provider-reported token counts; missing or malformed values yield undefined, never an estimate. */
function parseUsage(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const u = raw;
    const count = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
    const promptTokens = count(u.prompt_tokens);
    const completionTokens = count(u.completion_tokens);
    if (promptTokens === null || completionTokens === null)
        return undefined;
    const totalTokens = count(u.total_tokens) ?? count(promptTokens + completionTokens);
    return totalTokens === null ? undefined : { promptTokens, completionTokens, totalTokens };
}
/** Upper bound per model call; callable timeouts (300 s) leave room for one retry. */
exports.CHAT_TIMEOUT_MS = 120_000;
/**
 * Single OpenRouter entry point. Logs status codes and token counts only: prompts and model
 * output can contain personal data and are never written to logs. Token counts are what makes the
 * cost of a completed match measurable, including requests whose answer was empty or rejected.
 */
async function callChat(params) {
    let response;
    try {
        response = await fetch(`${(0, providerConfig_1.resolveBaseUrl)()}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${params.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://pitchproof.online',
                'X-Title': params.title,
            },
            body: JSON.stringify((0, providerConfig_1.buildChatBody)(params.model, params.messages, params.temperature)),
            signal: AbortSignal.timeout(params.timeoutMs ?? exports.CHAT_TIMEOUT_MS),
        });
    }
    catch (error) {
        // Timeouts and network failures are reported like an unavailable upstream (status 0).
        firebase_functions_1.logger.error('OpenRouter request did not complete', {
            title: params.title,
            kind: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network',
        });
        return { ok: false, kind: 'upstream', status: 0 };
    }
    if (!response.ok) {
        firebase_functions_1.logger.error('OpenRouter request failed', { status: response.status, title: params.title });
        return { ok: false, kind: 'upstream', status: response.status };
    }
    const raw = await response.json().catch(() => null);
    const payload = (raw && typeof raw === 'object' ? raw : {});
    const value = payload.choices?.[0]?.message?.content;
    const content = typeof value === 'string' && value.trim() ? value : null;
    const usage = parseUsage(payload.usage);
    if (usage) {
        firebase_functions_1.logger.info('OpenRouter usage', { title: params.title, model: params.model, ...usage, outcome: content ? 'ok' : 'empty' });
    }
    return content ? { ok: true, content, ...(usage ? { usage } : {}) } : { ok: false, kind: 'empty' };
}
//# sourceMappingURL=openRouter.js.map