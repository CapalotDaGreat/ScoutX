import {
  type TrustEntityType,
  type TrustRecommendationType,
} from '@/features/trust-system/types';

export const TRUST_RECOMMENDATIONS_COLLECTION = 'trustRecommendations';
export const TRUST_PROFILES_COLLECTION = 'trustProfiles';
export const TRUST_STORAGE_KEY = '@scoutx/trust-recommendations';

export const TRUST_ENTITY_LABELS: Record<TrustEntityType, string> = {
  player: 'Verified Player',
  scout: 'Verified Scout',
  club: 'Verified Club',
  coach: 'Verified Coach',
};

export const TRUST_RECOMMENDATION_LABELS: Record<TrustRecommendationType, string> = {
  coach_recommendation: 'Coach Recommendation',
  scout_endorsement: 'Scout Endorsement',
};

export const TRUST_RECOMMENDATION_SECTION_LABELS: Record<TrustRecommendationType, string> = {
  coach_recommendation: 'Coach Recommendations',
  scout_endorsement: 'Scout Endorsements',
};
