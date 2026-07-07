import { useMemo, useState } from 'react';
import { Share, Switch, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { PortfolioQrCode } from '@/features/public-portfolio/components/PortfolioQrCode';
import { usePortfolioSharing } from '@/features/public-portfolio/hooks/usePortfolioSharing';
import { usePassportShare } from '@/features/public-portfolio/hooks/usePassportShare';
import { usePublicPortfolio } from '@/features/public-portfolio/hooks/usePublicPortfolio';
import { buildPassportShareCardData } from '@/features/share-cards/services/passportShareCardData';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

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
  const { t } = useAppTranslation('portfolio');
  const { shareUrl } = usePortfolioSharing(playerId, username);
  const { data: portfolioData } = usePublicPortfolio(visible ? playerId : null);
  const [copied, setCopied] = useState(false);

  const shareCardData = useMemo(() => {
    if (!portfolioData) {
      return null;
    }
    return buildPassportShareCardData(portfolioData, username);
  }, [portfolioData, username]);

  const { shareAsImage, isSharing, shareError, ShareCaptureLayer } = usePassportShare(
    shareCardData ?? {
      playerName,
      position: '',
      club: '',
      nationality: '',
      goals: 0,
      assists: 0,
      matches: 0,
      endorsements: 0,
      portfolioUrl: shareUrl,
      tagline: t('shareSheet.tagline'),
    },
  );

  const handleShareLink = async () => {
    await Share.share({
      title: t('shareSheet.shareTitle', { playerName }),
      message: t('shareSheet.shareMessage', { playerName, url: shareUrl }),
      url: shareUrl,
    });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
  };

  return (
    <>
      {shareCardData ? <ShareCaptureLayer /> : null}
      <Modal visible={visible} onClose={onClose} title={t('shareSheet.title')} size="md">
        <View className="items-center gap-5">
          <Text variant="body-sm" color="secondary" className="text-center">
            {t('shareSheet.description')}
          </Text>

          <PortfolioQrCode value={shareUrl} />

          <Text variant="body-sm" className="text-center">
            {shareUrl}
          </Text>

          {shareError ? (
            <Text variant="body-sm" color="error" className="text-center">
              {shareError}
            </Text>
          ) : null}

          <View className="w-full gap-2">
            <Button
              variant="accent"
              loading={isSharing}
              disabled={!shareCardData}
              onPress={() => void shareAsImage()}
            >
              {t('shareSheet.shareSocialCard')}
            </Button>
            <Button variant="secondary" onPress={() => void handleShareLink()}>
              {t('shareSheet.shareLink')}
            </Button>
            <Button variant="secondary" onPress={() => void handleCopy()}>
              {copied ? t('shareSheet.linkCopied') : t('shareSheet.copyLink')}
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}
