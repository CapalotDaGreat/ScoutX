import type { ParsedAuthActionLink } from '@/config/deepLinking';

let pendingAuthAction: ParsedAuthActionLink | null = null;

/**
 * Buffers auth deep links received before NavigationContainer finishes auth bootstrap.
 */
export function stashPendingAuthAction(action: ParsedAuthActionLink): void {
  pendingAuthAction = action;
}

export function consumePendingAuthAction(): ParsedAuthActionLink | null {
  const next = pendingAuthAction;
  pendingAuthAction = null;
  return next;
}

export function peekPendingAuthAction(): ParsedAuthActionLink | null {
  return pendingAuthAction;
}
