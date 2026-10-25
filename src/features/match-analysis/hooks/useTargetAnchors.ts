import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { createCallableFunction } from '@/firebase/callableFunctions';
import type { MatchAnalysisJob } from '@/features/match-analysis/types';
import type { NormalizedTargetBox } from '@/features/match-analysis/services/targetAnchorGeometry';
import { requestCoordinateAnalysisTarget } from '@/features/match-analysis/services/matchAnalysisCallable';

type AnchorEdit = {
  jobId: string;
  frameId: string;
  operationId: string;
  operation: 'upsert' | 'remove';
  expectedGeneration: number;
  expectedRevision: number;
  box?: NormalizedTargetBox;
};

export const targetAnchorSelectionEnabled = process.env.EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS === 'true';

/** Anchors use a separate server gate and never call the legacy coaching-release action. */
export function useTargetAnchors(job: MatchAnalysisJob) {
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const perform = async (action: () => Promise<unknown>) => {
    if (!targetAnchorSelectionEnabled || operation.current) throw new Error('Target selection unavailable.');
    operation.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const edit = (frameId: string, box?: NormalizedTargetBox) => perform(async () => {
    const callable = createCallableFunction<AnchorEdit>('saveAnalysisTargetAnchor');
    if (!callable) throw new Error('Cloud Functions unavailable.');
    await callable({
      jobId: job.id, frameId, operationId: randomUUID(),
      operation: box ? 'upsert' : 'remove', expectedGeneration: job.pipelineGeneration ?? 0,
      expectedRevision: job.experimentalTargetIdentity?.revision ?? 0,
      ...(box ? { box } : {}),
    });
  });
  const coordinate = () => perform(() => requestCoordinateAnalysisTarget({ jobId: job.id,
    expectedGeneration: job.pipelineGeneration ?? 0, expectedAnchorRevision: job.experimentalTargetIdentity?.revision ?? 0 }));
  return { busy, save: (frameId: string, box: NormalizedTargetBox) => edit(frameId, box), remove: (frameId: string) => edit(frameId), coordinate };
}
