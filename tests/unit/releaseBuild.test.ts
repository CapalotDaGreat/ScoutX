import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionBuildProblems } from '../../src/config/releaseBuildPolicy.ts';
import { withFirebaseBuildProperties } from '../../src/config/nativeBuildPlugins.ts';
import { resolveAppCheckPolicy } from '../../src/config/appCheckPolicy.ts';
import { validationStates } from '../../scripts/lib/releaseValidation.mjs';

const valid = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'fixture-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'fixture.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'fixture-production',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'fixture.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:123456:web:fixture',
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_fixture',
};

describe('production build policy', () => {
  test('accepts configured iOS builds without optional telemetry or Google OAuth', () => {
    assert.deepEqual(productionBuildProblems(valid, 'ios', true), []);
  });
  test('reports all missing dependencies without printing credentials', () => {
    const problems = productionBuildProblems({ EXPO_PUBLIC_FIREBASE_API_KEY: 'private-fixture' });
    assert.ok(problems.some((problem) => problem.field === 'GOOGLE_SERVICES_PLIST'));
    assert.ok(problems.some((problem) => problem.field === 'EXPO_PUBLIC_REVENUECAT_IOS_KEY'));
    assert.ok(!JSON.stringify(problems).includes('private-fixture'));
    assert.ok(problems.every((problem) => problem.kind === 'missing'));
  });
  test('refuses release bypasses, leaked credentials and incorrect stores', () => {
    for (const [field, value] of Object.entries({
      EXPO_PUBLIC_APP_CHECK_ENABLED: 'false',
      EXPO_PUBLIC_APP_CHECK_USE_DEBUG: 'true',
      EXPO_PUBLIC_EXPO_GO: '1',
      EXPO_PUBLIC_USE_MOCK_DATA: 'TRUE',
      EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '1',
      EXPO_PUBLIC_CAPTURE_MODE: '1',
      EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN: 'fixture-debug-token',
      EXPO_PUBLIC_OPENROUTER_API_KEY: 'fixture-server-key',
      EXPO_PUBLIC_MOCK_DEMO_PASSWORD: 'fixture-password',
      ALLOW_LEGAL_PLACEHOLDERS: '1',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_fixture',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-scoutx',
    })) {
      assert.ok(productionBuildProblems({ ...valid, [field]: value }, 'ios', true)
        .some((problem) => problem.field === field && problem.kind === 'unsafe'), field);
    }
  });
  test('Android does not require iOS purchase configuration or plist', () => {
    assert.deepEqual(productionBuildProblems({ ...valid, EXPO_PUBLIC_REVENUECAT_IOS_KEY: '' }, 'android'), []);
  });
});

describe('native release plugins', () => {
  test('Firebase hosting config survives RNFirebase Ruby string interpolation unchanged', () => {
    const raw = readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8');
    // RNFirebase embeds this file in a Ruby single-quoted string before JSON.parse.
    assert.doesNotMatch(raw, /'|\\\\/);
    const config: { hosting: { headers: Array<{
      source?: string; regex?: string; headers: Array<{ key: string; value: string }>;
    }> } } = JSON.parse(raw);
    assert.equal(config.hosting.headers[0]?.regex, '^/(?:[^.]*|.*\\.html)$');
    for (const source of ['/guardian/**', '/report/**']) {
      const policy = config.hosting.headers.find((entry) => entry.source === source)
        ?.headers.find((header) => header.key === 'Content-Security-Policy');
      assert.equal(policy?.value, "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
  });
  test('all EAS profiles select the Firebase CocoaPods App Check fix', () => {
    const eas: { build: Record<string, { env?: Record<string, string> }> } =
      JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'));
    for (const [profile, configuration] of Object.entries(eas.build)) {
      assert.equal(configuration.env?.FIREBASE_SDK_VERSION, '12.18.0', profile);
    }
  });
  test('upgrades a bare plugin and preserves existing platform configuration', () => {
    const options = { android: { minSdkVersion: 26 }, ios: { deploymentTarget: '16.4', forceStaticLinking: ['OtherPod'] } };
    const plugins = withFirebaseBuildProperties(['expo-font', 'expo-build-properties', ['expo-build-properties', options]]);
    assert.equal(plugins.length, 2);
    const configured = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
    assert.ok(Array.isArray(configured));
    assert.deepEqual(configured[1], {
      android: options.android,
      ios: { deploymentTarget: '16.4', useFrameworks: 'static', forceStaticLinking: ['OtherPod', 'RNFBApp', 'RNFBAppCheck'] },
    });
    assert.deepEqual(withFirebaseBuildProperties(plugins), plugins);
    assert.deepEqual(withFirebaseBuildProperties(['expo-build-properties']), withFirebaseBuildProperties([]));
  });
  test('app config applies the shared policy and plugin assembly', () => {
    const config = readFileSync(new URL('../../app.config.ts', import.meta.url), 'utf8');
    assert.match(config, /plugins = withFirebaseBuildProperties\(plugins\)/);
    assert.match(config, /productionBuildProblems\(/);
    const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
    assert.equal(app.expo.ios.entitlements['com.apple.developer.devicecheck.appattest-environment'], 'production');
  });
});

describe('App Check runtime policy', () => {
  test('production always enables attestation and never selects debug', () => {
    for (const flag of ['false', '0', 'true', undefined]) {
      assert.deepEqual(resolveAppCheckPolicy(true, flag), { enabled: true, useDebugProvider: false });
    }
  });
  test('development keeps emulator and debug support', () => {
    assert.deepEqual(resolveAppCheckPolicy(false, '0'), { enabled: false, useDebugProvider: true });
    assert.deepEqual(resolveAppCheckPolicy(false), { enabled: true, useDebugProvider: true });
  });
});

describe('manual acceptance release gate', () => {
  test('fails explicit failures even when all other tests pass', () => {
    assert.deepEqual(validationStates('| Case | State | Notes |\n| --- | --- | --- |\n| Delete | FAIL (manual) | |\n| GPS | NOT VALIDATED | |\n| Login | PASS (manual) | FAIL |'), { failed: 1, pending: 1 });
  });
  test('handles different table layouts without counting notes or prose', () => {
    assert.deepEqual(validationStates('NOT VALIDATED\n| Case | Device | State |\n| --- | --- | --- |\n| Login | iPhone | PASS |\n\n| Item | State |\n| --- | --- |\n| SMTP | NOT VALIDATED |'), { failed: 0, pending: 1 });
  });
});
