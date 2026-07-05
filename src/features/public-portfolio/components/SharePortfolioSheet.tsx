import { useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { PortfolioQrCode } from '@/features/public-portfolio/components/PortfolioQrCode';
import { usePortfolioSharing } from '@/features/public-portfolio/hooks/usePortfolioSharing';

export type SharePortfolioSheetProps = {
  visible: boolean;
  playerId: string;
  playerName: string;
  username?: string | null;
  onClose: () => void;
};

export function SharePortfolioSheet({
  visible,
  playerId,
  playerName,
  username,
  onClose,
}: SharePortfolioSheetProps) {
  const { shareUrl } = usePortfolioSharing(playerId, username);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await Share.share({
      title: `${playerName} — ScoutX Portfolio`,
      message: `View ${playerName}'s football portfolio on ScoutX: ${shareUrl}`,
      url: shareUrl,
    });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Share portfolio" size="md">
      <View className="items-center gap-5">
        <Text variant="body-sm" color="secondary" className="text-center">
          Share this Football Passport via link or QR code.
        </Text>

        <PortfolioQrCode value={shareUrl} />

        <Text variant="body-sm" className="text-center">
          {shareUrl}
        </Text>

        <View className="w-full gap-2">
          <Button variant="accent" onPress={() => void handleShare()}>
            Share link
          </Button>
          <Button variant="secondary" onPress={() => void handleCopy()}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
