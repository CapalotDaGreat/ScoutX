import { useCallback, useEffect, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { shouldUseMockAuth } from '@/config/authSecurity';
import { sampleMatchFrames } from '@/features/match-analysis/services/matchFrameSamplingService';
import {
  uploadMatchFrame,
  uploadMatchVideo,
} from '@/features/match-analysis/services/matchFootageStorageService';
import { pickMatchFootageVideo } from '@/features/match-analysis/services/matchVideoPickerService';
import { requestMatchFootageAnalysis } from '@/features/match-analysis/services/matchAnalysisCallable';
import { buildMockMatchAnalysisReport } from '@/features/match-analysis/services/mockMatchAnalysisService';
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

function createJobId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    const jobs = await listRecentMatchAnalysisJobs(playerId);
    setRecentJobs(jobs);
  }, [playerId]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    if (!activeJob?.id || activeJob.status === 'complete' || activeJob.status === 'failed') {
      return;
    }
    if (!isFirebaseConfiguredForProject() || shouldUseMockAuth()) {
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

  const startAnalysis = useCallback(
    async (input: CreateMatchAnalysisInput) => {
      if (!playerId) {
        throw new Error('Sign in to analyze match footage.');
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
        createdAt: now,
        updatedAt: now,
      };

      setActiveJob(job);
      setPhaseLabel('Sampling frames across the match…');

      try {
        const frames = await sampleMatchFrames(input.localVideoUri, input.durationSec);

        const useMock = shouldUseMockAuth() || !isFirebaseConfiguredForProject();

        if (useMock) {
          setPhaseLabel('Generating coaching report…');
          const report = buildMockMatchAnalysisReport(
            input.targeting,
            input.match,
            input.durationSec,
          );
          job = {
            ...job,
            status: 'complete',
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
          frames: uploadedFrames,
          videoStoragePath: video.storagePath,
          videoDownloadUrl: video.downloadUrl,
          fileSizeBytes: video.fileSizeBytes,
          uploadProgress: 95,
          updatedAt: new Date().toISOString(),
        };
        await updateMatchAnalysisJob(jobId, job);
        setActiveJob(job);

        setPhaseLabel('AI is reviewing your player…');
        await updateMatchAnalysisJob(jobId, { status: 'processing' });
        try {
          await requestMatchFootageAnalysis(jobId);
        } catch (callableError) {
          // Offline-friendly fallback if Cloud Function is missing
          const report = buildMockMatchAnalysisReport(
            input.targeting,
            input.match,
            input.durationSec,
          );
          report.methodology =
            'Fallback mock report — deploy analyzeMatchFootage Cloud Function for live vision stats.';
          await updateMatchAnalysisJob(jobId, {
            status: 'complete',
            report,
            completedAt: report.generatedAt,
            error: callableError instanceof Error ? callableError.message : 'Callable failed',
          });
        }

        const latest =
          (await getMatchAnalysisJob(jobId)) ??
          (await new Promise<MatchAnalysisJob | null>((resolve) => {
            const unsub = subscribeMatchAnalysisJob(jobId, (next) => {
              if (next && (next.status === 'complete' || next.status === 'failed')) {
                unsub();
                resolve(next);
              }
            });
            setTimeout(() => {
              unsub();
              resolve(null);
            }, 90_000);
          }));

        if (latest) {
          setActiveJob(latest);
          await refreshRecent();
          return latest;
        }

        const still = { ...job, status: 'processing' as const };
        setActiveJob(still);
        return still;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Match analysis failed.';
        setError(message);
        setActiveJob((current) =>
          current
            ? { ...current, status: 'failed', error: message, updatedAt: new Date().toISOString() }
            : current,
        );
        if (isFirebaseConfiguredForProject() && !shouldUseMockAuth()) {
          await updateMatchAnalysisJob(jobId, { status: 'failed', error: message });
        }
        throw err;
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [playerId, refreshRecent],
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
    resetActive,
    refreshRecent,
    setActiveJob,
  };
}

export type UseMatchAnalysisTargeting = PlayerTargeting;
export type UseMatchAnalysisMatch = MatchContextInput;
