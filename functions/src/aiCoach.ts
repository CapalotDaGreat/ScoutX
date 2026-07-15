import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

type GenerateAiInsightRequest = {
  insightType: string;
  systemPrompt: string;
  userPrompt: string;
  contextJson: string;
};

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractJsonFromModelText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export const generateAiInsight = onCall(
  createCallableOptions({
    secrets: [openRouterApiKey],
    timeoutSeconds: 60,
  }),
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data as GenerateAiInsightRequest;
    if (
      !data ||
      typeof data.insightType !== 'string' ||
      typeof data.systemPrompt !== 'string' ||
      typeof data.userPrompt !== 'string'
    ) {
      throw new HttpsError('invalid-argument', 'Missing AI insight request payload.');
    }

    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
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

    const payload = (await response.json()) as OpenRouterChatResponse;
    if (!response.ok) {
      logger.error('OpenRouter request failed', { status: response.status, payload });
      throw new HttpsError(
        'internal',
        payload.error?.message ?? `OpenRouter request failed (${response.status}).`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpsError('internal', 'OpenRouter returned an empty response.');
    }

    try {
      return {
        insightType: data.insightType,
        payload: extractJsonFromModelText(content),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to parse AI JSON response', { error, content });
      throw new HttpsError('internal', 'AI response could not be parsed.');
    }
  },
);
