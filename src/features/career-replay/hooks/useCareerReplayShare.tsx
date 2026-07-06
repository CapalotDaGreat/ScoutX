import { useCallback, useRef, useState, type ReactElement, type RefObject } from 'react';
import { View } from 'react-native';
import { CareerReplayRepository } from '@/features/career-replay/repositories/CareerReplayRepository';
import { type CareerReplayData } from '@/features/career-replay/types';
import { CareerReplayShareCardView } from '@/features/share-cards/components/CareerReplayShareCardView';
import { shareCapturedView } from '@/features/share-cards/services/shareCardService';

export type UseCareerReplayShareResult = {
  captureRef: RefObject<View | null>;
  isSharing: boolean;
  shareError: string | null;
  shareAsImage: () => Promise<void>;
  ShareCaptureLayer: () => ReactElement;
};

export function useCareerReplayShare(
  replay: CareerReplayData,
  playerId?: string,
): UseCareerReplayShareResult {
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
        dialogTitle: `${replay.playerName} — Career Replay`,
        mimeType: 'image/png',
      });

      if (playerId) {
        await CareerReplayRepository.getInstance().saveReplay(playerId, replay);
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to share career replay.');
    } finally {
      setIsSharing(false);
    }
  }, [playerId, replay]);

  const ShareCaptureLayer = useCallback(() => {
    return (
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: -9999, top: 0, opacity: 0 }}
      >
        <View ref={captureRef} collapsable={false}>
          <CareerReplayShareCardView data={replay} />
        </View>
      </View>
    );
  }, [replay]);

  return {
    captureRef,
    isSharing,
    shareError,
    shareAsImage,
    ShareCaptureLayer,
  };
}
