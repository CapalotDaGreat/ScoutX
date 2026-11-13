/** Value of EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG that requests the simulator debug provider. Anything else is ignored. */
export const SIMULATOR_DEBUG_FLAG_VALUE = 'simulator';

/** The only EAS build profile allowed to set EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG (checked in app.config.ts). */
export const SIMULATOR_BUILD_PROFILE = 'simulator';

export type SimulatorContext = {
  /** Raw EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG. */
  flag?: string;
  /** expo-device `isDevice`: false in the iOS Simulator, true on a phone, null when unknown. */
  isPhysicalDevice?: boolean | null;
};

/**
 * Release builds (production === true) attest with App Attest / DeviceCheck. The single exception is a build made with the
 * `simulator` profile, which sets EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG=simulator, and only while it is actually running in
 * the iOS Simulator (isDevice === false): App Attest and DeviceCheck do not exist there, so the debug provider is used and the
 * native SDK prints a locally generated debug token for registration in the Firebase console. On a phone, or when the device
 * kind is unknown, the flag is ignored and attestation is used. No debug token ever comes from the bundle in a release build.
 */
export function resolveAppCheckPolicy(
  production: boolean,
  enabledFlag?: string,
  simulator: SimulatorContext = {},
): { enabled: boolean; useDebugProvider: boolean } {
  const enabled = production || !['false', '0'].includes(enabledFlag?.trim().toLowerCase() ?? '');
  if (!production) return { enabled, useDebugProvider: true };
  return { enabled, useDebugProvider: simulatorDebugApplies(simulator) };
}

function simulatorDebugRequested(simulator: SimulatorContext): boolean {
  return simulator.flag?.trim() === SIMULATOR_DEBUG_FLAG_VALUE;
}

function simulatorDebugApplies(simulator: SimulatorContext): boolean {
  return simulatorDebugRequested(simulator) && simulator.isPhysicalDevice === false;
}

/**
 * Debug tokens from the bundle (EXPO_PUBLIC_APP_CHECK_*_DEBUG_TOKEN) are only honoured in development builds. A release build
 * in simulator mode lets the native SDK generate its own token instead, so no secret is ever inlined into a release bundle.
 */
export function allowBundledDebugToken(production: boolean): boolean {
  return !production;
}

/**
 * A clear, log-only explanation for configurations that cannot produce a token, so a tester sees why the backend rejects
 * requests instead of guessing. Returns null when the configuration is coherent.
 */
export function appCheckConfigurationWarning(production: boolean, simulator: SimulatorContext): string | null {
  if (!production) return null;
  if (simulatorDebugRequested(simulator) && simulator.isPhysicalDevice === true) {
    return 'App Check: EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG is ignored on a physical device; using App Attest / DeviceCheck.';
  }
  if (simulatorDebugRequested(simulator) && simulator.isPhysicalDevice !== false) {
    return 'App Check: device kind unknown, so the simulator debug provider stays off; using App Attest / DeviceCheck.';
  }
  if (!simulatorDebugRequested(simulator) && simulator.isPhysicalDevice === false) {
    return 'App Check: this release build runs in the iOS Simulator, which cannot attest, so protected requests will be rejected. '
      + "Build with the 'simulator' EAS profile and register the debug token this app prints in the simulator log.";
  }
  return null;
}

/** Build-time rule (app.config.ts): returns a message when the simulator flag is set by any profile other than `simulator`. */
export function simulatorDebugBuildProblem(buildProfile: string | undefined, flag: string | undefined): string | null {
  if (!flag?.trim()) return null;
  if (buildProfile === undefined) return null; // local development run, not an EAS build
  if (buildProfile !== SIMULATOR_BUILD_PROFILE) {
    return `EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG may only be set by the '${SIMULATOR_BUILD_PROFILE}' EAS profile, not '${buildProfile}'.`;
  }
  if (flag.trim() !== SIMULATOR_DEBUG_FLAG_VALUE) {
    return `EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG must be '${SIMULATOR_DEBUG_FLAG_VALUE}' or unset.`;
  }
  return null;
}
