import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { UploadFileMissingError } from '@/features/media-upload/types';
import { type ChunkSource } from './resumableSessionUploader';

function exactBuffer(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer;
}

/** Native: seeks a file handle so only the requested slice is read from disk. */
function openNativeSource(uri: string): ChunkSource {
  const file = new File(uri);
  if (!file.exists) throw new UploadFileMissingError();
  const handle = file.open();
  return {
    size: file.size,
    read: async (offset, length) => {
      handle.offset = offset;
      return exactBuffer(handle.readBytes(length));
    },
    close: () => handle.close(),
  };
}

async function openWebSource(uri: string): Promise<ChunkSource> {
  const response = await fetch(uri).catch(() => null);
  if (!response?.ok) throw new UploadFileMissingError();
  const blob = await response.blob();
  return {
    size: blob.size,
    read: (offset, length) => blob.slice(offset, offset + length).arrayBuffer(),
    close: () => undefined,
  };
}

export async function openChunkSource(uri: string): Promise<ChunkSource> {
  return Platform.OS === 'web' ? openWebSource(uri) : openNativeSource(uri);
}
