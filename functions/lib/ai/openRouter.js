"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_TIMEOUT_MS = void 0;
exports.callChat = callChat;
const firebase_functions_1 = require("firebase-functions");
const providerConfig_1 = require("./providerConfig");
/** Upper bound per model call; callable timeouts (300 s) leave room for one retry. */
exports.CHAT_TIMEOUT_MS = 120_000;
/**
 * Single OpenRouter entry point. Logs status codes only: prompts and model output can
 * contain personal data and are never written to logs.
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
    const payload = (await response.json().catch(() => ({})));
    const content = payload.choices?.[0]?.message?.content;
    return content ? { ok: true, content } : { ok: false, kind: 'empty' };
}
//# sourceMappingURL=openRouter.js.map