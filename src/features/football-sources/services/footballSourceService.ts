import { Linking } from 'react-native';
import { createCallableFunction } from '@/firebase/callableFunctions';
import {
  parseFootballSourceUrl,
  type ExternalFootballSource,
  type FootballSourceType,
  type FootballSourceVisibility,
} from '@/features/football-sources/core';

/** Reasons the server returns in `details.reason`; anything else maps to `unknown`. */
export type FootballSourceErrorReason =
  | 'duplicate'
  | 'limit_reached'
  | 'guardian_scope_required'
  | 'under_review'
  | 'provider_disabled'
  | 'unsupported_provider'
  | 'invalid_match'
  | 'unknown';

const KNOWN_REASONS: readonly FootballSourceErrorReason[] = [
  'duplicate',
  'limit_reached',
  'guardian_scope_required',
  'under_review',
  'provider_disabled',
  'unsupported_provider',
  'invalid_match',
];

export class FootballSourceError extends Error {
  readonly reason: FootballSourceErrorReason;

  constructor(reason: FootballSourceErrorReason) {
    super(reason);
    this.reason = reason;
  }
}

function toSourceError(error: unknown): FootballSourceError {
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  const reason = typeof details?.reason === 'string' ? details.reason : '';
  return new FootballSourceError(
    (KNOWN_REASONS as readonly string[]).includes(reason) ? (reason as FootballSourceErrorReason) : 'unknown',
  );
}

async function invoke<TRequest>(name: string, input: TRequest): Promise<unknown> {
  const callable = createCallableFunction<TRequest>(name);
  if (!callable) throw new FootballSourceError('unknown');
  try {
    return (await callable(input)).data;
  } catch (error) {
    throw toSourceError(error);
  }
}

export async function addExternalFootballSource(url: string, sourceType: FootballSourceType): Promise<ExternalFootballSource> {
  const data = (await invoke('addExternalFootballSource', { url, sourceType })) as { source: ExternalFootballSource };
  return data.source;
}

export async function updateExternalFootballSource(input: {
  sourceId: string;
  sourceType?: FootballSourceType;
  visibility?: FootballSourceVisibility;
  matchIds?: string[];
}): Promise<ExternalFootballSource> {
  const data = (await invoke('updateExternalFootballSource', input)) as { source: ExternalFootballSource };
  return data.source;
}

export async function removeExternalFootballSource(sourceId: string): Promise<void> {
  await invoke('removeExternalFootballSource', { sourceId });
}

/**
 * Hands the link to the system browser. Re-checked against the allowlist first, so a projected
 * or cached link to a host that is no longer approved is never opened from the app.
 */
export async function openExternalFootballSource(url: string): Promise<boolean> {
  const parsed = parseFootballSourceUrl(url);
  if (!parsed.ok) return false;
  await Linking.openURL(parsed.url);
  return true;
}
