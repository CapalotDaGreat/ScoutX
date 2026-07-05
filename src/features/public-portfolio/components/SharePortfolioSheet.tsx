import { useState } from 'react';
import { Share, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { PortfolioQrCode } from '@/features/public-portfolio/components/PortfolioQrCode';
import { usePortfolioSharing } from '@/features/public-portfolio/hooks/usePortfolioSharing';

export type SharePortfolioSheetProps = {
  visible: boolean;
  playerId: string;
  playerName: string;
  onClose: () => void;
};

export function SharePortfolioSheet({
  visible,
  playerId,
  playerName,
  onClose,
}: SharePortfolioSheetProps) {
  const { shareUrl } = usePortfolioSharing(playerId);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await Share.share({
      title: `${playerName} — ScoutX Portfolio`,
      message: `View ${playerName}'s football portfolio on ScoutX: ${shareUrl}`,
      url: shareUrl,
    });
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Share portfolio" size="md">
      <View className="items-center gap-5">
        <Text variant="body-sm" color="secondary" className="text-center">
          Share this premium football résumé via link or QR code.
        </Text>

        <PortfolioQrCode value={shareUrl} />

        <Text variant="body-sm" className="text-center">
          {shareUrl}
        </Text>

        <View className="w-full gap-2">
          <Button variant="accent" onPress={() => void handleShare()}>
            Share link
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setCopied(true);
            }}
          >
            {copied ? 'Link ready to share' : 'Copy link'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
