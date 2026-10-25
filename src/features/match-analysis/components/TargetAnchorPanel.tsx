import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ScanLine, Trash2 } from 'lucide-react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { TargetAnchorEditor } from './TargetAnchorEditor';
import { useTargetAnchors } from '../hooks/useTargetAnchors';
import type { MatchAnalysisJob } from '../types';

export function TargetAnchorPanel({ job, frameUrls }: { job: MatchAnalysisJob; frameUrls: Record<string, string> }) {
  const { t } = useAppTranslation('matchAnalysis');
  const { colors } = useTheme();
  const { busy, save, remove, coordinate } = useTargetAnchors(job);
  const frames = job.frames.filter((frame) => frame.source === 'server' && frameUrls[frame.id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState(false);
  const [coordination, setCoordination] = useState<'idle' | 'checked' | 'unavailable'>('idle');
  const frame = frames.find((item) => item.id === selected) ?? frames[0];
  const identity = job.experimentalTargetIdentity;
  const anchors = identity?.anchors ?? [];
  useEffect(() => { setCoordination('idle'); }, [job.pipelineGeneration, identity?.revision]);
  const atLimit = anchors.length >= 8 && !anchors.some((anchor) => anchor.frameId === frame?.id);
  return (
    <Card padding="lg" className="gap-3" testID="target-anchor-panel">
      <Heading level={3}>{t('targetAnchor.panelTitle')}</Heading>
      <Text variant="caption" color="secondary">{t('targetAnchor.scopeNote')}</Text>
      <Text variant="caption" color="secondary">{t('targetAnchor.limit')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {frames.map((item) => <ChoiceChip key={item.id} label={`${Math.round(item.timestampSec)}s`} selected={frame?.id === item.id}
          disabled={busy} onPress={() => { setSelected(item.id); setRemoveError(false); }} />)}
      </View>
      {frame ? <TargetAnchorEditor key={`${job.id}:${job.pipelineGeneration ?? 0}:${identity?.revision ?? 0}:${frame.id}`}
        imageUri={frameUrls[frame.id]} disabled={busy || atLimit}
        initialBox={anchors.find((anchor) => anchor.frameId === frame.id)?.box}
        onSave={(box) => save(frame.id, box)} /> : <Text variant="caption">{t('targetAnchor.noFrames')}</Text>}
      {anchors.map((anchor) => <View key={anchor.frameId} className="flex-row items-center justify-between gap-3">
        <Text variant="body-sm" className="flex-1">{t('targetAnchor.anchor', { seconds: Math.round(anchor.timestampSec) })}</Text>
        <Button variant="ghost" disabled={busy} className="h-12 w-12 px-0"
          accessibilityLabel={t('targetAnchor.remove', { seconds: Math.round(anchor.timestampSec) })}
          onPress={() => {
            setRemoveError(false);
            void remove(anchor.frameId).catch(() => setRemoveError(true));
          }}><Trash2 size={20} color={colors.textPrimary} /></Button>
      </View>)}
      {removeError ? <Text color="error" accessibilityRole="alert">{t('targetAnchor.saveError')}</Text> : null}
      <Button variant="secondary" disabled={busy || anchors.length === 0} testID="target-anchor-coordinate"
        leftIcon={<ScanLine size={18} color={colors.textPrimary} />}
        onPress={() => {
          setCoordination('idle');
          void coordinate().then(() => setCoordination('checked')).catch(() => setCoordination('unavailable'));
        }}>
        {t('targetAnchor.coordinate')}
      </Button>
      {coordination === 'checked' ? <Text variant="caption">{t('targetAnchor.coordinateChecked')}</Text> : null}
      {coordination === 'unavailable' ? <Text color="error" accessibilityRole="alert" testID="target-anchor-coordinate-error">
        {t('targetAnchor.coordinateUnavailable')}
      </Text> : null}
    </Card>
  );
}
