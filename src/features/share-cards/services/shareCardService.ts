import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';

export type ShareCaptureOptions = {
  dialogTitle: string;
  mimeType?: 'image/png' | 'application/pdf';
};

export async function shareCapturedView(
  viewRef: RefObject<View | null>,
  options: ShareCaptureOptions,
): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: options.mimeType ?? 'image/png',
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

export async function shareFileUri(
  uri: string,
  options: ShareCaptureOptions,
): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: options.mimeType ?? 'application/pdf',
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
