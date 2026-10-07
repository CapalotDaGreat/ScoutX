import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadSessionRepository } from '@/features/media-upload/repositories/UploadSessionRepository';
import {
  discardPendingUpload,
  runChunkedUpload,
  type ChunkedUploadControl,
} from '@/features/media-upload/services/chunkedUploadService';
import {
  IDLE_UPLOAD,
  uploadErrorCodeFor,
  type UploadRequest,
  type UploadViewState,
} from '@/features/media-upload/types';

export type ChunkedUploadApi = {
  state: UploadViewState;
  /** Resolves with the upload id once all bytes are committed, or null if paused, cancelled or failed. */
  start: (request: UploadRequest) => Promise<string | null>;
  pause: () => void;
  resume: () => Promise<string | null>;
  cancel: () => void;
  reset: () => void;
};

/**
 * Foreground chunked upload with pause, resume, cancel and retry. After the bytes land the
 * server validates the file; `processing` tracks that until the upload is `ready` or rejected.
 */
export function useChunkedUpload(uid: string | null): ChunkedUploadApi {
  const [state, setState] = useState<UploadViewState>(IDLE_UPLOAD);
  const control = useRef<ChunkedUploadControl | null>(null);
  const lastRequest = useRef<UploadRequest | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      control.current?.pause();
    };
  }, []);

  const update = useCallback((patch: Partial<UploadViewState>) => {
    if (mounted.current) setState((current) => ({ ...current, ...patch }));
  }, []);

  const start = useCallback(
    async (request: UploadRequest): Promise<string | null> => {
      if (!uid) return null;
      lastRequest.current = request;
      update({ ...IDLE_UPLOAD, phase: 'preparing' });
      try {
        const result = await runChunkedUpload(uid, request, {
          onControl: (next) => {
            control.current = next;
          },
          onProgress: (progress) => update({ phase: 'uploading', ...progress }),
        });
        control.current = null;
        if (result.outcome === 'paused') {
          update({ phase: 'paused', uploadId: result.uploadId, bytesPerSecond: null, etaSeconds: null });
          return null;
        }
        if (result.outcome === 'cancelled') {
          update({ ...IDLE_UPLOAD, phase: 'cancelled' });
          return null;
        }
        update({ phase: 'processing', uploadId: result.uploadId, bytesPerSecond: null, etaSeconds: null });
        return result.uploadId;
      } catch (error) {
        control.current = null;
        update({ phase: 'failed', error: uploadErrorCodeFor(error), bytesPerSecond: null, etaSeconds: null });
        return null;
      }
    },
    [uid, update],
  );

  useEffect(() => {
    if (state.phase !== 'processing' || !state.uploadId) return undefined;
    return UploadSessionRepository.subscribe(
      state.uploadId,
      (record) => {
        if (record?.state === 'ready') update({ phase: 'ready' });
        if (record?.state === 'rejected' || record?.state === 'expired') update({ phase: 'failed', error: 'rejected' });
      },
      () => undefined,
    );
  }, [state.phase, state.uploadId, update]);

  const resume = useCallback(
    () => (lastRequest.current ? start(lastRequest.current) : Promise.resolve(null)),
    [start],
  );

  return {
    state,
    start,
    pause: () => control.current?.pause(),
    resume,
    cancel: () => {
      if (control.current) control.current.cancel();
      else if (uid && state.uploadId && state.phase === 'paused') {
        void discardPendingUpload(uid, state.uploadId).finally(() => update({ ...IDLE_UPLOAD, phase: 'cancelled' }));
      }
    },
    reset: () => update(IDLE_UPLOAD),
  };
}
