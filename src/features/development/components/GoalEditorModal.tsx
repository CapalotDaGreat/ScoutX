import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { GOAL_CATEGORIES, GOAL_METRIC_KEYS, type DevelopmentGoalDraft } from '@/features/development/types';
import { validateGoalDraft } from '@/features/development/models/DevelopmentModels';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export type GoalEditorModalProps = {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: DevelopmentGoalDraft) => Promise<unknown>;
};

const emptyDraft = (): DevelopmentGoalDraft => ({
  title: '',
  category: 'technical',
  metricKey: 'none',
  targetValue: null,
  targetLabel: '',
  timeframeEnd: null,
});

type Translate = ReturnType<typeof useAppTranslation>['t'];

function categoryLabel(t: Translate, category: (typeof GOAL_CATEGORIES)[number]): string {
  switch (category) {
    case 'technical':
      return t('development:category.technical');
    case 'tactical':
      return t('development:category.tactical');
    case 'physical':
      return t('development:category.physical');
    case 'mental':
      return t('development:category.mental');
    case 'consistency':
      return t('development:category.consistency');
  }
}

function metricLabel(t: Translate, key: (typeof GOAL_METRIC_KEYS)[number]): string {
  switch (key) {
    case 'none':
      return t('development:metric.none');
    case 'goals':
      return t('development:metric.goals');
    case 'assists':
      return t('development:metric.assists');
    case 'shots':
      return t('development:metric.shots');
    case 'tackles':
      return t('development:metric.tackles');
    case 'passAccuracy':
      return t('development:metric.passAccuracy');
    case 'matchRating':
      return t('development:metric.matchRating');
    case 'minutes':
      return t('development:metric.minutes');
  }
}

function draftErrorLabel(t: Translate, code: ReturnType<typeof validateGoalDraft>): string {
  switch (code) {
    case 'title_required':
      return t('development:goal.errors.titleRequired');
    case 'target_required_for_metric':
      return t('development:goal.errors.targetRequired');
    case 'invalid_target':
      return t('development:goal.errors.invalidTarget');
    case 'invalid_date':
      return t('development:goal.errors.invalidDate');
    default:
      return '';
  }
}

export function GoalEditorModal({ visible, saving, onClose, onSave }: GoalEditorModalProps) {
  const { t } = useAppTranslation(['development', 'common', 'errors']);
  const [draft, setDraft] = useState<DevelopmentGoalDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [targetText, setTargetText] = useState('');

  const needsTarget = draft.metricKey !== 'none';

  const footer = useMemo(
    () => (
      <View className="flex-row flex-wrap gap-3">
        <Button variant="secondary" className="min-h-[44px] min-w-[120px] flex-1" onPress={onClose} disabled={saving}>
          {t('common:cancel')}
        </Button>
        <Button
          className="min-h-[44px] min-w-[120px] flex-1"
          loading={saving}
          onPress={() => {
            const next: DevelopmentGoalDraft = {
              ...draft,
              targetValue: needsTarget && targetText.trim() ? Number(targetText) : needsTarget ? null : null,
            };
            const problem = validateGoalDraft(next);
            if (problem) {
              setError(draftErrorLabel(t, problem));
              return;
            }
            setError(null);
            void onSave(next)
              .then(() => {
                setDraft(emptyDraft());
                setTargetText('');
                onClose();
              })
              .catch((caught: unknown) => setError(toUserMessage(caught, t('errors:generic'))));
          }}
        >
          {t('development:goal.save')}
        </Button>
      </View>
    ),
    [draft, needsTarget, onClose, onSave, saving, t, targetText],
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={t('development:goal.newTitle')}
      size="sheet"
      footer={footer}
    >
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="gap-5">
          <Input
            label={t('development:goal.titleLabel')}
            value={draft.title}
            onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
            placeholder={t('development:goal.titlePlaceholder')}
          />

          <View className="border-t border-border pt-4">
            <Text variant="label" className="mb-2">
              {t('development:goal.categoryLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {GOAL_CATEGORIES.map((category) => (
                <ChoiceChip
                  key={category}
                  label={categoryLabel(t, category)}
                  selected={draft.category === category}
                  onPress={() => setDraft((current) => ({ ...current, category }))}
                />
              ))}
            </View>
          </View>

          <View className="border-t border-border pt-4">
            <Text variant="label" className="mb-2">
              {t('development:goal.metricLabel')}
            </Text>
            <Text variant="caption" color="secondary" className="mb-2">
              {t('development:goal.metricHint')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {GOAL_METRIC_KEYS.map((key) => (
                <ChoiceChip
                  key={key}
                  label={metricLabel(t, key)}
                  selected={draft.metricKey === key}
                  onPress={() => setDraft((current) => ({ ...current, metricKey: key, targetValue: key === 'none' ? null : current.targetValue }))}
                />
              ))}
            </View>
          </View>

          {needsTarget ? (
            <Input
              label={t('development:goal.targetLabel')}
              value={targetText}
              onChangeText={setTargetText}
              keyboardType="decimal-pad"
              placeholder={t('development:goal.targetPlaceholder')}
              hint={t('development:goal.targetHint')}
            />
          ) : null}

          <View className="gap-4 border-t border-border pt-4">
          <Input
            label={t('development:goal.targetLabelFree')}
            value={draft.targetLabel}
            onChangeText={(targetLabel) => setDraft((current) => ({ ...current, targetLabel }))}
            placeholder={t('development:goal.targetLabelPlaceholder')}
          />

          <Input
            label={t('development:goal.timeframeLabel')}
            value={draft.timeframeEnd ?? ''}
            onChangeText={(timeframeEnd) =>
              setDraft((current) => ({ ...current, timeframeEnd: timeframeEnd.trim() || null }))
            }
            placeholder="YYYY-MM-DD"
            hint={t('development:goal.timeframeHint')}
            keyboardType="numbers-and-punctuation"
          />
          </View>

          {error ? (
            <Text color="error" variant="caption">
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}
