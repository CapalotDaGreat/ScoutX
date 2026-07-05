import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { RecruitmentRepository } from '@/features/scout-recruitment/repositories/RecruitmentRepository';
import {
  groupEntriesByStage,
  toPlayerSnapshot,
} from '@/features/scout-recruitment/models/RecruitmentModel';
import {
  type RecruitmentFolderDraft,
  type RecruitmentShortlistDraft,
  type RecruitmentStage,
  type RecruitmentWorkspace,
} from '@/features/scout-recruitment/types';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';

type RecruitmentContextValue = {
  isReady: boolean;
  isSaving: boolean;
  workspace: RecruitmentWorkspace | null;
  entriesByStage: ReturnType<typeof groupEntriesByStage>;
  savedCount: number;
  isPlayerTracked: (playerId: string) => boolean;
  getEntry: (playerId: string) => RecruitmentWorkspace['entries'][number] | undefined;
  savePlayer: (
    player: DiscoverablePlayer,
    stage?: RecruitmentStage,
    folderId?: string | null,
  ) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  togglePlayer: (player: DiscoverablePlayer) => Promise<void>;
  movePlayerStage: (playerId: string, stage: RecruitmentStage) => Promise<void>;
  assignFolder: (playerId: string, folderId: string | null) => Promise<void>;
  createFolder: (draft: RecruitmentFolderDraft) => Promise<void>;
  createShortlist: (draft: RecruitmentShortlistDraft) => Promise<void>;
  addToShortlist: (shortlistId: string, playerId: string) => Promise<void>;
  removeFromShortlist: (shortlistId: string, playerId: string) => Promise<void>;
  movePlayerWithinStage: (playerId: string, targetSortIndex: number) => Promise<void>;
};

const RecruitmentContext = createContext<RecruitmentContextValue | null>(null);

type RecruitmentProviderProps = {
  scoutId: string | null;
  scoutName?: string;
  children: ReactNode;
};

export function RecruitmentProvider({
  scoutId,
  scoutName = 'Scout',
  children,
}: RecruitmentProviderProps) {
  const repository = useMemo(() => RecruitmentRepository.getInstance(), []);
  const [workspace, setWorkspace] = useState<RecruitmentWorkspace | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!scoutId) {
      setWorkspace(null);
      setIsReady(true);
      return;
    }

    setIsReady(false);
    const unsubscribe = repository.subscribeToWorkspace(scoutId, (next) => {
      setWorkspace(next);
      setIsReady(true);
    });

    return unsubscribe;
  }, [repository, scoutId]);

  const applyWorkspace = useCallback((next: RecruitmentWorkspace) => {
    setWorkspace(next);
  }, []);

  const runMutation = useCallback(
    async (mutation: () => Promise<RecruitmentWorkspace>) => {
      if (!scoutId) {
        return;
      }
      setIsSaving(true);
      try {
        const next = await mutation();
        applyWorkspace(next);
      } finally {
        setIsSaving(false);
      }
    },
    [applyWorkspace, scoutId],
  );

  const isPlayerTracked = useCallback(
    (playerId: string) => workspace?.entries.some((entry) => entry.playerId === playerId) ?? false,
    [workspace?.entries],
  );

  const getEntry = useCallback(
    (playerId: string) => workspace?.entries.find((entry) => entry.playerId === playerId),
    [workspace?.entries],
  );

  const savePlayer = useCallback(
    async (player: DiscoverablePlayer, stage?: RecruitmentStage, folderId?: string | null) => {
      if (!scoutId) {
        return;
      }
      const wasTracked = isPlayerTracked(player.id);
      await runMutation(() =>
        repository.savePlayer(scoutId, toPlayerSnapshot(player), stage, folderId),
      );
      if (!wasTracked) {
        ActivityRecorder.getInstance().recordPlayerSaved({
          scoutId,
          scoutName,
          playerId: player.id,
          playerName: player.fullName,
        });
      }
    },
    [isPlayerTracked, repository, runMutation, scoutId, scoutName],
  );

  const removePlayer = useCallback(
    async (playerId: string) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.removePlayer(scoutId, playerId));
    },
    [repository, runMutation, scoutId],
  );

  const togglePlayer = useCallback(
    async (player: DiscoverablePlayer) => {
      if (isPlayerTracked(player.id)) {
        await removePlayer(player.id);
      } else {
        await savePlayer(player);
      }
    },
    [isPlayerTracked, removePlayer, savePlayer],
  );

  const movePlayerStage = useCallback(
    async (playerId: string, stage: RecruitmentStage) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.movePlayerStage(scoutId, playerId, stage));
    },
    [repository, runMutation, scoutId],
  );

  const assignFolder = useCallback(
    async (playerId: string, folderId: string | null) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.assignFolder(scoutId, playerId, folderId));
    },
    [repository, runMutation, scoutId],
  );

  const createFolder = useCallback(
    async (draft: RecruitmentFolderDraft) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.addFolder(scoutId, draft));
    },
    [repository, runMutation, scoutId],
  );

  const createShortlist = useCallback(
    async (draft: RecruitmentShortlistDraft) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.addShortlist(scoutId, draft));
    },
    [repository, runMutation, scoutId],
  );

  const addToShortlist = useCallback(
    async (shortlistId: string, playerId: string) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.addToShortlist(scoutId, shortlistId, playerId));
    },
    [repository, runMutation, scoutId],
  );

  const removeFromShortlist = useCallback(
    async (shortlistId: string, playerId: string) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.removeFromShortlist(scoutId, shortlistId, playerId));
    },
    [repository, runMutation, scoutId],
  );

  const movePlayerWithinStage = useCallback(
    async (playerId: string, targetSortIndex: number) => {
      if (!scoutId) {
        return;
      }
      await runMutation(() => repository.reorderWithinStage(scoutId, playerId, targetSortIndex));
    },
    [repository, runMutation, scoutId],
  );

  const entriesByStage = useMemo(
    () => groupEntriesByStage(workspace?.entries ?? []),
    [workspace?.entries],
  );

  const value = useMemo<RecruitmentContextValue>(
    () => ({
      isReady,
      isSaving,
      workspace,
      entriesByStage,
      savedCount: workspace?.entries.length ?? 0,
      isPlayerTracked,
      getEntry,
      savePlayer,
      removePlayer,
      togglePlayer,
      movePlayerStage,
      assignFolder,
      createFolder,
      createShortlist,
      addToShortlist,
      removeFromShortlist,
      movePlayerWithinStage,
    }),
    [
      addToShortlist,
      assignFolder,
      createFolder,
      createShortlist,
      entriesByStage,
      getEntry,
      isPlayerTracked,
      isReady,
      isSaving,
      movePlayerStage,
      movePlayerWithinStage,
      removeFromShortlist,
      removePlayer,
      savePlayer,
      togglePlayer,
      workspace,
    ],
  );

  return (
    <RecruitmentContext.Provider value={value}>{children}</RecruitmentContext.Provider>
  );
}

export function useRecruitment(): RecruitmentContextValue {
  const context = useContext(RecruitmentContext);
  if (!context) {
    throw new Error('useRecruitment must be used within RecruitmentProvider');
  }
  return context;
}
