/**
 * Coverage and confidence computed only from what the pipeline actually has: extracted
 * segments, sampled frames and frames the model cited for the nominated player. Without a
 * tracking worker, availability is CONFIRMED_VISIBLE (a cited frame) or UNKNOWN — never
 * "likely off camera" or "off pitch".
 */
import type { SegmentRecord } from './segments';

export type ConfidenceBand = 'Excellent' | 'Good' | 'Limited' | 'Insufficient';

export type AvailabilityState = 'confirmed_visible' | 'likely_active_off_camera' | 'confirmed_off_pitch' | 'unknown';

export type AvailabilityWindow = {
  id: string;
  startSec: number;
  endSec: number;
  state: AvailabilityState;
  confidence: number;
  label: string;
  note: string;
};

export type ConfidenceDimensions = {
  videoQuality: ConfidenceBand;
  playerIdentity: ConfidenceBand;
  cameraCoverage: ConfidenceBand;
  trackingStability: ConfidenceBand;
  eventConfidence: ConfidenceBand;
  overallCoverage: ConfidenceBand;
};

export type CoverageInput = {
  durationSec: number;
  segments: SegmentRecord[];
  sampledFrames: Array<{ id: string; timestampSec: number }>;
  citedFrameIds: string[];
  identityConfirmed: boolean;
  probe: { height?: number | null; width?: number | null } | null;
};

export type CoverageResult = {
  sampledCoverage: {
    sampledFrameCount: number;
    identifiedFrameCount: number;
    segmentCount: number;
    extractedSegmentCount: number;
    failedSegmentCount: number;
    confidenceLabel: ConfidenceBand;
  };
  availability: AvailabilityWindow[];
  confidenceDimensions: ConfidenceDimensions;
};

const RANK: Record<ConfidenceBand, number> = { Insufficient: 0, Limited: 1, Good: 2, Excellent: 3 };

function lowest(...bands: ConfidenceBand[]): ConfidenceBand {
  return bands.reduce((low, band) => (RANK[band] < RANK[low] ? band : low));
}

export function videoQualityBand(probe: CoverageInput['probe']): ConfidenceBand {
  const shortSide = Math.min(probe?.height ?? 0, probe?.width ?? 0);
  if (shortSide >= 720) return 'Good';
  if (shortSide >= 360) return 'Limited';
  return 'Insufficient';
}

export function identifiedCoverageBand(identified: number, sampled: number): ConfidenceBand {
  if (identified < 3 || sampled === 0) return 'Insufficient';
  const ratio = identified / sampled;
  if (identified >= 8 && ratio >= 0.4) return 'Good';
  return 'Limited';
}

/** Sightings become zero-length windows at the exact frame time; the rest of the match is unknown. */
export function availabilityFromFrames(
  durationSec: number,
  sampledFrames: CoverageInput['sampledFrames'],
  citedFrameIds: string[],
): AvailabilityWindow[] {
  const cited = new Set(citedFrameIds);
  const sightings = sampledFrames
    .filter((frame) => cited.has(frame.id))
    .sort((a, b) => a.timestampSec - b.timestampSec);
  const windows: AvailabilityWindow[] = [];
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
  if (durationSec > cursor) windows.push(unknownWindow(windows.length, cursor, durationSec));
  return windows;
}

function unknownWindow(index: number, startSec: number, endSec: number): AvailabilityWindow {
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

export function computeCoverage(input: CoverageInput): CoverageResult {
  const sampledIds = new Set(input.sampledFrames.map((frame) => frame.id));
  const identifiedFrameCount = new Set(input.citedFrameIds.filter((id) => sampledIds.has(id))).size;
  const sampledFrameCount = input.sampledFrames.length;
  const extractedSegmentCount = input.segments.filter((segment) => segment.state === 'complete').length;
  const failedSegmentCount = input.segments.filter((segment) => segment.state === 'failed').length;

  const cameraCoverage = identifiedCoverageBand(identifiedFrameCount, sampledFrameCount);
  const segmentBand: ConfidenceBand =
    input.segments.length === 0 || failedSegmentCount === 0
      ? 'Good'
      : extractedSegmentCount / input.segments.length >= 0.75
        ? 'Limited'
        : 'Insufficient';
  const playerIdentity: ConfidenceBand = !input.identityConfirmed
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
