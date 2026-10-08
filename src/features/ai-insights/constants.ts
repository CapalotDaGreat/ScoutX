import { type AiInsightType } from '@/features/ai-insights/types';

export const AI_INSIGHT_DESCRIPTIONS: Record<AiInsightType, string> = {
  performance_summary: 'AI-generated overview of recent match output and trends.',
  improvement_suggestions: 'Targeted areas to elevate your game based on tracked data.',
  training_recommendations: 'Personalized drills and weekly focus recommendations.',
  potential_analysis: 'Projection of growth trajectory and scout-relevant potential.',
  career_progression_summary: 'Narrative summary of your football journey milestones.',
  video_summary: 'Highlights and coaching takeaways from match footage.',
  gps_summary: 'Movement intelligence and tactical insights from GPS sessions.',
};

export const AI_SYSTEM_ROLE =
  'You are PitchProof AI, a professional football performance analyst for players and scouts. Respond ONLY with valid JSON matching the requested schema. Be concise, actionable, and evidence-based. Never include markdown or prose outside the JSON object.';
