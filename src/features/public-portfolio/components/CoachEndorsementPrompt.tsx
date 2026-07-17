import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';

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
  if (!isGuest && !isPlayerAccount) {
    return null;
  }

  return (
    <Card variant="outlined" padding="md" className="gap-3 border-accent/30 bg-accent-muted/40">
      <View>
        <Text variant="overline" color="secondary">
          Coach endorsement invite
        </Text>
        <Text weight="semibold">Endorse {playerName}</Text>
        <Text variant="body-sm" color="secondary">
          {isGuest
            ? 'Sign in with a scout account to publish a coach recommendation on this Football Passport.'
            : 'Player accounts cannot publish coach endorsements. Sign in with a scout account to continue.'}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {onSignInPress ? (
          <Button variant="accent" className="flex-1" onPress={onSignInPress}>
            Sign in
          </Button>
        ) : null}
        {onRegisterPress ? (
          <Button variant="secondary" className="flex-1" onPress={onRegisterPress}>
            Create scout account
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
