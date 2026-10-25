"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEvidenceRunBundle = validateEvidenceRunBundle;
const identityCoordinator_1 = require("./identityCoordinator");
const cvContract_1 = require("./cvContract");
const row = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, required, optional = '') => row(v)
    && required.split(' ').every((k) => Object.hasOwn(v, k))
    && Object.keys(v).every((k) => `${required} ${optional}`.split(' ').filter(Boolean).includes(k));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, max) => num(v) && Number.isSafeInteger(v) && v >= 0 && v <= max;
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const list = (v, max) => Array.isArray(v) && v.length <= max;
const equal = (a, b) => row(a) && row(b)
    ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => equal(a[k], b[k]))
    : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => equal(v, b[i])) : a === b;
const scope = (v) => keys(v, 'jobId sourceSha256 generation modelSetDigest')
    && id(v.jobId) && digest(v.sourceSha256) && digest(v.modelSetDigest) && int(v.generation, 1000000);
const colours = new Set('red,blue,sky blue,navy,white,black,yellow,orange,green,purple,pink,grey,gray,maroon'.split(','));
const colour = (v) => typeof v === 'string' && v.length <= 40 && colours.has(v.trim().toLowerCase());
const target = (v) => keys(v, 'jerseyNumber kitPrimaryColor', 'kitSecondaryColor')
    && typeof v.jerseyNumber === 'string' && /^[0-9]{1,2}$/.test(v.jerseyNumber) && colour(v.kitPrimaryColor)
    && (v.kitSecondaryColor === undefined || v.kitSecondaryColor === '' || colour(v.kitSecondaryColor));
const sameTarget = (a, b) => a.jerseyNumber === b.jerseyNumber && a.kitPrimaryColor === b.kitPrimaryColor
    && (a.kitSecondaryColor ?? '') === (b.kitSecondaryColor ?? '');
const pixelBox = (v) => list(v, 4) && v.length === 4 && v.every(num)
    && v[0] >= 0 && v[1] >= 0 && v[2] > v[0] && v[3] > v[1];
