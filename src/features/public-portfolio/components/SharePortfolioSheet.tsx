import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { CheckboxRow } from '@/components/primitives/CheckboxRow';
import { Text } from '@/components/primitives/Text';
import { PortfolioQrCode } from '@/features/public-portfolio/components/PortfolioQrCode';
import { usePortfolioSharing } from '@/features/public-portfolio/hooks/usePortfolioSharing';
import { usePassportShare } from '@/features/public-portfolio/hooks/usePassportShare';
import { usePublicPortfolio } from '@/features/public-portfolio/hooks/usePublicPortfolio';
import { isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';
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
  const [includeStatistics, setIncludeStatistics] = useState(true);
  const [includeEndorsements, setIncludeEndorsements] = useState(true);
  const [includeTagline, setIncludeTagline] = useState(true);
  const [includePhoto, setIncludePhoto] = useState(true);
  const [confirmedPreview, setConfirmedPreview] = useState(false);

  const allowStatistics = portfolioData
    ? isPortfolioSectionVisible(portfolioData.privacy, 'statistics')
    : false;
  const allowEndorsements = portfolioData
    ? isPortfolioSectionVisible(portfolioData.privacy, 'recommendations')
    : false;

  const shareCardData = useMemo(() => {
    if (!portfolioData) {
      return null;
    }
    return buildPassportShareCardData(portfolioData, username, {
      includeStatistics: allowStatistics && includeStatistics,
      includeEndorsements: allowEndorsements && includeEndorsements,
      includeTagline,
      includePhoto,
    });
  }, [
    allowEndorsements,
    allowStatistics,
    includeEndorsements,
    includePhoto,
    includeStatistics,
    includeTagline,
    portfolioData,
    username,
  ]);

  const { shareAsImage, isSharing, shareError, ShareCaptureLayer } = usePassportShare(
    shareCardData ?? {
      playerName,
      position: '',
      club: '',
      nationality: '',
      photoUrl: null,
      goals: null,
      assists: null,
      matches: null,
      endorsements: null,
      portfolioUrl: shareUrl,
      tagline: t('shareSheet.tagline'),
      includeStatistics: false,
      includeEndorsements: false,
      includePhoto: false,
      exportPreview: playerName,
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

  const canShareCard = Boolean(shareCardData && portfolioData?.isPublic && confirmedPreview);

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

          {portfolioData?.isPublic ? (
            <View className="w-full gap-2 rounded-lg border border-border bg-background-secondary p-3">
              <Text weight="semibold" variant="body-sm">
                {t('shareSheet.cardFieldsTitle', { defaultValue: 'Social card fields' })}
              </Text>
              <Text variant="caption" color="secondary">
                {t('shareSheet.cardFieldsHint', {
                  defaultValue:
                    'Only fields already public on your Passport can be included. Downloaded copies cannot be recalled.',
                })}
              </Text>
              {allowStatistics ? (
                <CheckboxRow
                  checked={includeStatistics}
                  label={t('shareSheet.includeStatistics', { defaultValue: 'Match statistics' })}
                  onToggle={() => {
                    setIncludeStatistics((value) => !value);
                    setConfirmedPreview(false);
                  }}
                />
              ) : null}
              {allowEndorsements ? (
                <CheckboxRow
                  checked={includeEndorsements}
                  label={t('shareSheet.includeEndorsements', { defaultValue: 'Endorsement count' })}
                  onToggle={() => {
                    setIncludeEndorsements((value) => !value);
                    setConfirmedPreview(false);
                  }}
                />
              ) : null}
              <CheckboxRow
                checked={includePhoto}
                label={t('shareSheet.includePhoto', { defaultValue: 'Profile photo' })}
                onToggle={() => {
                  setIncludePhoto((value) => !value);
                  setConfirmedPreview(false);
                }}
              />
              <CheckboxRow
                checked={includeTagline}
                label={t('shareSheet.includeTagline', { defaultValue: 'Short biography line' })}
                onToggle={() => {
                  setIncludeTagline((value) => !value);
                  setConfirmedPreview(false);
                }}
              />
              {shareCardData ? (
                <View className="gap-1 border-t border-divider pt-2">
                  <Text variant="caption" color="secondary">
                    {t('shareSheet.previewLabel', { defaultValue: 'Export preview' })}
                  </Text>
                  <Text variant="body-sm">{shareCardData.exportPreview}</Text>
                  <CheckboxRow
                    checked={confirmedPreview}
                    label={t('shareSheet.confirmPreview', {
                      defaultValue: 'I have checked the preview and want to share this card',
                    })}
                    onToggle={() => setConfirmedPreview((value) => !value)}
                    testID="share-card-confirm-preview"
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {shareError ? (
            <Text variant="body-sm" color="error" className="text-center">
              {shareError}
            </Text>
          ) : null}

          <View className="w-full gap-2">
            <Button
              variant="accent"
              loading={isSharing}
              disabled={!canShareCard}
              onPress={() => void shareAsImage()}
            >
              {t('shareSheet.shareSocialCard')}
            </Button>
            {!portfolioData?.isPublic ? (
              <Text variant="caption" color="secondary" className="text-center">
                {t('shareSheet.requiresPublicPassport', {
                  defaultValue: 'Turn on your public Football Passport before sharing a card or CV.',
                })}
              </Text>
            ) : null}
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
