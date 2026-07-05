import { VerificationRepository } from '@/features/verification-system/repositories/VerificationRepository';
import {
  type EntityVerificationState,
  type VerificationBadgeLevel,
  type VerificationRequestDraft,
} from '@/features/verification-system/types';

export function resolveVerificationBadgeLabel(level: VerificationBadgeLevel): string | null {
  switch (level) {
    case 'verified':
      return 'Verified';
    case 'basic':
      return 'Pending verification';
    default:
      return null;
  }
}

export async function fetchPlayerVerificationState(
  playerId: string,
): Promise<EntityVerificationState> {
  return VerificationRepository.getInstance().fetchVerificationState(playerId, 'player');
}

export async function submitPlayerVerificationRequest(
  playerId: string,
  playerName: string,
  evidence: string,
): Promise<void> {
  const draft: VerificationRequestDraft = {
    entityType: 'player',
    entityId: playerId,
    requesterName: playerName,
    evidence,
  };
  await VerificationRepository.getInstance().submitVerificationRequest(playerId, draft);
}

export function isPlayerVerified(state: EntityVerificationState): boolean {
  return state.level === 'verified';
}

export function isDiscoverableVerified(
  verificationState: EntityVerificationState,
  portfolioPublic: boolean,
  coachRecommendations: number,
): boolean {
  return (
    verificationState.level === 'verified' ||
    (portfolioPublic && coachRecommendations > 0) ||
    verificationState.level === 'basic'
  );
}
