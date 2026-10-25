import { useEffect, useMemo, useState } from 'react';
import { candidatesFromFrames } from '@/features/match-analysis/services/identityConfirmation';
import { resolveFrameUrl } from '@/features/match-analysis/services/matchFootageStorageService';
import type { IdentityCandidate, MatchAnalysisJob } from '@/features/match-analysis/types';

/**
 * Identity candidates and displayable URLs for a job's frames. Server-extracted frames carry
 * no download URL, so the candidate frames are resolved from storage on demand.
 */
export function useJobFrames(job: MatchAnalysisJob | null): {
  candidates: IdentityCandidate[];
  frameUrls: Record<string, string>;
} {
  const frames = job?.frames;
  const candidates = useMemo(() => {
    if (job?.identityCandidates && job.identityCandidates.length > 0) return job.identityCandidates;
    return frames && frames.length > 0 ? candidatesFromFrames(frames) : [];
  }, [frames, job?.identityCandidates]);

  const scope = `${job?.playerId ?? ''}:${job?.id ?? ''}:${(frames ?? []).map((frame) => `${frame.id}:${frame.storagePath}`).join('|')}`;
  const [resolved, setResolved] = useState<{ scope: string; urls: Record<string, string> }>({ scope: '', urls: {} });

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(candidates.map((candidate) => candidate.frameId));
    const missing = (frames ?? []).filter((frame) => wanted.has(frame.id) && !frame.downloadUrl);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (frame) => [frame.id, await resolveFrameUrl(frame.storagePath)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setResolved({ scope, urls: Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))) });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [candidates, frames, scope]);

  const frameUrls = useMemo(
    () => ({
      ...(resolved.scope === scope ? resolved.urls : {}),
      ...Object.fromEntries((frames ?? []).filter((frame) => frame.downloadUrl).map((frame) => [frame.id, frame.downloadUrl])),
    }),
    [frames, resolved, scope],
  );

  return { candidates, frameUrls };
}
