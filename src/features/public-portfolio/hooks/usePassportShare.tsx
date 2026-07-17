import { useCallback, useRef, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { FootballPassportShareCardView } from '@/features/share-cards/components/FootballPassportShareCardView';
import { type PassportShareCardData } from '@/features/share-cards/services/passportShareCardData';
import { shareCapturedView } from '@/features/share-cards/services/shareCardService';

export type UsePassportShareResult = {
  isSharing: boolean;
  shareError: string | null;
  shareAsImage: () => Promise<void>;
  ShareCaptureLayer: () => ReactElement;
};

export function usePassportShare(data: PassportShareCardData): UsePassportShareResult {
  const captureRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const shareAsImage = useCallback(async () => {
    if (!captureRef.current) {
      setShareError('Share card is not ready yet.');
      return;
    }

    setIsSharing(true);
    setShareError(null);

    try {
      await shareCapturedView(captureRef, {
        dialogTitle: `${data.playerName} — Football Passport`,
        mimeType: 'image/png',
      });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to share passport card.');
    } finally {
      setIsSharing(false);
    }
  }, [data.playerName]);

  const ShareCaptureLayer = useCallback(() => {
    return (
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: -9999, top: 0, opacity: 0 }}
      >
        <View ref={captureRef} collapsable={false}>
          <FootballPassportShareCardView data={data} />
        </View>
      </View>
    );
  }, [data]);

  return {
    isSharing,
    shareError,
    shareAsImage,
    ShareCaptureLayer,
  };
}
