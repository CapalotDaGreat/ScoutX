import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { DevelopmentRepository } from '@/features/development/repositories/DevelopmentRepository';
import { canRetryMatchAnalysis } from '@/features/match-analysis/hooks/useMatchAnalysis';
import { listRecentMatchAnalysisJobs } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import { type MatchAnalysisJob } from '@/features/match-analysis/types';
import { type OnboardingStep } from '@/features/player-onboarding/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { buildTodayPlan } from '@/features/today/services/nextBestActionService';
import {
  loadReviewedAnalysisIds,
  matchLogDraftStore,
  workflowEvents,
} from '@/features/today/services/workflowStores';
import {
  type TodayAnalysisJob,
  type TodayGoal,
  type TodayInput,
  type TodayPlan,
  type TodayTraining,
  type TodayTrial,
} from '@/features/today/types';

export type UseTodayPlanOptions = {
  userId: string | null;
  profile: PlayerProfile | null;
  trials: TrialInvitation[];
  onboardingSteps: OnboardingStep[];
};

export type UseTodayPlanResult = {
  plan: TodayPlan;
  latestAnalysis: TodayAnalysisJob | null;
  upcomingTrial: TodayTrial | null;
  /** True when analyses could not be loaded; analysis suggestions are withheld. */
  analysesUnavailable: boolean;
  isLoading: boolean;
  refresh: () => void;
};

type LocalState = {
  analyses: TodayAnalysisJob[];
  analysesLoaded: boolean;
  reviewedAnalysisIds: string[];
  matchDraft: TodayInput['matchDraft'];
  goals: TodayGoal[];
  trainingSessions: TodayTraining[];
};

const INITIAL_LOCAL_STATE: LocalState = {
  analyses: [],
  analysesLoaded: false,
  reviewedAnalysisIds: [],
  matchDraft: null,
  goals: [],
  trainingSessions: [],
};

function toTodayAnalysis(job: MatchAnalysisJob): TodayAnalysisJob {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    opponent: job.match.opponent,
    matchDate: job.match.date,
    hasReport: Boolean(job.report),
    retryable: canRetryMatchAnalysis(job),
  };
}

async function loadAnalyses(userId: string): Promise<TodayAnalysisJob[] | null> {
  if (!isFirebaseConfiguredForProject()) {
    return [];
  }
  try {
    const jobs = await listRecentMatchAnalysisJobs(userId);
    return jobs.map(toTodayAnalysis);
  } catch {
    return null;
  }
}

export function useTodayPlan({
  userId,
  profile,
  trials,
  onboardingSteps,
}: UseTodayPlanOptions): UseTodayPlanResult {
  const [local, setLocal] = useState<LocalState>(INITIAL_LOCAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => workflowEvents.subscribe(refresh), [refresh]);

  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedRef.current) {
        refresh();
      }
      hasFocusedRef.current = true;
    }, [refresh]),
  );

  useEffect(() => {
    if (!userId) {
      setLocal(INITIAL_LOCAL_STATE);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [analyses, reviewedAnalysisIds, draft, goals, trainingSessions] = await Promise.all([
        loadAnalyses(userId),
        loadReviewedAnalysisIds(userId),
        matchLogDraftStore.load(userId).catch(() => null),
        DevelopmentRepository.getInstance()
          .listGoals(userId)
          .catch(() => []),
        DevelopmentRepository.getInstance()
          .listTrainingSessions(userId)
          .catch(() => []),
      ]);
      if (cancelled) {
        return;
      }
      setLocal({
        analyses: analyses ?? [],
        analysesLoaded: analyses !== null,
        reviewedAnalysisIds,
        matchDraft: draft ? { savedAt: draft.savedAt, opponent: draft.data.opponent.trim() } : null,
        goals: goals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          status: goal.status,
          updatedAt: goal.updatedAt,
          createdAt: goal.createdAt,
        })),
        trainingSessions: trainingSessions.map((session) => ({
          id: session.id,
          date: session.date,
          type: session.type,
        })),
      });
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const matches = profile?.statisticsMatches;
  const videos = profile?.highlightVideos?.videos;

  const input = useMemo<TodayInput>(
    () => ({
      now: new Date(),
      matches: (matches ?? []).map((match) => ({
        id: match.id,
        date: match.date,
        opponent: match.opponent,
      })),
      analyses: local.analyses,
      analysesLoaded: local.analysesLoaded,
      trials: trials.map((trial) => ({
        id: trial.id,
        club: trial.club,
        status: trial.status,
        scheduledDate: trial.scheduledDate,
      })),
      videos: (videos ?? []).map((video) => ({
        id: video.id,
        title: video.title,
        uploadStatus: video.uploadStatus,
      })),
      passportSteps: onboardingSteps.map((step) => ({
        id: step.id,
        title: step.title,
        complete: step.complete,
      })),
      reviewedAnalysisIds: local.reviewedAnalysisIds,
      matchDraft: local.matchDraft,
      goals: local.goals,
      trainingSessions: local.trainingSessions,
      recentlyCompletedTypes: (() => {
        const today = new Date().toISOString().slice(0, 10);
        const types: TodayInput['recentlyCompletedTypes'] = [];
        if (local.goals.some((goal) => goal.createdAt.slice(0, 10) === today)) {
          types.push('set_goal');
        }
        if (local.trainingSessions.some((session) => session.date.slice(0, 10) === today)) {
          types.push('log_training');
        }
        if (local.trainingSessions.some((session) => session.type === 'match_prep' && session.date.slice(0, 10) === today)) {
          types.push('matchday_prep');
        }
        return types;
      })(),
    }),
    [local, matches, onboardingSteps, trials, videos],
  );

  const plan = useMemo(() => buildTodayPlan(input), [input]);

  const latestAnalysis = useMemo(
    () => [...input.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [input.analyses],
  );

  const upcomingTrial = useMemo(() => {
    const nowTime = input.now.getTime();
    return (
      input.trials
        .filter((trial) => trial.status === 'pending' || trial.status === 'accepted' || trial.status === 'rescheduled')
        .filter((trial) => {
          const time = Date.parse(trial.scheduledDate);
          return !Number.isNaN(time) && time >= nowTime - 24 * 60 * 60 * 1000;
        })
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null
    );
  }, [input.now, input.trials]);

  return {
    plan,
    latestAnalysis,
    upcomingTrial,
    analysesUnavailable: !isLoading && !local.analysesLoaded && Boolean(userId),
    isLoading,
    refresh,
  };
}
