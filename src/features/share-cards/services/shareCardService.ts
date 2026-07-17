import { Platform, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export type ShareCaptureOptions = {
  dialogTitle: string;
  mimeType?: 'image/png' | 'application/pdf';
};

async function shareUri(uri: string, options: ShareCaptureOptions): Promise<void> {
  const mimeType = options.mimeType ?? 'image/png';

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: options.dialogTitle,
    });
    return;
  }

  await Share.share(
    Platform.OS === 'ios'
      ? { url: uri, title: options.dialogTitle }
      : { message: uri, title: options.dialogTitle },
  );
}

export async function shareCapturedView(
  viewRef: RefObject<View | null>,
  options: ShareCaptureOptions,
): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  await shareUri(uri, {
    ...options,
    mimeType: options.mimeType ?? 'image/png',
  });
}

export async function shareFileUri(
  uri: string,
  options: ShareCaptureOptions,
): Promise<void> {
  await shareUri(uri, {
    ...options,
    mimeType: options.mimeType ?? 'application/pdf',
  });
}
