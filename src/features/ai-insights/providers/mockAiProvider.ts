import { type AiProvider } from '@/features/ai-insights/providers/types';
import {
  type AiCompletionRequest,
  type AiInsightContext,
  type AiInsightMap,
  type AiInsightType,
} from '@/features/ai-insights/types';

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function buildMockInsight<T extends AiInsightType>(
  type: T,
  context: AiInsightContext,
): AiInsightMap[T] {
  const playerName = context.player.playerName;
  const base = {
    type,
    generatedAt: nowIso(),
    confidence: 'medium' as const,
    title: `${playerName} — ${type.replace(/_/g, ' ')}`,
    summary: `Mock ${type.replace(/_/g, ' ')} generated locally for development.`,
  };

  switch (type) {
    case 'performance_summary':
      return {
        ...base,
        type: 'performance_summary',
        highlights: [
          {
            label: 'Matches',
            value: String(context.statistics?.matchCount ?? 0),
            trend: 'up',
          },
          {
            label: 'Goals',
            value: String(context.statistics?.totals.goals ?? 0),
            trend: 'neutral',
          },
          {
            label: 'Assists',
            value: String(context.statistics?.totals.assists ?? 0),
            trend: 'up',
          },
        ],
        narrative: `${playerName} shows consistent involvement with room to convert chances more efficiently.`,
      } as AiInsightMap[T];

    case 'improvement_suggestions':
      return {
        ...base,
        type: 'improvement_suggestions',
        focusAreas: ['Finishing', 'Defensive positioning', 'Transition speed'],
        suggestions: [
          {
            id: id('suggestion', 0),
            title: 'Clinical finishing reps',
            description: 'Add 15 minutes of first-touch finishing after training sessions.',
            priority: 'high',
            category: 'attacking',
          },
          {
            id: id('suggestion', 1),
            title: 'Scanning before receiving',
            description: 'Practice checking shoulders in rondo drills to improve decision speed.',
            priority: 'medium',
            category: 'awareness',
          },
        ],
      } as AiInsightMap[T];

    case 'training_recommendations':
      return {
        ...base,
        type: 'training_recommendations',
        weeklyFocus: 'Explosive first steps and composure in the final third',
        drills: [
          {
            id: id('drill', 0),
            title: 'Sprint-to-shot circuit',
            description: '6 x 20m sprints into a one-touch finish on both feet.',
            priority: 'high',
            category: 'physical',
          },
          {
            id: id('drill', 1),
            title: 'Positional shadow play',
            description: 'Mirror match scenarios for your primary position role.',
            priority: 'medium',
            category: 'tactical',
          },
        ],
      } as AiInsightMap[T];

    case 'potential_analysis':
      return {
        ...base,
        type: 'potential_analysis',
        currentRating: context.ratings?.overallRating ?? 72,
        potentialRating: context.ratings?.potentialRating ?? 82,
        growthAreas: ['Decision making', 'Physical robustness', 'Weak-foot usage'],
        trajectory: 'rising',
        scoutNotes: `${playerName} profiles as a high-upside talent with development-focused minutes.`,
      } as AiInsightMap[T];

    case 'career_progression_summary':
      return {
        ...base,
        type: 'career_progression_summary',
        milestones: (context.journey ?? []).slice(0, 4).map((entry, index) => ({
          title: entry.title,
          period: entry.date,
          significance:
            index === 0
              ? 'Most recent career signal'
              : 'Foundation experience in player development path',
        })),
        nextSteps: ['Build consistent match minutes', 'Expand highlight portfolio', 'Target next-level trial'],
      } as AiInsightMap[T];

    case 'video_summary':
      return {
        ...base,
        type: 'video_summary',
        keyMoments: (context.videos ?? []).slice(0, 3).map((video, index) => ({
          timestamp: `0${index + 1}:15`,
          description: `${video.title} — ${video.category} sequence`,
        })),
        strengthsShown: ['Ball carrying', 'Off-ball movement'],
        areasToImprove: ['Defensive recovery runs', 'Weak-foot composure'],
      } as AiInsightMap[T];

    case 'gps_summary':
      return {
        ...base,
        type: 'gps_summary',
        movementProfile: 'Balanced box-to-box workload with strong high-intensity bursts.',
        metrics: (context.gpsSessions ?? []).slice(0, 3).map((session) => ({
          label: session.matchLabel,
          value: `${session.distanceKm} km · ${session.maxSpeedKmh} km/h top`,
          trend: 'neutral' as const,
        })),
        tacticalInsights: [
          'Repeated high-speed runs into the attacking third',
          'Recovers centrally after turnovers',
        ],
      } as AiInsightMap[T];

    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported mock insight type: ${String(exhaustive)}`);
    }
  }
}

export class MockAiProvider implements AiProvider {
  readonly metadata = {
    id: 'mock',
    label: 'ScoutX Mock AI',
    isLive: false,
  };

  isAvailable(): boolean {
    return true;
  }

  async completeStructured<T extends AiInsightType>(
    request: AiCompletionRequest,
  ): Promise<AiInsightMap[T]> {
    const context = JSON.parse(request.contextJson) as AiInsightContext;
    return buildMockInsight(request.insightType, context) as AiInsightMap[T];
  }
}
