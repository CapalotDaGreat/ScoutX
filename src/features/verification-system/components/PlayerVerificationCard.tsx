import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { VerificationBadge } from '@/features/verification-system/components/VerificationBadge';
import { usePlayerVerification } from '@/features/verification-system/hooks/usePlayerVerification';
import { resolveVerificationBadgeLabel } from '@/features/verification-system/services/verificationService';

export type PlayerVerificationCardProps = {
  playerId: string;
  playerName: string;
};

export function PlayerVerificationCard({ playerId, playerName }: PlayerVerificationCardProps) {
  const { state, isLoading, isSubmitting, error, canRequest, requestVerification } =
    usePlayerVerification(playerId);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    setRequested(false);
  }, [playerId]);

  const badgeLevel = state?.level ?? 'none';
  const badgeLabel = resolveVerificationBadgeLabel(badgeLevel);

  const handleRequest = useCallback(async () => {
    await requestVerification(
      `${playerName} requested Football Passport verification via ScoutX.`,
    );
    setRequested(true);
  }, [playerName, requestVerification]);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="overline" color="secondary">
            Verification
          </Text>
          <Text weight="semibold">Football Passport verification</Text>
          <Text variant="body-sm" color="secondary">
            Verified players rank higher in scout discovery and build trust faster.
          </Text>
        </View>
        {badgeLevel !== 'none' ? <VerificationBadge level={badgeLevel} /> : null}
      </View>

      {isLoading ? (
        <Text variant="body-sm" color="secondary">
          Checking verification status…
        </Text>
      ) : null}

      {!isLoading && badgeLevel === 'verified' ? (
        <Text variant="body-sm" color="accent">
          Your Football Passport is verified
          {state?.verifiedAt ? ` · ${state.verifiedAt.slice(0, 10)}` : ''}.
        </Text>
      ) : null}

      {!isLoading && badgeLevel === 'basic' ? (
        <Text variant="body-sm" color="secondary">
          {requested || badgeLabel
            ? 'Your verification request is under review. We will notify you when it is approved.'
            : 'Verification is pending review.'}
        </Text>
      ) : null}

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}

      {canRequest ? (
        <Button variant="secondary" loading={isSubmitting} onPress={() => void handleRequest()}>
          Request verification
        </Button>
      ) : null}
    </Card>
  );
}
