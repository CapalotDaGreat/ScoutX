"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noopMediaScanner = void 0;
exports.getMediaScanner = getMediaScanner;
exports.setMediaScanner = setMediaScanner;
exports.noopMediaScanner = {
    engine: 'none',
    scan: async () => ({ status: 'not_scanned', engine: 'none', checkedAt: new Date().toISOString() }),
};
let activeScanner = exports.noopMediaScanner;
function getMediaScanner() {
    return activeScanner;
}
/** Test hook and future wiring point for a real scanner. */
function setMediaScanner(scanner) {
    activeScanner = scanner;
}
//# sourceMappingURL=mediaScanner.js.map