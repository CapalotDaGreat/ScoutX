import {
  buildDefaultPipelineStages,
  type MatchAnalysisPipelineStage,
} from '@/features/match-analysis/types';

export function buildConservativePipelineStages(jerseyNumber: string): MatchAnalysisPipelineStage[] {
  return buildDefaultPipelineStages().map((stage) => {
    if (stage.id === 'player-identification') {
      return {
        ...stage,
        label:
          jerseyNumber && jerseyNumber !== 'player'
            ? `Looking for #${jerseyNumber} in sampled frames`
            : 'Looking for the player in sampled frames',
        note: 'The model reasons over sampled still frames. It does not run continuous tracking.',
      };
    }
    return stage;
  });
}

export function buildConservativeTacticalSummary(): string {
  return 'Tracking, pitch maps and event detection are unavailable. Only sampled-frame observations can be shown.';
}
