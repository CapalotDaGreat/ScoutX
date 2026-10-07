import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CoachEndorsementPromptProps = {
  playerName: string;
  isGuest: boolean;
  isPlayerAccount: boolean;
  onSignInPress?: () => void;
  onRegisterPress?: () => void;
};

export function CoachEndorsementPrompt({
  playerName,
  isGuest,
  isPlayerAccount,
  onSignInPress,
  onRegisterPress,
}: CoachEndorsementPromptProps) {
  const { t } = useAppTranslation('portfolio');
  if (!isGuest && !isPlayerAccount) {
    return null;
  }

  return (
    <Card variant="outlined" padding="md" className="gap-3 border-accent/30 bg-accent-muted/40">
      <View>
        <Text variant="overline" color="secondary">
          {t('publicUi.invite.overline')}
        </Text>
        <Text weight="semibold">{t('publicUi.invite.title', { name: playerName })}</Text>
        <Text variant="body-sm" color="secondary">
          {isGuest ? t('publicUi.invite.guestBody') : t('publicUi.invite.playerBody')}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {onSignInPress ? (
          <Button variant="accent" className="flex-1" onPress={onSignInPress}>
            {t('publicUi.invite.signIn')}
          </Button>
        ) : null}
        {onRegisterPress ? (
          <Button variant="secondary" className="flex-1" onPress={onRegisterPress}>
            {t('publicUi.invite.register')}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
