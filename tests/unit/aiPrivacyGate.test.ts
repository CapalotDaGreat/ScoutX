import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isFootageProcessingApproved, resolveBaseUrl, resolveModel } from '../../functions/src/ai/providerConfig.ts';
import { callChat } from '../../functions/src/ai/openRouter.ts';

const deployed = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...extra });

describe('AI footage privacy gate', () => {
  test('deployed functions refuse footage until the operator approves the provider', () => {
    assert.equal(isFootageProcessingApproved(deployed()), false);
    assert.equal(isFootageProcessingApproved(deployed({ AI_FOOTAGE_PROCESSING_APPROVED: 'false' })), false);
    assert.equal(isFootageProcessingApproved(deployed({ AI_FOOTAGE_PROCESSING_APPROVED: 'yes' })), false);
    assert.equal(isFootageProcessingApproved(deployed({ AI_FOOTAGE_PROCESSING_APPROVED: 'true' })), true);
  });

  test('emulators may process test footage', () => {
    assert.equal(isFootageProcessingApproved(deployed({ FUNCTIONS_EMULATOR: 'true' })), true);
    assert.equal(isFootageProcessingApproved(deployed({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })), true);
  });
});

describe('OpenRouter configuration stays server-side and constrained', () => {
  test('the API key is only ever sent over HTTPS from deployed functions', () => {
    assert.equal(resolveBaseUrl(deployed()), 'https://openrouter.ai/api/v1');
    assert.equal(resolveBaseUrl(deployed({ OPENROUTER_BASE_URL: 'http://evil.test/v1' })), 'https://openrouter.ai/api/v1');
    assert.equal(resolveBaseUrl(deployed({ OPENROUTER_BASE_URL: 'https://gateway.example/v1' })), 'https://gateway.example/v1');
    assert.equal(
      resolveBaseUrl(deployed({ FUNCTIONS_EMULATOR: 'true', OPENROUTER_BASE_URL: 'http://127.0.0.1:9000' })),
      'http://127.0.0.1:9000',
    );
  });

  test('models outside the allowlist are ignored', () => {
    assert.equal(resolveModel('vision', deployed({ OPENROUTER_VISION_MODEL: 'some/unvetted-model' })), 'google/gemini-2.5-flash');
    assert.equal(resolveModel('vision', deployed({ OPENROUTER_VISION_MODEL: 'google/gemini-2.0-flash-001' })), 'google/gemini-2.5-flash', 'retired overrides fall back to the available allowlisted model');
    assert.equal(resolveModel('vision', deployed({ OPENROUTER_VISION_MODEL: 'google/gemini-2.5-flash' })), 'google/gemini-2.5-flash');
  });
});

describe('OpenRouter failure modes', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('a network failure or timeout becomes a typed upstream failure, never a throw', async () => {
    globalThis.fetch = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    }) as typeof fetch;
    const result = await callChat({ apiKey: 'k', model: 'm', messages: [{ role: 'system', content: 'x' }], title: 't' });
    assert.deepEqual(result, { ok: false, kind: 'upstream', status: 0 });
  });

  test('a hanging provider is cut off by the timeout', async () => {
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
      })) as typeof fetch;
    // AbortSignal.timeout does not keep the event loop alive on its own.
    const keepAlive = setTimeout(() => undefined, 5_000);
    const result = await callChat({ apiKey: 'k', model: 'm', messages: [{ role: 'system', content: 'x' }], title: 't', timeoutMs: 20 });
    clearTimeout(keepAlive);
    assert.deepEqual(result, { ok: false, kind: 'upstream', status: 0 });
  });

  test('5xx and empty answers are typed failures', async () => {
    globalThis.fetch = (async () => new Response('busy', { status: 503 })) as typeof fetch;
    assert.deepEqual(await callChat({ apiKey: 'k', model: 'm', messages: [], title: 't' }), { ok: false, kind: 'upstream', status: 503 });
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch;
    assert.deepEqual(await callChat({ apiKey: 'k', model: 'm', messages: [], title: 't' }), { ok: false, kind: 'empty' });
  });
});
