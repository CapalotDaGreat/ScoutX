import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useMatchAnalysis } from '@/features/match-analysis/hooks/useMatchAnalysis';
import {
  buildHighlightCandidatesFromReport,
  buildHighlightReelPlan,
} from '@/features/highlight-reel-studio/services/reelCandidateService';
import {
  type HighlightReelPreset,
  type HighlightCandidate,
} from '@/features/highlight-reel-studio/types';

function CandidateCard({ candidate }: { candidate: HighlightCandidate }) {
  return (
    <Card variant="default" padding="md" className="gap-1">
      <Text weight="semibold">{candidate.title}</Text>
      <Text variant="caption" color="secondary">
        {candidate.eventType} · {candidate.status} · {Math.round(candidate.confidence * 100)}% confidence
      </Text>
      <Text variant="body-sm" color="secondary">
        {candidate.reason}
      </Text>
      {candidate.evidence.length > 0 ? (
        <Text variant="caption" color="secondary">
          Evidence: {candidate.evidence.join(' · ')}
        </Text>
      ) : null}
    </Card>
  );
}

export type HighlightReelStudioModalProps = {
  visible: boolean;
  playerId: string | null;
  onClose: () => void;
};

export function HighlightReelStudioModal({ visible, playerId, onClose }: HighlightReelStudioModalProps) {
  const { recentJobs } = useMatchAnalysis(playerId);
  const [preset, setPreset] = useState<HighlightReelPreset>('best-of');
  const [targetSeconds, setTargetSeconds] = useState(45);

  const latestReport = recentJobs[0]?.report;

  const candidates = useMemo(() => {
    if (!latestReport) {
      return [];
    }
    return buildHighlightCandidatesFromReport(latestReport, recentJobs[0]?.targeting.jerseyNumber);
  }, [latestReport, recentJobs]);

  const reelPlan = useMemo(() => {
    if (!candidates.length) {
      return null;
    }
    return buildHighlightReelPlan(candidates, preset, targetSeconds);
  }, [candidates, preset, targetSeconds]);

  const presets: Array<{ id: HighlightReelPreset; label: string }> = [
    { id: 'best-of', label: 'Best of' },
    { id: 'scout', label: 'Scout reel' },
    { id: 'social', label: 'Social reel' },
    { id: 'tactical', label: 'Tactical' },
    { id: 'development', label: 'Development' },
  ];

  return (
    <Modal visible={visible} onClose={onClose} title="Highlight Reel Studio" size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <Text variant="body-sm" color="secondary">
          Build a credible football story from validated match moments. The AI only selects clips with
          evidence and avoids inventing actions or manufacturing highlight moments.
        </Text>

        <Card variant="default" padding="lg" className="gap-3">
          <Heading level={3}>Reel style</Heading>
          <View className="flex-row flex-wrap gap-2">
            {presets.map((item) => (
              <Button
                key={item.id}
                variant={preset === item.id ? 'accent' : 'secondary'}
                size="sm"
                onPress={() => setPreset(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </View>
          <Text variant="caption" color="secondary">
            Target length: {targetSeconds}s
          </Text>
          <Button variant="secondary" size="sm" onPress={() => setTargetSeconds((current) => (current === 45 ? 90 : 45))}>
            Toggle 45s / 90s
          </Button>
        </Card>

        {latestReport && candidates.length > 0 && reelPlan ? (
          <>
            <Card variant="elevated" padding="lg" className="gap-2">
              <Heading level={3}>{reelPlan.title}</Heading>
              <Text variant="body-sm" color="secondary">{reelPlan.description}</Text>
              <Text variant="caption" color="secondary">
                Quality score {reelPlan.qualityScore}/100 · {reelPlan.coverage}
              </Text>
            </Card>

            <Card variant="default" padding="lg" className="gap-3">
              <Heading level={3}>AI-selected moments</Heading>
              <View className="gap-2">
                {reelPlan.candidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </View>
            </Card>
          </>
        ) : (
          <Card variant="default" padding="lg">
            <Text variant="body-sm" color="secondary">
              No validated match analysis is available yet. Analyze a match first to generate highlight
              candidates from real evidence.
            </Text>
          </Card>
        )}

        <Button variant="ghost" onPress={onClose}>
          Close
        </Button>
      </ScrollView>
    </Modal>
  );
}
