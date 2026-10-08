import { logger } from 'firebase-functions';
import { buildChatBody, resolveBaseUrl, type ChatMessage } from './providerConfig';

export type ChatResult =
  | { ok: true; content: string }
  | { ok: false; kind: 'upstream'; status: number }
  | { ok: false; kind: 'empty' };

type OpenRouterChatResponse = { choices?: Array<{ message?: { content?: string } }> };

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
}): Promise<ChatResult> {
  const response = await fetch(`${resolveBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pitchproof.online',
      'X-Title': params.title,
    },
    body: JSON.stringify(buildChatBody(params.model, params.messages, params.temperature)),
  });
  if (!response.ok) {
    logger.error('OpenRouter request failed', { status: response.status, title: params.title });
    return { ok: false, kind: 'upstream', status: response.status };
  }
  const payload = (await response.json().catch(() => ({}))) as OpenRouterChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  return content ? { ok: true, content } : { ok: false, kind: 'empty' };
}
