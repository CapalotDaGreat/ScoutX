type ImagePickerResponse = {
  didCancel?: boolean;
  assets?: Array<{ uri?: string }>;
};

type ImageLibraryOptions = Record<string, unknown>;

export function launchImageLibrary(
  _options: ImageLibraryOptions,
  callback?: (response: ImagePickerResponse) => void,
): Promise<ImagePickerResponse> {
  const response: ImagePickerResponse = { didCancel: true, assets: [] };
  callback?.(response);
  return Promise.resolve(response);
}

export function launchCamera(
  _options: ImageLibraryOptions,
  callback?: (response: ImagePickerResponse) => void,
): Promise<ImagePickerResponse> {
  const response: ImagePickerResponse = { didCancel: true, assets: [] };
  callback?.(response);
  return Promise.resolve(response);
}
