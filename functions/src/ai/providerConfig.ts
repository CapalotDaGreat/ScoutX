/**
 * Central OpenRouter configuration. Every request carries the provider privacy policy so
 * OpenRouter only routes to endpoints that do not collect or retain prompts. If no such
 * endpoint is available for a model, the request fails instead of falling back.
 */
export const PROVIDER_PRIVACY = { data_collection: 'deny', zdr: true } as const;

export type ModelPurpose = 'text' | 'vision';

/** Models vetted for PitchProof use. Env overrides outside this list are ignored. */
export const MODEL_ALLOWLIST: Record<ModelPurpose, readonly string[]> = {
  text: ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001'],
  vision: ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001'],
};

const DEFAULT_MODEL: Record<ModelPurpose, string> = {
  text: 'google/gemini-2.0-flash-001',
  vision: 'google/gemini-2.0-flash-001',
};

const ENV_KEYS: Record<ModelPurpose, readonly string[]> = {
  text: ['OPENROUTER_MODEL'],
  vision: ['OPENROUTER_VISION_MODEL', 'OPENROUTER_MODEL'],
};

/** Extra allowlisted ids for local emulator tests only; ignored in deployed functions. */
function testAllowlist(): string[] {
  return isEmulated(process.env) ? (process.env.OPENROUTER_TEST_MODELS ?? '').split(',').map((id) => id.trim()).filter(Boolean) : [];
}

export function resolveModel(purpose: ModelPurpose, env: NodeJS.ProcessEnv = process.env): string {
  const allowed = [...MODEL_ALLOWLIST[purpose], ...testAllowlist()];
  for (const key of ENV_KEYS[purpose]) {
    const candidate = env[key]?.trim();
    if (candidate && allowed.includes(candidate)) return candidate;
  }
  return DEFAULT_MODEL[purpose];
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function isEmulated(env: NodeJS.ProcessEnv): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}

/** The API key travels to this URL, so deployed functions only accept HTTPS overrides. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENROUTER_BASE_URL?.trim();
  if (!override) return DEFAULT_BASE_URL;
  return override.startsWith('https://') || isEmulated(env) ? override : DEFAULT_BASE_URL;
}

/**
 * Match footage (frames of players, often minors) is only sent to the AI provider after the
 * operator has completed the provider privacy review and set `AI_FOOTAGE_PROCESSING_APPROVED=true`.
 * Until then deployed functions refuse footage analysis (AI_PRIVACY_CONFIGURATION_REQUIRED).
 */
export function isFootageProcessingApproved(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_FOOTAGE_PROCESSING_APPROVED?.trim() === 'true' || isEmulated(env);
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> };

export function buildChatBody(model: string, messages: ChatMessage[], temperature = 0.2): Record<string, unknown> {
  return {
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature,
    provider: { ...PROVIDER_PRIVACY },
  };
}
