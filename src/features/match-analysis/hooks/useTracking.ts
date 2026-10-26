import { useEffect, useState } from 'react';
import { resolveFrameUrl } from '@/features/match-analysis/services/matchFootageStorageService';
import { subscribeTracking, type TrackingDoc } from '@/features/match-analysis/services/trackingV3Service';

/** Live, server-validated tracking report for a job (null until the worker produced one). */
export function useTracking(jobId: string | null): { tracking: TrackingDoc | null; error: Error | null } {
  const [tracking, setTracking] = useState<TrackingDoc | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!jobId) return undefined;
    return subscribeTracking(jobId, (next) => {
      setTracking(next);
      setError(null);
    }, setError);
  }, [jobId]);
  return { tracking, error };
}

/** Resolves owner-only Storage paths (review images) to download URLs. */
export function useStorageUrls(paths: Array<string | null | undefined>): Record<string, string> {
  const key = paths.filter(Boolean).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const wanted = key ? key.split('|') : [];
    void Promise.all(wanted.map(async (p) => [p, await resolveFrameUrl(p)] as const)).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => Boolean(e[1]))));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return urls;
}
