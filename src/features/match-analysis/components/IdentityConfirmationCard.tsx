import { Image, Pressable, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type IdentityCandidate, type IdentityConfirmation } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type IdentityConfirmationCardProps = {
  candidates: IdentityCandidate[];
  confirmation?: IdentityConfirmation;
  selectedFrameIds: string[];
  onToggleFrame: (frameId: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  frameUrls?: Record<string, string>;
  busy?: boolean;
};

export function IdentityConfirmationCard({
  candidates,
  confirmation,
  selectedFrameIds,
  onToggleFrame,
  onConfirm,
  onReject,
  frameUrls,
  busy,
}: IdentityConfirmationCardProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const state = confirmation?.state ?? 'pending';

  return (
    <Card padding="lg" className="gap-3">
      <Heading level={3}>{t('identity.title')}</Heading>
      <Text variant="body-sm" color="secondary">
        {state === 'confirmed'
          ? t('identity.confirmed')
          : state === 'rejected'
            ? t('identity.rejected')
            : t('identity.hint')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {candidates.map((candidate) => {
          const selected = selectedFrameIds.includes(candidate.frameId);
          const uri = frameUrls?.[candidate.frameId];
          return (
            <Pressable
              key={candidate.frameId}
              onPress={() => onToggleFrame(candidate.frameId)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`min-h-11 min-w-[30%] flex-1 overflow-hidden rounded-lg border ${selected ? 'border-accent' : 'border-border'}`}
            >
              {uri ? (
                <Image source={{ uri }} style={{ width: '100%', height: 72 }} />
              ) : (
                <View className="h-[72px] items-center justify-center bg-background-secondary">
                  <Text variant="caption">{Math.round(candidate.timestampSec)}s</Text>
                </View>
              )}
              <Text variant="caption" className="px-2 py-1">
                {Math.round(candidate.timestampSec)}s
              </Text>
            </Pressable>
          );
        })}
      </View>
      {state !== 'confirmed' ? (
        <View className="flex-row gap-2">
          <Button variant="accent" loading={busy} onPress={onConfirm} className="flex-1">
            {t('identity.confirm')}
          </Button>
          <Button variant="secondary" onPress={onReject} className="flex-1">
            {t('identity.reject')}
          </Button>
        </View>
      ) : null}
    </Card>
  );
}