function reference(v) {
    return keys(v, 'anchorId scope frameIndex timestampSec box evidenceHash') && id(v.anchorId) && scope(v.scope)
        && int(v.frameIndex, 1728000) && num(v.timestampSec) && digest(v.evidenceHash)
        && keys(v.box, 'x y width height');
}
/** Validates local producer metadata only; source bytes and server ownership are verified by the caller. */
function validateEvidenceRunBundle(artifact, bundle) {
    if (!keys(artifact, 'schemaVersion sourcePath generation anchorRevision evidence sourceProof')
        || artifact.schemaVersion !== 1 || !int(artifact.anchorRevision, 1000000) || artifact.anchorRevision < 1
        || typeof artifact.sourcePath !== 'string'
        || !/^profiles\/[A-Za-z0-9_-]{1,128}\/matchFootage\/[A-Za-z0-9_-]{6,80}\/video\.mp4$/.test(artifact.sourcePath))
        return null;
    const e = artifact.evidence, proof = artifact.sourceProof, p = bundle.plan, producer = bundle.identity;
    if (!keys(e, 'scope target durationSec references segments', 'sampleStepSec breaks nonPlayIntervals')
        || !scope(e.scope) || !target(e.target) || artifact.generation !== e.scope.generation
        || artifact.sourcePath.split('/')[3] !== e.scope.jobId
        || !num(e.durationSec) || e.durationSec <= 0 || e.durationSec > 9000
        || (e.sampleStepSec !== undefined && e.sampleStepSec !== 0.5)
        || !list(e.references, 8) || !e.references.length || !e.references.every(reference)
        || !list(e.segments, 15)
        || !keys(proof, 'schemaVersion scope evidenceFormat frames') || !list(proof.frames, 100008)
        || !proof.frames.every((f) => keys(f, 'frameId framePts timeBaseNumerator timeBaseDenominator timestampSec frameIndex evidenceHash width height', 'originNumerator originDenominator')
            && id(f.frameId) && int(f.frameIndex, 1728000) && int(f.width, 32768) && int(f.height, 32768))
        || !row(p) || p.mode !== 'run' || p.authorizedLocalEvaluation !== true || p.cloudUpload !== false || p.modelTraining !== false
        || p.durationSec !== e.durationSec || p.sourceSha256 !== e.scope.sourceSha256 || !target(p.target) || !sameTarget(p.target, e.target)
        || p.fps !== 2 || !num(p.referenceSec) || p.referenceSec < 0 || p.referenceSec >= e.durationSec
        || !list(p.segments, 15) || p.segments.length !== Math.ceil(e.durationSec / 600)
        || !keys(bundle.complete, 'status segments') || bundle.complete.status !== 'complete' || bundle.complete.segments !== p.segments.length
        || !keys(producer, 'workerVersion models sourceProofSha256 identity') || !digest(producer.sourceProofSha256)
        || typeof producer.workerVersion !== 'string' || !/^[A-Za-z0-9._/-]{1,120}$/.test(producer.workerVersion)
        || p.workerVersion !== producer.workerVersion || !row(producer.models)
        || Object.keys(producer.models).length < 1 || Object.keys(producer.models).length > 8)
        return null;
    const models = {};
    for (const [k, v] of Object.entries(producer.models)) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(k) || typeof v !== 'string' || !/^[A-Za-z0-9._/@+-]{1,120}$/.test(v) || v.includes('://'))
            return null;
        Object.defineProperty(models, k, { value: v, enumerable: true });
    }
    const identity = producer.identity;
    if ((0, identityCoordinator_1.approvedModelDigest)(models) !== e.scope.modelSetDigest || (p.models !== undefined && !equal(p.models, models))
        || !keys(identity, 'scope targetId target references windows associationMethod calibrated continuousIdentityValidated')
        || !equal(identity.scope, e.scope) || !target(identity.target) || !sameTarget(identity.target, e.target)
        || !equal(identity.references, e.references) || !list(identity.windows, 4096)
        || !identity.windows.every((w) => keys(w, 'startSec endSec state confidence'))
        || !(0, identityCoordinator_1.parseCoordinatorSummary)(producer, e.scope, e.durationSec)
        || bundle.segments.length !== p.segments.length || e.segments.length !== p.segments.length)
        return null;
    for (const field of ['breaks', 'nonPlayIntervals']) {
        const values = e[field];
        if (values === undefined)
            continue;
        if (!list(values, field === 'breaks' ? 256 : 32))
            return null;
        let end = 0;
        for (const value of values) {
            if (field === 'breaks') {
                if (!keys(value, 'timestampSec reason') || !num(value.timestampSec) || value.timestampSec < 0 || value.timestampSec >= e.durationSec
                    || !['halftime', 'camera_cut', 'non_play', 'manual_reset'].includes(String(value.reason)))
                    return null;
            }
            else {
                if (!keys(value, 'startSec endSec') || !num(value.startSec) || !num(value.endSec)
                    || value.startSec < end || value.endSec <= value.startSec || value.endSec > e.durationSec)
                    return null;
                end = value.endSec;
            }
        }
    }
    let observations = 0, decodedFrames = 0, tracePoints = 0;
    const segmentIds = new Set();
    for (let i = 0; i < p.segments.length; i++) {
        const start = i * 600, end = Math.min(start + 600, e.durationSec), planned = p.segments[i], owned = e.segments[i], output = bundle.segments[i];
        if (!keys(planned, 'segmentIndex startSec endSec') || planned.segmentIndex !== i || planned.startSec !== start || planned.endSec !== end
            || !keys(owned, 'segmentId startSec endSec tracklets') || !id(owned.segmentId) || segmentIds.has(owned.segmentId)
            || owned.startSec !== start || owned.endSec !== end || !list(owned.tracklets, 64)
            || !keys(output, 'segment targetTrace decodeAudit') || !row(output.segment) || !list(output.targetTrace, 100000))
            return null;
        segmentIds.add(owned.segmentId);
        const tracks = new Set();
        for (const t of owned.tracklets) {
            if (!keys(t, 'trackletId samples') || !id(t.trackletId) || tracks.has(t.trackletId) || !list(t.samples, 3600) || !t.samples.length)
                return null;
            tracks.add(t.trackletId);
            let last = -1;
            for (const s of t.samples) {
                if (++observations > 100000 || !keys(s, 'timestampSec jerseyRead jerseyConfidence teamMatch box')
                    || !num(s.timestampSec) || s.timestampSec < start || s.timestampSec >= end || s.timestampSec <= last)
                    return null;
                last = s.timestampSec;
            }
        }
        const result = output.segment, audit = output.decodeAudit;
        const parsed = (0, cvContract_1.parseCvSegmentResult)(result, { segmentIndex: i, startSec: start, endSec: end });
        if (!parsed || result.contractVersion !== 2 || result.segmentIndex !== i || result.workerVersion !== producer.workerVersion || !equal(result.models, models)
            || !keys(result.stages, 'tracking identity pitch events') || result.stages.tracking !== 'complete' || result.stages.identity !== 'complete'
            || !['complete', 'unavailable'].includes(String(result.stages.pitch)) || !['complete', 'unavailable'].includes(String(result.stages.events))
            || !row(result.identity) || !list(result.identity.candidates, 0)
            || !keys(audit, 'requestedStartSec requestedEndSec sampleStepSec timestampToleranceSec sampledSourceIntervals missingIntervals framesDecoded timestampsValid complete')
            || audit.complete !== true || audit.timestampsValid !== true || audit.requestedStartSec !== start || audit.requestedEndSec !== end
            || audit.sampleStepSec !== 0.5 || !num(audit.timestampToleranceSec) || audit.timestampToleranceSec < 0 || audit.timestampToleranceSec > 0.250001
            || !int(audit.framesDecoded, 100000) || audit.framesDecoded === 0 || !list(audit.missingIntervals, 0)
            || !list(audit.sampledSourceIntervals, 100000) || !audit.sampledSourceIntervals.length)
            return null;
        if (parsed.coverage.framesDecoded !== audit.framesDecoded)
            return null;
        decodedFrames += audit.framesDecoded;
        tracePoints += output.targetTrace.length;
        if (decodedFrames > 100000 || tracePoints > 100000)
            return null;
        let cursor = start, covered = 0;
        for (const interval of audit.sampledSourceIntervals) {
            if (!list(interval, 2) || interval.length !== 2 || !interval.every(num))
                return null;
            const [a, b] = interval;
            if (a < cursor || a - cursor > audit.timestampToleranceSec || b <= a || b > end)
                return null;
            covered += b - a;
            cursor = b;
        }
        if (end - cursor > audit.timestampToleranceSec || covered > audit.framesDecoded * 0.5 + 1e-6
            || audit.sampledSourceIntervals.length > audit.framesDecoded)
            return null;
        for (const point of output.targetTrace) {
            if (!keys(point, 'timeSec box') || !num(point.timeSec) || point.timeSec < start || point.timeSec >= end || !pixelBox(point.box))
                return null;
        }
    }
    // Reuse the coordinator's exact rational PTS, normalized-anchor and target-only pixel geometry checks.
    const anchors = e.references.map((r) => { const ref = r; return { frameId: ref.anchorId, timestampSec: ref.timestampSec, box: ref.box }; });
    const binding = (0, identityCoordinator_1.coordinatorPayload)({ targeting: e.target, durationSec: e.durationSec, videoStoragePath: artifact.sourcePath,
        experimentalTargetIdentity: { sourcePath: artifact.sourcePath, revision: artifact.anchorRevision, anchors } }, artifact, { jobId: String(e.scope.jobId), expectedGeneration: Number(e.scope.generation), expectedAnchorRevision: artifact.anchorRevision }, models);
    return binding ? { workerVersion: producer.workerVersion, models, sourceSha256: String(e.scope.sourceSha256), segmentCount: p.segments.length, decodeComplete: true } : null;
}
//# sourceMappingURL=identityEvidenceValidation.js.map