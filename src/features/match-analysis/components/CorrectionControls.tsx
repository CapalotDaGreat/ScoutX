import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { type AnalysisCorrectionsApi } from '@/features/match-analysis/hooks/useAnalysisCorrections';
import { correctionTargetKey, type CorrectionTargetKind } from '@/features/match-analysis/services/analysisCorrections';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Props = {
  api: AnalysisCorrectionsApi;
  kind: CorrectionTargetKind;
  targetId: string;
};

/**
 * "Looks right / Didn't happen / Not me" for one item. The original analysis stays unchanged;
 * the choice is stored as the player's feedback and shown next to the item.
 */
export function CorrectionControls({ api, kind, targetId }: Props) {
  const { t } = useAppTranslation('matchAnalysis');
  if (!api.enabled) return null;
  const current = api.current(kind, targetId);
  const busy = api.pendingKey === correctionTargetKey(kind, targetId);
  const isEvent = kind === 'event' || kind === 'possible_event';
  const isIdentity = kind === 'identity_frame';

  if (current) {
    return (
      <View className="flex-row flex-wrap items-center gap-2" testID={`correction-${kind}-${targetId}`}>
        <Text variant="caption" color="secondary">
          {t(`correction.state.${current.action}`)}
        </Text>
        <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'withdraw')}>
          {t('correction.undo')}
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2" testID={`correction-${kind}-${targetId}`}>
      {isIdentity ? (
        <>
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'is_me')}>
            {t('correction.isMe')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'not_me', 'not_me')}>
            {t('correction.notMe')}
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'confirm')}>
            {t('correction.confirm')}
          </Button>
          {isEvent ? (
            <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'dismiss_false_event', 'did_not_happen')}>
              {t('correction.didNotHappen')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'dispute', 'not_me')}>
            {t('correction.notMe')}
          </Button>
          {!isEvent ? (
            <Button size="sm" variant="ghost" disabled={busy} onPress={() => void api.submit(kind, targetId, 'dispute', 'other')}>
              {t('correction.wrong')}
            </Button>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Short explanation shown once per report section that offers feedback. */
export function CorrectionFootnote({ api }: { api: AnalysisCorrectionsApi }) {
  const { t } = useAppTranslation('matchAnalysis');
  if (!api.enabled) return null;
  return (
    <View className="gap-1">
      <Text variant="caption" color="tertiary">
        {t('correction.footnote')}
      </Text>
      {api.error ? (
        <Text variant="caption" color="error">
          {api.error}
        </Text>
      ) : null}
    </View>
  );
}
