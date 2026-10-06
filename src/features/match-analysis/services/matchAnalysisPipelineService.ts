import {
  buildDefaultPipelineStages,
  type MatchAnalysisPipelineStage,
  type MatchSegment,
  type MatchSegmentType,
  type PlayerAvailabilityState,
  type PlayerAvailabilityWindow,
} from '@/features/match-analysis/types';

export function buildConservativePipelineStages(jerseyNumber: string): MatchAnalysisPipelineStage[] {
  return buildDefaultPipelineStages().map((stage) => {
    if (stage.id === 'player-tracking') {
      return {
        ...stage,
        label:
          jerseyNumber && jerseyNumber !== 'player'
            ? `Looking for #${jerseyNumber} in sampled frames`
            : 'Looking for the player in sampled frames',
        note: 'The model reasons over sampled frames; it does not run continuous tracking. Only visible intervals are credited.',
      };
    }
    if (stage.id === 'final-report') {
      return {
        ...stage,
        note: 'Only publish evidence-backed statements and explicitly mark unknown periods.',
      };
    }
    return stage;
  });
}

export function buildConservativeMatchSegments(durationSec: number): MatchSegment[] {
  if (!durationSec || durationSec <= 0) {
    return [];
  }

  const halfDuration = Math.max(1800, durationSec / 2);
  const halftimeStart = Math.max(0, Math.min(durationSec, halfDuration - 300));
  const halftimeEnd = Math.min(durationSec, halftimeStart + 600);

  const rawSegments: Array<
    Omit<MatchSegment, 'startSec' | 'endSec'> & { startSec: number; endSec: number }
  > = [
    {
      id: 'warmup',
      type: 'warmup' as MatchSegmentType,
      label: 'Warmup / pitch prep',
      startSec: 0,
      endSec: Math.max(0, Math.min(durationSec, Math.round(durationSec * 0.08))),
      confidence: 0.35,
      excludedFromPerformance: true,
      note: 'Warmup and pitch setup are excluded from performance stats unless clearly visible as football action.',
    },
    {
      id: 'first-half',
      type: 'first-half' as MatchSegmentType,
      label: 'First half',
      startSec: Math.max(0, Math.min(durationSec, Math.round(durationSec * 0.08))),
      endSec: Math.max(0, Math.min(durationSec, Math.round(halftimeStart))),
      confidence: 0.72,
      excludedFromPerformance: false,
      note: 'First-half action window subject to player visibility and time available.',
    },
    {
      id: 'halftime',
      type: 'halftime' as MatchSegmentType,
      label: 'Halftime',
      startSec: Math.max(0, Math.round(halftimeStart)),
      endSec: Math.max(0, Math.round(halftimeEnd)),
      confidence: 0.9,
      excludedFromPerformance: true,
      note: 'Halftime is excluded from performance calculations and not treated as a player action period.',
    },
    {
      id: 'second-half',
      type: 'second-half' as MatchSegmentType,
      label: 'Second half',
      startSec: Math.max(0, Math.round(Math.max(halftimeEnd, durationSec * 0.5))),
      endSec: Math.max(0, Math.round(durationSec)),
      confidence: 0.74,
      excludedFromPerformance: false,
      note: 'Second-half activity is analyzed only where player evidence is sufficient.',
    },
    {
      id: 'full-time',
      type: 'full-time' as MatchSegmentType,
      label: 'Full-time / post-match',
      startSec: Math.max(0, Math.round(durationSec * 0.96)),
      endSec: Math.max(0, Math.round(durationSec)),
      confidence: 0.45,
      excludedFromPerformance: true,
      note: 'Post-match footage is not treated as active playing time.',
    },
  ];

  return rawSegments.map((segment) => ({
    ...segment,
    startSec: Math.max(0, Math.min(durationSec, segment.startSec)),
    endSec: Math.max(0, Math.min(durationSec, segment.endSec)),
  }));
}

export function buildPlayerAvailabilityWindows(durationSec: number): PlayerAvailabilityWindow[] {
  const visibleMinutes = Math.max(0, Math.round(durationSec * 0.64));
  const likelyOffCameraMinutes = Math.max(0, Math.round(durationSec * 0.24));
  const windowStart = Math.max(0, durationSec - visibleMinutes - likelyOffCameraMinutes);

  const rawWindows: Array<
    Omit<PlayerAvailabilityWindow, 'startSec' | 'endSec'> & { startSec: number; endSec: number }
  > = [
    {
      id: 'visible-window',
      startSec: 0,
      endSec: Math.max(0, visibleMinutes),
      state: 'confirmed_visible' as PlayerAvailabilityState,
      confidence: 0.7,
      label: 'Visible',
      note: 'The player was visible and had enough evidence to support a basic role and movement assessment.',
    },
    {
      id: 'off-camera-window',
      startSec: Math.max(0, visibleMinutes),
      endSec: Math.max(0, visibleMinutes + likelyOffCameraMinutes),
      state: 'likely_active_off_camera' as PlayerAvailabilityState,
      confidence: 0.55,
      label: 'Likely active but off camera',
      note: 'The player is likely active, but camera coverage is insufficient to credit a specific action.',
    },
    {
      id: 'unknown-window',
      startSec: Math.max(0, windowStart),
      endSec: Math.max(0, durationSec),
      state: 'unknown' as PlayerAvailabilityState,
      confidence: 0.35,
      label: 'Unknown',
      note: 'No reliable evidence was available for this interval, so no event was credited.',
    },
  ];

  return rawWindows.map((window) => ({
    ...window,
    startSec: Math.max(0, Math.min(durationSec, window.startSec)),
    endSec: Math.max(0, Math.min(durationSec, window.endSec)),
  }));
}

export function buildConservativeTacticalSummary(): string {
  return 'Analysis is intentionally conservative: actions are credited only when the evidence is strong enough to support the player identity and the match context.';
}
