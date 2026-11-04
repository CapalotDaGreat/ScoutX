import type { CallableOptions } from 'firebase-functions/v2/https';

/** Exported for unit tests. Emulator always off; production defaults on unless ENFORCE_APP_CHECK=false. */
export function shouldEnforceAppCheck(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.FUNCTIONS_EMULATOR === 'true') {
    return false;
  }

  return env.ENFORCE_APP_CHECK !== 'false';
}

/**
 * Browser origins allowed to call functions. The iOS app sends no Origin header, so
 * production needs none; the emulator allows any origin for the local web build.
 * CALLABLE_ALLOWED_ORIGINS is a comma-separated list of exact https origins.
 */
export function resolveCallableCors(env: NodeJS.ProcessEnv = process.env): string[] | boolean {
  if (env.FUNCTIONS_EMULATOR === 'true') {
    return true;
  }
  const origins = (env.CALLABLE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin));
  return origins.length > 0 ? origins : false;
}

export function createCallableOptions(
  overrides: Partial<CallableOptions> = {},
  env: NodeJS.ProcessEnv = process.env,
): CallableOptions {
  return {
    cors: resolveCallableCors(env),
    enforceAppCheck: shouldEnforceAppCheck(env),
    ...overrides,
  };
}
