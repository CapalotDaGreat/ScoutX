import { TRUST_STORAGE_KEY } from '@/features/trust-system/constants';
import {
  parseTrustProfile,
  parseTrustRecommendation,
  sortRecommendations,
} from '@/features/trust-system/models/TrustModel';
import {
  type TrustProfile,
  type TrustRecommendation,
} from '@/features/trust-system/types';
import {
  readKeyedValue,
  removeKeyedListItem,
  upsertKeyedListItem,
  writeKeyedValue,
} from '@/data/scopedAsyncStorage';

function recommendationsKey(): string {
  return `${TRUST_STORAGE_KEY}/recommendations`;
}

function profilesKey(): string {
  return `${TRUST_STORAGE_KEY}/profiles`;
}

export async function loadLocalTrustProfile(playerId: string): Promise<TrustProfile | null> {
  const profile = await readKeyedValue<TrustProfile>(profilesKey(), playerId);
  return profile ? parseTrustProfile(profile, playerId) : null;
}

export async function saveLocalTrustProfile(profile: TrustProfile): Promise<void> {
  await writeKeyedValue(profilesKey(), profile.playerId, profile);
}

export async function loadLocalTrustRecommendations(
  playerId: string,
): Promise<TrustRecommendation[]> {
  const recommendations = (await readKeyedValue<TrustRecommendation[]>(
    recommendationsKey(),
    playerId,
  )) ?? [];

  return sortRecommendations(
    recommendations
      .map((item) => parseTrustRecommendation(item, item.id))
      .filter((item): item is TrustRecommendation => item !== null),
  );
}

export async function saveLocalTrustRecommendation(
  recommendation: TrustRecommendation,
): Promise<void> {
  await upsertKeyedListItem(
    recommendationsKey(),
    recommendation.playerId,
    recommendation,
    sortRecommendations,
  );
}

export async function deleteLocalTrustRecommendation(
  playerId: string,
  recommendationId: string,
): Promise<void> {
  await removeKeyedListItem<TrustRecommendation>(
    recommendationsKey(),
    playerId,
    recommendationId,
  );
}
