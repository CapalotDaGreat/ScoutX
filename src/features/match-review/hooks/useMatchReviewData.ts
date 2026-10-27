import { useEffect, useState } from 'react';
import { getMediaPlaybackUrl } from '@/features/media-library/services/mediaAccessCallable';
import { subscribeTrackingDiscovery, subscribeTrackingProgress } from '@/features/match-analysis/services/trackingV3Service';
import type { TrackingDiscoveryDoc, TrackingProgressDoc } from '@/features/match-analysis/services/trackingPresentation';

/** Discovery sightings for a job (4.1). */
export function useTrackingDiscovery(jobId: string | null): TrackingDiscoveryDoc | null {
  const [doc, setDoc] = useState<TrackingDiscoveryDoc | null>(null);
  useEffect(() => {
    if (!jobId) return undefined;
    return subscribeTrackingDiscovery(jobId, setDoc, () => setDoc(null));
  }, [jobId]);
  return doc;
}

/** Live progress facts of the progressive analysis (null until one was started). */
export function useTrackingProgress(jobId: string | null): TrackingProgressDoc | null {
  const [progress, setProgress] = useState<TrackingProgressDoc | null>(null);
  useEffect(() => {
    if (!jobId) return undefined;
    return subscribeTrackingProgress(jobId, setProgress, () => setProgress(null));
  }, [jobId]);
  return progress;
}

/** Re-renders periodically so a measured estimate counts down between progress updates. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Playback URL of the owner's retained source video: the job's existing URL, otherwise a
 * short-lived signed URL from the server (owner-only). null = source no longer stored.
 */
export function usePlaybackUrl(job: { videoDownloadUrl?: string; videoStoragePath?: string } | null): { url: string | null; loading: boolean } {
  const direct = job?.videoDownloadUrl ?? null;
  const path = job?.videoStoragePath ?? null;
  const [signed, setSigned] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (direct || !path) return undefined;
    let cancelled = false;
    setLoading(true);
    getMediaPlaybackUrl({ storagePath: path })
      .then((r) => { if (!cancelled) setSigned(r.url); })
      .catch(() => { if (!cancelled) setSigned(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [direct, path]);
  return { url: direct ?? signed, loading };
}
