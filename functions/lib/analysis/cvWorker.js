"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notAvailableCvWorker = void 0;
exports.getCvWorker = getCvWorker;
exports.setCvWorker = setCvWorker;
const workerContract_1 = require("./workerContract");
exports.notAvailableCvWorker = {
    id: 'not_available',
    available: false,
    run: async () => (0, workerContract_1.unavailableCvOutputs)(),
};
let activeWorker = exports.notAvailableCvWorker;
function getCvWorker() {
    return activeWorker;
}
function setCvWorker(worker) {
    activeWorker = worker;
}
//# sourceMappingURL=cvWorker.js.map