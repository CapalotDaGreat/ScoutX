import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  allowBundledDebugToken,
  appCheckConfigurationWarning,
  resolveAppCheckPolicy,
  simulatorDebugBuildProblem,
} from '../../src/config/appCheckPolicy.ts';
import { productionBuildProblems } from '../../src/config/releaseBuildPolicy.ts';

type Profile = { env?: Record<string, string>; extends?: string };
const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8')) as { build: Record<string, Profile> };
const appConfig = readFileSync(new URL('../../app.config.ts', import.meta.url), 'utf8');

const FLAG_VALUES = [undefined, '', 'simulator', ' simulator ', 'true', '1', 'debug'];
const DEVICE_KINDS = [true, false, null, undefined];

describe('App Check: production can never select the debug provider outside a real simulator', () => {
  test('every flag value on a physical or unknown device keeps attestation', () => {
    for (const flag of FLAG_VALUES) {
      for (const isPhysicalDevice of [true, null, undefined]) {
        assert.deepEqual(resolveAppCheckPolicy(true, undefined, { flag, isPhysicalDevice }), { enabled: true, useDebugProvider: false },
          `flag=${String(flag)} device=${String(isPhysicalDevice)}`);
      }
    }
  });

  test('without the deliberate flag, a release build in the simulator still uses attestation (and therefore fails)', () => {
    for (const flag of [undefined, '', 'true', '1', 'debug']) {
      assert.equal(resolveAppCheckPolicy(true, undefined, { flag, isPhysicalDevice: false }).useDebugProvider, false, String(flag));
    }
  });

  test('App Check cannot be switched off in production by any flag', () => {
    for (const enabledFlag of ['false', '0', 'off', undefined]) {
      for (const isPhysicalDevice of DEVICE_KINDS) {
        assert.equal(resolveAppCheckPolicy(true, enabledFlag, { flag: 'simulator', isPhysicalDevice }).enabled, true);
      }
    }
  });
});

describe('App Check: the simulator configuration selects the debug provider', () => {
  test('flag "simulator" in the iOS Simulator selects debug', () => {
    assert.deepEqual(resolveAppCheckPolicy(true, undefined, { flag: 'simulator', isPhysicalDevice: false }), { enabled: true, useDebugProvider: true });
    assert.equal(resolveAppCheckPolicy(true, undefined, { flag: ' simulator ', isPhysicalDevice: false }).useDebugProvider, true);
  });

  test('development builds keep their existing debug behaviour', () => {
    assert.deepEqual(resolveAppCheckPolicy(false), { enabled: true, useDebugProvider: true });
    assert.deepEqual(resolveAppCheckPolicy(false, '0'), { enabled: false, useDebugProvider: true });
  });
});

describe('App Check: missing or misplaced configuration fails clearly', () => {
  test('a release build in the simulator without the flag explains why requests will be rejected', () => {
    const warning = appCheckConfigurationWarning(true, { isPhysicalDevice: false });
    assert.match(warning ?? '', /cannot attest/);
    assert.match(warning ?? '', /'simulator' EAS profile/);
    assert.match(warning ?? '', /register the debug token/);
  });

  test('the flag on a phone or an unknown device is reported as ignored', () => {
    assert.match(appCheckConfigurationWarning(true, { flag: 'simulator', isPhysicalDevice: true }) ?? '', /ignored on a physical device/);
    assert.match(appCheckConfigurationWarning(true, { flag: 'simulator', isPhysicalDevice: null }) ?? '', /device kind unknown/);
  });

  test('coherent configurations produce no warning', () => {
    assert.equal(appCheckConfigurationWarning(true, { isPhysicalDevice: true }), null);
    assert.equal(appCheckConfigurationWarning(true, { flag: 'simulator', isPhysicalDevice: false }), null);
    assert.equal(appCheckConfigurationWarning(false, { isPhysicalDevice: false }), null);
  });

  test('build time: only the simulator profile may set the flag, and only to "simulator"', () => {
    assert.match(simulatorDebugBuildProblem('production', 'simulator') ?? '', /only be set by the 'simulator' EAS profile/);
    assert.match(simulatorDebugBuildProblem('preview', 'simulator') ?? '', /not 'preview'/);
    assert.match(simulatorDebugBuildProblem('development', 'simulator') ?? '', /not 'development'/);
    assert.match(simulatorDebugBuildProblem('simulator', 'true') ?? '', /must be 'simulator'/);
    assert.equal(simulatorDebugBuildProblem('simulator', 'simulator'), null);
    assert.equal(simulatorDebugBuildProblem('production', undefined), null);
    assert.equal(simulatorDebugBuildProblem(undefined, 'simulator'), null, 'local development runs are not EAS builds');
  });

  test('app.config.ts applies the build-time rule and runs the production checks for the simulator profile', () => {
    assert.match(appConfig, /simulatorDebugBuildProblem\(\s*process\.env\.EAS_BUILD_PROFILE, process\.env\.EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG/);
    assert.match(appConfig, /EAS_BUILD_PROFILE === SIMULATOR_BUILD_PROFILE\) \{\s*const problems = productionBuildProblems\(/);
  });
});

describe('App Check: debug settings do not leak into release builds', () => {
  test('release builds never read a bundled debug token', () => {
    assert.equal(allowBundledDebugToken(true), false);
    assert.equal(allowBundledDebugToken(false), true);
  });

  test('the production build gate rejects the simulator flag and bundled debug tokens', () => {
    const fields = (env: Record<string, string>) => productionBuildProblems(env, 'android').map((problem) => problem.field);
    assert.ok(fields({ EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG: 'simulator' }).includes('EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG'));
    assert.ok(fields({ EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN: 'x' }).includes('EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN'));
    assert.ok(!fields({}).includes('EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG'));
  });

  test('only the simulator profile sets the flag; no profile carries a debug token', () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      const env = profile.env ?? {};
      if (name === 'simulator') assert.equal(env.EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG, 'simulator');
      else assert.equal(env.EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG, undefined, name);
      for (const key of Object.keys(env)) assert.doesNotMatch(key, /DEBUG_TOKEN/, `${name}: ${key}`);
    }
    assert.equal(eas.build.production.env?.EXPO_PUBLIC_APP_CHECK_ENABLED, 'true');
    assert.equal(eas.build.simulator.env?.EXPO_PUBLIC_APP_CHECK_ENABLED, 'true');
  });
});
