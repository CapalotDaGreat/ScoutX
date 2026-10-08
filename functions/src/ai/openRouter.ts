import { logger } from 'firebase-functions';
import { buildChatBody, resolveBaseUrl, type ChatMessage } from './providerConfig';

export type ChatResult =
  | { ok: true; content: string }
  | { ok: false; kind: 'upstream'; status: number }
  | { ok: false; kind: 'empty' };

type OpenRouterChatResponse = { choices?: Array<{ message?: { content?: string } }> };

/** Upper bound per model call; callable timeouts (300 s) leave room for one retry. */
export const CHAT_TIMEOUT_MS = 120_000;

/**
 * Single OpenRouter entry point. Logs status codes only: prompts and model output can
 * contain personal data and are never written to logs.
 */
export async function callChat(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  title: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch(`${resolveBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pitchproof.online',
        'X-Title': params.title,
      },
      body: JSON.stringify(buildChatBody(params.model, params.messages, params.temperature)),
      signal: AbortSignal.timeout(params.timeoutMs ?? CHAT_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeouts and network failures are reported like an unavailable upstream (status 0).
    logger.error('OpenRouter request did not complete', {
      title: params.title,
      kind: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network',
    });
    return { ok: false, kind: 'upstream', status: 0 };
  }
  if (!response.ok) {
    logger.error('OpenRouter request failed', { status: response.status, title: params.title });
    return { ok: false, kind: 'upstream', status: response.status };
  }
  const payload = (await response.json().catch(() => ({}))) as OpenRouterChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  return content ? { ok: true, content } : { ok: false, kind: 'empty' };
}
