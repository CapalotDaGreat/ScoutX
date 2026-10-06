import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

type VerificationLevel = 'none' | 'basic' | 'verified';

function asLevel(value: unknown): VerificationLevel {
  return value === 'verified' || value === 'basic' ? value : 'none';
}

export function buildTrustProfileFromVerification(
  playerId: string,
  verification: { level?: unknown; verifiedAt?: unknown; dimensions?: unknown },
  nowIso: string,
): Record<string, unknown> {
  const identity = asLevel(verification.level);
  const dimensions =
    verification.dimensions && typeof verification.dimensions === 'object'
      ? (verification.dimensions as Record<string, unknown>)
      : {};
  const club = asLevel(dimensions.club ?? identity);
  const coach = asLevel(dimensions.coach);
  const verifiedAt = typeof verification.verifiedAt === 'string' ? verification.verifiedAt : null;
  return {
    playerId,
    player: { verified: identity === 'verified', verifiedAt: identity === 'verified' ? verifiedAt : null },
    scout: { verified: false, verifiedAt: null },
    club: {
      verified: club === 'verified',
      verifiedAt: club === 'verified' ? verifiedAt : null,
      clubId: null,
      clubName: null,
    },
    coach: { verified: coach === 'verified', verifiedAt: coach === 'verified' ? verifiedAt : null },
    updatedAt: nowIso,
  };
}

export const onVerificationWrittenSyncTrust = onDocumentWritten(
  'verificationStates/{stateId}',
  async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const playerId = typeof after?.entityId === 'string' ? after.entityId : event.params.stateId.replace(/^player-/, '');
    if (!playerId || after?.entityType !== 'player') {
      return;
    }
    try {
      await getFirestore()
        .collection('trustProfiles')
        .doc(playerId)
        .set(buildTrustProfileFromVerification(playerId, after, new Date().toISOString()), { merge: true });
    } catch (error) {
      logger.error('Failed to sync trust profile', { playerId, error });
      throw error;
    }
  },
);
