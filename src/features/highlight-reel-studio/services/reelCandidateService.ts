import type { MatchAnalysisReport } from '@/features/match-analysis/types';
import type { HighlightCandidate, HighlightReelPlan, HighlightReelPreset } from '@/features/highlight-reel-studio/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTitle(value: string): string {
  return value.trim() || 'Player highlight reel';
}

function buildEventType(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('pass')) return 'Progressive pass';
  if (lower.includes('carry')) return 'Progressive carry';
  if (lower.includes('goal')) return 'Goal';
  if (lower.includes('recover')) return 'Recovery';
  if (lower.includes('save')) return 'Save';
  if (lower.includes('defend')) return 'Defensive action';
  if (lower.includes('dribble')) return 'Dribble';
  if (lower.includes('shot')) return 'Shot';
  return 'Match action';
}

function mapCategory(label: string): HighlightCandidate['category'] {
  const lower = label.toLowerCase();
  if (lower.includes('pass') || lower.includes('carry') || lower.includes('shot')) return 'technical';
  if (lower.includes('recover') || lower.includes('press') || lower.includes('position')) return 'tactical';
  if (lower.includes('run') || lower.includes('sprint') || lower.includes('movement')) return 'physical';
  return 'story';
}

export function buildHighlightCandidatesFromReport(
  report: MatchAnalysisReport,
  playerJersey?: string,
): HighlightCandidate[] {
  const baseMoments = (report.moments ?? []).map((moment, index) => ({
    id: `moment-${index}`,
    title: moment.label,
    description: moment.detail,
    timestampSec: moment.timestampSec,
    confidence: clamp(report.confidence * 1.1, 0.2, 0.98),
  }));

  const evidence = (report.evidence ?? []).slice(0, 5).map((item, index) => ({
    id: `evidence-${index}`,
    title: item.label,
    description: item.detail,
    timestampSec: item.timestampSec ?? 0,
    confidence: item.confidence ?? 0.5,
  }));

  const candidates: HighlightCandidate[] = [...baseMoments, ...evidence].map((item, index) => {
    const eventType = buildEventType(item.title);
    const category = mapCategory(item.title);
    const confidence = clamp(item.confidence ?? 0.65, 0.3, 0.98);
    const highlightValue = Math.round(confidence * 100 * (category === 'technical' ? 1.2 : category === 'tactical' ? 1.15 : 1)) / 10;

    return {
      id: `candidate-${item.id ?? index}`,
      title: normalizeTitle(item.title),
      eventType,
      category,
      description: item.description || 'Evidence-backed match moment selected from the player analysis.',
      reason: `Selected because it aligns with the player's role and the available match evidence.`,
      timestampSec: item.timestampSec ?? 0,
      confidence,
      highlightValue,
      status: confidence >= 0.8 ? 'verified' : confidence >= 0.6 ? 'high-confidence' : 'needs-confirmation',
      matchId: report.modelId,
      source: 'match-analysis',
      evidence: [
        `Player detection confidence ${(confidence * 100).toFixed(0)}%`,
        playerJersey ? `Target jersey #${playerJersey}` : 'Jersey continuity reviewed',
        `Coverage: ${report.coverage?.confidenceLabel ?? 'Limited'}`,
      ],
    };
  });

  return candidates.slice(0, 8);
}

export function buildHighlightReelPlan(
  candidates: HighlightCandidate[],
  preset: HighlightReelPreset,
  targetDurationSec = 45,
): HighlightReelPlan {
  const ranked = [...candidates].sort((a, b) => b.highlightValue - a.highlightValue);
  const selected = ranked.slice(0, Math.max(3, Math.min(7, Math.round(targetDurationSec / 7.5))));

  const titles: Record<HighlightReelPreset, string> = {
    'best-of': 'Best of the match',
    scout: 'Professional match review',
    social: 'Short social reel',
    tactical: 'Tactical contribution reel',
    development: 'Development moments',
  };

  const descriptions: Record<HighlightReelPreset, string> = {
    'best-of': 'Strongest verified moments selected for a compact, credible player story.',
    scout: 'Role-aware, evidence-first clips that highlight tactical and technical impact.',
    social: 'Fast-paced, visually clear moments tailored for short-form distribution.',
    tactical: 'Moments focused on pressing, movement, passing lanes, and role execution.',
    development: 'Moments emphasising learning points and key progression areas.',
  };

  const avgConfidence =
    selected.length > 0
      ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length
      : 0;

  return {
    preset,
    title: titles[preset],
    description: descriptions[preset],
    targetDurationSec,
    candidates: selected,
    qualityScore: Math.round((avgConfidence + selected.length / 10) * 100),
    coverage: selected.length > 0 ? 'Verified + high-confidence moments selected' : 'No reliable moments available',
  };
}
