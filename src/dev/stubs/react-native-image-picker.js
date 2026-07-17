/**
 * Expo Go / Metro stub for react-native-image-picker.
 * Plain JS — keep free of TypeScript syntax so ESLint can parse it.
 */

function cancelledResponse() {
  return { didCancel: true, assets: [] };
}

export function launchImageLibrary(_options, callback) {
  const response = cancelledResponse();
  if (typeof callback === 'function') {
    callback(response);
  }
  return Promise.resolve(response);
}

export function launchCamera(_options, callback) {
  const response = cancelledResponse();
  if (typeof callback === 'function') {
    callback(response);
  }
  return Promise.resolve(response);
}
