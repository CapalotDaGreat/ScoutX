import type {
  ContinueItem,
  NextBestAction,
  TodayAnalysisJob,
  TodayInput,
  TodayPlan,
  TodayTrial,
} from '@/features/today/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_WINDOW_DAYS = 14;
const ANALYZE_WINDOW_DAYS = 7;
const STALE_MATCH_DAYS = 7;
const TRIAL_PREP_WINDOW_DAYS = 7;
const POST_MATCH_WINDOW_DAYS = 1;
const MAX_SECONDARY = 2;

function daysBetween(fromIso: string, now: Date): number {
  const time = Date.parse(fromIso);
  if (Number.isNaN(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor((now.getTime() - time) / DAY_MS);
}

function daysUntil(toIso: string, now: Date): number {
  const time = Date.parse(toIso);
  if (Number.isNaN(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.ceil((time - now.getTime()) / DAY_MS);
}

function newestFirst<T>(items: T[], dateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
}

function sameMatch(job: TodayAnalysisJob, match: { date: string; opponent: string }): boolean {
  return (
    job.matchDate.slice(0, 10) === match.date.slice(0, 10) &&
    job.opponent.trim().toLowerCase() === match.opponent.trim().toLowerCase()
  );
}

function upcomingAcceptedTrial(trials: TodayTrial[], now: Date): TodayTrial | null {
  const upcoming = trials
    .filter((trial) => trial.status === 'accepted' || trial.status === 'rescheduled')
    .filter((trial) => {
      const days = daysUntil(trial.scheduledDate, now);
      return days >= 0 && days <= TRIAL_PREP_WINDOW_DAYS;
    })
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return upcoming[0] ?? null;
}

/**
 * Derives the player's next best actions purely from their real state. Every action carries
 * the reason it was chosen; when nothing applies, no action is invented.
 */
export function buildTodayPlan(input: TodayInput): TodayPlan {
  const { now } = input;
  const goals = input.goals ?? [];
  const trainingSessions = input.trainingSessions ?? [];
  const recentlyCompletedTypes = input.recentlyCompletedTypes ?? [];
  const actions: NextBestAction[] = [];
  const continueItems: ContinueItem[] = [];

  const matches = newestFirst(input.matches, (match) => match.date);
  const analyses = newestFirst(input.analyses, (job) => job.createdAt);
  const latestMatch = matches[0] ?? null;

  const pendingTrial = newestFirst(
    input.trials.filter((trial) => trial.status === 'pending'),
    (trial) => trial.scheduledDate,
  )[0];
  if (pendingTrial) {
    actions.push({
      id: `respond-trial-${pendingTrial.id}`,
      type: 'respond_trial',
      priority: 100,
      route: 'trials',
      entityId: pendingTrial.id,
      params: { club: pendingTrial.club },
    });
  }

  const upcomingTrial = upcomingAcceptedTrial(input.trials, now);
  if (upcomingTrial) {
    actions.push({
      id: `prepare-trial-${upcomingTrial.id}`,
      type: 'prepare_trial',
      priority: 95,
      route: 'trials',
      entityId: upcomingTrial.id,
      params: {
        club: upcomingTrial.club,
        days: Math.max(0, daysUntil(upcomingTrial.scheduledDate, now)),
      },
    });
  }

  if (input.analysesLoaded) {
    const failed = analyses.find((job) => job.status === 'failed' && job.retryable);
    if (failed) {
      actions.push({
        id: `retry-analysis-${failed.id}`,
        type: 'retry_analysis',
        priority: 90,
        route: 'matchAnalysis',
        entityId: failed.id,
        params: { opponent: failed.opponent },
      });
      continueItems.push({
        id: `continue-failed-${failed.id}`,
        kind: 'failed_analysis',
        route: 'matchAnalysis',
        entityId: failed.id,
        params: { opponent: failed.opponent },
      });
    }

    const inProgress = analyses.find(
      (job) => job.status === 'queued' || job.status === 'processing',
    );
    if (inProgress) {
      continueItems.push({
        id: `continue-processing-${inProgress.id}`,
        kind: 'analysis_in_progress',
        route: 'matchAnalysis',
        entityId: inProgress.id,
        params: { opponent: inProgress.opponent },
      });
    }

    const unreviewed = analyses.find(
      (job) =>
        job.status === 'complete' &&
        job.hasReport &&
        !input.reviewedAnalysisIds.includes(job.id) &&
        daysBetween(job.completedAt ?? job.createdAt, now) <= REVIEW_WINDOW_DAYS,
    );
    if (unreviewed) {
      actions.push({
        id: `review-coaching-${unreviewed.id}`,
        type: 'review_coaching',
        priority: 85,
        route: 'matchAnalysis',
        entityId: unreviewed.id,
        params: { opponent: unreviewed.opponent },
      });
    }

    if (
      latestMatch &&
      daysBetween(latestMatch.date, now) <= ANALYZE_WINDOW_DAYS &&
      !analyses.some((job) => sameMatch(job, latestMatch))
    ) {
      actions.push({
        id: `analyze-match-${latestMatch.id}`,
        type: 'analyze_match',
        priority: 55,
        route: 'matchAnalysis',
        entityId: latestMatch.id,
        params: { opponent: latestMatch.opponent },
      });
    }

    const hasReadyVideo = input.videos.some((video) => video.uploadStatus === 'ready');
    const hasCompletedAnalysis = analyses.some((job) => job.status === 'complete' && job.hasReport);
    if (hasCompletedAnalysis && !hasReadyVideo) {
      actions.push({
        id: 'build-reel',
        type: 'build_reel',
        priority: 40,
        route: 'highlightStudio',
        params: {},
      });
    }
  }

  if (input.matchDraft) {
    continueItems.unshift({
      id: 'continue-match-draft',
      kind: 'match_draft',
      route: 'logMatch',
      params: { opponent: input.matchDraft.opponent, savedAt: input.matchDraft.savedAt },
    });
  }

  if (!latestMatch) {
    actions.push({
      id: 'log-first-match',
      type: 'log_first_match',
      priority: input.matchDraft ? 88 : 80,
      route: 'logMatch',
      params: {},
    });
  } else {
    const daysSinceMatch = daysBetween(latestMatch.date, now);
    if (daysSinceMatch >= STALE_MATCH_DAYS && Number.isFinite(daysSinceMatch)) {
      actions.push({
        id: 'log-match',
        type: 'log_match',
        priority: 60,
        route: 'logMatch',
        params: { days: daysSinceMatch },
      });
    }
  }

  const failedUpload = input.videos.find((video) => video.uploadStatus === 'failed');
  if (failedUpload) {
    continueItems.push({
      id: `continue-upload-${failedUpload.id}`,
      kind: 'failed_upload',
      route: 'manageVideos',
      entityId: failedUpload.id,
      params: { title: failedUpload.title },
    });
  }

  const totalSteps = input.passportSteps.length;
  const doneSteps = input.passportSteps.filter((step) => step.complete).length;
  const nextStep = input.passportSteps.find((step) => !step.complete);
  if (nextStep && latestMatch) {
    actions.push({
      id: `improve-passport-${nextStep.id}`,
      type: 'improve_passport',
      priority: 50,
      route: 'passportSetup',
      entityId: nextStep.id,
      params: { step: nextStep.title, done: doneSteps, total: totalSteps },
    });
    if (doneSteps > 0) {
      continueItems.push({
        id: 'continue-passport',
        kind: 'incomplete_passport',
        route: 'passportSetup',
        entityId: nextStep.id,
        params: { done: doneSteps, total: totalSteps },
      });
    }
  }

  const today = now.toISOString().slice(0, 10);
  const trainedToday = trainingSessions.some((session) => session.date.slice(0, 10) === today);
  const openGoals = goals.filter((goal) => goal.status === 'active' || goal.status === 'improving' || goal.status === 'not_started');
  const revisitGoal = goals.find((goal) => goal.status === 'revisit');
  const lastTraining = newestFirst(trainingSessions, (session) => session.date)[0] ?? null;

  if (revisitGoal) {
    actions.push({
      id: `review-goal-${revisitGoal.id}`,
      type: 'review_goal',
      priority: 58,
      route: 'development',
      entityId: revisitGoal.id,
      params: { title: revisitGoal.title },
    });
  }

  const recentlyAchieved = goals.some(
    (goal) => goal.status === 'achieved' && daysBetween(goal.updatedAt, now) <= 7,
  );
  if (latestMatch && openGoals.length === 0 && !recentlyAchieved) {
    actions.push({
      id: 'set-goal',
      type: 'set_goal',
      priority: 52,
      route: 'development',
      params: {},
    });
  }

  if (openGoals.length > 0 && !trainedToday) {
    const daysSinceTraining = lastTraining ? daysBetween(lastTraining.date, now) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(daysSinceTraining) || daysSinceTraining >= 2) {
      actions.push({
        id: 'log-training',
        type: 'log_training',
        priority: 48,
        route: 'development',
        params: { title: openGoals[0].title },
      });
    }
  }

  // ScoutX has no fixture list, so a match-prep session is the only honest signal that a
  // match was played. Ask for the result once, until a match dated on/after the prep exists.
  const recentPrep = newestFirst(
    trainingSessions.filter((session) => session.type === 'match_prep'),
    (session) => session.date,
  )[0];
  if (recentPrep) {
    const prepDay = recentPrep.date.slice(0, 10);
    const prepAge = daysBetween(prepDay, new Date(`${today}T00:00:00Z`));
    const loggedSince = matches.some((match) => match.date.slice(0, 10) >= prepDay);
    if (prepAge >= 0 && prepAge <= POST_MATCH_WINDOW_DAYS && !loggedSince) {
      actions.push({
        id: `post-match-${recentPrep.id}`,
        type: 'log_post_match',
        priority: 92,
        route: 'logMatch',
        params: { days: prepAge },
      });
    }
  }

  const activeGoal = openGoals[0];
  if (activeGoal && daysBetween(activeGoal.updatedAt, now) >= 7) {
    continueItems.push({
      id: `continue-goal-${activeGoal.id}`,
      kind: 'goal_in_progress',
      route: 'development',
      entityId: activeGoal.id,
      params: { title: activeGoal.title },
    });
  }

  const completed = new Set(recentlyCompletedTypes);
  const filteredActions = actions.filter((action) => !completed.has(action.type));

  const ranked = filteredActions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => b.action.priority - a.action.priority || a.index - b.index)
    .map(({ action }) => action);

  return {
    primary: ranked[0] ?? null,
    secondary: ranked.slice(1, 1 + MAX_SECONDARY),
    continueItems,
  };
}
