export type ReleaseBuildProblem = {
  kind: 'missing' | 'unsafe';
  field: string;
  message: string;
};

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

const FIREBASE_FIELDS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

/** Reports names only: build diagnostics must never echo environment values. */
export function productionBuildProblems(
  env: BuildEnvironment,
  platform: string = 'ios',
  hasNativeFirebaseFile: boolean = false,
): ReleaseBuildProblem[] {
  const problems: ReleaseBuildProblem[] = [];
  const value = (field: string): string => env[field]?.trim() ?? '';
  const unsafe = (field: string, message: string): void => {
    problems.push({ kind: 'unsafe', field, message });
  };
  for (const field of FIREBASE_FIELDS) {
    if (!value(field)) problems.push({ kind: 'missing', field, message: `${field} is required` });
  }
  for (const field of [
    'EXPO_PUBLIC_USE_MOCK_DATA', 'EXPO_PUBLIC_USE_FIREBASE_EMULATORS',
    'EXPO_PUBLIC_APP_CHECK_USE_DEBUG', 'EXPO_PUBLIC_EXPO_GO', 'ALLOW_LEGAL_PLACEHOLDERS',
    'EXPO_PUBLIC_CAPTURE_MODE', 'EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS',
  ]) {
    if (['true', '1'].includes(value(field).toLowerCase())) unsafe(field, `${field} must be disabled`);
  }
  if (['false', '0'].includes(value('EXPO_PUBLIC_APP_CHECK_ENABLED').toLowerCase())) {
    unsafe('EXPO_PUBLIC_APP_CHECK_ENABLED', 'App Check must be enabled');
  }
  if (value('NODE_TLS_REJECT_UNAUTHORIZED') === '0') {
    unsafe('NODE_TLS_REJECT_UNAUTHORIZED', 'TLS certificate verification must remain enabled');
  }
  for (const field of [
    'EXPO_PUBLIC_OPENROUTER_API_KEY', 'EXPO_PUBLIC_MOCK_DEMO_PASSWORD',
    'EXPO_PUBLIC_APP_CHECK_ANDROID_DEBUG_TOKEN', 'EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN',
    'EXPO_PUBLIC_APP_CHECK_WEB_DEBUG_TOKEN',
  ]) {
    if (value(field)) unsafe(field, `${field} must not be included in a production bundle`);
  }
  if (value('EXPO_PUBLIC_FIREBASE_PROJECT_ID').startsWith('demo-')) {
    unsafe('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'A demo Firebase project cannot be used in production');
  }
  if (platform === 'ios') {
    const field = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';
    if (!value(field)) problems.push({ kind: 'missing', field, message: `${field} requires the App Store key` });
    else if (!value(field).startsWith('appl_')) unsafe(field, `${field} must be an App Store (appl_) key`);
    if (!hasNativeFirebaseFile) {
      problems.push({ kind: 'missing', field: 'GOOGLE_SERVICES_PLIST', message: 'Provide the existing iOS Firebase plist using GOOGLE_SERVICES_PLIST' });
    }
  }
  return problems;
}
