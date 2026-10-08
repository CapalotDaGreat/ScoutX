import { useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import {
  correctionTargetKey,
  latestCorrections,
  requestSubmitCorrection,
  subscribeCorrections,
  type AnalysisCorrection,
  type CorrectionAction,
  type CorrectionReason,
  type CorrectionTargetKind,
} from '@/features/match-analysis/services/analysisCorrections';
import { type MatchAnalysisJob } from '@/features/match-analysis/types';
import { toUserMessage } from '@/utils/userFacingError';

export type AnalysisCorrectionsApi = {
  /** False for demo jobs, unfinished analyses or when the server is not configured. */
  enabled: boolean;
  current: (kind: CorrectionTargetKind, id: string) => AnalysisCorrection | null;
  submit: (kind: CorrectionTargetKind, id: string, action: CorrectionAction, reason?: CorrectionReason) => Promise<void>;
  pendingKey: string | null;
  error: string | null;
  latest: Map<string, AnalysisCorrection>;
};

export function useAnalysisCorrections(job: MatchAnalysisJob | null): AnalysisCorrectionsApi {
  const jobId = job?.id ?? null;
  const enabled = Boolean(job && job.status === 'complete' && job.report && isFirebaseConfiguredForProject());
  const [records, setRecords] = useState<AnalysisCorrection[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecords([]);
    if (!enabled || !jobId) return undefined;
    return subscribeCorrections(jobId, setRecords, () => setRecords([]));
  }, [enabled, jobId]);

  const latest = useMemo(() => latestCorrections(records), [records]);

  const current = useCallback(
    (kind: CorrectionTargetKind, id: string) => latest.get(correctionTargetKey(kind, id)) ?? null,
    [latest],
  );

  const submit = useCallback(
    async (kind: CorrectionTargetKind, id: string, action: CorrectionAction, reason?: CorrectionReason) => {
      if (!enabled || !jobId) return;
      const key = correctionTargetKey(kind, id);
      setPendingKey(key);
      setError(null);
      try {
        await requestSubmitCorrection({ jobId, targetKind: kind, targetId: id, action, reason: reason ?? null });
      } catch (submitError) {
        setError(toUserMessage(submitError, 'Your feedback could not be saved. Please try again.'));
      } finally {
        setPendingKey(null);
      }
    },
    [enabled, jobId],
  );

  return { enabled, current, submit, pendingKey, error, latest };
}
