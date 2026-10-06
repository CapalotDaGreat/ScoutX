import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { DevelopmentRepository } from '@/features/development/repositories/DevelopmentRepository';
import { sortGoalSummaries, summarizeGoal } from '@/features/development/services/developmentEngine';
import {
  type CoverageState,
  type DevelopmentGoal,
  type GoalProgressSummary,
  type TrainingSession,
} from '@/features/development/types';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { detectChanges } from '@/features/intelligence/services/changeDetection';
import { goalNextStep } from '@/features/intelligence/services/goalNextStep';
import { nextBestEvidence } from '@/features/intelligence/services/nextBestEvidence';
import { buildSnapshot } from '@/features/intelligence/services/snapshotBuilder';
import { loadSeenSnapshot, saveSeenSnapshot } from '@/features/intelligence/services/snapshotStore';
import {
  type ChangeItem,
  type CoverageDimension,
  type FootballStateSnapshot,
  type GoalNextStep,
  type NextBestEvidence,
} from '@/features/intelligence/types';
import { canRetryMatchAnalysis } from '@/features/match-analysis/hooks/useMatchAnalysis';
import { buildPassportSummary } from '@/features/passport/services/passportSummaryService';
import { type TrustProfile, type TrustRecommendation } from '@/features/trust-system/types';
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
  recommendations?: TrustRecommendation[];
  trustProfile?: TrustProfile | null;
};

export type TodayGoalFocus = {
  summary: GoalProgressSummary;
  nextStep: GoalNextStep;
};

export type UseTodayPlanResult = {
  plan: TodayPlan;
  latestAnalysis: TodayAnalysisJob | null;
  upcomingTrial: TodayTrial | null;
  /** Meaningful changes since this device last showed Today; empty on a first visit. */
  changes: ChangeItem[];
  /** The open goal that most needs attention, with its single next step. */
  goalFocus: TodayGoalFocus | null;
  evidence: NextBestEvidence | null;
  /** True when analyses could not be loaded; analysis suggestions are withheld. */
  analysesUnavailable: boolean;
  isLoading: boolean;
  refresh: () => void;
  /** Marks the current changes as seen so they are not repeated next visit. */
  markChangesSeen: () => void;
};

type LocalState = {
  analyses: TodayAnalysisJob[];
  analysesLoaded: boolean;
  reviewedAnalysisIds: string[];
  matchDraft: TodayInput['matchDraft'];
  goals: TodayGoal[];
  trainingSessions: TodayTraining[];
  rawGoals: DevelopmentGoal[];
  rawTraining: TrainingSession[];
  gpsSessionCount: number;
  seenSnapshot: FootballStateSnapshot | null;
};

const INITIAL_LOCAL_STATE: LocalState = {
  analyses: [],
  analysesLoaded: false,
  reviewedAnalysisIds: [],
  matchDraft: null,
  goals: [],
  trainingSessions: [],
  rawGoals: [],
  rawTraining: [],
  gpsSessionCount: 0,
  seenSnapshot: null,
};

const SELF_SCOPE = 'self';

function verificationLevel(trust: TrustProfile | null | undefined): string | null {
  if (!trust) return null;
  if (!trust.player.verified) return 'none';
  return trust.club.verified || trust.coach?.verified ? 'verified' : 'basic';
}

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

