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

export type UploadAttempt =
  | { status: 'complete'; uploadId: string }
  | { status: 'paused' | 'cancelled' | 'failed' };

export type ChunkedUploadApi = {
  state: UploadViewState;
  /** Resolves once all bytes are committed, or with why the transfer stopped. */
  start: (request: UploadRequest) => Promise<UploadAttempt>;
  pause: () => void;
  resume: () => Promise<UploadAttempt>;
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
    async (request: UploadRequest): Promise<UploadAttempt> => {
      if (!uid) return { status: 'failed' };
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
          return { status: 'paused' };
        }
        if (result.outcome === 'cancelled') {
          update({ ...IDLE_UPLOAD, phase: 'cancelled' });
          return { status: 'cancelled' };
        }
        update({ phase: 'processing', uploadId: result.uploadId, bytesPerSecond: null, etaSeconds: null });
        return { status: 'complete', uploadId: result.uploadId };
      } catch (error) {
        control.current = null;
        update({ phase: 'failed', error: uploadErrorCodeFor(error), bytesPerSecond: null, etaSeconds: null });
        return { status: 'failed' };
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
        if (record?.state === 'rejected' || record?.state === 'expired') {
          update({ phase: 'failed', error: 'rejected', rejectionReason: record.rejectionReason });
        }
      },
      () => undefined,
    );
  }, [state.phase, state.uploadId, update]);

  const resume = useCallback(
    (): Promise<UploadAttempt> =>
      lastRequest.current ? start(lastRequest.current) : Promise.resolve({ status: 'failed' }),
    [start],
  );

  const pause = useCallback(() => control.current?.pause(), []);
  const reset = useCallback(() => update(IDLE_UPLOAD), [update]);
  const cancel = useCallback(() => {
    if (control.current) control.current.cancel();
    else if (uid && state.uploadId && (state.phase === 'paused' || state.phase === 'failed')) {
      void discardPendingUpload(uid, state.uploadId)
        .catch(() => undefined)
        .finally(() => update({ ...IDLE_UPLOAD, phase: 'cancelled' }));
    } else {
      update({ ...IDLE_UPLOAD, phase: 'cancelled' });
    }
  }, [uid, state.uploadId, state.phase, update]);

  return { state, start, pause, resume, cancel, reset };
}
