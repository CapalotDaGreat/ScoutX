export { VerificationBadge } from '@/features/verification-system/components/VerificationBadge';
export { PlayerVerificationCard } from '@/features/verification-system/components/PlayerVerificationCard';
export {
  fetchPlayerVerificationState,
  isDiscoverableVerified,
  isPlayerVerified,
  resolveVerificationBadgeLabel,
  submitPlayerVerificationRequest,
} from '@/features/verification-system/services/verificationService';
export type {
  EntityVerificationState,
  VerificationBadgeLevel,
  VerificationRequest,
} from '@/features/verification-system/types';
