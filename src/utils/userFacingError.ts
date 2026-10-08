/**
 * Converts unknown errors (Firebase, network, callable) into short, actionable copy.
 * Raw Firebase/SDK messages must never reach the UI.
 */

const CODE_MESSAGES: Record<string, string> = {
  'permission-denied': "You don't have access to do that. Try signing in again.",
  'storage/unauthorized': "You don't have access to upload this file. Try signing in again.",
  unauthenticated: 'Your session expired. Please sign in again.',
  'storage/unauthenticated': 'Your session expired. Please sign in again.',
  unavailable: "PitchProof can't reach the server right now. Check your connection and try again.",
  'deadline-exceeded': 'This is taking longer than expected. Please try again.',
  'resource-exhausted': 'Too many requests right now. Please wait a moment and try again.',
  'storage/quota-exceeded': 'Storage is full right now. Please try again later.',
  'storage/retry-limit-exceeded': 'The upload kept failing. Check your connection and try again.',
  'storage/canceled': 'The upload was cancelled.',
  upload_too_large: 'This file is too large to upload. Trim or compress it and try again.',
  'not-found': "We couldn't find that item. It may have been removed.",
  'storage/object-not-found': "We couldn't find that file. It may have been removed.",
  'already-exists': 'This already exists.',
  'invalid-argument': 'Some details look incorrect. Please check and try again.',
  'network-request-failed': 'No internet connection. Check your connection and try again.',
};

const RAW_MESSAGE_MARKERS = [
  'firebase',
  'firestore',
  'functions/',
  'storage/',
  'auth/',
  'internal',
  'exception',
  'stack',
  'undefined',
  'null',
  'openrouter',
  'api key',
];

function extractCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const { code } = error as { code: unknown };
  if (typeof code !== 'string') {
    return null;
  }
  return code.replace(/^(functions|firestore|auth)\//, '');
}

function looksRaw(message: string): boolean {
  const lower = message.toLowerCase();
  return message.length > 160 || RAW_MESSAGE_MARKERS.some((marker) => lower.includes(marker));
}

function isNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('network') || lower.includes('offline') || lower.includes('timed out');
}

export function toUserMessage(error: unknown, fallback: string): string {
  const code = extractCode(error);
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) {
    return fallback;
  }
  if (isNetworkMessage(message)) {
    return CODE_MESSAGES['network-request-failed'];
  }
  if (code === 'failed-precondition' && !looksRaw(message)) {
    return message;
  }
  if (!code && !looksRaw(message)) {
    return message;
  }
  return fallback;
}
