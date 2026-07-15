import type { CallableOptions } from 'firebase-functions/v2/https';

function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

function shouldEnforceAppCheck(): boolean {
  if (isFunctionsEmulator()) {
    return false;
  }

  return process.env.ENFORCE_APP_CHECK !== 'false';
}

export function createCallableOptions(
  overrides: Partial<CallableOptions> = {},
): CallableOptions {
  return {
    cors: true,
    enforceAppCheck: shouldEnforceAppCheck(),
    ...overrides,
  };
}
