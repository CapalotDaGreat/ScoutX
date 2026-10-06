import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { queryKeys } from '@/data/queryKeys';
import {
  createDevelopmentGoal,
  createTrainingSession,
  repeatTrainingDraft,
} from '@/features/development/models/DevelopmentModels';
import { DevelopmentRepository } from '@/features/development/repositories/DevelopmentRepository';
import { buildBeforeVsNow } from '@/features/development/services/beforeVsNowService';
import {
  measureBaseline,
  sortGoalSummaries,
  summarizeGoal,
} from '@/features/development/services/goalProgressService';
import {
  buildHowIPlay,
  identityChanged,
  snapshotFromProfile,
  sortSnapshotsNewestFirst,
} from '@/features/development/services/howIPlayService';
import {
  type BeforeVsNowComparison,
  type DevelopmentGoal,
  type DevelopmentGoalDraft,
  type GoalProgressEntry,
  type GoalProgressSummary,
  type GoalStatus,
  type HowIPlay,
  type IdentitySnapshot,
  type TrainingSession,
  type TrainingSessionDraft,
} from '@/features/development/types';
import { goalNextStep } from '@/features/intelligence/services/goalNextStep';
import { type GoalNextStep } from '@/features/intelligence/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { workflowEvents } from '@/features/today/services/workflowStores';

export type UseDevelopmentOptions = {
  userId: string | null;
  profile: PlayerProfile | null;
  matches: readonly PlayerMatchStatistics[];
  /** Lets a stalled goal suggest asking the coach instead of changing practice alone. */
  hasCoachConnection?: boolean;
};

export type UseDevelopmentResult = {
  goals: GoalProgressSummary[];
  /** Single next action per goal id, derived from matches and training. */
  nextSteps: Record<string, GoalNextStep>;
  trainingSessions: TrainingSession[];
  identitySnapshots: IdentitySnapshot[];
  beforeVsNow: BeforeVsNowComparison[];
  howIPlay: HowIPlay | null;
  isLoading: boolean;
  /** Non-null when loading failed; derived sections still render from matches. */
  loadError: Error | null;
  isSaving: boolean;
  refetch: () => void;
  createGoal: (draft: DevelopmentGoalDraft) => Promise<DevelopmentGoal>;
  addGoalProgress: (goalId: string, note: string, value: number | null) => Promise<void>;
  setGoalStatus: (goalId: string, status: GoalStatus) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  logTraining: (draft: TrainingSessionDraft) => Promise<TrainingSession>;
  repeatLastTraining: () => Promise<TrainingSession | null>;
  deleteTraining: (sessionId: string) => Promise<void>;
};

