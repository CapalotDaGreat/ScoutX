import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { submitPlayerVerificationRequest } from '@/features/verification-system/services/verificationService';

export type PlayerVerificationCardProps = {
  playerId: string;
  playerName: string;
};

export function PlayerVerificationCard({ playerId, playerName }: PlayerVerificationCardProps) {
  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="overline" color="secondary">
        Verification
      </Text>
      <Text weight="semibold">Request portfolio verification</Text>
      <Text variant="body-sm" color="secondary">
        Submit your Football Passport for review. Verified players rank higher in scout search.
      </Text>
      <Button
        variant="secondary"
        onPress={() =>
          void submitPlayerVerificationRequest(
            playerId,
            playerName,
            'Player requested Football Passport verification via ScoutX.',
          )
        }
      >
        Request verification
      </Button>
    </Card>
  );
}
