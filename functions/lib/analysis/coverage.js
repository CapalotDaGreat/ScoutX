"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoQualityBand = videoQualityBand;
exports.identifiedCoverageBand = identifiedCoverageBand;
exports.availabilityFromFrames = availabilityFromFrames;
exports.computeCoverage = computeCoverage;
const RANK = { Insufficient: 0, Limited: 1, Good: 2, Excellent: 3 };
function lowest(...bands) {
    return bands.reduce((low, band) => (RANK[band] < RANK[low] ? band : low));
}
function videoQualityBand(probe) {
    const shortSide = Math.min(probe?.height ?? 0, probe?.width ?? 0);
    if (shortSide >= 720)
        return 'Good';
    if (shortSide >= 360)
        return 'Limited';
    return 'Insufficient';
}
function identifiedCoverageBand(identified, sampled) {
    if (identified < 3 || sampled === 0)
        return 'Insufficient';
    const ratio = identified / sampled;
    if (identified >= 8 && ratio >= 0.4)
        return 'Good';
    return 'Limited';
}
/** Sightings become zero-length windows at the exact frame time; the rest of the match is unknown. */
function availabilityFromFrames(durationSec, sampledFrames, citedFrameIds) {
    const cited = new Set(citedFrameIds);
    const sightings = sampledFrames
        .filter((frame) => cited.has(frame.id))
        .sort((a, b) => a.timestampSec - b.timestampSec);
    const windows = [];
    let cursor = 0;
    for (const frame of sightings) {
        if (frame.timestampSec > cursor) {
            windows.push(unknownWindow(windows.length, cursor, frame.timestampSec));
        }
        windows.push({
            id: `avail_${windows.length}`,
            startSec: frame.timestampSec,
            endSec: frame.timestampSec,
            state: 'confirmed_visible',
            confidence: 0.5,
            label: 'Seen in sampled frame',
            note: `Frame ${frame.id} shows the nominated player.`,
        });
        cursor = frame.timestampSec;
    }
    if (durationSec > cursor)
        windows.push(unknownWindow(windows.length, cursor, durationSec));
    return windows;
}
function unknownWindow(index, startSec, endSec) {
    return {
        id: `avail_${index}`,
        startSec,
        endSec,
        state: 'unknown',
        confidence: 0,
        label: 'Unknown',
        note: 'No tracking between sampled frames.',
    };
}
function computeCoverage(input) {
    const sampledIds = new Set(input.sampledFrames.map((frame) => frame.id));
    const identifiedFrameCount = new Set(input.citedFrameIds.filter((id) => sampledIds.has(id))).size;
    const sampledFrameCount = input.sampledFrames.length;
    const extractedSegmentCount = input.segments.filter((segment) => segment.state === 'complete').length;
    const failedSegmentCount = input.segments.filter((segment) => segment.state === 'failed').length;
    const cameraCoverage = identifiedCoverageBand(identifiedFrameCount, sampledFrameCount);
    const segmentBand = input.segments.length === 0 || failedSegmentCount === 0
        ? 'Good'
        : extractedSegmentCount / input.segments.length >= 0.75
            ? 'Limited'
            : 'Insufficient';
    const playerIdentity = !input.identityConfirmed
        ? 'Insufficient'
        : identifiedFrameCount >= 3
            ? 'Good'
            : 'Limited';
    const overallCoverage = lowest(cameraCoverage, segmentBand);
    return {
        sampledCoverage: {
            sampledFrameCount,
            identifiedFrameCount,
            segmentCount: input.segments.length,
            extractedSegmentCount,
            failedSegmentCount,
            confidenceLabel: overallCoverage,
        },
        availability: availabilityFromFrames(input.durationSec, input.sampledFrames, input.citedFrameIds),
        confidenceDimensions: {
            videoQuality: videoQualityBand(input.probe),
            playerIdentity,
            cameraCoverage,
            trackingStability: 'Insufficient',
            eventConfidence: 'Insufficient',
            overallCoverage,
        },
    };
}
//# sourceMappingURL=coverage.js.map