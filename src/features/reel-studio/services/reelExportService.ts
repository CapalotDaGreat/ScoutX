import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getMediaPlaybackUrl } from '@/features/media-library/services/mediaAccessCallable';
import type { ReelExportJob } from '@/features/reel-studio/types';

/** Downloads a finished render to the cache and opens the system share sheet. */
export async function shareRenderedReel(job: ReelExportJob): Promise<void> {
  if (job.status !== 'ready' || !job.storagePath) {
    throw new Error('This reel has not finished rendering.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const { url } = await getMediaPlaybackUrl({ storagePath: job.storagePath, reelId: job.reelId });
  const target = `${FileSystem.cacheDirectory ?? ''}reel-${job.id}.mp4`;
  const existing = await FileSystem.getInfoAsync(target);
  if (!existing.exists) {
    const result = await FileSystem.downloadAsync(url, target);
    if (result.status !== 200) {
      await FileSystem.deleteAsync(target, { idempotent: true });
      throw new Error('The rendered reel could not be downloaded.');
    }
  }
  await Sharing.shareAsync(target, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
}
