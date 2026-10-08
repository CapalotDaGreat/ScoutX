import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { isSweepableCopy, uploadCopyName } from './uploadCopyNames';

const COPIES_DIR = 'pending-uploads';

const pathOf = (uri: string) => decodeURI(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');

function copiesDir(): Directory {
  return new Directory(Paths.document, COPIES_DIR);
}

export function isUploadCopy(uri: string): boolean {
  return Platform.OS !== 'web' && pathOf(uri).startsWith(`${pathOf(copiesDir().uri)}/`);
}

/**
 * Picker results (Photos export, Files/iCloud download) land in the cache directory, which iOS
 * may purge while the app is in the background. Moving the file into app documents lets an
 * interrupted upload resume after the app is killed. Files outside the cache stay where they are.
 */
export async function persistForUpload(uri: string, jobId: string): Promise<string> {
  if (Platform.OS === 'web' || !pathOf(uri).startsWith(`${pathOf(Paths.cache.uri)}/`)) return uri;
  const source = new File(uri);
  if (!source.exists) return uri;
  const dir = copiesDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, uploadCopyName(jobId, source.extension));
  source.moveSync(target);
  return target.uri;
}

/** Deletes an app-owned upload copy; never touches files outside the copies directory. */
export async function releaseUploadCopy(uri: string): Promise<void> {
  if (!isUploadCopy(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort: the sweep retries on the next launch.
  }
}

/** Removes copies that no resume record references once they are older than the keep window. */
export function sweepUploadCopies(referencedUris: string[], now: number = Date.now()): number {
  if (Platform.OS === 'web') return 0;
  const dir = copiesDir();
  if (!dir.exists) return 0;
  const referenced = new Set(referencedUris.map(pathOf));
  let removed = 0;
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !isSweepableCopy(entry.name, referenced.has(pathOf(entry.uri)), now)) continue;
    try {
      entry.delete();
      removed += 1;
    } catch {
      // Retried on the next sweep.
    }
  }
  return removed;
}
