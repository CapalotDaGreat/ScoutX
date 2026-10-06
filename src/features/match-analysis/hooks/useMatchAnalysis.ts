import { useCallback, useEffect, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { shouldUseMockAuth } from '@/config/authSecurity';
import { useMockData } from '@/config/appMode';
import { sampleMatchFrames } from '@/features/match-analysis/services/matchFrameSamplingService';
import {
  uploadMatchFrame,
  uploadMatchVideo,
} from '@/features/match-analysis/services/matchFootageStorageService';
import { pickMatchFootageVideo } from '@/features/match-analysis/services/matchVideoPickerService';
import { requestMatchFootageAnalysis } from '@/features/match-analysis/services/matchAnalysisCallable';
import { buildMockMatchAnalysisReport } from '@/features/match-analysis/services/mockMatchAnalysisService';
import { buildConservativePipelineStages } from '@/features/match-analysis/services/matchAnalysisPipelineService';
import {
  createMatchAnalysisJob,
  getMatchAnalysisJob,
  listRecentMatchAnalysisJobs,
  subscribeMatchAnalysisJob,
  updateMatchAnalysisJob,
} from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import {
  type CreateMatchAnalysisInput,
  type MatchAnalysisJob,
  type MatchContextInput,
  type MatchFrameSample,
  type PlayerTargeting,
} from '@/features/match-analysis/types';
import { toUserMessage } from '@/utils/userFacingError';

const ANALYSIS_FAILED_MESSAGE =
  "The AI couldn't finish analyzing this match. Your footage is saved — tap Retry analysis to try again.";
const ANALYSIS_UNAVAILABLE_MESSAGE =
  'Match analysis is unavailable right now. Please try again later.';
const RESULT_WAIT_MS = 90_000;

function createJobId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Demo reports are only allowed in development demo/mock mode — never in production. */
function isDemoAnalysisMode(): boolean {
  return useMockData() || shouldUseMockAuth();
}

function waitForTerminalJob(jobId: string): Promise<MatchAnalysisJob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (job: MatchAnalysisJob | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(job);
    };
    const unsub = subscribeMatchAnalysisJob(jobId, (next) => {
      if (next && (next.status === 'complete' || next.status === 'failed')) {
        finish(next);
      }
    });
    const timer = setTimeout(() => finish(null), RESULT_WAIT_MS);
  });
}

export function canRetryMatchAnalysis(job: MatchAnalysisJob | null): boolean {
  return Boolean(job && job.status === 'failed' && job.videoStoragePath && job.frames.length > 0);
}

