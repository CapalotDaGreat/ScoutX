"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
function createCallableOptions(overrides = {}) {
    return {
        cors: true,
        enforceAppCheck: shouldEnforceAppCheck(),
        ...overrides,
    };
}
//# sourceMappingURL=callableOptions.js.map