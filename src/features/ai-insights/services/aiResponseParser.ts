import { type AiInsight, type AiInsightMap, type AiInsightType, type AiPriority } from '@/features/ai-insights/types';
import { asRecord, parseIsoDate, parseString, parseStringList } from '@/utils/firestoreParsing';

function parseConfidence(value: unknown): AiInsight['confidence'] {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  // Unknown confidence stays unknown rather than being reported as "medium".
  return null;
}

function parseNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Accepts mm:ss or hh:mm:ss; anything else means the model did not give a usable timestamp. */
function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{1,2}(:\d{2}){1,2}$/.test(trimmed) ? trimmed : null;
}

function parseTrend(value: unknown): 'up' | 'down' | 'neutral' | undefined {
  if (value === 'up' || value === 'down' || value === 'neutral') {
    return value;
  }
  return undefined;
}

function parsePriority(value: unknown): AiPriority | null {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return null;
}

function parseTrajectory(value: unknown): 'rising' | 'stable' | 'plateauing' | null {
  if (value === 'rising' || value === 'stable' || value === 'plateauing') {
    return value;
  }
  return null;
}

function parseBase(record: Record<string, unknown>, expectedType: AiInsightType) {
  const summary = parseString(record.summary);
  if (!summary) {
    throw new Error('AI response did not include a summary.');
  }
  return {
    type: expectedType,
    generatedAt: parseIsoDate(record.generatedAt),
    confidence: parseConfidence(record.confidence),
    title: parseString(record.title, AI_FALLBACK_TITLE[expectedType]),
    summary,
  };
}

const AI_FALLBACK_TITLE: Record<AiInsightType, string> = {
  performance_summary: 'Performance Overview',
  improvement_suggestions: 'Areas to Improve',
  training_recommendations: 'Training Plan',
  potential_analysis: 'Potential Outlook',
  career_progression_summary: 'Career Progression',
  video_summary: 'Video Analysis',
  gps_summary: 'GPS Movement Report',
};

function parseRecommendations(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      return {
        id: parseString(record.id, `rec-${index + 1}`),
        title: parseString(record.title, 'Recommendation'),
        description: parseString(record.description),
        priority: parsePriority(record.priority),
        category: parseString(record.category) || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function parseHighlights(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      return {
        label: parseString(record.label, 'Metric'),
        value: parseString(record.value, '—'),
        trend: parseTrend(record.trend),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function parseAiInsightResponse<T extends AiInsightType>(
  raw: unknown,
  expectedType: T,
): AiInsightMap[T] {
  const record = asRecord(raw);
  if (!record) {
    throw new Error('AI response was not a JSON object.');
  }

  const responseType = parseString(record.type);
  if (responseType !== expectedType) {
    throw new Error(`Expected insight type "${expectedType}" but received "${responseType}".`);
  }

  const base = parseBase(record, expectedType);

  switch (expectedType) {
    case 'performance_summary':
      return {
        ...base,
        type: 'performance_summary',
        highlights: parseHighlights(record.highlights),
        narrative: parseString(record.narrative, base.summary),
      } as AiInsightMap[T];

    case 'improvement_suggestions':
      return {
        ...base,
        type: 'improvement_suggestions',
        focusAreas: parseStringList(record.focusAreas),
        suggestions: parseRecommendations(record.suggestions),
      } as AiInsightMap[T];

    case 'training_recommendations':
      return {
        ...base,
        type: 'training_recommendations',
        weeklyFocus: parseString(record.weeklyFocus),
        drills: parseRecommendations(record.drills),
      } as AiInsightMap[T];

    case 'potential_analysis':
      return {
        ...base,
        type: 'potential_analysis',
        currentRating: parseNullableNumber(record.currentRating),
        potentialRating: parseNullableNumber(record.potentialRating),
        growthAreas: parseStringList(record.growthAreas),
        trajectory: parseTrajectory(record.trajectory),
        scoutNotes: parseString(record.scoutNotes, base.summary),
      } as AiInsightMap[T];

    case 'career_progression_summary':
      return {
        ...base,
        type: 'career_progression_summary',
        milestones: Array.isArray(record.milestones)
          ? record.milestones
              .map((item) => {
                const milestone = asRecord(item);
                if (!milestone) {
                  return null;
                }
                return {
                  title: parseString(milestone.title),
                  period: parseString(milestone.period),
                  significance: parseString(milestone.significance),
                };
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
          : [],
        nextSteps: parseStringList(record.nextSteps),
      } as AiInsightMap[T];

    case 'video_summary':
      return {
        ...base,
        type: 'video_summary',
        keyMoments: Array.isArray(record.keyMoments)
          ? record.keyMoments
              .map((item) => {
                const moment = asRecord(item);
                if (!moment) {
                  return null;
                }
                const description = parseString(moment.description);
                if (!description) {
                  return null;
                }
                return {
                  timestamp: parseTimestamp(moment.timestamp),
                  description,
                };
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
          : [],
        strengthsShown: parseStringList(record.strengthsShown),
        areasToImprove: parseStringList(record.areasToImprove),
      } as AiInsightMap[T];

    case 'gps_summary':
      return {
        ...base,
        type: 'gps_summary',
        movementProfile: parseString(record.movementProfile, base.summary),
        metrics: parseHighlights(record.metrics),
        tacticalInsights: parseStringList(record.tacticalInsights),
      } as AiInsightMap[T];

    default: {
      const exhaustive: never = expectedType;
      throw new Error(`Unsupported insight type: ${String(exhaustive)}`);
    }
  }
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('Could not extract JSON from model response.');
}