const EMPTY_GOALS: DevelopmentGoal[] = [];
const EMPTY_SESSIONS: TrainingSession[] = [];
const EMPTY_SNAPSHOTS: IdentitySnapshot[] = [];

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function useDevelopment({
  userId,
  profile,
  matches,
  hasCoachConnection = false,
}: UseDevelopmentOptions): UseDevelopmentResult {
  const queryClient = useQueryClient();
  const repository = DevelopmentRepository.getInstance();
  const enabled = Boolean(userId) && isFirebaseConfiguredForProject();
  const ownerId = userId ?? '';

  const goalsQuery = useQuery({
    queryKey: queryKeys.development.goals(ownerId),
    queryFn: () => repository.listGoals(ownerId),
    enabled,
  });
  const trainingQuery = useQuery({
    queryKey: queryKeys.development.trainingSessions(ownerId),
    queryFn: () => repository.listTrainingSessions(ownerId),
    enabled,
  });
  const snapshotsQuery = useQuery({
    queryKey: queryKeys.development.snapshots(ownerId),
    queryFn: () => repository.listIdentitySnapshots(ownerId),
    enabled,
  });

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.development.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.today.plan(ownerId) });
    workflowEvents.emit();
  }, [ownerId, queryClient]);

  const rawGoals = goalsQuery.data ?? EMPTY_GOALS;
  const trainingSessions = trainingQuery.data ?? EMPTY_SESSIONS;
  const rawSnapshots = snapshotsQuery.data ?? EMPTY_SNAPSHOTS;

  const goals = useMemo(() => {
    const now = new Date();
    return sortGoalSummaries(rawGoals.map((goal) => summarizeGoal(goal, matches, now)));
  }, [matches, rawGoals]);

  const nextSteps = useMemo(() => {
    const now = new Date();
    const steps: Record<string, GoalNextStep> = {};
    for (const summary of goals) {
      steps[summary.goal.id] = goalNextStep(summary, {
        matches,
        trainingSessions,
        hasCoachConnection,
        now,
      });
    }
    return steps;
  }, [goals, hasCoachConnection, matches, trainingSessions]);

  const beforeVsNow = useMemo(() => buildBeforeVsNow(matches), [matches]);
  const howIPlay = useMemo(() => (profile ? buildHowIPlay(profile, matches) : null), [matches, profile]);
  const identitySnapshots = useMemo(() => sortSnapshotsNewestFirst(rawSnapshots), [rawSnapshots]);
  const latestSnapshot = identitySnapshots[0] ?? null;

  // Record an identity snapshot when the self-reported identity changes (owner only).
  const lastIdentityKey = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !profile || !snapshotsQuery.isSuccess) {
      return;
    }
    const candidate = snapshotFromProfile(profile, new Date());
    const key = [
      candidate.position ?? '',
      candidate.club ?? '',
      candidate.style ?? '',
      candidate.strongFoot ?? '',
      candidate.secondaryPositions.join(','),
    ].join('|');
    if (lastIdentityKey.current === key || !identityChanged(latestSnapshot, candidate)) {
      lastIdentityKey.current = key;
      return;
    }
    lastIdentityKey.current = key;
    const snapshot: IdentitySnapshot = { id: repository.newId('identity'), ...candidate };
    void repository.saveIdentitySnapshot(snapshot).then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.development.snapshots(ownerId) });
    });
  }, [enabled, latestSnapshot, ownerId, profile, queryClient, repository, snapshotsQuery.isSuccess]);

  const saveGoalMutation = useMutation({
    mutationFn: (goal: DevelopmentGoal) => repository.saveGoal(goal),
    onSuccess: invalidateAll,
  });
  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: string) => repository.deleteGoal(ownerId, goalId),
    onSuccess: invalidateAll,
  });
  const saveTrainingMutation = useMutation({
    mutationFn: (session: TrainingSession) => repository.saveTrainingSession(session),
    onSuccess: invalidateAll,
  });
  const deleteTrainingMutation = useMutation({
    mutationFn: (sessionId: string) => repository.deleteTrainingSession(ownerId, sessionId),
    onSuccess: invalidateAll,
  });

  const requireOwner = useCallback(() => {
    if (!userId) {
      throw new Error('Sign in to track development.');
    }
    return userId;
  }, [userId]);

  const createGoal = useCallback(
    async (draft: DevelopmentGoalDraft) => {
      const owner = requireOwner();
      const now = new Date();
      const createdAt = now.toISOString();
      const baseline = measureBaseline({ metricKey: draft.metricKey, createdAt }, matches);
      const goal = createDevelopmentGoal(owner, repository.newId('goal'), draft, baseline, now);
      await saveGoalMutation.mutateAsync(goal);
      return goal;
    },
    [matches, repository, requireOwner, saveGoalMutation],
  );

  const addGoalProgress = useCallback(
    async (goalId: string, note: string, value: number | null) => {
      requireOwner();
      const goal = rawGoals.find((item) => item.id === goalId);
      if (!goal) {
        throw new Error('Goal not found.');
      }
      const now = new Date();
      const entry: GoalProgressEntry = {
        id: repository.newId('progress'),
        date: now.toISOString(),
        note: note.trim(),
        value,
        evidenceIds: [],
        source: 'manual',
      };
      await saveGoalMutation.mutateAsync({
        ...goal,
        progress: [...goal.progress, entry],
        status: goal.status === 'not_started' ? 'active' : goal.status,
        updatedAt: now.toISOString(),
      });
    },
    [rawGoals, repository, requireOwner, saveGoalMutation],
  );

  const setGoalStatus = useCallback(
    async (goalId: string, status: GoalStatus) => {
      requireOwner();
      const goal = rawGoals.find((item) => item.id === goalId);
      if (!goal) {
        throw new Error('Goal not found.');
      }
      const now = new Date().toISOString();
      await saveGoalMutation.mutateAsync({
        ...goal,
        status,
        achievedAt: status === 'achieved' ? now : null,
        updatedAt: now,
      });
    },
    [rawGoals, requireOwner, saveGoalMutation],
  );

  const deleteGoal = useCallback(
    async (goalId: string) => {
      requireOwner();
      await deleteGoalMutation.mutateAsync(goalId);
    },
    [deleteGoalMutation, requireOwner],
  );

  const logTraining = useCallback(
    async (draft: TrainingSessionDraft) => {
      const owner = requireOwner();
      const now = new Date();
      const session = createTrainingSession(owner, repository.newId('training'), draft, now);
      await saveTrainingMutation.mutateAsync(session);
      // Link the session to the goals it worked on.
      const linked = rawGoals.filter((goal) => draft.goalIds.includes(goal.id));
      for (const goal of linked) {
        await saveGoalMutation.mutateAsync({
          ...goal,
          linkedTrainingIds: [...goal.linkedTrainingIds, session.id],
          progress: [
            ...goal.progress,
            {
              id: repository.newId('progress'),
              date: now.toISOString(),
              note: session.focus,
              value: null,
              evidenceIds: [],
              source: 'training',
            },
          ],
          status: goal.status === 'not_started' ? 'active' : goal.status,
          updatedAt: now.toISOString(),
        });
      }
      return session;
    },
    [rawGoals, repository, requireOwner, saveGoalMutation, saveTrainingMutation],
  );

  const repeatLastTraining = useCallback(async () => {
    const last = trainingSessions[0];
    if (!last) {
      return null;
    }
    return logTraining(repeatTrainingDraft(last, todayIso(new Date())));
  }, [logTraining, trainingSessions]);

  const deleteTraining = useCallback(
    async (sessionId: string) => {
      requireOwner();
      await deleteTrainingMutation.mutateAsync(sessionId);
    },
    [deleteTrainingMutation, requireOwner],
  );

  const refetch = useCallback(() => {
    void goalsQuery.refetch();
    void trainingQuery.refetch();
    void snapshotsQuery.refetch();
  }, [goalsQuery, snapshotsQuery, trainingQuery]);

  const loadError = (goalsQuery.error ?? trainingQuery.error ?? snapshotsQuery.error) as Error | null;

  return {
    goals,
    nextSteps,
    trainingSessions,
    identitySnapshots,
    beforeVsNow,
    howIPlay,
    isLoading: enabled && (goalsQuery.isPending || trainingQuery.isPending),
    loadError,
    isSaving:
      saveGoalMutation.isPending ||
      deleteGoalMutation.isPending ||
      saveTrainingMutation.isPending ||
      deleteTrainingMutation.isPending,
    refetch,
    createGoal,
    addGoalProgress,
    setGoalStatus,
    deleteGoal,
    logTraining,
    repeatLastTraining,
    deleteTraining,
  };
}
