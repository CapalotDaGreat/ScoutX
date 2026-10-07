import { createCallableFunction } from '@/firebase/callableFunctions';
import type { ReelExportErrorCode, ReelExportStatus } from '@/features/reel-studio/types';

export type MediaPlaybackResponse = {
  url: string;
  expiresAt: string;
};

export async function getMediaPlaybackUrl(input: {
  storagePath: string;
  mediaId?: string;
  reelId?: string;
}): Promise<MediaPlaybackResponse> {
  const callable = createCallableFunction<typeof input>('getMediaPlaybackUrl');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable(input);
  return result.data as MediaPlaybackResponse;
}

export type ReelExportResponse = {
  exportId: string | null;
  status: ReelExportStatus;
  errorCode: ReelExportErrorCode | null;
  segmentIndex: number | null;
};

export async function requestReelExport(reelId: string): Promise<ReelExportResponse> {
  const callable = createCallableFunction<{ reelId: string }>('exportReel');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable({ reelId });
  return result.data as ReelExportResponse;
}