const EMPTY_RECOMMENDATIONS: TrustRecommendation[] = [];

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
  recommendations = EMPTY_RECOMMENDATIONS,
  trustProfile = null,
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
      const [analyses, reviewedAnalysisIds, draft, goals, trainingSessions, gpsSessions, seenSnapshot] =
        await Promise.all([
          loadAnalyses(userId),
          loadReviewedAnalysisIds(userId),
          matchLogDraftStore.load(userId).catch(() => null),
          DevelopmentRepository.getInstance()
            .listGoals(userId)
            .catch(() => []),
          DevelopmentRepository.getInstance()
            .listTrainingSessions(userId)
            .catch(() => []),
          GpsSessionRepository.getInstance()
            .fetchSessions(userId)
            .catch(() => []),
          loadSeenSnapshot(userId, SELF_SCOPE),
        ]);
      if (cancelled) {
        return;
      }
      setLocal({
        rawGoals: goals,
        rawTraining: trainingSessions,
        gpsSessionCount: gpsSessions.length,
        seenSnapshot,
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

  const coverageItems = useMemo(() => {
    if (!profile) return [];
    return buildPassportSummary({
      profile,
      recommendations,
      gpsSessionCount: local.gpsSessionCount,
      now: input.now,
    }).coverage.map((item) => ({ id: item.id, state: item.state }));
  }, [input.now, local.gpsSessionCount, profile, recommendations]);

  const coverage = useMemo(() => {
    const map: Partial<Record<CoverageDimension, CoverageState>> = {};
    for (const item of coverageItems) map[item.id] = item.state;
    return map;
  }, [coverageItems]);

  const completedAnalysisIds = useMemo(
    () => local.analyses.filter((job) => job.status === 'complete').map((job) => job.id),
    [local.analyses],
  );

  const goalSummaries = useMemo(
    () => sortGoalSummaries(local.rawGoals.map((goal) => summarizeGoal(goal, matches ?? [], input.now))),
    [input.now, local.rawGoals, matches],
  );

  const currentSnapshot = useMemo<FootballStateSnapshot | null>(() => {
    if (!profile || isLoading) return null;
    return buildSnapshot({
      now: input.now,
      matchIds: (matches ?? []).map((match) => match.id),
      // Without a successful load, keep what was seen so analyses don't reappear as "new".
      completedAnalysisIds: local.analysesLoaded
        ? completedAnalysisIds
        : (local.seenSnapshot?.completedAnalysisIds ?? []),
      goals: goalSummaries.map((summary) => ({ id: summary.goal.id, status: summary.status })),
      videoIds: (videos ?? []).map((video) => video.id),
      trials: trials.map((trial) => ({ id: trial.id, status: trial.status })),
      primaryPosition: profile.identity.preferredPositions[0] ?? profile.position ?? null,
      verificationLevel: verificationLevel(trustProfile),
      coverage: coverageItems,
      endorsementIds: recommendations.map((recommendation) => recommendation.id),
    });
  }, [
    completedAnalysisIds,
    coverageItems,
    goalSummaries,
    input.now,
    isLoading,
    local.analysesLoaded,
    local.seenSnapshot,
    matches,
    profile,
    recommendations,
    trials,
    trustProfile,
    videos,
  ]);

  const changes = useMemo(
    () => (currentSnapshot ? detectChanges(local.seenSnapshot, currentSnapshot) : []),
    [currentSnapshot, local.seenSnapshot],
  );

  // A first visit has nothing to compare against: record the baseline straight away.
  useEffect(() => {
    if (userId && currentSnapshot && !local.seenSnapshot) {
      void saveSeenSnapshot(userId, SELF_SCOPE, currentSnapshot);
    }
  }, [currentSnapshot, local.seenSnapshot, userId]);

  const latestSnapshotRef = useRef<FootballStateSnapshot | null>(null);
  latestSnapshotRef.current = currentSnapshot;

  const markChangesSeen = useCallback(() => {
    const snapshot = latestSnapshotRef.current;
    if (!userId || !snapshot) return;
    void saveSeenSnapshot(userId, SELF_SCOPE, snapshot);
    setLocal((previous) => ({ ...previous, seenSnapshot: snapshot }));
  }, [userId]);

  // Leaving Today counts as having seen what was shown.
  useFocusEffect(
    useCallback(
      () => () => {
        const snapshot = latestSnapshotRef.current;
        if (userId && snapshot) {
          void saveSeenSnapshot(userId, SELF_SCOPE, snapshot);
        }
      },
      [userId],
    ),
  );

  const goalFocus = useMemo<TodayGoalFocus | null>(() => {
    const summary = goalSummaries.find((item) => item.status !== 'achieved') ?? null;
    if (!summary) return null;
    return {
      summary,
      nextStep: goalNextStep(summary, {
        matches: matches ?? [],
        trainingSessions: local.rawTraining,
        hasCoachConnection: recommendations.some((item) => item.authorRole === 'coach'),
        now: input.now,
      }),
    };
  }, [goalSummaries, input.now, local.rawTraining, matches, recommendations]);

  const evidence = useMemo(() => {
    if (!profile || isLoading) return null;
    return nextBestEvidence({
      matches: matches ?? [],
      coverage,
      completedAnalysisCount: local.analysesLoaded ? completedAnalysisIds.length : 1,
      videoCount: videos?.length ?? 0,
      coachEndorsementCount: recommendations.filter((item) => item.authorRole === 'coach').length,
      gpsSessionCount: local.gpsSessionCount,
      now: input.now,
    });
  }, [
    completedAnalysisIds.length,
    coverage,
    input.now,
    isLoading,
    local.analysesLoaded,
    local.gpsSessionCount,
    matches,
    profile,
    recommendations,
    videos,
  ]);

  return {
    plan,
    latestAnalysis,
    upcomingTrial,
    changes,
    goalFocus,
    evidence,
    analysesUnavailable: !isLoading && !local.analysesLoaded && Boolean(userId),
    isLoading,
    refresh,
    markChangesSeen,
  };
}
