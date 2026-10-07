"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCallableCors = resolveCallableCors;
exports.createCallableOptions = createCallableOptions;
function isFunctionsEmulator() {
    return process.env.FUNCTIONS_EMULATOR === 'true';
}
function shouldEnforceAppCheck() {
    if (isFunctionsEmulator()) {
        return false;
    }
    return process.env.ENFORCE_APP_CHECK !== 'false';
}
/**
 * Browser origins allowed to call functions. The iOS app sends no Origin header, so
 * production needs none; the emulator allows any origin for the local web build.
 * CALLABLE_ALLOWED_ORIGINS is a comma-separated list of exact https origins.
 */
function resolveCallableCors(env = process.env) {
    if (env.FUNCTIONS_EMULATOR === 'true') {
        return true;
    }
    const origins = (env.CALLABLE_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin));
    return origins.length > 0 ? origins : false;
}
function createCallableOptions(overrides = {}) {
    return {
        cors: resolveCallableCors(),
        enforceAppCheck: shouldEnforceAppCheck(),
        ...overrides,
    };
}
//# sourceMappingURL=callableOptions.js.map