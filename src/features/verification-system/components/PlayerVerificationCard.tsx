import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { VerificationBadge } from '@/features/verification-system/components/VerificationBadge';
import { usePlayerVerification } from '@/features/verification-system/hooks/usePlayerVerification';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerVerificationCardProps = {
  playerId: string;
  playerName: string;
};

export function PlayerVerificationCard({ playerId, playerName }: PlayerVerificationCardProps) {
  const { state, isLoading, isSubmitting, error, canRequest, requestVerification } =
    usePlayerVerification(playerId);
  const [requested, setRequested] = useState(false);
  const { t, i18n } = useAppTranslation('trust');

  useEffect(() => {
    setRequested(false);
  }, [playerId]);

  const badgeLevel = state?.level ?? 'none';

  const handleRequest = useCallback(async () => {
    await requestVerification(
      `${playerName} requested Football Passport verification via PitchProof.`,
    );
    setRequested(true);
  }, [playerName, requestVerification]);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="overline" color="secondary">
            {t('verificationCard.overline')}
          </Text>
          <Text weight="semibold">{t('verificationCard.title')}</Text>
          <Text variant="body-sm" color="secondary">
            {t('verificationCard.body')}
          </Text>
        </View>
        {badgeLevel !== 'none' ? <VerificationBadge level={badgeLevel} /> : null}
      </View>

      {isLoading ? (
        <Text variant="body-sm" color="secondary">
          {t('verificationCard.checking')}
        </Text>
      ) : null}

      {!isLoading && badgeLevel === 'verified' ? (
        <Text variant="body-sm" color="accent">
          {state?.verifiedAt
            ? t('verificationCard.verifiedOn', {
                date: new Date(state.verifiedAt).toLocaleDateString(i18n.language),
              })
            : t('verificationCard.verified')}
        </Text>
      ) : null}

      {!isLoading && badgeLevel === 'basic' ? (
        <Text variant="body-sm" color="secondary">
          {t(requested ? 'verificationCard.requested' : 'verificationCard.pending')}
        </Text>
      ) : null}

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}

      {canRequest ? (
        <Button variant="secondary" loading={isSubmitting} onPress={() => void handleRequest()}>
          {t('verificationCard.request')}
        </Button>
      ) : null}
    </Card>
  );
}
