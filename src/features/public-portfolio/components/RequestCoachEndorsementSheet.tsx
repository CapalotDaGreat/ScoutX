import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { buildCoachEndorsementInviteUrl } from '@/features/public-portfolio/constants';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

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
  const { t } = useAppTranslation('portfolio');
  const inviteUrl = useMemo(
    () => buildCoachEndorsementInviteUrl(playerId, username),
    [playerId, username],
  );
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await Share.share({
      title: t('endorsementInvite.shareTitle', { playerName }),
      message: t('endorsementInvite.shareMessage', { url: inviteUrl }),
      url: inviteUrl,
    });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
  };

  return (
    <Modal visible={visible} onClose={onClose} title={t('endorsementInvite.title')} size="md">
      <View className="gap-4">
        <Text variant="body-sm" color="secondary">
          {t('endorsementInvite.description')}
        </Text>
        <Text variant="body-sm">{inviteUrl}</Text>
        <Button variant="accent" onPress={() => void handleShare()}>
          {t('endorsementInvite.shareInvite')}
        </Button>
        <Button variant="secondary" onPress={() => void handleCopy()}>
          {copied ? t('endorsementInvite.linkCopied') : t('endorsementInvite.copyInviteLink')}
        </Button>
      </View>
    </Modal>
  );
}
