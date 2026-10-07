"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callChat = callChat;
const firebase_functions_1 = require("firebase-functions");
const providerConfig_1 = require("./providerConfig");
/**
 * Single OpenRouter entry point. Logs status codes only: prompts and model output can
 * contain personal data and are never written to logs.
 */
async function callChat(params) {
    const response = await fetch(`${(0, providerConfig_1.resolveBaseUrl)()}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://scoutx.app',
            'X-Title': params.title,
        },
        body: JSON.stringify((0, providerConfig_1.buildChatBody)(params.model, params.messages, params.temperature)),
    });
    if (!response.ok) {
        firebase_functions_1.logger.error('OpenRouter request failed', { status: response.status, title: params.title });
        return { ok: false, kind: 'upstream', status: response.status };
    }
    const payload = (await response.json().catch(() => ({})));
    const content = payload.choices?.[0]?.message?.content;
    return content ? { ok: true, content } : { ok: false, kind: 'empty' };
}
//# sourceMappingURL=openRouter.js.map