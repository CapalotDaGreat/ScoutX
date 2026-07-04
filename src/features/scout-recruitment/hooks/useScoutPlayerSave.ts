import { useCallback } from 'react';
import { useRecruitment } from '@/features/scout-recruitment/context/RecruitmentProvider';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export function useScoutPlayerSave() {
  const recruitment = useRecruitment();

  const isSaved = useCallback(
    (playerId: string) => recruitment.isPlayerTracked(playerId),
    [recruitment],
  );

  const toggleSave = useCallback(
    async (player: DiscoverablePlayer) => {
      await recruitment.togglePlayer(player);
    },
    [recruitment],
  );

  return {
    isReady: recruitment.isReady,
    savedCount: recruitment.savedCount,
    isSaved,
    toggleSave,
    savePlayer: recruitment.savePlayer,
    removePlayer: recruitment.removePlayer,
    movePlayerStage: recruitment.movePlayerStage,
    getEntry: recruitment.getEntry,
  };
}
