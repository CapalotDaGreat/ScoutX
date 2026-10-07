import { useCallback, useEffect, useRef, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { shouldUseMockAuth } from '@/config/authSecurity';
import { useMockData } from '@/config/appMode';
import { sampleMatchFrames } from '@/features/match-analysis/services/matchFrameSamplingService';
import { uploadMatchFrame } from '@/features/match-analysis/services/matchFootageStorageService';
import {
  UploadSessionRepository,
  contentTypeForFileName,
  useChunkedUpload,
  type UploadAttempt,
} from '@/features/media-upload';
import { pickMatchFootageVideo } from '@/features/match-analysis/services/matchVideoPickerService';
import {
  requestCancelMatchAnalysis,
  requestMatchFootageAnalysis,
} from '@/features/match-analysis/services/matchAnalysisCallable';
import { buildMockMatchAnalysisReport } from '@/features/match-analysis/services/mockMatchAnalysisService';
import { buildConservativePipelineStages } from '@/features/match-analysis/services/matchAnalysisPipelineService';
import {
  canUseDeviceFrameFallback,
  isJobInProgress,
  isTerminalJobStatus,
} from '@/features/match-analysis/services/jobStateMachine';
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
import {
  candidatesFromFrames,
  confirmIdentity as buildIdentityConfirmation,
  pendingIdentityConfirmation,
} from '@/features/match-analysis/services/identityConfirmation';
import { quotaErrorFrom, type QuotaErrorInfo } from '@/features/premium/types';
import { toUserMessage } from '@/utils/userFacingError';

const ANALYSIS_FAILED_MESSAGE =
  "The AI couldn't finish analyzing this match. Your footage is saved — tap Retry analysis to try again.";
const ANALYSIS_UNAVAILABLE_MESSAGE =
  'Match analysis is unavailable right now. Please try again later.';
const VALIDATION_WAIT_MS = 10 * 60_000;
const VIDEO_REJECTED_MESSAGE =
  'This video could not be accepted. Check that it is a playable MP4 or MOV match recording and try again.';
const VALIDATION_TIMEOUT_MESSAGE =
  'Your video arrived but checking it is taking longer than expected. Please check back shortly.';

function createJobId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Demo reports are only allowed in development demo/mock mode — never in production. */
function isDemoAnalysisMode(): boolean {
  return useMockData() || shouldUseMockAuth();
}

export function canRetryMatchAnalysis(job: MatchAnalysisJob | null): boolean {
  return Boolean(
    job &&
      job.status === 'failed' &&
      job.errorCode !== 'video_rejected' &&
      (job.videoStoragePath || job.frames.length > 0),
  );
}

export function useMatchAnalysis(playerId: string | null) {
  const [activeJob, setActiveJob] = useState<MatchAnalysisJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<MatchAnalysisJob[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<QuotaErrorInfo | null>(null);
  const upload = useChunkedUpload(playerId);
  const { start: startUpload, resume: resumeTransfer, reset: resetUpload } = upload;
  const uploadJobRef = useRef<MatchAnalysisJob | null>(null);
  /** Local file of the job picked in this session; needed only for the short-clip device fallback. */
  const [localVideo, setLocalVideo] = useState<{ jobId: string; uri: string } | null>(null);

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

  // The server drives the job after upload; follow it live until it settles.
  useEffect(() => {
    if (!activeJob?.id || isTerminalJobStatus(activeJob.status)) {
      return;
    }
    if (!isFirebaseConfiguredForProject() || isDemoAnalysisMode()) {
      return;
    }
    return subscribeMatchAnalysisJob(activeJob.id, (job) => {
      if (!job) return;
      setActiveJob(job);
      if (isTerminalJobStatus(job.status)) void refreshRecent();
    });
  }, [activeJob?.id, activeJob?.status, refreshRecent]);

  const pickVideo = useCallback(async () => {
    setError(null);
    return pickMatchFootageVideo();
  }, []);

  /** Asks the server to analyse (or re-extract) a job; progress then arrives through the subscription. */
  const requestServerAnalysis = useCallback(
    async (job: MatchAnalysisJob): Promise<MatchAnalysisJob> => {
      setPhaseLabel('AI is reviewing your player…');
      try {
        await requestMatchFootageAnalysis(job.id, job.idempotencyKey);
      } catch (callableError) {
        const quota = quotaErrorFrom(callableError);
        setQuotaError(quota);
        setError(quota ? null : toUserMessage(callableError, ANALYSIS_FAILED_MESSAGE));
      }
      const latest = (await getMatchAnalysisJob(job.id).catch(() => null)) ?? job;
      setActiveJob(latest);
      await refreshRecent();
      return latest;
    },
    [refreshRecent],
  );

  /** Waits for server validation; the server then queues extraction and analysis by itself. */
  const continueAfterUpload = useCallback(
    async (job: MatchAnalysisJob, uploadId: string): Promise<MatchAnalysisJob> => {
      setPhaseLabel('Checking your video…');
      const outcome = await UploadSessionRepository.waitForOutcome(uploadId, VALIDATION_WAIT_MS);
      if (!outcome || outcome.state !== 'ready') {
        throw new Error(outcome?.state === 'rejected' ? VIDEO_REJECTED_MESSAGE : VALIDATION_TIMEOUT_MESSAGE);
      }
      uploadJobRef.current = null;
      resetUpload();
      const latest = (await getMatchAnalysisJob(job.id).catch(() => null)) ?? job;
      setActiveJob(latest);
      return latest;
    },
    [resetUpload],
  );

  const cancelAnalysis = useCallback(
    async (job: MatchAnalysisJob): Promise<void> => {
      if (isDemoAnalysisMode() || !isFirebaseConfiguredForProject()) {
        setActiveJob({ ...job, status: 'cancelled' });
        return;
      }
      try {
        await requestCancelMatchAnalysis(job.id);
      } catch (cancelError) {
        setError(toUserMessage(cancelError, ANALYSIS_UNAVAILABLE_MESSAGE));
      }
      uploadJobRef.current = null;
      const latest = (await getMatchAnalysisJob(job.id).catch(() => null)) ?? { ...job, status: 'cancelled' as const };
      setActiveJob(latest);
      await refreshRecent();
    },
    [refreshRecent],
  );

  const afterUploadAttempt = useCallback(
    async (job: MatchAnalysisJob, attempt: UploadAttempt): Promise<MatchAnalysisJob> => {
      if (attempt.status === 'complete') return continueAfterUpload(job, attempt.uploadId);
      if (attempt.status === 'cancelled') {
        await cancelAnalysis(job);
        return { ...job, status: 'cancelled' };
      }
      if (attempt.status === 'failed' && attempt.quota) {
        // Refused before any bytes were sent; the upload card explains the limit.
        await cancelAnalysis(job);
        return { ...job, status: 'cancelled' };
      }
      // Paused or interrupted: the job stays in `uploading` and can resume from the committed offset.
      setActiveJob(job);
      return job;
    },
    [cancelAnalysis, continueAfterUpload],
  );

  const resumeUpload = useCallback(async (): Promise<MatchAnalysisJob | null> => {
    const job = uploadJobRef.current;
    if (!job) return null;
    setIsBusy(true);
    setError(null);
    try {
      setPhaseLabel('Uploading full match video…');
      return await afterUploadAttempt(job, await resumeTransfer());
    } catch (err) {
      const message = toUserMessage(err, 'Match analysis failed. Please try again.');
      setError(message);
      throw new Error(message);
    } finally {
      setIsBusy(false);
      setPhaseLabel(null);
    }
  }, [afterUploadAttempt, resumeTransfer]);

  const cancelUpload = useCallback(async () => {
    const job = uploadJobRef.current;
    const idle = upload.state.phase === 'paused' || upload.state.phase === 'failed';
    upload.cancel();
    if (idle && job) await afterUploadAttempt(job, { status: 'cancelled' });
  }, [afterUploadAttempt, upload]);

  const runDemoAnalysis = useCallback(async (job: MatchAnalysisJob, input: CreateMatchAnalysisInput) => {
    setPhaseLabel('Generating demo report…');
    const sampled = await sampleMatchFrames(input.localVideoUri, input.durationSec);
    const frames: MatchFrameSample[] = sampled.map((frame) => ({
      id: frame.id,
      index: frame.index,
      timestampSec: frame.timestampSec,
      storagePath: `local://${frame.index}`,
      downloadUrl: frame.uri,
      source: 'device',
    }));
    const report = buildMockMatchAnalysisReport(input.targeting, input.match, input.durationSec);
    report.methodology =
      'DEMO REPORT — generated in development mock mode. It is not based on your footage and must not be used as real analysis.';
    const completed: MatchAnalysisJob = {
      ...job,
      status: 'complete',
      frames,
      identityCandidates: candidatesFromFrames(frames),
      pipelineStages: buildConservativePipelineStages(input.targeting.jerseyNumber || 'player'),
      report,
      completedAt: report.generatedAt,
      updatedAt: new Date().toISOString(),
    };
    setActiveJob(completed);
    setRecentJobs((prev) => [completed, ...prev.filter((item) => item.id !== completed.id)].slice(0, 10));
    return completed;
  }, []);

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
      const job: MatchAnalysisJob = {
        id: jobId,
        playerId,
        status: 'uploading',
        targeting: input.targeting,
        match: input.match,
        durationSec: input.durationSec,
        fileSizeBytes: input.fileSizeBytes,
        frames: [],
        identityConfirmation: pendingIdentityConfirmation(),
        identityCandidates: [],
        idempotencyKey: jobId,
        createdAt: now,
        updatedAt: now,
      };
      setActiveJob(job);

      try {
        if (demoMode) {
          return await runDemoAnalysis(job, input);
        }

        await createMatchAnalysisJob(job);
        uploadJobRef.current = job;
        setLocalVideo({ jobId, uri: input.localVideoUri });

        setPhaseLabel('Uploading full match video…');
        const attempt = await startUpload({
          purpose: 'match_footage',
          jobId,
          fileUri: input.localVideoUri,
          fileName: input.fileName ?? 'match.mp4',
          contentType: contentTypeForFileName(input.fileName ?? input.localVideoUri),
          declaredDurationSec: input.durationSec,
        });
        return await afterUploadAttempt(job, attempt);
      } catch (err) {
        const message = toUserMessage(err, 'Match analysis failed. Please try again.');
        setError(message);
        throw new Error(message);
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [playerId, afterUploadAttempt, runDemoAnalysis, startUpload],
  );

  const retryAnalysis = useCallback(
    async (job: MatchAnalysisJob) => {
      if (!canRetryMatchAnalysis(job)) {
        throw new Error('This analysis cannot be retried. Please upload the video again.');
      }
      setIsBusy(true);
      setError(null);
      try {
        return await requestServerAnalysis(job);
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [requestServerAnalysis],
  );

  /** Short clips only: when server extraction failed, sample frames on the phone and analyse those. */
  const analyzeWithDeviceFrames = useCallback(
    async (job: MatchAnalysisJob) => {
      const local = localVideo;
      if (!playerId || !canUseDeviceFrameFallback(job) || local?.jobId !== job.id) {
        throw new Error('Pick the video again to analyze it on this phone.');
      }
      setIsBusy(true);
      setError(null);
      try {
        setPhaseLabel('Sampling frames on this phone…');
        const sampled = await sampleMatchFrames(local.uri, job.measuredDurationSec ?? job.durationSec);
        const frames: MatchFrameSample[] = [];
        for (const frame of sampled) {
          const uploaded = await uploadMatchFrame(playerId, job.id, frame.index, frame.uri);
          frames.push({
            id: `frame_${frame.index}`,
            index: frame.index,
            timestampSec: frame.timestampSec,
            storagePath: uploaded.storagePath,
            downloadUrl: uploaded.downloadUrl,
            source: 'device',
          });
        }
        const identityCandidates = candidatesFromFrames(frames);
        await updateMatchAnalysisJob(job.id, { frames, identityCandidates });
        return await requestServerAnalysis({ ...job, frames, identityCandidates });
      } catch (err) {
        const message = toUserMessage(err, ANALYSIS_FAILED_MESSAGE);
        setError(message);
        throw new Error(message);
      } finally {
        setIsBusy(false);
        setPhaseLabel(null);
      }
    },
    [localVideo, playerId, requestServerAnalysis],
  );

  const confirmPlayerIdentity = useCallback(async (job: MatchAnalysisJob, frameIds: string[]) => {
    const identityConfirmation = buildIdentityConfirmation(frameIds, new Date().toISOString());
    await updateMatchAnalysisJob(job.id, { identityConfirmation });
    const next = { ...job, identityConfirmation, updatedAt: new Date().toISOString() };
    setActiveJob(next);
    setRecentJobs((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    return next;
  }, []);

  const resetActive = useCallback(() => {
    setActiveJob(null);
    setError(null);
    setQuotaError(null);
    setPhaseLabel(null);
  }, []);

  return {
    activeJob,
    recentJobs,
    isBusy,
    phaseLabel,
    error,
    quotaError,
    pickVideo,
    startAnalysis,
    retryAnalysis,
    cancelAnalysis,
    analyzeWithDeviceFrames,
    canAnalyzeOnDevice: Boolean(activeJob && localVideo?.jobId === activeJob.id && canUseDeviceFrameFallback(activeJob)),
    isInProgress: isJobInProgress(activeJob),
    confirmPlayerIdentity,
    resetActive,
    refreshRecent,
    setActiveJob,
    upload,
    resumeUpload,
    cancelUpload,
  };
}

export type UseMatchAnalysisTargeting = PlayerTargeting;
export type UseMatchAnalysisMatch = MatchContextInput;
