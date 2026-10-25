"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retainedSourceVerifier = void 0;
exports.sourceVerifierFor = sourceVerifierFor;
exports.parseSourceWitness = parseSourceWitness;
const node_crypto_1 = require("node:crypto");
const node_stream_1 = require("node:stream");
const storage_1 = require("firebase-admin/storage");
const MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024;
function ownedVideo(path) {
    if (!/^profiles\/[^/]+\/matchFootage\/[A-Za-z0-9_-]{6,80}\/video\.mp4$/.test(path))
        throw new Error('Invalid retained source');
}
exports.retainedSourceVerifier = {
    async version(path) {
        ownedVideo(path);
        const [metadata] = await (0, storage_1.getStorage)().bucket().file(path).getMetadata();
        const generation = String(metadata.generation ?? '');
        const sizeBytes = Number(metadata.size);
        if (!/^[0-9]{1,32}$/.test(generation) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
            throw new Error('Invalid retained source version');
        }
        return { generation, sizeBytes };
    },
    async verify(path, checkpoint) {
        const before = await this.version(path);
        const stream = (0, storage_1.getStorage)().bucket().file(path, { generation: before.generation }).createReadStream({ validation: true });
        (0, node_stream_1.addAbortSignal)(AbortSignal.timeout(8 * 60 * 1000), stream);
        const hash = (0, node_crypto_1.createHash)('sha256');
        let bytes = 0;
        let checkedAt = Date.now();
        try {
            for await (const chunk of stream) {
                const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                bytes += data.byteLength;
                if (bytes > before.sizeBytes || bytes > MAX_SOURCE_BYTES)
                    throw new Error('Source exceeds declared size');
                hash.update(data);
                if (checkpoint && Date.now() - checkedAt >= 5000) {
                    await checkpoint();
                    checkedAt = Date.now();
                }
            }
        }
        finally {
            stream.destroy();
        }
        const after = await this.version(path);
        if (bytes !== before.sizeBytes || after.generation !== before.generation || after.sizeBytes !== before.sizeBytes) {
            throw new Error('Retained source changed');
        }
        return { ...before, sha256: hash.digest('hex') };
    },
};
/** Only local demo tests may replace storage reads; production always uses GCS. */
function sourceVerifierFor(testVerifier) {
    const emulated = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    return emulated && testVerifier ? testVerifier : exports.retainedSourceVerifier;
}
function parseSourceWitness(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const input = value;
    if (typeof input.generation !== 'string' || !/^[0-9]{1,32}$/.test(input.generation)
        || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)
        || typeof input.sizeBytes !== 'number' || !Number.isSafeInteger(input.sizeBytes)
        || input.sizeBytes <= 0 || input.sizeBytes > MAX_SOURCE_BYTES)
        return null;
    return { generation: input.generation, sizeBytes: input.sizeBytes, sha256: input.sha256 };
}
//# sourceMappingURL=identityEvidenceSource.js.map