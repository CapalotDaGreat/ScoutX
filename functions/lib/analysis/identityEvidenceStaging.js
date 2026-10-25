"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageTrustedIdentityEvidence = stageTrustedIdentityEvidence;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const identityCoordinator_1 = require("./identityCoordinator");
const identityEvidenceValidation_1 = require("./identityEvidenceValidation");
const identityEvidenceSource_1 = require("./identityEvidenceSource");
const LEASE_MS = 20 * 60 * 1000;
const BATCH_PARTS = 8;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Privileged producer API only. Intentionally NOT exported as a callable/HTTP import. */
async function stageTrustedIdentityEvidence(db, uid, request, rawArtifact, bundle, testSource) {
    let artifact;
    try {
        const encoded = JSON.stringify(rawArtifact);
        if (!encoded || Buffer.byteLength(encoded) > 16 * 1024 * 1024)
            throw new Error('Invalid metadata size');
        artifact = JSON.parse(encoded);
    }
    catch {
        throw new https_1.HttpsError('invalid-argument', 'A bounded JSON evidence artifact is required.');
    }
    const run = (0, identityEvidenceValidation_1.validateEvidenceRunBundle)(artifact, bundle);
    if (!run || !isRecord(artifact))
        throw new https_1.HttpsError('invalid-argument', 'A complete, target-only verified run is required.');
    const stableArtifact = artifact;
    const { manifest, parts } = (0, identityCoordinator_1.chunkCoordinatorArtifact)(stableArtifact);
    const hash = String(manifest.payloadSha256);
    const source = (0, identityEvidenceSource_1.sourceVerifierFor)(testSource);
    const jobRef = db.collection('matchAnalysisJobs').doc(request.jobId);
    const headRef = jobRef.collection('identityEvidence').doc('current');
    const leaseRef = jobRef.collection('identityEvidenceStaging').doc('current');
    const token = (0, node_crypto_1.randomUUID)();
    const receipt = (status) => ({ status, artifactSha256: hash,
        segmentCount: run.segmentCount, partCount: parts.length });
    const guarded = async (tx) => {
        const context = await (0, identityCoordinator_1.readIdentityContext)(tx, db, uid, request);
        if (run.workerVersion !== context.approval.workerVersion
            || !(0, identityCoordinator_1.coordinatorPayload)(context.job, artifact, request, context.approval.models)) {
            throw new https_1.HttpsError('failed-precondition', 'The run does not match current approved evidence.');
        }
        return context;
    };
    const initial = await db.runTransaction(async (tx) => {
        const context = await guarded(tx);
        const head = await tx.get(headRef);
        const lease = await tx.get(leaseRef);
        if (head.exists) {
            const previous = head.get('trustedStaging');
            const witness = isRecord(previous) ? (0, identityEvidenceSource_1.parseSourceWitness)(previous.source) : null;
            if (!isRecord(previous) || previous.schemaVersion !== 1 || previous.artifactSha256 !== hash
                || head.get('payloadSha256') !== hash || !witness || witness.sha256 !== run.sourceSha256
                || previous.workerVersion !== run.workerVersion || previous.generation !== request.expectedGeneration
                || previous.anchorRevision !== request.expectedAnchorRevision || previous.sourcePath !== artifact.sourcePath) {
                throw new https_1.HttpsError('already-exists', 'Current evidence cannot be overwritten; start a new target revision.');
            }
            const loaded = await (0, identityCoordinator_1.readPrivateIdentityArtifact)(tx, headRef);
            if (!(0, identityCoordinator_1.coordinatorPayload)(context.job, loaded, request, context.approval.models)
                || JSON.stringify(loaded) !== JSON.stringify(artifact))
                throw new https_1.HttpsError('failed-precondition', 'Existing evidence is corrupt.');
            const actual = await source.version(String(artifact.sourcePath));
            if (actual.generation !== witness.generation || actual.sizeBytes !== witness.sizeBytes) {
                throw new https_1.HttpsError('aborted', 'The retained source changed.');
            }
            return false;
        }
        if (lease.exists && typeof lease.get('expiresAtMs') === 'number' && lease.get('expiresAtMs') > Date.now()) {
            throw new https_1.HttpsError('aborted', 'A producer is already staging this target.');
        }
        const abandoned = lease.get('payloadParts');
        if (Array.isArray(abandoned) && abandoned.length <= 64)
            for (const id of abandoned) {
                if (typeof id === 'string' && /^part_[a-f0-9]{16}_[0-9]{1,2}$/.test(id))
                    tx.delete(headRef.parent.doc(id));
            }
        tx.set(leaseRef, { token, artifactSha256: hash, generation: request.expectedGeneration,
            anchorRevision: request.expectedAnchorRevision, payloadParts: parts.map((part) => part.id),
            status: 'staging', expiresAtMs: Date.now() + LEASE_MS });
        return true;
    });
    if (!initial)
        return receipt('already_staged');
    const checkpoint = () => db.runTransaction(async (tx) => {
        await guarded(tx);
        const lease = await tx.get(leaseRef);
        if (lease.get('token') !== token || lease.get('artifactSha256') !== hash || lease.get('expiresAtMs') <= Date.now()) {
            throw new https_1.HttpsError('aborted', 'Staging ownership changed.');
        }
    });
    try {
        const witness = (0, identityEvidenceSource_1.parseSourceWitness)(await source.verify(String(artifact.sourcePath), checkpoint));
        if (!witness || witness.sha256 !== run.sourceSha256)
            throw new https_1.HttpsError('failed-precondition', 'Retained source SHA-256 does not match the run.');
        for (let start = 0; start < parts.length; start += BATCH_PARTS) {
            const batch = parts.slice(start, start + BATCH_PARTS);
            await db.runTransaction(async (tx) => {
                await guarded(tx);
                const lease = await tx.get(leaseRef);
                const head = await tx.get(headRef);
                const stored = await tx.getAll(...batch.map((part) => headRef.parent.doc(part.id)));
                if (head.exists || lease.get('token') !== token || lease.get('expiresAtMs') <= Date.now()) {
                    throw new https_1.HttpsError('aborted', 'Staging scope changed.');
                }
                for (const [index, part] of batch.entries()) {
                    if (stored[index].exists) {
                        if (stored[index].get('payloadBase64') !== part.payloadBase64)
                            throw new https_1.HttpsError('already-exists', 'An immutable evidence chunk differs.');
                    }
                    else
                        tx.create(stored[index].ref, { payloadBase64: part.payloadBase64 });
                }
                tx.update(leaseRef, { stagedParts: start + batch.length });
            });
        }
        await db.runTransaction(async (tx) => {
            await guarded(tx);
            const lease = await tx.get(leaseRef);
            const head = await tx.get(headRef);
            const stored = await tx.getAll(...parts.map((part) => headRef.parent.doc(part.id)));
            if (head.exists || lease.get('token') !== token || lease.get('expiresAtMs') <= Date.now()
                || lease.get('stagedParts') !== parts.length || stored.some((doc, i) => doc.get('payloadBase64') !== parts[i].payloadBase64)) {
                throw new https_1.HttpsError('aborted', 'Evidence publication changed.');
            }
            const actual = await source.version(String(artifact.sourcePath));
            if (actual.generation !== witness.generation || actual.sizeBytes !== witness.sizeBytes) {
                throw new https_1.HttpsError('aborted', 'The retained source changed during staging.');
            }
            tx.create(headRef, { ...manifest, trustedStaging: stagingStamp(witness, run.workerVersion, request, String(artifact.sourcePath), hash) });
            tx.update(leaseRef, { status: 'complete', expiresAtMs: 0 });
        });
        return receipt('staged');
    }
    catch (error) {
        // Only this lease owner can clean its immutable chunks. A resumed producer
        // may be reusing them; never delete a different owner's in-progress data.
        await db.runTransaction(async (tx) => {
            const lease = await tx.get(leaseRef);
            const head = await tx.get(headRef);
            if (lease.exists && lease.get('token') !== token || head.exists)
                return;
            for (const part of parts)
                tx.delete(headRef.parent.doc(part.id));
            if (lease.get('token') === token)
                tx.delete(leaseRef);
        }).catch(() => undefined);
        throw error;
    }
}
function stagingStamp(source, workerVersion, request, sourcePath, artifactSha256) {
    return { schemaVersion: 1, source, workerVersion, sourcePath, artifactSha256,
        generation: request.expectedGeneration, anchorRevision: request.expectedAnchorRevision, stagedAt: new Date().toISOString() };
}
//# sourceMappingURL=identityEvidenceStaging.js.map