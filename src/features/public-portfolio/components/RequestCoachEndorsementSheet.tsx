import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { buildCoachEndorsementInviteUrl } from '@/features/public-portfolio/constants';

export type RequestCoachEndorsementSheetProps = {
  visible: boolean;
  playerId: string;
  playerName: string;
  username?: string | null;
  onClose: () => void;
};

export function RequestCoachEndorsementSheet({
  visible,
  playerId,
  playerName,
  username,
  onClose,
}: RequestCoachEndorsementSheetProps) {
  const inviteUrl = useMemo(
    () => buildCoachEndorsementInviteUrl(playerId, username),
    [playerId, username],
  );
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await Share.share({
      title: `Coach endorsement for ${playerName}`,
      message: `Hi coach, could you endorse my Football Passport on ScoutX? ${inviteUrl}`,
      url: inviteUrl,
    });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Invite your coach" size="md">
      <View className="gap-4">
        <Text variant="body-sm" color="secondary">
          Send this link to a coach or academy staff member. They can write a signed recommendation that
          appears on your Football Passport.
        </Text>
        <Text variant="body-sm">{inviteUrl}</Text>
        <Button variant="accent" onPress={() => void handleShare()}>
          Share invite
        </Button>
        <Button variant="secondary" onPress={() => void handleCopy()}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </Button>
      </View>
    </Modal>
  );
}
