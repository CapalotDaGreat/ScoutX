import Constants from 'expo-constants';

function readExtraUrl(key: string): string | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') {
    return null;
  }

  const url = (extra as Record<string, unknown>)[key];
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

export function getPrivacyPolicyUrl(): string | null {
  return readExtraUrl('privacyPolicyUrl');
}

export function getTermsOfServiceUrl(): string | null {
  return readExtraUrl('termsOfServiceUrl');
}

export function hasPrivacyPolicyUrl(): boolean {
  return getPrivacyPolicyUrl() !== null;
}

export function hasTermsOfServiceUrl(): boolean {
  return getTermsOfServiceUrl() !== null;
}