export function useMatchAnalysis(playerId: string | null) {
  const [activeJob, setActiveJob] = useState<MatchAnalysisJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<MatchAnalysisJob[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRecent = useCallback(async () => {
    if (!playerId || !isFirebaseConfiguredForProject()) {
      setRecentJobs([]);
      return;
    }
    try {
      setRecentJobs(await listRecentMatchAnalysisJobs(playerId));
    } catch {
      setRecentJobs([]);
    }
  }, [playerId]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    if (!activeJob?.id || activeJob.status === 'complete' || activeJob.status === 'failed') {
      return;
    }
    if (!isFirebaseConfiguredForProject() || isDemoAnalysisMode()) {
      return;
    }
    return subscribeMatchAnalysisJob(activeJob.id, (job) => {
      if (job) {
        setActiveJob(job);
      }
    });
  }, [activeJob?.id, activeJob?.status]);

  const pickVideo = useCallback(async () => {
    setError(null);
    return pickMatchFootageVideo();
  }, []);

  /** Runs the server analysis for an already-uploaded job and resolves with its final state. */
  const runServerAnalysis = useCallback(
    async (job: MatchAnalysisJob): Promise<MatchAnalysisJob> => {
      setPhaseLabel('AI is reviewing your player…');
      const pipelineStages = buildConservativePipelineStages(job.targeting.jerseyNumber || 'player');
      await updateMatchAnalysisJob(job.id, {
        status: 'processing',
        phaseLabel: 'Tracking #player',
        pipelineStages,
        error: undefined,
      });
      setActiveJob({ ...job, status: 'processing', pipelineStages, error: undefined });

      try {
        await requestMatchFootageAnalysis(job.id);
      } catch (callableError) {
        const message = toUserMessage(callableError, ANALYSIS_FAILED_MESSAGE);
        const failed: MatchAnalysisJob = {
          ...job,
          status: 'failed',
          error: message,
          updatedAt: new Date().toISOString(),
        };
        // The server usually records the failure itself; only fill in if it hasn't.
        const serverState = await getMatchAnalysisJob(job.id).catch(() => null);
        if (serverState?.status !== 'failed') {
          await updateMatchAnalysisJob(job.id, { status: 'failed', error: message }).catch(() => undefined);
        }
        setActiveJob(failed);
        setError(message);
        await refreshRecent();
        return failed;
      }

      const latest = await getMatchAnalysisJob(job.id).catch(() => null);
      const final =
        latest && (latest.status === 'complete' || latest.status === 'failed')
          ? latest
          : await waitForTerminalJob(job.id);

      if (final) {
        setActiveJob(final);
        if (final.status === 'failed') {
          setError(final.error ?? ANALYSIS_FAILED_MESSAGE);
        }
        await refreshRecent();
        return final;
      }

      const still: MatchAnalysisJob = { ...job, status: 'processing' };
      setActiveJob(still);
      return still;
    },
    [refreshRecent],
  );

  const startAnalysis = useCallback(
    async (input: CreateMatchAnalysisInput) => {
      if (!playerId) {
        throw new Error('Sign in to analyze match footage.');
      }

      const demoMode = isDemoAnalysisMode();
      if (!demoMode && !isFirebaseConfiguredForProject()) {
        setError(ANALYSIS_UNAVAILABLE_MESSAGE);
        throw new Error(ANALYSIS_UNAVAILABLE_MESSAGE);
      }

      setIsBusy(true);
      setError(null);
      const now = new Date().toISOString();
      const jobId = createJobId();

      let job: MatchAnalysisJob = {
        id: jobId,
        playerId,
        status: 'uploading',
        targeting: input.targeting,
        match: input.match,
        durationSec: input.durationSec,
        fileSizeBytes: input.fileSizeBytes,
        frames: [],
        uploadProgress: 0,
        phaseLabel: 'Preparing video',
        pipelineStages: buildConservativePipelineStages(input.targeting.jerseyNumber || 'player'),
        createdAt: now,
        updatedAt: now,
      };

      setActiveJob(job);
      setPhaseLabel('Sampling frames across the match…');
      let jobPersisted = false;

      try {
        const frames = await sampleMatchFrames(input.localVideoUri, input.durationSec);

        if (demoMode) {
          setPhaseLabel('Generating demo report…');
          const report = buildMockMatchAnalysisReport(
            input.targeting,
            input.match,
            input.durationSec,
          );
          report.methodology =
            'DEMO REPORT — generated in development mock mode. It is not based on your footage and must not be used as real analysis.';
          job = {
            ...job,
            status: 'complete',
            phaseLabel: 'Finalizing report',
            frames: frames.map((frame) => ({
              index: frame.index,
              timestampSec: frame.timestampSec,
              storagePath: `local://${frame.index}`,
              downloadUrl: frame.uri,
            })),
            report,
            completedAt: report.generatedAt,
            uploadProgress: 100,
            updatedAt: new Date().toISOString(),
          };
          setActiveJob(job);
          setRecentJobs((prev) => [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 10));
          return job;
        }

        await createMatchAnalysisJob(job);
        jobPersisted = true;

        setPhaseLabel('Uploading sampled frames…');
        const uploadedFrames: MatchFrameSample[] = [];
        for (const frame of frames) {
          const uploaded = await uploadMatchFrame(playerId, jobId, frame.index, frame.uri);
          uploadedFrames.push({
            index: frame.index,
            timestampSec: frame.timestampSec,
            storagePath: uploaded.storagePath,
            downloadUrl: uploaded.downloadUrl,
          });
          setActiveJob((current) =>
            current
              ? {
                  ...current,
                  frames: uploadedFrames,
                  uploadProgress: Math.round((uploadedFrames.length / frames.length) * 55),
                }
              : current,
          );
        }

        setPhaseLabel('Uploading full match video…');
        const video = await uploadMatchVideo(playerId, jobId, input.localVideoUri, (progress) => {
          setActiveJob((current) =>
            current
              ? {
                  ...current,
                  uploadProgress: 55 + Math.round(progress * 0.35),
                }
              : current,
          );
        });

        job = {
          ...job,
          status: 'queued',
          phaseLabel: 'Finding match segments',
          frames: uploadedFrames,
          videoStoragePath: video.storagePath,
          videoDownloadUrl: video.downloadUrl,
          fileSizeBytes: video.fileSizeBytes,
          uploadProgress: 95,
          updatedAt: new Date().toISOString(),
        };
        await updateMatchAnalysisJob(jobId, job);
        setActiveJob(job);

        return await runServerAnalysis(job);
      } catch (err) {
        const message = toUserMessage(err, 'Match analysis failed. Please try again.');
        setError(message);
        setActiveJob((current) =>
          current
            ? { ...current, status: 'failed', error: message, updatedAt: new Date().toISOString() }
            : current,
        );
        if (jobPersisted) {
          await updateMatchAnalysisJob(jobId, { status: 'failed', error: message }).catch(
            () => undefined,
          );
        }
        throw new Error(message);
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [playerId, runServerAnalysis],
  );

  const retryAnalysis = useCallback(
    async (job: MatchAnalysisJob) => {
      if (!canRetryMatchAnalysis(job)) {
        throw new Error('This analysis cannot be retried. Please upload the video again.');
      }
      setIsBusy(true);
      setError(null);
      try {
        return await runServerAnalysis(job);
      } catch (err) {
        const message = toUserMessage(err, ANALYSIS_FAILED_MESSAGE);
        setError(message);
        throw new Error(message);
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [runServerAnalysis],
  );

  const resetActive = useCallback(() => {
    setActiveJob(null);
    setError(null);
    setPhaseLabel(null);
  }, []);

  return {
    activeJob,
    recentJobs,
    isBusy,
    phaseLabel,
    error,
    pickVideo,
    startAnalysis,
    retryAnalysis,
    resetActive,
    refreshRecent,
    setActiveJob,
  };
}

export type UseMatchAnalysisTargeting = PlayerTargeting;
export type UseMatchAnalysisMatch = MatchContextInput;
