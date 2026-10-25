/**
 * Mock/demo data is disabled in production builds unless explicitly opted in via env.
 * Set EXPO_PUBLIC_USE_MOCK_DATA=true only for local demos.
 */
export function useMockData(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return false;
  }
  return process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';
}

export function isProductionApp(): boolean {
  return typeof __DEV__ !== 'undefined' ? !__DEV__ : true;
}
