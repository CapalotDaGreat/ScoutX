import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import type { SafetyPolicy } from '../safety/policy';
import { loadSafetyPolicy } from '../safety/userSafety';
import {
  FOOTBALL_SOURCES_COLLECTION,
  FOOTBALL_SOURCE_PROVENANCE,
  MAX_FOOTBALL_SOURCES,
  MAX_MATCHES_PER_SOURCE,
  findFootballSourceProvider,
  isFootballSourceType,
  isFootballSourceVisibility,
  parseFootballSourceUrl,
  type ExternalFootballSource,
  type FootballSourceVisibility,
  type PublicFootballSource,
} from './core';

/**
 * Server-authoritative writes for external football source links. Clients cannot write these
 * documents directly; every write re-validates the link here. No function in this module (or
 * anywhere in the feature) requests the linked page.
 */

export function sourcesRef(db: Firestore, uid: string) {
  return db.collection('players').doc(uid).collection(FOOTBALL_SOURCES_COLLECTION);
}

/** Same link, same document: a second add of an equivalent URL cannot create a duplicate. */
export function sourceIdFor(dedupeKey: string): string {
  return createHash('sha256').update(dedupeKey).digest('hex').slice(0, 32);
}

function fail(code: 'invalid-argument' | 'already-exists' | 'resource-exhausted' | 'not-found' | 'failed-precondition', reason: string): never {
  throw new HttpsError(code, reason, { reason });
}

/** Minors need the guardian scope that matches where the link would be shown. */
export function visibilityAllowed(visibility: FootballSourceVisibility, policy: SafetyPolicy): boolean {
  if (visibility === 'private') return true;
  if (visibility === 'passport') return policy.canUsePublicPassport;
  return policy.canBeDiscovered;
}

export async function addFootballSource(
  db: Firestore,
  uid: string,
  input: { url?: unknown; sourceType?: unknown },
  now: Date = new Date(),
): Promise<ExternalFootballSource> {
  const parsed = parseFootballSourceUrl(typeof input.url === 'string' ? input.url : '');
  if (!parsed.ok) fail('invalid-argument', parsed.error);
  if (!isFootballSourceType(input.sourceType)) fail('invalid-argument', 'invalid_source_type');

  const collection = sourcesRef(db, uid);
  const id = sourceIdFor(parsed.dedupeKey);
  const iso = now.toISOString();
  const source: ExternalFootballSource = {
    id,
    ownerId: uid,
    providerId: parsed.provider.id,
    providerName: parsed.provider.name,
    url: parsed.url,
    sourceType: input.sourceType,
    addedBy: 'player',
    addedAt: iso,
    updatedAt: iso,
    provenance: FOOTBALL_SOURCE_PROVENANCE,
    visibility: 'private',
    status: 'active',
    matchIds: [],
  };
  await db.runTransaction(async (tx) => {
    const ref = collection.doc(id);
    const [existing, count] = await Promise.all([tx.get(ref), tx.get(collection.limit(MAX_FOOTBALL_SOURCES))]);
    if (existing.exists) fail('already-exists', 'duplicate');
    if (count.size >= MAX_FOOTBALL_SOURCES) fail('resource-exhausted', 'limit_reached');
    tx.create(ref, { ...source, dedupeKey: parsed.dedupeKey });
  });
  return source;
}

async function knownMatchIds(db: Firestore, uid: string, requested: string[]): Promise<Set<string>> {
  const profile = await db.collection('profiles').doc(uid).get();
  const matches: unknown = profile.get('statisticsMatches');
  const known = new Set(
    (Array.isArray(matches) ? matches : [])
      .map((item: unknown) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string'),
  );
  const missing = requested.filter((id) => !known.has(id));
  if (missing.length > 0) {
    const logs = await db.getAll(...missing.map((id) => db.collection('players').doc(uid).collection('matches').doc(id)));
    logs.filter((snap) => snap.exists).forEach((snap) => known.add(snap.id));
  }
  return known;
}

export async function updateFootballSource(
  db: Firestore,
  uid: string,
  input: { sourceId?: unknown; sourceType?: unknown; visibility?: unknown; matchIds?: unknown },
  now: Date = new Date(),
): Promise<ExternalFootballSource> {
  if (typeof input.sourceId !== 'string' || !input.sourceId) fail('invalid-argument', 'invalid_source');
  const ref = sourcesRef(db, uid).doc(input.sourceId);
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'not_found');
  const current = snap.data() as ExternalFootballSource;
  const patch: Partial<ExternalFootballSource> = {};

  if (input.sourceType !== undefined) {
    if (!isFootballSourceType(input.sourceType)) fail('invalid-argument', 'invalid_source_type');
    patch.sourceType = input.sourceType;
  }
  if (input.visibility !== undefined) {
    if (!isFootballSourceVisibility(input.visibility)) fail('invalid-argument', 'invalid_visibility');
    if (input.visibility !== 'private') {
      if (current.status !== 'active') fail('failed-precondition', 'under_review');
      // The provider must still be on the allowlist before a link is shown to anyone.
      const provider = findFootballSourceProvider(current.providerId);
      const reparsed = parseFootballSourceUrl(current.url);
      if (!provider || !reparsed.ok || reparsed.provider.id !== provider.id) fail('failed-precondition', 'provider_disabled');
      if (!visibilityAllowed(input.visibility, await loadSafetyPolicy(uid, db))) fail('failed-precondition', 'guardian_scope_required');
    }
    patch.visibility = input.visibility;
  }
  if (input.matchIds !== undefined) {
    if (!Array.isArray(input.matchIds) || input.matchIds.some((id) => typeof id !== 'string' || !id)) {
      fail('invalid-argument', 'invalid_match');
    }
    const requested = [...new Set(input.matchIds as string[])];
    if (requested.length > MAX_MATCHES_PER_SOURCE) fail('invalid-argument', 'too_many_matches');
    const known = requested.length > 0 ? await knownMatchIds(db, uid, requested) : new Set<string>();
    if (requested.some((id) => !known.has(id))) fail('invalid-argument', 'invalid_match');
    patch.matchIds = requested;
  }
  if (Object.keys(patch).length === 0) return current;
  patch.updatedAt = now.toISOString();
  await ref.update(patch);
  return { ...current, ...patch };
}

export async function removeFootballSource(db: Firestore, uid: string, input: { sourceId?: unknown }): Promise<void> {
  if (typeof input.sourceId !== 'string' || !input.sourceId) fail('invalid-argument', 'invalid_source');
  await sourcesRef(db, uid).doc(input.sourceId).delete();
}

/** Active links at the given visibility levels whose provider is still allowlisted. */
export async function loadVisibleSources(
  db: Firestore,
  uid: string,
  levels: readonly FootballSourceVisibility[],
): Promise<PublicFootballSource[]> {
  const snapshot = await sourcesRef(db, uid).get();
  return snapshot.docs
    .map((doc) => doc.data() as Partial<ExternalFootballSource>)
    .filter(
      (source): source is ExternalFootballSource =>
        source.status === 'active' &&
        typeof source.visibility === 'string' &&
        levels.includes(source.visibility) &&
        typeof source.url === 'string' &&
        (() => {
          const parsed = parseFootballSourceUrl(source.url);
          return parsed.ok && parsed.provider.id === source.providerId;
        })(),
    )
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((source) => ({
      id: source.id,
      providerId: source.providerId,
      providerName: findFootballSourceProvider(source.providerId)?.name ?? source.providerName,
      url: source.url,
      sourceType: source.sourceType,
      provenance: FOOTBALL_SOURCE_PROVENANCE,
    }));
}
