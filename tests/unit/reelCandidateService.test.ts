import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHighlightCandidatesFromReport,
  buildHighlightReelPlan,
} from '../../src/features/highlight-reel-studio/services/reelCandidateService.ts';
import type { MatchAnalysisReport } from '../../src/features/match-analysis/types.ts';

function report(overrides: Partial<MatchAnalysisReport>): MatchAnalysisReport {
  return {
    confidence: 0.7,
    moments: [],
    evidence: [],
    ...overrides,
  } as MatchAnalysisReport;
}

describe('buildHighlightCandidatesFromReport', () => {
  test('drops moments and evidence without a real timestamp instead of inventing one', () => {
    const candidates = buildHighlightCandidatesFromReport(
      report({
        moments: [
          { label: 'Progressive pass', detail: 'd', timestampSec: 120 },
          { label: 'No time', detail: 'd', timestampSec: Number.NaN },
        ],
        evidence: [
          { kind: 'unknown', label: 'No timestamp', detail: 'd', confidence: 0.9 },
          { kind: 'unknown', label: 'Recovery', detail: 'd', confidence: 0.8, timestampSec: 300 },
        ],
      } as Partial<MatchAnalysisReport>),
    );
    assert.deepEqual(
      candidates.map((item) => item.timestampSec),
      [120, 300],
    );
  });

  test('uses model confidence as-is and never labels AI clips as verified', () => {
    const candidates = buildHighlightCandidatesFromReport(
      report({
        confidence: 0.95,
        moments: [{ label: 'Goal', detail: 'd', timestampSec: 10 }],
      } as Partial<MatchAnalysisReport>),
    );
    assert.equal(candidates[0].confidence, 0.95);
    assert.equal(candidates[0].status, 'high-confidence');
    assert.ok(candidates.every((item) => item.status !== 'verified'));
  });

  test('evidence without a model confidence is excluded rather than given a default', () => {
    const candidates = buildHighlightCandidatesFromReport(
      report({
        evidence: [{ kind: 'unknown', label: 'Shot', detail: 'd', timestampSec: 50 }],
      } as Partial<MatchAnalysisReport>),
    );
    assert.equal(candidates.length, 0);
  });

  test('does not claim jersey checks when no jersey was provided', () => {
    const [candidate] = buildHighlightCandidatesFromReport(
      report({ moments: [{ label: 'Pass', detail: 'd', timestampSec: 5 }] } as Partial<MatchAnalysisReport>),
    );
    assert.ok(candidate.evidence.every((line) => !line.toLowerCase().includes('jersey')));
  });
});

describe('buildHighlightReelPlan', () => {
  test('reel score is bounded to 100 and empty plans say so', () => {
    const candidates = buildHighlightCandidatesFromReport(
      report({
        confidence: 0.98,
        moments: Array.from({ length: 8 }, (_, index) => ({
          label: 'Pass',
          detail: 'd',
          timestampSec: index * 10,
        })),
      } as Partial<MatchAnalysisReport>),
    );
    const plan = buildHighlightReelPlan(candidates, 'best-of', 60);
    assert.ok(plan.qualityScore <= 100);
    assert.equal(buildHighlightReelPlan([], 'scout').coverage, 'No reliable moments available');
  });
});
