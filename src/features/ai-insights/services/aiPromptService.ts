import { AI_INSIGHT_DESCRIPTIONS } from '@/features/ai-insights/constants';
import { type AiInsightType } from '@/features/ai-insights/types';

const SCHEMAS: Record<AiInsightType, string> = {
  performance_summary: `{
  "type": "performance_summary",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "highlights": [{ "label": "string", "value": "string", "trend": "up" | "down" | "neutral" }],
  "narrative": "string"
}`,
  improvement_suggestions: `{
  "type": "improvement_suggestions",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "focusAreas": ["string"],
  "suggestions": [{
    "id": "string",
    "title": "string",
    "description": "string",
    "priority": "low" | "medium" | "high",
    "category": "string"
  }]
}`,
  training_recommendations: `{
  "type": "training_recommendations",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "weeklyFocus": "string",
  "drills": [{
    "id": "string",
    "title": "string",
    "description": "string",
    "priority": "low" | "medium" | "high",
    "category": "string"
  }]
}`,
  potential_analysis: `{
  "type": "potential_analysis",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "currentRating": number,
  "potentialRating": number,
  "growthAreas": ["string"],
  "trajectory": "rising" | "stable" | "plateauing",
  "scoutNotes": "string"
}`,
  career_progression_summary: `{
  "type": "career_progression_summary",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "milestones": [{ "title": "string", "period": "string", "significance": "string" }],
  "nextSteps": ["string"]
}`,
  video_summary: `{
  "type": "video_summary",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "keyMoments": [{ "timestamp": "string", "description": "string" }],
  "strengthsShown": ["string"],
  "areasToImprove": ["string"]
}`,
  gps_summary: `{
  "type": "gps_summary",
  "generatedAt": "ISO-8601 string",
  "confidence": "low" | "medium" | "high",
  "title": "string",
  "summary": "string",
  "movementProfile": "string",
  "metrics": [{ "label": "string", "value": "string", "trend": "up" | "down" | "neutral" }],
  "tacticalInsights": ["string"]
}`,
};

export function getInsightJsonSchema(insightType: AiInsightType): string {
  return SCHEMAS[insightType];
}

export function buildSystemPrompt(insightType: AiInsightType): string {
  return [
    'You are ScoutX AI, a professional football performance analyst.',
    'Respond ONLY with a single JSON object. No markdown fences, no commentary.',
    `Insight type: ${insightType}`,
    `Purpose: ${AI_INSIGHT_DESCRIPTIONS[insightType]}`,
    'Required JSON schema:',
    SCHEMAS[insightType],
  ].join('\n\n');
}

export function buildUserPrompt(insightType: AiInsightType, contextJson: string): string {
  return [
    `Generate a ${insightType.replace(/_/g, ' ')} for the player using this structured context:`,
    contextJson,
    'Base every claim on the provided data. If data is sparse, lower confidence and state limitations in the summary.',
  ].join('\n\n');
}

export function buildCompletionPrompts(
  insightType: AiInsightType,
  contextJson: string,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: buildSystemPrompt(insightType),
    userPrompt: buildUserPrompt(insightType, contextJson),
  };
}
