export { VerificationBadge } from '@/features/trust-system/components/VerificationBadge';
export { VerificationBadgeStrip } from '@/features/trust-system/components/VerificationBadgeStrip';
export { ClubTenureStrip } from '@/features/trust-system/components/ClubTenureStrip';
export { RecommendationCard } from '@/features/trust-system/components/RecommendationCard';
export { ScoutEndorsementModal } from '@/features/trust-system/components/ScoutEndorsementModal';
export { TrustProfileSection } from '@/features/trust-system/components/TrustProfileSection';

export { usePlayerTrust, type UsePlayerTrustResult } from '@/features/trust-system/hooks/usePlayerTrust';
export { TrustRepository } from '@/features/trust-system/repositories/TrustRepository';

export {
  buildClubTenures,
  computeYearsFromPeriod,
  createDefaultTrustProfile,
  getVerificationLabel,
  groupRecommendationsByType,
  sortRecommendations,
} from '@/features/trust-system/models/TrustModel';

export {
  TRUST_ENTITY_LABELS,
  TRUST_RECOMMENDATION_LABELS,
  TRUST_RECOMMENDATION_SECTION_LABELS,
} from '@/features/trust-system/constants';

export type {
  ClubTenure,
  PlayerTrustSnapshot,
  TrustAuthorRole,
  TrustEntityType,
  TrustProfile,
  TrustRecommendation,
  TrustRecommendationDraft,
  TrustRecommendationType,
  TrustVerificationStatus,
} from '@/features/trust-system/types';
