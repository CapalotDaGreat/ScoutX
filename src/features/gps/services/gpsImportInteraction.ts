import { GPS_IMPORT_MAX_BYTES } from '@/features/gps/services/gpsImportService';

type Context = { ownerId: string | null; disabled: boolean };
type Stamp = { generation: number; revision: number };

/** Invalidate stale reads and A -> B -> A callbacks; serialize user operations synchronously. */
export function createGpsImportOperationGuard() {
  let context: Context = { ownerId: null, disabled: true };
  let generation = 0;
  let revision = 0;
  let active: Stamp | null = null;
  return {
    update(next: Context) {
      if (next.ownerId !== context.ownerId || next.disabled !== context.disabled) generation++;
      context = next;
    },
    invalidate() { generation++; },
    capture(): Stamp { return { generation, revision }; },
    isCurrent(stamp: Stamp): boolean { return stamp.generation === generation && stamp.revision === revision; },
    begin(expectedOwnerId: string | null): Stamp | null {
      if (!context.ownerId || expectedOwnerId !== context.ownerId || context.disabled || active) return null;
      active = { generation, revision: ++revision };
      return active;
    },
    finish(stamp: Stamp): boolean {
      if (active !== stamp) return false;
      active = null;
      return true;
    },
  };
}

type TextFile = { size: number; text(): Promise<string> };
type PickedAsset = { name: string; uri: string; size?: number; file?: TextFile };

/** Web reads the browser File, never Expo's unsupported web File implementation. */
export async function readGpsImportAsset(asset: PickedAsset, platform: string, nativeFile: (uri: string) => TextFile): Promise<{ content: string; extension: string }> {
  const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['gpx', 'tcx', 'csv'].includes(extension)) throw new Error('unsupported');
  if (asset.size !== undefined && (!Number.isFinite(asset.size) || asset.size < 0 || asset.size > GPS_IMPORT_MAX_BYTES)) throw new Error('tooLarge');
  const file = platform === 'web' ? asset.file : nativeFile(asset.uri);
  if (!file || !Number.isFinite(file.size) || file.size < 0) throw new Error('invalid');
  if (file.size > GPS_IMPORT_MAX_BYTES) throw new Error('tooLarge');
  return { content: await file.text(), extension };
}
