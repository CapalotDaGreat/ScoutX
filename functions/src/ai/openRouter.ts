import { logger } from 'firebase-functions';
import { buildChatBody, resolveBaseUrl, type ChatMessage } from './providerConfig';

/** Token counts reported by the provider for one request. Never a guess: absent when the provider sent none. */
export type ChatUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type ChatResult =
  | { ok: true; content: string; usage?: ChatUsage }
  | { ok: false; kind: 'upstream'; status: number }
  | { ok: false; kind: 'empty' };

type OpenRouterChatResponse = { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };

/** Provider-reported token counts; missing or malformed values yield undefined, never an estimate. */
export function parseUsage(raw: unknown): ChatUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
  const promptTokens = count(u.prompt_tokens);
  const completionTokens = count(u.completion_tokens);
  if (promptTokens === null || completionTokens === null) return undefined;
  const totalTokens = count(u.total_tokens) ?? count(promptTokens + completionTokens);
  return totalTokens === null ? undefined : { promptTokens, completionTokens, totalTokens };
}

/** Upper bound per model call; callable timeouts (300 s) leave room for one retry. */
export const CHAT_TIMEOUT_MS = 120_000;

/**
 * Single OpenRouter entry point. Logs status codes and token counts only: prompts and model
 * output can contain personal data and are never written to logs. Token counts are what makes the
 * cost of a completed match measurable, including requests whose answer was empty or rejected.
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
  const raw: unknown = await response.json().catch(() => null);
  const payload = (raw && typeof raw === 'object' ? raw : {}) as OpenRouterChatResponse;
  const value = payload.choices?.[0]?.message?.content;
  const content = typeof value === 'string' && value.trim() ? value : null;
  const usage = parseUsage(payload.usage);
  if (usage) {
    logger.info('OpenRouter usage', { title: params.title, model: params.model, ...usage, outcome: content ? 'ok' : 'empty' });
  }
  return content ? { ok: true, content, ...(usage ? { usage } : {}) } : { ok: false, kind: 'empty' };
}
